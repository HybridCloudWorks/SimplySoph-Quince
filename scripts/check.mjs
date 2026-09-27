import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { routes, adminRoutes } from "../site/content.mjs";
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
for (const page of pages) {
  const html = await readFile(path.join(root, page), "utf8");
  for (const [, url] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (!url.startsWith("/")) continue;
    let target = path.join(root, url.split("#")[0]);
    const info = await stat(target);
    if (info.isDirectory()) await stat(path.join(target, "index.html"));
  }
  if (
    !html.includes('id="main"') ||
    !html.includes('name="referrer" content="no-referrer"')
  )
    throw new Error(`Missing accessibility/privacy structure in ${page}`);
  if (/SOPHIA-DEMO|RSVP demonstration only/.test(html))
    throw new Error(`Demo content leaked into ${page}`);
}
console.log(`All ${pages.length} documents and local links/assets passed.`);
