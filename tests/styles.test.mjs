// The stylesheets' standing rules (site/styles.css, site/pages.css), read as
// text, no browser: figures stay lining because no serif rule uses a font:
// shorthand (it would reset them), breakpoints follow the text size, the
// header's breakpoint is written once, and every hover, pressed and focus
// colour keeps its contrast in both the light and the night palette.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const site = (name) => readFile(new URL("../site/" + name, import.meta.url), "utf8");
const uncomment = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const sheets = async () => ({
  "styles.css": uncomment(await site("styles.css")),
  "pages.css": uncomment(await site("pages.css")),
});

test("no serif rule uses the font: shorthand, and lining figures are the inherited default", async () => {
  // In Chromium, font: resets font-variant-numeric (and font-feature-settings)
  // to normal, which brings back Cormorant's old-style figures (1 → I, 0 → o).
  for (const [name, css] of Object.entries(await sheets())) {
    const shorthands = [...css.matchAll(/(?:^|[;{\s])font\s*:\s*([^;}]*)/g)].map((m) => m[1].trim());
    const serif = shorthands.filter((v) => /var\(--serif\)|Cormorant/i.test(v));
    assert.deepEqual(serif, [], `${name}: write serif fonts as longhands (font-family, font-size, …)`);
  }
  const body = (await sheets())["styles.css"].match(/(?:^|\n)body\s*\{([^}]*)\}/)[1];
  assert.match(body, /font-variant-numeric:\s*lining-nums/);
  // One text scale: running text in rem, like the labels and headings.
  assert.match(body, /font-size:\s*1rem/);
  assert.doesNotMatch(body, /font(-size)?:[^;]*\dpx/);
  assert.match(body, /overflow-wrap:\s*break-word/);
});

test("width breakpoints are in em, and the header's is written once", async () => {
  // A media query's em is the browser's own font size, so with larger text
  // the compact layouts come in at wider screens.
  for (const [name, css] of Object.entries(await sheets()))
    assert.deepEqual(
      [...css.matchAll(/@media[^{]*?\b(?:min|max)-width\s*:\s*[\d.]+px/g)].map((m) => m[0]),
      [],
      name,
    );
  // site/nav.js reads the breakpoint from the stylesheet's effect (the Menu
  // button hidden), so it cannot drift from styles.css.
  const nav = await site("nav.js");
  assert.doesNotMatch(nav, /(?:min|max)-width/);
  assert.match((await sheets())["styles.css"], /@media \(max-width: 67\.5em\)\s*\{\s*\.header-bar/);
});

// ---- Token contrast ----
const hex = (value) => {
  let h = value.trim().replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  assert.match(h, /^[0-9a-f]{6}$/i, `an opaque colour: ${value}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const luminance = (rgb) =>
  rgb
    .map((v) => v / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => {
  const [x, y] = [luminance(hex(a)), luminance(hex(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const properties = (block) =>
  Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
async function palettes() {
  const { "styles.css": styles, "pages.css": pages } = await sheets();
  const light = properties(styles.match(/:root\s*\{([^}]*)\}/)[1]);
  const darkMedia = pages.slice(pages.indexOf("@media (prefers-color-scheme: dark)"));
  const dark = { ...light, ...properties(darkMedia.match(/:root\s*\{([^}]*)\}/)[1]) };
  const resolve = (tokens) => (value) => {
    for (let i = 0; i < 5 && /var\(/.test(value); i++)
      value = value.replace(/var\((--[\w-]+)\)/g, (_, name) => tokens[name]);
    return value === "white" ? "#ffffff" : value;
  };
  return { light: resolve(light), dark: resolve(dark) };
}

test("hover, pressed and focus colours keep their contrast in the light and night palettes", async () => {
  const { light, dark } = await palettes();
  // [text, background, minimum, what] — text on each state fill. The burgundy
  // button's text is white on light and the night ink in dark mode; the gold
  // pill's text is --dark (the hero's RSVP uses the night ink in dark mode).
  const pairs = (t, burgundyText, heroText) => [
    [burgundyText, "--wine", 4.5, "burgundy button at rest"],
    [burgundyText, "--wine-hover", 4.5, "burgundy button, hover"],
    [burgundyText, "--wine-active", 4.5, "burgundy button, pressed"],
    ["--dark", "--gold-hover", 4.5, "RSVP pill, hover"],
    ["--dark", "--gold-active", 4.5, "RSVP pill, pressed"],
    [heroText, "--gold-hover", 4.5, "hero RSVP, hover"],
    [heroText, "--gold-active", 4.5, "hero RSVP, pressed"],
    ["--ink", "--tint-hover", 4.5, "outline button, hover"],
    ["--ink", "--tint-active", 4.5, "outline button, pressed"],
    ["--wine", "--tint-hover", 4.5, "question row, hover"],
    ["--wine", "--tint-active", 4.5, "question row, pressed"],
    ["--cream", "--dark-hover", 4.5, "language and Menu pills, hover"],
    ["--cream", "--dark-active", 4.5, "language and Menu pills, pressed"],
    ["--gold", "--dark-active", 4.5, "schedule strip times, pressed"],
    ["--dark", "--cream", 4.5, "open Menu button"],
    ["--dark", "--gold-hover", 4.5, "open Menu button, hover"],
    ["--wine-active", t.page, 4.5, "text button, pressed, on the page"],
    ["--wine-active", "--surface", 4.5, "text button, pressed, on a panel"],
    // Focus rings (WCAG 1.4.11, 3:1): wine on the page and panels, gold on the
    // dark surfaces that set --focus.
    ["--wine", t.page, 3, "focus ring on the page"],
    ["--wine", "--surface", 3, "focus ring on a panel"],
    ["--gold", "--dark", 3, "focus ring on a dark surface"],
  ];
  for (const [name, resolve, t] of [
    ["light", light, { page: "--cream", burgundy: "white", hero: "--dark" }],
    ["dark", dark, { page: "--night", burgundy: "--night-ink", hero: "--night-ink" }],
  ])
    for (const [text, background, minimum, what] of pairs(t, t.burgundy, t.hero)) {
      const colour = (v) => resolve(v.startsWith("--") ? `var(${v})` : v),
        ratio = contrast(colour(text), colour(background));
      assert.ok(ratio >= minimum, `${name}: ${what} is ${ratio.toFixed(2)}:1, needs ${minimum}:1`);
    }
  // Every state token has a value of its own in the night palette.
  const { "pages.css": pages } = await sheets();
  const night = pages.slice(pages.indexOf("@media (prefers-color-scheme: dark)"));
  for (const token of ["--wine-hover", "--wine-active", "--gold-hover", "--gold-active", "--tint-hover", "--tint-active", "--dark-hover", "--dark-active", "--backdrop"])
    assert.match(night, new RegExp(token + ":"), token);
});
