// What guests can share and how it travels, used by the upload page
// (site/media-upload.js) and checked again by the API (server/application.mjs
// and server/http.mjs), so both always state the same limits.
const MB = 1024 * 1024;
export const uploadLimits = {
  // Chosen at once, and per household per day.
  files: 10,
  perDay: 20,
  // A 48-megapixel iPhone photo saved as JPEG is about 15–25 MB.
  photoBytes: 40 * MB,
  // 60 seconds of 1080p from any phone, or of iPhone 4K (about 170 MB).
  videoBytes: 300 * MB,
  videoSeconds: 60,
  // Files travel in pieces of whole 256 KiB units (Cloud Storage's rule),
  // each a separate request well inside Firebase Hosting's 60-second limit.
  unit: 256 * 1024,
  maxPiece: 8 * MB,
};
const photoTypes = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};
const videoTypes = {
  "video/mp4": [".mp4", ".m4v"],
  "video/x-m4v": [".m4v"],
  // iPhone videos (and what Safari hands over from the Photos library).
  "video/quicktime": [".mov"],
  "video/webm": [".webm"],
};
// HEIC/HEIF photos are left out on purpose: the server cannot decode them
// (sharp's prebuilt libvips has no HEVC decoder), and when the list leaves
// them out, Safari's photo picker on iPhone hands over a JPEG instead
// (WebKit asks Photos for its "compatible" representation). ".mov" covers
// browsers that know the extension but not the type.
export const uploadAccept = [
  ...Object.keys(photoTypes),
  ...Object.keys(videoTypes),
  ".mov",
].join(",");
export const uploadTypes = [...Object.keys(photoTypes), ...Object.keys(videoTypes)];
const extension = (name) => /\.[a-z0-9]+$/i.exec(name || "")?.[0].toLowerCase() || "";
// The kind a file is shared as, and the content type sent for it. Some
// browsers give no type (or a generic one) for .mov, so the extension decides.
export function classify(file) {
  const ext = extension(file.name),
    type = (file.type || "").toLowerCase();
  if (/^image\/hei[cf]/.test(type) || [".heic", ".heif"].includes(ext))
    return { kind: null, type, problem: "heic" };
  for (const [kind, types] of [
    ["photo", photoTypes],
    ["video", videoTypes],
  ]) {
    if (types[type]) return { kind, type };
    if ((!type || type === "application/octet-stream") && ext) {
      const found = Object.entries(types).find(([, exts]) => exts.includes(ext));
      if (found) return { kind, type: found[0] };
    }
  }
  return { kind: null, type, problem: "type" };
}
export function createUploadBatch(files) {
  if (!files.length || files.length > uploadLimits.files)
    throw new Error("BATCH_SIZE");
  return Array.from(files, (file) => {
    const { kind, type, problem } = classify(file);
    return {
      file,
      kind,
      type,
      size: file.size,
      sent: 0,
      state: "queued",
      problem:
        problem ||
        (!file.size
          ? "empty"
          : file.size > uploadLimits[kind === "video" ? "videoBytes" : "photoBytes"]
            ? kind + "-size"
            : null),
    };
  });
}
// Server answers that mean "this file, as sent, will never be accepted".
// Everything else (a dropped connection, a busy or restarting server, a
// timeout) is worth another try, and trying again is always safe: the server
// keeps what it received and says where to continue, so no byte is stored
// twice and a finished file is never added twice.
const final = (err) =>
  err.status >= 400 &&
  err.status < 500 &&
  ![408, 409, 429].includes(err.status);
// A limit (429) passes only with time, so quick retries would not help.
const waitForLimit = (err) => err.status === 429;
// Sends the batch one file at a time, in order. `transport` talks to the API:
//   start({ kind, type, size }) -> { id }
//   put(id, offset, blob, onBytes) -> { received, complete, state }
//     (`onBytes(n)` reports bytes of this piece sent so far)
// After a few quick retries a file is "paused" and the batch stops there, so
// a lost connection does not burn through the remaining files; calling
// sendUploadBatch again (the page's Try again button) resumes from what the
// server already has.
export async function sendUploadBatch(
  entries,
  transport,
  changed = () => {},
  {
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    clock = () => Date.now(),
    retries = [1000, 3000, 8000, 15000],
  } = {},
) {
  for (const entry of entries) {
    if (!["queued", "paused"].includes(entry.state)) continue;
    if (entry.problem) {
      entry.state = "invalid";
      changed();
      continue;
    }
    entry.state = "uploading";
    entry.message = "";
    changed();
    const outcome = await sendFile(entry, transport, changed, { sleep, clock, retries });
    changed();
    if (outcome === "paused") break;
  }
}
async function sendFile(entry, transport, changed, { sleep, clock, retries }) {
  let attempt = 0,
    stalled = 0;
  // Pieces start at 2 MiB, double while they go quickly and halve when slow,
  // so a weak connection never runs into the 60-second request limit.
  entry.piece ??= 8 * uploadLimits.unit;
  for (;;) {
    try {
      if (!entry.id) entry.id = (await transport.start(entry)).id;
      for (;;) {
        const end = Math.min(entry.size, entry.sent + entry.piece),
          before = entry.sent,
          started = clock();
        const result = await transport.put(
          entry.id,
          entry.sent,
          entry.file.slice(entry.sent, end),
          (n) => {
            entry.inFlight = n;
            changed();
          },
        );
        entry.inFlight = 0;
        // The server's count is the truth: it may hold more than this piece
        // (an earlier answer was lost) or less (continue from there).
        entry.sent = Math.min(entry.size, result.received);
        if (result.complete) {
          entry.state = result.state === "processing" ? "processing" : "received";
          return entry.state;
        }
        // Progress earns fresh retries; a server that keeps answering without
        // taking bytes uses them up, so the page never loops.
        if (entry.sent > before) attempt = stalled = 0;
        else if (++stalled >= 3)
          throw Object.assign(new Error(entry.message || ""), { status: 503 });
        const took = clock() - started;
        if (took < 5000) entry.piece = Math.min(uploadLimits.maxPiece, entry.piece * 2);
        else if (took > 20000)
          entry.piece = Math.max(uploadLimits.unit, entry.piece / 2);
        changed();
      }
    } catch (err) {
      entry.inFlight = 0;
      entry.message = err.message;
      if (final(err)) {
        entry.state = "rejected";
        return entry.state;
      }
      if (err.timeout) entry.piece = Math.max(uploadLimits.unit, entry.piece / 4);
      if (waitForLimit(err) || attempt >= retries.length) {
        entry.state = "paused";
        return entry.state;
      }
      changed();
      await sleep(retries[attempt++]);
    }
  }
}
// Percent of one file sent, counting the piece in flight.
export const progress = (entry) =>
  entry.size
    ? Math.min(100, Math.floor((100 * (entry.sent + (entry.inFlight || 0))) / entry.size))
    : 0;
