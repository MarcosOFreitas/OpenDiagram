import { describe, test, expect, afterEach } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { search, SearchQuery, openSearchPanel, searchPanelOpen } from '@codemirror/search';
import { matchCount, countText, createSearchPanel } from './searchPanel.js';

const DOC = 'Table users {\n  id int\n  ID int\n}\nRef: posts.user_id > users.id\n';

describe('matchCount / countText', () => {
  const state = (sel = 0) => EditorState.create({ doc: DOC, selection: { anchor: sel } });
  test('counts every match and says which one the selection is on', () => {
    const q = new SearchQuery({ search: 'id' });
    expect(matchCount(state(), q)).toEqual({ total: 4, current: 0 }); // id, ID, user_id, id (not case sensitive)
    const at = DOC.indexOf('ID');
    expect(matchCount(EditorState.create({ doc: DOC, selection: { anchor: at, head: at + 2 } }), q)).toEqual({ total: 4, current: 2 });
    expect(matchCount(state(), new SearchQuery({ search: 'id', caseSensitive: true })).total).toBe(3);
    expect(matchCount(state(), new SearchQuery({ search: 'id', wholeWord: true })).total).toBe(3);
  });
  test('the text: "2 of 4", "4 found", "No results", "Invalid regex", nothing for an empty search; a long count is capped', () => {
    const q = new SearchQuery({ search: 'id' });
    expect(countText({ total: 4, current: 2 }, q)).toBe('2 of 4');
    expect(countText({ total: 4, current: 0 }, q)).toBe('4 found');
    expect(countText({ total: 0, current: 0 }, q)).toBe('No results');
    expect(countText({ total: 0, current: 0 }, new SearchQuery({ search: '(', regexp: true }))).toBe('Invalid regex');
    expect(countText({ total: 0, current: 0 }, new SearchQuery({ search: '' }))).toBe('');
    expect(countText({ total: 1000, current: 0 }, q)).toBe('1000+ found');
    expect(matchCount(EditorState.create({ doc: 'a'.repeat(1500) }), new SearchQuery({ search: 'a' })).total).toBe(1000);
  });
});

describe('the Ctrl+F panel', () => {
  let view;
  afterEach(() => { view?.destroy(); view = null; });
  const make = (readOnly = false) => {
    view = new EditorView({ parent: document.body, state: EditorState.create({ doc: DOC, extensions: [search({ top: true, createPanel: createSearchPanel }), EditorState.readOnly.of(readOnly)] }) });
    openSearchPanel(view);
    return view.dom.querySelector('.cm-sp');
  };
  const key = (el, k, shift = false) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey: shift, bubbles: true, cancelable: true }));
  const type = (el, text) => { el.value = text; el.dispatchEvent(new Event('input', { bubbles: true })); };

  test('Ctrl+F puts the cursor in the find field (seen in the browser: the text typed went into the DBML)', () => {
    const p = make();
    expect(document.activeElement).toBe(p.querySelector('input[main-field]'));
  });
  test('one row: the find field and named buttons, no replace field until asked', () => {
    const p = make();
    const names = [...p.querySelector('.cm-sp-row').querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['Match case', 'Whole word', 'Regular expression', 'Previous match', 'Next match', 'Show replace', 'Close search']);
    expect(p.querySelector('input[main-field]').getAttribute('aria-label')).toBe('Find');
    expect(p.querySelector('.cm-sp-replace').hidden).toBe(true);
  });
  test('typing counts the matches; Enter goes to the next one, Shift+Enter to the previous one', () => {
    const p = make(), f = p.querySelector('input[main-field]'), count = p.querySelector('.cm-sp-count');
    type(f, 'id');
    expect(count.textContent).toBe('4 found');
    key(f, 'Enter');
    expect(count.textContent).toBe('1 of 4');
    key(f, 'Enter');
    expect(count.textContent).toBe('2 of 4');
    key(f, 'Enter', true);
    expect(count.textContent).toBe('1 of 4');
  });
  test('the options are toggle buttons that change the search', () => {
    const p = make(), f = p.querySelector('input[main-field]');
    type(f, 'id');
    const mc = p.querySelector('[aria-label="Match case"]');
    mc.click();
    expect(mc.getAttribute('aria-pressed')).toBe('true');
    expect(p.querySelector('.cm-sp-count').textContent).toBe('3 found');
  });
  test('replace opens on demand and replaces every match', () => {
    const p = make(), f = p.querySelector('input[main-field]');
    type(f, 'int');
    const more = p.querySelector('[aria-label="Show replace"]');
    more.click();
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(p.querySelector('.cm-sp-replace').hidden).toBe(false);
    type(p.querySelector('input[aria-label="Replace with"]'), 'bigint');
    [...p.querySelectorAll('button')].find((b) => b.textContent === 'Replace all').click();
    expect(view.state.doc.toString()).toContain('id bigint\n  ID bigint');
  });
  test('a read-only editor gets no replace; Escape closes the panel', () => {
    const p = make(true);
    expect(p.querySelector('[aria-label="Show replace"]')).toBeNull();
    key(p.querySelector('input[main-field]'), 'Escape');
    expect(searchPanelOpen(view.state)).toBe(false);
  });
});
