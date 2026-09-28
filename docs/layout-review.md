# Layout review

Corrected full-viewport padding inside capped containers. Admin navigation occupies a left column with a flexible content column. A full-height page shell places the footer at the viewport bottom for short pages and after content for long pages.

All 58 generated documents were reviewed at 2560×1440 and 390×844 with browser screenshots of the opening view and page bottom. Every route also passed geometry checks at 1366×768 and 768×1024. All ten admin work screens and 22 English/Spanish registered-guest routes were additionally checked using local synthetic providers at 1920×1080 and 390×844. No live data, login enrollment, or email was changed during layout testing.

## Results

- No page-level horizontal overflow or footer gap exceeding one rounding pixel in the recorded checks.
- Admin desktop content remains a usable 1,202 pixels wide at 1,920/2,560-pixel viewports.
- Narrow admin tables scroll within their table wrapper; forms and cards stay inside the viewport.
- 70 automated tests and all 58 generated-document/link checks pass.
- This is a layout review; production MFA, email receipt and real Notion/media workflow acceptance remain separate.

## Route checklist

| Route | Wide desktop + phone visual review | Laptop + tablet geometry |
|---|---|---|
| / | Passed | Passed |
| /sophia/ | Passed | Passed |
| /details/ | Passed | Passed |
| /ceremony/ | Passed | Passed |
| /reception/ | Passed | Passed |
| /rsvp/ | Passed | Passed |
| /rsvp/confirmed/ | Passed | Passed |
| /account/ | Passed | Passed |
| /costs/ | Passed | Passed |
| /court/ | Passed | Passed |
| /padrinos/ | Passed | Passed |
| /gallery/ | Passed | Passed |
| /share/ | Passed | Passed |
| /gifts/ | Passed | Passed |
| /registry/ | Passed | Passed |
| /travel/ | Passed | Passed |
| /faq/ | Passed | Passed |
| /guestbook/ | Passed | Passed |
| /contact/ | Passed | Passed |
| /privacy/ | Passed | Passed |
| /terms/ | Passed | Passed |
| /thank-you/ | Passed | Passed |
| /404/ | Passed | Passed |
| /es/ | Passed | Passed |
| /es/sophia/ | Passed | Passed |
| /es/details/ | Passed | Passed |
| /es/ceremony/ | Passed | Passed |
| /es/reception/ | Passed | Passed |
| /es/rsvp/ | Passed | Passed |
| /es/rsvp/confirmed/ | Passed | Passed |
| /es/account/ | Passed | Passed |
| /es/costs/ | Passed | Passed |
| /es/court/ | Passed | Passed |
| /es/padrinos/ | Passed | Passed |
| /es/gallery/ | Passed | Passed |
| /es/share/ | Passed | Passed |
| /es/gifts/ | Passed | Passed |
| /es/registry/ | Passed | Passed |
| /es/travel/ | Passed | Passed |
| /es/faq/ | Passed | Passed |
| /es/guestbook/ | Passed | Passed |
| /es/contact/ | Passed | Passed |
| /es/privacy/ | Passed | Passed |
| /es/terms/ | Passed | Passed |
| /es/thank-you/ | Passed | Passed |
| /es/404/ | Passed | Passed |
| /admin/login/ | Passed | Passed |
| /admin/ | Passed | Passed |
| /admin/guests/ | Passed | Passed |
| /admin/access/ | Passed | Passed |
| /admin/content/ | Passed | Passed |
| /admin/site/ | Passed | Passed |
| /admin/notifications/ | Passed | Passed |
| /admin/seating/ | Passed | Passed |
| /admin/photos/ | Passed | Passed |
| /admin/guestbook/ | Passed | Passed |
| /admin/updates/ | Passed | Passed |
| /404.html | Passed | Passed |

Populated admin views: admin, admin/guests, admin/access, admin/content, admin/site, admin/notifications, admin/seating, admin/photos, admin/guestbook, admin/updates. Registered guest views cover RSVP, confirmation, account, costs, padrinos, gifts, registry, share, contact, guestbook and gallery in both languages. Screenshots and machine-readable observations are retained in the local user-facing layout-review output folder, not published with the website.
