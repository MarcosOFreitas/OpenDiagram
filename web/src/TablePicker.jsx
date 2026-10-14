import { useEffect, useMemo, useState } from 'react';
import { PALETTE } from './Editor.jsx';

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

const split = (name) => { const i = name.indexOf('.'); return [name.slice(0, i), name.slice(i + 1)]; };

// Centered dialog to choose which tables/views to import and to define TableGroups for them.
// items: [{ name: 'schema.table', view }]; selected: names (empty = all); groups: [{ name, color, tables: ['schema.table'] }]
export default function TablePicker({ items, selected, groups, onApply, onClose }) {
  const [tab, setTab] = useState('tables');
  const [sel, setSel] = useState(() => new Set(selected));
  const [gs, setGs] = useState(() => (groups || []).map((g) => ({ ...g, tables: [...g.tables] })));
  const [q, setQ] = useState('');
  const [schema, setSchema] = useState('');
  const [kind, setKind] = useState('');
  const [only, setOnly] = useState(false);
  const [gName, setGName] = useState('');
  const [gColor, setGColor] = useState(PALETTE[0][0]);
  const schemas = useMemo(() => [...new Set(items.map((i) => split(i.name)[0]))], [items]);
  const shown = useMemo(() => {
    const m = matcher(q);
    return items.filter((i) => m(i.name) && (!schema || i.name.startsWith(`${schema}.`)) && (!kind || (kind === 'view') === !!i.view) && (!only || sel.has(i.name)));
  }, [items, q, schema, kind, only, sel]);
  const have = useMemo(() => new Set(items.map((i) => i.name)), [items]);
  const groupOf = useMemo(() => new Map(gs.flatMap((g) => g.tables.map((t) => [t, g]))), [gs]);

  useEffect(() => { // capture: Escape closes this dialog only, not the drawer behind it
    const onKey = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const toggle = (name, on) => setSel((s) => { const n = new Set(s); if (on) n.add(name); else n.delete(name); return n; });
  const addShown = () => setSel((s) => new Set([...s, ...shown.map((i) => i.name)]));
  const dropShown = () => setSel((s) => { const n = new Set(s); shown.forEach((i) => n.delete(i.name)); return n; });

  // groups: a table belongs to one group (moving it removes it from the previous one)
  const dup = gName.trim() && gs.some((g) => g.name === gName.trim());
  const create = () => {
    const name = gName.trim();
    if (!name || dup || !sel.size) return;
    setGs((l) => [...l.map((g) => ({ ...g, tables: g.tables.filter((t) => !sel.has(t)) })), { name, color: gColor, tables: [...sel] }]);
    setGName('');
  };
  const patch = (i, p) => setGs((l) => l.map((g, j) => (j === i ? { ...g, ...p } : g)));
  const addSelected = (i) => setGs((l) => l.map((g, j) => (j === i ? { ...g, tables: [...new Set([...g.tables, ...sel])] } : { ...g, tables: g.tables.filter((t) => !sel.has(t)) })));

  const apply = () => {
    const seen = new Set();
    const out = gs.filter((g) => g.tables.length).map((g) => { // names must be unique in DBML
      let name = g.name.trim() || 'Group', n = 2;
      while (seen.has(name)) name = `${g.name.trim()} ${n++}`;
      seen.add(name);
      return { ...g, name };
    });
    const tables = sel.size ? [...new Set([...sel, ...out.flatMap((g) => g.tables).filter((t) => have.has(t))])] : []; // grouped tables must be imported too
    onApply({ tables, groups: out });
  };

  const nGroups = gs.filter((g) => g.tables.length).length;
  return (
    <div className="admin" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="admin-card tp" role="dialog" aria-label="Choose tables">
        <div className="admin-head">
          <h2>Choose tables to import</h2>
          <div className="dtabs">
            <button className={tab === 'tables' ? 'on' : ''} onClick={() => setTab('tables')}>Tables</button>
            <button className={tab === 'groups' ? 'on' : ''} onClick={() => setTab('groups')}>Groups{nGroups ? ` (${nGroups})` : ''}</button>
          </div>
          <button className="x" onClick={onClose} title="Close (Esc)">✕</button>
        </div>

        {tab === 'tables' && (<>
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
              const [s, n] = split(i.name), g = groupOf.get(i.name), on = sel.has(i.name);
              return (
                <label key={i.name} className={`tp-card ${on ? 'on' : ''}`} title={i.name}>
                  <input type="checkbox" checked={on} onChange={(e) => toggle(i.name, e.target.checked)} />
                  <span className="tp-txt">
                    <b>{n}</b>
                    <small>{s}{i.view && ' · view'}</small>
                  </span>
                  {g && <i className="tp-dot" style={{ background: g.color }} title={`Group: ${g.name}`} />}
                </label>
              );
            })}
            {!shown.length && <div className="hint">No table matches.</div>}
          </div>
        </>)}

        {tab === 'groups' && (
          <div className="tp-groups">
            <div className="tp-new">
              <b>New group from the {sel.size} selected table(s)</b>
              <div className="tp-row">
                <input placeholder="Group name" value={gName} onChange={(e) => setGName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); }} />
                <input type="color" value={gColor} onChange={(e) => setGColor(e.target.value.toUpperCase())} title="Custom color" />
                <button className="primary" disabled={!gName.trim() || !!dup || !sel.size} onClick={create}>Create group</button>
              </div>
              <div className="tp-sw">{PALETTE.map(([hex, nm]) => <button key={hex} className={gColor === hex ? 'on' : ''} style={{ background: hex }} title={nm} onClick={() => setGColor(hex)} />)}</div>
              <small className="hint">{dup ? 'A group with this name already exists.' : sel.size ? 'Select tables in the Tables tab first; a table belongs to one group.' : 'First select tables in the Tables tab.'}</small>
            </div>
            {gs.map((g, i) => (
              <div key={i} className="tp-g" style={{ borderLeftColor: g.color }}>
                <div className="tp-row">
                  <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(g.color || '') ? g.color : '#6b7280'} onChange={(e) => patch(i, { color: e.target.value.toUpperCase() })} title="Group color" />
                  <input value={g.name} onChange={(e) => patch(i, { name: e.target.value })} />
                  <span className="hint">{g.tables.length} table(s)</span>
                  <button disabled={!sel.size} onClick={() => addSelected(i)} title="Move the selected tables into this group">Add selected ({sel.size})</button>
                  <button onClick={() => setGs((l) => l.filter((_, j) => j !== i))} title="Delete group (tables stay)">Delete</button>
                </div>
                <div className="tp-chips">
                  {g.tables.map((t) => <span key={t} className="tp-chip" style={have.has(t) ? undefined : { opacity: 0.5 }} title={have.has(t) ? t : `${t} — not in this import, dropped from the group`}>{split(t)[1]}<a onClick={() => patch(i, { tables: g.tables.filter((x) => x !== t) })}>×</a></span>)}
                  {!g.tables.length && <small className="hint">Empty: removed when you apply.</small>}
                </div>
              </div>
            ))}
            {!gs.length && <div className="hint">No groups yet.</div>}
          </div>
        )}

        <div className="tp-foot">
          <span className="hint">{sel.size ? `${sel.size} selected of ${items.length}` : `Nothing selected = import all ${items.length}`}{nGroups ? ` · ${nGroups} group(s)` : ''}</span>
          <span style={{ flex: 1 }} />
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={apply}>Use {sel.size ? `${sel.size} table(s)` : 'all tables'}</button>
        </div>
      </div>
    </div>
  );
}
