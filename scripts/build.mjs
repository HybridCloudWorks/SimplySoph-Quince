import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'site/index.html'), 'utf8');
const section = id => {
  const match = source.match(new RegExp(`<section\\b[^>]*\\bid="${id}"[^>]*>[\\s\\S]*?<\\/section>`));
  if (!match) throw new Error(`Missing source section ${id}`);
  return match[0];
};
const style = await readFile(path.join(root, 'site/styles.css'), 'utf8');
const header = source.match(/<header>[\s\S]*?<\/header>/)[0];
const footer = source.match(/<footer>[\s\S]*?<\/footer>/)[0];
const newNav = `<header><a class="wordmark" href="/" aria-label="Sophia, home">S <span>· MIS XV</span></a><nav aria-label="Main navigation"><a href="/details/">Event details</a><a href="/faq/">FAQ & contact</a><a class="nav-rsvp" href="/rsvp/">RSVP</a></nav></header>`;
const linkMap = { '#home':'/', '#celebration':'/details/', '#directions':'/details/#directions', '#questions':'/faq/', '#rsvp':'/rsvp/' };
const privacy = `<section class="section legal"><p class="eyebrow">YOUR INFORMATION</p><h1 class="page-title">Guest privacy</h1><p><strong>This website is a preview. Live guest records are not being collected.</strong></p><h2>In this preview</h2><p>The sample RSVP holds answers in this page's memory only. It does not send them, write browser storage, or connect to Notion. Refreshing clears them. Please enter sample information only.</p><h2>Page resources</h2><p>Google Firebase Hosting serves this site and processes normal request information, such as IP addresses and browser details, to deliver and protect it.</p><p>The page loads typefaces from Google Fonts, which receives normal network request information. Opening a Google Maps link takes you to Google Maps. We have not added analytics, advertising, or tracking pixels.</p><h2>Planned live RSVP</h2><p>The family plans to collect invited guest names, household contact details, event attendance, and optional dietary or accessibility requests for this celebration. Notion will be the private organizer workspace, with a secure service between it and the website. Optional mailing addresses will support invitations and thank-you notes.</p><h2>Before live collection opens</h2><p>The family will provide its contact address, confirm service providers and retention dates, explain correction/removal requests and email preferences, and replace this preview notice with the actual operating details.</p><h2>Photos</h2><p>Guest uploads and a public gallery are not enabled. Any future photo-sharing feature will include its own permission and moderation information.</p><a class="map-link" href="/faq/">Questions? Contact the invitation sender →</a></section>`;
const notFound = `<section class="section legal"><p class="eyebrow">404 · PAGE NOT FOUND</p><h1 class="page-title">Let’s get you back<br>to the celebration.</h1><p>This page may have moved or the link may be incomplete.</p><div class="actions"><a class="button burgundy" href="/">Home</a><a href="/details/">Event details</a><a href="/rsvp/">RSVP</a></div></section>`;
const routes = [
  ['', 'Sophia · Mis XV', section('home') + section('celebration')],
  ['details', 'Event details · Sophia', section('celebration') + section('directions') + `<section class="section details-extra"><p class="eyebrow">PLAN YOUR VISIT</p><h2>Attire, parking & travel</h2><p>Dress code, arrival guidance, parking, step-free access, and out-of-town travel details will be added after the family and venues confirm them.</p><a href="/faq/">More questions & family contact →</a></section>`],
  ['rsvp', 'RSVP · Sophia', section('rsvp')],
  ['faq', 'FAQ & contact · Sophia', section('questions')],
  ['privacy', 'Guest privacy · Sophia', privacy],
  ['404.html', 'Page not found · Sophia', notFound]
];
await mkdir(path.join(root,'dist/assets'),{recursive:true});
for (const [route,title,body] of routes) {
  let html = source.replace(/<title>.*?<\/title>/,`<title>${title}</title>`).replace(header,newNav).replace(/<main id="main">[\s\S]*?<\/main>/,`<main id="main">${body}</main>`).replace(footer,footer.replace('</footer>','<a href="/privacy/">Guest privacy</a></footer>'));
  if(['details','rsvp','faq'].includes(route)) html=html.replace(/<h2>(.*?)<\/h2>/,'<h1 class="page-title">$1</h1>');
  for (const [from,to] of Object.entries(linkMap)) html=html.replaceAll(`href="${from}"`,`href="${to}"`);
  html=html.replaceAll('href="styles.css"','href="/styles.css"').replaceAll('src="event-config.js"','src="/event-config.js"').replaceAll('src="app.js"','src="/app.js"').replaceAll('="assets/','="/assets/');
  if(route!=='rsvp') html=html.replace('<script src="/app.js" defer></script>','');
  const filename=route==='404.html'?'404.html':path.join(route,'index.html');
  await mkdir(path.dirname(path.join(root,'dist',filename)),{recursive:true});
  await writeFile(path.join(root,'dist',filename),html);
}
await writeFile(path.join(root,'dist/styles.css'),style+'\n.page-title{font:500 clamp(2.8rem,5vw,4.5rem)/1.12 var(--serif);color:var(--wine);margin:0 0 2rem}.rsvp .page-title{color:var(--cream)}.legal{max-width:1000px;margin:auto;min-height:65vh}.legal h2{font-size:2rem;margin-top:2rem}.details-extra{padding-top:45px}footer{flex-wrap:wrap}\n');
for(const file of ['app.js','event-config.js','assets/invitation.png']) await copyFile(path.join(root,'site',file),path.join(root,'dist',file));
await writeFile(path.join(root,'dist/robots.txt'),'User-agent: *\nDisallow: /\n');
console.log('Built five guest pages and themed 404 in dist/. Live RSVP and email remain disabled.');
