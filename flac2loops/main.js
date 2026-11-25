import { decodeAudioFile, analyzeWithBpm } from './audioAnalyzer.js';
import { extractLoops } from './loopGenerator.js';
import { createZipBlob } from './zipBuilder.js';

const input = document.getElementById('audioInput');
const status = document.getElementById('status');
const btn = document.getElementById('extractBtn');
const selectAllBtn = document.getElementById('selectAllBtn');
const zipBtn = document.getElementById('zipBtn');
const zipNameInput = document.getElementById('zipNameInput');
const grid = document.getElementById('grid');
const bpmInput = document.getElementById('bpmInput');
const trimSlider = document.getElementById('trimSlider');
const trimVal = document.getElementById('trimVal');

let rawAudio = null;
let currentLoops = [];
let playCtx = null, activeSource = null, activeBtn = null, activeLoopObj = null;

input.addEventListener('change', async (e) => {
  const file = e.target.files.item(0);
  if (!file) return;
  stopCurrentLoop();

  // Pre-fill ZIP name from uploaded filename (stripped of extension)
  zipNameInput.value = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');

  status.textContent = 'Decoding audio...';
  rawAudio = await decodeAudioFile(await file.arrayBuffer());
  btn.disabled = false;
  runFullPipeline();
});

btn.addEventListener('click', runFullPipeline);
bpmInput.addEventListener('change', () => { if (rawAudio) runFullPipeline(); });
trimSlider.addEventListener('change', () => { if (rawAudio) runFullPipeline(); });

trimSlider.addEventListener('input', () => {
  const ms = Number(trimSlider.value);
  trimVal.textContent = `${ms >= 0 ? '+' : ''}${ms} ms`;
  if (activeSource && activeLoopObj) {
    activeSource.loopEnd = Math.max(0.5, activeLoopObj.baseDuration + ms / 1000);
  }
});

selectAllBtn.addEventListener('click', () => {
  const boxes = [...grid.querySelectorAll('.loop-check')];
  const anyUnchecked = boxes.some(b => !b.checked);
  boxes.forEach(b => { b.checked = anyUnchecked; });
  updateZipButton();
});

zipBtn.addEventListener('click', () => {
  const selectedIds = new Set([...grid.querySelectorAll('.loop-check:checked')].map(b => b.dataset.id));
  const selectedLoops = currentLoops.filter(l => selectedIds.has(l.id));
  if (selectedLoops.length === 0) return;

  const nameCounts = {};
  const files = selectedLoops.map(loop => {
    const count = (nameCounts[loop.baseFilename] = (nameCounts[loop.baseFilename] || 0) + 1);
    const filename = count === 1 ? `${loop.baseFilename}.wav` : `${loop.baseFilename}_${count}.wav`;
    return { filename, bytes: loop.wavBytes };
  });

  const cleanBase = (zipNameInput.value.trim() || 'guitar_loops').replace(/[^a-zA-Z0-9_-]/g, '_');
  const tempo = bpmInput.value.trim() || '72';

  const zipBlob = createZipBlob(files);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(zipBlob);
  a.download = `${cleanBase}_${tempo}.zip`;
  a.click();
});

function runFullPipeline() {
  stopCurrentLoop();
  grid.innerHTML = '';
  const bpm = Math.max(40, Math.min(240, Number(bpmInput.value) || 72));
  const analysis = analyzeWithBpm(rawAudio, bpm);
  currentLoops = extractLoops(analysis, Number(trimSlider.value));

  status.textContent = `Key: ${analysis.detectedKey} | BPM: ${bpm} | Closed Loops: ${currentLoops.length}`;
  selectAllBtn.disabled = currentLoops.length === 0;

  currentLoops.forEach((loopObj) => {
    const { id, displayTitle, baseFilename, progression, isTonicAnchor, url } = loopObj;
    const card = document.createElement('div');
    card.className = 'card';
    if (isTonicAnchor) card.style.border = '1px solid #4caf50';
    card.innerHTML = `
      <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
        <input type="checkbox" class="loop-check" data-id="${id}" ${isTonicAnchor ? 'checked' : ''}>
        <strong>${isTonicAnchor ? '★ ' : ''}${displayTitle}</strong>
      </label>
      <small style="color:#aaa">${progression}</small>
      <button class="play-btn">▶ Gapless Loop</button>
      <a href="${url}" download="${baseFilename}.wav">Download WAV</a>
    `;
    card.querySelector('.loop-check').addEventListener('change', updateZipButton);
    card.querySelector('.play-btn').addEventListener('click', (e) => toggleGaplessLoop(loopObj, e.target));
    grid.appendChild(card);
  });
  updateZipButton();
}

function updateZipButton() {
  const count = grid.querySelectorAll('.loop-check:checked').length;
  zipBtn.disabled = count === 0;
  zipBtn.textContent = `Download Selected (${count}) .zip`;
}

function toggleGaplessLoop(loopObj, button) {
  const wasSame = activeBtn === button;
  stopCurrentLoop();
  if (wasSame) return;

  if (!playCtx) playCtx = new AudioContext();
  activeSource = playCtx.createBufferSource();
  activeSource.buffer = loopObj.audioBuffer;
  activeSource.loop = true;
  activeSource.loopEnd = Math.max(0.5, loopObj.baseDuration + Number(trimSlider.value) / 1000);
  activeSource.connect(playCtx.destination);
  activeSource.start(0);

  activeBtn = button;
  activeLoopObj = loopObj;
  button.textContent = '⏹ Stop Loop';
  button.style.background = '#d32f2f';
}

function stopCurrentLoop() {
  if (activeSource) { try { activeSource.stop(); } catch {} activeSource = null; }
  if (activeBtn) { activeBtn.textContent = '▶ Gapless Loop'; activeBtn.style.background = '#4caf50'; activeBtn = null; }
  activeLoopObj = null;
}
