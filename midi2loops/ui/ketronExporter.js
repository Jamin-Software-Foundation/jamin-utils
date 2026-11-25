import { renderLoopToWavBlob } from '/js/offlineWavRenderer.js';
import { downloadKetronStyleZip } from '/js/ketronZipPackager.js';
import { CHROMATIC_NOTES, KETRON_CHORD_TYPES } from '/js/ketronChordTransposer.js';

const SLOT_TO_DRUM_FILENAME = new Map(Array.of(
  Array.of('MAIN_A', 'ARRA.wav'),
  Array.of('MAIN_B', 'ARRB.wav'),
  Array.of('MAIN_C', 'ARRC.wav'),
  Array.of('MAIN_D', 'ARRD.wav'),
  Array.of('BREAK_A', 'BRKA.wav'),
  Array.of('BREAK_B', 'BRKB.wav'),
  Array.of('BREAK_C', 'BRKC.wav'),
  Array.of('BREAK_D', 'BRKD.wav'),
  Array.of('FILL_A', 'FILA.wav'),
  Array.of('FILL_B', 'FILB.wav'),
  Array.of('FILL_C', 'FILC.wav'),
  Array.of('FILL_D', 'FILD.wav'),
  Array.of('INTRO_1', 'INT1.wav'),
  Array.of('INTRO_2', 'INT2.wav'),
  Array.of('INTRO_3', 'INT3.wav'),
  Array.of('ENDING_1', 'END1.wav'),
  Array.of('ENDING_2', 'END2.wav'),
  Array.of('ENDING_3', 'END3.wav')
));

function getKetronFilePrefix(slot, role) {
  const isBass = role === 'bass';
  if (slot.startsWith('INTRO')) return isBass ? 'BIN_' : 'IN_';
  if (slot.startsWith('ENDING')) return isBass ? 'BEN_' : 'EN_';
  return isBass ? 'B' : '';
}

export async function exportAssignedSlotsToKetronZip(
  soundBank,
  analysis,
  assignedCandidates,
  targetBpm,
  customStyleName,
  onStatus
) {
  const renderedWavs = Array.of();
  const finalStyleName = customStyleName || analysis.name;

  for (const cand of assignedCandidates) {
    const slot = cand.targetKetronSlot;
    const isOneShot = cand.role === 'fill' || slot.startsWith('FILL') || slot.startsWith('BREAK') || slot.startsWith('INTRO') || slot.startsWith('ENDING');
    const passes = isOneShot ? 1 : 2;

    if (cand.isDrum) {
      const fileName = SLOT_TO_DRUM_FILENAME.get(slot) || 'ARRA.wav';
      onStatus(`Rendering DRUM/${fileName}...`);
      await new Promise(r => setTimeout(r, 10));

      const wavBlob = await renderLoopToWavBlob(soundBank, analysis, cand, {
        passes,
        normalizeToC: false,
        overrideBpm: targetBpm
      });
      renderedWavs.push({ fileName, slot, role: cand.role, blob: wavBlob });
    } else {
      const prefix = getKetronFilePrefix(slot, cand.role);
      let count = 0;

      for (const chordType of KETRON_CHORD_TYPES) {
        for (const noteObj of CHROMATIC_NOTES) {
          count++;
          const fileName = `${prefix}${chordType}_${noteObj.name}.wav`;
          onStatus(`Rendering ${cand.role.toUpperCase()} ${slot}/${fileName} (${count}/48)...`);
          await new Promise(r => setTimeout(r, 0));

          const wavBlob = await renderLoopToWavBlob(soundBank, analysis, cand, {
            passes,
            normalizeToC: true,
            overrideBpm: targetBpm,
            chordType,
            targetRootOffset: noteObj.semitonesFromC
          });
          renderedWavs.push({ fileName, slot, role: cand.role, blob: wavBlob });
        }
      }
    }
  }

  await downloadKetronStyleZip(finalStyleName, targetBpm, renderedWavs);
  onStatus(`Downloaded ${finalStyleName} Ketron_${targetBpm}.zip (${renderedWavs.length} WAV files)`);

}
