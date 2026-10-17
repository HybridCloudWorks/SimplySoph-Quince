import test from 'node:test';
import assert from 'node:assert/strict';
import {availableParallelism} from 'node:os';
import {startServer, runToExit} from './support/server-process.mjs';

// A complete production configuration with synthetic values. Each case breaks one
// rule and expects start.mjs to refuse before it listens or calls any provider.
// The retention date is far off, so the valid configuration stays valid
// whatever the date (scripts/test-at.mjs runs this a year after the event).
const valid = {
  EVENT_BUCKET:'misxv-test-only', APP_KEY:Buffer.alloc(32,1).toString('base64'),
  NOTION_TOKEN:'test-only-notion-token', NOTION_SOURCE_ID:'test-source',
  ADMIN_GOOGLE_CLIENT_ID:'test-client', ADMIN_EMAILS:'organizer@example.test',
  SCOPED_NOTION_CONNECTION_CONFIRMED:'true', DATA_RETENTION_DATE:'2099-12-31',
  M365_TENANT_ID:'test-tenant', M365_CLIENT_ID:'test-mail-client', M365_CLIENT_SECRET:'test-only-secret',
  PUBLIC_ORIGIN:'https://misxv.example.test',
};
const cleared = Object.fromEntries([
  'MAIL_PROVIDER','SENDGRID_FALLBACK_ENABLED','SENDGRID_API_KEY','MICROSOFT_CLIENT_ID','MICROSOFT_TENANT_ID',
  'SMS_ENABLED','SMS_ACTIVATION_REVIEWED','TWILIO_AUTH_TOKEN','WHATSAPP_ENABLED','WHATSAPP_ACTIVATION_REVIEWED',
  'SCHEDULER_AUDIENCE','SCHEDULER_SERVICE_ACCOUNT','GUEST_MICROSOFT_SIGN_IN','GALLERY_ARCHIVE_PART_MB',
].map(k => [k, '']));

// Each start loads the whole server, about a second of CPU, so they run a few
// at a time (not all at once beside the other test files) and each waits for
// its process to end, with its output read to the end
// (tests/support/server-process.mjs), never for a fixed 5 seconds.
const env = overrides => ({...process.env, ...cleared, ...valid, PORT:'0', HOST:'127.0.0.1', ...overrides});
const refuse = overrides => runToExit(env(overrides));

const cases = [
  ['an app key that is not 32 bytes', {APP_KEY:Buffer.alloc(16,1).toString('base64')}, /Missing required production configuration/],
  ['an unconfirmed scoped Notion connection', {SCOPED_NOTION_CONNECTION_CONFIRMED:'yes'}, /Missing required production configuration/],
  ['a retention date in another format', {DATA_RETENTION_DATE:'04/15/2027'}, /Missing required production configuration/],
  ['a retention date that is not a date', {DATA_RETENTION_DATE:'2027-13-01'}, /Missing required production configuration/],
  ['a plain-HTTP public origin', {PUBLIC_ORIGIN:'http://misxv.example.test'}, /HTTPS origin required/],
  ['a public origin with a path', {PUBLIC_ORIGIN:'https://misxv.example.test/rsvp'}, /HTTPS origin required/],
  ['the SendGrid fallback without its key', {SENDGRID_FALLBACK_ENABLED:'true'}, /SendGrid selected without SENDGRID_API_KEY/],
  ['SendGrid as the provider without its key', {MAIL_PROVIDER:'sendgrid'}, /SendGrid selected without SENDGRID_API_KEY/],
  ['a bucket that is not the dedicated event bucket', {EVENT_BUCKET:'shared-bucket'}, /Dedicated event bucket required/],
  ['an admin list with an empty entry', {ADMIN_EMAILS:'organizer@example.test,'}, /ADMIN_EMAILS must be one or more valid addresses/],
  ['an admin list with a non-address', {ADMIN_EMAILS:'organizer'}, /ADMIN_EMAILS must be one or more valid addresses/],
  ['a Microsoft client without its tenant', {MICROSOFT_CLIENT_ID:'test-ms-client'}, /Set both MICROSOFT_CLIENT_ID and MICROSOFT_TENANT_ID/],
  ['a Microsoft tenant without its client', {MICROSOFT_TENANT_ID:'test-ms-tenant'}, /Set both MICROSOFT_CLIENT_ID and MICROSOFT_TENANT_ID/],
  ['a guest Microsoft switch that is neither true nor false', {GUEST_MICROSOFT_SIGN_IN:'off'}, /GUEST_MICROSOFT_SIGN_IN must be true or false/],
  ['SMS switched on without the activation review', {SMS_ENABLED:'true', TWILIO_AUTH_TOKEN:'test-only-token'}, /SMS activation requires/],
  ['SMS switched on without Twilio credentials', {SMS_ENABLED:'true', SMS_ACTIVATION_REVIEWED:'true'}, /SMS activation requires/],
  ['WhatsApp switched on without the activation review', {WHATSAPP_ENABLED:'true', TWILIO_AUTH_TOKEN:'test-only-token'}, /WhatsApp activation requires/],
  ['a scheduler audience without its service account', {SCHEDULER_AUDIENCE:'https://misxv.example.test/api/internal/drain'}, /Set both SCHEDULER_AUDIENCE and SCHEDULER_SERVICE_ACCOUNT/],
  ['a gallery part size too large for one request', {GALLERY_ARCHIVE_PART_MB:'5000'}, /GALLERY_ARCHIVE_PART_MB must be a whole number/],
];

test('the synthetic configuration itself is complete: the server starts listening', async (t) => {
  // Control for the cases below: each refusal must come from the one rule it breaks.
  const server = startServer(env({}));
  t.after(() => server.stop());
  const url = await server.listening;
  if (!url) {
    const {code, stderr} = await server.closed;
    assert.fail(`Server exited (${code}) instead of listening: ${stderr}`);
  }
});

test('production refuses to start when one setting is wrong', {concurrency:Math.max(2, Math.floor(availableParallelism() / 2))}, async (t) => {
  await Promise.all(cases.map(([name, overrides, message]) => t.test(name, async () => {
    const {code, stdout, stderr} = await refuse(overrides);
    assert.equal(code, 1);
    assert.match(stderr, message);
    assert.equal(stdout, '', 'never reaches "listening"');
    for (const secret of ['test-only-secret', 'test-only-notion-token', 'test-only-token'])
      assert.ok(!stderr.includes(secret), `does not print ${secret}`);
  })));
});
