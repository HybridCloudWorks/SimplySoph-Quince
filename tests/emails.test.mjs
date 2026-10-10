import test from 'node:test';
import assert from 'node:assert/strict';
import {renderEmail,templateKeys} from '../emails/templates.mjs';
const base={type:'invitation',url:'https://simplysophia.example/rsvp/',preview:true};
test('all templates have English/Spanish HTML and text',()=>{for(const locale of ['en','es'])for(const type of templateKeys){const r=renderEmail({...base,type,locale,updateText:type==='change'?'Approved sample change':''});assert.ok(r.subject&&r.text&&r.html);assert.ok(r.html.includes(`lang="${locale}"`));}});
test('personalized fields are escaped',()=>{const r=renderEmail({...base,household:'<img src=x onerror=alert(1)>'});assert.ok(!r.html.includes('<img'));assert.ok(r.html.includes('&lt;img'));});
test('unsafe link schemes and credentials are rejected',()=>{for(const url of ['javascript:alert(1)','http://example.com','https://user:pass@example.com'])assert.throws(()=>renderEmail({...base,url}));});
test('live invitation requires confirmed event and deadline',()=>{assert.throws(()=>renderEmail({...base,preview:false}));assert.throws(()=>renderEmail({...base,url:'https://example.com',preview:false,dateConfirmed:true,eventDate:'Confirmed date'}));});
test('receipt requires durable acceptance before rendering live copy',()=>{assert.throws(()=>renderEmail({...base,type:'receipt',url:'https://example.com',preview:false,dateConfirmed:true,eventDate:'Confirmed date'}));});
test('change notice requires specific change copy',()=>{assert.throws(()=>renderEmail({...base,type:'change'}));});
test('rendered copy has no encoding damage or stale "original code" advice',()=>{for(const locale of ['en','es'])for(const type of templateKeys){const r=renderEmail({...base,type,locale,updateText:type==='change'?'Approved sample change':''});for(const out of [r.subject,r.text,r.html]){assert.ok(!out.includes('�'),`${locale}/${type}`);assert.ok(!/original invitation code|c[oó]digo de tu invitaci[oó]n original/i.test(out),`${locale}/${type}`);}}});
test('quick answers appear only on personal invitation and reminder links',()=>{const link='https://misxv.example/rsvp/#'+'A'.repeat(43);for(const type of ['invitation','reminder']){const r=renderEmail({...base,type,url:link});assert.ok(r.html.includes(link+'.yes')&&r.html.includes(link+'.no'));assert.ok(r.text.includes(link+'.no'));}assert.ok(!renderEmail({...base,type:'details',url:link}).html.includes('.yes'));assert.ok(!renderEmail({...base,type:'invitation'}).html.includes('.yes'));});
import {emailSchedule,firstSentence,longDate} from '../emails/templates.mjs';
import {celebration} from '../site/celebration.mjs';
test('schedule lists only the events the household is invited to',()=>{
  const all=emailSchedule(celebration,{ceremony:true,dinner:true,dance:true});
  assert.deepEqual(all.map(r=>r.time),['4:00 PM','6:30 PM']);
  assert.match(all[1].text,/^Dinner, then the reception at 7:30 PM · The AMZ Event Center/);
  assert.deepEqual(emailSchedule(celebration,{ceremony:true,dinner:false,dance:false}).length,1);
  const dance=emailSchedule(celebration,{ceremony:false,dinner:false,dance:true});
  assert.equal(dance.length,1);assert.equal(dance[0].time,'7:30 PM');assert.match(dance[0].text,/^Reception · /);
  assert.equal(emailSchedule(celebration,{ceremony:false,dinner:true,dance:false})[0].text.split(' · ')[0],'Dinner');
  assert.deepEqual(emailSchedule(celebration,undefined),[]);
  assert.equal(emailSchedule(celebration,{ceremony:true},'es')[0].time,'4:00 p. m.');
});
test('dates and times stay in Windows-1252 and read naturally',()=>{
  assert.equal(longDate('2026-11-15T23:59:00-06:00'),'Sunday, November 15, 2026');
  assert.equal(longDate('2026-11-15T23:59:00-06:00','es'),'domingo 15 de noviembre de 2026');
  for(const r of emailSchedule(celebration,{ceremony:true,dinner:true,dance:true},'es'))assert.ok(!/[\u202f\u00a0]/.test(r.time+r.text));
});
test('invitation reads like a letter: date subject, places, Sophia’s words, contacts line',()=>{
  const r=renderEmail({...base,eventDate:'Friday, January 15, 2027',rsvpDeadline:'Sunday, November 15, 2026',schedule:emailSchedule(celebration,{ceremony:true,dinner:true,dance:true}),note:firstSentence(celebration.quote.en)});
  assert.equal(r.subject,'Sophia’s Mis XV · Friday, January 15, 2027');
  assert.ok(r.html.includes('Our Lady of Guadalupe Church')&&r.html.includes('4:00 PM'));
  assert.ok(r.html.includes('Turning 15 is such a special moment in my life'));
  assert.ok(r.html.includes('Please let us know by <strong>Sunday, November 15, 2026</strong>.'));
  assert.ok(r.text.includes('Add misxv@simplysoph.com to your contacts'));
  assert.ok(!/view your invitation|keep it private/i.test(r.html));
  assert.ok(!renderEmail({...base,type:'receipt'}).html.includes('Our Lady of Guadalupe'));
});
test('first sentence quotes only a short opening line',()=>{
  assert.equal(firstSentence('One line. Two lines.'),'One line.');
  assert.equal(firstSentence('x'.repeat(300)+'.'),'');
  assert.equal(firstSentence(undefined),'');
});
