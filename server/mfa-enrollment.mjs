import QRCode from "qrcode";
// First-time authenticator setup as a standard otpauth:// key URI and QR code.
// Google Authenticator and Microsoft Authenticator both scan it (TOTP, SHA-1,
// 6 digits, 30 seconds: the parameters verifyTotp checks). The text key stays
// in the response for people setting up on the same phone.
export function provisioningUri(secret, email) {
  const issuer = "SimplySoph";
  return `otpauth://totp/${issuer}:${encodeURIComponent(email)}?${new URLSearchParams(
    { secret, issuer, algorithm: "SHA1", digits: "6", period: "30" },
  )}`;
}
export async function enrollment(secret, email) {
  const uri = provisioningUri(secret, email);
  return {
    enrollmentSecret: secret,
    provisioningUri: uri,
    // Black on white with a quiet zone, so phones scan it in dark mode too.
    provisioningQr: await QRCode.toDataURL(uri, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 240,
      color: { dark: "#000000ff", light: "#ffffffff" },
    }),
  };
}
