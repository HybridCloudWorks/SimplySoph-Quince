import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPlan, validateInventory } from '../scripts/cleanup-plan.mjs';

const inventory = () => ({schemaVersion:1, event:'misxv-2027', projectId:'simplysoph-66c78', hostname:'misxv.simplysoph.com', baselineVerifiedAt:'2026-09-26T12:00:00Z', resources:[]});
const resource = (id, dependsOn = []) => ({id, type:'secret', projectId:'simplysoph-66c78', ownership:'created-for-event', resource:`projects/simplysoph-66c78/secrets/${id}`, creationEvidence:'Example creation receipt; no secret value', verifyBeforeCleanup:'Verify exact name and ownership against baseline', cleanupSteps:'Remove this exact event secret after service removal', verifyAfterCleanup:'Verify exact resource no longer exists', dependsOn, status:'active'});

test('event DNS is removed before domain and Hosting site; default site is protected', () => {
  const data = inventory();
  data.resources = [
    {...resource('site'), type:'firebase-hosting-site', resource:'projects/simplysoph-66c78/sites/misxv-simplysoph'},
    {...resource('domain', ['site']), type:'firebase-custom-domain', resource:'projects/simplysoph-66c78/sites/misxv-simplysoph/customDomains/misxv.simplysoph.com'},
    {...resource('dns', ['domain']), type:'dns-record', dnsName:'misxv.simplysoph.com', exactScope:'CNAME misxv to misxv-simplysoph.web.app'}
  ];
  assert.deepEqual(validateInventory(data).map(r => r.id), ['dns', 'domain', 'site']);
  data.resources[0].resource = 'projects/simplysoph-66c78/sites/simplysoph-66c78';
  assert.throws(() => validateInventory(data), /dedicated event Hosting/);
});
test('empty inventory is honest about unverified baseline and never claims discovery', () => {
  const data = inventory(); data.baselineVerifiedAt = null;
  assert.match(renderPlan(data), /NOT YET VERIFIED/);
  assert.match(renderPlan(data), /not a live cloud discovery/);
  assert.match(renderPlan(data), /Nothing is proposed/);
});
test('remove dependent service before its secret; exclude removed entries', () => {
  const data = inventory();
  data.resources = [resource('secret'), {...resource('service', ['secret']), type:'cloud-run-service'}, {...resource('old'), status:'removed', removalEvidence:'Removal verified'}];
  assert.deepEqual(validateInventory(data).map(r => r.id), ['service', 'secret']);
});
test('reject unsafe target, missing baseline, unsupported whole-project deletion and root DNS', () => {
  const wrong = inventory(); wrong.projectId = 'other'; assert.throws(() => validateInventory(wrong), /Unexpected project/);
  const data = inventory(); data.resources = [resource('test')]; data.baselineVerifiedAt = null;
  assert.throws(() => validateInventory(data), /baseline/);
  data.baselineVerifiedAt = '2026-09-26'; data.resources[0].type = 'project';
  assert.throws(() => validateInventory(data), /Unsupported/);
  Object.assign(data.resources[0], {type:'dns-record', dnsName:'simplysoph.com', exactScope:'Only one record'});
  assert.throws(() => validateInventory(data), /Root-domain/);
});
test('reject dependencies that cannot form a valid removal sequence', () => {
  const data = inventory(); data.resources = [resource('a', ['missing'])];
  assert.throws(() => validateInventory(data), /Missing dependency/);
  data.resources = [resource('a', ['b']), resource('b', ['a'])];
  assert.throws(() => validateInventory(data), /cycle/);
});
test('Microsoft mailbox/app grants need an exact scope and are removed before the app', () => {
  const data = inventory();
  data.resources = [{...resource('app'), type:'entra-application'}, {...resource('grant', ['app']), type:'exchange-role-assignment'}];
  assert.throws(() => validateInventory(data), /Exact records/);
  data.resources[1].exactScope = 'Example tenant, role assignment ID and event mailbox ID';
  assert.deepEqual(validateInventory(data).map(r => r.id), ['grant', 'app']);
});
test('scoped mailbox baseline does not claim the Google project was verified', () => {
  const data = inventory(); data.baselineVerifiedAt = null;
  data.resources = [{...resource('mailbox'), type:'m365-shared-mailbox', baseline:{verifiedAt:'2026-09-26T12:00:00Z', scope:'Microsoft shared mailboxes only', evidence:'Private mailbox baseline receipt', allowedTypes:['m365-shared-mailbox']}}];
  assert.match(renderPlan(data), /Global baseline: NOT YET VERIFIED/);
  assert.match(renderPlan(data), /Scoped baseline: Microsoft shared mailboxes only/);
  data.resources[0].type = 'cloud-run-service';
  assert.throws(() => validateInventory(data), /Baseline does not cover/);
});
test('mailbox delegate cleanup requires exact permissions and precedes mailbox removal', () => {
  const data = inventory();
  data.resources = [{...resource('mailbox'), type:'m365-shared-mailbox'}, {...resource('delegate', ['mailbox']), type:'m365-mailbox-delegate'}];
  assert.throws(() => validateInventory(data), /Exact records/);
  data.resources[1].exactScope = 'Example mailbox ID; organizer identity; FullAccess and SendAs only';
  assert.deepEqual(validateInventory(data).map(r => r.id), ['delegate', 'mailbox']);
});
