# Yamaha `.STY` to Ketron Event Audio Loop Converter

A zero-backend, client-side static web application that batch-converts Yamaha arranger style files (`.sty` / `.prs`) into sample-accurate, 16-bit / 44.1 kHz `.wav` audio loops structured for the **Ketron Event** (`USER_MODELING` engine) using any `.sf2` SoundFont.

Powered by [`spessasynth_core`](https://github.com) and [`JSZip`](https://github.io), all MIDI parsing, chord transposition, SoundFont synthesis, and ZIP packaging run 100% locally in the browser with no server uploads required.

---

## Features

- **100% Client-Side Batch Processing:** Select an `.sf2` SoundFont and multiple Yamaha `.sty` / `.prs` files to convert entire style libraries in one pass.
- **SFF1 & SFF2 `CASM` Binary Parser:** Extracts standard SMF MIDI chunks (`MThd` + `MTrk`) and parses Yamaha's proprietary `CASM` / `Ctab` (SFF1) and `Ctb2` (SFF2) tables to resolve true channel destinations and source root keys.
- **Exact Ketron Event `USER_MODELING` Hierarchy:**
  - **`Live_Drums`:** Renders isolated drum loops (`ARRA`–`ARRD`, `FILA`–`FILD`, `BRKA`–`BRKD`, `INT1`–`INT3`, `END1`–`END3`) into `<StyleName_BPM>/`.
  - **`RealBass`:** Generates separate `<StyleName> ARR<A-D>_<BPM>/` folders per variation, each containing all **108 chromatic bass loops** (`BROOT`, `BMAJ`, `BMIN`, `B7TH`, `B5AU`, `BIN_MAJ`, `BIN_MIN`, `BEN_MAJ`, `BEN_MIN` across all 12 keys `C`–`B`) constrained to a realistic bass register.
  - **`RealChord`:** Generates separate `<StyleName> ARR<A-D>_<BPM>/` folders per variation, each containing all **108 chromatic chord loops** (`MAJ`, `MIN`, `7TH`, `SUS`, `5AU`, `IN_MAJ`, `IN_MIN`, `EN_MAJ`, `EN_MIN` across all 12 keys `C`–`B`).
- **Yamaha MegaVoice & Articulation Cleanup:** Strips high-velocity (`> 115`) fret noise and articulation triggers on melodic channels so standard GM/GS SoundFonts render clean musical parts.
- **Pre-Render Mix & Per-Channel MIDI Faders:**
  - Group output gain sliders (`0%–200%`) with soft-clip protection for **Live Drums**, **RealBass**, and **RealChord**.
  - 16-channel MIDI volume faders (`Ch 1–16`) with automatic active-channel highlighting and **General MIDI (GM) instrument name labels**.
- **Seamless In-Browser Loop Auditioning:** Test any rendered `.wav` loop directly in the browser using WebAudio's sample-accurate `loop = true` playback before downloading `USER_MODELING.zip`.

---

## Project Structure

```text
sty-to-ketron/
├── index.html           # Static UI, file pickers, mixer faders & preview controls
├── README.md            # Project documentation
└── js/
    ├── main.js          # Batch orchestration, mixer UI bindings & JSZip packaging
    ├── constants.js     # Sample rate, section mappings, chord masks & GM instrument names
    ├── styParser.js     # Binary RIFF chunk splitter & SFF1 (Ctab) / SFF2 (Ctb2) parser
    ├── midiProcessor.js # Section slicing, MegaVoice cleanup, velocity scaling & transposition
    ├── renderer.js      # Offline SpessaSynthProcessor + audioToWav 16-bit PCM renderer
    └── previewPlayer.js # Seamless WebAudio loop player for pre-export auditioning
```

---

## Getting Started

Because the application uses native ES Modules (`<script type="module">`), serve the directory over a local HTTP server rather than opening `index.html` directly via `file://`.

### Option 1: Using Node (`npx serve`)
```bash
npx serve .
```
Open the local URL shown in your terminal (usually `http://localhost:3000`).

### Option 2: Using Python
```bash
python3 -m http.server 8000
```
Open `http://localhost:8000` in your browser.

### Option 3: Static Web Hosting
Deploy the repository directly to **GitHub Pages**, **Netlify**, or **Cloudflare Pages**—no build step or bundler is required.

---

### Option 4: Hosted service on GitHub
You can also use the GitHub hosted version at https://jamin-software-foundation.github.io/sty2loops instead of hosting it locally.


## Output Directory Layout (`ketron_styles.zip`)

For a style named `MYSTYLE.sty` at `105 BPM` containing Variations A–D, the exported archive produces:

```text
USER_MODELING/
├── Live_Drums/
│   └── MYSTYLE_105/
│       ├── ARRA.wav .. ARRD.wav
│       ├── FILA.wav .. FILD.wav
│       ├── BRKA.wav
│       ├── INT1.wav .. INT3.wav
│       └── END1.wav .. END3.wav
├── RealBass/
│   ├── MYSTYLE ARRA_105/   # 108 WAV files (9 types × 12 chromatic keys)
│   ├── MYSTYLE ARRB_105/   # 108 WAV files
│   ├── MYSTYLE ARRC_105/   # 108 WAV files
│   └── MYSTYLE ARRD_105/   # 108 WAV files
└── RealChord/
    ├── MYSTYLE ARRA_105/   # 108 WAV files (9 types × 12 chromatic keys)
    ├── MYSTYLE ARRB_105/   # 108 WAV files
    ├── MYSTYLE ARRC_105/   # 108 WAV files
    └── MYSTYLE ARRD_105/   # 108 WAV files
```

Extract `USER_MODELING` onto your Ketron Event SSD/SD drive alongside your companion `.kst` style file.

---

## Acknowledgements

- [SpessaSynth (`spessasynth_core`)](https://github.com) for pure-JavaScript SoundFont2 synthesis and MIDI/WAV utilities.
- [JSZip](https://github.io) for client-side ZIP archive generation.
