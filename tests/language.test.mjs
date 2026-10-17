// One voice and one name per thing, in English and Mexican Spanish, wherever a
// guest reads (round 2 review §6; R-034 to R-037, R-125, R-144, R-165): the
// built pages in both languages, the guest scripts, every email rendered in
// both languages and the server's WhatsApp and SMS replies. The decisions are
// in site/lexicon.mjs (terms, registers, banned) and site/datetime.mjs; the
// Spanish forms of address are told apart by server/copy-check.mjs. The
// runtime screens of the Spanish RSVP are walked in
// tests/browser/language.spec.mjs. All names and links are made up.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { terms, banned, registers, registerFor, say } from "../site/lexicon.mjs";
import { routes } from "../site/content.mjs";
import { celebration } from "../site/celebration.mjs";
import { smsProgram } from "../site/sms-program.mjs";
import * as templates from "../emails/templates.mjs";
import * as whatsapp from "../server/whatsapp.mjs";
import { addressWords } from "../server/copy-check.mjs";
import { date } from "../site/datetime.mjs";

const root = new URL("../", import.meta.url);
const dist = new URL("dist/", root);
const source = (file) => readFile(new URL(file, root), "utf8");

// ---- Reading what a guest reads out of a built page ----
// Removes every element that has the attribute (and what it holds), counting
// nested elements of the same name.
function drop(html, attribute) {
  const open = new RegExp(`<([a-z][a-z0-9]*)\\b[^>]*\\s${attribute}[^>]*>`, "gi");
  let out = html,
    m;
  while ((m = open.exec(out))) {
    const name = m[1].toLowerCase(),
      tags = new RegExp(`<(/?)${name}\\b[^>]*>`, "gi");
    tags.lastIndex = m.index + m[0].length;
    let depth = 1,
      t,
      end = out.length;
    if (/^(?:img|input|meta|br|hr|source)$/.test(name)) end = m.index + m[0].length;
    else
      while ((t = tags.exec(out)))
        if ((depth += t[1] ? -1 : 1) === 0) {
          end = t.index + t[0].length;
          break;
        }
    out = out.slice(0, m.index) + " " + out.slice(end);
    open.lastIndex = m.index;
  }
  return out;
}
const entities = (s) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
// The words of some markup, one block per line: its text, and the alt, title,
// aria-label and placeholder a screen reader or a hover reads.
function words(html) {
  const said = [...html.matchAll(/\s(?:alt|title|aria-label|placeholder)="([^"]*)"/g)].map((m) => m[1]);
  const text = html
    .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/?(?:p|div|li|h[1-6]|dt|dd|section|article|figcaption|summary|details|blockquote|nav|ul|ol|header|footer|main|title|br|tr|td|label|button|template|aside)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return entities([text, ...said].join("\n"))
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}
// What a link preview says: the description, its card's title and text.
const preview = (html) =>
  [...html.matchAll(/<meta (?:name|property)="(?:description|og:title|og:description|og:image:alt)" content="([^"]*)"/g)]
    .map((m) => entities(m[1]))
    .join("\n");
const guestPages = async () =>
  (await readdir(dist, { recursive: true }))
    .filter((f) => f.endsWith(".html") && !f.startsWith("admin"))
    .map((f) => [f, f.startsWith("es/") ? "es" : "en"]);
const otherLanguage = (lang) => (lang === "es" ? "en" : "es");
// A page's text in its own language: without the parts marked as the other
// language (the share page's note in the other language, the SMS replies
// registered in English, the Spanish first line on English pages).
async function pageText(file, lang) {
  let html = await readFile(new URL(file, dist), "utf8");
  if (file === "404.html") html = html.replace(/<template[\s\S]*<\/template>/, "");
  const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "",
    body = drop(html.match(/<body[\s\S]*<\/body>/)[0], `lang="${otherLanguage(lang)}"`);
  return [entities(title), words(body), preview(html)].join("\n");
}
const notFoundSpanish = async () => {
  const html = await readFile(new URL("404.html", dist), "utf8");
  return words(drop(html.match(/<template data-lang="es"[\s\S]*?<\/template>/)[0], 'lang="en"'));
};

// ---- Reading the strings a guest script writes ----
// A small JavaScript tokenizer: strings, template literals (with the tokens
// of their ${…} parts), regular expressions, names and punctuation. Comments
// are skipped, so the wording a comment quotes is never read as copy.
function lex(src) {
  let i = 0;
  const regexAfter = /^(?:return|typeof|case|do|else|in|of|new|delete|void|throw|instanceof|yield|await)$/;
  function run(stopAtBrace) {
    const out = [];
    let depth = 0;
    const regexOk = () => {
      const p = out.at(-1);
      if (!p) return true;
      if (p.type === "punc") return !/^[)\]}]$/.test(p.value);
      if (p.type === "id") return regexAfter.test(p.value);
      return false;
    };
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) i++;
      else if (c === "/" && src[i + 1] === "/") while (i < src.length && src[i] !== "\n") i++;
      else if (c === "/" && src[i + 1] === "*") i = src.indexOf("*/", i + 2) + 2;
      else if (c === '"' || c === "'") {
        let j = i + 1,
          text = "";
        while (j < src.length && src[j] !== c) text += src[j] === "\\" ? src[++j] : src[j], j++;
        out.push({ type: "str", value: text });
        i = j + 1;
      } else if (c === "`") {
        i++;
        const quasis = [],
          exprs = [];
        let text = "";
        while (i < src.length) {
          if (src[i] === "\\") {
            text += src[i + 1];
            i += 2;
          } else if (src[i] === "`") {
            i++;
            break;
          } else if (src[i] === "$" && src[i + 1] === "{") {
            i += 2;
            quasis.push(text);
            text = "";
            exprs.push(run(true));
          } else text += src[i++];
        }
        quasis.push(text);
        out.push({ type: "template", quasis, exprs, value: quasis.join("…") });
      } else if (c === "/" && regexOk()) {
        let j = i + 1,
          inClass = false;
        while (j < src.length) {
          if (src[j] === "\\") j += 2;
          else {
            if (src[j] === "[") inClass = true;
            else if (src[j] === "]") inClass = false;
            else if (src[j] === "/" && !inClass) break;
            j++;
          }
        }
        j++;
        while (/[a-z]/i.test(src[j] || "")) j++;
        out.push({ type: "regex", value: src.slice(i, j) });
        i = j;
      } else if (/[\p{L}_$]/u.test(c)) {
        let j = i;
        while (j < src.length && /[\p{L}\p{N}_$]/u.test(src[j])) j++;
        out.push({ type: "id", value: src.slice(i, j) });
        i = j;
      } else if (/[0-9]/.test(c)) {
        let j = i;
        while (j < src.length && /[\w.]/.test(src[j])) j++;
        out.push({ type: "num", value: src.slice(i, j) });
        i = j;
      } else {
        if (c === "{") depth++;
        if (c === "}") {
          if (stopAtBrace && depth === 0) {
            i++;
            return out;
          }
          depth--;
        }
        out.push({ type: "punc", value: c });
        i++;
      }
    }
    return out;
  }
  return run(false);
}
// Every piece of text in the tokens, template parts included.
function* texts(tokens) {
  for (const t of tokens) {
    if (t.type === "str") yield t.value;
    if (t.type === "template") {
      yield* t.quasis;
      for (const e of t.exprs) yield* texts(e);
    }
  }
}
// The text of an argument written as one literal, else null (computed).
const literal = (arg) => (arg.length === 1 && ["str", "template"].includes(arg[0].type) ? arg[0].value : null);
// The arguments of every call to `name`, at any depth: [[tokens], …].
function* calls(tokens, name) {
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.type === "template") for (const e of t.exprs) yield* calls(e, name);
    if (!(t.type === "id" && t.value === name && tokens[k + 1]?.value === "(" && tokens[k - 1]?.value !== ".")) continue;
    const args = [[]];
    let depth = 0,
      j = k + 2;
    for (; j < tokens.length; j++) {
      const v = tokens[j].type === "punc" ? tokens[j].value : null;
      if (v && "([{".includes(v)) depth++;
      if (v && ")]}".includes(v)) {
        if (depth === 0) break;
        depth--;
      }
      if (v === "," && depth === 0) args.push([]);
      else args.at(-1).push(tokens[j]);
    }
    yield args.filter((a) => a.length);
  }
}
// { tu: "…", ustedes: "…" } written out, else null.
function addressed(arg) {
  if (arg[0]?.value !== "{" || arg.at(-1)?.value !== "}") return null;
  const value = (key) => {
    const at = arg.findIndex((t, n) => t.type === "id" && t.value === key && arg[n + 1]?.value === ":");
    return at < 0 ? null : literal([arg[at + 2]]);
  };
  return { tu: value("tu"), ustedes: value("ustedes") };
}
// The guest scripts: what guests read that is written in code. Admin screens
// are left out, and so is the lexicon itself, which lists what it bans.
const guestScripts = async () =>
  (await readdir(new URL("site/", root)))
    .filter((f) => /\.m?js$/.test(f) && !f.startsWith("admin") && f !== "lexicon.mjs")
    .map((f) => "site/" + f);
// Words in code, without markup, addresses and names of things (a route such
// as "guestbook" is a name, not copy).
const prose = (text) =>
  text
    .replace(/<[^>]*>/g, " ")
    .replace(/\S*[/#=]\S*/g, " ")
    .replace(/\s+/g, " ");
const isProse = (text) => /\p{L}+\s+\p{L}+/u.test(prose(text));
// English that would only be written by mistake on a Spanish page: words
// Spanish never uses. Names of places and services are taken out first.
const names = [
  celebration.ceremony.name,
  celebration.reception.name,
  "Sophia’s Birthday Wish List",
  "Simply Soph Media",
  "Google Calendar",
  "Google Maps",
  "Apple Maps",
  "Firebase Hosting",
  "Google Cloud",
  "Google Fonts",
  "Microsoft 365",
];
const english = /\b(?:the|your|you|please|with|our|we|will|here|this|that|and|for|from|sign in|contact us|RSVP)\b/i;

// ---- Every email a household or a guest receives, rendered in both languages ----
const people = { ceremony: { adultsTeens: 2, kids: 1 }, dinner: { adultsTeens: 2, kids: 0 }, dance: { adultsTeens: 0, kids: 0 } };
const nobody = { ceremony: { adultsTeens: 0, kids: 0 }, dinner: { adultsTeens: 0, kids: 0 }, dance: { adultsTeens: 0, kids: 0 } };
const deadline = "2026-11-15T23:59:00-06:00";
// The way the server composes them (emails/templates.mjs householdEmail, used
// by server/application.mjs), from the event settings and the deadline.
function emails(locale) {
  const base = `https://misxv.simplysoph.com${locale === "es" ? "/es" : ""}`,
    link = `${base}/rsvp/#${"A".repeat(43)}`,
    out = [];
  for (const type of templates.templateKeys)
    for (const answer of ["receipt", "update"].includes(type) ? [people, nobody] : [null]) {
      const mail = templates.householdEmail({
        type,
        locale,
        household: locale === "es" ? "Familia Ejemplo" : "Example family",
        url: ["invitation", "reminder"].includes(type) ? link : `${base}${type === "thanks" ? "/thank-you/" : "/details/"}`,
        site: celebration,
        deadline,
        invited: { ceremony: true, dinner: true, dance: true },
        attendance: answer,
        updateText: type === "change" ? (locale === "es" ? "Cambió la hora de la cena." : "Dinner moved.") : "",
        receiptCommitted: true,
      });
      out.push([`${locale}/${type}${answer === nobody ? " (no)" : ""}`, mail, "household"]);
    }
  out.push([
    `${locale}/sign-in`,
    templates.renderSignInEmail({ locale, household: "Familia Ejemplo", url: `${base}/account/#example`, eventDate: date(celebration.ceremony.start, locale) }),
    "person",
  ]);
  if (templates.renderReplyNotice) out.push([`${locale}/reply notice`, templates.renderReplyNotice({ locale, origin: "https://misxv.simplysoph.com" }), "person"]);
  return out;
}
const mailText = (m) => [m.subject, m.text, words(m.html)].join("\n");
// The server's own replies: WhatsApp keywords (both languages) and the SMS
// replies registered with carriers (English, word for word).
const serverReplies = () => {
  const replies = whatsapp.whatsappReplies("https://misxv.simplysoph.com");
  return [
    ...["en", "es"].flatMap((lang) => Object.entries(replies[lang]).map(([key, text]) => [`WhatsApp ${lang} ${key}`, text, lang])),
    ...["confirmation", "help", "stop"].map((key) => [`SMS ${key}`, smsProgram[key], "en"]),
  ];
};

// ---- (a) No retired variant anywhere a guest reads ----
const breaks = (text, lang) => banned[lang].filter(([re]) => re.test(text)).map(([re, why]) => `${text.match(re)[0]} (${why})`);

// R-094: /whatsapp/ once said "Sign in with the email we have for your family"
// / "Entra al sitio con el correo que tenemos de tu familia" (git log -S), the
// voice of a company. The sentences as they were are refused, so they cannot
// come back on any page, script, email or reply scanned below.
test("the retired /whatsapp/ sign-in sentence is refused in English and Spanish", () => {
  assert.equal(breaks("Sign in with the email we have for your family.", "en").length, 1);
  assert.equal(breaks("Entra al sitio con el correo que tenemos de tu familia.", "es").length, 1);
  assert.equal(breaks("Entren al sitio con el correo que tenemos de su familia.", "es").length, 1);
  // The wording that replaced them passes.
  assert.deepEqual(breaks("Sign in with the email where you received your invitation.", "en"), []);
  assert.deepEqual(breaks("Entra al sitio con el correo donde recibiste tu invitación.", "es"), []);
});

test("no retired variant in site/lexicon.mjs `banned` is on a built page, in either language", async () => {
  const found = [];
  for (const [file, lang] of await guestPages())
    for (const hit of breaks(await pageText(file, lang), lang)) found.push(`${file}: ${hit}`);
  for (const hit of breaks(await notFoundSpanish(), "es")) found.push(`404.html (Spanish): ${hit}`);
  assert.deepEqual(found, []);
});

test("no retired variant in a guest script's copy, in either language", async () => {
  const found = [];
  for (const file of await guestScripts())
    for (const text of texts(lex(await source(file))))
      if (isProse(text))
        for (const lang of ["en", "es"]) for (const hit of breaks(prose(text), lang)) found.push(`${file}: ${hit}`);
  assert.deepEqual(found, []);
});

test("no retired variant in any email, rendered in English and Spanish", () => {
  const found = [];
  for (const locale of ["en", "es"])
    for (const [name, mail] of emails(locale)) for (const hit of breaks(mailText(mail), locale)) found.push(`${name}: ${hit}`);
  assert.deepEqual(found, []);
});

test("no retired variant in the server's WhatsApp and SMS replies", () => {
  const found = [];
  for (const [name, text, lang] of serverReplies()) for (const hit of breaks(text, lang)) found.push(`${name}: ${hit}`);
  assert.deepEqual(found, []);
});

// ---- (b) Parity: everything written in English is written in Spanish ----
test("every tr(en, es) and { en, es } in the guest scripts has its Spanish (both forms where it has two), never the English left in", async () => {
  const problems = [];
  const words3 = (s) => s.split(/\s+/).filter(Boolean).length >= 3;
  for (const file of [...(await guestScripts()), "scripts/build-pages.mjs"]) {
    const tokens = lex(await source(file)),
      name = file.startsWith("scripts/") ? "say" : "tr";
    for (const args of calls(tokens, name)) {
      if (args.length < 2) continue;
      const en = literal(args[0]),
        es = literal(args[1]),
        forms = addressed(args[1]);
      if (forms) {
        if (!forms.tu?.trim() || !forms.ustedes?.trim()) problems.push(`${file}: ${en} has a Spanish form missing`);
        continue;
      }
      if (es === null) continue;
      if (!es.trim() && en?.trim()) problems.push(`${file}: no Spanish for “${en}”`);
      else if (en && es === en && english.test(prose(en))) problems.push(`${file}: “${en}” is the same in Spanish`);
      else if (/\bRSVP\b/.test(prose(es)) && !/lang="en"/.test(es)) problems.push(`${file}: the Spanish says RSVP: “${es}”`);
    }
    // Objects of copy: an `en:` text always has its `es:` in the same object.
    const brace = (t, c) => t?.type === "punc" && t.value === c;
    tokens.forEach((t, k) => {
      if (!(t.type === "id" && t.value === "en" && tokens[k + 1]?.value === ":" && literal([tokens[k + 2] || {}]) !== null)) return;
      let start = k,
        depth = 0;
      for (; start >= 0; start--) {
        if (brace(tokens[start], "}")) depth++;
        if (brace(tokens[start], "{") && depth-- === 0) break;
      }
      let found = false;
      depth = 0;
      for (let j = start + 1; j < tokens.length; j++) {
        if (brace(tokens[j], "{")) depth++;
        if (brace(tokens[j], "}") && depth-- === 0) break;
        if (depth === 0 && tokens[j].type === "id" && tokens[j].value === "es" && tokens[j + 1]?.value === ":") found = true;
      }
      const en = literal([tokens[k + 2]]);
      if (!found && words3(prose(en))) problems.push(`${file}: { en: “${en}” } has no es`);
    });
  }
  for (const [key, entry] of Object.entries(terms)) {
    if (typeof entry.en !== "string") problems.push(`terms.${key}: no English`);
    const es = entry.es;
    if (typeof es === "string" ? !es.trim() && entry.en : !es?.tu?.trim() || !es?.ustedes?.trim())
      problems.push(`terms.${key}: Spanish missing`);
  }
  assert.deepEqual(problems, []);
});

test("no English sentence on a Spanish page or in a Spanish email", async () => {
  const found = [];
  const check = (where, text) => {
    for (const line of text.split("\n")) {
      const clean = names.reduce((l, n) => l.replaceAll(n, " "), line).replace(/https?:\/\/\S+/g, " ");
      if (english.test(clean)) found.push(`${where}: ${line}`);
    }
  };
  for (const [file, lang] of await guestPages()) if (lang === "es") check(file, await pageText(file, "es"));
  check("404.html (Spanish)", await notFoundSpanish());
  for (const [name, mail] of emails("es")) check(name, mailText(mail));
  assert.deepEqual(found, []);
});

// L10N-01: datetime's at() already says "a las 5:00 p. m.", so a sentence
// that puts its own preposition before it ("alrededor de a las") doubles it.
test("no built page doubles the preposition before a time (“de a las”, “de a la”)", async () => {
  const found = [];
  for (const [file, lang] of await guestPages())
    for (const m of (await pageText(file, lang)).matchAll(/\bde a las?\b[^\n]{0,30}/g)) found.push(`${file}: ${m[0]}`);
  assert.deepEqual(found, []);
});

// ---- (c) One form of address per screen ----
// The words server/copy-check.mjs counts as tú or as ustedes, so this test
// names what it found.
const markers = (text) => addressWords(text);
test("Spanish pages for the household (home, RSVP, confirmation, thank-you) use no tú form, and pages for one person no ustedes form, outside Sophia's own words", async () => {
  const found = [];
  for (const [route] of routes) {
    const file = `es/${route ? route + "/" : ""}index.html`,
      register = registerFor(route),
      // Sophia's quote is hers (data-voice="sophia"); the header and footer
      // are shared chrome, written neutral.
      html = drop(await readFile(new URL(file, dist), "utf8"), 'data-voice="sophia"'),
      main = words(drop(html.match(/<main[\s\S]*<\/main>/)[0], 'lang="en"')) + "\n" + preview(html),
      { tu, ustedes } = markers(main);
    if (register !== "tu" && tu.length) found.push(`/${file}: tú (${tu.join(", ")}) on a ${register} page`);
    if (register !== "ustedes" && ustedes.length) found.push(`/${file}: ustedes (${ustedes.join(", ")}) on a ${register} page`);
  }
  assert.deepEqual(found, []);
});

test("Spanish household emails speak to the family (ustedes) and the sign-in email to one person (tú)", () => {
  const found = [];
  for (const [name, mail, to] of emails("es")) {
    const { tu, ustedes } = markers(mailText(mail).replace(/“[^”]*” Sophia/g, ""));
    if (to === "household" && tu.length) found.push(`${name}: tú (${tu.join(", ")})`);
    if (to === "person" && ustedes.length) found.push(`${name}: ustedes (${ustedes.join(", ")})`);
  }
  assert.deepEqual(found, []);
});

test("every Spanish { tu, ustedes } pair keeps to its form, in the lexicon, the guest scripts and the WhatsApp replies", async () => {
  const found = [];
  const pair = (where, tuText, ustedesText) => {
    const a = markers(tuText),
      b = markers(ustedesText);
    if (a.ustedes.length) found.push(`${where}: the tú form uses ${a.ustedes.join(", ")}`);
    if (b.tu.length) found.push(`${where}: the ustedes form uses ${b.tu.join(", ")}`);
  };
  for (const [key, entry] of Object.entries(terms)) if (typeof entry.es === "object") pair(`terms.${key}`, entry.es.tu, entry.es.ustedes);
  for (const file of await guestScripts())
    for (const args of calls(lex(await source(file)), "tr")) {
      const forms = args[1] && addressed(args[1]);
      if (forms?.tu && forms?.ustedes) pair(`${file}: ${literal(args[0])}`, forms.tu, forms.ustedes);
    }
  for (const [name, text, lang] of serverReplies())
    if (lang === "es" && markers(text).ustedes.length) found.push(`${name}: ustedes in a reply to one phone`);
  assert.deepEqual(found, []);
});

// The register the build writes on each page, for the scripts (site/client.js).
test("every page tells its scripts its form of address (<body data-register>), from site/lexicon.mjs", async () => {
  for (const [route] of routes)
    for (const lang of ["en", "es"]) {
      const file = `${lang === "es" ? "es/" : ""}${route ? route + "/" : ""}index.html`,
        html = await readFile(new URL(file, dist), "utf8");
      assert.match(html, new RegExp(`<body data-route="${route}" data-register="${registerFor(route)}">`), file);
    }
  assert.equal(registers[""], "ustedes");
  assert.equal(registers["rsvp/confirmed"], "ustedes");
  assert.equal(registerFor("account"), "tu");
});

// ---- (d) One date and time format ----
const months = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre";
const weekdays = "lunes|martes|miércoles|jueves|viernes|sábado|domingo";
function dateProblems(text, lang) {
  const out = [];
  for (const line of text.split("\n")) {
    if (lang === "es") {
      if (/\d:\d\d\s?[ap]\.m\./.test(line)) out.push(`“p.m.” without its space: ${line}`);
      if (/\d:\d\d\s?(?:AM|PM)\b/.test(line)) out.push(`English time: ${line}`);
      if (new RegExp(`\\b(?:${months.replace(/(^|\|)(\w)/g, (m, a, b) => a + b.toUpperCase())})\\b`).test(line)) out.push(`capitalized month: ${line}`);
      // A weekday takes a capital only at the start of a line or a sentence.
      const cap = new RegExp(`(^|.)(?:${weekdays.replace(/(^|\|)(\p{L})/gu, (m, a, b) => a + b.toUpperCase())})\\b`, "gu");
      for (const m of line.matchAll(cap)) if (m.index > 0 && !/[.!?¡¿]\s$/.test(line.slice(0, m.index + m[1].length))) out.push(`capitalized weekday mid-sentence: ${line}`);
      if (new RegExp(`\\b(?:${weekdays}),`, "i").test(line)) out.push(`comma after the weekday: ${line}`);
      if (/\(\d{1,2}\s(?:ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\b/i.test(line)) out.push(`short month: ${line}`);
    } else {
      if (/\d:\d\d\s?(?:[ap]\.m\.|[ap]m\b)/.test(line)) out.push(`lowercase am/pm: ${line}`);
      if (/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s\d{1,2}(?!,|\d|\))(?=\s\d{4})/.test(line)) out.push(`year without its comma: ${line}`);
    }
  }
  return out;
}
test("one date and time format: Spanish “viernes 15 de enero de 2027” and “4:00 p. m.” on every page, calendar file and email", async () => {
  const found = [];
  for (const [file, lang] of await guestPages()) for (const p of dateProblems(await pageText(file, lang), lang)) found.push(`${file}: ${p}`);
  for (const p of dateProblems(await notFoundSpanish(), "es")) found.push(`404.html (Spanish): ${p}`);
  for (const file of (await readdir(new URL("calendar/", dist), { recursive: true })).filter((f) => f.endsWith(".ics"))) {
    const text = (await readFile(new URL("calendar/" + file, dist), "utf8")).replace(/\r\n /g, "");
    for (const p of dateProblems(text.replace(/\\n/g, "\n"), file.startsWith("es/") ? "es" : "en")) found.push(`calendar/${file}: ${p}`);
  }
  for (const locale of ["en", "es"])
    for (const [name, mail] of emails(locale)) for (const p of dateProblems(mailText(mail), locale)) found.push(`${name}: ${p}`);
  assert.deepEqual(found, []);
});

test("dates and times are written only by site/datetime.mjs: no toLocaleString, toLocaleDateString or Intl.DateTimeFormat elsewhere", async () => {
  // lifecycle.mjs and now.mjs read the Fort Worth calendar day (numbers, not
  // words); datetime.mjs reads the wall-clock parts it writes from.
  const allowed = new Set(["site/datetime.mjs", "site/lifecycle.mjs", "site/now.mjs"]);
  const found = [];
  for (const dir of ["site", "server", "scripts", "emails"])
    for (const f of await readdir(new URL(dir + "/", root), { recursive: true })) {
      const file = `${dir}/${f}`;
      if (!/\.m?js$/.test(file) || allowed.has(file)) continue;
      (await source(file)).split("\n").forEach((line, n) => {
        if (/\.toLocale(?:Date|Time)?String\(|Intl\.DateTimeFormat|Intl\.RelativeTimeFormat/.test(line)) found.push(`${file}:${n + 1}`);
      });
    }
  assert.deepEqual(found, []);
});

// ---- (e) The first line and the one RSVP label ----
test("the home page's first line is “MIS XV AÑOS” in both languages, marked as Spanish on the English page", async () => {
  assert.equal(terms.eyebrow.en, "MIS XV AÑOS");
  for (const [file, attrs] of [
    ["index.html", ' lang="es"'],
    ["es/index.html", ""],
  ]) {
    const html = await readFile(new URL(file, dist), "utf8");
    assert.ok(html.includes(`<p class="eyebrow"${attrs}>${terms.eyebrow.es}</p>`), file);
  }
});

test("Spanish says “Confirmar asistencia” for the RSVP on every page, in the header pill, the page title and the emails' button; English says RSVP", async () => {
  const found = [];
  for (const [file, lang] of await guestPages()) {
    // The 404's Spanish copy waits in a <template> (checked by its own page).
    const html = drop((await readFile(new URL(file, dist), "utf8")).replace(/<template[\s\S]*<\/template>/, ""), `lang="${otherLanguage(lang)}"`);
    const want = say(terms.rsvpAction, lang);
    for (const m of html.matchAll(/<a\b[^>]*href="(?:\/es)?\/rsvp\/"[^>]*>([\s\S]*?)<\/a>/g)) {
      const label = entities(m[1].replace(/<span class="(?:arrow|ext)"[^>]*>[^<]*<\/span>/g, "").replace(/<[^>]+>/g, "")).trim();
      if (label !== want) found.push(`${file}: an RSVP link reads “${label}”`);
    }
    if (lang === "es" && />\s*RSVP\s*</.test(html.match(/<body[\s\S]*<\/body>/)[0])) found.push(`${file}: “RSVP” as Spanish text`);
  }
  assert.deepEqual(found, []);
  // The pill: one word that fits a phone, the rest for screen readers.
  const pill = (await readFile(new URL("es/index.html", dist), "utf8")).match(/<a class="nav-rsvp"[^>]*>([\s\S]*?)<\/a>/)[1];
  assert.equal(pill, `${terms.rsvpPill.es}<span class="visually-hidden">${terms.rsvpPillHidden.es}</span>`);
  assert.equal(terms.rsvpPill.es + terms.rsvpPillHidden.es, terms.rsvpAction.es);
  // The page's own title and heading.
  const rsvp = await readFile(new URL("es/rsvp/index.html", dist), "utf8");
  assert.match(rsvp, new RegExp(`<title>${terms.rsvpAction.es} · ${terms.siteName.es}</title>`));
  assert.match(rsvp, new RegExp(`<h1>${terms.rsvpAction.es}</h1>`));
  assert.match(await readFile(new URL("rsvp/confirmed/index.html", dist), "utf8"), new RegExp(`<h1>${terms.yourRsvp.en}</h1>`));
  assert.match(await readFile(new URL("es/rsvp/confirmed/index.html", dist), "utf8"), new RegExp(`<h1>${terms.yourRsvp.es.ustedes}</h1>`));
  // The invitation and the reminder: the same words on their button.
  for (const [name, mail] of emails("es"))
    if (/invitation|reminder/.test(name)) assert.match(mail.html, new RegExp(`>${terms.rsvpAction.es}</a>`), name);
});
