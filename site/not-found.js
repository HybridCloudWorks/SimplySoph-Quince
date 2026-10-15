// Hosting answers every missing address with the one /404.html, in English and
// with a real 404 status. For an address under /es/ this shows the Spanish page
// kept in its <template> (scripts/build-pages.mjs), without leaving the address
// the guest typed. It runs before the page's other scripts, so they see Spanish.
const spanish = document.querySelector('template[data-lang="es"]');
if (spanish && /^\/es(\/|$)/.test(location.pathname)) {
  document.documentElement.lang = "es";
  document.title = spanish.dataset.title;
  document.body.replaceChildren(spanish.content.cloneNode(true));
}
