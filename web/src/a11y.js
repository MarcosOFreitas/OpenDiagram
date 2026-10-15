// Fallback accessible names for fields that only have a placeholder (the visible hint) or sit in a table row:
// the placeholder, the column header (+ the row's name) or the first option become the aria-label. Fields with a real label are left alone.
const bare = (e) => !(e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.title || e.closest('label') || (e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`)));
const nameOf = (e) => {
  if (e.placeholder) return e.placeholder;
  const td = e.closest('td'), tr = td?.parentElement;
  const head = td && tr?.closest('table')?.querySelectorAll('th')[td.cellIndex]?.textContent.trim();
  const who = tr?.querySelector('b')?.textContent.trim();
  if (head) return who ? `${head} — ${who}` : head;
  return e.tagName === 'SELECT' ? (e.options[0]?.textContent.trim() || 'Choose') : 'Field';
};
const fix = () => { dialogs(); fields(); };
const fields = () => document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea').forEach((e) => { if (!e.closest('.cm-editor') && bare(e)) e.setAttribute('aria-label', nameOf(e)); });
// Overlays (.admin: administration, table picker, conflict/password dialogs) behave as modal dialogs: role + name, focus moves in,
// Tab stays inside, and focus goes back to the control that opened them. Escape is handled by the dialogs themselves.
const FOCUSABLE = 'button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])';
const openDialogs = [];
const dialogs = () => {
  document.querySelectorAll('.admin:not([data-a11y])').forEach((o) => {
    o.dataset.a11y = '1';
    const card = o.querySelector('.admin-card') || o;
    const head = card.querySelector('h2,h3,h4');
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true');
    if (head) { head.id ||= `dlg-${openDialogs.length}-${Date.now() % 1e5}`; card.setAttribute('aria-labelledby', head.id); } else card.setAttribute('aria-label', 'Dialog');
    openDialogs.push({ o, card, prev: document.activeElement });
    card.tabIndex = -1;
    (card.querySelector('input:not([type=hidden]),textarea,select') || card.querySelector('.admin-body button, .tp-foot button, button:not(.x)') || card).focus({ preventScroll: true });
  });
  for (let i = openDialogs.length - 1; i >= 0; i--) if (!openDialogs[i].o.isConnected) { const [{ prev }] = openDialogs.splice(i, 1); if (prev?.isConnected && !openDialogs.length) prev.focus({ preventScroll: true }); }
};
// if focus is dropped (the focused control was replaced by a re-render) while a dialog is open, put it back inside
document.addEventListener('focusout', (e) => {
  const d = openDialogs[openDialogs.length - 1];
  if (!d || e.relatedTarget) return;
  setTimeout(() => { if (d.card.isConnected && (!document.activeElement || document.activeElement === document.body)) (d.card.querySelector('.dtabs button.on') || d.card).focus({ preventScroll: true }); }, 0);
});
document.addEventListener('keydown', (e) => {
  const d = openDialogs[openDialogs.length - 1];
  if (e.key !== 'Tab' || !d?.card.isConnected) return;
  const f = [...d.card.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
  if (!f.length) return;
  const at = f.indexOf(document.activeElement);
  if (e.shiftKey && at <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && (at === -1 || at === f.length - 1)) { e.preventDefault(); f[0].focus(); }
});
export function nameFields() {
  let queued = false;
  new MutationObserver(() => { if (queued) return; queued = true; setTimeout(() => { queued = false; fix(); }, 60); }).observe(document.body, { childList: true, subtree: true });
  fix();
}
