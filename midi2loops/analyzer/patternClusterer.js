export function analyzeTrack(track, trackIndex, bars, quantizeSteps) {
  const isDrum = track.channel === 9 || track.instrument.percussion;

  const barSlices = bars.map(bar => {
    const barNotes = track.notes.filter(n => n.ticks >= bar.startTick && n.ticks < bar.endTick);
    if (barNotes.length === 0) {
      return { barIndex: bar.barIndex, notes: Array.of(), tokenSet: new Set(), hash: 'EMPTY', density: 0 };
    }

    const stepSize = bar.ticksPerBar / quantizeSteps;
    const tokens = barNotes.map(note => {
      const step = Math.round((note.ticks - bar.startTick) / stepSize) % quantizeSteps;
      if (isDrum) return `${step}:${note.midi}`;
      const normPitch = (note.midi + bar.rootToCOffset + 120) % 12;
      return `${step}:${normPitch}`;
    });

    const uniqueSorted = [...new Set(tokens)].sort();

    return {
      barIndex: bar.barIndex,
      notes: barNotes,
      tokenSet: new Set(uniqueSorted),
      hash: uniqueSorted.join('|'),
      density: barNotes.length
    };
  });

  return {
    trackIndex,
    trackName: track.name || (isDrum ? 'Drums' : `Track ${trackIndex + 1}`),
    channel: track.channel,
    bank: isDrum ? 128 : 0,
    program: track.instrument.number,
    isDrum,
    role: inferTrackRole(track, isDrum),
    barSlices
  };
}

/**
 * Computes Jaccard similarity (0.0 to 1.0) between two multi-bar token sets.
 */
function computeWindowSimilarity(winA, winB) {
  let intersection = 0;
  let union = 0;

  for (let b = 0; b < winA.length; b++) {
    const setA = winA.at(b).tokenSet;
    const setB = winB.at(b).tokenSet;
    for (const tok of setA) {
      if (setB.has(tok)) intersection++;
    }
    union += (setA.size + setB.size - intersection);
  }

  return union === 0 ? 1 : (intersection / union);
}

export function clusterWindows(trackData, bars, windowLength, minOccurrences, minNotesPerBar, similarityThreshold = 0.80) {
  const slices = trackData.barSlices;
  const candidateWindows = Array.of();

  // For 4-bar and 8-bar phrases, step by 2 bars (half-phrase grid) to prefer musical phrase boundaries
  const stepStride = windowLength >= 4 ? 2 : 1;

  for (let i = 0; i <= slices.length - windowLength; i += stepStride) {
    const win = slices.slice(i, i + windowLength);
    if (win.some(s => s.hash === 'EMPTY')) continue;

    const totalNotes = win.reduce((sum, s) => sum + s.density, 0);
    const effectiveMin = trackData.role === 'bass' ? Math.max(2, minNotesPerBar - 1) : minNotesPerBar;
    if ((totalNotes / windowLength) < effectiveMin) continue;

    candidateWindows.push({
      startBar: i,
      win,
      exactHash: win.map(s => s.hash).join('||')
    });
  }

  const clusters = Array.of();

  for (const item of candidateWindows) {
    let matchedCluster = null;

    if (windowLength <= 2) {
      // 1-bar and 2-bar loops: require exact hash match
      matchedCluster = clusters.find(c => c.representative.exactHash === item.exactHash);
    } else {
      // 4-bar and 8-bar phrases: allow fuzzy match (e.g. >= 80% token overlap)
      matchedCluster = clusters.find(c =>
        computeWindowSimilarity(c.representative.win, item.win) >= similarityThreshold
      );
    }

    if (matchedCluster) {
      matchedCluster.startBars.push(item.startBar);
    } else {
      clusters.push({
        representative: item,
        startBars: Array.of(item.startBar)
      });
    }
  }

  const results = Array.of();

  for (const cluster of clusters) {
    const nonOverlapping = Array.of();
    let lastEnd = -1;
    for (const start of cluster.startBars) {
      if (start >= lastEnd) {
        nonOverlapping.push(start);
        lastEnd = start + windowLength;
      }
    }

    if (nonOverlapping.length < minOccurrences) continue;

    // Pick the cleanest middle/second occurrence when available (often cleaner than intro bar 0)
    const sampleStart = nonOverlapping.length > 1 ? nonOverlapping.at(1) : nonOverlapping.at(0);
    const winBars = bars.slice(sampleStart, sampleStart + windowLength);
    const detectedChords = winBars.map(b => b.detectedChord || 'N/C');

    results.push({
      id: `t${trackData.trackIndex}_b${sampleStart}_len${windowLength}`,
      trackIndex: trackData.trackIndex,
      trackName: trackData.trackName,
      channel: trackData.channel,
      bank: trackData.bank,
      program: trackData.program,
      role: trackData.role,
      isDrum: trackData.isDrum,
      startBar: sampleStart,
      lengthBars: windowLength,
      occurrences: nonOverlapping.length,
      allStartBars: nonOverlapping,
      detectedChords,
      isSingleChord: new Set(detectedChords).size === 1,
      barTransposeOffsets: winBars.map(b => b.rootToCOffset),
      targetKetronSlot: null
    });
  }

  return results;
}

export function pruneSubLoops(candidates) {
  // Sort longest phrases first (8-bar -> 4-bar -> 2-bar -> 1-bar) so longer grooves win
  const sorted = [...candidates].sort((a, b) => b.lengthBars - a.lengthBars);
  const kept = Array.of();

  const getCoveredSet = (cand) => {
    const set = new Set();
    for (const start of cand.allStartBars) {
      for (let off = 0; off < cand.lengthBars; off++) set.add(start + off);
    }
    return set;
  };

  for (const cand of sorted) {
    const candBars = getCoveredSet(cand);
    const isRedundant = kept.some(longer => {
      if (longer.trackIndex !== cand.trackIndex || longer.lengthBars <= cand.lengthBars) return false;
      const longerBars = getCoveredSet(longer);
      let overlap = 0;
      for (const b of candBars) if (longerBars.has(b)) overlap++;
      // Lowered threshold to 0.70 so a 4-bar or 8-bar loop suppresses repetitive 1-bar/2-bar fragments inside it
      return (overlap / candBars.size) >= 0.70;
    });

    if (!isRedundant) kept.push(cand);
  }

  return kept;
}

function inferTrackRole(track, isDrum) {
  if (isDrum) return 'drum';
  const prog = track.instrument.number;
  if (prog >= 32 && prog <= 39) return 'bass';
  if (prog >= 24 && prog <= 31) return 'guitar';
  return 'chord';
}
