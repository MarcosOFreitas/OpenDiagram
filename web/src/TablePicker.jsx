import { useEffect, useMemo, useState } from 'react';

// search text -> predicate on 'schema.table': plain text = contains, `*`/`?` = wildcards (VW_*), /regex/ = regular expression
function matcher(text) {
  const n = text.trim();
  if (!n) return () => true;
  try {
    const rx = /^\/(.+)\/$/.exec(n);
    const src = rx ? rx[1] : /[*?]/.test(n) ? `^${n.replace(/[.+^${}()|[\]\\]/g, (c) => `\\${c}`).replace(/\*/g, '.*').replace(/\?/g, '.')}$` : null;
    if (src) { const re = new RegExp(src, 'i'); return (name) => re.test(name) || re.test(name.slice(name.indexOf('.') + 1)); }
  } catch { return () => false; } // incomplete regex while typing
  const l = n.toLowerCase();
  return (name) => name.toLowerCase().includes(l);
}

// Centered dialog to choose which tables/views to import. items: [{ name: 'schema.table', view }]; selection: array of names (empty = all)
export default function TablePicker({ items, selected, onApply, onClose }) {
  const [sel, setSel] = useState(() => new Set(selected));
  const [q, setQ] = useState('');
  const [schema, setSchema] = useState('');
  const [kind, setKind] = useState('');
  const [only, setOnly] = useState(false);
  const schemas = useMemo(() => [...new Set(items.map((i) => i.name.split('.')[0]))], [items]);
  const shown = useMemo(() => {
    const m = matcher(q);
    return items.filter((i) => m(i.name) && (!schema || i.name.startsWith(`${schema}.`)) && (!kind || (kind === 'view') === !!i.view) && (!only || sel.has(i.name)));
  }, [items, q, schema, kind, only, sel]);

  useEffect(() => { // capture: Escape closes this dialog only, not the drawer behind it
    const onKey = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const toggle = (name, on) => setSel((s) => { const n = new Set(s); if (on) n.add(name); else n.delete(name); return n; });
  const addShown = () => setSel((s) => new Set([...s, ...shown.map((i) => i.name)]));
  const dropShown = () => setSel((s) => { const n = new Set(s); shown.forEach((i) => n.delete(i.name)); return n; });

  return (
    <div className="admin" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="admin-card tp" role="dialog" aria-label="Choose tables">
        <div className="admin-head"><h2>Choose tables to import</h2><span style={{ flex: 1 }} /><button className="x" onClick={onClose} title="Close (Esc)">✕</button></div>
        <div className="tp-bar">
          <input autoFocus placeholder="Search: text, VW_* or /regex/" title="Plain text = contains · * and ? = wildcards (VW_*, LOG_??) · /regex/" value={q} onChange={(e) => setQ(e.target.value)} />
          {schemas.length > 1 && <select value={schema} onChange={(e) => setSchema(e.target.value)}><option value="">All schemas</option>{schemas.map((s) => <option key={s}>{s}</option>)}</select>}
          <select value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Tables and views</option><option value="table">Tables only</option><option value="view">Views only</option></select>
          <label className="chk"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> Selected only</label>
        </div>
        <div className="tp-actions">
          <a onClick={addShown}>Select shown ({shown.length})</a> · <a onClick={dropShown}>Clear shown</a> · <a onClick={() => setSel(new Set())}>Clear all</a>
        </div>
        <div className="tp-list">
          {shown.map((i) => {
            const [s, ...rest] = i.name.split('.');
            return (
              <label key={i.name} className="chk" title={i.name}>
                <input type="checkbox" checked={sel.has(i.name)} onChange={(e) => toggle(i.name, e.target.checked)} />
                <span>{schemas.length > 1 && <span className="hint">{s}.</span>}{schemas.length > 1 ? rest.join('.') : i.name}{i.view && <i className="hint"> · view</i>}</span>
              </label>
            );
          })}
          {!shown.length && <div className="hint">No table matches.</div>}
        </div>
        <div className="tp-foot">
          <span className="hint">{sel.size ? `${sel.size} selected of ${items.length}` : `Nothing selected = import all ${items.length}`}</span>
          <span style={{ flex: 1 }} />
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={() => onApply([...sel])}>Use {sel.size ? `${sel.size} table(s)` : 'all tables'}</button>
        </div>
      </div>
    </div>
  );
}
