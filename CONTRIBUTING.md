# Contributing

This is the website for one family's celebration. Changes are made by the family and the people they invite to help, and the owner reviews and merges every pull request. If you are not one of them, an issue describing a problem you saw on the site is the most helpful thing you can send.

## Ground rules

- **This repository is public.** Never commit guest names, phone numbers, email addresses, invitation links or codes, exports from Notion, or any credential. Use made-up sample data in tests.
- **Nothing is sent to guests without a person confirming it.** Every invitation, reminder or notice on any channel (email, SMS, WhatsApp) goes through a preview and an explicit confirmation. Do not add scheduled, automatic or background sends to guests.
- **Report security problems privately.** See [SECURITY.md](SECURITY.md).

## Making a change

You need Node 24.

```powershell
npm ci
npm run check   # builds every page, runs the site checks and all tests
npm start       # http://127.0.0.1:4173/
```

1. Branch from `main`.
2. Keep each pull request to one purpose, and reference the issue it addresses (`Refs #123`, or `Closes #123` when merging completes the work).
3. Add or update tests in `tests/` for behaviour you change. `npm run check` must pass; the same command runs on every pull request.
4. Update the guide that describes what you changed (the README lists them).

`main` only accepts pull requests whose checks pass. Merging publishes the website, so the owner merges once the change has been reviewed.
