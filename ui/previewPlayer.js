import { buildSampleSchedule, buildMultiTrackSchedule } from '../js/loopScheduler.js';
import { SoundBankLoader } from 'spessasynth_core';

let audioCtx = null;
let workletNode = null;
let soundBank = null;

export async function playVariationPreview(analysis, variationCandidates, bpm, chordMode, rootOffsetFromC = 0) {
  if (!workletNode || !analysis || variationCandidates.length === 0) return false;
  if (audioCtx.state === 'suspended') await audioCtx.resume();

  const isOriginal = chordMode === 'ORIGINAL';
  const schedule = buildMultiTrackSchedule(analysis, variationCandidates, {
    sampleRate: audioCtx.sampleRate,
    normalizeToC: !isOriginal,
    overrideBpm: bpm,
    chordType: isOriginal ? null : chordMode,
    targetRootOffset: isOriginal ? 0 : rootOffsetFromC
  });

  workletNode.port.postMessage({
    type: 'play',
    schedule,
    loop: true
  });
  return true;
}

export function getLoadedSoundBank() {
  return soundBank;
}

export async function initWorkletWithSf2(sf2Buffer, onStatus, onEnded) {
  if (!audioCtx) audioCtx = new AudioContext({ sampleRate: 44100 });
  if (audioCtx.state === 'suspended') await audioCtx.resume();

  soundBank = SoundBankLoader.fromArrayBuffer(sf2Buffer.slice(0));

  if (!workletNode) {
    await audioCtx.audioWorklet.addModule('/js/spessaWorklet.js');
    workletNode = new AudioWorkletNode(audioCtx, 'spessa-loop-worklet', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: Array.of(2)
    });
    workletNode.connect(audioCtx.destination);

    workletNode.port.onmessage = (msgEvent) => {
      if (msgEvent.data.type === 'ready') onStatus('SF2 Ready (AudioWorklet @ 44.1 kHz).');
      else if (msgEvent.data.type === 'ended') onEnded();
    };
  }

  onStatus('Initializing SF2 in AudioWorklet...');
  workletNode.port.postMessage({ type: 'init', sf2Buffer });
}

export async function playLoopPreview(analysis, candidate, bpm, chordMode, rootOffsetFromC = 0) {
  if (!workletNode || !analysis) return false;
  if (audioCtx.state === 'suspended') await audioCtx.resume();

  const isOriginal = chordMode === 'ORIGINAL';
  const schedule = buildSampleSchedule(analysis, candidate, {
    sampleRate: audioCtx.sampleRate,
    normalizeToC: !isOriginal,
    passes: 1,
    overrideBpm: bpm,
    chordType: isOriginal ? null : chordMode,
    targetRootOffset: isOriginal ? 0 : rootOffsetFromC
  });

  workletNode.port.postMessage({
    type: 'play',
    schedule,
    loop: candidate.role !== 'fill'
  });
  return true;
}


export function stopLoopPreview() {
  if (workletNode) workletNode.port.postMessage({ type: 'stop' });
}
