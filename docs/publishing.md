# Published website

The multi-page website is live at **https://misxv.simplysoph.com** and **https://misxv-simplysoph.web.app**. Each build contains every English and Spanish page plus a 404 document. Normal HTTPS validation succeeds on the custom domain.

The Cloud Run RSVP and sign-in service is deployed and connected through `/api/**`, and unauthenticated private endpoints reject access. Before distributing invitations, run the live acceptance checklist in [deployment.md](deployment.md): real email delivery, administrator and guest sign-in, Notion projection and media moderation. Those checks do not block publishing page improvements.

## Automatic publishing

`.github/workflows/check.yml` runs the Node 24 checks and production dependency audit. After those succeed on a push to `main`, its dependent production job builds the same commit and publishes only `misxv-simplysoph`. PRs and other branches cannot deploy. Main is the only production release branch; retired feature branches cannot publish.

The job serializes production releases, skips superseded commits, and verifies `X-Release-Commit` on the real custom domain. Its Actions summary records the source commit and Firebase release. A failed deployment leaves the previous release live and marks the job failed; inspect release history if failure occurs after the API created the release.

Google authentication uses short-lived GitHub OIDC with repository ID 1389834350, owner ID 312844660 (the HybridCloudWorks organization, since the repository moved from the personal account whose ID was 34853639), main ref, push event and exact workflow path. Moving the repository again changes the owner ID, so the provider's attribute condition must be updated, and the publish job fails with `unauthorized_client` until it is. There is no stored service-account key. The dedicated Hosting custom role contains only Hosting get/update permissions. A separate custom role grants only `run.services.get` on the single `misxv-api` service so Hosting can validate its API rewrite, with no site creation/deletion, guest data, secrets, email or project administration access. Firebase Hosting IAM is project-level: the event-site restriction is enforced in the reviewed publisher code, not a site-level IAM boundary. Protect write access to the release branches and workflow. All identities, trust objects, the custom role and bindings are in the cleanup inventory.

The REST publisher preserves only the reviewed `/api/**` rewrite to `misxv-api` in `us-central1` and rejects unsupported routing configuration. API-specific Hosting headers preserve `private, no-store` and cookie variation; this was verified through the custom domain. Reference: [Firebase Hosting REST deployment](https://firebase.google.com/docs/hosting/api-deploy).

PR #2 is merged into main and its feature branch is retired. Production publishing trusts only main.

## Link previews follow the celebration's phase

The pages themselves follow the date in the browser, on the server's clock (`site/now.mjs`, `site/lifecycle.mjs`): the answered home page, "Until the celebration", the day-of and evening views, the thank-you after the party, and the closed RSVP. Nothing needs publishing for those.

Link previews are different. WhatsApp, iMessage and Facebook read only the `<meta>` tags in the published HTML, so the build chooses their text for the phase at build time (`node scripts/build-pages.mjs`, which uses the real time unless `--now=<ISO>` is given):

| Phase at build time | Home and RSVP preview | Every page |
|---|---|---|
| Before November 15, 2026, 11:59 PM Central | "Friday, January 15, 2027 in Fort Worth, Texas. Please RSVP by Sunday, November 15, 2026." | `<meta name="misxv-phase" content="rsvp-open">` |
| From the deadline to the end of the party | "Friday, January 15, 2027 in Fort Worth, Texas." (no RSVP line anywhere) | `rsvp-closed`, `day-of` or `live` |
| From January 16, 2027, 12:30 AM Central | "Thank you for celebrating with us on Friday, January 15, 2027." | `after` |

Share your photos, the gallery, the note for Sophia and the thank-you page have previews without any date, the same in every phase, so a link to them shared in January never carries a stale invitation. The tests build with a pinned `--now` (package.json), so the calendar never changes what they check.

### Owner runbook: two re-publishes

The site is published only by a push to `main`, so the previews change at the next publish after each boundary. If nothing is merged in the hours after a boundary, re-run the latest publish:

1. After **Sunday, November 15, 2026, 11:59 PM Central**, and again after **Saturday, January 16, 2027, 12:30 AM Central** (the end of the reception), open GitHub → Actions → **Website and service checks**, choose the most recent run on `main` and select **Re-run all jobs**. Re-run the latest one: an older run's publish step skips itself because `main` has moved on.
2. When it finishes, check the phase the live site was built in:
   `curl -s https://misxv.simplysoph.com/ | grep -o '<meta name="misxv-phase" content="[^"]*">'`
   It should say `rsvp-closed` after the first re-run and `after` after the second. The job's own check compares only `X-Release-Commit`, which is the same commit before and after a re-run, so this line is the one that shows the new release is live.
3. Send a link to the home page to yourself on WhatsApp to see the preview. Previews already sent keep the old text; apps such as Facebook can keep a preview for days.

If the re-run's checks fail on something unrelated to the site (for example a new advisory in `npm audit`), fix that first; the deploy job runs only after the checks pass.

### Automatic publishing at the boundaries (owner decision, not built)

A scheduled workflow could re-publish at both boundaries without a person, but today's deploy safeguards deliberately refuse it, and only the owner can relax them:

1. `.github/workflows/check.yml` runs the deploy job only when `github.event_name == 'push'` on `main`.
2. `scripts/deploy-hosting.mjs` (`assertReleaseContext`) refuses any release whose `GITHUB_EVENT_NAME` is not `push`.
3. The Workload Identity Federation provider admits only push events on `main` running `check.yml` (its attribute condition, set in Google Cloud, outside this repository).

If the owner wants it, the safe shape is a separate workflow (schedule plus a manual button) admitted by name and branch in all three places, publishing only a commit whose checks already passed and verifying `misxv-phase` as well as `X-Release-Commit`. GitHub's scheduled runs are best-effort (they can start late) and are switched off after 60 days without repository activity, so the manual re-run above stays the fallback.

## Images and caching

The build makes every published image from the originals in `site/assets/` (`scripts/images.mjs`): AVIF, WebP and JPEG at the widths the pages show, the 1200 × 630 link-preview card used by WhatsApp and iMessage, the 180px home-screen icon, a 32px favicon and `/favicon.ico`. They are published under `/assets/img/` with a hash in each name, so `firebase.json` lets browsers keep that folder for a year (`public, max-age=31536000, immutable`); a changed picture gets a new name. Everything else (pages, scripts, stylesheets, calendars) keeps `public, max-age=0, must-revalidate`, and `/api/**` stays `private, no-store`. The original PNGs are no longer published; "Open the full invitation" opens the 1024px JPEG.

To replace a picture, change the file in `site/assets/` and publish; the pages pick up the new names. WhatsApp and other apps cache a link's preview, so a link shared earlier may show the old card for a while.

**Spanish invitation art.** The Spanish pages use `site/assets/invitation-es.png` (the same size and shape as `invitation.png`, about 1024 px wide) for the home page's invitation, its "Open the full invitation" link and the Spanish link preview. Until that file exists they use the English `invitation.png`. A corrected English version simply replaces `invitation.png`. No artwork is made here: both files come from the family.

## Family content that is on its way

Several pages promise something the family has not supplied yet: the dress code (Schedule and Questions), hotel and airport suggestions (Travel) and parking (each venue page). Each promise is written once, in `site/promises.mjs`, and every page that makes it (and the "What's next" lines on the RSVP confirmation and My account) reads the family's data in `family` in `site/content.mjs`. Nothing is invented while a value is empty; each slot below shows nothing, or today's wording, until the family decides.

| Family decision | Where it goes (`site/content.mjs` `family`) | What changes on the next publish |
|---|---|---|
| The day each promised item will be posted | `promises.dressCode.by`, `promises.hotels.by`, `promises.parking.by` as `"YYYY-MM-DD"` | Every place says "We'll post … here by Tuesday, December 1, 2026" / "Publicaremos aquí … a más tardar el martes 1 de diciembre de 2026"; the confirmation and My account say the same. A date that has passed goes back to the undated wording. |
| The dress code, parking, hotels or the airport note | `dressCode`, `parking` (one text for both venues), `hotels`, `airport` | The content replaces the promise. Parking also makes the confirmation say "Ceremony location & parking", and the home page shows it under Now / Next on January 15. Hotels or the airport note add Travel back to the header (in its old place) and a link to it from the Schedule. Then post the dated announcement below. |
| The home page's thank-you after the party | `thankYou` as `{ en, es }` | It replaces "Thank you for celebrating with us." / "Gracias por celebrar con nosotros." on the home page after the party, and the link previews published after it. |
| The drive time between the church and the reception | `driveMinutes` (a whole number) | The Schedule's "Good to know" line and Travel's route strip state it; until then they say only that the two places are a drive apart. |
| The children's age cut-off | `childAgeCutoff` (children are younger than this) | The RSVP labels read "Children (under 12)" / "Adults / teens (12 and older)" and Questions answers "Who counts as a child?". |
| Which traditions are part of Sophia's day | `traditions`, keys of `padrinoTraditions` (for example `["corona", "zapatos"]`) | The Schedule gains "What to expect" with those traditions' approved meanings. Its title names no service; whether the service is a Mass is a separate decision. |
| Spanish invitation art | `site/assets/invitation-es.png` | See above. |

`npm run check` stops the build if one of these values is malformed (a date not written `YYYY-MM-DD`, a number that isn't a whole number in range, a tradition that isn't in `padrinoTraditions`, a thank-you in one language only).

### Owner runbook: say when something new is posted

Content that replaces a promise changes the page quietly, and households who read the promise (and SMS subscribers, who were told they would hear when it is posted) will not notice. Each time the family adds the dress code, hotels or parking:

1. Publish the content (above) and check the page that promised it.
2. In **Admin → Communications**, post a website announcement in English and Spanish naming what is new and where, for example "Parking details are posted" / "Ya publicamos los detalles de estacionamiento" with a line pointing to the venue pages. The home page shows it right under the status line as "Posted <date>" / "Publicado el <date>", the newest first.
3. If SMS or WhatsApp updates are live, send the same news there.

### Names stay out of this repository

This repository is public, so no guest's or helper's name is ever committed to it. The court of honor and the padrinos would list names: `family.court` and `family.padrinos` in `site/content.mjs` stay empty, and `npm run check` fails if either ever gets an entry (`tests/family-slots.test.mjs`). Names belong only in the runtime event settings (`server/site-settings.mjs`, served by `GET /api/site`), like Contact's optional line naming who reads the messages (Admin → Website & event). Pages for the court and the padrinos built from those settings do not exist yet; until they do, both pages keep their waiting text.

### Site and photo lifespan

How long the site stays up and until when guests can download the photos is the family's decision, set in **Admin → Website & event → Site and photo lifespan** (`site.lifespan` in the event settings, blank until then). Once set, the gallery and the thank-you page say "The site stays up through …" and "Download your photos by …"; nothing about it shows before. The photos date can't be earlier than February 1, 2027, the review date in the Privacy policy and [cleanup.md](cleanup.md), or later than the site's date.

### Owner action: event settings text on the live server

Some guest-facing words live in the event settings on the server, not in this repository, so publishing the site does not change them. The repository's defaults were changed; the live values need the owner, in **Admin → Website & event**:

1. **Venue notes.** The guest notes of the ceremony and of the dinner & reception venue each ended with a promise to share parking details ("Parking and arrival details will be shared here." / "Compartiremos aquí los detalles de llegada y estacionamiento." and "Entrance, parking and accessibility details will be shared here." / "Compartiremos los detalles de entrada, estacionamiento y accesibilidad."). The pages now say that promise themselves, on its own line, from the family's content (with a date once one is set). The API already leaves those exact sentences out of what it serves, so the pages do not say them twice; open the page, check that both **Guest notes** fields (English and Spanish) hold only venue facts ("Please silence your phone…", "Dinner and the reception take place at the same venue."), and select **Save website & calendars** so the stored notes match. If the notes were edited and the promise was reworded, delete that sentence by hand.
2. **Gifts.** Under **Registries**, in the Target **Description**, add the sentence about the list's name: English "On Target’s site the list is called “Sophia’s Birthday Wish List.”", Spanish "En Target, la lista aparece como “Sophia’s Birthday Wish List” (página en inglés)." (the repository's default now reads "A few wishes for Sophia’s next chapter." followed by that sentence). Leave the **Registry HTTPS URL** as it is: the live link is the right one.

Check afterwards on `/ceremony/`, `/reception/` and `/registry/` (and their `/es/` pages) that each says the parking promise once and that Gifts names the list.

### Owner action: the Spanish wording held on the live server

The website speaks one Spanish (`site/lexicon.mjs`): ustedes where we speak to an invited family (home, RSVP, confirmation, thank-you, the family's emails), tú to one person and on information pages, never usted, and one name per thing ("Confirmar asistencia", "mensaje" for the note, "Entrar" and "enlace de acceso", "Avisos por WhatsApp", "los XV de Sophia", times as "4:00 p. m."). `npm run check` enforces it on everything in this repository, but the event settings and the announcements are written in Admin and live only on the server, so the repository's tests cannot see them.

Admin now checks them for you. **Admin → Website & event** shows "Check the Spanish wording" above the form when a Spanish text uses a retired word or mixes tú and ustedes, both when the page opens and after **Save website & calendars**; **Admin → Communications → Publish on website** shows the same box after publishing an announcement. It is a warning, never a refusal: the text is saved and shown as written, and you decide. The repository's defaults pass the check. For the texts already live:

1. Open **Admin → Website & event**. If the box appears, it names each field and what it found. Fix the Spanish there and save; nothing else changes.
   - **Guest notes (Español)** appear on the venue pages, which speak to one person (tú): "Silencia tu teléfono y sigue las indicaciones de la iglesia durante la ceremonia." and "La cena y la recepción serán en el mismo lugar." are the repository's wording.
   - **Registries → Description (Español)** and the **album names (Español)** appear on Gifts and Photos (tú or neutral).
   - **Contact page · who reads the messages (Español)**, if you write one, appears on Contact (tú).
   - **Homepage message** is Sophia's own words; only retired words are flagged there, never her tú.
2. Write each new announcement's Spanish to the family (ustedes: "Los esperamos", "confirmen"), as the home page does; the form says so too. Announcements already published cannot be edited: if one of them uses tú (for example "Confirma tu asistencia"), archive it on **Record history → Announcements** and publish it again in ustedes.
3. Leave alone what is registered elsewhere, word for word: the Meta-approved WhatsApp templates ("Confirma tu asistencia antes del 15 de noviembre de 2026", one phone, tú; resubmitting needs a new approval, `docs/whatsapp-activation.md`) and the three SMS replies, which stay in English (`docs/sms-campaign-registration.md`). The Spanish SMS pages say the replies arrive in English.

Three wording questions are the family's and are not decided here: whether the church service is a Mass ("Ceremonia religiosa" until then, one entry in `site/lexicon.mjs`), whether "mensaje" stays the Spanish name of the note, and whether the Spanish SMS page should keep its current casing (the registered campaign quotes the English page).

## Exact hosting target

- Google account: the project owner's Google account (shown as `<project-owner-account>` below); the HybridCloudWorks account does not have access
- Existing project: `simplysoph-66c78`
- Event site: `misxv-simplysoph` (USER_SITE)
- Hosting target in `.firebaserc`: `misxv`
- Upload directory: `dist/` only, generated from tracked source
- Default site `simplysoph-66c78` is protected and was not deployed

From this repository with the intended account authenticated:

```powershell
npx -y firebase-tools@15.31.0 deploy --only hosting:misxv --project simplysoph-66c78 --account <project-owner-account> --non-interactive --dry-run
npx -y firebase-tools@15.31.0 deploy --only hosting:misxv --project simplysoph-66c78 --account <project-owner-account> --non-interactive
```

The Hosting predeploy hook runs `npm run check`, which builds pages and runs route/asset and behavior checks. Do not use an unscoped `firebase deploy` in this shared project. Firebase CLI 15.31.0 performed the deployment. Node 24 is the CI and API runtime target; guest pages are static and the dedicated Cloud Run container handles API requests. Gemini and a new load balancer are not required. Existing shared billing still applies; this does not promise zero charges.

Changes reach `main` only through pull requests whose `check` job passes (ruleset "Protect main"), and the publish job runs in the GitHub `production` environment, which only `main` can use. Publishing authenticates through Workload Identity Federation; its condition admits only pushes to `main` running this repository's `check.yml`.

## Event DNS records

| Type | Relative name | Value | TTL |
|---|---|---|---|
| CNAME | `misxv` | `misxv-simplysoph.web.app` | 300 |
| TXT | `_acme-challenge.misxv` | `GgMeXlKk-yzZzIsPylLvlucbfegUX8oCxv0mSBZJamk` | 300 |

These exact values came from Firebase Hosting's custom-domain API. The TXT is a public certificate-validation record, not a private integration credential. Keep it while the domain is in use unless Firebase instructs otherwise. All twelve pre-existing records, including the root website, Microsoft 365 MX/autodiscover and existing verification records, were preserved. They were first created at Hostinger on September 26, 2026. The domain is still registered at Hostinger, but its DNS has since moved to Cloudflare (live nameservers `june.ns.cloudflare.com` and `matt.ns.cloudflare.com`, checked October 13, 2026), so manage these records in Cloudflare.

Firebase may need time to observe DNS and issue its certificate. Do not disable TLS verification or bypass a browser certificate warning. Use the working web.app URL until the custom URL passes normal HTTPS validation. [Firebase custom-domain setup](https://firebase.google.com/docs/hosting/custom-domain).

## Verify after each release

Check Home, Details, RSVP, FAQ, Spanish and Privacy over HTTPS, an unknown route for HTTP 404, loaded artwork and the Friday January 15, 2027 date. Verify `/api/config`, private/no-store cache headers, and unauthenticated rejection on private endpoints; complete the acceptance checklist in [deployment.md](deployment.md) before distributing invitations. Confirm X-Release-Commit matches the checked push for automatic releases. Check on a phone before guest distribution. Search-engine exclusions are not access control. No credentials or guest records belong in static output.

## Rollback and retirement

Each procedure is written once:

- **Rolling back** the site, and the API with it: [deployment.md → Release and rollback](deployment.md#release-and-rollback).
- **Retiring** the site after the event (DNS records, custom domain, the event site, the mailbox): [cleanup.md](cleanup.md). Start with `npm run cleanup:plan` or the manual **Prepare event cleanup review** workflow. Nothing is deleted automatically.
