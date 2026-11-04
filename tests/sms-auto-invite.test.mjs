import test from "node:test";
import assert from "node:assert/strict";
import {
  autoInviteDefaults,
  autoInviteSettings,
  validateAutoInvite,
  validateSettings,
  siteSettings,
  AUTO_INVITE_TEXT_MAX,
  AUTO_INVITE_SAMPLE_LINK,
} from "../server/site-settings.mjs";
import { smsCompliantText, smsPreview } from "../server/sms.mjs";
import { celebration } from "../site/celebration.mjs";
import { registryDefaults } from "../server/registry-settings.mjs";

// The reviewed setting behind the automatic SMS invitation after SOPHIA
// (docs/twilio-setup.md "Automatic invitation after SOPHIA").
test("the automatic invitation is off by default, with compliant texts carrying the current deadline", () => {
  const d = autoInviteDefaults();
  assert.equal(d.enabled, false);
  assert.equal(d.reviewedAt, null);
  assert.equal(d.reviewedBy, null);
  for (const text of [d.text, d.textEs]) {
    assert.ok(smsCompliantText(text), text);
    assert.ok(text.includes("{link}"), text);
    assert.ok(text.length <= AUTO_INVITE_TEXT_MAX, text);
    // GSM-7 and two segments once a real-length link is in (the samples'
    // style: no accented letters).
    const sent = smsPreview(text.replaceAll("{link}", AUTO_INVITE_SAMPLE_LINK));
    assert.deepEqual([sent.encoding, sent.segments], ["GSM-7", 2], text);
    // Never the registered samples' old date, nor a household name.
    assert.doesNotMatch(text, /Oct 31|31 de octubre|\[Name\]/);
  }
  assert.match(d.text, /RSVP by December 1, 2026: \{link\}/);
  assert.match(d.text, /Friday, January 15, 2027/);
  assert.match(d.textEs, /hasta el 1 de diciembre de 2026: \{link\}/);
  // Validation accepts its own defaults.
  assert.deepEqual(validateAutoInvite(d), d);
  // Unsaved: the defaults; saved: what was saved, over the defaults.
  assert.deepEqual(autoInviteSettings({}), d);
  assert.equal(autoInviteSettings({ site: { sms: { autoInvite: { ...d, enabled: true, reviewedAt: 5, reviewedBy: "a" } } } }).enabled, true);
});

test("bad automatic-invitation texts are refused with the rule they broke", () => {
  const good = { ...autoInviteDefaults(), enabled: true, reviewedAt: 1, reviewedBy: "organizer" };
  const refused = (input, reason) =>
    assert.throws(
      () => validateAutoInvite(input),
      (e) => e.code === "INVALID_SITE_SETTINGS" && e.details?.reason === reason,
      reason,
    );
  refused(null, "auto-invite");
  refused({ ...good, enabled: "yes" }, "auto-invite-enabled");
  refused({ ...good, text: "Simply Soph Media: Hello. Reply STOP to opt out." }, "text-link");
  refused({ ...good, textEs: "Simply Soph Media: Hola. Responde STOP para cancelar." }, "textEs-link");
  refused({ ...good, text: "Hello {link} Reply STOP to opt out." }, "text-brand-or-stop");
  refused({ ...good, text: "Simply Soph Media: Hello {link}" }, "text-brand-or-stop");
  refused({ ...good, textEs: "Confirma {link} Responde STOP para cancelar." }, "textEs-brand-or-stop");
  refused({ ...good, text: "" }, "text-length");
  refused({ ...good, text: "Simply Soph Media: " + "x".repeat(AUTO_INVITE_TEXT_MAX) + " {link} STOP" }, "text-length");
  refused({ ...good, text: "Simply Soph Media: a\u0007b {link} STOP" }, "text-length");
  refused({ ...good, text: 5 }, "text-length");
  // On needs the server's review stamp; off needs none.
  refused({ ...good, reviewedAt: null }, "auto-invite-reviewed");
  refused({ ...good, reviewedBy: "" }, "auto-invite-reviewed");
  refused({ ...good, reviewedAt: "yesterday" }, "auto-invite-reviewed");
  assert.equal(validateAutoInvite({ ...good, enabled: false, reviewedAt: null, reviewedBy: null }).enabled, false);
  // Surrounding whitespace is trimmed, nothing else is rewritten.
  assert.equal(validateAutoInvite({ ...good, text: "  " + good.text + " \n" }).text, good.text);
});

test("a whole-site save validates the setting when it carries it, and the public site never carries it", () => {
  const site = structuredClone({ ...celebration, registries: registryDefaults });
  const saved = validateSettings(site);
  assert.equal(saved.sms, undefined);
  const withSetting = validateSettings({ ...site, sms: { autoInvite: autoInviteDefaults() } });
  assert.deepEqual(withSetting.sms, { autoInvite: autoInviteDefaults() });
  assert.throws(() => validateSettings({ ...site, sms: {} }), (e) => e.code === "INVALID_SITE_SETTINGS");
  assert.throws(
    () => validateSettings({ ...site, sms: { autoInvite: { ...autoInviteDefaults(), text: "no link" } } }),
    (e) => e.details?.reason === "text-link",
  );
  // siteSettings (GET /api/site, the pages) leaves the reviewer's name out.
  const state = { site: { ...site, sms: { autoInvite: { ...autoInviteDefaults(), enabled: true, reviewedAt: 1, reviewedBy: "organizer@example.com" } } } };
  assert.equal(siteSettings(state).sms, undefined);
  assert.equal(JSON.stringify(siteSettings(state)).includes("organizer@example.com"), false);
});
