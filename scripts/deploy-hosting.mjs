// Firebase Hosting REST publisher. No site creation/deletion or runtime deployment.
import { readFile, readdir, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GoogleAuth } from 'google-auth-library';

const site = 'misxv-simplysoph';
const project = 'simplysoph-66c78';
const repository = 'saulpatinojr/SimplySoph-Quince';
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
        if (!/\.(html|css|js|mjs|png|svg|ics|txt)$/.test(path)) throw new Error('Unexpected deployment file type');
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
  const auth = new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']});
  const token = await auth.getAccessToken();
  if (!token) throw new Error('Google authentication failed');
  async function request(url, method, body, binary = false) {
    const res = await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':binary?'application/octet-stream':'application/json'},
      body:body === undefined ? undefined : binary ? body : JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(60000)});
    if (!res.ok) throw new Error(`Hosting ${method} failed (${res.status}); no response credentials logged`);
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
  const published = await request(`${api}sites/${site}/releases?versionName=${encodeURIComponent(version.name)}`,'POST',{message:`GitHub ${env.GITHUB_SHA}`});
  console.log(`Released ${env.GITHUB_SHA}: ${published.name}`);
  // Normal HTTPS verification, bounded retry for edge propagation.
  for (let attempt=0; attempt<12; attempt++) {
    const home = await fetch('https://misxv.simplysoph.com/',{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if (home.ok && home.headers.get('x-release-commit') === env.GITHUB_SHA) {
      const summary = `Published [misxv.simplysoph.com](https://misxv.simplysoph.com)\n\nCommit: \`${env.GITHUB_SHA}\`\n\nRelease: \`${published.name}\`\n\nStatic site verified over HTTPS. Live RSVP/email activation remains separate.\n`;
      if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY,summary);
      console.log('Custom domain serves the expected commit.'); return;
    }
    await new Promise(done => setTimeout(done,5000));
  }
  throw new Error('Release created but custom-domain commit verification timed out; inspect before retrying');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  release().catch(error => { console.error(error.message); process.exitCode=1; });
}
