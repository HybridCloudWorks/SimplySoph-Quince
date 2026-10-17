// The API these pages need, as an integer (GET /api/config `apiVersion`).
// scripts/deploy-hosting.mjs reads the live API's number before it publishes
// and refuses when it is missing or lower, so pages never go live in front of
// an API that does not understand them (QA-03, QA-04: the pages of #104 went
// live against API revision 00031). Raise it in the same change as a page
// starts to rely on something the API added; raise server/application.mjs
// apiVersion when the API adds it (tests/deploy-hosting.test.mjs keeps the
// API at least as new as the pages built with it).
export const pagesNeedApi = 1;
