import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPlan, validateInventory } from '../scripts/cleanup-plan.mjs';

const inventory = () => ({schemaVersion:1, event:'misxv-2027', projectId:'simplysoph-66c78', hostname:'misxv.simplysoph.com', baselineVerifiedAt:'2026-09-26T12:00:00Z', resources:[]});
const resource = (id, dependsOn = []) => ({id, type:'secret', projectId:'simplysoph-66c78', ownership:'created-for-event', resource:`projects/simplysoph-66c78/secrets/${id}`, creationEvidence:'Example creation receipt; no secret value', verifyBeforeCleanup:'Verify exact name and ownership against baseline', cleanupSteps:'Remove this exact event secret after service removal', verifyAfterCleanup:'Verify exact resource no longer exists', dependsOn, status:'active'});
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
