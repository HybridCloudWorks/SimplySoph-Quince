import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { normalizeVideo } from "../server/video.mjs";

// Video normalization (#74). CI does not install ffmpeg (the production image
// does), so most tests decide which ffprobe and ffmpeg the code finds on PATH:
// none at all, or two small fake programs that print chosen metadata, write an
// output of a chosen size and record their arguments. They prove how the code
// treats ffprobe's answer and what it asks ffmpeg to do, not that ffmpeg
// transcodes correctly; only the last test uses the real tools.
const installed = (tool) =>
  !spawnSync(tool, ["-version"], { stdio: "ignore", windowsHide: true }).error;
const realTools = installed("ffmpeg") && installed("ffprobe");
const posix = process.platform !== "win32";
const noRealTools = !realTools && "ffmpeg/ffprobe are not installed here (CI does not install them; the production image does)";
const noShell = !posix && "the fake ffprobe/ffmpeg are POSIX shell scripts, which execFile cannot run on Windows";

const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(20)]);
const mov = Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from("ftypqt  "), Buffer.alloc(20)]);
const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(28)]);

const fakeVars = ["FAKE_VIDEO_LOG", "FAKE_FFPROBE_JSON", "FAKE_FFPROBE_EXIT", "FAKE_FFMPEG_BYTES", "FAKE_FFMPEG_EXIT"];
const fakeFfprobe = `#!/bin/sh
{ echo ffprobe; for a in "$@"; do printf '%s\\n' "$a"; done; echo --end; } >> "$FAKE_VIDEO_LOG"
for last in "$@"; do :; done
cp "$last" "$FAKE_VIDEO_LOG.input"
if [ -n "$FAKE_FFPROBE_EXIT" ]; then exit "$FAKE_FFPROBE_EXIT"; fi
printf '%s' "$FAKE_FFPROBE_JSON"
`;
const fakeFfmpeg = `#!/bin/sh
{ echo ffmpeg; for a in "$@"; do printf '%s\\n' "$a"; done; echo --end; } >> "$FAKE_VIDEO_LOG"
if [ -n "$FAKE_FFMPEG_EXIT" ]; then exit "$FAKE_FFMPEG_EXIT"; fi
for last in "$@"; do :; done
head -c "$FAKE_FFMPEG_BYTES" /dev/zero > "$last"
`;

// Gives one test its own temporary directory (where normalizeVideo works) and
// its own PATH: an empty directory, or the fakes ahead of the system tools.
async function sandbox(t, { fakes = false } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "video-test-")),
    tmp = path.join(root, "tmp"),
    bin = path.join(root, "bin"),
    log = path.join(root, "calls.log");
  await mkdir(tmp);
  await mkdir(bin);
  if (fakes) {
    await writeFile(path.join(bin, "ffprobe"), fakeFfprobe, { mode: 0o755 });
    await writeFile(path.join(bin, "ffmpeg"), fakeFfmpeg, { mode: 0o755 });
  }
  const names = ["PATH", "TMPDIR", "TEMP", "TMP", ...fakeVars],
    saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  t.after(async () => {
    for (const [name, value] of Object.entries(saved))
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    await rm(root, { recursive: true, force: true });
  });
  process.env.PATH = fakes ? bin + path.delimiter + saved.PATH : bin;
  for (const name of ["TMPDIR", "TEMP", "TMP"]) process.env[name] = tmp;
  return {
    tmp,
    log,
    // Clears the call log and sets this case's fake behaviour.
    async reset(vars) {
      for (const name of fakeVars) delete process.env[name];
      Object.assign(process.env, { FAKE_VIDEO_LOG: log }, vars);
      await rm(log, { force: true });
      await rm(log + ".input", { force: true });
    },
    async calls() {
      const text = await readFile(log, "utf8").catch(() => "");
      return text
        .split("--end\n")
        .filter(Boolean)
        .map((chunk) => {
          const [tool, ...args] = chunk.replace(/\n$/, "").split("\n");
          return { tool, args };
        });
    },
  };
}
const invalid = (e) => e.status === 422 && e.code === "INVALID_VIDEO";
const unavailable = (e) => e.status === 503 && e.code === "VIDEO_UNAVAILABLE";
const meta = (format, streams) => JSON.stringify({ format, streams });
const video = (width, height) => ({ codec_type: "video", width, height });

test("only MP4/MOV and Matroska/WebM headers get past the format check; without ffprobe the server answers 503 (#74)", async (t) => {
  const s = await sandbox(t);
  const refused = {
    empty: Buffer.alloc(0),
    html: Buffer.from("<script>bad</script>"),
    jpeg: Buffer.from("ffd8ffe000104a4649460001", "hex"),
    png: Buffer.from("89504e470d0a1a0a0000000d", "hex"),
    gif: Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00"),
    avi: Buffer.from("RIFF\x00\x00\x00\x00AVI LIST"),
    "ftyp at the wrong offset": Buffer.from("ftypisom\x00\x00\x00\x00"),
    "truncated Matroska magic": Buffer.from([0x1a, 0x45, 0xdf]),
  };
  for (const [name, bytes] of Object.entries(refused))
    await assert.rejects(normalizeVideo(bytes), invalid, name);
  // Accepted headers go on to ffprobe, which this PATH does not have: a
  // server problem (503), not the guest's upload (422).
  for (const [name, bytes] of Object.entries({ mp4, mov, webm }))
    await assert.rejects(normalizeVideo(bytes), unavailable, name);
  assert.deepEqual(await readdir(s.tmp), [], "the temporary directory is removed after a failure");
});

test("one video is processed at a time, and a failure releases the guard (#74)", async (t) => {
  const s = await sandbox(t);
  const first = assert.rejects(normalizeVideo(mp4), unavailable);
  await assert.rejects(normalizeVideo(webm), (e) => e.status === 503 && e.code === "VIDEO_BUSY");
  await first;
  await assert.rejects(normalizeVideo(mp4), unavailable, "the next upload is not told the server is busy");
  assert.deepEqual(await readdir(s.tmp), []);
});

test("ffprobe must report a video stream, a length of at most 60 seconds and at most 4096 px before ffmpeg runs (#74)", { skip: noShell }, async (t) => {
  const s = await sandbox(t, { fakes: true });
  const refused = {
    "no video stream": meta({ duration: "5" }, [{ codec_type: "audio" }]),
    "zero length": meta({ duration: "0" }, [video(640, 360)]),
    "over a minute": meta({ duration: "60.5" }, [video(640, 360)]),
    "unknown length": meta({ duration: "N/A" }, [video(640, 360)]),
    "no format section": meta(undefined, [video(640, 360)]),
    "too wide": meta({ duration: "5" }, [video(4097, 360)]),
    "too tall": meta({ duration: "5" }, [video(640, 4097)]),
    "zero width": meta({ duration: "5" }, [video(0, 360)]),
    // A stream that does not say how big it is cannot be checked against the limit (#95).
    "missing width": meta({ duration: "5" }, [video(undefined, 360)]),
    "missing height": meta({ duration: "5" }, [video(640, undefined)]),
    "non-numeric width": meta({ duration: "5" }, [video("wide", 360)]),
    "not JSON": "Input #0, mov,mp4,m4a",
  };
  for (const [name, json] of Object.entries(refused)) {
    await s.reset({ FAKE_FFPROBE_JSON: json });
    await assert.rejects(normalizeVideo(mp4), invalid, name);
    assert.deepEqual((await s.calls()).map((c) => c.tool), ["ffprobe"], `${name}: ffmpeg never runs`);
  }
  // A file ffprobe cannot read is the upload's fault too.
  await s.reset({ FAKE_FFPROBE_EXIT: "1" });
  await assert.rejects(normalizeVideo(mp4), invalid, "ffprobe failed");
  assert.deepEqual((await s.calls()).map((c) => c.tool), ["ffprobe"]);
  // The limits themselves are allowed.
  await s.reset({ FAKE_FFPROBE_JSON: meta({ duration: "60" }, [video(4096, 4096)]), FAKE_FFMPEG_BYTES: "64" });
  assert.equal((await normalizeVideo(mp4)).length, 64);
  assert.deepEqual((await s.calls()).map((c) => c.tool), ["ffprobe", "ffmpeg"]);
  assert.deepEqual(await readdir(s.tmp), []);
});

test("ffmpeg reads the uploaded bytes single-threaded, strips metadata, and its output is capped below 16 MB (#74)", { skip: noShell }, async (t) => {
  const s = await sandbox(t, { fakes: true });
  const ok = meta({ duration: "12.5" }, [video(1920, 1080), { codec_type: "audio" }]);
  await s.reset({ FAKE_FFPROBE_JSON: ok, FAKE_FFMPEG_BYTES: "2048" });
  const out = await normalizeVideo(mp4);
  assert.equal(out.length, 2048, "the caller gets ffmpeg's output");
  const [probe, encode] = await s.calls();
  const input = probe.args.at(-1);
  assert.equal(path.dirname(path.dirname(input)), s.tmp);
  assert.match(path.basename(path.dirname(input)), /^misxv-video-/);
  assert.deepEqual(await readFile(s.log + ".input"), mp4, "ffprobe reads exactly the uploaded bytes");
  assert.deepEqual(probe.args, [
    "-v", "error", "-protocol_whitelist", "file,pipe", "-f", "mov",
    "-show_format", "-show_streams", "-of", "json", input,
  ]);
  const a = encode.args,
    after = (flag) => a[a.indexOf(flag) + 1],
    every = (flag) => a.flatMap((x, i) => (x === flag ? [a[i + 1]] : []));
  assert.equal(a[0], "-nostdin");
  assert.equal(after("-protocol_whitelist"), "file,pipe");
  assert.equal(after("-f"), "mov", "the container is forced, not guessed");
  assert.equal(after("-i"), input);
  assert.deepEqual(every("-threads"), ["1", "1"]);
  assert.deepEqual(every("-map"), ["0:v:0", "0:a:0?"]);
  assert.equal(after("-map_metadata"), "-1", "location and device metadata are dropped");
  assert.equal(after("-map_chapters"), "-1");
  assert.equal(after("-t"), "60");
  assert.equal(after("-fs"), "16000000");
  assert.equal(after("-c:v"), "libx264");
  assert.equal(after("-movflags"), "+faststart");
  assert.equal(a.at(-1), path.join(path.dirname(input), "output.mp4"));
  // Matroska and WebM are read with the matroska demuxer.
  await s.reset({ FAKE_FFPROBE_JSON: ok, FAKE_FFMPEG_BYTES: "16" });
  await normalizeVideo(webm);
  for (const c of await s.calls()) assert.equal(c.args[c.args.indexOf("-f") + 1], "matroska", c.tool);
  // ffmpeg's -fs can overshoot, so the result is checked: one byte under the cap is kept, the cap is refused.
  await s.reset({ FAKE_FFPROBE_JSON: ok, FAKE_FFMPEG_BYTES: "15999999" });
  assert.equal((await normalizeVideo(mp4)).length, 15999999);
  await s.reset({ FAKE_FFPROBE_JSON: ok, FAKE_FFMPEG_BYTES: "16000000" });
  await assert.rejects(normalizeVideo(mp4), invalid, "at the size cap");
  // An ffmpeg failure is reported as an invalid upload, not a crash.
  await s.reset({ FAKE_FFPROBE_JSON: ok, FAKE_FFMPEG_EXIT: "1" });
  await assert.rejects(normalizeVideo(mp4), invalid, "ffmpeg failed");
  assert.deepEqual(await readdir(s.tmp), [], "every attempt removed its temporary directory");
});

test("with the real ffmpeg, a short clip becomes a small H.264 MP4 and a clip over a minute is refused (#74)", { skip: noRealTools }, async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "video-real-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const clip = async (seconds, name) => {
    const file = path.join(dir, name);
    const made = spawnSync("ffmpeg", [
      "-nostdin", "-v", "error", "-f", "lavfi",
      "-i", `testsrc=duration=${seconds}:size=64x48:rate=5`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", file,
    ], { windowsHide: true });
    assert.equal(made.status, 0, String(made.stderr));
    return readFile(file);
  };
  const out = await normalizeVideo(await clip(1, "short.mp4"));
  assert.equal(out.toString("ascii", 4, 8), "ftyp");
  await writeFile(path.join(dir, "out.mp4"), out);
  const probe = spawnSync("ffprobe", [
    "-v", "error", "-show_format", "-show_streams", "-of", "json", path.join(dir, "out.mp4"),
  ], { windowsHide: true });
  const info = JSON.parse(probe.stdout);
  const stream = info.streams.find((x) => x.codec_type === "video");
  assert.equal(stream.codec_name, "h264");
  assert.ok(stream.width <= 1280 && stream.height <= 720);
  assert.ok(Number(info.format.duration) <= 60);
  await assert.rejects(normalizeVideo(await clip(61, "long.mp4")), invalid);
});
