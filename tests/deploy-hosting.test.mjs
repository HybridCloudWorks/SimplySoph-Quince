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
  assert.equal(config.headers.at(-1).headers['X-Release-Commit'],env.GITHUB_SHA);
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
