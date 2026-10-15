import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  // The build's responsive images and icons (scripts/images.mjs).
  ".avif": "image/avif",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".ics": "text/calendar; charset=utf-8",
};
// Application errors (auth.mjs error()) carry a numeric HTTP status and a
// string code; anything else (GCS ApiError, ECONNRESET, bugs) is unexpected.
const expected = (e) =>
  !!e && Number.isInteger(e.status) && typeof e.code === "string";
// Structured log entry for API traffic. Paths only: query strings, bodies,
// cookies and invitation fragments are never logged.
function apiLog(log, req, res, started, error) {
  const status = res.statusCode,
    known = expected(error),
    entry = {
      severity: status >= 500 ? (known ? "WARNING" : "ERROR") : "INFO",
      message: `${req.method} ${req.logPath} ${status}`,
      httpRequest: {
        requestMethod: req.method,
        requestUrl: req.logPath,
        status,
        latency: ((performance.now() - started) / 1000).toFixed(3) + "s",
      },
    };
  if (known) entry.code = error.code;
  // Unexpected failures carry a stack so Error Reporting can group them.
  if (status >= 500 && error && !known)
    entry.stack_trace = String(error.stack || error).slice(0, 4000);
  log(entry);
}
// The site never asks for these device features; deny them to every frame.
// Kept identical to the Hosting header in firebase.json.
export const permissionsPolicy =
  "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), browsing-topics=()";
export function createHttpServer({ app = null, root, origin, log = null }) {
  // Upload bodies (up to 12 MB, held several times over while read and
  // parsed) being handled at once on this instance; more get a retryable
  // UPLOAD_BUSY, so parallel uploads cannot exhaust memory (re-audit).
  let uploads = 0;
  const maxUploads = 3,
    uploading = new Set();
  return http.createServer(async (req, res) => {
    const started = performance.now();
    let failure,
      holdsUpload = false,
      sessionId = null;
    if (log)
      res.on("finish", () => {
        if (req.logPath) apiLog(log, req, res, started, failure);
      });
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Origin only, never the path: Google sign-in checks the origin, and private
    // invitation and sign-in tokens live after the #, which is never sent.
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader("Permissions-Policy", permissionsPolicy);
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' https://accounts.google.com/gsi/; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://login.microsoftonline.com; frame-src 'self' https://accounts.google.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    );
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname.startsWith("/api/")) {
        req.logPath = url.pathname;
        if (!app)
          throw Object.assign(new Error(), {
            status: 503,
            code: "API_NOT_CONFIGURED",
          });
        if (!["GET", "POST"].includes(req.method))
          throw Object.assign(new Error(), {
            status: 405,
            code: "METHOD_NOT_ALLOWED",
          });
        let body;
        const webhook = [
          "/api/twilio/status",
          "/api/twilio/inbound",
          "/api/whatsapp/status",
          "/api/whatsapp/inbound",
        ].includes(url.pathname);
        // Cloud Scheduler sends no browser Origin; the app authenticates it
        // with a Google-signed OIDC token instead (server/scheduler.mjs).
        const internal = url.pathname === "/api/internal/drain";
        if (req.method === "POST") {
          if (!webhook && !internal && req.headers.origin !== origin)
            throw Object.assign(new Error(), {
              status: 403,
              code: "ORIGIN_REJECTED",
            });
          if (
            !(
              webhook
                ? /^application\/x-www-form-urlencoded(?:;|$)/i
                : /^application\/json(?:;|$)/i
            ).test(req.headers["content-type"] || "")
          )
            throw Object.assign(new Error(), {
              status: 415,
              code: "JSON_REQUIRED",
            });
          const upload = [
            "/api/photos",
            "/api/videos",
            "/api/admin/documents/upload",
          ].includes(url.pathname);
          // Uploads are only for signed-in visitors: without a current session
          // the body is refused before it is read, so strangers cannot hold
          // request slots or memory with large or slow uploads (re-audit).
          if (upload) {
            sessionId = /(?:^|;\s*)__session=/.test(req.headers.cookie || "")
              ? await app.canUpload(req.headers.cookie)
              : null;
            if (!sessionId)
              throw Object.assign(new Error(), {
                status: 401,
                code: "SIGN_IN_REQUIRED",
              });
            // One upload at a time per session (the page sends files one by
            // one), so a single sign-in cannot hold every slot (re-audit).
            if (uploads >= maxUploads || uploading.has(sessionId))
              throw Object.assign(new Error(), { status: 503, code: "UPLOAD_BUSY" });
            uploads++;
            uploading.add(sessionId);
            holdsUpload = true;
          }
          const chunks = [];
          let size = 0;
          // A body that stops arriving for 30 seconds is dropped. A slow but
          // steady upload from a phone keeps going, but an upload still
          // averaging under 16 KB a second after 15 seconds is dropped too, so
          // a trickle cannot hold a slot for the full request timeout.
          const idle = Object.assign(new Error(), { status: 408, code: "REQUEST_TIMEOUT" });
          const begun = Date.now();
          let timer = setTimeout(() => req.destroy(idle), 30000);
          try {
            for await (const chunk of req) {
              clearTimeout(timer);
              timer = setTimeout(() => req.destroy(idle), 30000);
              size += chunk.length;
              const elapsed = Date.now() - begun;
              if (upload && elapsed > 15000 && size / elapsed < 16)
                throw Object.assign(new Error(), { status: 408, code: "UPLOAD_TOO_SLOW" });
              if (size > (upload ? 12_000_000 : 120_000))
                throw Object.assign(new Error(), {
                  status: 413,
                  code: "BODY_TOO_LARGE",
                });
              chunks.push(chunk);
            }
          } finally {
            clearTimeout(timer);
          }
          try {
            const raw = Buffer.concat(chunks).toString();
            if (webhook) {
              if (size > 16000 || url.search) throw new Error();
              const fields = new URLSearchParams(raw);
              body = Object.fromEntries(fields);
              if ([...fields].length !== Object.keys(body).length)
                throw new Error();
            } else body = JSON.parse(raw);
            if (!body || typeof body !== "object" || Array.isArray(body))
              throw new Error();
          } catch {
            throw Object.assign(new Error(), {
              status: 400,
              code: "INVALID_JSON",
            });
          }
        }
        const result = await app.dispatch({
          path: url.pathname,
          query: Object.fromEntries(url.searchParams),
          method: req.method,
          body,
          headers: req.headers,
          ip: req.socket.remoteAddress || "unknown",
        });
        if (result.setCookie) {
          res.setHeader("Set-Cookie", result.setCookie);
          delete result.setCookie;
        }
        if (result.binary) {
          res.setHeader("Content-Type", result.contentType);
          if (result.disposition)
            res.setHeader("Content-Disposition", result.disposition);
          if (result.status) res.statusCode = result.status;
          if (result.contentRange)
            res.setHeader("Content-Range", result.contentRange);
          if (result.acceptRanges) res.setHeader("Accept-Ranges", "bytes");
          res.end(result.binary);
          return;
        }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(result));
        return;
      }
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405, { Allow: "GET, HEAD" });
        res.end();
        return;
      }
      if (url.pathname === "/healthz") {
        res.setHeader("Content-Type", "application/json");
        res.end(
          req.method === "HEAD"
            ? undefined
            : JSON.stringify({ status: "ok", mode: app ? "live" : "preview" }),
        );
        return;
      }
      let pathname;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        // A malformed %-escape is a bad request, not a server fault (SEC-14).
        throw Object.assign(new Error(), { status: 400, code: "BAD_PATH" });
      }
      const targetPath = path.resolve(root, "." + pathname);
      if (targetPath !== root && !targetPath.startsWith(root + path.sep))
        throw Object.assign(new Error(), { status: 403, code: "FORBIDDEN" });
      let target = targetPath,
        code = 200;
      try {
        if ((await stat(target)).isDirectory())
          target = path.join(target, "index.html");
        await stat(target);
      } catch {
        target = path.join(root, "404.html");
        code = 404;
      }
      res.statusCode = code;
      res.setHeader(
        "Content-Type",
        types[path.extname(target)] || "application/octet-stream",
      );
      res.end(req.method === "HEAD" ? undefined : await readFile(target));
    } catch (e) {
      failure = e;
      // Unexpected errors never leak provider or system codes to the client.
      res.statusCode = expected(e) ? e.status : 503;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({ error: expected(e) ? e.code : "SERVICE_UNAVAILABLE" }),
      );
    } finally {
      // Held until the upload has been handled, not only read.
      if (holdsUpload) {
        uploads--;
        uploading.delete(sessionId);
      }
    }
  });
}
