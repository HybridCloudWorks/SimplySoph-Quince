// Firebase Hosting REST publisher. No site creation/deletion or runtime deployment.
import { readFile, readdir, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GoogleAuth } from 'google-auth-library';
import { pagesNeedApi } from '../site/api-contract.mjs';

const site = 'misxv-simplysoph';
const project = 'simplysoph-66c78';
// The repository moved to the HybridCloudWorks org (same immutable ID 1389834350).
const repository = 'HybridCloudWorks/SimplySoph-Quince';
const api = 'https://firebasehosting.googleapis.com/v1beta1/';
const branches = ['main'];

export function assertReleaseContext(env) {
  if (env.GITHUB_EVENT_NAME !== 'push' || env.GITHUB_REPOSITORY !== repository
    || !branches.includes(env.GITHUB_REF_NAME) || env.GITHUB_REF !== `refs/heads/${env.GITHUB_REF_NAME}`
    || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '')) {
    throw new Error('Only a checked push to the approved production branches may publish');
  }
}

export function servingConfig(firebase, targets, sha) {
  const h = firebase.hosting;
  if (!h || Array.isArray(h) || h.target !== 'misxv' || h.public !== 'dist'
    || targets.projects?.default !== project
    || JSON.stringify(targets.targets?.[project]?.hosting?.misxv) !== JSON.stringify([site])) {
    throw new Error('Refusing an unexpected Hosting target or upload directory');
  }
  // Do not silently omit a future API rewrite or other routing configuration.
  const supported = ['target', 'public', 'ignore', 'trailingSlash', 'predeploy', 'headers', 'rewrites'];
  if (Object.keys(h).some(key => !supported.includes(key))) throw new Error('Unsupported Hosting config; extend and review the REST mapping first');
  const expectedRewrite = [{source:'/api/**', run:{serviceId:'misxv-api', region:'us-central1'}}];
  if (h.rewrites !== undefined && JSON.stringify(h.rewrites) !== JSON.stringify(expectedRewrite)) {
    throw new Error('Unsupported API rewrite; only the dedicated event service is permitted');
  }
  if (h.trailingSlash !== true) throw new Error('Expected directory routes with trailing slashes');
  return {
    trailingSlashBehavior:'ADD',
    ...(h.rewrites ? {rewrites:[{glob:'/api/**', run:{serviceId:'misxv-api', region:'us-central1'}}]} : {}),
    headers:[...h.headers.map(rule => ({glob:rule.source, headers:Object.fromEntries(rule.headers.map(x => [x.key,x.value]))})),
      {glob:'**', headers:{'X-Release-Commit':sha}}],
  };
}

// After a release the custom domain must serve the bytes that were built, not
// only the new X-Release-Commit header: an edge that still holds an old page or
// script would pass the header check (round 2 review, R-127). fetch decodes any
// compression, so the bodies compare with the files in dist/ directly.
export const servedChecks = [['/', 'index.html'], ['/es/', 'es/index.html'], ['/client.js', 'client.js'], ['/styles.css', 'styles.css']];
export async function staleServedPaths(origin, {dist = 'dist', fetchImpl = fetch, checks = servedChecks} = {}) {
  const digest = bytes => createHash('sha256').update(bytes).digest('hex'), stale = [];
  for (const [path, file] of checks) {
    const expected = digest(await readFile(`${dist}/${file}`));
    const served = await fetchImpl(`${origin}${path}`,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)}).catch(() => null);
    if (!served?.ok || digest(Buffer.from(await served.arrayBuffer())) !== expected) stale.push(path);
  }
  return stale;
}
// The gift registry links live in the API's event settings, which a static
// release cannot change. They are still read before and after each release, so
// a publish can never be the unnoticed moment a family-set link changed
// (R-127). null: the API could not be read, which is reported, not failed.
export async function liveRegistries(origin, {fetchImpl = fetch} = {}) {
  try {
    const res = await fetchImpl(`${origin}/api/site`,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
    if (!res.ok) return null;
    const registries = (await res.json()).site?.registries;
    return Array.isArray(registries) ? JSON.stringify(registries.map(r => [r.id, r.url])) : null;
  } catch { return null; }
}
// Pages are published only in front of an API that understands them
// (docs/deployment.md: deploy a backward-compatible API before publishing a
// frontend that depends on it). The live GET /api/config must report an
// apiVersion at least what these pages need (site/api-contract.mjs); missing,
// older or unreadable refuses the publish, with the reason. Returns the live
// version.
const deployApiFirst = 'Deploy the API from this commit first (docs/deployment.md, Deploy the API), then re-run this job';
export async function assertLiveApi(origin, {fetchImpl = fetch, needs = pagesNeedApi} = {}) {
  let live;
  try {
    const res = await fetchImpl(`${origin}/api/config`,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
    if (!res.ok) throw new Error(`it answered HTTP ${res.status}`);
    live = (await res.json()).apiVersion;
  } catch (error) {
    throw new Error(`Refusing to publish: the live API's version could not be read (${error.message}). ${deployApiFirst}.`);
  }
  if (!Number.isInteger(live)) throw new Error(`Refusing to publish: the live API reports no apiVersion, and these pages need ${needs}. ${deployApiFirst}.`);
  if (live < needs) throw new Error(`Refusing to publish: the live API is apiVersion ${live}, and these pages need ${needs}. ${deployApiFirst}.`);
  return live;
}
export function registryCheck(before, after) {
  if (before === null || after === null) return 'Gift registry links: not compared (the API could not be read before and after).';
  if (before !== after) throw new Error('The gift registry links changed during the release; inspect the event settings before retrying');
  return 'Gift registry links: unchanged by the release.';
}

async function release(env = process.env) {
  assertReleaseContext(env);
  const config = servingConfig(JSON.parse(await readFile('firebase.json','utf8')), JSON.parse(await readFile('.firebaserc','utf8')),env.GITHUB_SHA);
  const files = {}, blobs = new Map();
  async function collect(folder, prefix = '') {
    for (const entry of await readdir(folder,{withFileTypes:true})) {
      const path = `${prefix}/${entry.name}`;
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.isSymbolicLink()) throw new Error('Unexpected hidden file or link in dist');
      if (entry.isDirectory()) await collect(`${folder}/${entry.name}`,path);
      else {
        if (!/\.(html|css|js|mjs|png|jpg|webp|avif|ico|svg|ics|txt)$/.test(path)) throw new Error('Unexpected deployment file type');
        const bytes = gzipSync(await readFile(`${folder}/${entry.name}`));
        const hash = createHash('sha256').update(bytes).digest('hex');
        files[path] = hash; blobs.set(hash,bytes);
      }
    }
  }
  await collect('dist');
  if (!files['/index.html'] || !files['/404.html'] || Object.keys(files).length > 1000) throw new Error('Invalid release manifest');
  if (env.DEPLOY_DRY_RUN === 'true') {
    console.log(`Validated ${Object.keys(files).length} files for ${site}; no cloud requests made.`); return;
  }
  // Skip an obsolete run before uploads and check again immediately before release.
  async function isCurrent() {
    const result = await fetch(`https://api.github.com/repos/${repository}/git/ref/heads/${env.GITHUB_REF_NAME}`,{
      headers:{Authorization:`Bearer ${env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000),redirect:'error'});
    if (!result.ok) throw new Error(`Cannot verify branch head (${result.status})`);
    return (await result.json()).object.sha === env.GITHUB_SHA;
  }
  if (!await isCurrent()) { console.log('Newer commit exists; obsolete release skipped.'); return; }
  const origin = 'https://misxv.simplysoph.com';
  const apiVersion = await assertLiveApi(origin);
  const registriesBefore = await liveRegistries(origin);
  const auth = new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']});
  const token = await auth.getAccessToken();
  if (!token) throw new Error('Google authentication failed');
  async function request(url, method, body, binary = false) {
    const res = await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':binary?'application/octet-stream':'application/json'},
      body:body === undefined ? undefined : binary ? body : JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(60000)});
    if (!res.ok) {
      const failure = await res.json().catch(() => ({}));
      const detail = failure.error?.details?.map(d => [d.reason, d.metadata?.permission, d.metadata?.service].filter(Boolean).join(': ')).filter(Boolean).join('; ');
      const message = String(failure.error?.message || '').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 1200);
      throw new Error(`Hosting ${method} failed (${res.status}): ${detail || message || 'permission or request rejected'}`);
    }
    return binary ? undefined : res.json();
  }
  const version = await request(`${api}sites/${site}/versions`,'POST',{config,labels:{'git-commit':env.GITHUB_SHA}});
  if (!new RegExp(`^sites/${site}/versions/[a-zA-Z0-9_-]+$`).test(version.name)) throw new Error('Unexpected version identity');
  const upload = await request(`${api}${version.name}:populateFiles`,'POST',{files});
  if (upload.uploadUrl !== `https://upload-firebasehosting.googleapis.com/upload/${version.name}/files`) throw new Error('Unexpected upload destination');
  for (const hash of upload.uploadRequiredHashes ?? []) {
    if (!blobs.has(hash)) throw new Error('Server requested an unknown file');
    await request(`${upload.uploadUrl}/${hash}`,'POST',blobs.get(hash),true);
  }
  const finalized = await request(`${api}${version.name}?update_mask=status`,'PATCH',{status:'FINALIZED'});
  if (finalized.status !== 'FINALIZED') throw new Error('Version was not finalized');
  if (!await isCurrent()) { console.log('Newer commit exists; uploaded version was not released.'); return; }
  // Again just before the release: an API rolled back during the upload refuses it too.
  await assertLiveApi(origin);
  const published = await request(`${api}sites/${site}/releases?versionName=${encodeURIComponent(version.name)}`,'POST',{message:`GitHub ${env.GITHUB_SHA}`});
  console.log(`Released ${env.GITHUB_SHA}: ${published.name}`);
  // Normal HTTPS verification, bounded retry for edge propagation.
  let waitingFor = 'the release header';
  for (let attempt=0; attempt<12; attempt++) {
    const home = await fetch(`${origin}/`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
    const stale = home.ok && home.headers.get('x-release-commit') === env.GITHUB_SHA ? await staleServedPaths(origin) : null;
    if (stale) waitingFor = stale.join(', ');
    if (stale && !stale.length) {
      const registries = registryCheck(registriesBefore, await liveRegistries(origin));
      const summary = `Published [misxv.simplysoph.com](https://misxv.simplysoph.com)\n\nCommit: \`${env.GITHUB_SHA}\`\n\nRelease: \`${published.name}\`\n\nStatic site verified over HTTPS: ${servedChecks.map(([path]) => `\`${path}\``).join(', ')} serve the built bytes.\n\nLive API: apiVersion ${apiVersion} (these pages need ${pagesNeedApi}).\n\n${registries}\n\nLive RSVP/email activation remains separate.\n`;
      if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY,summary);
      console.log(`Custom domain serves the expected commit and content. ${registries}`); return;
    }
    await new Promise(done => setTimeout(done,5000));
  }
  throw new Error(`Release created but custom-domain verification timed out (still waiting for ${waitingFor}); inspect before retrying`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  release().catch(error => { console.error(error.message); process.exitCode=1; });
}
