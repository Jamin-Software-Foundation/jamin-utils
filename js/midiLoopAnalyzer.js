const { Midi } = window;
const { Chord, Note } = window.Tonal;

/**
 * Analyses a MIDI ArrayBuffer and extracts clustered loop candidates
 * ready for Ketron Event audio style preview and rendering.
 *
 * @param {ArrayBuffer} arrayBuffer - Raw .mid file data
 * @param {Object} options - Optional configuration
 * @returns {Object} Parsed metadata, bar-by-bar map, and ranked loop candidates
 */
export function analyzeMidiForLoops(arrayBuffer, options = {}) {
  const {
    loopLengths = Array.of(1, 2, 4), // Bar window sizes to evaluate
    minOccurrences = 2,              // Minimum repeats to qualify as a loop groove
    quantizeSteps = 16               // 16th-note grid per 4/4 bar
  } = options;

  const midi = new Midi(arrayBuffer);
  const ppq = midi.header.ppq;

  // 1. Build a bar-by-bar timeline accounting for time signature changes
  const bars = buildBarTimeline(midi, ppq);

  // 2. Detect the underlying chord and root-to-C offset for each bar
  detectChordsPerBar(midi, bars);

  // 3. Slice tracks into bars and generate root-normalized pattern fingerprints
  const trackAnalyses = midi.tracks
    .filter(track => track.notes.length > 0)
    .map((track, trackIndex) => analyzeTrack(track, trackIndex, bars, quantizeSteps));

  // 4. Cluster recurring 1, 2, and 4-bar windows across each track
  const candidates = Array.of();
  for (const trackData of trackAnalyses) {
    for (const length of loopLengths) {
      const clusters = clusterWindows(trackData, bars, length, minOccurrences);
      candidates.push(...clusters);
    }
  }

  // Sort candidates by occurrence count (most frequent grooves first)
  candidates.sort((a, b) => b.occurrences - a.occurrences);

  const initialBpm = midi.header.tempos.length > 0 ? midi.header.tempos.at(0).bpm : 120;

  return {
    name: midi.name || 'Untitled Song',
    bpm: Math.round(initialBpm),
    ppq,
    totalBars: bars.length,
    bars,
    candidates,
    midi
  };
}

/**
 * 1. Builds exact tick boundaries for every bar in the song.
 */
function buildBarTimeline(midi, ppq) {
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

/**
 * 2. Estimates the chord for every bar using weighted note durations across pitched tracks.
 */
function detectChordsPerBar(midi, bars) {
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
    const chordInfo = Chord.get(primaryChord);
    const root = chordInfo.tonic || sortedPitches.at(0);

    bar.detectedChord = primaryChord;
    bar.rootPitchClass = root;
    bar.rootToCOffset = calculateRootToCOffset(root);
  }
}

/**
 * Calculates shortest semitone transposition from a detected root to C.
 */
function calculateRootToCOffset(rootPitchClass) {
  const chroma = Note.chroma(rootPitchClass);
  if (chroma === undefined || chroma === null) return 0;
  return chroma <= 6 ? -chroma : 12 - chroma;
}

/**
 * 3. Slices a single track into bar objects and computes normalized pattern hashes.
 */
function analyzeTrack(track, trackIndex, bars, quantizeSteps) {
  const isDrum = track.channel === 9 || track.instrument.percussion;

  const barSlices = bars.map(bar => {
    const barNotes = track.notes.filter(
      n => n.ticks >= bar.startTick && n.ticks < bar.endTick
    );

    if (barNotes.length === 0) {
      return { barIndex: bar.barIndex, notes: Array.of(), hash: 'EMPTY', density: 0 };
    }

    const stepSize = bar.ticksPerBar / quantizeSteps;
    const tokens = Array.of();

    for (const note of barNotes) {
      const step = Math.round((note.ticks - bar.startTick) / stepSize) % quantizeSteps;

      if (isDrum) {
        tokens.push(`${step}:${note.midi}`);
      } else {
        const normalizedPitchClass = (note.midi + bar.rootToCOffset + 120) % 12;
        tokens.push(`${step}:${normalizedPitchClass}`);
      }
    }

    const uniqueTokens = [...new Set(tokens)].sort();

    return {
      barIndex: bar.barIndex,
      notes: barNotes,
      hash: uniqueTokens.join('|'),
      density: barNotes.length
    };
  });

  return {
    trackIndex,
    trackName: track.name || (isDrum ? 'Drums' : `Track ${trackIndex + 1}`),
    channel: track.channel,
    program: track.instrument.number,
    isDrum,
    role: inferTrackRole(track, isDrum),
    barSlices
  };
}

/**
 * 4. Slides a multi-bar window across the track to group repeating grooves.
 */
function clusterWindows(trackData, bars, windowLength, minOccurrences) {
  const groups = new Map();
  const slices = trackData.barSlices;

  for (let i = 0; i <= slices.length - windowLength; i++) {
    const windowSlices = slices.slice(i, i + windowLength);

    if (windowSlices.some(s => s.hash === 'EMPTY')) continue;

    const windowHash = windowSlices.map(s => s.hash).join('||');

    if (!groups.has(windowHash)) {
      groups.set(windowHash, Array.of());
    }
    groups.get(windowHash).push(i);
  }

  const results = Array.of();

  for (const [hash, startBars] of groups.entries()) {
    const nonOverlappingStarts = Array.of();
    let lastEnd = -1;
    for (const start of startBars) {
      if (start >= lastEnd) {
        nonOverlappingStarts.push(start);
        lastEnd = start + windowLength;
      }
    }

    if (nonOverlappingStarts.length < minOccurrences) continue;

    const sampleStart = nonOverlappingStarts.at(0);
    const windowBars = bars.slice(sampleStart, sampleStart + windowLength);
    const detectedChords = windowBars.map(b => b.detectedChord || 'N/C');
    const uniqueChords = [...new Set(detectedChords)];

    results.push({
      id: `t${trackData.trackIndex}_b${sampleStart}_len${windowLength}`,
      trackIndex: trackData.trackIndex,
      trackName: trackData.trackName,
      channel: trackData.channel,
      program: trackData.program,
      role: trackData.role,
      isDrum: trackData.isDrum,
      startBar: sampleStart,
      lengthBars: windowLength,
      occurrences: nonOverlappingStarts.length,
      allStartBars: nonOverlappingStarts,
      detectedChords,
      isSingleChord: uniqueChords.length === 1,
      barTransposeOffsets: windowBars.map(b => b.rootToCOffset),
      targetKetronSlot: null
    });
  }

  return results;
}

/**
 * Infers a default Ketron Event style role from GM program number and pitch register.
 */
function inferTrackRole(track, isDrum) {
  if (isDrum) return 'drum';
  const prog = track.instrument.number;
  if (prog >= 32 && prog <= 39) return 'bass';
  if (prog >= 24 && prog <= 31) return 'guitar';
  return 'chord';
}
