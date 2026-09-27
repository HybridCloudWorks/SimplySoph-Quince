import test from 'node:test';
import assert from 'node:assert/strict';
import {validateHouseholdRsvp} from '../server/rsvp-validation.mjs';
const now = Date.parse('2026-12-01T18:00:00Z');
const invitation = () => ({active:true, deadline:'2027-01-01T23:59:00-06:00', latestSubmissionId:null,
  capacity:{adultsTeens:2,kids:1}, invited:{ceremony:true,dinner:true,dance:true}});
const input = () => ({previousSubmissionId:null, attendance:{ceremony:{adultsTeens:1,kids:0},
  dinner:{adultsTeens:2,kids:1}, dance:{adultsTeens:2,kids:0}}, contact:{email:'alex@example.com',phone:'',address:null}, requests:''});
test('household counts permit different attendance per event and all declined without changing capacity', () => {
  const invite = invitation(), original = structuredClone(invite), data = input();
  assert.deepEqual(validateHouseholdRsvp(data,invite,now),data);
  for (const answer of Object.values(data.attendance)) { answer.adultsTeens=0; answer.kids=0; }
  assert.deepEqual(validateHouseholdRsvp(data,invite,now).attendance,data.attendance);
  assert.deepEqual(invite,original);
});
test('counts cannot borrow child/adult slots, exceed entitlement, omit answers, or inject fields', () => {
  for (const mutate of [d=>d.attendance.dinner.adultsTeens=3,d=>d.attendance.dinner.kids=2,
    d=>d.attendance.dinner.kids=-1,d=>d.attendance.dinner.kids=0.5,d=>d.attendance.dinner.kids='1',
    d=>delete d.attendance.ceremony,d=>delete d.attendance.dance.kids,d=>d.capacity={adultsTeens:99,kids:99},
    d=>d.attendance.dinner.guestId='another-household']) {
    const data=input(); mutate(data);
    assert.throws(()=>validateHouseholdRsvp(data,invitation(),now),e=>e.status===422);
  }
});
test('fresh organizer capacity and event changes override an already opened form', () => {
  const invite=invitation(); invite.capacity.kids=0;
  assert.throws(()=>validateHouseholdRsvp(input(),invite,now),e=>e.code==='INVALID_ATTENDANCE_COUNT');
  invite.capacity.kids=1; invite.invited.ceremony=false;
  assert.throws(()=>validateHouseholdRsvp(input(),invite,now),e=>e.code==='EVENT_NOT_INVITED');
  const data=input(); data.attendance.ceremony.adultsTeens=0;
  assert.equal(validateHouseholdRsvp(data,invite,now).attendance.ceremony.adultsTeens,0);
});
test('household mode fails closed on missing capacity, eligibility, deadline and stale versions', () => {
  const invite=invitation();
  for(const capacity of [null,{adultsTeens:2},{adultsTeens:0,kids:0},{adultsTeens:2,kids:NaN}])
    assert.throws(()=>validateHouseholdRsvp(input(),{...invite,capacity},now),e=>e.status===503);
  assert.throws(()=>validateHouseholdRsvp(input(),{...invite,invited:{}},now),e=>e.status===503);
  assert.throws(()=>validateHouseholdRsvp(input(),{...invite,deadline:null},now),e=>e.status===503);
  assert.throws(()=>validateHouseholdRsvp(input(),invite,Date.parse(invite.deadline)),e=>e.code==='RSVP_CLOSED');
  assert.throws(()=>validateHouseholdRsvp(input(),{...invite,latestSubmissionId:'new'},now),e=>e.status===409);
});
