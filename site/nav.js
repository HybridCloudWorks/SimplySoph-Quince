// The header's Menu button on narrow screens (scripts/build-pages.mjs). It shows
// and hides the section links; Escape closes them and returns focus to the
// button, and so do a click outside, moving focus out of the menu or following
// a link. Listeners sit on the document, so they keep working when the 404 page
// swaps in its Spanish copy (site/not-found.js). On wide screens the links are
// always shown and the button is hidden by the stylesheet.
const toggle = () => document.querySelector(".menu-toggle");
const isOpen = () => toggle()?.getAttribute("aria-expanded") === "true";
function setOpen(open, { focus = false } = {}) {
  const button = toggle();
  if (!button) return;
  button.setAttribute("aria-expanded", String(open));
  button.closest("header")?.classList.toggle("menu-open", open);
  if (open) document.getElementById(button.getAttribute("aria-controls"))?.querySelector("a")?.focus();
  else if (focus) button.focus();
}
document.addEventListener("click", (e) => {
  const button = e.target.closest(".menu-toggle");
  if (button) return setOpen(!isOpen());
  if (!isOpen()) return;
  const header = toggle().closest("header");
  // A link inside the menu navigates; anywhere outside the header closes it.
  // The dimmed layer under the open menu is the header's own ::after, so a
  // tap on it targets the header itself: it closes the menu, and the link
  // under the layer is never followed.
  if (e.target.closest("#site-nav a") || !header.contains(e.target) || e.target === header)
    setOpen(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isOpen()) setOpen(false, { focus: true });
});
document.addEventListener("focusout", (e) => {
  if (!isOpen()) return;
  const header = toggle().closest("header");
  // Focus that leaves the header (Tab past the last link) closes the menu.
  if (e.relatedTarget && !header.contains(e.relatedTarget)) setOpen(false);
});
// Widening the window past the breakpoint shows the links inline; start closed.
// The breakpoint is set once, in styles.css (in em, so it follows the text
// size); here it is read from its effect: the stylesheet hides the button.
addEventListener("resize", () => {
  if (isOpen() && !toggle().offsetWidth) setOpen(false);
});
// iOS Safari shows :active (the pressed colours) only on pages that listen
// for touches.
document.addEventListener("touchstart", () => {}, { passive: true });
// Returning with the Back button can restore a page with the menu open.
addEventListener("pageshow", () => isOpen() && setOpen(false));
