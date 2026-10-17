// The printable table card: a QR code to /share/#party=<code> with a short
// bilingual caption, as one SVG an administrator downloads and prints. It is
// drawn only when the card is created or its code is changed: the code is
// not kept (only its hash), so the card cannot be drawn again later.
import QRCode from "qrcode";
import { terms } from "../site/lexicon.mjs";

const W = 600,
  H = 840,
  QR = 440;
const text = (y, size, value, weight = 400) =>
  `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${size}" font-weight="${weight}" fill="#351e21">${value}</text>`;
export async function tableCardSvg(url) {
  const qr = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
  // The library's <svg> nested in the card, placed and sized.
  const placed = qr.replace(
    /^<svg /,
    `<svg x="${(W - QR) / 2}" y="150" width="${QR}" height="${QR}" `,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fffcf5"/><rect x="12" y="12" width="${W - 24}" height="${H - 24}" fill="none" stroke="#651625" stroke-width="3"/>${text(78, 40, terms.sharePhotos.en, 700)}${text(124, 32, terms.sharePhotos.es, 700)}${placed}${text(650, 24, "Scan with your phone’s camera")}${text(686, 24, "Escanea con la cámara de tu teléfono")}${text(748, 20, "We review every photo before our guests can see it.")}${text(780, 20, "Revisamos cada foto antes de que la vean los invitados.")}</svg>`;
}
