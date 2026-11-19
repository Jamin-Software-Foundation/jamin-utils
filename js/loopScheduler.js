/**
 * Builds a sample-indexed event schedule for a loop candidate at a given sampleRate.
 * Works identically for live preview and offline WAV rendering with SpessaSynthProcessor.
 */
export function buildSampleSchedule(analysis, candidate, options = {}) {
  const {
    sampleRate = 44100,
    normalizeToC = true,
    passes = 1,
    overrideBpm = null,
    drumNoteFilter = null
  } = options;

  const bpm = overrideBpm || analysis.bpm || 120;
  const secondsPerBeat = 60 / bpm;
  const sourceTrack = analysis.midi.tracks.at(candidate.trackIndex);
  const loopBars = analysis.bars.slice(candidate.startBar, candidate.startBar + candidate.lengthBars);

  const numerator = loopBars.at(0).timeSignature.at(0);
  const denominator = loopBars.at(0).timeSignature.at(1);
  const beatsPerBar = numerator * (4 / denominator);
  const singlePassSeconds = candidate.lengthBars * beatsPerBar * secondsPerBeat;
  const singlePassSamples = Math.round(singlePassSeconds * sampleRate);
  const totalSamples = singlePassSamples * passes;

  const loopStartTick = loopBars.at(0).startTick;
  const loopEndTick = loopBars.at(loopBars.length - 1).endTick;
  const singlePassTicks = loopEndTick - loopStartTick;
  const samplesPerTick = singlePassSamples / singlePassTicks;

  const channel = candidate.isDrum ? 9 : 0;
  const bank = Number.isInteger(candidate.bank) ? candidate.bank : (candidate.isDrum ? 128 : 0);
  const program = Number.isInteger(candidate.program) ? candidate.program : 0;

  const events = Array.of(
    { sample: 0, type: 'cc', channel, controller: 0, value: bank },
    { sample: 0, type: 'cc', channel, controller: 32, value: 0 },
    { sample: 0, type: 'program', channel, program }
  );

  for (let pass = 0; pass < passes; pass++) {
    const passSampleOffset = pass * singlePassSamples;

    loopBars.forEach((bar, barIdx) => {
      const transpose = (!candidate.isDrum && normalizeToC)
        ? candidate.barTransposeOffsets.at(barIdx)
        : 0;

      const barNotes = sourceTrack.notes.filter(
        n => n.ticks >= bar.startTick && n.ticks < bar.endTick
      );

      for (const note of barNotes) {
        if (candidate.isDrum && drumNoteFilter && !drumNoteFilter.has(note.midi)) continue;

        const startSample = Math.round((note.ticks - loopStartTick) * samplesPerTick) + passSampleOffset;
        const maxDurTicks = Math.max(1, bar.endTick - note.ticks);
        const durTicks = Math.min(note.durationTicks, maxDurTicks);
        const endSample = Math.min(
          passSampleOffset + singlePassSamples - 1,
          startSample + Math.max(1, Math.round(durTicks * samplesPerTick))
        );

        let finalMidi = note.midi + transpose;
        if (!candidate.isDrum) {
          while (finalMidi < 36) finalMidi += 12;
          while (finalMidi > 96) finalMidi -= 12;
        }

        const vel = Math.max(1, Math.min(127, Math.round((note.velocity || 0.8) * 127)));
        events.push({ sample: startSample, type: 'noteOn', channel, midi: finalMidi, velocity: vel });
        events.push({ sample: endSample, type: 'noteOff', channel, midi: finalMidi });
      }
    });
  }

  // Sort by sample timestamp (noteOff before noteOn on the exact same sample)
  events.sort((a, b) => (a.sample - b.sample) || (a.type === 'noteOff' ? -1 : 1));

  return { events, singlePassSamples, totalSamples };
}

/**
 * Dispatches all scheduled events falling within [startSample, endSample) to processor.
 */
export function dispatchEventsInRange(processor, events, startSample, endSample) {
  for (const ev of events) {
    if (ev.sample >= startSample && ev.sample < endSample) {
      if (ev.type === 'cc') processor.controllerChange(ev.channel, ev.controller, ev.value);
      else if (ev.type === 'program') processor.programChange(ev.channel, ev.program);
      else if (ev.type === 'noteOn') processor.noteOn(ev.channel, ev.midi, ev.velocity);
      else if (ev.type === 'noteOff') processor.noteOff(ev.channel, ev.midi);
    }
  }

}
