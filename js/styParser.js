export function parseYamahaSty(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  const decoder = new TextDecoder("ascii");

  const mthdLen = view.getUint32(4, false);
  const mtrkOffset = 8 + mthdLen;
  const mtrkLen = view.getUint32(mtrkOffset + 4, false);
  const midiEnd = mtrkOffset + 8 + mtrkLen;

  const standardMidiBuffer = arrayBuffer.slice(0, midiEnd);

  const channelRules = Array.from({ length: 16 }, (_, ch) => ({
    sourceChannel: ch,
    destChannel: ch,
    sourceRoot: 0,
    ntr: 0,
    muted: false
  }));

  let offset = midiEnd;
  while (offset + 8 <= bytes.length) {
    const tag = decoder.decode(bytes.subarray(offset, offset + 4));
    const len = view.getUint32(offset + 4, false);
    const chunkEnd = offset + 8 + len;

    if (tag === "CASM") {
      parseCasmChunk(bytes.subarray(offset + 8, chunkEnd), channelRules);
    }
    offset = chunkEnd;
  }

  return { standardMidiBuffer, channelRules };
}

function parseCasmChunk(casmBytes, channelRules) {
  const view = new DataView(casmBytes.buffer, casmBytes.byteOffset, casmBytes.byteLength);
  const decoder = new TextDecoder("ascii");
  let pos = 0;

  while (pos + 8 <= casmBytes.length) {
    const subTag = decoder.decode(casmBytes.subarray(pos, pos + 4));
    const subLen = view.getUint32(pos + 4, false);
    const subEnd = pos + 8 + subLen;

    if (subTag === "CSEG") {
      let inner = pos + 8;
      while (inner + 8 <= subEnd) {
        const innerTag = decoder.decode(casmBytes.subarray(inner, inner + 4));
        const innerLen = view.getUint32(inner + 4, false);
        const dataOffset = inner + 8;

        // SFF1 Channel Table (Ctab)
        if (innerTag === "Ctab" && innerLen >= 21) {
          const srcCh = casmBytes.at(dataOffset);
          const destCh = casmBytes.at(dataOffset + 9);       // Byte 9 = Destination Channel (0..15)
          const sourceRoot = casmBytes.at(dataOffset + 18) % 12; // Byte 18 = Source Root (0=C..11=B)
          const ntr = casmBytes.at(dataOffset + 20) ?? 0;    // Byte 20 = Note Transposition Rule

          if (srcCh < 16) {
            channelRules.splice(srcCh, 1, {
              sourceChannel: srcCh,
              destChannel: destCh < 16 ? destCh : srcCh,
              sourceRoot,
              ntr,
              muted: false
            });
          }
        }

        // SFF2 Channel Table (Ctb2)
        if (innerTag === "Ctb2" && innerLen >= 31) {
          const srcCh = casmBytes.at(dataOffset);
          const destCh = casmBytes.at(dataOffset + 9);       // Byte 9 = Destination Channel (0..15)
          const sourceRoot = casmBytes.at(dataOffset + 28) % 12; // Byte 28 = Source Root
          const ntr = casmBytes.at(dataOffset + 30) ?? 0;    // Byte 30 = Note Transposition Rule

          if (srcCh < 16) {
            channelRules.splice(srcCh, 1, {
              sourceChannel: srcCh,
              destChannel: destCh < 16 ? destCh : srcCh,
              sourceRoot,
              ntr,
              muted: false
            });
          }
        }

        inner += 8 + innerLen;
      }
    }
    pos = subEnd;
  }
}
