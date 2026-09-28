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
  ".txt": "text/plain; charset=utf-8",
  ".ics": "text/calendar; charset=utf-8",
};
export function createHttpServer({ app = null, root, origin }) {
  return http.createServer(async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' https://accounts.google.com/gsi/; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com; frame-src 'self' https://accounts.google.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    );
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname.startsWith("/api/")) {
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
        if (req.method === "POST") {
          if (req.headers.origin !== origin)
            throw Object.assign(new Error(), {
              status: 403,
              code: "ORIGIN_REJECTED",
            });
          if (
            !/^application\/json(?:;|$)/i.test(
              req.headers["content-type"] || "",
            )
          )
            throw Object.assign(new Error(), {
              status: 415,
              code: "JSON_REQUIRED",
            });
          const chunks = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (
              size >
              ([
                "/api/photos",
                "/api/videos",
                "/api/admin/documents/upload",
              ].includes(url.pathname)
                ? 12_000_000
                : 120_000)
            )
              throw Object.assign(new Error(), {
                status: 413,
                code: "BODY_TOO_LARGE",
              });
            chunks.push(chunk);
          }
          try {
            body = JSON.parse(Buffer.concat(chunks).toString());
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
      const pathname = decodeURIComponent(url.pathname),
        targetPath = path.resolve(root, "." + pathname);
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
      res.statusCode = e.status || 503;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: e.code || "SERVICE_UNAVAILABLE" }));
    }
  });
}
