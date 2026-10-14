import { useMemo, useState } from 'react';
import { matcher } from './TablePicker.jsx';

const Ico = ({ children }) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
const Eye = ({ off }) => (off
  ? <Ico><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><path d="M1 1l22 22" /></Ico>
  : <Ico><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></Ico>);
const Funnel = () => <Ico><path d="M22 3H2l8 9.46V19l4 2v-8.54z" /></Ico>;
const Target = () => <Ico><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></Ico>;
const Chev = ({ open }) => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }} aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>;

const tid = (s, n) => `${s || 'public'}.${n}`;

// Right-hand panel of the diagram: search, group by schema / TableGroup, show or hide tables on the canvas, jump to a table.
// hidden: Set of table ids; onHide(ids, hide); onOnly(ids) = show only these; onFocus(id) = select + center.
export default function TablesPanel({ right = 0, views = [], activeView = '', onView, onCreateView, onDeleteView, onRenameView, tables, groups, refs, hidden, onHide, onOnly, onFocus, activeId, search, setSearch, searchRef, onClose }) {
  const [by, setBy] = useState(groups.length ? 'group' : 'schema'); // schema | group
  const [open, setOpen] = useState(() => new Set());
  const [fOpen, setFOpen] = useState(false);
  const [vis, setVis] = useState('all'); // all | visible | hidden
  const [connectedOnly, setConnectedOnly] = useState(false);
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');

  const groupOf = useMemo(() => new Map(groups.flatMap((g) => g.tables.map((t) => [t, g]))), [groups]);
  const adj = useMemo(() => {
    const a = new Map(tables.map((t) => [t.id, new Set()]));
    refs.forEach((r) => { const x = tid(r.child.schemaName, r.child.tableName), y = tid(r.parent.schemaName, r.parent.tableName); if (a.has(x) && a.has(y)) { a.get(x).add(y); a.get(y).add(x); } });
    return a;
  }, [tables, refs]);

  const q = search.trim();
  const rows = useMemo(() => {
    const m = matcher(q), ql = q.toLowerCase();
    return tables.filter((t) => (!q || m(`${t.schema}.${t.name}`) || t.fields.some((f) => m(f.name)) || (groupOf.get(t.id)?.name || '').toLowerCase().includes(ql))
      && (vis === 'all' || (vis === 'hidden') === hidden.has(t.id)) && (!connectedOnly || adj.get(t.id)?.size));
  }, [tables, q, vis, connectedOnly, hidden, groupOf, adj]);

  const sections = useMemo(() => {
    const map = new Map();
    const add = (key, color, t, inRows) => { if (!map.has(key)) map.set(key, { key, color, all: [], rows: [] }); const s = map.get(key); s.all.push(t); if (inRows) s.rows.push(t); };
    const inRows = new Set(rows.map((t) => t.id));
    tables.forEach((t) => {
      if (by === 'group') { const g = groupOf.get(t.id); add(g ? g.name : 'Ungrouped', g?.color || '#94a3b8', t, inRows.has(t.id)); } else add(t.schema, null, t, inRows.has(t.id));
    });
    const list = [...map.values()].filter((s) => s.rows.length);
    if (by === 'group') { const order = groups.map((g) => g.name); list.sort((a, b) => (order.indexOf(a.key) < 0 ? 1e6 : order.indexOf(a.key)) - (order.indexOf(b.key) < 0 ? 1e6 : order.indexOf(b.key))); } else list.sort((a, b) => a.key.localeCompare(b.key));
    return list;
  }, [tables, rows, by, groups, groupOf]);

  const isOpen = (k) => !!q || open.has(k);
  const toggleOpen = (k) => setOpen((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const shownCount = (list) => list.filter((t) => !hidden.has(t.id)).length;
  const toggleMany = (list) => onHide(list.map((t) => t.id), shownCount(list) > 0); // any visible -> hide all, else show all
  const only = (t) => onOnly([t.id, ...(adj.get(t.id) || [])]);
  const filtered = vis !== 'all' || connectedOnly;

  return (
    <aside className="tpn" aria-label="Tables panel" style={{ right }}>
      <div className="tpn-head"><b>Tables</b><small>{tables.length - hidden.size}/{tables.length} visible</small><button className="tpn-x" onClick={onClose} title="Close">✕</button></div>
      <div className="tpn-bar tpn-views">
        <select value={activeView} onChange={(e) => onView(e.target.value)} aria-label="Diagram view" title="Saved views: which tables are visible and where, detail level, highlights">
          <option value="">Main view</option>
          {views.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <button className="tpn-ic" onClick={() => setNaming((n) => !n)} title="Save what you see now as a new view"><Ico><path d="M12 5v14M5 12h14" /></Ico></button>
        {activeView && <button className="tpn-ic" onClick={() => { const n = window.prompt('Rename view', activeView); if (n) onRenameView(activeView, n); }} title="Rename this view"><Ico><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></Ico></button>}
        {activeView && <button className="tpn-ic" onClick={() => { if (window.confirm(`Delete the view "${activeView}"? The tables are not touched.`)) onDeleteView(activeView); }} title="Delete this view"><Ico><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></Ico></button>}
      </div>
      {naming && (
        <div className="tpn-bar">
          <input autoFocus placeholder="Name of the new view" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) { onCreateView(newName); setNewName(''); setNaming(false); } }} />
          <button className="tpn-chip" onClick={() => { if (newName.trim()) { onCreateView(newName); setNewName(''); setNaming(false); } }}>Save</button>
        </div>
      )}
      <div className="tpn-bar">
        <input ref={searchRef} placeholder="Search table, schema, column or group…" title="Plain text, VW_* wildcards or /regex/ (Ctrl+K)" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className={`tpn-ic ${filtered ? 'on' : ''}`} onClick={() => setFOpen((o) => !o)} title="Filters"><Funnel /></button>
      </div>
      {fOpen && (
        <div className="tpn-filters">
          <label>Show <select value={vis} onChange={(e) => setVis(e.target.value)}><option value="all">All tables</option><option value="visible">Visible only</option><option value="hidden">Hidden only</option></select></label>
          <label className="chk"><input type="checkbox" checked={connectedOnly} onChange={(e) => setConnectedOnly(e.target.checked)} /> Only tables with relationships</label>
        </div>
      )}
      <div className="tpn-bar">
        <select value={by} onChange={(e) => setBy(e.target.value)} aria-label="Group by">
          <option value="schema">Group by: Schema</option>
          <option value="group" disabled={!groups.length}>Group by: Table group{groups.length ? '' : ' (none)'}</option>
        </select>
        <button className="tpn-ic" onClick={() => toggleMany(rows)} title={shownCount(rows) ? 'Hide the tables listed below' : 'Show the tables listed below'} disabled={!rows.length}><Eye off={!shownCount(rows)} /></button>
      </div>
      <div className="tpn-list">
        {sections.map((s) => (
          <div key={s.key} className="tpn-sec">
            <div className="tpn-sh" onClick={() => toggleOpen(s.key)}>
              <Chev open={isOpen(s.key)} />
              {s.color ? <i className="tpn-dot" style={{ background: s.color }} /> : <i className="tpn-dot sq" />}
              <span className="tpn-sn" title={s.key}>{s.key}</span>
              <small className="tpn-cnt">{shownCount(s.all)}/{s.all.length}</small>
              <button className="tpn-ic sm" onClick={(e) => { e.stopPropagation(); toggleMany(s.all); }} title={shownCount(s.all) ? 'Hide all tables of this group' : 'Show all tables of this group'}><Eye off={!shownCount(s.all)} /></button>
            </div>
            {isOpen(s.key) && s.rows.map((t) => (
              <div key={t.id} className={`tpn-row ${activeId === t.id ? 'on' : ''} ${hidden.has(t.id) ? 'off' : ''}`} onClick={() => onFocus(t.id)} title={`${t.schema}.${t.name}`}>
                <span className="tpn-name">{t.name}</span>
                {by === 'group' && <small className="tpn-sch">{t.schema}</small>}
                <button className="tpn-ic sm hov" onClick={(e) => { e.stopPropagation(); only(t); }} title="Show only this table and the ones related to it"><Target /></button>
                <button className="tpn-ic sm" onClick={(e) => { e.stopPropagation(); onHide([t.id], !hidden.has(t.id)); }} title={hidden.has(t.id) ? 'Show on the diagram' : 'Hide from the diagram'}><Eye off={hidden.has(t.id)} /></button>
              </div>
            ))}
          </div>
        ))}
        {!sections.length && <div className="tpn-empty">No table matches.</div>}
      </div>
      <div className="tpn-foot">
        <button className={`tpn-chip ${hidden.size ? '' : 'idle'}`} onClick={() => onHide(tables.map((t) => t.id), false)} disabled={!hidden.size}><Eye /> {hidden.size ? `Show all (${hidden.size} hidden)` : 'All visible'}</button>
      </div>
    </aside>
  );
}
