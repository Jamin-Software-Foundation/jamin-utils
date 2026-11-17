export const SAMPLE_RATE = 44100;

export const CHROMATIC_NOTES = new Array(
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"
);

export const SECTION_MAP = {
  // Arrangements (Main Variations)
  "Main A": "ARRA",
  "Main B": "ARRB",
  "Main C": "ARRC",
  "Main D": "ARRD",

  // Fills
  "Fill In AA": "FILA",
  "Fill In BB": "FILB",
  "Fill In CC": "FILC",
  "Fill In DD": "FILD",
  "Fill A": "FILA",
  "Fill B": "FILB",
  "Fill C": "FILC",
  "Fill D": "FILD",

  // Breaks
  "Fill In BA": "BRKA",
  "Fill In AB": "BRKB",
  "Fill In BC": "BRKC",
  "Fill In CD": "BRKD",
  "Break": "BRKA",
  "Break A": "BRKA",

  // Intros (supports both numeric 1-3 and lettered A-C markers)
  "Intro 1": "INT1",
  "Intro 2": "INT2",
  "Intro 3": "INT3",
  "Intro A": "INT1",
  "Intro B": "INT2",
  "Intro C": "INT3",

  // Endings (supports both numeric 1-3 and lettered A-C markers)
  "Ending 1": "END1",
  "Ending 2": "END2",
  "Ending 3": "END3",
  "Ending A": "END1",
  "Ending B": "END2",
  "Ending C": "END3"
};


// Ketron Event RealBass categories (9 prefixes x 12 chromatic keys = 108 WAVs)
export const KETRON_REALBASS_TYPES = {
  BROOT:   { sourceGroup: "MAIN",   intervals: new Array(0, 0, 7) },
  BMAJ:    { sourceGroup: "MAIN",   intervals: new Array(0, 4, 7) },
  BMIN:    { sourceGroup: "MAIN",   intervals: new Array(0, 3, 7) },
  B7TH:    { sourceGroup: "MAIN",   intervals: new Array(0, 4, 7, 10) },
  B5AU:    { sourceGroup: "MAIN",   intervals: new Array(0, 4, 8) },
  BIN_MAJ: { sourceGroup: "INTRO",  intervals: new Array(0, 4, 7) },
  BIN_MIN: { sourceGroup: "INTRO",  intervals: new Array(0, 3, 7) },
  BEN_MAJ: { sourceGroup: "ENDING", intervals: new Array(0, 4, 7) },
  BEN_MIN: { sourceGroup: "ENDING", intervals: new Array(0, 3, 7) }
};

// Ketron Event RealChord categories (9 prefixes x 12 chromatic keys = 108 WAVs)
export const KETRON_REALCHORD_TYPES = {
  MAJ:    { sourceGroup: "MAIN",   intervals: new Array(0, 4, 7) },
  MIN:    { sourceGroup: "MAIN",   intervals: new Array(0, 3, 7) },
  "7TH":  { sourceGroup: "MAIN",   intervals: new Array(0, 4, 7, 10) },
  SUS:    { sourceGroup: "MAIN",   intervals: new Array(0, 5, 7) },
  "5AU":  { sourceGroup: "MAIN",   intervals: new Array(0, 4, 8) },
  IN_MAJ: { sourceGroup: "INTRO",  intervals: new Array(0, 4, 7) },
  IN_MIN: { sourceGroup: "INTRO",  intervals: new Array(0, 3, 7) },
  EN_MAJ: { sourceGroup: "ENDING", intervals: new Array(0, 4, 7) },
  EN_MIN: { sourceGroup: "ENDING", intervals: new Array(0, 3, 7) }
};

export const GM_INSTRUMENTS = new Array(
  // Piano (0-7)
  "Acoustic Grand Piano", "Bright Acoustic Piano", "Electric Grand Piano", "Honky-tonk Piano",
  "Electric Piano 1", "Electric Piano 2", "Harpsichord", "Clavinet",
  // Chromatic Percussion (8-15)
  "Celesta", "Glockenspiel", "Music Box", "Vibraphone",
  "Marimba", "Xylophone", "Tubular Bells", "Dulcimer",
  // Organ (16-23)
  "Drawbar Organ", "Percussive Organ", "Rock Organ", "Church Organ",
  "Reed Organ", "Accordion", "Harmonica", "Tango Accordion",
  // Guitar (24-31)
  "Nylon Guitar", "Steel Guitar", "Jazz Guitar", "Clean Guitar",
  "Muted Guitar", "Overdriven Guitar", "Distortion Guitar", "Guitar Harmonics",
  // Bass (32-39)
  "Acoustic Bass", "Finger Bass", "Pick Bass", "Fretless Bass",
  "Slap Bass 1", "Slap Bass 2", "Synth Bass 1", "Synth Bass 2",
  // Strings (40-47)
  "Violin", "Viola", "Cello", "Contrabass",
  "Tremolo Strings", "Pizzicato Strings", "Orchestral Harp", "Timpani",
  // Ensemble (48-55)
  "String Ensemble 1", "String Ensemble 2", "Synth Strings 1", "Synth Strings 2",
  "Choir Aahs", "Voice Oohs", "Synth Voice", "Orchestra Hit",
  // Brass (56-63)
  "Trumpet", "Trombone", "Tuba", "Muted Trumpet",
  "French Horn", "Brass Section", "Synth Brass 1", "Synth Brass 2",
  // Reed (64-71)
  "Soprano Sax", "Alto Sax", "Tenor Sax", "Baritone Sax",
  "Oboe", "English Horn", "Bassoon", "Clarinet",
  // Pipe (72-79)
  "Piccolo", "Flute", "Recorder", "Pan Flute",
  "Blown Bottle", "Shakuhachi", "Whistle", "Ocarina",
  // Synth Lead (80-87)
  "Lead 1 (Square)", "Lead 2 (Sawtooth)", "Lead 3 (Calliope)", "Lead 4 (Chiff)",
  "Lead 5 (Charang)", "Lead 6 (Voice)", "Lead 7 (Fifths)", "Lead 8 (Bass + Lead)",
  // Synth Pad (88-95)
  "Pad 1 (New Age)", "Pad 2 (Warm)", "Pad 3 (Polysynth)", "Pad 4 (Choir)",
  "Pad 5 (Bowed)", "Pad 6 (Metallic)", "Pad 7 (Halo)", "Pad 8 (Sweep)",
  // Synth Effects (96-103)
  "FX 1 (Rain)", "FX 2 (Soundtrack)", "FX 3 (Crystal)", "FX 4 (Atmosphere)",
  "FX 5 (Brightness)", "FX 6 (Goblins)", "FX 7 (Echoes)", "FX 8 (Sci-Fi)",
  // Ethnic (104-111)
  "Sitar", "Banjo", "Shamisen", "Koto",
  "Kalimba", "Bagpipe", "Fiddle", "Shanai",
  // Percussive (112-119)
  "Tinkle Bell", "Agogo", "Steel Drums", "Woodblock",
  "Taiko Drum", "Melodic Tom", "Synth Drum", "Reverse Cymbal",
  // Sound Effects (120-127)
  "Guitar Fret Noise", "Breath Noise", "Seashore", "Bird Tweet",
  "Telephone Ring", "Helicopter", "Applause", "Gunshot"
);

