import { describe, test, expect } from 'vitest';
import { lineDiff } from './History.jsx';

const kinds = (d) => d.map((l) => l.k).join('');
const text = (d, k) => d.filter((l) => l.k === k).map((l) => l.t);

describe('lineDiff', () => {
  test('identical texts: no changes', () => expect(kinds(lineDiff('a\nb', 'a\nb'))).toBe('  '));
  test('added line', () => { const d = lineDiff('a\nc', 'a\nb\nc'); expect(text(d, '+')).toEqual(['b']); expect(text(d, '-')).toEqual([]); });
  test('removed line', () => { const d = lineDiff('a\nb\nc', 'a\nc'); expect(text(d, '-')).toEqual(['b']); });
  test('changed line = one removed and one added, order kept', () => {
    const d = lineDiff('a\nold\nc', 'a\nnew\nc');
    expect(d.map((l) => `${l.k}${l.t}`)).toEqual([' a', '-old', '+new', ' c']);
  });
  test('rebuilding the new text from the diff gives the new text; the old text from the diff gives the old', () => {
    const a = 'x\ny\nz\nw', b = 'x\nq\nz\nw\nv';
    const d = lineDiff(a, b);
    expect(d.filter((l) => l.k !== '-').map((l) => l.t).join('\n')).toBe(b);
    expect(d.filter((l) => l.k !== '+').map((l) => l.t).join('\n')).toBe(a);
  });
  test('empty sides', () => {
    expect(kinds(lineDiff('', 'a'))).toBe('-+'); // '' is one empty line
    expect(text(lineDiff('a\nb', ''), '-')).toEqual(['a', 'b']);
  });
  test('too heavy a diff gives null instead of freezing the page', () => {
    const big = (n) => Array.from({ length: n }, (_, i) => `line ${i}`).join('\n');
    expect(lineDiff(big(2100), big(2100).replaceAll('line', 'LINE'))).toBeNull();
  });
});
