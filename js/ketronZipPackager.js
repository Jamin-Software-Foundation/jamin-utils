const { JSZip } = window;

const ALL_18_DRUM_FILES = Array.of(
  'ARRA.wav', 'ARRB.wav', 'ARRC.wav', 'ARRD.wav',
  'BRKA.wav', 'BRKB.wav', 'BRKC.wav', 'BRKD.wav',
  'FILA.wav', 'FILB.wav', 'FILC.wav', 'FILD.wav',
  'INT1.wav', 'INT2.wav', 'INT3.wav',
  'END1.wav', 'END2.wav', 'END3.wav'
);

const SPACED_SLOT_LABELS = new Map(Array.of(
  Array.of('MAIN_A', 'Main A'),
  Array.of('MAIN_B', 'Main B'),
  Array.of('MAIN_C', 'Main C'),
  Array.of('MAIN_D', 'Main D'),
  Array.of('INTRO_1', 'Intro 1'),
  Array.of('INTRO_2', 'Intro 2'),
  Array.of('INTRO_3', 'Intro 3'),
  Array.of('ENDING_1', 'Ending 1'),
  Array.of('ENDING_2', 'Ending 2'),
  Array.of('ENDING_3', 'Ending 3')
));

function getFolderGroupLabel(role) {
  if (role === 'bass') return 'Bass';
  if (role === 'drum' || role === 'fill') return 'Drum';
  return 'Chord';
}

export async function downloadKetronStyleZip(styleName, bpm, renderedWavs) {
  const zip = new JSZip();

  // Convert underscores/hyphens to spaces, strip special chars, collapse extra spaces
  const cleanBaseName = (styleName || 'Custom Style')
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16) || 'Custom Style';

  const folderCache = new Map();
  const getOrCreateFolder = (folderName) => {
    if (!folderCache.has(folderName)) {
      folderCache.set(folderName, zip.folder(folderName));
    }
    return folderCache.get(folderName);
  };

  // Track active MAIN_X slots for Chord and Bass
  const mainSlotsByGroup = new Map(Array.of(
    Array.of('Chord', new Set()),
    Array.of('Bass', new Set())
  ));

  for (const item of renderedWavs) {
    const group = getFolderGroupLabel(item.role);
    if (group !== 'Drum' && item.slot.startsWith('MAIN')) {
      mainSlotsByGroup.get(group).add(item.slot);
    }
  }
  for (const slotSet of mainSlotsByGroup.values()) {
    if (slotSet.size === 0) slotSet.add('MAIN_A');
  }

  let firstDrumBlob = null;
  const writtenDrumFiles = new Set();

  for (const item of renderedWavs) {
    const group = getFolderGroupLabel(item.role);

    if (group === 'Drum') {
      // Example: "My Song Drum_120"
      const drumFolder = getOrCreateFolder(`${cleanBaseName} Drum_${bpm}`);
      drumFolder.file(item.fileName, item.blob);
      writtenDrumFiles.add(item.fileName);
      if (!firstDrumBlob || item.fileName === 'ARRA.wav') {
        firstDrumBlob = item.blob;
      }
    } else {
      // Example: "My Song Chord Main A_120", "My Song Bass Intro 1_120"
      const slotLabel = SPACED_SLOT_LABELS.get(item.slot) || item.slot.replace(/_/g, ' ');
      getOrCreateFolder(`${cleanBaseName} ${group} ${slotLabel}_${bpm}`).file(item.fileName, item.blob);

      if (item.slot.startsWith('INTRO') || item.slot.startsWith('ENDING')) {
        for (const mainSlot of mainSlotsByGroup.get(group)) {
          const mainLabel = SPACED_SLOT_LABELS.get(mainSlot) || mainSlot.replace(/_/g, ' ');
          getOrCreateFolder(`${cleanBaseName} ${group} ${mainLabel}_${bpm}`).file(item.fileName, item.blob);
        }
      }
    }
  }

  // Auto-fill any missing files out of the 18 required drum WAVs
  if (firstDrumBlob) {
    const drumFolder = getOrCreateFolder(`${cleanBaseName} Drum_${bpm}`);
    for (const reqFile of ALL_18_DRUM_FILES) {
      if (!writtenDrumFiles.has(reqFile)) {
        drumFolder.file(reqFile, firstDrumBlob);
      }
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const downloadUrl = URL.createObjectURL(zipBlob);

  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = `${cleanBaseName} Ketron_${bpm}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
}
