# Server implementation

Node 24 API entrypoint: `start.mjs`; HTTP boundary: `http.mjs`; workflows: `application.mjs`.

Use [deployment.md](../docs/deployment.md) for required settings and live acceptance. Without EVENT_BUCKET, the server serves the static preview and all API calls fail closed. There is no production memory-storage fallback, demo invitation or administrator bypass.

Storage commits use Google Cloud Storage generation preconditions. Notion projects accepted responses into additive website columns. Google and Microsoft ID tokens are verified server-side. Administrators are the owner in ADMIN_EMAILS plus the Notion rows ticked Administrator Eligible (admin-access.mjs), and administrators also pass an authenticator code, which a linked Microsoft sign-in can stand in for ([account-access.md](../docs/account-access.md)). Microsoft Graph submission is explicit and tracked independently of delivery. Authentication material stays server-side.

`npm run check` builds the pages and runs the workflow fixtures and provider contracts; providers are always faked in tests. Live checks are listed in the acceptance gate in [deployment.md](../docs/deployment.md#acceptance-gate-before-any-real-invitation).
