import test from "node:test";
import assert from "node:assert/strict";
import { createUploadBatch, sendUploadBatch } from "../site/upload-batch.mjs";
const photo = (name = "photo.png", size = 100) => ({
  name,
  size,
  type: "image/png",
});

test("multi-file uploads are sequential and preserve a receipt for every successful file", async () => {
  const rows = createUploadBatch([photo("one.png"), photo("two.png")]);
  let active = 0,
    peak = 0;
  await sendUploadBatch(rows, async (file) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return { id: file.name, state: "pending" };
  });
  assert.equal(peak, 1);
  assert.deepEqual(
    rows.map((r) => [r.state, r.receipt.id]),
    [
      ["received", "one.png"],
      ["received", "two.png"],
    ],
  );
});

test("partial failures never resend completed or uncertain files on another submit", async () => {
  const rows = createUploadBatch([
    photo("good.png"),
    photo("offline.png"),
    photo("rejected.png"),
    photo("last.png"),
  ]);
  let calls = 0;
  const upload = async (file) => {
    calls++;
    if (file.name === "offline.png") throw new Error("Connection lost");
    if (file.name === "rejected.png")
      throw Object.assign(new Error("Invalid photo"), { status: 422 });
    return { id: file.name };
  };
  await sendUploadBatch(rows, upload);
  await sendUploadBatch(rows, upload);
  assert.equal(calls, 4);
  assert.deepEqual(
    rows.map((r) => r.state),
    ["received", "unknown", "rejected", "received"],
  );
});

test("invalid and oversized files do not reach the upload endpoint; batches are bounded", async () => {
  const rows = createUploadBatch([
    photo("large.png", 8 * 1024 * 1024 + 1),
    photo("empty.png", 0),
    { ...photo(), type: "application/pdf" },
    photo(),
  ]);
  let calls = 0;
  await sendUploadBatch(rows, async () => {
    calls++;
    return { id: "valid" };
  });
  assert.equal(calls, 1);
  assert.deepEqual(
    rows.map((r) => r.state),
    ["invalid", "invalid", "invalid", "received"],
  );
  assert.throws(
    () => createUploadBatch(Array.from({ length: 11 }, () => photo())),
    /BATCH_SIZE/,
  );
  assert.throws(() => createUploadBatch([]), /BATCH_SIZE/);
});
