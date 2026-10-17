// What guests can share and how it travels, used by the upload page
// (site/media-upload.js) and checked again by the API (server/application.mjs
// and server/http.mjs), so both always state the same limits. How many may be
// shared in 24 hours is the API's setting alone (server/upload-quota.mjs):
// the page shows the numbers the API answers.
const MB = 1024 * 1024;
export const uploadLimits = {
  // Chosen at once.
  files: 10,
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
// The length in seconds of an MP4/MOV video (every phone records one), read
// from its "mvhd" box rather than by playing it: the site's CSP allows no
// blob: media, and not every browser decodes an iPhone's HEVC. null when it
// cannot tell (WebM, an unusual file); the server checks every video again.
export async function videoSeconds(file) {
  const view = async (start, length) =>
    new DataView(await file.slice(start, start + length).arrayBuffer());
  const box = async (at) => {
    const head = await view(at, 16);
    let size = head.getUint32(0),
      header = 8;
    const type = String.fromCharCode(...[4, 5, 6, 7].map((i) => head.getUint8(i)));
    if (size === 1) {
      size = Number(head.getBigUint64(8));
      header = 16;
    } else if (size === 0) size = file.size - at;
    if (size < header) throw new Error("bad box");
    return { type, size, header };
  };
  try {
    // Top-level boxes: the movie header is near the end in camera files.
    for (let at = 0, n = 0; at + 8 <= file.size && n < 64; n++) {
      const top = await box(at);
      if (top.type === "moov")
        for (let inner = at + top.header, m = 0; inner + 8 <= at + top.size && m < 64; m++) {
          const child = await box(inner);
          if (child.type === "mvhd") {
            const v = await view(inner + child.header, 32),
              long = v.getUint8(0) === 1,
              scale = v.getUint32(long ? 20 : 12),
              length = long ? Number(v.getBigUint64(24)) : v.getUint32(16);
            return scale ? length / scale : null;
          }
          inner += child.size;
        }
      at += top.size;
    }
  } catch {
    // Not an MP4/MOV the page can read: the server decides.
  }
  return null;
}
// Marks videos over a minute before anything is sent, so the guest can trim
// them first instead of waiting for a long upload to be refused.
export async function checkVideoLengths(entries, measure = videoSeconds) {
  for (const entry of entries)
    if (entry.kind === "video" && !entry.problem) {
      entry.seconds = await measure(entry.file).catch(() => null);
      if (entry.seconds >= uploadLimits.videoSeconds + 1) entry.problem = "video-long";
    }
}
// The short reference a guest can quote to ask for a file's removal, and that
// the family sees next to it in Admin: the first 8 characters of its id.
export const referenceCode = (id) =>
  String(id || "")
    .replace(/[^a-f0-9]/gi, "")
    .slice(0, 8)
    .toUpperCase()
    .replace(/^(.{4})(.{4})$/, "$1-$2");
// Why a file did not get through, as one of six reasons. Only "network" and
// "busy" are worth trying again at once; trying again is always safe: the
// server keeps what it received and says where to continue, so no byte is
// stored twice and a finished file is never added twice.
//   network     no answer, a timeout, a dropped connection
//   busy        the server or a proxy answered 5xx, or 409
//   quota       a limit on how many may be shared (it says when, if ever)
//   rate        too many requests this hour (it says when)
//   auth        the sign-in or table card session ended
//   validation  this file, as sent, will never be accepted
const quotaCodes = ["DAILY_UPLOAD_LIMIT", "PARTY_DEVICE_LIMIT", "PARTY_CARD_FULL"];
const authCodes = ["SIGN_IN_REQUIRED", "CSRF_REJECTED", "VERIFIED_ACCOUNT_REQUIRED", "ORIGIN_REJECTED"];
export function failureKind(err) {
  const status = err?.status;
  if (!status || err.timeout || status === 408) return "network";
  if (status === 429)
    return quotaCodes.includes(err.code) || err.details?.reason === "quota" ? "quota" : "rate";
  if (status === 401 || status === 403 || authCodes.includes(err.code)) return "auth";
  if (status >= 500 || status === 409) return "busy";
  return "validation";
}
// Whether Try again can succeed now: after a lost connection or a busy
// server at once, after a limit only once its time has come (never when the
// server gave none), and never for a refused file or a lost sign-in.
export function retryable(entry, now = Date.now()) {
  if (entry.state === "paused") return true;
  if (["limited", "waiting"].includes(entry.state)) return entry.retryAt !== null && entry.retryAt <= now;
  return false;
}
const resumable = ["queued", "paused", "limited", "waiting"];
// Sends the batch one file at a time, in order. `transport` talks to the API:
//   start({ kind, type, size }) -> { id }
//   put(id, offset, blob, onBytes) -> { received, complete, state }
//     (`onBytes(n)` reports bytes of this piece sent so far)
// After a few quick retries a lost connection or a busy server leaves the
// file "paused" and the batch stops there, so the remaining files are not
// burnt through; a limit leaves this file and every later one "limited"
// (with the server's reset time, if any); an hourly budget leaves it
// "waiting"; a lost sign-in leaves it "blocked". Calling sendUploadBatch again
// (the page's Try again, offered only when retryable()) resumes from what the
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
  for (const [i, entry] of entries.entries()) {
    if (!resumable.includes(entry.state)) continue;
    if (entry.problem) {
      entry.state = "invalid";
      changed();
      continue;
    }
    entry.state = "uploading";
    entry.message = "";
    entry.reason = undefined;
    entry.retryAt = undefined;
    changed();
    const outcome = await sendFile(entry, transport, changed, { sleep, clock, retries });
    if (outcome === "limited")
      // Nothing more can be shared until the limit passes: the files after
      // this one are not sent, and say so.
      for (const later of entries.slice(i + 1))
        if (resumable.includes(later.state) && !later.problem)
          Object.assign(later, {
            state: "limited",
            reason: "quota",
            retryAt: entry.retryAt,
            limit: entry.limit,
            message: entry.message,
          });
    changed();
    if (["paused", "limited", "waiting", "blocked"].includes(outcome)) break;
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
          entry.reason = entry.retryAt = undefined;
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
      const reason = failureKind(err),
        at = Date.parse(err.details?.retryAt);
      entry.reason = reason;
      entry.retryAt = Number.isFinite(at) ? at : null;
      if (Number.isSafeInteger(err.details?.limit)) entry.limit = err.details.limit;
      const final = { validation: "rejected", quota: "limited", rate: "waiting", auth: "blocked" }[reason];
      if (final) {
        entry.state = final;
        return entry.state;
      }
      if (err.timeout) entry.piece = Math.max(uploadLimits.unit, entry.piece / 4);
      if (attempt >= retries.length) {
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
