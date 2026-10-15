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
const fix = () => document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea').forEach((e) => { if (!e.closest('.cm-editor') && bare(e)) e.setAttribute('aria-label', nameOf(e)); });
export function nameFields() {
  let queued = false;
  new MutationObserver(() => { if (queued) return; queued = true; setTimeout(() => { queued = false; fix(); }, 60); }).observe(document.body, { childList: true, subtree: true });
  fix();
}
