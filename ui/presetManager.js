/**
 * Serializes the current style settings and candidate mappings into a downloadable .json file.
 */
export function downloadMappingJson(analysis, styleName, bpm) {
  const payload = {
    version: 1,
    songName: analysis.name,
    styleName,
    bpm,
    candidates: analysis.candidates.map(c => ({
      id: c.id,
      trackIndex: c.trackIndex,
      startBar: c.startBar,
      lengthBars: c.lengthBars,
      role: c.role,
      bank: c.bank,
      program: c.program,
      targetKetronSlot: c.targetKetronSlot
    }))
  };

  const blob = new Blob(Array.of(JSON.stringify(payload, null, 2)), { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const safeName = (styleName || analysis.name || 'KetronMap')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim() || 'KetronMap';

  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeName}_mapping.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Applies a parsed JSON mapping preset onto an active analysis object.
 * Returns { restoredCount, styleName, bpm }.
 */
export function applyMappingJson(analysis, jsonData) {
  if (!analysis || !jsonData || !Array.isArray(jsonData.candidates)) {
    throw new Error('Invalid mapping JSON format.');
  }

  let restoredCount = 0;

  for (const saved of jsonData.candidates) {
    // Match by candidate ID first, falling back to trackIndex + original start/length
    const cand = analysis.candidates.find(c => c.id === saved.id)
      || analysis.candidates.find(c => c.trackIndex === saved.trackIndex && c.startBar === saved.startBar);

    if (!cand) continue;

    // Restore nudged startBar & halved lengthBars (clamped safely to song length)
    const validStart = Math.max(0, Math.min(analysis.totalBars - 1, saved.startBar ?? cand.startBar));
    const validLen = Math.max(1, Math.min(analysis.totalBars - validStart, saved.lengthBars ?? cand.lengthBars));
    cand.startBar = validStart;
    cand.lengthBars = validLen;

    // Recalculate chords and root offsets for the restored bar window
    const winBars = analysis.bars.slice(validStart, validStart + validLen);
    cand.detectedChords = winBars.map(b => b.detectedChord || 'N/C');
    cand.isSingleChord = new Set(cand.detectedChords).size === 1;
    cand.barTransposeOffsets = winBars.map(b => b.rootToCOffset);

    // Restore role, bank, program, and Ketron slot assignment
    if (saved.role) {
      cand.role = saved.role;
      cand.isDrum = (saved.role === 'drum' || saved.role === 'fill');
    }
    if (Number.isInteger(saved.bank)) cand.bank = saved.bank;
    if (Number.isInteger(saved.program)) cand.program = saved.program;
    cand.targetKetronSlot = saved.targetKetronSlot || null;

    restoredCount++;
  }

  return {
    restoredCount,
    styleName: jsonData.styleName || null,
    bpm: jsonData.bpm || null
  };
}
