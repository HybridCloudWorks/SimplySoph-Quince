// The API these pages need, as an integer (GET /api/config `apiVersion`).
// scripts/deploy-hosting.mjs reads the live API's number before it publishes
// and refuses when it is missing or lower, so pages never go live in front of
// an API that does not understand them (QA-03, QA-04: the pages of #104 went
// live against API revision 00031). Raise it in the same change as a page
// starts to rely on something the API added; raise server/application.mjs
// apiVersion when the API adds it (tests/deploy-hosting.test.mjs keeps the
// API at least as new as the pages built with it).
// 4: the SMS tab's "Automatic invitation when someone texts SOPHIA" card
// (POST /api/admin/sms/auto-invite, its preview, and `autoInvite` on
// GET /api/admin/sms/drafts).
// 5: the court of honor drawn from the event settings (`court` on
// GET /api/site, GET /api/court-photo/<id>, Admin → Website & event; #108).
// 6: the SMS page's revoked households and automatic-invitation outcomes
// (GET /api/admin/audience?channel=sms, GET /api/admin/sms/drafts).
// 7: Invitations' "Reset household" (POST /api/admin/household-reset).
// 8: Invitations' Language column (POST /api/admin/household-language).
export const pagesNeedApi = 8;
