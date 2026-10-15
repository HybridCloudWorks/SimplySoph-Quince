import { spawn } from "node:child_process";
import { mkdtemp, open, rm, stat } from "node:fs/promises";
import { setPriority, tmpdir } from "node:os";
import path from "node:path";
import { error } from "./auth.mjs";
// Guest videos become one format every browser plays: H.264/AAC MP4 with
// "faststart" (playback starts before the whole file arrives), at most 1080p
// (1920 px on the long side, 1080 on the short) and 30 frames a second. An
// iPhone's HEVC .mov otherwise plays only in Safari. Location and device
// metadata are dropped; the original is never served.
//
// Converting is slow on the API's single vCPU (a 60-second 4K clip takes a few
// minutes), so it never runs inside a guest's request: the scheduled media job
// (POST /api/internal/media) converts one video at a time from a file on the
// instance's disk. On Cloud Run that disk is memory, which docs/deployment.md
// accounts for.
export const VIDEO_SECONDS = 60;
// Phones show a clip of 60.0–60.9 seconds as 1:00, so those pass and are cut to 60.
const LONGEST = VIDEO_SECONDS + 1;
// The converted file: bitrate-capped CRF, so 60 s stays under about 50 MB.
const OUTPUT_LIMIT = 80_000_000;
// What ffprobe and ffmpeg may decode from a guest's file. ffprobe reports only
// the first frame's size and the container chooses the codec, so a 3 MB MOV of
// PNG frames, the first 64×64 and the next 16000×16000, passed the checks below
// and took ffmpeg past 2 GB, the whole instance (a 16000×16000 first frame did
// the same to ffprobe). Every frame is now held to 4096×2176 pixels (DCI 4K
// and UHD either way up: ffmpeg pads a frame's width to 64 before checking)
// and the decoders to what phones record; anything else fails before a frame
// is decoded. The names are ffmpeg's decoders, not codecs: MP3 is read by
// mp3float, AV1 by libdav1d (ffmpeg's own av1 decoder needs a GPU).
const DECODE_LIMITS = [
  "-max_pixels",
  String(4096 * 2176),
  "-codec_whitelist",
  [
    // H.264 and HEVC (every phone; iPhones use HEVC), VP8/VP9/AV1 (WebM and
    // newer Android), MPEG-4 Part 2 (older Android), ProRes (iPhone Pro).
    "h264",
    "hevc",
    "vp8",
    "vp9",
    "libdav1d",
    "libaom-av1",
    "mpeg4",
    "prores",
    // AAC (nearly all), Opus and Vorbis (WebM), ALAC and PCM (iPhone and
    // screen recordings), AMR (older Android), MP3.
    "aac",
    "opus",
    "vorbis",
    "alac",
    "pcm_s16le",
    "pcm_s16be",
    "pcm_s24le",
    "pcm_s24be",
    "amrnb",
    "amrwb",
    "mp3float",
    "mp3",
    // Text captions an editing app may add. ffmpeg never reads them, but
    // ffprobe opens every stream it can decode and refuses the file if one is
    // not on this list. Data tracks (iPhone and Pixel metadata, timecode) have
    // no decoder at all, so they need no name here.
    "mov_text",
    "webvtt",
  ].join(","),
];
// ffprobe's answer for a phone video is a few KB.
const PROBE_ANSWER = 1_000_000;
// An instance converts one video at a time: it has one vCPU, and the original
// waits in /tmp, which is memory. The media job takes this slot before it
// claims or downloads a video, holds it for the whole run and passes it to
// convertVideo; called on its own, convertVideo takes the slot itself.
// Returns null while another conversion holds it.
let busy = false;
export function conversionSlot() {
  if (busy) return null;
  busy = true;
  let held = true;
  return {
    get held() {
      return held;
    },
    // Only once: a second release must not free a slot someone else now holds.
    release() {
      if (!held) return;
      held = false;
      busy = false;
    },
  };
}
// Runs ffprobe/ffmpeg below the API's own priority, so pages, uploads and
// sign-ins on the same instance stay responsive while a video converts.
// Their log (stderr) is never read: ffmpeg logs a line for every damaged
// frame, and a phone video with thousands of them still converts (the log
// used to share a 200 KB buffer with ffprobe's answer, and overflowing it
// refused the video as unreadable). Only ffprobe's answer, on stdout, is
// kept, up to `keep` bytes; ffmpeg writes to files.
function run(tool, args, timeout, keep = 0) {
  return new Promise((resolve, reject) => {
    const child = spawn(tool, args, {
        stdio: ["ignore", keep ? "pipe" : "ignore", "ignore"],
        windowsHide: true,
      }),
      chunks = [];
    let size = 0,
      failure = null;
    const stop = (reason) => {
      failure ??= reason;
      child.kill("SIGKILL");
      child.stdout?.destroy();
    };
    // Over its time budget: too heavy for this run, not the guest's fault.
    const timer = setTimeout(() => stop(error(503, "VIDEO_TIMEOUT")), timeout);
    // A longer answer is this server's limit, not proof the file is bad.
    child.stdout?.on("data", (chunk) => {
      size += chunk.length;
      if (size > keep) stop(error(503, "VIDEO_PROBE_TOO_LARGE"));
      else chunks.push(chunk);
    });
    // No such program (ENOENT); "close" follows.
    child.on("error", (e) => (failure ??= e));
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`${tool} ended with ${code ?? signal}`));
      else resolve(Buffer.concat(chunks).toString());
    });
    try {
      setPriority(child.pid, 10);
    } catch {
      // Not started (no such program), or the platform refuses: run as is.
    }
  });
}
// The container decides the demuxer, so ffmpeg never guesses one from the bytes.
async function containerOf(file) {
  const handle = await open(file, "r");
  try {
    const head = Buffer.alloc(12);
    await handle.read(head, 0, 12, 0);
    // An HEIC/HEIF photo is also an "ftyp" file, but not a video.
    if (
      head.toString("ascii", 4, 8) === "ftyp" &&
      !/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1|avif)$/.test(
        head.toString("ascii", 8, 12),
      )
    )
      return "mov";
    if (head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))
      return "matroska";
    return null;
  } finally {
    await handle.close();
  }
}
// Converts the original at `input` (a file in `directory`, which belongs to
// the caller) into directory/output.mp4 and, when it can, a poster frame
// directory/poster.jpg. Refusals that are about the guest's file are 422
// (VIDEO_TOO_LONG, INVALID_VIDEO); a missing ffmpeg, a busy instance, an
// ffprobe answer over 1 MB or a conversion over its time budget are 503 and
// can be tried again.
// The default time budget fits the worst accepted file on one vCPU: 300 MB
// of 4K HEVC (measured about 3 minutes for 60 s of 10-bit 4K, most of it
// decoding) with room to spare; docs/deployment.md sets the request timeout.
// `slot` is the caller's conversionSlot(), when it already holds one.
export async function convertVideo(
  input,
  directory,
  { timeoutMs = 420000, slot = null } = {},
) {
  const format = await containerOf(input).catch(() => null);
  if (!format) throw error(422, "INVALID_VIDEO");
  const own = slot?.held ? null : conversionSlot();
  if (!own && !slot?.held) throw error(503, "VIDEO_BUSY");
  const output = path.join(directory, "output.mp4"),
    poster = path.join(directory, "poster.jpg");
  try {
    const metadata = JSON.parse(
      await run(
        "ffprobe",
        [
          "-v",
          "error",
          ...DECODE_LIMITS,
          "-protocol_whitelist",
          "file,pipe",
          "-f",
          format,
          "-show_format",
          "-show_streams",
          "-of",
          "json",
          input,
        ],
        15000,
        PROBE_ANSWER,
      ),
    );
    const video = metadata.streams?.find((s) => s.codec_type === "video"),
      duration = Number(metadata.format?.duration);
    if (
      !video ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      // A stream that does not report its size cannot be checked (#95).
      !Number.isInteger(video.width) ||
      !Number.isInteger(video.height) ||
      video.width < 1 ||
      video.height < 1 ||
      video.width > 4096 ||
      video.height > 4096
    )
      throw error(422, "INVALID_VIDEO");
    if (duration >= LONGEST) throw error(422, "VIDEO_TOO_LONG");
    await run(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-threads",
        "1",
        ...DECODE_LIMITS,
        "-protocol_whitelist",
        "file,pipe",
        "-f",
        format,
        "-i",
        input,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-map_metadata",
        "-1",
        "-map_chapters",
        "-1",
        "-t",
        String(VIDEO_SECONDS),
        // Fits a 1920×1080 box turned to the video's own orientation (phones
        // film portrait), never enlarges, and keeps even sides for H.264.
        // ffmpeg has already applied the phone's rotation flag here.
        "-vf",
        "scale=w='if(gte(iw,ih),min(1920,iw),min(1080,iw))':h='if(gte(iw,ih),min(1080,ih),min(1920,ih))':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
        "-fpsmax",
        "30",
        "-c:v",
        "libx264",
        "-threads",
        "1",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-maxrate",
        "6M",
        "-bufsize",
        "12M",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        "-fs",
        String(OUTPUT_LIMIT),
        "-y",
        output,
      ],
      timeoutMs,
    );
    if ((await stat(output)).size >= OUTPUT_LIMIT) throw error(422, "INVALID_VIDEO");
    let still = poster;
    try {
      await run(
        "ffmpeg",
        [
          "-nostdin",
          "-v",
          "error",
          "-threads",
          "1",
          // Its own H.264 output, read with the same limits anyway.
          ...DECODE_LIMITS,
          "-protocol_whitelist",
          "file,pipe",
          "-ss",
          String(Math.min(1, duration / 3)),
          "-i",
          output,
          "-frames:v",
          "1",
          "-vf",
          "scale=w='if(gte(iw,ih),min(1280,iw),-1)':h='if(gte(iw,ih),-1,min(1280,ih))'",
          "-q:v",
          "3",
          "-y",
          poster,
        ],
        30000,
      );
      if (!(await stat(poster)).size) still = null;
    } catch {
      // The video still plays; the gallery shows it without a poster.
      still = null;
    }
    return {
      video: output,
      poster: still,
      duration: Math.min(duration, VIDEO_SECONDS),
    };
  } catch (e) {
    if (e.code === "ENOENT") throw error(503, "VIDEO_UNAVAILABLE");
    // Already decided: the file is refused (VIDEO_TOO_LONG, INVALID_VIDEO), or
    // this run cannot finish it (VIDEO_TIMEOUT, VIDEO_PROBE_TOO_LARGE).
    if (e.status) throw e;
    throw error(422, "INVALID_VIDEO");
  } finally {
    own?.release();
  }
}
// A private working directory for one conversion, always removed afterwards
// (it holds the guest's original and counts against the instance's memory).
export async function withVideoDirectory(work) {
  const directory = await mkdtemp(path.join(tmpdir(), "misxv-video-"));
  try {
    return await work(directory);
  } finally {
    if (
      path.dirname(path.resolve(directory)) === path.resolve(tmpdir()) &&
      path.basename(directory).startsWith("misxv-video-")
    )
      await rm(directory, { recursive: true, force: true });
  }
}
// One stored photo, poster or video, or the byte range a player asked for.
// Bytes are streamed from storage (`open(start, end)`), so a video is never
// held in memory whole, however many guests are watching.
export async function mediaResponse(size, open, kind, range, download, id) {
  const video = kind === "video",
    contentType = video ? "video/mp4" : "image/jpeg";
  const disposition = `${download ? "attachment" : "inline"}; filename="sophia-${id}${kind === "poster" ? "-poster" : ""}.${video ? "mp4" : "jpg"}"`;
  if (!range)
    return {
      stream: size ? await open(0, size - 1) : null,
      length: size,
      contentType,
      disposition,
      acceptRanges: true,
    };
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) throw error(416, "INVALID_RANGE");
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end =
    match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start > end ||
    start >= size
  )
    throw error(416, "INVALID_RANGE");
  return {
    stream: await open(start, end),
    length: end - start + 1,
    contentType,
    disposition,
    acceptRanges: true,
    status: 206,
    contentRange: `bytes ${start}-${end}/${size}`,
  };
}
