// Reads a ZIP archive back the way an unzipper does (end records, central
// directory, local headers, data descriptors, CRCs) and fails on anything that
// is off. Independent of server/zip.mjs: CRCs come from zlib. Shared by
// tests/zip.test.mjs, tests/gallery-archive.test.mjs and the browser journey
// that downloads the gallery.
import assert from "node:assert/strict";
import zlib from "node:zlib";

export function readZip(zip) {
  const eocd = zip.length - 22;
  assert.equal(zip.readUInt32LE(eocd), 0x06054b50, "end of central directory");
  let count = zip.readUInt16LE(eocd + 10),
    cdSize = zip.readUInt32LE(eocd + 12),
    cdOffset = zip.readUInt32LE(eocd + 16),
    zip64End = false;
  if (eocd >= 20 && zip.readUInt32LE(eocd - 20) === 0x07064b50) {
    const record = Number(zip.readBigUInt64LE(eocd - 20 + 8));
    assert.equal(zip.readUInt32LE(record), 0x06064b50, "ZIP64 end record where the locator says");
    assert.equal(record, eocd - 20 - 56);
    count = Number(zip.readBigUInt64LE(record + 32));
    cdSize = Number(zip.readBigUInt64LE(record + 40));
    cdOffset = Number(zip.readBigUInt64LE(record + 48));
    zip64End = true;
  }
  assert.equal(
    cdOffset + cdSize,
    zip64End ? eocd - 76 : eocd,
    "the central directory ends where the end records start",
  );
  const entries = [];
  let at = cdOffset;
  for (let i = 0; i < count; i++) {
    assert.equal(zip.readUInt32LE(at), 0x02014b50, "central header");
    const flags = zip.readUInt16LE(at + 8),
      nameLength = zip.readUInt16LE(at + 28),
      extraLength = zip.readUInt16LE(at + 30),
      commentLength = zip.readUInt16LE(at + 32);
    let size = zip.readUInt32LE(at + 24),
      compressed = zip.readUInt32LE(at + 20),
      offset = zip.readUInt32LE(at + 42);
    const name = zip.toString("utf8", at + 46, at + 46 + nameLength);
    const extras = {};
    for (let x = at + 46 + nameLength; x < at + 46 + nameLength + extraLength; ) {
      const id = zip.readUInt16LE(x),
        length = zip.readUInt16LE(x + 2);
      extras[id] = zip.subarray(x + 4, x + 4 + length);
      x += 4 + length;
    }
    if (extras[1]) {
      let y = 0;
      const next = () => Number(extras[1].readBigUInt64LE((y += 8) - 8));
      if (size === 0xffffffff) size = next();
      if (compressed === 0xffffffff) compressed = next();
      if (offset === 0xffffffff) offset = next();
      assert.equal(y, extras[1].length, "the ZIP64 extra holds exactly the fields that overflow");
    }
    const crc = zip.readUInt32LE(at + 16);
    assert.equal(compressed, size, "stored: compressed size is the size");
    assert.equal(zip.readUInt16LE(at + 10), 0, "method 0 (stored)");
    // The local header, the data, and the data descriptor after it.
    assert.equal(zip.readUInt32LE(offset), 0x04034b50, "local header");
    const localFlags = zip.readUInt16LE(offset + 6),
      localName = zip.readUInt16LE(offset + 26),
      localExtra = zip.readUInt16LE(offset + 28);
    assert.equal(localFlags, flags);
    assert.equal(zip.toString("utf8", offset + 30, offset + 30 + localName), name);
    assert.equal(zip.readUInt32LE(offset + 14), 0, "CRC is in the data descriptor (bit 3)");
    const localExtras = zip.subarray(offset + 30 + localName, offset + 30 + localName + localExtra);
    const local64 = localExtras.length >= 4 && localExtras.readUInt16LE(0) === 1;
    const start = offset + 30 + localName + localExtra,
      data = zip.subarray(start, start + size);
    assert.equal(zlib.crc32(data), crc, `CRC of ${name}`);
    const d = start + size;
    assert.equal(zip.readUInt32LE(d), 0x08074b50, "data descriptor");
    assert.equal(zip.readUInt32LE(d + 4), crc);
    if (local64) {
      assert.equal(Number(zip.readBigUInt64LE(d + 8)), size);
      assert.equal(Number(zip.readBigUInt64LE(d + 16)), size);
    } else {
      assert.equal(zip.readUInt32LE(d + 8), size);
      assert.equal(zip.readUInt32LE(d + 12), size);
    }
    entries.push({
      name,
      flags,
      size,
      crc,
      data,
      offset,
      zip64: !!extras[1],
      local64,
      timestamp: extras[0x5455],
    });
    at += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(at, cdOffset + cdSize);
  return { entries, zip64End };
}
