import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {renderEmail,renderSignInEmail,templateKeys,emailSchedule,firstSentence,longDate} from '../emails/templates.mjs';
import {celebration} from '../site/celebration.mjs';
import {event} from '../site/content.mjs';
const out=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../work/email-previews');
await mkdir(out,{recursive:true});
const invited={ceremony:true,dinner:true,dance:true};
// A sample answer for the receipt previews.
const attendance={ceremony:{adultsTeens:2,kids:1},dinner:{adultsTeens:2,kids:1},dance:{adultsTeens:2,kids:0}};
for(const locale of ['en','es'])for(const type of templateKeys){
  const email=renderEmail({type,locale,url:'https://simplysophia.example/rsvp/#sample-only',eventDate:locale==='en'?'Friday, January 15, 2027':'Viernes, 15 de enero de 2027',rsvpDeadline:longDate(event.deadline,locale),schedule:emailSchedule(celebration,invited,locale),note:firstSentence(celebration.quote[locale]),updateText:type==='change'?(locale==='en'?'Sample only: confirmed parking guidance will appear here.':'Solo ejemplo: aquí se incluirán las indicaciones confirmadas de estacionamiento.'):'',attendance,invited,preview:true});
  await writeFile(path.join(out,`${type}-${locale}.html`),email.html);
  await writeFile(path.join(out,`${type}-${locale}.txt`),email.subject+'\n\n'+email.text);
}
for(const locale of ['en','es']){
  const email=renderSignInEmail({locale,household:'Sample household',url:'https://simplysophia.example/account/#sample-only',eventDate:longDate(celebration.ceremony.start,locale)});
  await writeFile(path.join(out,`sign-in-${locale}.html`),email.html);
  await writeFile(path.join(out,`sign-in-${locale}.txt`),email.subject+'\n\n'+email.text);
}
console.log('Rendered 16 HTML/text email previews. No messages sent.');
