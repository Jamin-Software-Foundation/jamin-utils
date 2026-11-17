import {
  SoundBankLoader,
  SpessaSynthProcessor,
  SpessaSynthSequencer,
  audioToWav
} from "spessasynth_core";
import { SAMPLE_RATE } from "./constants.js";

let cachedSoundBank = null;
let cachedSf2Ref = null;

export async function renderClipOffline(sf2Buffer, midiSeq, exactSamples, gainMultiplier = 1.0) {
  if (!cachedSoundBank || cachedSf2Ref !== sf2Buffer) {
    cachedSoundBank = SoundBankLoader.fromArrayBuffer(sf2Buffer);
    cachedSf2Ref = sf2Buffer;
  }

  const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
    eventsEnabled: false
  });
  synth.soundBankManager.addSoundBank(cachedSoundBank, "main");
  await synth.ready;

  const seq = new SpessaSynthSequencer(synth);
  seq.loadNewSongList(new Array(midiSeq));
  seq.loopCount = 0;
  seq.play();

  const outLeft = new Float32Array(exactSamples);
  const outRight = new Float32Array(exactSamples);

  let filledSamples = 0;
  while (filledSamples < exactSamples) {
    const bufferSize = Math.min(128, exactSamples - filledSamples);
    seq.processTick();
    synth.process(outLeft, outRight, filledSamples, bufferSize);
    filledSamples += bufferSize;
  }

  // Apply group gain multiplier with [-1.0, 1.0] hard-clip protection
  if (gainMultiplier !== 1.0) {
    for (let i = 0; i < exactSamples; i++) {
      const l = outLeft.at(i) * gainMultiplier;
      const r = outRight.at(i) * gainMultiplier;
      outLeft.set(new Array(l > 1 ? 1 : l < -1 ? -1 : l), i);
      outRight.set(new Array(r > 1 ? 1 : r < -1 ? -1 : r), i);
    }
  }

  return audioToWav(new Array(outLeft, outRight), SAMPLE_RATE);
}
