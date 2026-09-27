import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRsvp} from '../server/rsvp-validation.mjs';
const now=Date.parse('2026-12-01T18:00:00Z');
const invitation=()=>({active:true,deadline:'2027-01-01T23:59:00-06:00',latestSubmissionId:null,guests:[
  {id:'a',invited:{ceremony:true,dinner:true,dance:true}},
  {id:'b',invited:{ceremony:false,dinner:true,dance:true}}
]});
const input=()=>({previousSubmissionId:null,guests:[{guestId:'a',ceremony:'yes',dinner:'yes',dance:'no'},
  {guestId:'b',dinner:'no',dance:'yes'}],contact:{email:'alex@example.com',phone:'',address:null},requests:''});
test('mixed attendance and all-declined are valid, with explicit not-invited normalization',()=>{
  const data=input();assert.equal(validateRsvp(data,invitation(),now).guests[1].ceremony,'not-invited');
  for(const g of data.guests)for(const e of ['ceremony','dinner','dance'])if(e in g)g[e]='no';
  assert.equal(validateRsvp(data,invitation(),now).guests[0].dinner,'no');
});
test('reject injected guests, duplicate/missing guests, name changes and uninvited attendance',()=>{
  const mutations=[d=>d.guests.push({...d.guests[0],guestId:'extra'}),d=>d.guests[1].guestId='a',d=>d.guests.pop(),
    d=>d.guests[0].guestId='other-household',d=>d.guests[0].name='New name',d=>d.guests[1].ceremony='yes',d=>d.householdId='other'];
  for(const mutate of mutations){const data=input();mutate(data);assert.throws(()=>validateRsvp(data,invitation(),now),e=>e.status===422);}
});
test('deadline and response-version checks fail closed including exact cutoff',()=>{
  const invite=invitation();
  assert.throws(()=>validateRsvp(input(),invite,Date.parse(invite.deadline)),e=>e.code==='RSVP_CLOSED');
  assert.throws(()=>validateRsvp(input(),{...invite,deadline:null},now),e=>e.status===503);
  assert.throws(()=>validateRsvp(input(),{...invite,deadline:'2027-01-01'},now),e=>e.status===503);
  assert.throws(()=>validateRsvp(input(),{...invite,latestSubmissionId:'new'},now),e=>e.status===409);
});
test('oversized text, invalid answers and email-header injection are rejected',()=>{
  for(const mutate of [d=>d.requests='x'.repeat(1001),d=>d.guests[0].dinner='maybe',d=>d.contact.email='x@example.com\r\nBcc:evil@example.com']){
    const data=input();mutate(data);assert.throws(()=>validateRsvp(data,invitation(),now),e=>e.status===422);
  }
});
