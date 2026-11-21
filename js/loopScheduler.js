import { mapNoteToKetronChord } from './ketronChordTransposer.js';

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
    drumNoteFilter = null,
    chordType = null,        // 'Maj' | 'Min' | 'Sus4' | '7th' (when rendering Ketron matrix)
    targetRootOffset = 0     // 0..11 semitones from C
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

        let finalMidi = note.midi;
        if (!candidate.isDrum) {
          if (chordType) {
            // Ketron chromatic chord matrix mode
            finalMidi = mapNoteToKetronChord(
              note.midi,
              transpose,
              chordType,
              targetRootOffset,
              candidate.role === 'bass'
            );
          } else {
            // Standard preview mode
            finalMidi = note.midi + transpose;
            while (finalMidi < 36) finalMidi += 12;
            while (finalMidi > 96) finalMidi -= 12;
          }
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

/**
 * Merges multiple candidates (e.g. Drum + Bass + Chord assigned to MAIN_A)
 * into a single synchronized multi-channel sample schedule.
 */
export function buildMultiTrackSchedule(analysis, candidates, options = {}) {
  const {
    sampleRate = 44100,
    normalizeToC = true,
    overrideBpm = null,
    chordType = null,
    targetRootOffset = 0
  } = options;

  if (!candidates || candidates.length === 0) return null;

  // Determine the master loop length in samples (longest track in the group)
  const individualSchedules = candidates.map((cand, idx) => {
    // Assign isolated MIDI channels: Ch 9 (10) for drums, Ch 1 for bass, Ch 0/2/3... for chords
    const assignedChannel = cand.isDrum ? 9 : (cand.role === 'bass' ? 1 : (idx === 0 ? 0 : idx + 1));

    const sched = buildSampleSchedule(analysis, cand, {
      sampleRate,
      normalizeToC,
      passes: 1,
      overrideBpm,
      chordType,
      targetRootOffset
    });

    // Remap events to the isolated channel
    const channelEvents = sched.events.map(ev => ({ ...ev, channel: assignedChannel }));
    return { singlePassSamples: sched.singlePassSamples, events: channelEvents };
  });

  const masterTotalSamples = Math.max(...individualSchedules.map(s => s.singlePassSamples));
  const mergedEvents = Array.of();

  // Tile shorter loops (e.g. 1-bar drum loop) across the full master loop (e.g. 4-bar chord loop)
  for (const sched of individualSchedules) {
    const repeats = Math.max(1, Math.round(masterTotalSamples / sched.singlePassSamples));
    for (let r = 0; r < repeats; r++) {
      const offset = r * sched.singlePassSamples;
      for (const ev of sched.events) {
        const shiftedSample = ev.sample + offset;
        if (shiftedSample < masterTotalSamples) {
          // Only send bank/program CC on the first repeat (r === 0)
          if (r > 0 && (ev.type === 'cc' || ev.type === 'program')) continue;
          mergedEvents.push({ ...ev, sample: shiftedSample });
        }
      }
    }
  }

  mergedEvents.sort((a, b) => (a.sample - b.sample) || (a.type === 'noteOff' ? -1 : 1));

  return {
    events: mergedEvents,
    singlePassSamples: masterTotalSamples,
    totalSamples: masterTotalSamples
  };
}

