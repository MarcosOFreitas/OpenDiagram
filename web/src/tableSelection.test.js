// @vitest-environment node
import { describe, test, expect } from 'vitest';
import { ALL, fromStored, toStored, isAll, ticked, missing, fromTicks, withGrouped, summary, footer } from './tableSelection.js';

const items = ['shop.a', 'shop.b', 'shop.c', 'shop.d', 'audit.e', 'audit.f'].map((name) => ({ name }));
const names = items.map((i) => i.name);
const L = (...t) => ({ mode: 'list', tables: t });
const set = (...t) => new Set(t);

describe('stored form <-> value ([] is "all" only here)', () => {
  test.each([
    [[], ALL], [undefined, ALL], [null, ALL], ['x', ALL],
    [['shop.a'], L('shop.a')], [['shop.a', 'shop.a', 'shop.b'], L('shop.a', 'shop.b')],
  ])('fromStored(%j)', (stored, value) => expect(fromStored(stored)).toEqual(value));
  test('toStored is the inverse for lists and gives [] for all; the value never aliases the stored list', () => {
    expect(toStored(ALL)).toEqual([]);
    const src = ['shop.a'], v = fromStored(src);
    expect(toStored(v)).toEqual(['shop.a']);
    toStored(v).push('x'); src.push('y');
    expect(v.tables).toEqual(['shop.a']);
    expect(isAll(ALL) && !isAll(L('shop.a'))).toBe(true);
  });
  test('ALL cannot be changed by accident', () => { expect(() => { ALL.tables.push('x'); }).toThrow(); });
});

// the whole picker round: open with the selection, do something, apply. Every row is one situation; a new bug is a new row.
//   imported: the diagram already imported through this connection;  do: what the person does to the ticks / groups;  expect: the selection that comes out
const open = (sel, imported) => ({ sel, imported, wasAll: isAll(sel), tick: ticked(sel, items, imported) });
const apply = (s, tick, grouped = []) => fromTicks(tick, items, { wasAll: s.wasAll, grouped });

describe('picker matrix: opens with', () => {
  test.each([
    // [label, selection, imported, ticks when it opens]
    ['first import, nothing chosen', ALL, false, []],
    ['imported with all tables', ALL, true, names],
    ['imported with a list', L('shop.a', 'shop.b'), true, ['shop.a', 'shop.b']],
    ['a list on a connection never imported here', L('shop.a'), false, ['shop.a']],
    ['a list with a table the database no longer has', L('shop.a', 'shop.gone'), true, ['shop.a']],
  ])('%s', (_l, sel, imported, expected) => expect([...ticked(sel, items, imported)].sort()).toEqual([...expected].sort()));
});

describe('picker matrix: what applying gives', () => {
  const cases = [
    // [label, selection, imported, edit(tick) -> ticks, groups (grouped tables), expected selection]
    ['first import, untouched', ALL, false, (t) => t, [], ALL],
    ['first import, 2 ticked', ALL, false, (t) => withGrouped(t, ['shop.a', 'audit.e']), [], L('shop.a', 'audit.e')],
    ['first import, everything ticked = all', ALL, false, () => set(...names), [], ALL],
    ['first import, a group of 2 and nothing ticked: just those 2 (rule 4)', ALL, false, (t) => t, ['shop.b', 'shop.c'], L('shop.b', 'shop.c')],
    ['first import, 1 ticked and a group elsewhere: both', ALL, false, (t) => withGrouped(t, ['shop.a']), ['audit.f'], L('shop.a', 'audit.f')],
    ['imported all, untouched stays all', ALL, true, (t) => t, [], ALL],
    ['imported all, one unticked: the other five', ALL, true, (t) => { const n = new Set(t); n.delete('shop.d'); return n; }, [], L('shop.a', 'shop.b', 'shop.c', 'audit.e', 'audit.f')],
    ['imported all, everything unticked = all', ALL, true, () => set(), [], ALL],
    ['imported all, a group changes nothing (all are ticked)', ALL, true, (t) => t, ['shop.a', 'shop.b'], ALL],
    ['imported all, one unticked but grouped: it comes back', ALL, true, (t) => { const n = new Set(t); n.delete('shop.d'); return n; }, ['shop.d'], ALL],
    ['list, untouched', L('shop.a', 'shop.b'), true, (t) => t, [], L('shop.a', 'shop.b')],
    ['list, one more ticked: old ones stay', L('shop.a', 'shop.b'), true, (t) => withGrouped(t, ['shop.c']), [], L('shop.a', 'shop.b', 'shop.c')],
    ['list, all unticked = all', L('shop.a', 'shop.b'), true, () => set(), [], ALL],
    ['list, everything ticked is a list of everything (it was not "all")', L('shop.a'), true, () => set(...names), [], L(...names)],
    ['list, a group of an unticked table ticks it', L('shop.a'), true, (t) => t, ['shop.d'], L('shop.a', 'shop.d')],
    ['list with a gone table: it is dropped', L('shop.a', 'shop.gone'), true, (t) => t, [], L('shop.a')],
    ['list, only a gone table left: all', L('shop.gone'), true, (t) => t, [], ALL],
    ['grouped tables outside this import are ignored', ALL, false, (t) => t, ['other.x'], ALL],
  ];
  test.each(cases)('%s', (_l, sel, imported, edit, grouped, expected) => {
    const s = open(sel, imported);
    const out = apply(s, edit(s.tick), grouped);
    expect(isAll(out)).toBe(isAll(expected));
    expect([...out.tables].sort()).toEqual([...expected.tables].sort());
    expect(toStored(out).sort()).toEqual(isAll(expected) ? [] : [...expected.tables].sort()); // what goes to the server and into source.tables
  });
});

describe('what the person is told', () => {
  test('tables chosen before and gone', () => {
    expect(missing(L('shop.a', 'x.gone'), items)).toEqual(['x.gone']);
    expect(missing(ALL, items)).toEqual([]);
  });
  test.each([
    [ALL, 0, 'All tables — choose specific ones…'],
    [L('shop.a', 'shop.b'), 0, '2 table(s) selected — change…'],
    [L('shop.a'), 2, '1 table(s) selected · 2 group(s) — change…'],
  ])('drawer button %j', (sel, groups, text) => expect(summary(sel, groups)).toBe(text));
  test.each([
    [set(), false, 'Nothing selected = import all 6'],
    [set('shop.a'), false, '1 selected of 6'],
    [set(...names), false, '6 selected of 6'], // a list that happens to hold everything is not "all"
    [set(...names), true, 'All 6 selected = import all, tables the database gets later too'],
    [set('shop.a'), true, '1 selected of 6'],
  ])('picker footer (wasAll %#)', (tick, wasAll, text) => expect(footer(tick, items, { wasAll })).toBe(text));
});
