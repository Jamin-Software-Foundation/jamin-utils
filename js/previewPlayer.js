import { SAMPLE_RATE } from "./constants.js";

export class PreviewPlayer {
  constructor(selectEl, playBtn, stopBtn) {
    this.selectEl = selectEl;
    this.playBtn = playBtn;
    this.stopBtn = stopBtn;
    this.cache = new Map();
    this.audioCtx = null;
    this.sourceNode = null;

    this.playBtn.addEventListener("click", () => this.playSelected());
    this.stopBtn.addEventListener("click", () => this.stop());
  }

  clear() {
    this.stop();
    this.cache.clear();
    this.selectEl.innerHTML = "";
    this.selectEl.disabled = true;
    this.playBtn.disabled = true;
  }

  addLoop(path, wavArrayBuffer) {
    this.cache.set(path, wavArrayBuffer);
    const opt = document.createElement("option");
    opt.value = path;
    opt.textContent = path.replace("USER_MODELING/", "");
    this.selectEl.appendChild(opt);
  }

  enable() {
    if (this.cache.size > 0) {
      this.selectEl.disabled = false;
      this.playBtn.disabled = false;
    }
  }

  async playSelected() {
    this.stop();
    const wavBuffer = this.cache.get(this.selectEl.value);
    if (!wavBuffer) return;

    if (!this.audioCtx) {
      this.audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
    }
    await this.audioCtx.resume();

    const audioBuffer = await this.audioCtx.decodeAudioData(wavBuffer.slice(0));
    this.sourceNode = this.audioCtx.createBufferSource();
    this.sourceNode.buffer = audioBuffer;
    this.sourceNode.loop = true;
    this.sourceNode.connect(this.audioCtx.destination);
    this.sourceNode.start();

    this.stopBtn.disabled = false;
  }

  stop() {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch (_) {}
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    this.stopBtn.disabled = true;
  }
}
