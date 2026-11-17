import { SAMPLE_RATE } from "./constants.js";

export class RenderWorkerPool {
  constructor(workerCount = Math.min(navigator.hardwareConcurrency || 4, 8)) {
    this.workerCount = workerCount;
    this.workers = new Array();
    this.idleWorkers = new Array();
    this.queue = new Array();
    this.pendingJobs = new Map();
    this.nextJobId = 1;
  }

  async init(sf2Buffer) {
    this.terminate();

    const initPromises = new Array();
    for (let i = 0; i < this.workerCount; i++) {
      const worker = new Worker(new URL("./renderWorker.js", import.meta.url), {
        type: "module"
      });

      const readyPromise = new Promise((resolve) => {
        worker.onmessage = (event) => {
          const msg = event.data;
          if (msg.type === "READY") {
            this.idleWorkers.push(worker);
            resolve();
            this._pump();
          } else if (msg.type === "CLIP_DONE") {
            const job = this.pendingJobs.get(msg.jobId);
            this.pendingJobs.delete(msg.jobId);
            this.idleWorkers.push(worker);
            if (job) job.resolve(msg.wavBuffer);
            this._pump();
          } else if (msg.type === "CLIP_ERROR") {
            const job = this.pendingJobs.get(msg.jobId);
            this.pendingJobs.delete(msg.jobId);
            this.idleWorkers.push(worker);
            if (job) job.reject(new Error(msg.error));
            this._pump();
          }
        };
      });

      // Give each worker its own slice of the SF2 buffer
      const sf2Copy = sf2Buffer.slice(0);
      worker.postMessage({ type: "INIT_SF2", sf2Buffer: sf2Copy }, new Array(sf2Copy));

      this.workers.push(worker);
      initPromises.push(readyPromise);
    }

    await Promise.all(initPromises);
  }

  renderClip(midiSeq, exactSamples) {
    const midiBytes = midiSeq.writeMIDI();
    return new Promise((resolve, reject) => {
      const jobId = this.nextJobId++;
      this.queue.push({ jobId, midiBytes, exactSamples, resolve, reject });
      this._pump();
    });
  }

  _pump() {
    while (this.idleWorkers.length > 0 && this.queue.length > 0) {
      const worker = this.idleWorkers.shift();
      const task = this.queue.shift();
      this.pendingJobs.set(task.jobId, task);

      worker.postMessage(
        {
          type: "RENDER_CLIP",
          jobId: task.jobId,
          midiBytes: task.midiBytes,
          exactSamples: task.exactSamples,
          sampleRate: SAMPLE_RATE
        },
        new Array(task.midiBytes)
      );
    }
  }

  terminate() {
    for (const w of this.workers) {
      w.terminate();
    }
    this.workers.length = 0;
    this.idleWorkers.length = 0;
    this.queue.length = 0;
    this.pendingJobs.clear();
  }
}
