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
- **RSVP:** open the private link from their invitation (or type its code) and answer for their household, event by event, by **November 15, 2026**. They can change the answer until then and add the events to their calendar.
- **Sign in with their email:** the address the family has for their household, with a one-time emailed link, Google or Microsoft. No password. Signed in, they can share photos and videos, write in the guestbook, message the family and update their contact details.
- **Get updates on WhatsApp** (guests outside the US), once the family turns it on.

## How the family runs it

The guest list lives in **Notion**. The website reads it and writes the answers back, so there is one list and nothing is typed twice.

| To… | Do this |
|---|---|
| Add a household | Add a row to the Invitations database in Notion, with its people, counts and **Email** |
| Let someone else in the household sign in | Add their address to **Additional Emails** on that row |
| Send invitations | **Admin → Invitations**: create the private links, then review and send the emails |
| See who's coming | **Admin → Overview**: head counts per event, who answered and who hasn't |
| Record an answer taken by phone | Type **Yes** or **No** in that row's RSVP column in Notion, with the head counts |
| Make someone an administrator | Tick **Administrator Eligible** on their row. They set up an authenticator app at their first sign-in |
| Approve photos, read messages, plan seating | **Admin → Photo & video review**, **Messages**, **Seating** |

Administrators sign in at [misxv.simplysoph.com/admin/login/](https://misxv.simplysoph.com/admin/login/).

**Nothing is sent to guests without a person pressing Send.** The only automatic messages are a guest's own sign-in link, a confirmation of their RSVP, and WhatsApp's answers to STOP, START and HELP. If Notion is briefly unavailable, saved answers wait and are written to Notion as soon as it's back.

## Guides

**For the family**
- [Who can sign in, and how](ACCOUNT-ACCESS.md): guests, administrators, lost phones and recovery codes.
- [Every page and what it's for](PAGE-SCOPE.md).
- [How the website and Notion work together](NOTION-INTEGRATION.md).

**For whoever runs the website**
- [Deploying and operating it](DEPLOYMENT.md), including the checklist before invitations go out.
- [Publishing the site](PUBLISHING.md) · [WhatsApp](docs/whatsapp-activation.md) · [SMS and Twilio](docs/twilio-setup.md) · [Email](M365-EMAIL.md).
- [Decisions the family made](docs/v1/access-model.md) and the [design notes](docs/v1/README.md).
- [Retiring everything after the event](CLEANUP.md).

**History:** [WEBSITE-PLAN.md](WEBSITE-PLAN.md), [EMAIL-PLAN.md](EMAIL-PLAN.md), [TEAM-HANDOFF.md](TEAM-HANDOFF.md) and [GOOGLE-AI-STUDIO-PROMPT.md](GOOGLE-AI-STUDIO-PROMPT.md) record how the project started; the guides above describe how it works today.

## Still to come from the family

Some sections wait for the family's words and photos, and stay hidden until then: Sophia's story and portraits, the parents' message, the court of honor and padrinos, the dress code, parking and children's details, hotels and airport tips, registry links, and, after the event, the thank-you note and highlight video. Nothing is invented in the meantime.

## For developers

You need Node 24.

```powershell
npm ci
npm run check   # builds every page and runs all checks and tests
npm start       # http://127.0.0.1:4173/
```

Without the production settings, every page works and sign-in and RSVP are switched off. `npm run emails:preview` shows sample emails without sending anything. Pushes to `main` publish the website after the checks pass; pull requests only run the checks.

The site's pages are built from `site/` by `scripts/build-pages.mjs`; the RSVP and sign-in service lives in `server/`. How it is hosted and configured is in [DEPLOYMENT.md](DEPLOYMENT.md).

This repository is public. Guest lists, invitation links, exports and passwords never go in it.
