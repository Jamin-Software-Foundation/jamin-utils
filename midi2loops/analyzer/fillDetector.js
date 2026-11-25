export function detectDrumFills(trackAnalyses, keptGrooves, bars) {
  const fills = Array.of();
  const drumTracks = trackAnalyses.filter(t => t.isDrum);

  for (const drumTrack of drumTracks) {
    const mainDrumBars = new Set();
    const drumGrooves = keptGrooves.filter(g => g.trackIndex === drumTrack.trackIndex);

    let totalMainDensity = 0;
    for (const groove of drumGrooves) {
      for (const start of groove.allStartBars) {
        for (let off = 0; off < groove.lengthBars; off++) {
          const bIdx = start + off;
          mainDrumBars.add(bIdx);
          totalMainDensity += drumTrack.barSlices.at(bIdx).density;
        }
      }
    }

    const avgDensity = mainDrumBars.size > 0 ? (totalMainDensity / mainDrumBars.size) : 8;
    const seenHashes = new Set();

    for (let i = 0; i < drumTrack.barSlices.length; i++) {
      const slice = drumTrack.barSlices.at(i);
      if (slice.hash === 'EMPTY' || mainDrumBars.has(i) || seenHashes.has(slice.hash)) continue;

      const precedesGroove = drumGrooves.some(g => g.allStartBars.includes(i + 1));
      const isPhraseEnd = ((i + 1) % 4 === 0) && (slice.density >= avgDensity * 1.15);

      if (precedesGroove || isPhraseEnd) {
        seenHashes.add(slice.hash);
        const barObj = bars.at(i);

        fills.push({
          id: `t${drumTrack.trackIndex}_fill_b${i}`,
          trackIndex: drumTrack.trackIndex,
          trackName: `${drumTrack.trackName} (Fill)`,
          channel: drumTrack.channel,
          bank: 128,
          program: drumTrack.program,
          role: 'fill',
          isDrum: true,
          startBar: i,
          lengthBars: 1,
          occurrences: 1,
          allStartBars: Array.of(i),
          detectedChords: Array.of(barObj.detectedChord || 'N/C'),
          isSingleChord: true,
          barTransposeOffsets: Array.of(0),
          targetKetronSlot: null
        });
      }
    }
  }

  return fills;
}
