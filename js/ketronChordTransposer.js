// Chromatic pitch names starting from C (offset 0 = C, 9 = A, 11 = B)
export const CHROMATIC_NOTES = Array.of(
  { name: 'C',  semitonesFromC: 0 },
  { name: 'C#', semitonesFromC: 1 },
  { name: 'D',  semitonesFromC: 2 },
  { name: 'D#', semitonesFromC: 3 },
  { name: 'E',  semitonesFromC: 4 },
  { name: 'F',  semitonesFromC: 5 },
  { name: 'F#', semitonesFromC: 6 },
  { name: 'G',  semitonesFromC: 7 },
  { name: 'G#', semitonesFromC: 8 },
  { name: 'A',  semitonesFromC: 9 },
  { name: 'A#', semitonesFromC: 10 },
  { name: 'B',  semitonesFromC: 11 }
);

export const KETRON_CHORD_TYPES = Array.of('Maj', 'Min', 'Sus4', '7th');

/**
 * Adapts a C-normalized MIDI note number to the target Ketron chord quality
 * (Maj, Min, Sus4, 7th) and transposes it to the target chromatic root.
 *
 * @param {number} originalMidi - Original MIDI note number from the song
 * @param {number} rootToCOffset - Semitones needed to shift original bar root to C
 * @param {string} chordType - 'Maj' | 'Min' | 'Sus4' | '7th'
 * @param {number} targetSemitonesFromC - 0 (C) to 11 (B)
 * @param {boolean} isBass - Keeps bass notes in low register (E1–G3)
 * @returns {number} Final MIDI note number
 */
export function mapNoteToKetronChord(originalMidi, rootToCOffset, chordType, targetSemitonesFromC, isBass) {
  // 1. Normalize original note to C
  const cNote = originalMidi + rootToCOffset;
  const intervalInC = ((cNote % 12) + 12) % 12; // 0=C, 3=Eb, 4=E, 5=F, 7=G, 10=Bb, 11=B

  let adaptedCNote = cNote;

  if (chordType === 'Min') {
    // Flatten major 3rd (4 -> 3) and major 7th (11 -> 10)
    if (intervalInC === 4) adaptedCNote -= 1;
    else if (intervalInC === 11) adaptedCNote -= 1;
  } else if (chordType === 'Sus4') {
    // Raise major/minor 3rd to 4th (4 -> 5, 3 -> 5)
    if (intervalInC === 4) adaptedCNote += 1;
    else if (intervalInC === 3) adaptedCNote += 2;
  } else if (chordType === '7th') {
    // Flatten major 7th to dominant b7 (11 -> 10)
    if (intervalInC === 11) adaptedCNote -= 1;
  }

  // 2. Transpose from C to the target chromatic root (A through G#)
  let finalMidi = adaptedCNote + targetSemitonesFromC;

  // 3. Clamp to natural instrument octave range
  const minMidi = isBass ? 28 : 45; // E1 for bass, A2 for guitar/chords
  const maxMidi = isBass ? 55 : 84; // G3 for bass, C6 for guitar/chords
  while (finalMidi < minMidi) finalMidi += 12;
  while (finalMidi > maxMidi) finalMidi -= 12;

  return finalMidi;
}
