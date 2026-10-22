// Ctrl+F panel of the DBML editor: one row (find, "2 of 12", match case / whole word / regex, previous / next, replace, close); the replace row
// opens on demand and never in a read-only editor. Built on @codemirror/search's own query and commands, so F3, Mod-g and the match
// highlighting keep working. Styles: the editor theme in Editor.jsx (`.cm-sp*`).
import { runScopeHandlers } from '@codemirror/view';
import { SearchQuery, setSearchQuery, getSearchQuery, findNext, findPrevious, replaceNext, replaceAll, closeSearchPanel } from '@codemirror/search';

const MAX = 1000;
// the matches of the query and which one the selection is on (0 = none); counting stops at MAX
export function matchCount(state, query) {
  if (!query.search || !query.valid) return { total: 0, current: 0 };
  const { from, to } = state.selection.main;
  let total = 0, current = 0;
  for (const it = query.getCursor(state); total < MAX && !it.next().done;) {
    total++;
    if (it.value.from === from && it.value.to === to) current = total;
  }
  return { total, current };
}
export const countText = ({ total, current }, query) => {
  if (!query.search) return '';
  if (!query.valid) return 'Invalid regex';
  if (!total) return 'No results';
  const n = total >= MAX ? `${MAX}+` : String(total);
  return current ? `${current} of ${n}` : `${n} found`;
};

const svg = (d) => `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const ICON = { up: 'M12 19V5M5 12l7-7 7 7', down: 'M12 5v14M19 12l-7 7-7-7', more: 'm9 6 6 6-6 6', close: 'M18 6 6 18M6 6l12 12' };

export function createSearchPanel(view) {
  const el = (tag, attrs = {}, html) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (html != null) e.innerHTML = html; return e; };
  const btn = (label, html, run, cls = 'cm-sp-btn') => { const b = el('button', { type: 'button', class: cls, ...(label ? { 'aria-label': label, title: label } : {}) }, html); b.addEventListener('click', run); return b; };
  let query = getSearchQuery(view.state);
  const opt = { caseSensitive: query.caseSensitive, wholeWord: query.wholeWord, regexp: query.regexp };
  const find = el('input', { type: 'text', class: 'cm-sp-field', placeholder: 'Find', 'aria-label': 'Find', 'main-field': 'true', spellcheck: 'false', autocomplete: 'off' });
  const repl = el('input', { type: 'text', class: 'cm-sp-field', placeholder: 'Replace with…', 'aria-label': 'Replace with', spellcheck: 'false', autocomplete: 'off' });
  find.value = query.search; repl.value = query.replace;
  const count = el('span', { class: 'cm-sp-count', role: 'status' });
  const commit = () => { const q = new SearchQuery({ search: find.value, replace: repl.value, ...opt }); if (!q.eq(getSearchQuery(view.state))) view.dispatch({ effects: setSearchQuery.of(q) }); };
  const toggles = [['caseSensitive', 'Match case', 'Aa'], ['wholeWord', 'Whole word', 'W'], ['regexp', 'Regular expression', '.*']].map(([k, label, text]) => {
    const b = btn(label, text, () => { opt[k] = !opt[k]; b.setAttribute('aria-pressed', String(opt[k])); commit(); }, 'cm-sp-btn cm-sp-opt');
    b.setAttribute('aria-pressed', String(opt[k]));
    return [k, b];
  });
  const row = el('div', { class: 'cm-sp-row' });
  row.append(find, count, ...toggles.map(([, b]) => b), btn('Previous match', svg(ICON.up), () => findPrevious(view)), btn('Next match', svg(ICON.down), () => findNext(view)));
  const replaceRow = el('div', { class: 'cm-sp-row cm-sp-replace' });
  replaceRow.hidden = true;
  if (!view.state.readOnly) {
    const more = btn('Show replace', svg(ICON.more), () => {
      replaceRow.hidden = !replaceRow.hidden;
      more.setAttribute('aria-expanded', String(!replaceRow.hidden)); more.setAttribute('aria-label', replaceRow.hidden ? 'Show replace' : 'Hide replace'); more.title = more.getAttribute('aria-label');
      if (!replaceRow.hidden) repl.focus();
    }, 'cm-sp-btn cm-sp-more');
    more.setAttribute('aria-expanded', 'false');
    row.append(more);
    replaceRow.append(repl, btn(null, 'Replace', () => replaceNext(view), 'cm-sp-text'), btn(null, 'Replace all', () => replaceAll(view), 'cm-sp-text'));
  }
  row.append(btn('Close search', svg(ICON.close), () => closeSearchPanel(view)));
  const dom = el('div', { class: 'cm-sp', role: 'search', 'aria-label': 'Find in the DBML' });
  dom.append(row, replaceRow);

  find.addEventListener('input', commit); repl.addEventListener('input', commit);
  dom.addEventListener('keydown', (e) => {
    if (runScopeHandlers(view, e, 'search-panel')) { e.preventDefault(); return; } // the editor's search keys (Escape, F3, Mod-g)
    if (e.key === 'Escape') { e.preventDefault(); closeSearchPanel(view); }
    else if (e.key === 'Enter' && e.target === find) { e.preventDefault(); (e.shiftKey ? findPrevious : findNext)(view); }
    else if (e.key === 'Enter' && e.target === repl) { e.preventDefault(); replaceNext(view); }
  });
  const show = () => { count.textContent = countText(matchCount(view.state, query), query); };
  show();
  return {
    dom, top: true,
    mount() { find.focus(); find.select(); }, // CodeMirror focuses the field itself only when the panel is already open
    update(u) {
      const q = getSearchQuery(u.state);
      if (!q.eq(query)) { // set from outside (Ctrl+F on a selection) or by this panel: the fields follow
        query = q;
        if (find.value !== q.search) find.value = q.search;
        if (repl.value !== q.replace) repl.value = q.replace;
        for (const [k, b] of toggles) { opt[k] = q[k]; b.setAttribute('aria-pressed', String(q[k])); }
        show();
      } else if (u.docChanged || u.selectionSet) show();
    },
  };
}
