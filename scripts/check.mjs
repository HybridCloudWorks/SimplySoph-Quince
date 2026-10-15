import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { routes, adminRoutes, family, ready, waitsFor } from "../site/content.mjs";
import { exampleMarkers, previewRoutes } from "../site/preview-content.mjs";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);
const pages = [
  ...["", "es/"].flatMap((prefix) =>
    routes.map(([r]) => prefix + (r ? r + "/" : "") + "index.html"),
  ),
  ...adminRoutes.map(([r]) => r + "/index.html"),
  "404.html",
];
// Pages still waiting for the family's words: built, but linked from nowhere.
const waiting = Object.keys(waitsFor).filter((r) => !ready(r, family));
for (const page of pages) {
  const html = await readFile(path.join(root, page), "utf8");
  const local = [
    ...[...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]),
    // Responsive image candidates, and the absolute link-preview image.
    ...[...html.matchAll(/srcset="([^"]+)"/g)].flatMap((m) =>
      m[1].split(",").map((c) => c.trim().split(" ")[0]),
    ),
    ...[...html.matchAll(/content="https:\/\/misxv\.simplysoph\.com(\/assets\/[^"]+)"/g)].map((m) => m[1]),
  ];
  for (const url of local) {
    if (!url.startsWith("/")) continue;
    let target = path.join(root, url.split("#")[0]);
    const info = await stat(target);
    if (info.isDirectory()) await stat(path.join(target, "index.html"));
  }
  for (const route of waiting)
    if (!page.replace(/^es\//, "").startsWith(route + "/") && new RegExp(`href="(/es)?/${route}/"`).test(html))
      throw new Error(`${page} links to /${route}/, which has no family content yet`);
  // ↗ means "opens another site in a new tab" and nothing else.
  for (const [mark] of html.matchAll(/<a [^>]*>(?:(?!<\/a>)[\s\S])*?↗/g))
    if (!/^<a [^>]*target="_blank"/.test(mark))
      throw new Error(`↗ on a link that does not open a new tab in ${page}`);
  // The phone menu button must control the header's list.
  const controls = html.match(/class="menu-toggle"[^>]*aria-controls="([^"]+)"/)?.[1];
  if (!controls || !html.includes(`id="${controls}"`))
    throw new Error(`Header menu button is missing or controls nothing in ${page}`);
  if (
    !html.includes('id="main"') ||
    !html.includes('name="referrer" content="strict-origin-when-cross-origin"')
  )
    throw new Error(`Missing accessibility/privacy structure in ${page}`);
  if (/SOPHIA-DEMO|RSVP demonstration only/.test(html))
    throw new Error(`Demo content leaked into ${page}`);
  // The idea-book examples belong only to the admin preview (dist-preview/).
  for (const marker of exampleMarkers)
    if (html.includes(marker))
      throw new Error(`Example text "${marker}" leaked into ${page}`);
  if (html.includes("preview-banner"))
    throw new Error(`Preview banner leaked into ${page}`);
  if (/^(es\/)?registry\/index\.html$/.test(page)) {
    if (
      !html.includes("data-public-registries") ||
      !html.includes("https://www.target.com/gift-registry/gift/quincenera") ||
      html.includes('id="portal"')
    )
      throw new Error(`Registry must be available without sign-in in ${page}`);
  }
  const registryLink = html.match(/<a href="\/(?:es\/)?registry\/"[^>]*>/)?.[0];
  if (!registryLink || /\bhidden\b|data-permission/.test(registryLink))
    throw new Error(
      `Public Registry navigation is missing or restricted in ${page}`,
    );
}
// Follow relative imports between published scripts: a module the build forgot
// to copy otherwise passes the page checks and breaks only in the browser.
const scripts = new Set();
const pending = [];
for (const page of pages) {
  const html = await readFile(path.join(root, page), "utf8");
  for (const [, url] of html.matchAll(/<script[^>]+src="(\/[^"]+\.m?js)"/g))
    pending.push(path.join(root, url));
}
while (pending.length) {
  const file = pending.pop();
  if (scripts.has(file)) continue;
  scripts.add(file);
  const source = await readFile(file, "utf8").catch(() => {
    throw new Error(`Script not published: ${path.relative(root, file)}`);
  });
  for (const [, spec] of source.matchAll(
    /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"']+)["']/g,
  ))
    pending.push(path.resolve(path.dirname(file), spec));
}
// A merge that kept conflict markers still builds and tests green, so look for them.
const published = [
  ...scripts,
  ...["styles.css", "pages.css"].map((f) => path.join(root, f)),
];
for (const file of published)
  if (/^(<{7}|={7}|>{7})( |\r?$)/m.test(await readFile(file, "utf8")))
    throw new Error(`Merge conflict markers in ${path.relative(root, file)}`);
// An unclosed block silently scopes every later rule (it once hid the approved
// layouts inside the dark-mode media query), so braces must balance.
for (const file of ["styles.css", "pages.css"]) {
  const css = (await readFile(path.join(root, file), "utf8")).replace(
    /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
    "",
  );
  let depth = 0;
  for (const c of css) {
    if (c === "{") depth++;
    if (c === "}" && --depth < 0) break;
  }
  if (depth !== 0) throw new Error(`Unbalanced braces in ${file}`);
  // Fonts load from the page head; an @import would chain the requests.
  if (/@import/.test(css)) throw new Error(`@import in ${file}`);
}
// The admin preview exists for every approved page, says it is a preview, and
// actually shows the examples (an empty preview would hide a broken layout).
const previewDir = path.resolve(root, "../dist-preview");
for (const lang of ["en", "es"])
  for (const route of previewRoutes) {
    const html = await readFile(path.join(previewDir, lang, route + ".html"), "utf8");
    if (!html.includes('class="preview-banner"'))
      throw new Error(`Preview banner missing in ${lang}/${route}`);
    if (html.includes(`data-route="${route}"`) === false)
      throw new Error(`Preview page has the wrong route: ${lang}/${route}`);
  }
// The admin links (site/admin-experience.js) must name exactly the built previews.
const adminSource = await readFile(path.join(root, "admin-experience.js"), "utf8");
const linked = [
  ...(adminSource.match(/const previewPages = \[([\s\S]*?)\n\];/)?.[1] || "").matchAll(/\["([a-z-]+)",/g),
].map((m) => m[1]);
if (linked.join() !== previewRoutes.join())
  throw new Error(`Admin preview links (${linked}) differ from the built previews (${previewRoutes})`);
for (const [route, marker] of [
  ["sophia", "Example High School"],
  ["padrinos", "The Example Family"],
  ["travel", "Example Hotel North"],
  ["court", "Andrés G."],
])
  if (!(await readFile(path.join(previewDir, "en", route + ".html"), "utf8")).includes(marker))
    throw new Error(`The ${route} preview does not show the example "${marker}"`);
console.log(
  `All ${pages.length} documents, ${scripts.size} scripts and local links/assets passed, plus ${previewRoutes.length * 2} admin previews.`,
);
