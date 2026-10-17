import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertReleaseContext, servingConfig } from '../scripts/deploy-hosting.mjs';

const env = {GITHUB_EVENT_NAME:'push',GITHUB_REPOSITORY:'HybridCloudWorks/SimplySoph-Quince',GITHUB_REF_NAME:'main',GITHUB_REF:'refs/heads/main',GITHUB_SHA:'a'.repeat(40)};
test('production rejects PRs, foreign repositories, arbitrary branches and malformed revisions', () => {
  assert.doesNotThrow(() => assertReleaseContext(env));
  for (const changed of [{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_REPOSITORY:'other/repo'},{GITHUB_REF_NAME:'feature/unreviewed'},{GITHUB_SHA:'main'},{GITHUB_REF:'refs/pull/1/merge'}]) {
    assert.throws(() => assertReleaseContext({...env,...changed}),/approved production branches/);
  }
});
test('publisher preserves security headers and cannot select the protected default site or drop future rewrites', async () => {
  const firebase = JSON.parse(await readFile('firebase.json','utf8'));
  const targets = JSON.parse(await readFile('.firebaserc','utf8'));
  const config = servingConfig(firebase,targets,env.GITHUB_SHA);
  assert.equal(config.trailingSlashBehavior,'ADD');
  assert.equal(config.headers[0].headers['X-Frame-Options'],'DENY');
  assert.match(config.headers[0].headers['Content-Security-Policy'],/default-src 'self'/);
  assert.equal(config.headers[0].headers['Strict-Transport-Security'],'max-age=31536000; includeSubDomains');
  // The site and the API deny the same device features.
  const { permissionsPolicy } = await import('../server/http.mjs');
  assert.equal(config.headers[0].headers['Permissions-Policy'],permissionsPolicy);
  assert.equal(config.headers.at(-1).headers['X-Release-Commit'],env.GITHUB_SHA);
  // Hashed images are cached for a year; pages, scripts and styles revalidate.
  assert.equal(config.headers[0].headers['Cache-Control'],'public, max-age=0, must-revalidate');
  const images = config.headers.find(rule => rule.glob === '/assets/img/**');
  assert.equal(images.headers['Cache-Control'],'public, max-age=31536000, immutable');
  assert.ok(config.headers.indexOf(images) > 0, 'the image rule must follow the catch-all so it overrides it');
  const apiHeaders = config.headers.filter(rule => rule.glob === '/api/**');
  assert.equal(apiHeaders.at(-1).headers['Cache-Control'],'private, no-store');
  assert.equal(apiHeaders.at(-1).headers.Vary,'Cookie');
  const bad = structuredClone(targets);
  bad.targets['simplysoph-66c78'].hosting.misxv=['simplysoph-66c78'];
  assert.throws(() => servingConfig(firebase,bad,env.GITHUB_SHA),/unexpected Hosting target/);
  firebase.hosting.rewrites=[{source:'/api/**',run:{serviceId:'misxv-api'}}];
  assert.throws(() => servingConfig(firebase,targets,env.GITHUB_SHA),/Unsupported API rewrite/);
});

test('publisher preserves the exact API service mapping and rejects other destinations', async () => {
  const firebase = JSON.parse(await readFile('firebase.json','utf8'));
  const targets = JSON.parse(await readFile('.firebaserc','utf8'));
  firebase.hosting.rewrites=[{source:'/api/**',run:{serviceId:'misxv-api',region:'us-central1'}}];
  assert.deepEqual(servingConfig(firebase,targets,env.GITHUB_SHA).rewrites,[{glob:'/api/**',run:{serviceId:'misxv-api',region:'us-central1'}}]);
  for (const rewrite of [{source:'/**',run:{serviceId:'misxv-api',region:'us-central1'}},{source:'/api/**',run:{serviceId:'other',region:'us-central1'}},{source:'/api/**',destination:'/index.html'}]) {
    firebase.hosting.rewrites=[rewrite];
    assert.throws(() => servingConfig(firebase,targets,env.GITHUB_SHA),/Unsupported API rewrite/);
  }
});

// R-127: after a release the custom domain must serve the built bytes, and the
// family's registry links (event settings, not the build) must be unchanged.
test('post-release check finds stale pages and scripts, not only a stale release header', async () => {
  const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { staleServedPaths, servedChecks } = await import('../scripts/deploy-hosting.mjs');
  const dist = await mkdtemp(`${tmpdir()}/dist-`);
  await mkdir(`${dist}/es`);
  const built = {'index.html':'<p>new home</p>','es/index.html':'<p>nuevo</p>','client.js':'export const v = 2;','styles.css':'body{}'};
  for (const [file, body] of Object.entries(built)) await writeFile(`${dist}/${file}`, body);
  const byPath = Object.fromEntries(servedChecks.map(([path, file]) => [path, built[file]]));
  const serve = served => async url => {
    const body = served[new URL(url).pathname];
    return body === undefined ? new Response('missing', {status:404}) : new Response(body);
  };
  assert.deepEqual(await staleServedPaths('https://example.org', {dist, fetchImpl: serve(byPath)}), []);
  // An edge still holding the old script (the header alone would have passed).
  assert.deepEqual(await staleServedPaths('https://example.org', {dist, fetchImpl: serve({...byPath, '/client.js':'export const v = 1;'})}), ['/client.js']);
  // A missing page and a network failure both count as not yet served.
  const { '/es/': _, ...noSpanish } = byPath;
  assert.deepEqual(await staleServedPaths('https://example.org', {dist, fetchImpl: serve(noSpanish)}), ['/es/']);
  assert.deepEqual(await staleServedPaths('https://example.org', {dist, fetchImpl: async () => { throw new TypeError('fetch failed'); }}), servedChecks.map(([path]) => path));
});

test('post-release check fails when the gift registry links change and reports when it cannot compare', async () => {
  const { liveRegistries, registryCheck } = await import('../scripts/deploy-hosting.mjs');
  const site = registries => async () => new Response(JSON.stringify({site:{registries}}), {headers:{'content-type':'application/json'}});
  const live = [{id:'target', url:'https://www.target.com/gift-registry/example', label:'Target'}];
  const before = await liveRegistries('https://example.org', {fetchImpl: site(live)});
  assert.equal(registryCheck(before, await liveRegistries('https://example.org', {fetchImpl: site(structuredClone(live))})), 'Gift registry links: unchanged by the release.');
  const reset = await liveRegistries('https://example.org', {fetchImpl: site([{id:'target', url:'', label:'Target'}])});
  assert.throws(() => registryCheck(before, reset), /registry links changed/);
  const down = await liveRegistries('https://example.org', {fetchImpl: async () => new Response('', {status:503})});
  assert.equal(down, null);
  assert.match(registryCheck(before, down), /not compared/);
  assert.equal(await liveRegistries('https://example.org', {fetchImpl: async () => { throw new TypeError('fetch failed'); }}), null);
});
