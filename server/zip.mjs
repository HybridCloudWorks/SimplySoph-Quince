// A streaming ZIP writer with no dependencies, for "Download all photos"
// (server/gallery.mjs). Photos and videos are already compressed, so entries
// are STORED (method 0): the archive is the files' own bytes plus headers, and
// its exact length is known before the first byte is sent (zipLength), which
// lets a phone show real progress.
//
// Each entry streams straight from storage to the response: its CRC-32 is
// computed as the bytes pass, and it goes after the data in a data descriptor
// (general purpose bit 3), so nothing is read twice and no file is ever held
// in memory. Input chunks are passed on as they are, never joined.
//
// ZIP64 records are written when an entry, an offset or the central directory
// reaches 4 GiB, or the archive has 65,535 entries or more. Tests lower those
// thresholds (zip64Threshold, zip64EntryThreshold) to exercise the records
// without writing gigabytes.
//
// Names are UTF-8 (bit 11) and must be plain file names: no path separators,
// no "." or "..", no control characters. Timestamps are fixed per entry (the
// caller's mtime, or 1980-01-01 00:00 when it has none), so the same input
// always gives the same bytes. The DOS time is Fort Worth wall-clock time
// (site/datetime.mjs); the extended-timestamp field carries the exact instant
// for tools that read it.
import { Readable } from "node:stream";
import zlib from "node:zlib";
import { parts } from "../site/datetime.mjs";

const MAX32 = 0xffffffff,
  MAX16 = 0xffff;
// CRC-32 (IEEE), the one ZIP uses. Node 22.2+ has it built in; the table
// version gives the same values elsewhere.
let table;
export function tableCrc32(bytes, value = 0) {
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = ~value;
  for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}
export const crc32 =
  typeof zlib.crc32 === "function" ? (bytes, value = 0) => zlib.crc32(bytes, value) : tableCrc32;

export class ZipError extends Error {
  constructor(code, entry = null) {
    super(code);
    this.code = code;
    // Which entry (its index in the list) the problem is about, if any.
    this.entry = entry;
  }
}
function checkName(name) {
  if (
    typeof name !== "string" ||
    !name ||
    name === "." ||
    name === ".." ||
    /[/\\\u0000-\u001f\u007f]/.test(name) ||
    Buffer.byteLength(name) > 255
  )
    throw new ZipError("ZIP_INVALID_NAME");
  return Buffer.from(name, "utf8");
}
// MS-DOS date and time (2-second resolution) of an instant, in Fort Worth
// wall-clock time; 1980-01-01 00:00 for no time or one DOS cannot hold.
function dosTime(ms) {
  if (!Number.isFinite(ms)) return { date: 0x21, time: 0 };
  const p = parts(ms);
  if (p.year < 1980 || p.year > 2107) return { date: 0x21, time: 0 };
  const seconds = Math.floor(ms / 1000) % 60;
  return {
    date: ((p.year - 1980) << 9) | (p.month << 5) | p.day,
    time: (p.hour << 11) | (p.minute << 5) | (seconds >> 1),
  };
}
// Unix seconds for the extended-timestamp field (0x5455), when it fits.
const unixTime = (ms) =>
  Number.isFinite(ms) && ms >= 0 && ms / 1000 <= MAX32 ? Math.floor(ms / 1000) : null;
const defaults = { zip64Threshold: MAX32, zip64EntryThreshold: MAX16 };
// How one entry is written at `offset`: whether its sizes need ZIP64 (decided
// before its data, from the declared size) and whether its central record
// needs ZIP64 for the size or the offset.
function describe(entry, offset, { zip64Threshold }) {
  const name = checkName(entry.name);
  if (!Number.isSafeInteger(entry.size) || entry.size < 0)
    throw new ZipError("ZIP_INVALID_SIZE");
  const big = entry.size >= zip64Threshold;
  return {
    name,
    size: entry.size,
    offset,
    big,
    farOffset: offset >= zip64Threshold,
    dos: dosTime(entry.mtime),
    unix: unixTime(entry.mtime),
  };
}
const FLAGS = 0x0008 | 0x0800; // data descriptor, UTF-8 names
const timestampField = (unix) => {
  if (unix === null) return Buffer.alloc(0);
  const b = Buffer.alloc(9);
  b.writeUInt16LE(0x5455, 0);
  b.writeUInt16LE(5, 2);
  b.writeUInt8(1, 4); // modification time present
  b.writeUInt32LE(unix, 5);
  return b;
};
function localHeader(e) {
  // ZIP64 local extra: both sizes, zero here like the CRC (bit 3); the data
  // descriptor that follows the data then carries 8-byte sizes.
  const zip64 = e.big ? Buffer.alloc(20) : Buffer.alloc(0);
  if (e.big) {
    zip64.writeUInt16LE(0x0001, 0);
    zip64.writeUInt16LE(16, 2);
  }
  const extra = Buffer.concat([zip64, timestampField(e.unix)]),
    h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(e.big ? 45 : 20, 4);
  h.writeUInt16LE(FLAGS, 6);
  h.writeUInt16LE(0, 8); // stored
  h.writeUInt16LE(e.dos.time, 10);
  h.writeUInt16LE(e.dos.date, 12);
  h.writeUInt32LE(0, 14); // CRC-32: in the data descriptor
  h.writeUInt32LE(e.big ? MAX32 : 0, 18);
  h.writeUInt32LE(e.big ? MAX32 : 0, 22);
  h.writeUInt16LE(e.name.length, 26);
  h.writeUInt16LE(extra.length, 28);
  return Buffer.concat([h, e.name, extra]);
}
function dataDescriptor(e, crc) {
  const d = Buffer.alloc(e.big ? 24 : 16);
  d.writeUInt32LE(0x08074b50, 0);
  d.writeUInt32LE(crc, 4);
  if (e.big) {
    d.writeBigUInt64LE(BigInt(e.size), 8);
    d.writeBigUInt64LE(BigInt(e.size), 16);
  } else {
    d.writeUInt32LE(e.size, 8);
    d.writeUInt32LE(e.size, 12);
  }
  return d;
}
function centralHeader(e, crc) {
  // Only the fields that overflow go in the ZIP64 extra, in this order.
  const values = [];
  if (e.big) values.push(e.size, e.size);
  if (e.farOffset) values.push(e.offset);
  const zip64 = values.length ? Buffer.alloc(4 + 8 * values.length) : Buffer.alloc(0);
  if (values.length) {
    zip64.writeUInt16LE(0x0001, 0);
    zip64.writeUInt16LE(8 * values.length, 2);
    values.forEach((v, i) => zip64.writeBigUInt64LE(BigInt(v), 4 + 8 * i));
  }
  const extra = Buffer.concat([zip64, timestampField(e.unix)]),
    needs64 = e.big || e.farOffset,
    h = Buffer.alloc(46);
  h.writeUInt32LE(0x02014b50, 0);
  h.writeUInt16LE((3 << 8) | 45, 4); // made by: Unix, spec 4.5
  h.writeUInt16LE(needs64 ? 45 : 20, 6);
  h.writeUInt16LE(FLAGS, 8);
  h.writeUInt16LE(0, 10);
  h.writeUInt16LE(e.dos.time, 12);
  h.writeUInt16LE(e.dos.date, 14);
  h.writeUInt32LE(crc, 16);
  h.writeUInt32LE(e.big ? MAX32 : e.size, 20);
  h.writeUInt32LE(e.big ? MAX32 : e.size, 24);
  h.writeUInt16LE(e.name.length, 28);
  h.writeUInt16LE(extra.length, 30);
  h.writeUInt16LE(0, 32); // comment
  h.writeUInt16LE(0, 34); // disk
  h.writeUInt16LE(0, 36); // internal attributes
  h.writeUInt32LE((0o100644 << 16) >>> 0, 38); // a regular file, rw-r--r--
  h.writeUInt32LE(e.farOffset ? MAX32 : e.offset, 42);
  return Buffer.concat([h, e.name, extra]);
}
function endRecords(count, cdSize, cdOffset, { zip64Threshold, zip64EntryThreshold }) {
  const manyEntries = count >= zip64EntryThreshold,
    bigSize = cdSize >= zip64Threshold,
    farOffset = cdOffset >= zip64Threshold;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(manyEntries ? MAX16 : count, 8);
  end.writeUInt16LE(manyEntries ? MAX16 : count, 10);
  end.writeUInt32LE(bigSize ? MAX32 : cdSize, 12);
  end.writeUInt32LE(farOffset ? MAX32 : cdOffset, 16);
  if (!manyEntries && !bigSize && !farOffset) return end;
  const record = Buffer.alloc(56);
  record.writeUInt32LE(0x06064b50, 0);
  record.writeBigUInt64LE(44n, 4); // size of the rest of this record
  record.writeUInt16LE((3 << 8) | 45, 12);
  record.writeUInt16LE(45, 14);
  record.writeUInt32LE(0, 16); // this disk
  record.writeUInt32LE(0, 20); // disk with the central directory
  record.writeBigUInt64LE(BigInt(count), 24);
  record.writeBigUInt64LE(BigInt(count), 32);
  record.writeBigUInt64LE(BigInt(cdSize), 40);
  record.writeBigUInt64LE(BigInt(cdOffset), 48);
  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(0x07064b50, 0);
  locator.writeUInt32LE(0, 4);
  locator.writeBigUInt64LE(BigInt(cdOffset + cdSize), 8);
  locator.writeUInt32LE(1, 16); // disks in all
  return Buffer.concat([record, locator, end]);
}
// Running totals for an archive being planned, one entry at a time, so a
// caller can pack entries into parts under a byte cap: with(name, size) says
// how long the archive would be with that entry added, add() adds it.
export class ZipPlan {
  constructor(options = {}) {
    this.options = { ...defaults, ...options };
    this.offset = 0;
    this.central = 0;
    this.count = 0;
  }
  #step(entry) {
    const e = describe(entry, this.offset, this.options);
    return {
      offset: this.offset + localHeader(e).length + e.size + (e.big ? 24 : 16),
      central: this.central + centralHeader(e, 0).length,
      count: this.count + 1,
    };
  }
  #length({ offset, central, count }) {
    return offset + central + endRecords(count, central, offset, this.options).length;
  }
  with(entry) {
    return this.#length(this.#step(entry));
  }
  add(entry) {
    Object.assign(this, this.#step(entry));
    return this;
  }
  get length() {
    return this.#length(this);
  }
}
// The exact byte length of the archive these entries make.
export const zipLength = (entries, options) =>
  entries.reduce((plan, entry) => plan.add(entry), new ZipPlan(options)).length;
// The archive as chunks. Each entry is { name, size, mtime, open }, where
// open() gives its bytes (a Readable or any async iterable) and size is how
// many it must give: more or fewer fails the archive (ZIP_ENTRY_SIZE) instead
// of producing a file that looks complete but is not. An abort signal
// destroys the entry being read.
export async function* zipChunks(entries, options = {}) {
  const opts = { ...defaults, ...options },
    { signal } = opts,
    central = [];
  let offset = 0;
  for (const [index, entry] of entries.entries()) {
    signal?.throwIfAborted();
    const e = describe(entry, offset, opts),
      header = localHeader(e);
    yield header;
    let crc = 0,
      received = 0,
      source = null;
    const stop = () => source?.destroy?.(signal.reason);
    signal?.addEventListener("abort", stop, { once: true });
    try {
      source = await entry.open();
      signal?.throwIfAborted();
      for await (const chunk of source) {
        const bytes = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        received += bytes.length;
        if (received > e.size) throw new ZipError("ZIP_ENTRY_SIZE", index);
        crc = crc32(bytes, crc);
        yield bytes;
      }
    } catch (error) {
      if (error instanceof ZipError || signal?.aborted) throw error;
      throw Object.assign(error, { entry: index });
    } finally {
      signal?.removeEventListener("abort", stop);
      source?.destroy?.();
    }
    if (received !== e.size) throw new ZipError("ZIP_ENTRY_SIZE", index);
    const descriptor = dataDescriptor(e, crc);
    yield descriptor;
    central.push(centralHeader(e, crc));
    offset += header.length + e.size + descriptor.length;
  }
  let cdSize = 0;
  for (const record of central) {
    cdSize += record.length;
    yield record;
  }
  yield endRecords(central.length, cdSize, offset, opts);
}
// The archive as a Readable for an HTTP response. Destroying it (the client
// went away, or the response failed) aborts the read in progress at once, so
// no storage stream outlives the request.
export function zipStream(entries, options = {}) {
  const controller = new AbortController(),
    chunks = zipChunks(entries, { ...options, signal: controller.signal });
  return new Readable({
    read() {
      chunks.next().then(
        ({ value, done }) => this.push(done ? null : value),
        (e) => this.destroy(e),
      );
    },
    destroy(e, callback) {
      controller.abort(e ?? new ZipError("ZIP_ABORTED"));
      chunks.return().catch(() => {});
      callback(e);
    },
  });
}
