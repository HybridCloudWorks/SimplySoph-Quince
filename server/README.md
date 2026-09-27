# Server implementation

Node 24 API entrypoint: `start.mjs`; HTTP boundary: `http.mjs`; workflows: `application.mjs`.

Use DEPLOYMENT.md for required settings and live acceptance. Without EVENT_BUCKET, the server serves the static preview and all API calls fail closed. There is no production memory-storage fallback, demo invitation or administrator bypass.

Storage commits use Google Cloud Storage generation preconditions. Notion projects accepted responses into additive website columns. Google ID tokens are verified server-side; allowlisted admin identities also require TOTP. Microsoft Graph submission is explicit and tracked independently of delivery. Authentication material stays server-side.

`npm test` exercises workflow fixtures and provider contracts. Live provider tests remain separate and must be recorded explicitly in VALIDATION.md.
