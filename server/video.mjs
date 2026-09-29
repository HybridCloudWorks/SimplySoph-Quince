import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { error } from "./auth.mjs";
const exec = promisify(execFile);
let busy = false;
// Bound memory/CPU on the small event service. Originals never become gallery objects.
export async function normalizeVideo(bytes) {
  const format =
    bytes.toString("ascii", 4, 8) === "ftyp"
      ? "mov"
      : bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
        ? "matroska"
        : null;
  if (!format) throw error(422, "INVALID_VIDEO");
  if (busy) throw error(503, "VIDEO_BUSY");
  busy = true;
  let directory;
  try {
    directory = await mkdtemp(path.join(tmpdir(), "misxv-video-"));
    const input = path.join(directory, "input"),
      output = path.join(directory, "output.mp4");
    await writeFile(input, bytes, { flag: "wx" });
    const { stdout } = await exec(
      "ffprobe",
      [
        "-v",
        "error",
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
      { timeout: 15000, maxBuffer: 200000, windowsHide: true },
    );
    const metadata = JSON.parse(stdout),
      video = metadata.streams?.find((s) => s.codec_type === "video"),
      duration = Number(metadata.format?.duration);
    if (
      !video ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 60 ||
      video.width < 1 ||
      video.height < 1 ||
      video.width > 4096 ||
      video.height > 4096
    )
      throw error(422, "INVALID_VIDEO");
    await exec(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-threads",
        "1",
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
        "60",
        "-vf",
        "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
        "-c:v",
        "libx264",
        "-threads",
        "1",
        "-preset",
        "veryfast",
        "-crf",
        "26",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "30",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-movflags",
        "+faststart",
        "-fs",
        "16000000",
        "-y",
        output,
      ],
      { timeout: 90000, maxBuffer: 200000, windowsHide: true },
    );
    const normalized = await readFile(output);
    if (normalized.length >= 16000000) throw error(422, "INVALID_VIDEO");
    return normalized;
  } catch (e) {
    if (e.code === "ENOENT") throw error(503, "VIDEO_UNAVAILABLE");
    if (e.status) throw e;
    throw error(422, "INVALID_VIDEO");
  } finally {
    busy = false;
    if (
      directory &&
      path.dirname(path.resolve(directory)) === path.resolve(tmpdir()) &&
      path.basename(directory).startsWith("misxv-video-")
    )
      await rm(directory, { recursive: true, force: true });
  }
}
export function mediaResponse(bytes, kind, range, download, id) {
  const video = kind === "video",
    contentType = video ? "video/mp4" : "image/jpeg";
  const disposition = `${download ? "attachment" : "inline"}; filename="sophia-${id}.${video ? "mp4" : "jpg"}"`;
  if (!range)
    return { binary: bytes, contentType, disposition, acceptRanges: true };
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) throw error(416, "INVALID_RANGE");
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, bytes.length - Number(match[2]));
  const end =
    match[1] && match[2]
      ? Math.min(bytes.length - 1, Number(match[2]))
      : bytes.length - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start > end ||
    start >= bytes.length
  )
    throw error(416, "INVALID_RANGE");
  return {
    binary: bytes.subarray(start, end + 1),
    contentType,
    disposition,
    acceptRanges: true,
    status: 206,
    contentRange: `bytes ${start}-${end}/${bytes.length}`,
  };
}
