import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { convertVideo, withVideoDirectory, mediaResponse } from "../server/video.mjs";

// Video conversion (#74). CI does not install ffmpeg (the production image
// does), so most tests decide which ffprobe and ffmpeg the code finds on PATH:
// none at all, or two small fake programs that print chosen metadata, write an
// output of a chosen size and record their arguments. They prove how the code
// treats ffprobe's answer and what it asks ffmpeg to do, not that ffmpeg
// converts correctly; the last tests use the real tools when installed.
const installed = (tool) =>
  !spawnSync(tool, ["-version"], { stdio: "ignore", windowsHide: true }).error;
const realTools = installed("ffmpeg") && installed("ffprobe");
const posix = process.platform !== "win32";
const noRealTools = !realTools && "ffmpeg/ffprobe are not installed here (CI does not install them; the production image does)";
const noShell = !posix && "the fake ffprobe/ffmpeg are POSIX shell scripts, which execFile cannot run on Windows";

const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(20)]);
const mov = Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from("ftypqt  "), Buffer.alloc(20)]);
const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(28)]);

const fakeVars = ["FAKE_VIDEO_LOG", "FAKE_FFPROBE_JSON", "FAKE_FFPROBE_EXIT", "FAKE_FFPROBE_SLEEP", "FAKE_FFMPEG_BYTES", "FAKE_FFMPEG_EXIT", "FAKE_FFMPEG_SLEEP", "FAKE_POSTER_EXIT"];
const fakeFfprobe = `#!/bin/sh
{ echo ffprobe; for a in "$@"; do printf '%s\\n' "$a"; done; echo --end; } >> "$FAKE_VIDEO_LOG"
for last in "$@"; do :; done
cp "$last" "$FAKE_VIDEO_LOG.input"
if [ -n "$FAKE_FFPROBE_SLEEP" ]; then sleep "$FAKE_FFPROBE_SLEEP"; fi
if [ -n "$FAKE_FFPROBE_EXIT" ]; then exit "$FAKE_FFPROBE_EXIT"; fi
printf '%s' "$FAKE_FFPROBE_JSON"
`;
// The conversion writes output.mp4 and the poster call poster.jpg.
const fakeFfmpeg = `#!/bin/sh
{ echo ffmpeg; for a in "$@"; do printf '%s\\n' "$a"; done; echo --end; } >> "$FAKE_VIDEO_LOG"
for last in "$@"; do :; done
case "$last" in
  *.jpg) if [ -n "$FAKE_POSTER_EXIT" ]; then exit "$FAKE_POSTER_EXIT"; fi; head -c 100 /dev/zero > "$last"; exit 0 ;;
esac
if [ -n "$FAKE_FFMPEG_SLEEP" ]; then sleep "$FAKE_FFMPEG_SLEEP"; fi
if [ -n "$FAKE_FFMPEG_EXIT" ]; then exit "$FAKE_FFMPEG_EXIT"; fi
head -c "$FAKE_FFMPEG_BYTES" /dev/zero > "$last"
`;

// Gives one test its own temporary directory (where conversions work) and
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
  // The fakes are shell scripts: keep /bin for sh, cp, head and sleep.
  process.env.PATH = fakes ? bin + path.delimiter + saved.PATH : bin;
  for (const name of ["TMPDIR", "TEMP", "TMP"]) process.env[name] = tmp;
  let n = 0;
  return {
    tmp,
    log,
    // Converts `bytes` the way the media job does: the original saved as a
    // file in a fresh working directory, removed afterwards.
    convert(bytes, options) {
      return withVideoDirectory(async (dir) => {
        const input = path.join(dir, "input" + n++);
        await writeFile(input, bytes);
        const out = await convertVideo(input, dir, options);
        return {
          ...out,
          videoBytes: (await stat(out.video)).size,
          posterBytes: out.poster ? (await stat(out.poster)).size : null,
          dir,
          input,
        };
      });
    },
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
const tooLong = (e) => e.status === 422 && e.code === "VIDEO_TOO_LONG";
const unavailable = (e) => e.status === 503 && e.code === "VIDEO_UNAVAILABLE";
const meta = (format, streams) => JSON.stringify({ format, streams });
const video = (width, height) => ({ codec_type: "video", width, height });
// What every ffprobe and ffmpeg run may decode: frames of at most 4096×2176
// pixels and the decoders for what phones record.
const phoneDecoders = [
  "h264", "hevc", "vp8", "vp9", "libdav1d", "libaom-av1", "mpeg4", "prores",
  "aac", "opus", "vorbis", "alac", "pcm_s16le", "pcm_s16be", "pcm_s24le", "pcm_s24be",
  "amrnb", "amrwb", "mp3float", "mp3", "mov_text", "webvtt",
];
const decodeLimits = ["-max_pixels", "8912896", "-codec_whitelist", phoneDecoders.join(",")];

test("only MP4/MOV and Matroska/WebM files get past the format check; without ffprobe the server answers 503 (#74)", async (t) => {
  const s = await sandbox(t);
  const refused = {
    empty: Buffer.alloc(0),
    html: Buffer.from("<script>bad</script>"),
    jpeg: Buffer.from("ffd8ffe000104a4649460001", "hex"),
    png: Buffer.from("89504e470d0a1a0a0000000d", "hex"),
    gif: Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00"),
    avi: Buffer.from("RIFF\x00\x00\x00\x00AVI LIST"),
    // An iPhone photo is an "ftyp" file too, but not a video.
    heic: Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic"), Buffer.alloc(20)]),
    "ftyp at the wrong offset": Buffer.from("ftypisom\x00\x00\x00\x00"),
    "truncated Matroska magic": Buffer.from([0x1a, 0x45, 0xdf]),
  };
  for (const [name, bytes] of Object.entries(refused))
    await assert.rejects(s.convert(bytes), invalid, name);
  // Accepted headers go on to ffprobe, which this PATH does not have: a
  // server problem (503), not the guest's upload (422).
  for (const [name, bytes] of Object.entries({ mp4, mov, webm }))
    await assert.rejects(s.convert(bytes), unavailable, name);
  assert.deepEqual(await readdir(s.tmp), [], "every working directory is removed after a failure");
});

test("one video is converted at a time, and a failure releases the guard (#74)", { skip: noShell }, async (t) => {
  const s = await sandbox(t, { fakes: true });
  await s.reset({ FAKE_FFPROBE_SLEEP: "0.3", FAKE_FFPROBE_EXIT: "1" });
  const first = assert.rejects(s.convert(mp4), invalid);
  await new Promise((r) => setTimeout(r, 100));
  await assert.rejects(s.convert(webm), (e) => e.status === 503 && e.code === "VIDEO_BUSY");
  await first;
  await s.reset({ FAKE_FFPROBE_EXIT: "1" });
  await assert.rejects(s.convert(mp4), invalid, "the next video is not told the server is busy");
  assert.deepEqual(await readdir(s.tmp), []);
});

test("ffprobe must report a video stream, under 61 seconds and at most 4096 px before ffmpeg runs (#74)", { skip: noShell }, async (t) => {
  const s = await sandbox(t, { fakes: true });
  const refused = {
    "no video stream": meta({ duration: "5" }, [{ codec_type: "audio" }]),
    "zero length": meta({ duration: "0" }, [video(640, 360)]),
    "unknown length": meta({ duration: "N/A" }, [video(640, 360)]),
    "no format section": meta(undefined, [video(640, 360)]),
    "too wide (8K)": meta({ duration: "5" }, [video(7680, 4320)]),
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
    await assert.rejects(s.convert(mp4), invalid, name);
    assert.deepEqual((await s.calls()).map((c) => c.tool), ["ffprobe"], `${name}: ffmpeg never runs`);
  }
  // Over a minute has its own answer, so the guest can be told to trim it.
  for (const duration of ["61", "61.2", "3600"]) {
    await s.reset({ FAKE_FFPROBE_JSON: meta({ duration }, [video(1920, 1080)]) });
    await assert.rejects(s.convert(mp4), tooLong, duration);
    assert.deepEqual((await s.calls()).map((c) => c.tool), ["ffprobe"]);
  }
  // A file ffprobe cannot read is the upload's fault too.
  await s.reset({ FAKE_FFPROBE_EXIT: "1" });
  await assert.rejects(s.convert(mp4), invalid, "ffprobe failed");
  assert.deepEqual((await s.calls()).map((c) => c.tool), ["ffprobe"]);
  // The limits themselves are allowed: phones show 60.9 s as 1:00, so it is
  // cut to 60 s instead of refused; 4096 px (DCI 4K) passes.
  await s.reset({ FAKE_FFPROBE_JSON: meta({ duration: "60.9" }, [video(4096, 2160)]), FAKE_FFMPEG_BYTES: "64" });
  const out = await s.convert(mp4);
  assert.equal(out.videoBytes, 64);
  assert.equal(out.duration, 60);
  assert.deepEqual((await s.calls()).map((c) => c.tool), ["ffprobe", "ffmpeg", "ffmpeg"], "convert, then the poster");
  assert.deepEqual(await readdir(s.tmp), []);
});

test("ffmpeg reads the original single-threaded, keeps at most 1080p and 30 fps, strips metadata, and caps the output (#74)", { skip: noShell }, async (t) => {
  const s = await sandbox(t, { fakes: true });
  const ok = meta({ duration: "12.5" }, [video(3840, 2160), { codec_type: "audio" }]);
  await s.reset({ FAKE_FFPROBE_JSON: ok, FAKE_FFMPEG_BYTES: "2048" });
  const out = await s.convert(mov);
  assert.equal(out.videoBytes, 2048, "the caller gets ffmpeg's output");
  assert.equal(out.posterBytes, 100, "and a poster frame");
  assert.equal(out.video, path.join(out.dir, "output.mp4"));
  assert.equal(out.poster, path.join(out.dir, "poster.jpg"));
  const [probe, encode, poster] = await s.calls();
  assert.deepEqual(await readFile(s.log + ".input"), mov, "ffprobe reads exactly the uploaded bytes");
  assert.deepEqual(probe.args, [
    "-v", "error", ...decodeLimits, "-protocol_whitelist", "file,pipe", "-f", "mov",
    "-show_format", "-show_streams", "-of", "json", out.input,
  ]);
  const a = encode.args,
    after = (flag) => a[a.indexOf(flag) + 1],
    every = (flag) => a.flatMap((x, i) => (x === flag ? [a[i + 1]] : []));
  assert.equal(a[0], "-nostdin");
  assert.equal(after("-protocol_whitelist"), "file,pipe");
  assert.equal(after("-f"), "mov", "the container is forced, not guessed");
  assert.equal(after("-i"), out.input);
  assert.deepEqual(every("-threads"), ["1", "1"]);
  assert.deepEqual(every("-map"), ["0:v:0", "0:a:0?"]);
  assert.equal(after("-map_metadata"), "-1", "location and device metadata are dropped");
  assert.equal(after("-map_chapters"), "-1");
  assert.equal(after("-t"), "60");
  assert.match(after("-vf"), /min\(1920,iw\).*min\(1080,ih\).*force_original_aspect_ratio=decrease/);
  assert.equal(after("-fpsmax"), "30");
  assert.equal(after("-c:v"), "libx264");
  assert.equal(after("-pix_fmt"), "yuv420p");
  assert.equal(after("-c:a"), "aac");
  assert.equal(after("-maxrate"), "6M");
  assert.equal(after("-movflags"), "+faststart");
  assert.equal(after("-fs"), "80000000");
  assert.equal(a.at(-1), out.video);
  // The poster is taken from the converted file, not the guest's original.
  assert.equal(poster.args[poster.args.indexOf("-i") + 1], out.video);
  assert.equal(poster.args[poster.args.indexOf("-frames:v") + 1], "1");
  assert.equal(poster.args.at(-1), out.poster);
  // Matroska and WebM are read with the matroska demuxer.
  await s.reset({ FAKE_FFPROBE_JSON: ok, FAKE_FFMPEG_BYTES: "16" });
  await s.convert(webm);
  for (const c of (await s.calls()).slice(0, 2)) assert.equal(c.args[c.args.indexOf("-f") + 1], "matroska", c.tool);
  // ffmpeg's -fs can overshoot, so the result is checked: one byte under the cap is kept, the cap is refused.
  await s.reset({ FAKE_FFPROBE_JSON: ok, FAKE_FFMPEG_BYTES: "79999999" });
  assert.equal((await s.convert(mp4)).videoBytes, 79999999);
  await s.reset({ FAKE_FFPROBE_JSON: ok, FAKE_FFMPEG_BYTES: "80000000" });
  await assert.rejects(s.convert(mp4), invalid, "at the size cap");
  // An ffmpeg failure is the file's fault; a missing poster is not a failure.
  await s.reset({ FAKE_FFPROBE_JSON: ok, FAKE_FFMPEG_EXIT: "1" });
  await assert.rejects(s.convert(mp4), invalid, "ffmpeg failed");
  await s.reset({ FAKE_FFPROBE_JSON: ok, FAKE_FFMPEG_BYTES: "16", FAKE_POSTER_EXIT: "1" });
  const plain = await s.convert(mp4);
  assert.equal(plain.poster, null);
  assert.equal(plain.videoBytes, 16);
  // Running past the time budget is the server's limit, not the guest's file:
  // a 503 the media job tries again later.
  await s.reset({ FAKE_FFPROBE_JSON: ok, FAKE_FFMPEG_BYTES: "16", FAKE_FFMPEG_SLEEP: "2" });
  await assert.rejects(s.convert(mp4, { timeoutMs: 200 }), (e) => e.status === 503 && e.code === "VIDEO_TIMEOUT");
  assert.deepEqual(await readdir(s.tmp), [], "every conversion removed its working directory");
});

test("ffprobe and both ffmpeg runs decode only phone codecs and frames of at most 4096×2176 pixels", { skip: noShell }, async (t) => {
  // ffprobe sees only the first frame's size, and the container picks the
  // codec: a 3 MB MOV of PNG frames growing to 16000×16000 took ffmpeg past
  // 2 GB (the whole instance) before these limits.
  const s = await sandbox(t, { fakes: true });
  await s.reset({ FAKE_FFPROBE_JSON: meta({ duration: "3" }, [video(64, 64)]), FAKE_FFMPEG_BYTES: "16" });
  const out = await s.convert(mov);
  const calls = await s.calls();
  assert.deepEqual(calls.map((c) => c.tool), ["ffprobe", "ffmpeg", "ffmpeg"]);
  for (const [i, { tool, args }] of calls.entries()) {
    const read = i === 2 ? out.video : out.input,
      // Input options: they must come before the file they apply to.
      at = tool === "ffprobe" ? args.lastIndexOf(read) : args.indexOf("-i");
    assert.equal(args[at + (tool === "ffprobe" ? 0 : 1)], read, `${tool} #${i} reads ${read}`);
    const limit = args.indexOf("-max_pixels"),
      allowed = args.indexOf("-codec_whitelist");
    assert.ok(limit >= 0 && limit < at, `${tool} #${i}: -max_pixels before its input`);
    assert.ok(allowed >= 0 && allowed < at, `${tool} #${i}: -codec_whitelist before its input`);
    // DCI 4K (4096×2160) and UHD fit either way up: ffmpeg pads a frame's
    // width to 64 before checking, so portrait DCI 4K counts as 2176×4096.
    assert.equal(Number(args[limit + 1]), 4096 * 2176);
    assert.deepEqual(args[allowed + 1].split(","), phoneDecoders, `${tool} #${i}`);
    for (const codec of ["png", "tiff", "mjpeg", "gif", "exr", "dxv"])
      assert.ok(!args[allowed + 1].split(",").includes(codec), `${tool} #${i} never decodes ${codec}`);
  }
});

test("stored media is served whole or as one byte range, streamed rather than held in memory", async () => {
  const bytes = Buffer.from("0123456789"),
    opened = [];
  const open = async (start, end) => {
    opened.push([start, end]);
    return Readable.from([bytes.subarray(start, end + 1)]);
  };
  const text = async (r) => Buffer.concat(await r.stream.toArray()).toString();
  const part = await mediaResponse(10, open, "video", "bytes=2-5", false, "fixture");
  assert.equal(part.status, 206);
  assert.equal(part.length, 4);
  assert.equal(await text(part), "2345");
  assert.equal(part.contentRange, "bytes 2-5/10");
  assert.equal(part.contentType, "video/mp4");
  assert.equal(await text(await mediaResponse(10, open, "video", "bytes=-3", true, "fixture")), "789");
  assert.equal(await text(await mediaResponse(10, open, "video", "bytes=7-", false, "fixture")), "789");
  const whole = await mediaResponse(10, open, "photo", null, true, "fixture");
  assert.equal(whole.length, 10);
  assert.equal(whole.status, undefined);
  assert.match(whole.disposition, /^attachment; filename="sophia-fixture\.jpg"$/);
  assert.match(
    (await mediaResponse(10, open, "poster", null, false, "fixture")).disposition,
    /^inline; filename="sophia-fixture-poster\.jpg"$/,
  );
  assert.deepEqual(opened, [[2, 5], [7, 9], [7, 9], [0, 9], [0, 9]]);
  for (const range of ["bytes=99-", "bytes=4-2", "bytes=0-1,3-4", "bytes=-0", "items=0-1"])
    await assert.rejects(
      mediaResponse(10, open, "video", range, false, "fixture"),
      (e) => e.code === "INVALID_RANGE",
      range,
    );
  assert.equal(opened.length, 5, "a refused range opens nothing");
});

// Small clips made by the real ffmpeg, shaped like what phones send.
async function clip(dir, name, args) {
  const file = path.join(dir, name);
  const made = spawnSync("ffmpeg", ["-nostdin", "-v", "error", ...args, "-y", file], { windowsHide: true });
  assert.equal(made.status, 0, String(made.stderr));
  return readFile(file);
}
const probe = (file) =>
  JSON.parse(
    spawnSync("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", file], { windowsHide: true }).stdout,
  );

test("with the real ffmpeg, a portrait phone clip becomes an upright H.264/AAC MP4 with a poster and no location (#74)", { skip: noRealTools }, async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "video-real-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  // Stored landscape with a 90° rotation flag and a location tag, like an
  // iPhone or Android camera recording held upright.
  await clip(dir, "landscape.mp4", [
    "-f", "lavfi", "-i", "testsrc=duration=2:size=160x90:rate=15",
    "-f", "lavfi", "-i", "sine=duration=2",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
    "-metadata", "location=+19.4326-099.1332/",
  ]);
  const phone = await clip(dir, "phone.mov", [
    "-display_rotation:v", "90", "-i", path.join(dir, "landscape.mp4"),
    "-c", "copy", "-f", "mov",
  ]);
  const out = await withVideoDirectory(async (work) => {
    const input = path.join(work, "input");
    await writeFile(input, phone);
    const r = await convertVideo(input, work);
    await writeFile(path.join(dir, "out.mp4"), await readFile(r.video));
    await writeFile(path.join(dir, "poster.jpg"), await readFile(r.poster));
    return r;
  });
  assert.ok(out.duration > 1.5 && out.duration <= 60);
  const info = probe(path.join(dir, "out.mp4"));
  const v = info.streams.find((x) => x.codec_type === "video"),
    a = info.streams.find((x) => x.codec_type === "audio");
  assert.equal(v.codec_name, "h264");
  assert.equal(v.pix_fmt, "yuv420p");
  assert.deepEqual([v.width, v.height], [90, 160], "turned upright, no rotation flag left to honour");
  assert.ok(!(v.side_data_list || []).some((d) => d.rotation), "no rotation flag");
  assert.equal(a.codec_name, "aac");
  assert.ok(!JSON.stringify(info.format.tags || {}).includes("19.4326"), "location removed");
  const still = await readFile(path.join(dir, "poster.jpg"));
  assert.equal(still[0], 0xff, "the poster is a JPEG");
});

test("with the real ffmpeg, an iPhone-style HEVC .mov plays everywhere afterwards, and a clip over a minute is refused (#74)", { skip: noRealTools }, async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "video-real-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const hevc = spawnSync("ffmpeg", ["-hide_banner", "-encoders"], { windowsHide: true }).stdout.toString().includes("libx265");
  if (hevc) {
    const mov = await clip(dir, "iphone.mov", [
      "-f", "lavfi", "-i", "testsrc=duration=1:size=128x72:rate=10",
      "-c:v", "libx265", "-x265-params", "log-level=error", "-tag:v", "hvc1", "-pix_fmt", "yuv420p", "-f", "mov",
    ]);
    const codec = await withVideoDirectory(async (work) => {
      const input = path.join(work, "input");
      await writeFile(input, mov);
      return probe((await convertVideo(input, work)).video).streams[0].codec_name;
    });
    assert.equal(codec, "h264");
  } else t.diagnostic("libx265 is not installed: the HEVC case was not exercised");
  const long = await clip(dir, "long.mp4", [
    "-f", "lavfi", "-i", "testsrc=duration=62:size=32x24:rate=2",
    "-c:v", "libx264", "-pix_fmt", "yuv420p",
  ]);
  await assert.rejects(
    withVideoDirectory(async (work) => {
      const input = path.join(work, "input");
      await writeFile(input, long);
      return convertVideo(input, work);
    }),
    tooLong,
  );
});

test("with the real ffmpeg, PNG frames in a MOV and a frame over 4096×2176 pixels are refused, and portrait DCI 4K still converts", { skip: noRealTools }, async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "video-real-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const convert = (bytes) =>
    withVideoDirectory(async (work) => {
      const input = path.join(work, "input");
      await writeFile(input, bytes);
      return probe((await convertVideo(input, work)).video).streams[0];
    });
  // The shape that took the instance down, kept small here: a MOV whose PNG
  // frames start at 64×64 (all ffprobe looks at) and then grow.
  await clip(dir, "frame1.png", ["-f", "lavfi", "-i", "color=c=black:s=64x64", "-frames:v", "1"]);
  await clip(dir, "frame2.png", ["-f", "lavfi", "-i", "color=c=black:s=3008x3008", "-frames:v", "1"]);
  const frames = await clip(dir, "frames.mov", ["-framerate", "1", "-i", path.join(dir, "frame%d.png"), "-c:v", "copy", "-f", "mov"]);
  await assert.rejects(convert(frames), invalid, "PNG is not a codec phones record");
  // H.264, but each frame 4096×2304: inside 4096 px a side, over the pixel limit.
  const wide = await clip(dir, "wide.mp4", [
    "-f", "lavfi", "-i", "color=c=gray:s=4096x2304:d=0.2:r=10",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
  ]);
  await assert.rejects(convert(wide), invalid, "over 4096×2176 pixels a frame");
  // DCI 4K filmed upright is the largest frame allowed.
  const upright = await clip(dir, "upright.mp4", [
    "-f", "lavfi", "-i", "color=c=gray:s=2160x4096:d=0.2:r=10",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
  ]);
  const v = await convert(upright);
  assert.deepEqual([v.codec_name, v.width, v.height], ["h264", 1012, 1920]);
});
