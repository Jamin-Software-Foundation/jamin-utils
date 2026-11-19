const { Chord, Note } = window.Tonal;

export function buildBarTimeline(midi, ppq) {
  const endTick = Math.max(...midi.tracks.map(t => t.endOfTrackTicks || 0), ppq * 4);
  const timeSigs = [...midi.header.timeSignatures].sort((a, b) => a.ticks - b.ticks);

  if (timeSigs.length === 0 || timeSigs.at(0).ticks > 0) {
    timeSigs.unshift({ ticks: 0, timeSignature: Array.of(4, 4) });
  }

  const bars = Array.of();
  let currentTick = 0;
  let barIndex = 0;
  let tsIdx = 0;

  while (currentTick < endTick) {
    while (tsIdx + 1 < timeSigs.length && timeSigs.at(tsIdx + 1).ticks <= currentTick) {
      tsIdx++;
    }

    const numerator = timeSigs.at(tsIdx).timeSignature.at(0);
    const denominator = timeSigs.at(tsIdx).timeSignature.at(1);
    const ticksPerBar = Math.round(ppq * numerator * (4 / denominator));

    bars.push({
      barIndex,
      startTick: currentTick,
      endTick: currentTick + ticksPerBar,
      ticksPerBar,
      timeSignature: Array.of(numerator, denominator),
      detectedChord: null,
      rootPitchClass: null,
      rootToCOffset: 0
    });

    currentTick += ticksPerBar;
    barIndex++;
  }

  return bars;
}

export function detectChordsPerBar(midi, bars) {
  const pitchedTracks = midi.tracks.filter(t => t.channel !== 9 && !t.instrument.percussion);

  for (const bar of bars) {
    const pitchWeights = new Map();

    for (const track of pitchedTracks) {
      for (const note of track.notes) {
        const noteEnd = note.ticks + note.durationTicks;
        if (note.ticks < bar.endTick && noteEnd > bar.startTick) {
          const overlap = Math.min(noteEnd, bar.endTick) - Math.max(note.ticks, bar.startTick);
          const pitchClass = Note.pitchClass(Note.fromMidi(note.midi));
          const bassBoost = note.midi < 55 ? 1.5 : 1.0;
          pitchWeights.set(pitchClass, (pitchWeights.get(pitchClass) || 0) + overlap * bassBoost);
        }
      }
    }

    if (pitchWeights.size === 0) continue;

    const sortedPitches = [...pitchWeights.entries()]
      .sort((a, b) => b.at(1) - a.at(1))
      .map(entry => entry.at(0));

    const detected = Chord.detect(sortedPitches.slice(0, 4));
    const primaryChord = detected.length > 0 ? detected.at(0) : sortedPitches.at(0);
    const root = Chord.get(primaryChord).tonic || sortedPitches.at(0);
    const chroma = Note.chroma(root);

    bar.detectedChord = primaryChord;
    bar.rootPitchClass = root;
    bar.rootToCOffset = (chroma === undefined || chroma === null)
      ? 0
      : (chroma <= 6 ? -chroma : 12 - chroma);
  }
}
