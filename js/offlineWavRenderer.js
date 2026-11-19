import { SpessaSynthProcessor, audioToWav} from 'spessasynth_core';
import { buildSampleSchedule, dispatchEventsInRange } from './loopScheduler.js';

const SAMPLE_RATE = 44100;
const BLOCK_SIZE = 128; // Standard synthesis render quantum


export async function renderLoopToWavBlob(soundBank, analysis, candidate, options = {}) {
  const { passes = 2, normalizeToC = true, overrideBpm = null } = options;

  const schedule = buildSampleSchedule(analysis, candidate, {
    sampleRate: SAMPLE_RATE,
    normalizeToC,
    passes,
    overrideBpm
  });

  const offlineProcessor = new SpessaSynthProcessor(SAMPLE_RATE);
  offlineProcessor.soundBankManager.addSoundBank(soundBank, 'main');
  await offlineProcessor.ready;
  offlineProcessor.setSystemParameter('autoAllocateVoices', true);

  const fullLeft = new Float32Array(schedule.totalSamples);
  const fullRight = new Float32Array(schedule.totalSamples);

  let rendered = 0;
  while (rendered < schedule.totalSamples) {
    const frames = Math.min(BLOCK_SIZE, schedule.totalSamples - rendered);
    dispatchEventsInRange(offlineProcessor, schedule.events, rendered, rendered + frames);
    offlineProcessor.process(fullLeft, fullRight, rendered, frames);
    rendered += frames;
  }

  const startOffset = passes === 2 ? schedule.singlePassSamples : 0;
  const finalLeft = fullLeft.subarray(startOffset, startOffset + schedule.singlePassSamples);
  const finalRight = fullRight.subarray(startOffset, startOffset + schedule.singlePassSamples);

  const wavArrayBuffer = audioToWav(Array.of(finalLeft, finalRight), SAMPLE_RATE);
  return new Blob(Array.of(wavArrayBuffer), { type: 'audio/wav' });
}
