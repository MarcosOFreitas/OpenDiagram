import { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { ViewPlugin, Decoration, WidgetType } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import { search } from '@codemirror/search';
import { createSearchPanel } from './searchPanel.js';
import { autocompletion } from '@codemirror/autocomplete';
import { tags as t } from '@lezer/highlight';

const BLOCK = ['Table', 'TableGroup', 'TablePartial', 'Ref', 'Enum', 'Project', 'Note', 'indexes', 'Records'];
const SETTINGS = ['pk', 'primary key', 'not null', 'null', 'unique', 'increment', 'default', 'note', 'ref', 'headercolor', 'color', 'name', 'type', 'delete', 'update', 'cascade', 'restrict', 'set null', 'set default', 'no action'];
const TYPES = ['integer', 'int', 'bigint', 'smallint', 'serial', 'bigserial', 'varchar', 'char', 'text', 'boolean', 'date', 'timestamp', 'timestamptz', 'time', 'uuid', 'json', 'jsonb', 'decimal', 'numeric', 'float', 'double', 'real', 'bytea', 'blob'];
const TYPE_RE = new RegExp(`^(${TYPES.join('|')})\\b`, 'i');
const BLOCK_RE = new RegExp(`^(${BLOCK.join('|')})\\b`);
const SET_RE = new RegExp(`^(${[...SETTINGS].sort((a, b) => b.length - a.length).join('|')})\\b`, 'i');

// minimal DBML tokenizer: comments, strings, `expr`, numbers, #colors, block keywords, [settings], types
export const dbml = StreamLanguage.define({
  startState: () => ({ block: false, depth: 0 }),
  token(stream, st) {
    if (st.block) { if (stream.skipTo('*/')) { stream.match('*/'); st.block = false; } else stream.skipToEnd(); return 'comment'; }
    if (stream.eatSpace()) return null;
    if (stream.match('//')) { stream.skipToEnd(); return 'comment'; }
    if (stream.match('/*')) { st.block = true; return 'comment'; }
    if (stream.match("'''")) { if (!stream.skipTo("'''")) stream.skipToEnd(); else stream.match("'''"); return 'string'; }
    if (stream.match(/^'(?:[^'\\]|\\.)*'?/)) return 'string';
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return 'string.special';
    if (stream.match(/^`[^`]*`?/)) return 'atom';
    if (stream.match(/^#[0-9a-fA-F]{3,8}\b/)) return 'number';
    if (stream.match(/^-?\d+(\.\d+)?/)) return 'number';
    if (stream.eat('[')) { st.depth++; return 'bracket'; }
    if (stream.eat(']')) { st.depth = Math.max(0, st.depth - 1); return 'bracket'; }
    if (st.depth > 0 && stream.match(SET_RE)) return 'keyword';
    if (st.depth === 0 && stream.match(BLOCK_RE)) return 'keyword';
    if (stream.match(TYPE_RE)) return 'typeName';
    if (stream.match(/^[<>-]+|^[:.,]/)) return 'operator';
    if (stream.match(/^[\w$]+/)) return null;
    stream.next();
    return null;
  },
});

const highlight = HighlightStyle.define([
  { tag: t.keyword, color: '#7cb7ff' },
  { tag: t.typeName, color: '#6ee7b7' },
  { tag: t.string, color: '#f0b27a' },
  { tag: t.special(t.string), color: '#e6c17a' },
  { tag: t.atom, color: '#d7a8ff' },
  { tag: t.number, color: '#f78fb3' },
  { tag: t.comment, color: '#5f7391', fontStyle: 'italic' },
  { tag: t.operator, color: '#8ea0bd' },
  { tag: t.bracket, color: '#8ea0bd' },
]);

// ---- color picking: a swatch after every `headercolor:`/`color:` hex opens the native color picker; typing `color: ` offers presets
export const PALETTE = [['#3498DB', 'blue'], ['#1E3A5F', 'navy'], ['#27AE60', 'green'], ['#1ABC9C', 'teal'], ['#E67E22', 'orange'], ['#E74C3C', 'red'],
  ['#9B59B6', 'purple'], ['#E84393', 'pink'], ['#F1C40F', 'yellow'], ['#7F8C8D', 'gray'], ['#2C3E50', 'slate'], ['#8D6E63', 'brown']];
const COLOR_RE = /\b(?:headercolor|color)\s*:\s*(#[0-9a-fA-F]{3,8})\b/g;
const six = (h) => (h.length === 4 ? `#${[...h.slice(1)].map((c) => c + c).join('')}` : h.slice(0, 7));

function openPicker(view, el, hex, from, to) {
  const inp = document.createElement('input');
  inp.type = 'color';
  inp.value = six(hex);
  const r = el.getBoundingClientRect();
  Object.assign(inp.style, { position: 'fixed', left: `${r.left}px`, top: `${r.bottom}px`, width: '1px', height: '1px', opacity: '0', pointerEvents: 'none' });
  document.body.appendChild(inp);
  let end = to; // the hex length can change after the first edit
  inp.addEventListener('input', () => { view.dispatch({ changes: { from, to: end, insert: inp.value } }); end = from + inp.value.length; });
  inp.addEventListener('change', () => inp.remove());
  inp.addEventListener('blur', () => setTimeout(() => inp.remove(), 400));
  if (inp.showPicker) inp.showPicker(); else inp.click();
}

class Swatch extends WidgetType {
  constructor(hex, from, to) { super(); this.hex = hex; this.from = from; this.to = to; }
  eq(o) { return o.hex === this.hex && o.from === this.from && o.to === this.to; }
  toDOM(view) {
    const el = document.createElement('span');
    el.className = 'cm-swatch';
    el.style.background = this.hex;
    el.title = 'Click to pick a color';
    el.onmousedown = (e) => { e.preventDefault(); openPicker(view, el, this.hex, this.from, this.to); };
    return el;
  }
  ignoreEvent() { return true; }
}

function swatches(view) {
  const out = [];
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    for (const m of text.matchAll(COLOR_RE)) {
      const end = from + m.index + m[0].length;
      out.push(Decoration.widget({ widget: new Swatch(m[1], end - m[1].length, end), side: 1 }).range(end));
    }
  }
  return Decoration.set(out, true);
}
const colorSwatches = ViewPlugin.fromClass(class {
  constructor(v) { this.decorations = swatches(v); }
  update(u) { if (u.docChanged || u.viewportChanged) this.decorations = swatches(u.view); }
}, { decorations: (v) => v.decorations });

const theme = EditorView.theme({
  '.cm-panels': { backgroundColor: '#111a2b', color: '#d6deeb' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid #243350' },
  // the Ctrl+F panel (searchPanel.js): one row of foundation-sized controls (--ctl-sm, --r-sm) on the editor's dark surface
  '.cm-sp': { display: 'flex', flexDirection: 'column', gap: '6px', padding: '6px 8px' },
  '.cm-sp-row': { display: 'flex', alignItems: 'center', gap: '2px' },
  '.cm-sp-row[hidden]': { display: 'none' },
  '.cm-sp-field': { flex: '1 1 auto', minWidth: '0', height: 'var(--ctl-sm)', margin: '0 4px 0 0', background: '#0b111c', color: '#e5e9f2', border: '1px solid #2a3750', borderRadius: 'var(--r-sm)', padding: '0 8px', fontSize: '12.5px' },
  '.cm-sp-field:focus': { outline: 'none', borderColor: '#4f8cff', boxShadow: '0 0 0 2px #264a8a' },
  '.cm-sp-count': { flex: 'none', minWidth: '62px', padding: '0 4px', textAlign: 'right', color: '#aab4c8', fontSize: '12px', whiteSpace: 'nowrap' },
  '.cm-sp-btn, .cm-sp-text': { flex: 'none', display: 'inline-grid', placeItems: 'center', height: 'var(--ctl-sm)', minWidth: 'var(--ctl-sm)', padding: '0 4px', margin: 0, background: 'transparent', color: '#c3cde0', border: '1px solid transparent', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontSize: '12px' },
  '.cm-sp-opt': { fontFamily: 'ui-monospace, "Cascadia Mono", Consolas, monospace', fontWeight: 600 },
  '.cm-sp-opt[aria-pressed=true]': { background: '#264a8a', borderColor: '#4f8cff', color: '#fff' },
  '.cm-sp-more svg': { transition: 'transform var(--t-fast) var(--ease)' },
  '.cm-sp-more[aria-expanded=true] svg': { transform: 'rotate(90deg)' },
  '.cm-sp-text': { padding: '0 10px', background: '#1a2438', borderColor: '#2a3750' },
  '.cm-sp-btn:hover, .cm-sp-text:hover': { background: '#223050' },
  '.cm-sp-btn:focus-visible, .cm-sp-text:focus-visible': { outline: '2px solid #4f8cff', outlineOffset: '1px' },
  '.cm-searchMatch': { backgroundColor: 'rgba(252, 211, 77, .28)', outline: '1px solid rgba(252, 211, 77, .55)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(79, 140, 255, .45)', outline: '1px solid #4f8cff' },
  '.cm-selectionMatch': { backgroundColor: 'rgba(79, 140, 255, .18)' },
  '&': { height: '100%', backgroundColor: '#0f1623', color: '#d6deeb', fontSize: '12.5px' },
  '.cm-scroller': { fontFamily: 'ui-monospace, "Cascadia Mono", Consolas, monospace', lineHeight: '20px', scrollbarColor: '#2a3750 #0f1623' },
  '.cm-gutters': { backgroundColor: '#0f1623', color: '#5b6b86', border: 'none', borderRight: '1px solid #1d283b' },
  '.cm-activeLine': { backgroundColor: '#151f33' },
  '.cm-activeLineGutter': { backgroundColor: '#151f33', color: '#9fb0cc' },
  '.cm-cursor': { borderLeftColor: '#fff' },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: '#264a8a !important' },
  '.cm-tooltip': { backgroundColor: '#151f33', border: '1px solid #2a3750', color: '#d6deeb' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: '#264a8a', color: '#fff' },
  '.cm-swatch': { display: 'inline-block', width: '11px', height: '11px', margin: '0 5px', borderRadius: '3px', border: '1px solid rgba(255,255,255,.55)', cursor: 'pointer', verticalAlign: '-1px' },
  '.cm-diagnostic-error': { borderLeft: '3px solid #ff6b6b', color: '#222' },
}, { dark: true });

/**
 * DBML editor: highlighting, autocomplete (keywords, types, tables, table.column) and parser diagnostics.
 * `diags`: [{from,to,message}] resolved by the caller as 1-based line/col; `info`: {tables:[{name,columns}]}.
 */
export default function Editor({ value, onChange, diags, info, readOnly = false, wrap = false }) {
  const host = useRef(null);
  const view = useRef(null);
  const live = useRef({ diags, info, onChange });
  const ro = useRef(new Compartment());
  const wrapC = useRef(new Compartment());
  live.current = { diags, info, onChange };

  useEffect(() => {
    const complete = (ctx) => {
      const col = ctx.matchBefore(/\b(?:headercolor|color)\s*:\s*#?[0-9a-fA-F]*/);
      if (col) {
        const from = col.from + col.text.search(/#?[0-9a-fA-F]*$/);
        return { from, options: PALETTE.map(([label, detail]) => ({ label, detail, type: 'constant' })), validFor: /^#?[0-9a-fA-F]*$/ };
      }
      const w = ctx.matchBefore(/[\w.]*/);
      if (!w || (w.from === w.to && !ctx.explicit)) return null;
      const tables = live.current.info?.tables ?? [];
      const options = [
        ...BLOCK.map((label) => ({ label, type: 'keyword' })),
        ...SETTINGS.map((label) => ({ label, type: 'property', detail: 'setting' })),
        ...TYPES.map((label) => ({ label, type: 'type' })),
        ...tables.map((tb) => ({ label: tb.name, type: 'class', detail: 'table' })),
        ...tables.flatMap((tb) => tb.columns.map((c) => ({ label: `${tb.name}.${c}`, type: 'variable', detail: 'column' }))),
      ];
      return { from: w.from, options, validFor: /^[\w.]*$/ };
    };
    view.current = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          ro.current.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]), wrapC.current.of(wrap ? EditorView.lineWrapping : []),
          basicSetup, search({ top: true, createPanel: createSearchPanel }), dbml, syntaxHighlighting(highlight), theme, lintGutter(), autocompletion({
            override: [complete],
            addToOptions: [{ position: 20, render: (c) => { if (!/^#[0-9a-f]{6}$/i.test(c.label)) return null; const sw = document.createElement('span'); sw.style.cssText = `display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:6px;background:${c.label}`; return sw; } }],
          }), colorSwatches,
          EditorView.updateListener.of((u) => { if (u.docChanged) live.current.onChange(u.state.doc.toString()); }),
        ],
      }),
    });
    return () => view.current.destroy();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { view.current?.dispatch({ effects: ro.current.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]) }); }, [readOnly]);

  useEffect(() => { view.current?.dispatch({ effects: wrapC.current.reconfigure(wrap ? EditorView.lineWrapping : []) }); }, [wrap]);

  // external value change (import, sample) -> replace document
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  // push parser diagnostics straight into the lint state (no async linter source)
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const len = v.state.doc.length;
    v.dispatch(setDiagnostics(v.state, (diags ?? []).map((d) => ({ from: Math.min(d.from, len), to: Math.min(Math.max(d.to, d.from + 1), len), severity: 'error', message: d.message }))));
  }, [diags, value]);

  return <div className="editor" ref={host} />;
}
