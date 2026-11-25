import { BasicMIDI } from "spessasynth_core";
import { SAMPLE_RATE, CHROMATIC_NOTES, KETRON_REALBASS_TYPES, KETRON_REALCHORD_TYPES, GM_INSTRUMENTS} from "/js/constants.js";

import { parseYamahaSty } from "/js/styParser.js";
import { extractSections, buildSectionMidi } from "/js/midiProcessor.js";
import { renderClipOffline } from "/js/renderer.js";
import { PreviewPlayer } from "/js/previewPlayer.js";

const drumGainSlider  = document.getElementById("drumGainSlider");
const bassGainSlider  = document.getElementById("bassGainSlider");
const chordGainSlider = document.getElementById("chordGainSlider");

const drumGainVal  = document.getElementById("drumGainVal");
const bassGainVal  = document.getElementById("bassGainVal");
const chordGainVal = document.getElementById("chordGainVal");

drumGainSlider.addEventListener("input", () => { drumGainVal.textContent = drumGainSlider.value; });
bassGainSlider.addEventListener("input", () => { bassGainVal.textContent = bassGainSlider.value; });
chordGainSlider.addEventListener("input", () => { chordGainVal.textContent = chordGainSlider.value; });

const channelMixerGrid = document.getElementById("channelMixerGrid");
const resetChMixBtn = document.getElementById("resetChMixBtn");
const channelSliders = new Array();
const channelLabels = new Array();

// Build 16 channel sliders (Ch 1 .. Ch 16)
for (let ch = 0; ch < 16; ch++) {
  const cell = document.createElement("div");
  cell.style.cssText = "border: 1px solid #e0e0e0; padding: 0.4rem 0.5rem; border-radius: 5px; background: #fff;";

  const label = document.createElement("div");
  label.style.cssText = "font-size: 0.78rem; margin-bottom: 0.25rem; color: #666;";
  label.innerHTML = `<span id="chName_${ch}">Ch ${ch + 1}</span>: <strong><span id="chVal_${ch}">100</span>%</strong>`;

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "150";
  slider.value = "100";
  slider.style.width = "100%";

  slider.addEventListener("input", () => {
    document.getElementById(`chVal_${ch}`).textContent = slider.value;
  });

  cell.appendChild(label);
  cell.appendChild(slider);
  channelMixerGrid.appendChild(cell);

  channelSliders.push(slider);
  channelLabels.push(cell);
}

resetChMixBtn.addEventListener("click", () => {
  for (let ch = 0; ch < 16; ch++) {
    channelSliders.at(ch).value = "100";
    document.getElementById(`chVal_${ch}`).textContent = "100";
  }
});

const sf2Input = document.getElementById("sf2Input");
const styInput = document.getElementById("styInput");
const convertBtn = document.getElementById("convertBtn");
const downloadBtn = document.getElementById("downloadBtn");
const statusText = document.getElementById("statusText");
const progressBar = document.getElementById("progressBar");
const logBox = document.getElementById("log");

// Highlight active channels and show GM/XG program numbers when a .sty file is selected
styInput.addEventListener("change", async () => {
  checkReady();
  if (styInput.files.length === 0) return;

  const firstFile = styInput.files.item(0);
  const { standardMidiBuffer, channelRules } = parseYamahaSty(await firstFile.arrayBuffer());
  const baseMidi = BasicMIDI.fromArrayBuffer(standardMidiBuffer);

  const active = new Set();
  const progs = new Map();
  const bankMsb = new Map();

  for (const track of baseMidi.tracks) {
    for (const ev of track.events || new Array()) {
      const cmd = ev.statusByte & 0xf0;
      const ch = ev.statusByte & 0x0f;
      if (cmd === 0x90) active.add(ch);
      if (cmd === 0xc0) progs.set(ch, ev.data.at(0)); // 0-indexed (0..127)
      if (cmd === 0xb0 && ev.data.at(0) === 0) bankMsb.set(ch, ev.data.at(1));
    }
  }

  for (let ch = 0; ch < 16; ch++) {
    const nameEl = document.getElementById(`chName_${ch}`);
    const cell = channelLabels.at(ch);

    if (active.has(ch)) {
      const rule = channelRules.at(ch);
      const isDrum = ch === 8 || ch === 9 || rule?.destChannel === 8 || rule?.destChannel === 9 || bankMsb.get(ch) === 127;

      let instLabel = "";
      if (isDrum) {
        instLabel = "Drum Kit";
      } else if (progs.has(ch)) {
        instLabel = GM_INSTRUMENTS.at(progs.get(ch)) || `Prog ${progs.get(ch) + 1}`;
      }

      const tag = instLabel ? ` · ${instLabel}` : "";
      nameEl.innerHTML = `<strong>Ch ${ch + 1}</strong><span style="color:#005fb8;">${tag}</span>`;
      cell.style.borderColor = "#005fb8";
      cell.style.background = "#f0f7ff";
    } else {
      nameEl.textContent = `Ch ${ch + 1}`;
      cell.style.borderColor = "#e0e0e0";
      cell.style.background = "#fff";
    }
  }
});


const previewPlayer = new PreviewPlayer(
  document.getElementById("previewSelect"),
  document.getElementById("playPreviewBtn"),
  document.getElementById("stopPreviewBtn")
);

let generatedZipBlob = null;

function log(msg) {
  logBox.textContent += msg + "\n";
  logBox.scrollTop = logBox.scrollHeight;
}

function checkReady() {
  convertBtn.disabled = !(sf2Input.files.length > 0 && styInput.files.length > 0);
}
sf2Input.addEventListener("change", checkReady);
styInput.addEventListener("change", checkReady);

function resolveVariationSources(sections, mainSec) {
  const introPref = {
    ARRA: new Array("INT1", "INT2", "INT3"),
    ARRB: new Array("INT2", "INT1", "INT3"),
    ARRC: new Array("INT3", "INT2", "INT1"),
    ARRD: new Array("INT3", "INT2", "INT1")
  };
  const endingPref = {
    ARRA: new Array("END1", "END2", "END3"),
    ARRB: new Array("END2", "END1", "END3"),
    ARRC: new Array("END3", "END2", "END1"),
    ARRD: new Array("END3", "END2", "END1")
  };

  const findByPref = (prefs) => {
    for (const name of prefs) {
      const match = sections.find(s => s.ketronName === name);
      if (match) return match;
    }
    return mainSec;
  };

  return {
    MAIN: mainSec,
    INTRO: findByPref(introPref[mainSec.ketronName] || new Array("INT1")),
    ENDING: findByPref(endingPref[mainSec.ketronName] || new Array("END1"))
  };
}

// Helper to yield briefly to the browser UI so progress logs repaint smoothly
const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0));

convertBtn.addEventListener("click", async () => {
  convertBtn.disabled = true;
  downloadBtn.disabled = true;
  previewPlayer.clear();

  const zip = new JSZip();
  const sf2Buffer = await sf2Input.files.item(0).arrayBuffer();
  const styFiles = Array.from(styInput.files);

  progressBar.max = styFiles.length;
  progressBar.value = 0;

  const VARIATION_NAMES = new Array("ARRA", "ARRB", "ARRC", "ARRD");

  for (let i = 0; i < styFiles.length; i++) {
    const file = styFiles.at(i);
    const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
    statusText.textContent = `Converting ${file.name} (${i + 1}/${styFiles.length})...`;
    log(`=== Parsing ${file.name} ===`);
    await yieldToUI();

    const styBuffer = await file.arrayBuffer();
	const { standardMidiBuffer, channelRules } = parseYamahaSty(styBuffer);
	const baseMidi = BasicMIDI.fromArrayBuffer(standardMidiBuffer);
	logChannelRouting(baseMidi, channelRules);
	
    const firstTempo = baseMidi.tempoChanges?.at(0)?.tempo;
    const bpm = Math.round(firstTempo || 120);
    const ppq = baseMidi.timeDivision || 480;
    const sections = extractSections(baseMidi, log);

    log(`Detected BPM: ${bpm} | PPQ: ${ppq} | Sections: ${sections.length}`);
	
	const drumGain  = parseInt(drumGainSlider.value, 10) / 100;
	const bassGain  = parseInt(bassGainSlider.value, 10) / 100;
	const chordGain = parseInt(chordGainSlider.value, 10) / 100;

	log(`Output Mix Gains -> Drums: ${drumGainSlider.value}%, Bass: ${bassGainSlider.value}%, Chords: ${chordGainSlider.value}%`);
	
    const channelVolumes = channelSliders.map(s => parseInt(s.value, 10) / 100);	

    // A. Live_Drums
    const drumFolderName = `${cleanName}_${bpm}`;
    for (const sec of sections) {
      const exactSamples = Math.round((60 / bpm) * ((sec.endTick - sec.startTick) / ppq) * SAMPLE_RATE);
      if (exactSamples <= 0) continue;

      const drumMidi = buildSectionMidi(baseMidi, sec, "DRUM", channelRules, null, 0, false, channelVolumes);
	  
      if (drumMidi.lastVoiceEventTick > 0) {
		const drumWav = await renderClipOffline(sf2Buffer, drumMidi, exactSamples, drumGain);		
        const drumPath = `USER_MODELING/LiveDrum/${drumFolderName}/${sec.ketronName}.wav`;
        zip.file(drumPath, drumWav);
        previewPlayer.addLoop(drumPath, drumWav);
      }
    }
    log(`  ✔ Live_Drums/${drumFolderName}`);
    await yieldToUI();

    // B & C. RealBass & RealChord per variation (ARRA..ARRD)
    const presentVariations = sections.filter(s => VARIATION_NAMES.includes(s.ketronName));

    for (const varSec of presentVariations) {
      const varFolderName = `${cleanName} ${varSec.ketronName}_${bpm}`;
      const sourceSecByGroup = resolveVariationSources(sections, varSec);

      // 1. RealBass (108 WAVs for this variation)
      for (const [prefix, cfg] of Object.entries(KETRON_REALBASS_TYPES)) {
        const srcSec = sourceSecByGroup[cfg.sourceGroup];
        if (!srcSec) continue;
        const exactSamples = Math.round((60 / bpm) * ((srcSec.endTick - srcSec.startTick) / ppq) * SAMPLE_RATE);
        if (exactSamples <= 0) continue;

        for (let rootIdx = 0; rootIdx < 12; rootIdx++) {
          const noteName = CHROMATIC_NOTES.at(rootIdx);
          const bassMidi = buildSectionMidi(baseMidi, srcSec, "BASS", channelRules, cfg.intervals, rootIdx, true, channelVolumes);
		  
          if (bassMidi.lastVoiceEventTick > 0) {
			const bassWav = await renderClipOffline(sf2Buffer, bassMidi, exactSamples, bassGain);			
            const bassPath = `USER_MODELING/RealBass/${varFolderName}/${prefix}_${noteName}.wav`;
            zip.file(bassPath, bassWav);
            previewPlayer.addLoop(bassPath, bassWav);
          }
        }
        await yieldToUI();
      }
      log(`  ✔ RealBass/${varFolderName} (108 loops)`);

      // 2. RealChord (108 WAVs for this variation)
      for (const [prefix, cfg] of Object.entries(KETRON_REALCHORD_TYPES)) {
        const srcSec = sourceSecByGroup[cfg.sourceGroup];
        if (!srcSec) continue;
        const exactSamples = Math.round((60 / bpm) * ((srcSec.endTick - srcSec.startTick) / ppq) * SAMPLE_RATE);
        if (exactSamples <= 0) continue;

        for (let rootIdx = 0; rootIdx < 12; rootIdx++) {
          const noteName = CHROMATIC_NOTES.at(rootIdx);
          const chordMidi = buildSectionMidi(baseMidi, srcSec, "CHORD", channelRules, cfg.intervals, rootIdx, false, channelVolumes)
          if (chordMidi.lastVoiceEventTick > 0) {
			const chordWav = await renderClipOffline(sf2Buffer, chordMidi, exactSamples, chordGain);			  
            const chordPath = `USER_MODELING/RealChord/${varFolderName}/${prefix}_${noteName}.wav`;
            zip.file(chordPath, chordWav);
            previewPlayer.addLoop(chordPath, chordWav);
          }
        }
        await yieldToUI();
      }
      log(`  ✔ RealChord/${varFolderName} (108 loops)`);
    }

    // Plug your KST generator in here:
	const kstName = "USER_STYLE/Ballad/" + cleanName.replaceAll("-", " ") + ".KST";
	const kstData = await buildKstFile(cleanName, cleanName, presentVariations.length, cleanName, presentVariations.length, bpm);
	zip.file(kstName, kstData);  

    progressBar.value = i + 1;
  }

  statusText.textContent = "Building ketron_styles.zip...";
  generatedZipBlob = await zip.generateAsync({ type: "blob" });

  statusText.textContent = "Conversion complete! Preview loops below or download ZIP.";
  downloadBtn.disabled = false;
  convertBtn.disabled = false;
  previewPlayer.enable();
});

function logChannelRouting(baseMidi, channelRules) {
  const activeChannels = new Set();
  const programByChannel = new Map();

  for (const track of baseMidi.tracks) {
    for (const ev of track.events || new Array()) {
      const cmd = ev.statusByte & 0xf0;
      const ch = ev.statusByte & 0x0f;
      if (cmd === 0x90) activeChannels.add(ch);
      if (cmd === 0xc0) programByChannel.set(ch, ev.data.at(0));
    }
  }

  const drums = new Array();
  const bass = new Array();
  const chords = new Array();

  for (let ch = 0; ch < 16; ch++) {
    if (!activeChannels.has(ch)) continue;

    const rule = channelRules.at(ch);
    const dest = rule ? rule.destChannel : ch;
    const prog = programByChannel.has(ch) ? ` (Prog ${programByChannel.get(ch) + 1})` : "";
    const isDrum = dest === 8 || dest === 9 || ch === 8 || ch === 9;
    const instName = isDrum ? "Drum Kit" : (programByChannel.has(ch) ? GM_INSTRUMENTS.at(programByChannel.get(ch)) : "");
    const label = instName ? `Ch ${ch + 1} (${instName})` : `Ch ${ch + 1}`;
	
    if (dest === 8 || dest === 9 || ch === 8 || ch === 9) {
      drums.push(label);
    } else if (dest === 10) {
      bass.push(label);
    } else {
      chords.push(label);
    }
  }

  log(`  Routing -> Drums: [${drums.join(", ") || "none"}]`);
  log(`  Routing -> Bass:  [${bass.join(", ") || "none"}]`);
  log(`  Routing -> Chord: [${chords.join(", ") || "none"}]`);
}


downloadBtn.addEventListener("click", () => {
  if (!generatedZipBlob) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(generatedZipBlob);
  a.download = "ketron_styles.zip";
  a.click();
});
