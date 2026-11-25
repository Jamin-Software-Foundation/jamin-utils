const { Chord, Note } = window.Tonal;

const CHROMATIC_NAMES = Array.of('C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B');

/**
 * Maps a Tonal chord symbol (e.g. "Dm7", "Gsus4", "F#m", "C") into Ketron's
 * 4 supported chord types ('Maj' | 'Min' | 'Sus4' | '7th') + semitone offset from C.
 */
export function parseChordToKetronTarget(chordSymbol) {
  const info = Chord.get(chordSymbol);
  const tonic = info.tonic || 'C';
  const chroma = Note.chroma(tonic) ?? 0;
  const rootName = CHROMATIC_NAMES.at(chroma);

  let ketronChordType = 'Maj';
  const typeLower = (info.type || '').toLowerCase();
  const symLower = chordSymbol.toLowerCase();

  if (typeLower.includes('sus4') || symLower.includes('sus4') || symLower.includes('sus')) {
    ketronChordType = 'Sus4';
  } else if (typeLower.includes('minor') || info.quality === 'Minor') {
    ketronChordType = 'Min';
  } else if (typeLower.includes('dominant') || symLower.includes('7')) {
    ketronChordType = '7th';
  }

  return {
    label: `${rootName} ${ketronChordType}`,
    rootOffsetFromC: chroma,
    ketronChordType
  };
}

/**
 * Initializes Web MIDI keyboard chord detection and on-screen chord pad clicks.
 */
export async function initLiveChordTrigger(padContainer, onChordTriggered, onMidiStatus) {
  // 1. Wire clickable on-screen chord buttons
  padContainer.addEventListener('click', (e) => {
    const chordBtn = e.target.dataset.chord;
    if (!chordBtn) return;

    padContainer.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');

    const target = parseChordToKetronTarget(chordBtn);
    onChordTriggered(target);
  });

  // 2. Initialize Web MIDI API if supported by browser
  if (!navigator.requestMIDIAccess) {
    onMidiStatus('On-screen chord pad ready (Web MIDI not supported in this browser).');
    return;
  }

  try {
    const midiAccess = await navigator.requestMIDIAccess();
    const heldNotes = new Set();

    const attachInputs = () => {
      let count = 0;
      for (const input of midiAccess.inputs.values()) {
        count++;
        input.onmidimessage = (msg) => {
          const [status, note, velocity] = msg.data;
          const cmd = status & 0xf0;

          if (cmd === 0x90 && velocity > 0) {
            heldNotes.add(note);
            if (heldNotes.size >= 3) {
              const pitchClasses = [...heldNotes]
                .sort((a, b) => a - b)
                .map(n => Note.pitchClass(Note.fromMidi(n)));
              const detected = Chord.detect(pitchClasses);
              if (detected.length > 0) {
                padContainer.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                onChordTriggered(parseChordToKetronTarget(detected.at(0)));
              }
            }
          } else if (cmd === 0x80 || (cmd === 0x90 && velocity === 0)) {
            heldNotes.delete(note);
          }
        };
      }
      onMidiStatus(count > 0 ? `USB MIDI Ready (${count} keyboard${count > 1 ? 's' : ''} connected)` : 'On-screen chord pad ready (No USB MIDI keyboard detected)');
    };

    attachInputs();
    midiAccess.onstatechange = attachInputs;
  } catch {
    onMidiStatus('On-screen chord pad ready (MIDI permission denied).');
  }
}
