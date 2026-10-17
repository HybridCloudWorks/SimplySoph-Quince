// What the guests' gallery can serve, and "Download all photos": the approved
// photos and videos as ZIP files a phone can save in one action.
//
// The archive is split into parts of at most `partBytes` each, so every part
// is one request that finishes well inside the time a request may take
// (Firebase Hosting ends requests to the API at 60 seconds; see
// docs/deployment.md). The split is deterministic: approved media in the order
// it was approved (then by id), packed greedily; a single file larger than the
// cap gets a part of its own. Because media approved later goes to the end,
// parts already downloaded keep their contents when the family approves more.
//
// Each part has a version derived from what is in it (ids, names, sizes); its
// link carries that version, and a part whose contents changed since the page
// read the list answers 409 ARCHIVE_CHANGED instead of a different file.
//
// File names inside the archive are made here only, never from guest text
// (captions, names): sophia-xv-<album>-<NNN>.jpg or .mp4, numbered per album.
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { error, hash } from "./auth.mjs";
import { ZipPlan, zipStream } from "./zip.mjs";

export const mediaKind = (row) => row?.kind || "photo";
// The one rule for what the gallery may serve from a record: approved
// (administrators may also open the review queue), never a video that is
// still converting or could not be, and a poster only for a video that has
// one. Whether the stored object still exists is storage's answer
// (media.size), which the caller asks next.
export const servable = (row, { admin = false, kind = mediaKind(row) } = {}) =>
  !!row &&
  (row.state === "approved" || admin) &&
  !["processing", "failed"].includes(row.state) &&
  (kind !== "poster" || !!row.poster);

const extensions = { photo: "jpg", video: "mp4" };
// The stored file types (server/store.mjs: re-encoded JPEG photos and MP4
// videos); a record of any other kind is not archived.
const archivable = (row) => row.state === "approved" && servable(row) && !!extensions[mediaKind(row)];
const albumName = (id) =>
  String(id || "event")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "photos";
const digest = (items) =>
  createHash("sha256")
    .update(items.map((i) => `${i.id} ${i.name} ${i.size}`).join("\n"))
    .digest("base64url")
    .slice(0, 16);
export const archiveDefaults = Object.freeze({
  // 100 MB: about 30 seconds at 25 Mbit/s, the speed of ordinary phone Wi-Fi,
  // so a part finishes inside Hosting's 60-second request limit with room to
  // spare; the largest video (about 80 MB after conversion) still fits.
  partBytes: 100_000_000,
  // Parts one person may start in any rolling hour (counted in the ledger, so
  // a second instance or a restart does not reset it).
  partsPerHour: 20,
});
const HOUR = 3600000;

export function createGalleryArchive({
  media,
  ledger,
  now = Date.now,
  log = () => {},
  partBytes = archiveDefaults.partBytes,
  partsPerHour = archiveDefaults.partsPerHour,
}) {
  // Stored objects are never replaced (written with ifGenerationMatch: 0), so
  // a size read once stays true for as long as the object exists.
  const sizes = new Map(),
    // People with a part streaming from this instance right now, and people
    // whose part is being counted (just before it streams).
    streaming = new Set(),
    starting = new Set();
  async function sizeOf(id, kind) {
    const key = kind + ":" + id;
    if (sizes.has(key)) return sizes.get(key);
    try {
      const size = await media.size(id, kind);
      if (sizes.size >= 20000) sizes.delete(sizes.keys().next().value);
      sizes.set(key, size);
      return size;
    } catch (e) {
      if (e.code === 404) return null;
      throw e;
    }
  }
  // The approved media in archive order with names and sizes, and the parts.
  async function plan(state) {
    const at = (r) => r.approvedAt ?? r.receivedAt ?? 0;
    const rows = Object.values(state.photos || {})
      .filter(archivable)
      .sort((a, b) => at(a) - at(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const found = [];
    // Sizes come from object metadata (no downloads), eight at a time.
    for (let i = 0; i < rows.length; i += 8) {
      const batch = rows.slice(i, i + 8),
        got = await Promise.all(batch.map((r) => sizeOf(r.id, mediaKind(r))));
      batch.forEach((row, j) => {
        if (got[j] !== null) found.push({ row, size: got[j] });
      });
    }
    const numbers = {};
    const items = found.map(({ row, size }) => {
      const kind = mediaKind(row),
        album = albumName(row.album),
        n = (numbers[album] = (numbers[album] || 0) + 1);
      return {
        id: row.id,
        kind,
        name: `sophia-xv-${album}-${String(n).padStart(3, "0")}.${extensions[kind]}`,
        size,
        // When the guest shared it: the date the file shows once saved.
        mtime: row.receivedAt ?? null,
      };
    });
    const parts = [];
    let current = null;
    for (const item of items) {
      if (!current || current.plan.with(item) > partBytes) {
        current = { items: [], plan: new ZipPlan() };
        parts.push(current);
      }
      current.items.push(item);
      current.plan.add(item);
    }
    return {
      items,
      version: digest(items),
      parts: parts.map((p, i) => ({
        part: i + 1,
        items: p.items,
        bytes: p.plan.length,
        version: digest(p.items),
      })),
    };
  }
  // Rolling hourly count per person, kept in the ledger under a hash.
  const ledgerKey = (who) => hash("archive:" + who);
  const recent = (state, who) =>
    (state.archiveParts?.[ledgerKey(who)] || []).filter((t) => t > now() - HOUR);
  function limits(state, who) {
    const times = recent(state, who),
      remaining = Math.max(0, partsPerHour - times.length);
    return {
      partsPerHour,
      remaining,
      // How long until the next part may start, when none may now.
      waitMs: remaining ? 0 : Math.max(0, Math.min(...times) + HOUR - now()),
      // A part is still streaming for this person (from this instance).
      busy: streaming.has(who),
    };
  }
  const counts = (items) => ({
    count: items.length,
    photos: items.filter((i) => i.kind === "photo").length,
    videos: items.filter((i) => i.kind === "video").length,
  });
  async function manifest(state, who) {
    const p = await plan(state),
      all = counts(p.items);
    return {
      version: p.version,
      totalCount: all.count,
      totalPhotos: all.photos,
      totalVideos: all.videos,
      totalBytes: p.parts.reduce((n, x) => n + x.bytes, 0),
      partBytes,
      parts: p.parts.map((x) => ({
        part: x.part,
        ...counts(x.items),
        bytes: x.bytes,
        version: x.version,
        url: `/api/gallery/archive/${x.part}?v=${x.version}`,
      })),
      limits: limits(state, who),
    };
  }
  async function part(state, who, n, version) {
    const p = await plan(state),
      x = p.parts[n - 1];
    if (!x) throw error(404, "NOT_FOUND");
    if (version !== undefined && version !== x.version) throw error(409, "ARCHIVE_CHANGED");
    // One part at a time per person. The slot is held until the response
    // ends, so it is taken only after every ledger write has been saved (the
    // session's renewal, by the caller, then this hour's count): a write that
    // fails leaves nothing held (P5-05). While the count is being written,
    // `starting` keeps a second request from passing too; it is given back
    // in `finally`, whatever the write does.
    if (streaming.has(who) || starting.has(who)) throw error(429, "ARCHIVE_BUSY");
    starting.add(who);
    try {
      await ledger.transaction((s) => {
        const key = ledgerKey(who),
          times = recent(s, who);
        if (times.length >= partsPerHour) throw error(429, "ARCHIVE_HOURLY_LIMIT");
        s.archiveParts ??= {};
        // Counters whose hour has passed are dropped as others are written.
        for (const [k, list] of Object.entries(s.archiveParts))
          if (!list.some((t) => t > now() - HOUR)) delete s.archiveParts[k];
        s.archiveParts[key] = [...times, now()];
      });
    } finally {
      starting.delete(who);
    }
    // Nothing that can fail runs between taking the slot and returning the
    // stream, and the slot is given back in one place: the stream's close,
    // which comes when the response finishes, fails or is cut off (the HTTP
    // layer destroys the stream when the response closes).
    streaming.add(who);
    const stream = zipStream(
      x.items.map((item) => ({
        ...item,
        open: () =>
          item.size ? media.stream(item.id, item.kind, 0, item.size - 1) : Readable.from([]),
      })),
    );
    let complete = false,
      failure = null;
    stream.once("end", () => (complete = true));
    stream.once("error", (e) => (failure = e));
    stream.once("close", () => {
      streaming.delete(who);
      // The client going away destroys the stream with a premature-close
      // error; anything else is storage (or a size that no longer matches).
      const failed =
        !complete &&
        failure &&
        !["ERR_STREAM_PREMATURE_CLOSE", "ERR_STREAM_DESTROYED", "ZIP_ABORTED"].includes(failure.code);
      log({
        severity: failed ? "WARNING" : "INFO",
        message: "gallery archive",
        part: n,
        parts: p.parts.length,
        count: x.items.length,
        bytes: x.bytes,
        outcome: complete ? "complete" : failed ? "failed" : "stopped",
        ...(failed
          ? { code: failure.code ?? null, id: x.items[failure.entry]?.id ?? null }
          : {}),
      });
    });
    const name =
      p.parts.length > 1
        ? `sophia-xv-photos-part-${n}-of-${p.parts.length}.zip`
        : "sophia-xv-photos.zip";
    return {
      stream,
      length: x.bytes,
      contentType: "application/zip",
      disposition: `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    };
  }
  return { plan, manifest, part };
}
