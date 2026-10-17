// The streaming ZIP writer behind "Download all photos" (server/zip.mjs).
// Every archive here is read back three ways: by tests/zip-reader.mjs
// (central directory, local headers, data descriptors, CRCs from zlib), and,
// when they are installed, by Info-ZIP's `unzip -t` and Python's zipfile.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import zlib from "node:zlib";
import {
  zipStream,
  zipChunks,
  zipLength,
  ZipPlan,
  tableCrc32,
} from "../server/zip.mjs";
import { readZip } from "./zip-reader.mjs";

const bytesOf = async (stream) => Buffer.concat(await stream.toArray());
const entry = (name, data, mtime = Date.parse("2027-01-16T03:30:08Z")) => ({
  name,
  size: data.length,
  mtime,
  // A few chunks per entry, as storage sends them.
  open: () => Readable.from([data.subarray(0, 7), data.subarray(7)].filter((b) => b.length)),
});

// Info-ZIP and Python, when present. Each returns null when it is not installed.
async function external(t, zip) {
  const dir = await mkdtemp(path.join(tmpdir(), "zip-test-")),
    file = path.join(dir, "archive.zip");
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(file, zip);
  const unzip = spawnSync("unzip", ["-t", file], {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C.UTF-8" },
  });
  const python = spawnSync(
    "python3",
    [
      "-I",
      "-c",
      "import json,sys,zipfile,zlib\n" +
        "z=zipfile.ZipFile(sys.argv[1])\n" +
        "assert z.testzip() is None\n" +
        "print(json.dumps([[i.filename,i.file_size,i.CRC,list(i.date_time),zlib.crc32(z.read(i))] for i in z.infolist()]))",
      file,
    ],
    { encoding: "utf8" },
  );
  if (unzip.error) t.diagnostic("unzip is not installed: skipped");
  if (python.error) t.diagnostic("python3 is not installed: skipped");
  return {
    unzip: unzip.error ? null : unzip,
    python: python.error ? null : python,
  };
}

test("an archive of stored entries reads back exactly, by this reader, unzip -t and Python's zipfile", async (t) => {
  const files = [
    entry("sophia-xv-event-001.jpg", randomBytes(5000)),
    entry("sophia-xv-family-001.mp4", randomBytes(70000), Date.parse("2027-01-15T22:00:00Z")),
    entry("fotos-años-ñ.jpg", Buffer.from("UTF-8 name"), null),
    entry("empty.jpg", Buffer.alloc(0)),
  ];
  const zip = await bytesOf(zipStream(files));
  assert.equal(zip.length, zipLength(files), "the length is known before streaming");
  const { entries, zip64End } = readZip(zip);
  assert.equal(zip64End, false);
  assert.deepEqual(
    entries.map((e) => [e.name, e.size, e.zip64]),
    [
      ["sophia-xv-event-001.jpg", 5000, false],
      ["sophia-xv-family-001.mp4", 70000, false],
      ["fotos-años-ñ.jpg", 10, false],
      ["empty.jpg", 0, false],
    ],
  );
  for (const [i, e] of entries.entries()) {
    assert.ok(e.flags & 0x0800, "UTF-8 names (bit 11)");
    assert.ok(e.flags & 0x0008, "data descriptor (bit 3)");
    assert.deepEqual(e.data, await bytesOf(await files[i].open()));
  }
  // The exact instant is kept for tools that read it; a missing time has none.
  assert.equal(entries[0].timestamp.readUInt32LE(1), Date.parse("2027-01-16T03:30:08Z") / 1000);
  assert.equal(entries[2].timestamp, undefined);
  const { unzip, python } = await external(t, zip);
  if (unzip) {
    assert.equal(unzip.status, 0, unzip.stdout + unzip.stderr);
    assert.match(unzip.stdout, /No errors detected/);
    assert.match(unzip.stdout, /fotos-años-ñ\.jpg/);
  }
  if (python) {
    assert.equal(python.status, 0, python.stderr);
    const listed = JSON.parse(python.stdout);
    assert.deepEqual(
      listed.map(([name, size, crc, , actual]) => [name, size, crc === actual]),
      entries.map((e) => [e.name, e.size, true]),
    );
    // DOS time is Fort Worth wall-clock time: 9:30 PM on Jan 15 (CST, UTC-6),
    // 2-second resolution; no time at all is 1980-01-01 00:00.
    assert.deepEqual(listed[0][3], [2027, 1, 15, 21, 30, 8]);
    assert.deepEqual(listed[1][3], [2027, 1, 15, 16, 0, 0]);
    assert.deepEqual(listed[2][3], [1980, 1, 1, 0, 0, 0]);
  }
});

test("the same entries always make the same bytes", async () => {
  const data = randomBytes(3000);
  const make = () =>
    bytesOf(zipStream([entry("sophia-xv-event-001.jpg", data), entry("sophia-xv-event-002.jpg", data.subarray(10))]));
  const [a, b] = [await make(), await make()];
  assert.ok(a.equals(b));
});

test("ZIP64 records: sizes, offsets and the end record past the (lowered) limits read back in unzip and Python", async (t) => {
  // The real limits are 4 GiB and 65,535 entries; writing that much is too
  // slow for a test, so the thresholds are lowered to exercise every record.
  const options = { zip64Threshold: 4096, zip64EntryThreshold: 3 };
  const files = [
    entry("sophia-xv-event-001.mp4", randomBytes(10000)), // a "big" entry at offset 0
    entry("sophia-xv-event-002.jpg", randomBytes(100)), // small, but at a "far" offset
    entry("sophia-xv-event-003.jpg", Buffer.from("ñ")),
  ];
  const zip = await bytesOf(zipStream(files, options));
  assert.equal(zip.length, zipLength(files, options));
  const { entries, zip64End } = readZip(zip);
  assert.equal(zip64End, true, "ZIP64 end record and locator");
  assert.deepEqual(
    entries.map((e) => [e.name, e.size, e.zip64, e.local64]),
    [
      ["sophia-xv-event-001.mp4", 10000, true, true],
      ["sophia-xv-event-002.jpg", 100, true, false],
      ["sophia-xv-event-003.jpg", 2, true, false],
    ],
  );
  // The end record says 0xFFFF entries and 0xFFFFFFFF offset: read from ZIP64.
  assert.equal(zip.readUInt16LE(zip.length - 22 + 10), 0xffff);
  assert.equal(zip.readUInt32LE(zip.length - 22 + 16), 0xffffffff);
  const { unzip, python } = await external(t, zip);
  if (unzip) assert.equal(unzip.status, 0, unzip.stdout + unzip.stderr);
  if (python) {
    assert.equal(python.status, 0, python.stderr);
    assert.deepEqual(
      JSON.parse(python.stdout).map(([name, size, crc, , actual]) => [name, size, crc === actual]),
      entries.map((e) => [e.name, e.size, true]),
    );
  }
});

test("streaming: 50 MB passes through chunk by chunk, never joined or held whole", async () => {
  const chunk = 64 * 1024,
    count = 800; // 50 MiB
  const sent = [];
  const source = {
    name: "sophia-xv-event-001.mp4",
    size: chunk * count,
    mtime: 0,
    open: async function* () {
      for (let i = 0; i < count; i++) {
        const piece = Buffer.alloc(chunk, i & 0xff);
        sent.push(piece);
        yield piece;
      }
    },
  };
  let largest = 0,
    passed = 0,
    total = 0;
  for await (const out of zipChunks([source])) {
    largest = Math.max(largest, out.length);
    total += out.length;
    if (out.length === chunk) {
      assert.equal(out, sent[passed], "the input chunk itself, not a copy or a join");
      passed++;
    }
    // Only the newest input chunk may be alive: the writer keeps none.
    if (passed >= 2) sent[passed - 2] = null;
  }
  assert.equal(passed, count);
  assert.equal(largest, chunk, "no output chunk is larger than an input chunk");
  assert.equal(total, zipLength([source]));
});

test("an entry that gives more or fewer bytes than its size fails the archive instead of looking complete", async () => {
  for (const [given, size] of [
    [Buffer.alloc(10), 9],
    [Buffer.alloc(10), 11],
  ]) {
    const stream = zipStream([{ name: "a.jpg", size, mtime: 0, open: () => Readable.from([given]) }]);
    await assert.rejects(bytesOf(stream), (e) => e.code === "ZIP_ENTRY_SIZE" && e.entry === 0);
  }
  // A storage error mid-entry says which entry it was.
  const broken = zipStream([
    entry("a.jpg", Buffer.alloc(4)),
    {
      name: "b.jpg",
      size: 8,
      mtime: 0,
      open: () =>
        Readable.from(
          (async function* () {
            yield Buffer.alloc(4);
            throw Object.assign(new Error("storage dropped"), { code: "ECONNRESET" });
          })(),
        ),
    },
  ]);
  await assert.rejects(bytesOf(broken), (e) => e.code === "ECONNRESET" && e.entry === 1);
});

test("names are plain file names: no separators, no dot names, no control characters", async () => {
  for (const name of ["../a.jpg", "a/b.jpg", "a\\b.jpg", "..", ".", "", "a\u0000.jpg", "a\n.jpg", "x".repeat(256)]) {
    assert.throws(() => zipLength([{ name, size: 1, mtime: 0 }]), { code: "ZIP_INVALID_NAME" }, JSON.stringify(name));
    await assert.rejects(
      bytesOf(zipStream([{ name, size: 1, mtime: 0, open: () => Readable.from([Buffer.alloc(1)]) }])),
      { code: "ZIP_INVALID_NAME" },
    );
  }
});

test("destroying the archive (the client went away) destroys the storage stream being read", async () => {
  let destroyed = false;
  const source = new Readable({
    read() {
      this.push(Buffer.alloc(1024));
    },
    destroy(e, callback) {
      destroyed = true;
      callback(e);
    },
  });
  const stream = zipStream([{ name: "a.mp4", size: 10_000_000, mtime: 0, open: () => source }]);
  let seen = 0;
  for await (const chunk of stream) {
    seen += chunk.length;
    if (seen > 64 * 1024) break; // leaving the loop destroys the stream
  }
  await new Promise((r) => setImmediate(r));
  assert.equal(destroyed, true);
  assert.equal(stream.destroyed, true);
});

test("ZipPlan predicts each archive length as entries are added, for packing parts under a cap", () => {
  const plan = new ZipPlan(),
    files = [
      { name: "a.jpg", size: 10, mtime: 0 },
      { name: "b.jpg", size: 20, mtime: null },
    ];
  assert.equal(plan.length, 22, "an empty archive is its end record");
  const withFirst = plan.with(files[0]);
  assert.equal(plan.length, 22, "with() does not add");
  plan.add(files[0]);
  assert.equal(plan.length, withFirst);
  assert.equal(plan.add(files[1]).length, zipLength(files));
});

test("CRC-32: the table version matches zlib's", () => {
  const data = randomBytes(100000);
  assert.equal(tableCrc32(Buffer.from("123456789")), 0xcbf43926);
  if (typeof zlib.crc32 === "function") {
    assert.equal(tableCrc32(data), zlib.crc32(data));
    assert.equal(tableCrc32(data.subarray(500), tableCrc32(data.subarray(0, 500))), zlib.crc32(data));
  }
});
