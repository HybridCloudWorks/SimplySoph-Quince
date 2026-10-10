// Local checklist generator only. No cloud SDK, credentials, or deletion path.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const types = new Set(['cloud-run-service', 'artifact-repository', 'secret',
  'service-account', 'iam-binding', 'scheduler-job', 'task-queue',
  'storage-bucket', 'firestore-data', 'dns-record', 'oauth-grant',
  'workspace-mailbox', 'workspace-alias', 'notion-records', 'budget-alert',
  'github-deployment-access', 'entra-application', 'exchange-role-assignment',
  'm365-shared-mailbox', 'm365-alias', 'm365-mailbox-delegate',
  'twilio-content-template', 'twilio-whatsapp-sender', 'twilio-api-key', 'twilio-messaging-service', 'firebase-hosting-site', 'firebase-custom-domain',
  'monitoring-notification-channel', 'log-alert-policy']);
const safeText = value => typeof value === 'string' && value.trim().length > 0
  && value.length <= 2000 && !/[\r\n\x00-\x1f]/.test(value);
const requireField = (condition, message) => { if (!condition) throw new Error(message); };
const cell = value => value.replaceAll('|', '\\|').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function validateInventory(data) {
  requireField(data.schemaVersion === 1, 'Unsupported inventory version');
  requireField(data.event === 'misxv-2027', 'Unexpected event');
  requireField(data.projectId === 'simplysoph-66c78', 'Unexpected project');
  requireField(data.hostname === 'misxv.simplysoph.com', 'Unexpected hostname');
  requireField(Array.isArray(data.resources), 'resources must be an array');
  const ids = new Set();
  for (const r of data.resources) {
    const baselineDate = r.baseline?.verifiedAt ?? data.baselineVerifiedAt;
    requireField(safeText(baselineDate) && !Number.isNaN(Date.parse(baselineDate)), 'Verify the baseline before registering resources');
    if (r.baseline) requireField(safeText(r.baseline.scope) && safeText(r.baseline.evidence)
      && Array.isArray(r.baseline.allowedTypes) && r.baseline.allowedTypes.includes(r.type), `Baseline does not cover resource type: ${r.id}`);
    requireField(safeText(r.id) && /^[a-z0-9-]+$/.test(r.id) && !ids.has(r.id), 'Invalid or duplicate inventory ID');
    ids.add(r.id);
    requireField(types.has(r.type), `Unsupported resource type: ${r.id}`);
    requireField(r.projectId === data.projectId, `Project mismatch: ${r.id}`);
    requireField(r.ownership === 'created-for-event' || r.ownership === 'event-change-to-existing', `Ownership required: ${r.id}`);
    requireField(['resource', 'creationEvidence', 'verifyBeforeCleanup', 'cleanupSteps', 'verifyAfterCleanup'].every(key => safeText(r[key])), `Missing lifecycle evidence or instructions: ${r.id}`);
    requireField(Array.isArray(r.dependsOn) && r.dependsOn.every(safeText), `Invalid dependencies: ${r.id}`);
    // Redeploys append here, one short entry each, so creationEvidence stays under the text limit.
    if (r.revisionHistory !== undefined) requireField(Array.isArray(r.revisionHistory) && r.revisionHistory.every(safeText), `Invalid revision history: ${r.id}`);
    requireField(r.status === 'active' || r.status === 'removed', `Invalid status: ${r.id}`);
    if (r.type === 'firebase-hosting-site') requireField(r.resource === 'projects/simplysoph-66c78/sites/misxv-simplysoph', 'Only the dedicated event Hosting site is allowed');
    if (r.type === 'firebase-custom-domain') requireField(r.resource === 'projects/simplysoph-66c78/sites/misxv-simplysoph/customDomains/misxv.simplysoph.com', 'Only the event custom domain is allowed');
    if (r.type === 'dns-record') requireField(
      r.dnsName === data.hostname || (typeof r.dnsName === 'string' && r.dnsName.endsWith(`.${data.hostname}`)),
      'Root-domain or unrelated DNS changes require a separate reviewed plan');
    if (['dns-record', 'iam-binding', 'firestore-data', 'notion-records', 'oauth-grant', 'github-deployment-access', 'exchange-role-assignment', 'm365-mailbox-delegate'].includes(r.type)) {
      requireField(safeText(r.exactScope), `Exact records, grant, or data scope required: ${r.id}`);
    }
    if (r.status === 'removed') requireField(safeText(r.removalEvidence), `Removal evidence required: ${r.id}`);
  }
  // Dependency-first traversal, reversed for removal; reject missing/cyclic references.
  const visiting = new Set(), visited = new Set(), ordered = [];
  const byId = new Map(data.resources.map(r => [r.id, r]));
  function visit(r) {
    requireField(!visiting.has(r.id), `Dependency cycle: ${r.id}`);
    if (visited.has(r.id)) return;
    visiting.add(r.id);
    for (const id of r.dependsOn) {
      requireField(byId.has(id), `Missing dependency: ${id}`);
      visit(byId.get(id));
    }
    visiting.delete(r.id); visited.add(r.id); ordered.push(r);
  }
  data.resources.forEach(visit);
  return ordered.reverse().filter(r => r.status === 'active');
}

export function renderPlan(data) {
  const resources = validateInventory(data);
  const fingerprint = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const lines = ['# Mis XV cleanup review', '',
    '**PLAN ONLY. This report does not authenticate, change, or delete anything.**', '',
    `Project: ${data.projectId}. Host: ${data.hostname}.`, '',
    `Inventory SHA-256: ${fingerprint}`, '',
    `Global baseline: ${data.baselineVerifiedAt ?? 'NOT YET VERIFIED — each recorded resource needs its own verified scoped baseline.'}`, '',
    'Protect: simplysoph.com registration, existing project and billing account, existing DNS zone/nameservers, existing Notion database, shared mailboxes and data.', '',
    'Before removal: follow CLEANUP.md to stop intake/sending, export wanted data privately, review live resources and ownership, and resolve untracked resources.', '',
    'This inventory is not a live cloud discovery. An empty list does not prove that the project is empty.', ''];
  if (!resources.length) lines.push('No active event resources are recorded. Nothing is proposed for removal.');
  for (const r of resources) {
    lines.push(`## ${r.id}`, '',
      `- Type: ${r.type}; ownership: ${r.ownership}.`,
      `- Exact resource: ${cell(r.resource)}`,
      `- Creation evidence: ${cell(r.creationEvidence)}`,
      ...(r.baseline ? [`- Scoped baseline: ${cell(r.baseline.scope)}; verified ${cell(r.baseline.verifiedAt)}; evidence: ${cell(r.baseline.evidence)}`] : []),
      ...(r.exactScope ? [`- Exact scope: ${cell(r.exactScope)}`] : []),
      `- [ ] Verify ownership and current state: ${cell(r.verifyBeforeCleanup)}`,
      `- [ ] Reviewed removal/reversal: ${cell(r.cleanupSteps)}`,
      `- [ ] Verify completion: ${cell(r.verifyAfterCleanup)}`, '');
  }
  lines.push('', 'Finish: record removal evidence, regenerate this report, audit remaining charges/resources, and decide when to erase retained exports.');
  return lines.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const raw = await readFile(new URL('../ops/event-resources.json', import.meta.url), 'utf8');
    const output = new URL('../work/cleanup/plan.md', import.meta.url);
    const plan = renderPlan(JSON.parse(raw));
    await mkdir(dirname(fileURLToPath(output)), { recursive: true });
    await writeFile(output, plan);
    console.log('Cleanup review written to work/cleanup/plan.md. No resources changed.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
