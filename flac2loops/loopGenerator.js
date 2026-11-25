const TYPE_MAP = { maj: 'MAJ', min: 'MIN', sus4: 'SUS4', '7': '7TH' };

export function extractLoops(analysis, trimMs = 0) {
  const { channels, sampleRate, bars, barSamples, detectedKey } = analysis;
  const numChannels = channels.length;
  const targetLengths = new Array(2, 4, 8);
  const seenSignatures = new Set();
  const loops = [];

  const trimSamples = Math.round((trimMs / 1000) * sampleRate);
  const extraHeadroom = Math.floor(sampleRate * 0.25);
  const tonicRoot = detectedKey.split(' ').at(0);

  for (const barCount of targetLengths) {
    for (let i = 0; i <= bars.length - barCount; i++) {
      const sliceBars = bars.slice(i, i + barCount);

      let isConsecutive = true;
      for (let b = 1; b < sliceBars.length; b++) {
        if (sliceBars.at(b).barNum !== sliceBars.at(b - 1).barNum + 1) {
          isConsecutive = false;
          break;
        }
      }
      if (!isConsecutive) continue;

      const firstChord = sliceBars.at(0).chord;
      const lastChord = sliceBars.at(-1).chord;
      if (firstChord.label !== lastChord.label) continue;

      const chordSeq = sliceBars.map(b => b.chord.label);
      const signature = `${barCount}bar_${chordSeq.join('-')}`;
      if (seenSignatures.has(signature)) continue;
      seenSignatures.add(signature);

      const startSample = sliceBars.at(0).start;
      const exactLen = Math.max(1, barCount * barSamples + trimSamples);
      const bufLen = exactLen + extraHeadroom;
      if (startSample + bufLen > channels.at(0).length) continue;

      const audioBuffer = new AudioBuffer({ length: bufLen, numberOfChannels: numChannels, sampleRate });
      const fade = Math.floor(sampleRate * 0.005);
      const trimmedChannels = [];

      for (let c = 0; c < numChannels; c++) {
        const src = channels.at(c);
        const dst = audioBuffer.getChannelData(c);
        for (let s = 0; s < bufLen; s++) {
          const fadeIn = Math.min(1, s / fade);
          const fadeOut = s < exactLen ? Math.min(1, (exactLen - s) / fade) : 1;
          dst[s] = src[startSample + s] * fadeIn * fadeOut;
        }
        trimmedChannels.push(dst.subarray(0, exactLen));
      }

      const typeCode = TYPE_MAP[firstChord.type] || 'MAJ';
      const baseFilename = `${typeCode}_${firstChord.root}`;
      const wavBytes = encodeWavBytes(trimmedChannels, sampleRate);

      loops.push({
        id: `${barCount}bar_${i}`,
        displayTitle: `${barCount}Bar · ${baseFilename}.wav`,
        baseFilename,
        progression: chordSeq.join(' → '),
        isTonicAnchor: firstChord.root === tonicRoot,
        barCount,
        baseDuration: (barCount * barSamples) / sampleRate,
        audioBuffer,
        wavBytes,
        url: URL.createObjectURL(new Blob([wavBytes], { type: 'audio/wav' }))
      });
    }
  }

  return loops.sort((a, b) => Number(b.isTonicAnchor) - Number(a.isTonicAnchor) || a.barCount - b.barCount);
}

function encodeWavBytes(channelArrays, sampleRate) {
  const numChannels = channelArrays.length;
  const numSamples = channelArrays.at(0).length;
  const blockAlign = numChannels * 2;
  const dataBytes = numSamples * blockAlign;
  const wavBuffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(wavBuffer);

  const writeStr = (off, str) => [...str].forEach((c, i) => view.setUint8(off + i, c.charCodeAt(0)));
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const s = Math.max(-1, Math.min(1, channelArrays.at(c)[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
  }
  return new Uint8Array(wavBuffer);
}
