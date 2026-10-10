import { OAuth2Client } from "google-auth-library";

// Cloud Scheduler calls POST /api/internal/drain with a Google-signed OIDC ID
// token minted for a dedicated service account. The API is publicly invokable
// (Firebase Hosting rewrites to it), so the app verifies the token itself:
// Google signature, issuer and expiry (verifyIdToken), the exact audience, and
// the exact verified caller email. Returns null when not configured, which
// leaves the route disabled.
export function schedulerVerifier(
  audience,
  serviceAccount,
  client = new OAuth2Client(),
) {
  if (!audience || !serviceAccount) return null;
  const caller = serviceAccount.toLowerCase();
  return async (authorization) => {
    const bearer = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(
      authorization || "",
    );
    if (!bearer) return false;
    try {
      const p = (
        await client.verifyIdToken({ idToken: bearer[1], audience })
      ).getPayload();
      return p?.email_verified === true && p.email?.toLowerCase() === caller;
    } catch {
      return false;
    }
  };
}
