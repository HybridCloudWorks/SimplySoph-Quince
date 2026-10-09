// Microsoft and Google sign-in in the browser. Microsoft uses the authorization
// code flow with PKCE (no client secret); the ID token goes to the API, which
// verifies the signature, tenant and one-time nonce (server/auth.mjs). The
// purpose ("admin" or "guest") is sealed into the server's ticket, so a guest
// sign-in can never be replayed on the administrator route.
import { api, tr, es } from "./client.js";
const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0",
  KEY = "misxv-microsoft-sign-in";
const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const random = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
const again = () =>
  new Error(
    tr(
      "Microsoft sign-in did not finish. Please start again.",
      "El acceso con Microsoft no terminó. Vuelve a intentarlo.",
    ),
  );
export async function startMicrosoft(clientId, purpose) {
  const { nonce, ticket } = await api("auth/sso/start", { purpose }),
    state = random(),
    verifier = random(),
    challenge = b64url(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ),
    redirect = location.origin + location.pathname;
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ state, verifier, ticket, purpose, redirect }),
    );
  } catch {
    throw new Error(
      tr(
        "This browser blocked sign-in storage. Use the emailed sign-in link instead.",
        "Este navegador bloqueó el almacenamiento del acceso. Usa el enlace por correo.",
      ),
    );
  }
  location.assign(
    AUTHORITY +
      "/authorize?" +
      new URLSearchParams({
        client_id: clientId,
        response_type: "code",
        response_mode: "fragment",
        redirect_uri: redirect,
        scope: "openid profile email",
        state,
        nonce,
        code_challenge: challenge,
        code_challenge_method: "S256",
        prompt: "select_account",
        ui_locales: es ? "es" : "en",
      }),
  );
}
// The parameters of a Microsoft return on this page load, or null.
export function microsoftReturn() {
  const p = new URLSearchParams(location.hash.slice(1));
  return p.has("state") && (p.has("code") || p.has("error")) ? p : null;
}
export async function finishMicrosoft(clientId, purpose, params) {
  history.replaceState(null, "", location.pathname);
  let saved = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
    sessionStorage.removeItem(KEY);
  } catch {
    /* handled below */
  }
  if (
    !saved ||
    saved.state !== params.get("state") ||
    saved.purpose !== purpose ||
    params.get("error")
  )
    throw again();
  let data = {};
  try {
    const r = await fetch(AUTHORITY + "/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: "authorization_code",
        code: params.get("code"),
        redirect_uri: saved.redirect,
        code_verifier: saved.verifier,
        scope: "openid profile email",
      }),
    });
    data = await r.json();
  } catch {
    throw again();
  }
  if (!data.id_token) throw again();
  return { credential: data.id_token, ticket: saved.ticket };
}
export function microsoftButton(label) {
  return `<button type="button" class="button sso-button" data-sso="microsoft"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 21 21"><path fill="#f25022" d="M1 1h9v9H1z"/><path fill="#7fba00" d="M11 1h9v9h-9z"/><path fill="#00a4ef" d="M1 11h9v9H1z"/><path fill="#ffb900" d="M11 11h9v9h-9z"/></svg>${label}</button>`;
}
// Google's own button; the credential callback receives an ID token.
export function googleButton(target, clientId, onCredential, onError) {
  const script = document.createElement("script");
  script.src = "https://accounts.google.com/gsi/client";
  script.onload = () => {
    google.accounts.id.initialize({
      client_id: clientId,
      callback: (result) => onCredential(result.credential),
    });
    google.accounts.id.renderButton(target, {
      theme: "outline",
      size: "large",
      locale: es ? "es" : "en",
    });
  };
  script.onerror = () =>
    onError(
      tr(
        "Google sign-in could not load. Please retry.",
        "No se pudo cargar el acceso con Google. Inténtalo de nuevo.",
      ),
    );
  document.head.append(script);
}
