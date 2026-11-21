import { KETRON_SLOTS, GM_INSTRUMENTS, GM_DRUM_KITS } from './gmConstants.js';

const EDITABLE_ROLES = Array.of('chord', 'bass', 'drum', 'fill');

function getSlotGroupKey(cand) {
  if (!cand.targetKetronSlot) return null;
  const group = cand.role === 'bass' ? 'BASS' : ((cand.role === 'drum' || cand.role === 'fill') ? 'DRUM' : 'CHORD');
  return `${group}:${cand.targetKetronSlot}`;
}

export function findDuplicateSlotKeys(candidates) {
  const counts = new Map();
  for (const cand of candidates) {
    const key = getSlotGroupKey(cand);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const duplicates = new Set();
  for (const [key, count] of counts.entries()) {
    if (count > 1) duplicates.add(key);
  }
  return duplicates;
}

export function renderCandidateList(container, analysis, state) {
  if (!analysis) return 0;
  container.innerHTML = '';

  const duplicateKeys = findDuplicateSlotKeys(analysis.candidates);

  const filtered = analysis.candidates.filter(c => {
	if (state.roleFilter === 'assigned') return Boolean(c.targetKetronSlot);
	const matchesRole = state.roleFilter === 'all' || c.role === state.roleFilter;
	const matchesLength = state.lengthFilter === 'all' || String(c.lengthBars) === state.lengthFilter;
	return matchesRole && matchesLength;
  });

  for (const cand of filtered) {
    const slotKey = getSlotGroupKey(cand);
    const isDuplicate = slotKey && duplicateKeys.has(slotKey);

    const card = document.createElement('div');
    card.className = `card ${state.playingId === cand.id ? 'playing' : ''}`;
    if (isDuplicate) {
      card.style.borderLeftColor = '#f59e0b';
      card.style.background = '#2d261a';
    }

    const chordBadge = cand.isSingleChord
      ? `<span class="badge single">Single Chord (${cand.detectedChords.at(0)})</span>`
      : `<span class="badge">Progression: ${cand.detectedChords.join(' → ')}</span>`;

    const dupBadge = isDuplicate
      ? `<span class="badge" style="background:#b45309; color:#fef3c7;">⚠ Duplicate ${cand.targetKetronSlot}</span>`
      : '';

    const canNudgeBack = cand.startBar > 0;
    const canNudgeForward = (cand.startBar + cand.lengthBars) < analysis.totalBars;
    const canHalve = cand.lengthBars >= 4;

    const roleOptions = EDITABLE_ROLES.map(r =>
      `<option value="${r}" ${cand.role === r ? 'selected' : ''}>${r.toUpperCase()}</option>`
    ).join('');

    const slotOptions = KETRON_SLOTS.map(slot =>
      `<option value="${slot}" ${cand.targetKetronSlot === slot ? 'selected' : ''}>${slot || '-- Assign Ketron Slot --'}</option>`
    ).join('');

    const progOptions = Array.from({ length: 128 }, (_, idx) => {
      const label = cand.isDrum
        ? `${idx}: ${GM_DRUM_KITS.get(idx) || `Drum Kit ${idx}`}`
        : GM_INSTRUMENTS.at(idx);
      return `<option value="${idx}" ${cand.program === idx ? 'selected' : ''}>${label}</option>`;
    }).join('');	

    card.innerHTML = `
      <div>
        <strong>${cand.trackName}</strong> — Bars ${cand.startBar + 1}–${cand.startBar + cand.lengthBars} (${cand.lengthBars} bar${cand.lengthBars > 1 ? 's' : ''})
        <button data-nudge="-1" data-id="${cand.id}" ${canNudgeBack ? '' : 'disabled'} style="padding: 2px 7px; margin-left: 6px; font-size: 0.75rem;">◀ -1</button>
        <button data-nudge="1" data-id="${cand.id}" ${canNudgeForward ? '' : 'disabled'} style="padding: 2px 7px; font-size: 0.75rem;">+1 ▶</button>
        ${canHalve ? `<button data-halve="${cand.id}" title="Trim to ${cand.lengthBars / 2} bars" style="padding: 2px 7px; margin-left: 4px; font-size: 0.75rem; background: #374151;">÷2 (${cand.lengthBars / 2}b)</button>` : ''}
        <div class="meta" style="margin-top: 6px;">
          <select data-role="${cand.id}" style="padding: 2px 6px; font-size: 0.75rem; font-weight: 600;">${roleOptions}</select>
          ${chordBadge}
          ${dupBadge}
          <span>Repeats: ${cand.occurrences}x</span>
        </div>
        <div class="meta" style="margin-top: 8px; display: flex; gap: 8px; align-items: center;">
          <label>Bank: <input type="number" data-bank="${cand.id}" value="${cand.bank}" min="0" max="128" style="width: 54px; padding: 3px 6px; border-radius: 4px; border: 1px solid #4b5563; background: #1f2937; color: #fff;"></label>
          <label>Prog: <select data-prog="${cand.id}" style="max-width: 220px; padding: 3px 6px;">${progOptions}</select></label>
        </div>
      </div>
      <div class="actions">
        <button data-preview="${cand.id}">${state.playingId === cand.id ? 'Playing...' : 'Preview'}</button>
        <select data-slot="${cand.id}">${slotOptions}</select>
        ${cand.targetKetronSlot ? `<button data-unassign="${cand.id}" title="Un-assign slot" style="padding: 6px 9px; background: #7f1d1d; border-color: #991b1b;">✕</button>` : ''}
      </div>

    `;

    container.appendChild(card);
  }

  return filtered.length;
}
