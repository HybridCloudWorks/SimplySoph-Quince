import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {newOpaqueToken, invitationTokenHash, verifyInvitationToken, sessionCodec, sessionMatchesInvitation, validCsrf, sessionCookie} from '../server/invitation-security.mjs';
const now = Date.parse('2026-12-01T18:00:00Z');
function fixture() {
  const token = newOpaqueToken();
  return {token, record:{householdId:'fixture-household', active:true, generation:1, tokenHash:invitationTokenHash(token), expiresAt:now+7200000}};
}
test('only a valid, unexpired, unrevoked high-entropy invitation is accepted', () => {
  const {token,record} = fixture();
  assert.equal(verifyInvitationToken(token,record,now),true);
  for (const bad of ['SOPHIA-DEMO',newOpaqueToken(),null,'x'.repeat(100000)]) assert.equal(verifyInvitationToken(bad,record,now),false);
  assert.equal(verifyInvitationToken(token,{...record,revokedAt:now},now),false);
  assert.equal(verifyInvitationToken(token,record,record.expiresAt),false);
});
test('sessions reject tampering, wrong keys, expiry and invitation rotation', () => {
  const {record} = fixture(), codec = sessionCodec(randomBytes(32));
  const session = codec.issue(record,now), claims = codec.verify(session.value,now);
  assert.ok(sessionMatchesInvitation(claims,record,now));
  assert.equal(codec.verify('x'+session.value,now),null);
  assert.equal(sessionCodec(randomBytes(32)).verify(session.value,now),null);
  assert.equal(codec.verify(session.value,session.expiresAt),null);
  assert.equal(sessionMatchesInvitation(claims,{...record,generation:2},now),false);
  assert.equal(sessionMatchesInvitation(claims,{...record,tokenHash:invitationTokenHash(newOpaqueToken())},now),false);
  assert.equal(sessionMatchesInvitation(claims,{...record,active:false},now),false);
  assert.equal(sessionMatchesInvitation(claims,{...record,householdId:'other'},now),false);
});
test('CSRF requires exact HTTPS origin and secret; cookie is restricted to the API', () => {
  const {record} = fixture(), codec = sessionCodec(randomBytes(32));
  const session = codec.issue(record,now), claims = codec.verify(session.value,now), origin='https://misxv.simplysoph.com';
  assert.ok(validCsrf(origin,origin,session.csrf,claims));
  for (const bad of [null,'null','https://misxv.simplysoph.com.evil.test','http://misxv.simplysoph.com']) assert.equal(validCsrf(bad,origin,session.csrf,claims),false);
  assert.equal(validCsrf(origin,origin,newOpaqueToken(),claims),false);
  assert.match(sessionCookie(session.value),/^__session=.*; Path=\/api; Max-Age=3600; Secure; HttpOnly; SameSite=Strict$/);
  assert.throws(()=>sessionCookie('value; Domain=example.com'));
});
