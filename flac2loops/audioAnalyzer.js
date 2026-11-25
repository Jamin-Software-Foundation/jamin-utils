const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const TEMPLATES = {
  maj:  new Array(1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0),
  min:  new Array(1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0),
  sus4: new Array(1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0),
  '7':  new Array(1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0)
};

export async function decodeAudioFile(arrayBuffer) {
  const ctx = new AudioContext();
  const buffer = await ctx.decodeAudioData(arrayBuffer);
  const channels = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }
  const sampleRate = buffer.sampleRate;
  await ctx.close();
  return { channels, sampleRate };
}

export function analyzeWithBpm({ channels, sampleRate }, bpm) {
  const monoMix = channels.at(0); // Use Left channel for transient & pitch analysis
  const win = Math.floor(sampleRate * 0.01);
  let maxAmp = 0;

  for (let i = 0; i < monoMix.length; i += win) {
    let sum = 0;
    for (let j = 0; j < win && i + j < monoMix.length; j++) sum += Math.abs(monoMix[i + j]);
    if (sum / win > maxAmp) maxAmp = sum / win;
  }

  let firstOnset = 0;
  for (let i = 0; i < monoMix.length; i += win) {
    let sum = 0;
    for (let j = 0; j < win && i + j < monoMix.length; j++) sum += Math.abs(monoMix[i + j]);
    if (sum / win > maxAmp * 0.25) { firstOnset = i; break; }
  }

  const barSamples = Math.round((60 / bpm) * 4 * sampleRate);
  const preRoll = Math.floor(sampleRate * 0.005);
  const anchor = findZeroCrossing(monoMix, Math.max(0, firstOnset - preRoll));

  const bars = [];
  const globalChroma = new Float32Array(12);

  for (let b = 0; anchor + (b + 1) * barSamples <= monoMix.length; b++) {
    const start = findZeroCrossing(monoMix, anchor + b * barSamples);
    const end = findZeroCrossing(monoMix, anchor + (b + 1) * barSamples);

    let rms = 0;
    for (let i = start; i < end; i += 10) rms += monoMix[i] * monoMix[i];
    if (Math.sqrt(rms / ((end - start) / 10)) < maxAmp * 0.15) continue;

    const chroma = getChromagram(monoMix, start, end - start, sampleRate);
    for (let c = 0; c < 12; c++) globalChroma[c] += chroma[c];

    bars.push({ start, end, chord: matchChord(chroma), barNum: b + 1 });
  }

  return { channels, sampleRate, bars, bpm, barSamples, detectedKey: detectGlobalKey(globalChroma) };
}

function findZeroCrossing(data, target) {
  for (let offset = 0; offset < 220; offset++) {
    for (const dir of [-1, 1]) {
      const idx = target + offset * dir;
      if (idx > 0 && idx < data.length - 1 && data[idx] <= 0 && data[idx + 1] > 0) return idx;
    }
  }
  return target;
}

function getChromagram(data, start, len, sampleRate) {
  const chroma = new Float32Array(12);
  const step = 4;
  for (let midi = 40; midi <= 76; midi++) {
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const omega = (2 * Math.PI * freq * step) / sampleRate;
    let re = 0, im = 0;
    const limit = Math.min(len, Math.floor(sampleRate * 1.8));
    for (let i = 0; i < limit; i += step) {
      re += data[start + i] * Math.cos(omega * i);
      im -= data[start + i] * Math.sin(omega * i);
    }
    chroma[midi % 12] += Math.hypot(re, im);
  }
  return chroma;
}

function matchChord(chroma) {
  let bestScore = -1, bestRoot = 'A', bestType = 'maj';
  for (let root = 0; root < 12; root++) {
    for (const [type, pattern] of Object.entries(TEMPLATES)) {
      let score = 0;
      for (let i = 0; i < 12; i++) {
        const e = chroma[(root + i) % 12];
        score += pattern[i] ? e : -e * 0.35;
      }
      if (type === '7') score *= 0.92;
      if (score > bestScore) { bestScore = score; bestRoot = NOTES.at(root); bestType = type; }
    }
  }
  return { root: bestRoot, type: bestType, label: `${bestRoot}_${bestType}` };
}

function detectGlobalKey(globalChroma) {
  const majScale = new Array(1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1);
  let bestRoot = 9, bestVal = -1;
  for (let r = 0; r < 12; r++) {
    let sum = 0;
    for (let i = 0; i < 12; i++) if (majScale[i]) sum += globalChroma[(r + i) % 12];
    if (sum > bestVal) { bestVal = sum; bestRoot = r; }
  }
  return `${NOTES.at(bestRoot)} Major / ${NOTES.at((bestRoot + 9) % 12)} Minor`;
}
