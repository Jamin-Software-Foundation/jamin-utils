const { Midi } = window;

/**
 * Builds an isolated, C-normalized MIDI Uint8Array for a selected loop candidate.
 *
 * @param {Object} analysis - The full object returned by analyzeMidiForLoops()
 * @param {Object} candidate - One candidate object from analysis.candidates
 * @param {Object} options - Slicing and normalization options
 * @returns {Uint8Array} Raw MIDI bytes ready for spessasynth_core
 */
export function buildLoopMidiBuffer(analysis, candidate, options = {}) {
  const {
    normalizeToC = true,   // Transpose pitched riffs so root is C
    passes = 1,            // Use 1 for live preview, 2 for WAV tail rendering
    overrideBpm = null,    // Optional target BPM (defaults to song BPM)
    drumNoteFilter = null  // Optional Set of MIDI drum notes to keep
  } = options;

  const sourceMidi = analysis.midi;
  const sourceTrack = sourceMidi.tracks.at(candidate.trackIndex);
  const loopBars = analysis.bars.slice(candidate.startBar, candidate.startBar + candidate.lengthBars);

  const outMidi = new Midi();
  const sourcePpq = sourceMidi.header.ppq || 480;
  const targetPpq = outMidi.header.ppq; // Read-only (480)
  const tickScale = targetPpq / sourcePpq;

  const loopStartTick = loopBars.at(0).startTick;
  const loopEndTick = loopBars.at(loopBars.length - 1).endTick;
  const singlePassTicks = Math.round((loopEndTick - loopStartTick) * tickScale);
  const totalTicks = singlePassTicks * passes;

  outMidi.header.tempos.push({
    ticks: 0,
    bpm: overrideBpm || analysis.bpm || 120
  });
  outMidi.header.update();

  const outTrack = outMidi.addTrack();
  outTrack.channel = candidate.isDrum ? 9 : 0;
  outTrack.instrument.number = candidate.program;

  // Repeat for the requested number of passes (1 for preview, 2 for tail-wrapped WAV)
  for (let pass = 0; pass < passes; pass++) {
    const passTickOffset = pass * singlePassTicks;

    loopBars.forEach((bar, barIdx) => {
      const transpose = (!candidate.isDrum && normalizeToC)
        ? candidate.barTransposeOffsets.at(barIdx)
        : 0;

      const barNotes = sourceTrack.notes.filter(
        n => n.ticks >= bar.startTick && n.ticks < bar.endTick
      );

      for (const note of barNotes) {
        if (candidate.isDrum && drumNoteFilter && !drumNoteFilter.has(note.midi)) {
          continue;
        }

        const scaledStart = Math.round((note.ticks - loopStartTick) * tickScale);
        const relativeStart = Math.max(0, scaledStart + passTickOffset);

        const maxSourceDur = Math.max(1, bar.endTick - note.ticks);
        const clampedSourceDur = Math.min(note.durationTicks, maxSourceDur);
        const scaledDuration = Math.max(1, Math.round(clampedSourceDur * tickScale));

        let finalMidi = note.midi + transpose;
        if (!candidate.isDrum) {
          while (finalMidi < 36) finalMidi += 12;
          while (finalMidi > 96) finalMidi -= 12;
        }

        outTrack.addNote({
          midi: finalMidi,
          ticks: relativeStart,
          durationTicks: scaledDuration,
          velocity: note.velocity || 0.8
        });
      }
    });
  }

  // Anchor the exact loop end tick with a silent CC event so looping never cuts short on rests
  outTrack.addCC({
    number: 123,
    value: 0,
    ticks: totalTicks
  });

  return outMidi.toArray();
}
