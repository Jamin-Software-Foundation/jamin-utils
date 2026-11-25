import { analyzeMidiForLoops } from './analyzer/index.js';
import { downloadMappingJson, applyMappingJson } from './ui/presetManager.js';
import { initWorkletWithSf2,  playLoopPreview, playVariationPreview,  stopLoopPreview,  getLoadedSoundBank} from './ui/previewPlayer.js';
import { renderCandidateList, findDuplicateSlotKeys } from './ui/candidateView.js';
import { exportAssignedSlotsToKetronZip } from './ui/ketronExporter.js';
import { initLiveChordTrigger } from './ui/liveChordTrigger.js';

let currentAnalysis = null;
const uiState = {
  roleFilter: 'all',
  lengthFilter: 'all',
  playingId: null,
  playingSlot: null
};

let liveRootOffset = 0;
let liveChordOverride = null;

const statusBar = document.getElementById('statusBar');
const candidateList = document.getElementById('candidateList');
const previewChordSelect = document.getElementById('previewChordSelect');
const bpmInput = document.getElementById('bpmInput');
const styleNameInput = document.getElementById('styleNameInput');
const midiStatus = document.getElementById('midiStatus');
const chordPadBar = document.getElementById('chordPadBar');

const setStatus = (msg) => { statusBar.textContent = msg; };

function getTargetBpm() {
  const val = parseInt(bpmInput.value, 10);
  return (!Number.isNaN(val) && val >= 40 && val <= 260) ? val : (currentAnalysis?.bpm || 120);
}

function getTargetStyleName() {
  const raw = styleNameInput ? styleNameInput.value.trim() : '';
  return raw || currentAnalysis?.name || 'Custom Style';
}

function refreshView() {
  if (!currentAnalysis) return;
  const shown = renderCandidateList(candidateList, currentAnalysis, uiState);
  if (uiState.playingSlot) {
    setStatus(`Auditioning full ${uiState.playingSlot} at ${getTargetBpm()} BPM`);
  } else {
    setStatus(`${currentAnalysis.name} | ${currentAnalysis.bpm} BPM | Showing ${shown} of ${currentAnalysis.candidates.length} candidates`);
  }
}

// Central playback router: handles both Full Variation (Drum+Bass+Chord) and Single Candidate playback
function triggerCurrentPlayback() {
  if (!currentAnalysis) return;
  const chordMode = liveChordOverride || (previewChordSelect ? previewChordSelect.value : 'Maj');
  const bpm = getTargetBpm();

  // Mode 1: Full Multi-Track Variation Preview (e.g. MAIN_A Drum + Bass + Chord together)
  if (uiState.playingSlot) {
    const group = currentAnalysis.candidates.filter(c => c.targetKetronSlot === uiState.playingSlot);
    if (group.length === 0) return;
    playVariationPreview(currentAnalysis, group, bpm, chordMode, liveRootOffset).then(ok => {
      if (!ok) alert('Please load an SF2 SoundFont first.');
    });
    return;
  }

  // Mode 2: Single Candidate Preview
  if (uiState.playingId) {
    const cand = currentAnalysis.candidates.find(c => c.id === uiState.playingId);
    if (!cand) return;
    playLoopPreview(currentAnalysis, cand, bpm, chordMode, liveRootOffset).then(ok => {
      if (!ok) alert('Please load an SF2 SoundFont first.');
    });
  }
}

function updateCandidateSlice(cand, newStartBar, newLengthBars) {
  if (newStartBar < 0 || (newStartBar + newLengthBars) > currentAnalysis.totalBars) return;

  cand.startBar = newStartBar;
  cand.lengthBars = newLengthBars;

  const winBars = currentAnalysis.bars.slice(newStartBar, newStartBar + newLengthBars);
  cand.detectedChords = winBars.map(b => b.detectedChord || 'N/C');
  cand.isSingleChord = new Set(cand.detectedChords).size === 1;
  cand.barTransposeOffsets = winBars.map(b => b.rootToCOffset);
}

// 1. Load SF2 SoundFont
document.getElementById('sf2Input').addEventListener('change', async (e) => {
  const file = e.target.files.item(0);
  if (!file) return;
  await initWorkletWithSf2(await file.arrayBuffer(), setStatus, () => {
    uiState.playingId = null;
    uiState.playingSlot = null;
    refreshView();
  });
});

// 2. Load & Analyse MIDI
document.getElementById('midiInput').addEventListener('change', async (e) => {
  const file = e.target.files.item(0);
  if (!file) return;

  stopLoopPreview();
  uiState.playingId = null;
  uiState.playingSlot = null;

  currentAnalysis = analyzeMidiForLoops(await file.arrayBuffer());
  bpmInput.value = currentAnalysis.bpm;

  if (styleNameInput) {
    const baseFileName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
    styleNameInput.value = baseFileName.slice(0, 16);
  }

  refreshView();
});

// 3. Live Chord Trigger Bar (On-Screen Pad + USB MIDI Keyboard)
if (chordPadBar) {
  initLiveChordTrigger(
    chordPadBar,
    (target) => {
      liveRootOffset = target.rootOffsetFromC;
      liveChordOverride = target.ketronChordType;
      if (previewChordSelect) previewChordSelect.value = target.ketronChordType;
      if (midiStatus) midiStatus.textContent = `Triggered: ${target.label}`;
      triggerCurrentPlayback();
    },
    (statusText) => {
      if (midiStatus) midiStatus.textContent = statusText;
    }
  );
}

// 4. Toolbar Controls (BPM, Chord Quality Dropdown, Full Variation Audition, Stop, Clear)
bpmInput.addEventListener('change', () => {
  triggerCurrentPlayback();
  refreshView();
});

previewChordSelect?.addEventListener('change', () => {
  liveChordOverride = null;
  liveRootOffset = 0;
  chordPadBar?.querySelectorAll('button').forEach(b => b.classList.remove('active'));
  triggerCurrentPlayback();
});

document.querySelector('.toolbar').addEventListener('click', (e) => {
  const slotToAudition = e.target.dataset.auditionSlot;
  if (!slotToAudition || !currentAnalysis) return;

  const group = currentAnalysis.candidates.filter(c => c.targetKetronSlot === slotToAudition);
  if (group.length === 0) {
    alert(`No tracks assigned to ${slotToAudition} yet. Assign Drum, Bass, or Chord tracks to ${slotToAudition} first.`);
    return;
  }

  uiState.playingId = null;
  uiState.playingSlot = slotToAudition;
  triggerCurrentPlayback();
  refreshView();
});

document.getElementById('stopBtn').addEventListener('click', () => {
  stopLoopPreview();
  uiState.playingId = null;
  uiState.playingSlot = null;
  refreshView();
});

document.getElementById('clearSlotsBtn')?.addEventListener('click', () => {
  if (!currentAnalysis) return;
  for (const cand of currentAnalysis.candidates) {
    cand.targetKetronSlot = null;
  }
  if (uiState.playingSlot) {
    stopLoopPreview();
    uiState.playingSlot = null;
  }
  refreshView();
});

// 5. Role & Bar-Length Filter Tabs
document.getElementById('roleTabs').addEventListener('click', (e) => {
  if (!e.target.classList.contains('tab')) return;
  document.querySelectorAll('#roleTabs .tab').forEach(t => t.classList.remove('active'));
  e.target.classList.add('active');
  uiState.roleFilter = e.target.dataset.role;
  refreshView();
});

document.getElementById('lengthTabs')?.addEventListener('click', (e) => {
  if (!e.target.classList.contains('tab')) return;
  document.querySelectorAll('#lengthTabs .tab').forEach(t => t.classList.remove('active'));
  e.target.classList.add('active');
  uiState.lengthFilter = e.target.dataset.length;
  refreshView();
});

// 6. Candidate Card Interactions (Nudge, Halve, Single Preview, Slot/Role/Bank/Program Edits)
candidateList.addEventListener('click', (e) => {
  if (!currentAnalysis) return;
  
  const unassignId = e.target.dataset.unassign;
  if (unassignId) {
    const cand = currentAnalysis.candidates.find(c => c.id === unassignId);
    if (!cand) return;
    const oldSlot = cand.targetKetronSlot;
    cand.targetKetronSlot = null;

    if (uiState.playingSlot === oldSlot) {
      const remaining = currentAnalysis.candidates.filter(c => c.targetKetronSlot === oldSlot);
      if (remaining.length === 0) {
        stopLoopPreview();
        uiState.playingSlot = null;
      } else {
        triggerCurrentPlayback();
      }
    }
    refreshView();
    return;
  }  

  const nudgeDelta = e.target.dataset.nudge;
  if (nudgeDelta) {
    const cand = currentAnalysis.candidates.find(c => c.id === e.target.dataset.id);
    if (!cand) return;
    updateCandidateSlice(cand, cand.startBar + parseInt(nudgeDelta, 10), cand.lengthBars);
    if (uiState.playingId === cand.id || uiState.playingSlot === cand.targetKetronSlot) {
      triggerCurrentPlayback();
    }
    refreshView();
    return;
  }

  const halveId = e.target.dataset.halve;
  if (halveId) {
    const cand = currentAnalysis.candidates.find(c => c.id === halveId);
    if (!cand || cand.lengthBars < 4) return;
    updateCandidateSlice(cand, cand.startBar, cand.lengthBars / 2);
    if (uiState.playingId === cand.id || uiState.playingSlot === cand.targetKetronSlot) {
      triggerCurrentPlayback();
    }
    refreshView();
    return;
  }

  const previewId = e.target.dataset.preview;
  if (!previewId) return;
  uiState.playingSlot = null;
  uiState.playingId = previewId;
  triggerCurrentPlayback();
  refreshView();
});

candidateList.addEventListener('change', (e) => {
  if (!currentAnalysis) return;
  const { slot, role, bank, prog } = e.target.dataset;

  if (slot) {
    currentAnalysis.candidates.find(c => c.id === slot).targetKetronSlot = e.target.value || null;
    if (uiState.playingSlot) triggerCurrentPlayback();
    refreshView();
    return;
  }

  if (role) {
    const cand = currentAnalysis.candidates.find(c => c.id === role);
    if (!cand) return;
    cand.role = e.target.value;
    cand.isDrum = (cand.role === 'drum' || cand.role === 'fill');
    if (uiState.playingId === cand.id || uiState.playingSlot === cand.targetKetronSlot) {
      triggerCurrentPlayback();
    }
    refreshView();
    return;
  }

  const cand = currentAnalysis.candidates.find(c => c.id === (bank || prog));
  if (!cand) return;

  if (bank) cand.bank = Math.max(0, Math.min(128, parseInt(e.target.value, 10) || 0));
  if (prog) cand.program = parseInt(e.target.value, 10) || 0;
  if (uiState.playingId === cand.id || uiState.playingSlot === cand.targetKetronSlot) {
    triggerCurrentPlayback();
  }
});

// 5. Export Ketron ZIP
document.getElementById('exportBtn').addEventListener('click', async () => {
  const soundBank = getLoadedSoundBank();
  if (!currentAnalysis || !soundBank) return alert('Load both an SF2 and a MIDI file first.');

  const assigned = currentAnalysis.candidates.filter(c => c.targetKetronSlot);
  if (assigned.length === 0) return alert('Assign at least one candidate to a Ketron slot first.');

  const duplicates = findDuplicateSlotKeys(assigned);
  if (duplicates.size > 0) {
    const list = [...duplicates].join(', ');
    const proceed = confirm(`Warning: Duplicate slot assignments detected (${list}). Later items will overwrite earlier ones in the ZIP. Continue anyway?`);
    if (!proceed) return;
  }

  stopLoopPreview();
  uiState.playingId = null;
  refreshView();
  
  await exportAssignedSlotsToKetronZip(
	  soundBank,
	  currentAnalysis,
	  assigned,
	  getTargetBpm(),
	  getTargetStyleName(),
	  setStatus
	);
  
});

// 6. Save Mapping JSON
document.getElementById('saveMapBtn')?.addEventListener('click', () => {
  if (!currentAnalysis) return alert('Load and analyse a MIDI file first.');
  downloadMappingJson(currentAnalysis, getTargetStyleName(), getTargetBpm());
  setStatus(`Saved mapping JSON for "${getTargetStyleName()}".`);
});

// Trigger hidden JSON file picker
const loadMapInput = document.getElementById('loadMapInput');
document.getElementById('loadMapBtn')?.addEventListener('click', () => {
  if (!currentAnalysis) return alert('Load the corresponding MIDI file first before loading a mapping JSON.');
  loadMapInput?.click();
});

// Restore Mapping JSON
loadMapInput?.addEventListener('change', async (e) => {
  const file = e.target.files.item(0);
  if (!file || !currentAnalysis) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const result = applyMappingJson(currentAnalysis, parsed);

    if (result.styleName && styleNameInput) styleNameInput.value = result.styleName;
    if (result.bpm && bpmInput) bpmInput.value = result.bpm;

    stopLoopPreview();
    uiState.playingId = null;
    uiState.playingSlot = null;
    refreshView();
    setStatus(`Restored ${result.restoredCount} candidate settings from ${file.name}.`);
  } catch (err) {
    alert(`Could not load mapping file: ${err.message}`);
  } finally {
    loadMapInput.value = ''; // Allow re-loading the same file if edited
  }
});


