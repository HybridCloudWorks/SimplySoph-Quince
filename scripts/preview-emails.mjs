import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {renderEmail,templateKeys,emailSchedule,firstSentence,longDate} from '../emails/templates.mjs';
import {celebration} from '../site/celebration.mjs';
import {event} from '../site/content.mjs';
const out=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../work/email-previews');
await mkdir(out,{recursive:true});
const invited={ceremony:true,dinner:true,dance:true};
for(const locale of ['en','es'])for(const type of templateKeys){
  const email=renderEmail({type,locale,url:'https://simplysophia.example/rsvp/#sample-only',eventDate:locale==='en'?'Friday, January 15, 2027':'Viernes, 15 de enero de 2027',rsvpDeadline:longDate(event.deadline,locale),schedule:emailSchedule(celebration,invited,locale),note:firstSentence(celebration.quote[locale]),updateText:type==='change'?(locale==='en'?'Sample only: confirmed parking guidance will appear here.':'Solo ejemplo: aquí se incluirán las indicaciones confirmadas de estacionamiento.'):'',preview:true});
  await writeFile(path.join(out,`${type}-${locale}.html`),email.html);
  await writeFile(path.join(out,`${type}-${locale}.txt`),email.subject+'\n\n'+email.text);
}
console.log('Rendered 14 HTML/text email previews. No messages sent.');
