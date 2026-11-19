import { analyzeMidiForLoops } from './js/analyzer/index.js';
import { buildSampleSchedule, dispatchEventsInRange } from './js/loopScheduler.js';
import { renderLoopToWavBlob } from './js/offlineWavRenderer.js';
import { downloadKetronStyleZip } from './js/ketronZipPackager.js';
import { SoundBankLoader, SpessaSynthProcessor } from 'spessasynth_core';

const KETRON_SLOTS = Array.of(
  '', 'MAIN_A', 'MAIN_B', 'MAIN_C', 'MAIN_D',
  'FILL_A', 'FILL_B', 'FILL_C', 'FILL_D',
  'INTRO_1', 'INTRO_2', 'ENDING_1', 'ENDING_2'
);

const GM_INSTRUMENTS = Array.of(
  '0: Acoustic Grand Piano', '1: Bright Acoustic Piano', '2: Electric Grand Piano', '3: Honky-tonk Piano',
  '4: Electric Piano 1', '5: Electric Piano 2', '6: Harpsichord', '7: Clavi',
  '8: Celesta', '9: Glockenspiel', '10: Music Box', '11: Vibraphone',
  '12: Marimba', '13: Xylophone', '14: Tubular Bells', '15: Dulcimer',
  '16: Drawbar Organ', '17: Percussive Organ', '18: Rock Organ', '19: Church Organ',
  '20: Reed Organ', '21: Accordion', '22: Harmonica', '23: Tango Accordion',
  '24: Acoustic Guitar (nylon)', '25: Acoustic Guitar (steel)', '26: Electric Guitar (jazz)', '27: Electric Guitar (clean)',
  '28: Electric Guitar (muted)', '29: Overdriven Guitar', '30: Distortion Guitar', '31: Guitar Harmonics',
  '32: Acoustic Bass', '33: Electric Bass (finger)', '34: Electric Bass (pick)', '35: Fretless Bass',
  '36: Slap Bass 1', '37: Slap Bass 2', '38: Synth Bass 1', '39: Synth Bass 2',
  '40: Violin', '41: Viola', '42: Cello', '43: Contrabass',
  '44: Tremolo Strings', '45: Pizzicato Strings', '46: Orchestral Harp', '47: Timpani',
  '48: String Ensemble 1', '49: String Ensemble 2', '50: SynthStrings 1', '51: SynthStrings 2',
  '52: Choir Aahs', '53: Voice Oohs', '54: Synth Voice', '55: Orchestra Hit',
  '56: Trumpet', '57: Trombone', '58: Tuba', '59: Muted Trumpet',
  '60: French Horn', '61: Brass Section', '62: SynthBrass 1', '63: SynthBrass 2',
  '64: Soprano Sax', '65: Alto Sax', '66: Tenor Sax', '67: Baritone Sax',
  '68: Oboe', '69: English Horn', '70: Bassoon', '71: Clarinet',
  '72: Piccolo', '73: Flute', '74: Recorder', '75: Pan Flute',
  '76: Blown Bottle', '77: Shakuhachi', '78: Whistle', '79: Ocarina',
  '80: Lead 1 (square)', '81: Lead 2 (sawtooth)', '82: Lead 3 (calliope)', '83: Lead 4 (chiff)',
  '84: Lead 5 (charang)', '85: Lead 6 (voice)', '86: Lead 7 (fifths)', '87: Lead 8 (bass + lead)',
  '88: Pad 1 (new age)', '89: Pad 2 (warm)', '90: Pad 3 (polysynth)', '91: Pad 4 (choir)',
  '92: Pad 5 (bowed)', '93: Pad 6 (metallic)', '94: Pad 7 (halo)', '95: Pad 8 (sweep)',
  '96: FX 1 (rain)', '97: FX 2 (soundtrack)', '98: FX 3 (crystal)', '99: FX 4 (atmosphere)',
  '100: FX 5 (brightness)', '101: FX 6 (goblins)', '102: FX 7 (echoes)', '103: FX 8 (sci-fi)',
  '104: Sitar', '105: Banjo', '106: Shamisen', '107: Koto',
  '108: Kalimba', '109: Bag pipe', '110: Fiddle', '111: Shanai',
  '112: Tinkle Bell', '113: Agogo', '114: Steel Drums', '115: Woodblock',
  '116: Taiko Drum', '117: Melodic Tom', '118: Synth Drum', '119: Reverse Cymbal',
  '120: Guitar Fret Noise', '121: Breath Noise', '122: Seashore', '123: Bird Tweet',
  '124: Telephone Ring', '125: Helicopter', '126: Applause', '127: Gunshot'
);


let audioCtx = null;
let workletNode = null;
let soundBank = null;
let currentAnalysis = null;
let activeRoleFilter = 'all';
let activeLengthFilter = 'all';
let playingId = null;

// Direct sample-accurate playback state
let playheadSample = 0;
let loopPlayback = true;

const statusBar = document.getElementById('statusBar');
const candidateList = document.getElementById('candidateList');
const normToggle = document.getElementById('normToggle');
const bpmInput = document.getElementById('bpmInput');

function getTargetBpm() {
  const val = parseInt(bpmInput.value, 10);
  if (!Number.isNaN(val) && val >= 40 && val <= 260) return val;
  return currentAnalysis ? currentAnalysis.bpm : 120;
}

bpmInput.addEventListener('change', () => {
	if (!playingId) return;
	const cand = currentAnalysis.candidates.find(c => c.id === playingId);
	if (!cand) return;

	const schedule = buildSampleSchedule(currentAnalysis, cand, {
	  sampleRate: audioCtx.sampleRate,
	  normalizeToC: normToggle.checked,
	  passes: 1,
	  overrideBpm: getTargetBpm()
	});

	workletNode.port.postMessage({
	  type: 'play',
	  schedule,
	  loop: cand.role !== 'fill'
	});

  playheadSample = 0;
});

// Bar-Length Filter Tabs
document.getElementById('lengthTabs').addEventListener('click', (e) => {
  if (!e.target.classList.contains('tab')) return;
  document.querySelectorAll('#lengthTabs .tab').forEach(t => t.classList.remove('active'));
  e.target.classList.add('active');
  activeLengthFilter = e.target.dataset.length;
  renderCandidates();
});

// Role Filter Tabs (scoped to #roleTabs)
document.getElementById('roleTabs').addEventListener('click', (e) => {
  if (!e.target.classList.contains('tab')) return;
  document.querySelectorAll('#roleTabs .tab').forEach(t => t.classList.remove('active'));
  e.target.classList.add('active');
  activeRoleFilter = e.target.dataset.role;
  renderCandidates();
});


// 1. Load SF2 SoundFont and initialize SpessaSynthProcessor
document.getElementById('sf2Input').addEventListener('change', async (e) => {
  const file = e.target.files.item(0);
  if (!file) return;

  const sf2Buffer = await file.arrayBuffer();
  if (!audioCtx) audioCtx = new AudioContext({ sampleRate: 44100 });
  if (audioCtx.state === 'suspended') await audioCtx.resume();

  // Keep a main-thread SoundBank for offline WAV export
  soundBank = SoundBankLoader.fromArrayBuffer(sf2Buffer.slice(0));

  if (!workletNode) {
    await audioCtx.audioWorklet.addModule('./js/spessaWorklet.js');
    workletNode = new AudioWorkletNode(audioCtx, 'spessa-loop-worklet', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: Array.of(2)
    });
    workletNode.connect(audioCtx.destination);

    workletNode.port.onmessage = (msgEvent) => {
      if (msgEvent.data.type === 'ready') {
        statusBar.textContent = `Loaded SF2: ${file.name} (AudioWorklet @ 44.1 kHz). Ready for MIDI file.`;
      } else if (msgEvent.data.type === 'ended') {
        playingId = null;
        renderCandidates();
      }
    };
  }

  statusBar.textContent = `Initializing SF2 in AudioWorklet...`;
  workletNode.port.postMessage({ type: 'init', sf2Buffer });
});

// 2. Analyse Uploaded MIDI Song
document.getElementById('midiInput').addEventListener('change', async (e) => {
  const file = e.target.files.item(0);
  if (!file) return;
  
  if (workletNode) workletNode.port.postMessage({ type: 'stop' });
  playingId = null;

  const arrayBuffer = await file.arrayBuffer();
  currentAnalysis = analyzeMidiForLoops(arrayBuffer);
  bpmInput.value = currentAnalysis.bpm;
  
  statusBar.textContent = `${currentAnalysis.name} | ${currentAnalysis.bpm} BPM | ${currentAnalysis.totalBars} Bars | ${currentAnalysis.candidates.length} Pruned Candidates`;
  renderCandidates();
});

// 3. Role Filter Tabs
document.getElementById('roleTabs').addEventListener('click', (e) => {
  if (!e.target.classList.contains('tab')) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  e.target.classList.add('active');
  activeRoleFilter = e.target.dataset.role;
  renderCandidates();
});

// 4. Stop Preview Button
document.getElementById('stopBtn').addEventListener('click', () => {
  if (workletNode) workletNode.port.postMessage({ type: 'stop' });
  playingId = null;
  renderCandidates();
});

// 5. Render Candidate Cards
function renderCandidates() {
  if (!currentAnalysis) return;
  candidateList.innerHTML = '';

  const filtered = currentAnalysis.candidates.filter(c => {
    const matchesRole = activeRoleFilter === 'all' || c.role === activeRoleFilter;
    const matchesLength = activeLengthFilter === 'all' || String(c.lengthBars) === activeLengthFilter;
    return matchesRole && matchesLength;
  });


  for (const cand of filtered) {
    const card = document.createElement('div');
    card.className = `card ${playingId === cand.id ? 'playing' : ''}`;

    const chordBadge = cand.isSingleChord
      ? `<span class="badge single">Single Chord (${cand.detectedChords.at(0)})</span>`
      : `<span class="badge">Progression: ${cand.detectedChords.join(' → ')}</span>`;

    const slotOptions = KETRON_SLOTS.map(slot =>
      `<option value="${slot}" ${cand.targetKetronSlot === slot ? 'selected' : ''}>${slot || '-- Assign Ketron Slot --'}</option>`
    ).join('');

    const progOptions = Array.from({ length: 128 }, (_, idx) => {
      const label = cand.isDrum ? `Kit ${idx}` : GM_INSTRUMENTS.at(idx);
      return `<option value="${idx}" ${cand.program === idx ? 'selected' : ''}>${label}</option>`;
    }).join('');

    card.innerHTML = `
      <div>
        <strong>${cand.trackName}</strong> — Bars ${cand.startBar + 1}–${cand.startBar + cand.lengthBars} (${cand.lengthBars} bar${cand.lengthBars > 1 ? 's' : ''})
        <div class="meta">
          <span class="badge">${cand.role.toUpperCase()}</span>
          ${chordBadge}
          <span>Repeats: ${cand.occurrences}x</span>
        </div>
        <div class="meta" style="margin-top: 8px; display: flex; gap: 8px; align-items: center;">
          <label>Bank: <input type="number" data-bank="${cand.id}" value="${cand.bank}" min="0" max="128" style="width: 54px; padding: 3px 6px; border-radius: 4px; border: 1px solid #4b5563; background: #1f2937; color: #fff;"></label>
          <label>Prog: <select data-prog="${cand.id}" style="max-width: 210px; padding: 3px 6px;">${progOptions}</select></label>
        </div>
      </div>
      <div class="actions">
        <button data-preview="${cand.id}">${playingId === cand.id ? 'Playing...' : 'Preview'}</button>
        <select data-slot="${cand.id}">${slotOptions}</select>
      </div>
    `;

    candidateList.appendChild(card);
  }
}

// 6. Delegate Preview Clicks & Slot Assignments
candidateList.addEventListener('click', async (e) => {
  const previewId = e.target.dataset.preview;
  if (!previewId || !currentAnalysis) return;

  if (audioCtx.state === 'suspended') await audioCtx.resume();

  const cand = currentAnalysis.candidates.find(c => c.id === previewId);
	const schedule = buildSampleSchedule(currentAnalysis, cand, {
	  sampleRate: audioCtx.sampleRate,
	  normalizeToC: normToggle.checked,
	  passes: 1,
	  overrideBpm: getTargetBpm()
	});

	workletNode.port.postMessage({
	  type: 'play',
	  schedule,
	  loop: cand.role !== 'fill'
	});

  playheadSample = 0;
  loopPlayback = cand.role !== 'fill';
  playingId = cand.id;
  renderCandidates();
});

candidateList.addEventListener('change', (e) => {
  const slotCandId = e.target.dataset.slot;
  if (slotCandId && currentAnalysis) {
    const cand = currentAnalysis.candidates.find(c => c.id === slotCandId);
    cand.targetKetronSlot = e.target.value || null;
    return;
  }

  const bankCandId = e.target.dataset.bank;
  const progCandId = e.target.dataset.prog;
  const targetId = bankCandId || progCandId;
  if (!targetId || !currentAnalysis) return;

  const cand = currentAnalysis.candidates.find(c => c.id === targetId);
  if (bankCandId) {
    const parsedBank = parseInt(e.target.value, 10);
    cand.bank = Number.isNaN(parsedBank) ? 0 : Math.max(0, Math.min(128, parsedBank));
  }
  if (progCandId) {
    cand.program = parseInt(e.target.value, 10) || 0;
  }

  // If this loop is currently playing, audition the new Bank/Program immediately
  if (playingId === cand.id && audioCtx) {
	const schedule = buildSampleSchedule(currentAnalysis, cand, {
	  sampleRate: audioCtx.sampleRate,
	  normalizeToC: normToggle.checked,
	  passes: 1,
	  overrideBpm: getTargetBpm()
	});

	workletNode.port.postMessage({
	  type: 'play',
	  schedule,
	  loop: cand.role !== 'fill'
	});
    playheadSample = 0;
  }
});


// 7. Render Assigned Loops Offline & Download Ketron ZIP
document.getElementById('exportBtn').addEventListener('click', async () => {
	if (!currentAnalysis || !soundBank) {
		alert('Load both an SF2 and a MIDI file first.');
		return;
	}

	const assigned = currentAnalysis.candidates.filter(c => c.targetKetronSlot);
	if (assigned.length === 0) {
		alert('Assign at least one loop candidate to a Ketron slot first.');
		return;
	}

   if (workletNode) workletNode.port.postMessage({ type: 'stop' });
	playingId = null;
	renderCandidates();

	statusBar.textContent = `Rendering ${assigned.length} WAV loops at 44.1 kHz...`;

	// Allow UI text to repaint before synchronous offline synthesis runs
	await new Promise(resolve => setTimeout(resolve, 30));
	const renderedWavs = Array.of();
	const targetBpm = getTargetBpm();

	for (const cand of assigned) {
	  const isFill = cand.role === 'fill';
	  const passes = isFill ? 1 : 2;

	  const wavBlob = await renderLoopToWavBlob(soundBank, currentAnalysis, cand, {
		passes,
		normalizeToC: true,
		overrideBpm: targetBpm
	  });

	  const fileName = `${cand.targetKetronSlot}_${cand.role}_${targetBpm}.wav`;
	  renderedWavs.push({ fileName, slot: cand.targetKetronSlot, role: cand.role, blob: wavBlob });
	}

	await downloadKetronStyleZip(currentAnalysis.name, targetBpm, renderedWavs);
	statusBar.textContent = `Downloaded ${currentAnalysis.name}_${targetBpm}.zip (${renderedWavs.length} WAV loops)`;

});
