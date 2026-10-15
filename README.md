# Sophia's Mis XV

[![Website and service checks](https://github.com/HybridCloudWorks/SimplySoph-Quince/actions/workflows/check.yml/badge.svg?branch=main)](https://github.com/HybridCloudWorks/SimplySoph-Quince/actions/workflows/check.yml)
[![Website](https://img.shields.io/website?url=https%3A%2F%2Fmisxv.simplysoph.com&label=website)](https://misxv.simplysoph.com)
![Celebration](https://img.shields.io/badge/celebration-January%2015%2C%202027-7a1f35)
![RSVP by](https://img.shields.io/badge/RSVP%20by-November%2015%2C%202026-b8892b)
![Languages](https://img.shields.io/badge/languages-English%20%7C%20Espa%C3%B1ol-2f5d50)
![Last commit](https://img.shields.io/github/last-commit/HybridCloudWorks/SimplySoph-Quince/main)

The bilingual website for **Sophia Isabel's quinceañera**, on **Friday, January 15, 2027** in Fort Worth, Texas.

**Visit it:** [misxv.simplysoph.com](https://misxv.simplysoph.com) · [en español](https://misxv.simplysoph.com/es/)

## What guests can do

- **Read about the celebration:** the schedule, the church and reception, travel, and answers to common questions, all in English and Spanish.
- **RSVP:** open the private link from their invitation (or paste it, or type its code) and answer for their household by **November 15, 2026**: one tap for **Everyone's coming** or **We can't make it** (or the matching links in the invitation email), or event by event. Nothing is saved until they confirm, and answers in progress survive a reload. They can change the answer until the deadline, get a receipt that repeats it, and add the events to their calendar.
- **Sign in with their email:** the address where they received their invitation, with a one-time emailed link (in their language), Google or Microsoft. No password; the link brings them back to the page they started from. Signed in, they can see their RSVP, share photos and videos, write in the guestbook, message the family and update their contact details.
- **Get text updates** (US and Canada): text SOPHIA to the number on the [SMS page](https://misxv.simplysoph.com/sms/).
- **Get updates on WhatsApp** (guests outside the US), once the family turns it on.

## How the family runs it

The guest list lives in **Notion**. The website reads it and writes the answers back, so there is one list and nothing is typed twice.

| To… | Do this |
|---|---|
| Add a household | Add a row to the Invitations database in Notion, with its people, counts and **Email** |
| Let someone else in the household sign in | Add their address to **Additional Emails** on that row |
| Send invitations | **Admin → Invitations**: create the private links, then review and send the emails |
| Send text reminders | **Admin → Communications → SMS reminders**: every household's status, a test to your own phone, then a reviewed batch |
| See who's coming | **Admin → Overview**: head counts per event, who answered and who hasn't |
| Record an answer taken by phone | Type **Yes** or **No** in that row's RSVP column in Notion, with the head counts |
| Make someone an administrator | Tick **Administrator Eligible** on their row. They set up an authenticator app at their first sign-in |
| Approve photos, read messages, plan seating | **Admin → Photo & video review**, **Messages**, **Seating** |

Administrators sign in at [misxv.simplysoph.com/admin/login/](https://misxv.simplysoph.com/admin/login/).

**Nothing is sent to guests without a person pressing Send.** The only automatic messages are a guest's own sign-in link, a confirmation of their RSVP, the registered welcome text when someone first texts SOPHIA, and the answers to STOP, START and HELP. If Notion is briefly unavailable, saved answers wait and are written to Notion as soon as it's back.

## Guides

**For the family**
- [Who can sign in, and how](docs/account-access.md): guests, administrators, lost phones and recovery codes.
- [Every page and what it's for](docs/page-scope.md) and [what each admin tab does](docs/admin-workspaces.md).
- [How the website and Notion work together](docs/notion-integration.md).

**For whoever runs the website**
- [Deploying and operating it](docs/deployment.md), including configuration, email and the checklist before invitations go out.
- [Publishing the site](docs/publishing.md) · [SMS and Twilio](docs/twilio-setup.md) · [WhatsApp](docs/whatsapp-activation.md) · [Email](docs/email.md).
- [Retiring everything after the event](docs/cleanup.md).

**Records:** the [decisions the family made](docs/v1/access-model.md), the [design notes](docs/v1/README.md), the [registered SMS wording](docs/sms-campaign-registration.md), and [how the project started](docs/history/) (kept for reference, not current).

## Still to come from the family

Some sections wait for the family's words and photos, and stay hidden until then: Sophia's story and portraits, the parents' message, the court of honor and padrinos, the dress code, parking and children's details, hotels and airport tips, registry links, and, after the event, the thank-you note and highlight video. Nothing is invented in the meantime. Their pages aren't linked from the menu or anywhere else until the content is added to `site/content.mjs`; the next build links them by itself (see [page-scope.md](docs/page-scope.md)).

## For developers

You need **Node 24**. To process uploaded videos locally you also need `ffmpeg` on your path (the production image installs it).

```powershell
npm ci
npm run check   # builds every page and runs all checks and tests
npm start       # http://127.0.0.1:4173/
```

Without the production settings every page works and sign-in and RSVP are switched off. The settings are listed in [.env.example](.env.example) and explained in [docs/deployment.md](docs/deployment.md). `npm run emails:preview` shows sample emails without sending anything.

`npm run test:browser` runs the guest RSVP and administrator sign-in journeys in Chromium against the built pages and the real API, with in-memory stand-ins for storage, Notion and email and only made-up guests ([tests/browser/harness.mjs](tests/browser/harness.mjs)). Install the browser once with `npx playwright install chromium`.

The pages are built from `site/` by `scripts/build-pages.mjs`, which also makes the optimized images and link-preview card with `scripts/images.mjs` (the first build takes a few seconds longer; encoded images are kept in `.cache/`); the RSVP and sign-in service lives in `server/`. Pull requests run the checks. Merging to `main` publishes the static website automatically once the checks pass; the API is deployed by hand, as described in [docs/deployment.md](docs/deployment.md).

## Contributing, support and security

- **Contributing:** see [CONTRIBUTING.md](CONTRIBUTING.md). This repository is public: guest lists, invitation links, exports and passwords never go in it.
- **Guests with a question** about the celebration can use the website's [contact page](https://misxv.simplysoph.com/contact/).
- **Something broken on the site?** Open an issue, without any guest details.
- **Security problems:** report them privately, as described in [SECURITY.md](SECURITY.md).

## License

The **code** is available under the [MIT License](LICENSE).

The **family's content is not**: the photographs and artwork in `site/assets/`, the names and details of the family and guests, and the written text about the celebration are © 2026 Simply Soph Media, all rights reserved. After the event the repository will be cleaned of this content and turned into a reusable template.
