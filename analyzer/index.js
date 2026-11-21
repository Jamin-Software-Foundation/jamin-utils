import { buildBarTimeline, detectChordsPerBar } from './barChordAnalyzer.js';
import { analyzeTrack, clusterWindows, pruneSubLoops } from './patternClusterer.js';
import { detectDrumFills } from './fillDetector.js';

const { Midi } = window;

export function analyzeMidiForLoops(arrayBuffer, options = {}) {
  const {
    loopLengths = Array.of(1, 2, 4, 8, 16),
    minOccurrences = 2,
    minNotesPerBar = 3,
    quantizeSteps = 16,
    similarityThreshold = 0.80
  } = options;

  const midi = new Midi(arrayBuffer);
  const ppq = midi.header.ppq;

  const bars = buildBarTimeline(midi, ppq);
  detectChordsPerBar(midi, bars);

  const trackAnalyses = midi.tracks
    .map((track, originalTrackIndex) => ({ track, originalTrackIndex }))
    .filter(item => item.track.notes.length > 0)
    .map(item => analyzeTrack(item.track, item.originalTrackIndex, bars, quantizeSteps));


  let rawCandidates = Array.of();
  for (const trackData of trackAnalyses) {
    for (const length of loopLengths) {
      rawCandidates.push(
        ...clusterWindows(trackData, bars, length, minOccurrences, minNotesPerBar, similarityThreshold)
      );
    }
  }


  const prunedGrooves = pruneSubLoops(rawCandidates);
  const drumFills = detectDrumFills(trackAnalyses, prunedGrooves, bars);

  prunedGrooves.sort((a, b) => b.occurrences - a.occurrences);
  const initialBpm = midi.header.tempos.length > 0 ? midi.header.tempos.at(0).bpm : 120;

  return {
    name: midi.name || 'Untitled Song',
    bpm: Math.round(initialBpm),
    ppq,
    totalBars: bars.length,
    bars,
    candidates: prunedGrooves.concat(drumFills),
    midi
  };
}
