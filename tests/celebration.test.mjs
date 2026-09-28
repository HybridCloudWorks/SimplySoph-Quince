import test from "node:test";
import assert from "node:assert/strict";
import {
  celebration,
  calendar,
  maps,
  calendarLink,
} from "../site/celebration.mjs";
import { validateSettings } from "../server/site-settings.mjs";
import { normalizeVideo, mediaResponse } from "../server/video.mjs";
test("separate calendars preserve Central-time instants, addresses and unique event identity", () => {
  const c = structuredClone(celebration);
  c.ceremony.end = "2027-01-15T17:00:00-06:00";
  c.reception.end = "2027-01-16T00:00:00-06:00";
  for (const kind of ["ceremony", "dinner", "reception"]) {
    const data = calendar(kind, c);
    assert.match(data, /SUMMARY:Sophia Isabel/);
    assert.match(data, new RegExp("UID:misxv-" + kind + "@simplysoph.com"));
    assert.match(data, /DTSTART:/);
    assert.match(data, /DTEND:/);
    assert.match(data, /URL:https:\/\/misxv.simplysoph.com\//);
    assert.match(
      data.replace(/\r\n /g, ""),
      kind === "ceremony" ? /4100 Blue Mound Rd/ : /5103 Azle Ave/,
    );
    for (const line of data.split("\r\n"))
      assert.ok(Buffer.byteLength(line) <= 75);
  }
  assert.match(calendar("dinner", c), /DTSTART:20270116T003000Z/);
  assert.match(calendar("reception", c), /DTEND:20270116T060000Z/);
  assert.throws(() => calendar("ceremony"), /Confirmed end/);
  assert.ok(!calendarLink("ceremony").includes("href="));
});
test("calendar injection is escaped and maps use the full encoded address", () => {
  const c = structuredClone(celebration);
  c.name = "Sophia\nBEGIN:VEVENT";
  assert.equal(
    (calendar("dinner", c).match(/^BEGIN:VEVENT$/gm) || []).length,
    1,
  );
  const html = maps(celebration.ceremony.address);
  assert.ok(
    html.includes("query=" + encodeURIComponent(celebration.ceremony.address)),
  );
  assert.ok(
    html.includes(
      "https://maps.apple.com/?q=" +
        encodeURIComponent(celebration.ceremony.address),
    ),
  );
});
test("settings reject dangerous links, invalid event ordering and ambiguous dates", () => {
  const valid = validateSettings(celebration);
  assert.equal(valid.name, "Sophia Isabel");
  for (const alter of [
    (c) => (c.registries[0].url = "javascript:alert(1)"),
    (c) => (c.registries[0].url = "https://user:pass@example.com/"),
    (c) => (c.dinner.end = c.dinner.start),
    (c) => (c.countdownAt = "2027-01-15T16:00:00"),
    (c) => c.albums.push(c.albums[0]),
  ]) {
    const c = structuredClone(celebration);
    alter(c);
    assert.throws(
      () => validateSettings(c),
      (e) => e.code === "INVALID_SITE_SETTINGS",
    );
  }
});
test("video bytes use bounded single-range responses and reject unsupported uploads", async () => {
  await assert.rejects(
    () => normalizeVideo(Buffer.from("<script>bad</script>")),
    (e) => e.code === "INVALID_VIDEO",
  );
  const bytes = Buffer.from("0123456789"),
    r = mediaResponse(bytes, "video", "bytes=2-5", false, "fixture");
  assert.equal(r.status, 206);
  assert.equal(r.binary.toString(), "2345");
  assert.equal(r.contentRange, "bytes 2-5/10");
  assert.equal(
    mediaResponse(
      bytes,
      "video",
      "bytes=-3",
      true,
      "fixture",
    ).binary.toString(),
    "789",
  );
  assert.match(
    mediaResponse(bytes, "photo", null, true, "fixture").disposition,
    /attachment.*\.jpg/,
  );
  for (const range of ["bytes=99-", "bytes=4-2", "bytes=0-1,3-4", "bytes=-0"])
    assert.throws(
      () => mediaResponse(bytes, "video", range, false, "fixture"),
      (e) => e.code === "INVALID_RANGE",
    );
});
