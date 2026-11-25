const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  return c >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function createZipBlob(files) {
  const encoder = new TextEncoder();
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const { filename, bytes } of files) {
    const nameBytes = encoder.encode(filename);
    const checksum = crc32(bytes);
    const size = bytes.length;

    // Local File Header (30 bytes + filename)
    const localHeader = new ArrayBuffer(30 + nameBytes.length);
    const lv = new DataView(localHeader);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint32(14, checksum, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    new Uint8Array(localHeader, 30).set(nameBytes);

    localChunks.push(new Uint8Array(localHeader), bytes);

    // Central Directory Header (46 bytes + filename)
    const centralHeader = new ArrayBuffer(46 + nameBytes.length);
    const cv = new DataView(centralHeader);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, checksum, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    new Uint8Array(centralHeader, 46).set(nameBytes);

    centralChunks.push(new Uint8Array(centralHeader));
    offset += localHeader.byteLength + size;
  }

  const centralSize = centralChunks.reduce((sum, c) => sum + c.length, 0);
  const eocd = new ArrayBuffer(22);
  const ev = new DataView(eocd);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...localChunks, ...centralChunks, new Uint8Array(eocd)], { type: 'application/zip' });
}
