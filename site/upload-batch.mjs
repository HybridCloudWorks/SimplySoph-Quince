export const uploadTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
];
export function createUploadBatch(files) {
  if (!files.length || files.length > 10) throw new Error("BATCH_SIZE");
  return Array.from(files, (file) => ({
    file,
    state: "queued",
    problem: !uploadTypes.includes(file.type)
      ? "type"
      : !file.size || file.size > 8 * 1024 * 1024
        ? "size"
        : null,
  }));
}
// One request at a time bounds memory and preserves per-file results.
// Attempted entries are never automatically resent, including ambiguous failures.
export async function sendUploadBatch(entries, upload, changed = () => {}) {
  for (const entry of entries) {
    if (entry.state !== "queued") continue;
    if (entry.problem) {
      entry.state = "invalid";
      changed();
      continue;
    }
    entry.state = "uploading";
    changed();
    try {
      entry.receipt = await upload(entry.file);
      entry.state = "received";
    } catch (err) {
      entry.state =
        err.status >= 400 && err.status < 500 ? "rejected" : "unknown";
      entry.message = err.message;
    }
    changed();
  }
}
