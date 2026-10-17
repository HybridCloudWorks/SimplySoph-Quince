import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {householdEmail,renderSignInEmail,templateKeys} from '../emails/templates.mjs';
import {date} from '../site/datetime.mjs';
import {celebration} from '../site/celebration.mjs';
import {event} from '../site/content.mjs';
const out=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../work/email-previews');
await mkdir(out,{recursive:true});
const invited={ceremony:true,dinner:true,dance:true};
// A sample answer for the receipt previews.
const attendance={ceremony:{adultsTeens:2,kids:1},dinner:{adultsTeens:2,kids:1},dance:{adultsTeens:2,kids:0}};
// Composed the way the server composes them (householdEmail), from the
// checked-in event settings and deadline.
for(const locale of ['en','es'])for(const type of templateKeys){
  const email=householdEmail({type,locale,household:'Sample household',url:'https://simplysophia.example/rsvp/#sample-only',site:celebration,deadline:event.deadline,updateText:type==='change'?(locale==='en'?'Sample only: confirmed parking guidance will appear here.':'Solo ejemplo: aquí se incluirán las indicaciones confirmadas de estacionamiento.'):'',attendance,invited,preview:true});
  await writeFile(path.join(out,`${type}-${locale}.html`),email.html);
  await writeFile(path.join(out,`${type}-${locale}.txt`),email.subject+'\n\n'+email.text);
}
for(const locale of ['en','es']){
  const email=renderSignInEmail({locale,url:'https://simplysophia.example/account/#sample-only',eventDate:date(celebration.ceremony.start,locale)});
  await writeFile(path.join(out,`sign-in-${locale}.html`),email.html);
  await writeFile(path.join(out,`sign-in-${locale}.txt`),email.subject+'\n\n'+email.text);
}
console.log('Rendered 16 HTML/text email previews. No messages sent.');
