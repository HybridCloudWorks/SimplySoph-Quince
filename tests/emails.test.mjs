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
import {emailSchedule,firstSentence} from '../emails/templates.mjs';
import {date} from '../site/datetime.mjs';
import {celebration} from '../site/celebration.mjs';
test('schedule lists only the events the household is invited to',()=>{
  const all=emailSchedule(celebration,{ceremony:true,dinner:true,dance:true});
  assert.deepEqual(all.map(r=>r.time),['4:00 PM','6:30 PM']);
  // Named as the website names each part of the day (site/lexicon.mjs).
  assert.match(all[0].text,/^Religious ceremony · Our Lady of Guadalupe Church/);
  assert.match(all[1].text,/^Dinner, then the reception and dance at 7:30 PM · The AMZ Event Center/);
  assert.deepEqual(emailSchedule(celebration,{ceremony:true,dinner:false,dance:false}).length,1);
  const dance=emailSchedule(celebration,{ceremony:false,dinner:false,dance:true});
  assert.equal(dance.length,1);assert.equal(dance[0].time,'7:30 PM');assert.match(dance[0].text,/^Reception & dance · /);
  assert.equal(emailSchedule(celebration,{ceremony:false,dinner:true,dance:false})[0].text.split(' · ')[0],'Dinner');
  assert.deepEqual(emailSchedule(celebration,undefined),[]);
  assert.equal(emailSchedule(celebration,{ceremony:true},'es')[0].time,'4:00 p. m.');
});
test('dates and times stay in Windows-1252 and read naturally',()=>{
  assert.equal(date('2026-11-15T23:59:00-06:00'),'Sunday, November 15, 2026');
  assert.equal(date('2026-11-15T23:59:00-06:00','es'),'domingo 15 de noviembre de 2026');
  assert.equal(emailSchedule(celebration,{ceremony:true,dinner:true,dance:true},'es')[1].text.split(' · ')[0],'Cena y, a las 7:30 p. m., la recepción y el baile');
  for(const r of emailSchedule(celebration,{ceremony:true,dinner:true,dance:true},'es'))assert.ok(!/[\u202f\u00a0]/.test(r.time+r.text));
});
test('invitation reads like a letter: date subject, places, Sophia’s words, contacts line',()=>{
  const r=renderEmail({...base,eventDate:'Friday, January 15, 2027',rsvpDeadline:'Sunday, November 15, 2026',schedule:emailSchedule(celebration,{ceremony:true,dinner:true,dance:true}),note:firstSentence(celebration.quote.en)});
  assert.equal(r.subject,'Sophia’s quinceañera · Friday, January 15, 2027');
  assert.ok(r.html.includes('Our Lady of Guadalupe Church')&&r.html.includes('4:00 PM'));
  assert.ok(r.html.includes('Turning 15 is such a special moment in my life'));
  // The deadline sentence of the site, the previews and the WhatsApp templates (R-036).
  assert.ok(r.html.includes('Please RSVP by <strong>Sunday, November 15, 2026</strong>.'));
  assert.ok(r.text.includes('Add misxv@simplysoph.com to your contacts'));
  assert.ok(!/view your invitation|keep it private/i.test(r.html));
  assert.ok(!renderEmail({...base,type:'receipt'}).html.includes('Our Lady of Guadalupe'));
});
test('a receipt lists the answer for the invited events, until when it can change and how',()=>{
  const attendance={ceremony:{adultsTeens:2,kids:1},dinner:{adultsTeens:2,kids:0},dance:{adultsTeens:0,kids:0}};
  const invited={ceremony:true,dinner:true,dance:false};
  const en=renderEmail({...base,type:'receipt',url:'https://misxv.example/details/',attendance,invited,rsvpDeadline:'Sunday, November 15, 2026'});
  assert.ok(en.text.includes('Ceremony: 2 adults/teens, 1 child')&&en.text.includes('Dinner: 2 adults/teens'));
  assert.ok(en.html.includes('>Ceremony</td>')&&en.html.includes('>2 adults/teens, 1 child</td>'));
  for(const out of [en.text,en.html]){
    assert.ok(!/Reception/.test(out),'only the events on the invitation');
    // L10N-28: households invited by text or WhatsApp have no invitation email.
    assert.ok(out.includes('You can change it until Sunday, November 15, 2026')&&out.includes('open your invitation link again, from the email or message we sent you'));
    assert.ok(!/permitted|Review your response/.test(out));
  }
  assert.ok(!en.html.includes('/rsvp/'),'no button to the generic code form');
  const es=renderEmail({...base,type:'update',locale:'es',url:'https://misxv.example/es/details/',attendance,invited,rsvpDeadline:'domingo 15 de noviembre de 2026'});
  assert.ok(es.text.includes('Ceremonia: 2 adultos/jóvenes, 1 niño')&&es.text.includes('Cena: 2 adultos/jóvenes'));
  assert.ok(es.text.includes('Pueden cambiarla hasta el domingo 15 de noviembre de 2026')&&!/Recepción/.test(es.text));
  const none={ceremony:{adultsTeens:0,kids:0},dinner:{adultsTeens:0,kids:0},dance:{adultsTeens:0,kids:0}};
  const declined=renderEmail({...base,type:'receipt',url:'https://misxv.example/details/',attendance:none,invited,rsvpDeadline:'Sunday, November 15, 2026'});
  assert.ok(declined.text.includes('no one in your family can attend')&&!declined.text.includes('Ceremony:'));
});
// R-092: a receipt holds no link to keep private, and the English "no" thanks once.
test('a receipt has no warning about a link it does not contain, and a decline says thank you once',()=>{
  const attendance={ceremony:{adultsTeens:1,kids:0},dinner:{adultsTeens:0,kids:0},dance:{adultsTeens:0,kids:0}};
  const none={ceremony:{adultsTeens:0,kids:0},dinner:{adultsTeens:0,kids:0},dance:{adultsTeens:0,kids:0}};
  const invited={ceremony:true,dinner:true,dance:true};
  for(const locale of ['en','es'])for(const type of ['receipt','update'])for(const answer of [attendance,none]){
    const r=renderEmail({...base,type,locale,url:'https://misxv.example/details/',attendance:answer,invited,rsvpDeadline:'Sunday, November 15, 2026'});
    for(const out of [r.text,r.html]){
      assert.ok(!/Your invitation link is just for your family|El enlace de su invitación es solo para su familia/.test(out),`${locale}/${type}`);
      assert.ok(!/share it|no lo compartan/.test(out),`${locale}/${type}`);
    }
    assert.ok(!/<p style="font-size:14px"><\/p>/.test(r.html),'no empty paragraph in its place');
  }
  const declined=renderEmail({...base,type:'receipt',url:'https://misxv.example/details/',attendance:none,invited,rsvpDeadline:'Sunday, November 15, 2026'});
  assert.equal((declined.text.match(/thank you/gi)||[]).length,1,declined.text);
  assert.ok(declined.text.includes('You let us know no one in your family can attend. We’ll miss you, and we send you our love.'));
  // The Spanish decline thanks once too (the title, "Gracias por responder.").
  const no=renderEmail({...base,type:'receipt',locale:'es',url:'https://misxv.example/es/details/',attendance:none,invited,rsvpDeadline:'domingo 15 de noviembre de 2026'});
  assert.equal((no.text.match(/gracias/gi)||[]).length,1,no.text);
  assert.ok(no.text.includes('Los vamos a extrañar y les mandamos todo nuestro cariño.'));
  // Only an email that carries the household's private link asks them to
  // keep it; details, a change and the thanks hold no link to keep.
  const link='https://misxv.example/rsvp/#'+'A'.repeat(43);
  for(const locale of ['en','es']){
    for(const type of ['details','change','thanks']){
      const r=renderEmail({...base,type,locale,url:'https://misxv.example/details/',updateText:type==='change'?'Approved sample change':''});
      for(const out of [r.text,r.html])assert.ok(!/invitation link is just for your family|link is just for|enlace de su invitación es solo|enlace de invitación es solo|no reenvíen|share it|compartan/.test(out),`${locale}/${type}`);
    }
    for(const type of ['invitation','reminder'])
      assert.ok(renderEmail({...base,type,locale,url:link}).text.includes(locale==='en'?'This invitation link is just for your family, so please don’t forward this email.':'Este enlace de invitación es solo para su familia; por favor, no reenvíen este correo.'),`${locale}/${type}`);
  }
});
test('first sentence quotes only a short opening line',()=>{
  assert.equal(firstSentence('One line. Two lines.'),'One line.');
  assert.equal(firstSentence('x'.repeat(300)+'.'),'');
  assert.equal(firstSentence(undefined),'');
});
import {renderSignInEmail} from '../emails/templates.mjs';
// R-034: the sign-in email speaks to the one person who asked (tú), so it
// greets them plainly ("Hola:"); the household emails greet the family.
test('the sign-in email greets one person ("Hola:"), the household emails the family',()=>{
  const greeting=(html)=>html.match(/<p>((?:Hello|Hola)[^<]*)<\/p>/)[1],url='https://misxv.example/account/#sample';
  for(const [locale,person,family] of [['en','Hello,','Hello Familia Morales,'],['es','Hola:','Hola, Familia Morales:']]){
    const signIn=renderSignInEmail({locale,household:'Familia Morales',url});
    assert.equal(greeting(signIn.html),person);
    assert.equal(signIn.text.split('\n\n')[0],person);
    assert.ok(!signIn.text.includes('Familia Morales'));
    assert.equal(greeting(renderEmail({...base,locale,household:'Familia Morales'}).html),family);
  }
});
