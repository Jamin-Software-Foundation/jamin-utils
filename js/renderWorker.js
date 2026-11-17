import {
  BasicMIDI,
  SoundBankLoader,
  SpessaSynthProcessor,
  SpessaSynthSequencer,
  audioToWav
} from "/spessasynth/spessasynth_core.js";

let cachedSoundBank = null;

self.onmessage = async (event) => {
  const msg = event.data;

  // Step 1: Load and parse the SF2 once per worker thread
  if (msg.type === "INIT_SF2") {
    cachedSoundBank = SoundBankLoader.fromArrayBuffer(msg.sf2Buffer);
    self.postMessage({ type: "READY" });
    return;
  }

  // Step 2: Render a single MIDI clip to 16-bit 44.1kHz WAV
  if (msg.type === "RENDER_CLIP") {
    try {
      const { jobId, midiBytes, exactSamples, sampleRate } = msg;
      const midiSeq = BasicMIDI.fromArrayBuffer(midiBytes);

      const synth = new SpessaSynthProcessor(sampleRate, {
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

      const wavBuffer = audioToWav(new Array(outLeft, outRight), sampleRate);

      // Transfer ownership of the ArrayBuffer back to main thread (zero-copy)
      self.postMessage(
        { type: "CLIP_DONE", jobId, wavBuffer },
        new Array(wavBuffer)
      );
    } catch (err) {
      self.postMessage({
        type: "CLIP_ERROR",
        jobId: msg.jobId,
        error: err.message
      });
    }
  }
};
