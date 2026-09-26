import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const pages=['index.html','details/index.html','rsvp/index.html','faq/index.html','privacy/index.html','404.html'];
for(const page of pages){
  const html=await readFile(path.join(root,page),'utf8');
  for(const [,url] of html.matchAll(/(?:href|src)="([^"]+)"/g)){
    if(!url.startsWith('/'))continue;
    let target=path.join(root,url.split('#')[0]);
    const info=await stat(target);
    if(info.isDirectory())await stat(path.join(target,'index.html'));
  }
  if(!html.includes('RSVP demonstration only'))throw new Error(`Missing draft guard in ${page}`);
}
console.log('All six pages and local links/assets passed.');
