// Images for the published site, made at build time from the family's artwork
// in site/assets/: AVIF, WebP and JPEG at the widths the pages show, the link
// preview card and the home-screen icons. Every file name carries a hash of its
// source and recipe, so Hosting can let browsers keep it for a year
// (firebase.json) and a changed picture always gets a new name. The hash is of
// the inputs, not the encoded bytes, so this build and the API image's build
// (Dockerfile) name the same picture the same way. Encoding AVIF is slow, so
// finished files are kept in .cache/images/ between local builds.
import sharp from "sharp";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

// Where the hashed files are published; firebase.json caches this folder.
export const imageDir = "assets/img/";
const encoders = {
  avif: ["avif", { quality: 50, effort: 2 }],
  webp: ["webp", { quality: 78 }],
  jpeg: ["jpg", { quality: 80, mozjpeg: true }],
};
// The wordmark's gold S on wine, drawn as a path so every icon looks the same
// whatever fonts the building machine has.
export const iconSvg = (size = 32) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}"><rect width="32" height="32" fill="#651625"/><path d="M20.4 9.6c-.9-1.6-2.6-2.5-4.6-2.5-2.8 0-4.9 1.8-4.9 4.1 0 2.3 1.8 3.4 4.4 4.6 2.9 1.3 4.2 2.4 4.2 4.4 0 2.4-2.2 4.1-5 4.1-2.4 0-4.2-1-5.2-2.8" transform="skewX(-12) translate(3.4 0)" fill="none" stroke="#e9c77b" stroke-width="2.2" stroke-linecap="round"/></svg>`;
// A .ico holding one 32-pixel PNG, for browsers and apps that only ask for
// /favicon.ico.
function ico(png) {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(1, 4);
  head.writeUInt8(32, 6);
  head.writeUInt8(32, 7);
  head.writeUInt16LE(1, 10);
  head.writeUInt16LE(32, 12);
  head.writeUInt32LE(png.length, 14);
  head.writeUInt32LE(22, 18);
  return Buffer.concat([head, png]);
}
export async function buildImages({ assets, out, cache }) {
  await mkdir(new URL(imageDir, out), { recursive: true });
  await mkdir(cache, { recursive: true });
  // Writes one file and returns its public path, reusing the cached bytes when
  // the same source and recipe were encoded before.
  async function emit(name, ext, inputs, render) {
    const key = createHash("sha256");
    for (const input of inputs) key.update(input);
    const file = `${name}.${key.digest("hex").slice(0, 10)}.${ext}`,
      cached = new URL(file, cache);
    let bytes = await readFile(cached).catch(() => null);
    if (!bytes) {
      bytes = await render();
      await writeFile(cached, bytes);
    }
    await writeFile(new URL(imageDir + file, out), bytes);
    return "/" + imageDir + file;
  }
  // One picture at several widths in each format, smallest first.
  async function picture(name, widths) {
    const source = await readFile(new URL(name + ".png", assets)),
      { width, height } = await sharp(source).metadata(),
      result = { width, height };
    for (const [format, [ext, options]] of Object.entries(encoders))
      result[format] = await Promise.all(
        widths
          .filter((w) => w <= width)
          .map(async (w) => [
            w,
            await emit(
              `${name}-${w}`,
              ext,
              [source, JSON.stringify([format, w, options])],
              () => sharp(source).resize({ width: w })[format](options).toBuffer(),
            ),
          ]),
      );
    return result;
  }
  // The invitation in each language: site/assets/invitation.png for English
  // and, once the family supplies it, invitation-es.png for the Spanish pages
  // and their link previews. Until then the Spanish pages use the English art.
  const spanishArt = await readFile(new URL("invitation-es.png", assets)).then(
    () => true,
    (e) => {
      if (e.code === "ENOENT") return false;
      throw e;
    },
  );
  const [invitationEn, invitationEs, church, reception] = await Promise.all([
    // Shown at most 365 CSS pixels wide (290 on phones); 1024 is the original,
    // linked as "Open the full invitation".
    picture("invitation", [400, 730, 1024]),
    spanishArt ? picture("invitation-es", [400, 730, 1024]) : null,
    picture("church", [480, 800]),
    picture("reception", [490, 980]),
  ]);
  // The link preview (WhatsApp, iMessage, Facebook): the invitation centered on
  // the home page's wine gradient, 1200 × 630.
  const card = async (name) => {
    const art = await readFile(new URL(name + ".png", assets));
    return emit("og-" + name, "jpg", [art, "og-1200x630-v1"], async () => {
      const card = await sharp(art).resize({ height: 570 }).toBuffer(),
        { width } = await sharp(card).metadata();
      return sharp(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><radialGradient id="g" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#7d2530"/><stop offset=".55" stop-color="#521421"/><stop offset="1" stop-color="#360d16"/></radialGradient></defs><rect width="1200" height="630" fill="url(#g)"/></svg>',
        ),
      )
        .composite([{ input: card, left: Math.round((1200 - width) / 2), top: 30 }])
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
    });
  };
  const ogEn = await card("invitation"),
    ogEs = spanishArt ? await card("invitation-es") : ogEn;
  const invitation = { en: invitationEn, es: invitationEs || invitationEn },
    og = { en: ogEn, es: ogEs };
  const icon = (size) => () =>
    sharp(Buffer.from(iconSvg(size))).png({ compressionLevel: 9 }).toBuffer();
  const touchIcon = await emit("apple-touch-icon", "png", [iconSvg(180)], icon(180)),
    favicon = await emit("favicon-32", "png", [iconSvg(32)], icon(32));
  await writeFile(new URL("favicon.ico", out), ico(await icon(32)()));
  return { invitation, church, reception, og, touchIcon, favicon };
}
// <picture> markup for one entry of buildImages(): AVIF, then WebP, then a JPEG
// <img> that carries the size, alt text (already escaped) and loading hints.
export function picture(image, { alt, sizes, loading = "lazy", priority, className = "" }) {
  const set = (list) => list.map(([w, url]) => `${url} ${w}w`).join(", ");
  const fallback = image.jpeg.find(([w]) => w >= 700) || image.jpeg.at(-1);
  return `<picture${className ? ` class="${className}"` : ""}><source type="image/avif" srcset="${set(image.avif)}" sizes="${sizes}"><source type="image/webp" srcset="${set(image.webp)}" sizes="${sizes}"><img src="${fallback[1]}" srcset="${set(image.jpeg)}" sizes="${sizes}" width="${image.width}" height="${image.height}" alt="${alt}" loading="${loading}" decoding="async"${priority ? ` fetchpriority="${priority}"` : ""}></picture>`;
}
