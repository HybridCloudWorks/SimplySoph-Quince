// "Share by text" (site/share-by-text.mjs): the words the family sends from
// their own phone, in the household's language, and the sms: link that opens
// them. Nothing here touches the server: the website sends nothing.
import test from "node:test";
import assert from "node:assert/strict";
import { shareByText, shareLanguage, shareLink, shareNumber, shareText } from "../site/share-by-text.mjs";
import { event } from "../site/content.mjs";
import { smsProgram } from "../site/sms-program.mjs";

const program = { keyword: smsProgram.keyword, number: smsProgram.phoneDisplay, startsAt: event.startsAt };

test("US and Canada numbers normalize to E.164; anything else is not shareable", () => {
  for (const v of ["+18175550123", "+1 (817) 555-0123", "817-555-0123", "1 817 555 0123", "(817) 555.0123"])
    assert.equal(shareNumber(v), "+18175550123", v);
  for (const v of ["", null, undefined, "555-0123", "+52 55 1234 5678", "+44 20 7946 0958", "0817555012", "817555012x"])
    assert.equal(shareNumber(v), null, String(v));
});

test("the English and Spanish words, with the date, keyword and number from their sources", () => {
  assert.equal(
    shareText({ lang: "en", ...program }),
    "You're invited to Sophia's quinceañera on January 15! Text SOPHIA to 682-786-8002 to join her event texts. Your invitation link will follow by text.",
  );
  assert.equal(
    shareText({ lang: "es", ...program }),
    "¡Estás invitado a los XV de Sophia el 15 de enero! Manda SOPHIA al 682-786-8002 para unirte a los avisos por texto. Tu enlace de invitación te llegará después por texto.",
  );
});

test("the language follows the invitation's locale, then the row's WhatsApp Language, then English", () => {
  assert.equal(shareLanguage({ locale: "es", whatsappLanguage: "en" }), "es");
  assert.equal(shareLanguage({ locale: "en", whatsappLanguage: "es" }), "en");
  assert.equal(shareLanguage({ whatsappLanguage: "es" }), "es");
  assert.equal(shareLanguage({}), "en");
  assert.equal(shareLanguage({ locale: "fr" }), "en");
});

test("the sms: link uses the ?&body= form and encodes the apostrophe, accents and punctuation", () => {
  const en = shareLink("817-555-0123", shareText({ lang: "en", ...program }));
  assert.ok(en.startsWith("sms:+18175550123?&body="), en);
  const body = en.slice("sms:+18175550123?&body=".length);
  assert.ok(!/[\s'!ñ]/.test(body), "nothing left unencoded: " + body);
  assert.equal(decodeURIComponent(body), shareText({ lang: "en", ...program }));
  const es = shareLink("+18175550123", shareText({ lang: "es", ...program }));
  assert.equal(decodeURIComponent(es.split("?&body=")[1]), shareText({ lang: "es", ...program }));
  assert.ok(es.includes("%C2%A1Est%C3%A1s"), es);
  assert.equal(shareLink("+52 55 1234 5678", "x"), null, "a non-US/CA phone has no link");
});

test("one household: language, words, number and link together; no link for a phone that needs review", () => {
  const ok = shareByText({ phone: "+1 817 555 0101", locale: "es" }, program);
  assert.equal(ok.lang, "es");
  assert.equal(ok.to, "+18175550101");
  assert.ok(ok.link.startsWith("sms:+18175550101?&body=%C2%A1"));
  const review = shareByText({ phone: "+52 55 1234 5678", whatsappLanguage: "es" }, program);
  assert.equal(review.to, null);
  assert.equal(review.link, null);
  assert.equal(review.lang, "es");
});
