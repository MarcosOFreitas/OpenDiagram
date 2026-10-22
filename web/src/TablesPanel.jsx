import { useMemo, useState } from 'react';
import { tid } from './docsModel.js';
import { Ic } from './Icons.jsx';
import { tableMatcher } from './TablePicker.jsx';

const Eye = ({ off }) => <Ic n={off ? 'eyeOff' : 'eye'} s={15} />;
const Chev = ({ open }) => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }} aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>;


// Right-hand panel of the diagram. The saved view on top applies to both tabs: Tables (search, group by schema / TableGroup, show or
// hide tables on the canvas, jump to a table) and Display (`display`: how the canvas draws them, built by the caller).
// hidden: Set of table ids; onHide(ids, hide); onOnly(ids) = show only these; onFocus(id) = select + center; tab / onTab: 'tables' | 'display'.
export default function TablesPanel({ right = 0, tab = 'tables', onTab, display, lineage = [], onLineage, views = [], activeView = '', onView, onCreateView, onDeleteView, onRenameView, tables, groups, refs, hidden, onHide, onOnly, onFocus, activeId, search, setSearch, searchRef, onClose }) {
  const [by, setBy] = useState(groups.length ? 'group' : 'schema'); // schema | group
  const [open, setOpen] = useState(() => new Set());
  const [fOpen, setFOpen] = useState(false);
  const [vis, setVis] = useState('all'); // all | visible | hidden
  const [connectedOnly, setConnectedOnly] = useState(false);
  const [linOnly, setLinOnly] = useState(false);
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');

  const groupOf = useMemo(() => new Map(groups.flatMap((g) => g.tables.map((t) => [t, g]))), [groups]);
  const adj = useMemo(() => {
    const a = new Map(tables.map((t) => [t.id, new Set()]));
    refs.forEach((r) => { const x = tid(r.child.schemaName, r.child.tableName), y = tid(r.parent.schemaName, r.parent.tableName); if (a.has(x) && a.has(y)) { a.get(x).add(y); a.get(y).add(x); } });
    return a;
  }, [tables, refs]);

  const linIds = useMemo(() => new Set(lineage.flatMap((l) => [l.source, l.target])), [lineage]); // tables that take part in some data lineage
  const q = search.trim();
  const rows = useMemo(() => {
    const match = tableMatcher(q);
    return tables.filter((t) => match(t, groupOf.get(t.id)?.name)
      && (vis === 'all' || (vis === 'hidden') === hidden.has(t.id)) && (!connectedOnly || adj.get(t.id)?.size) && (!linOnly || linIds.has(t.id)));
  }, [tables, q, vis, connectedOnly, linOnly, linIds, hidden, groupOf, adj]);

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
  const filtered = vis !== 'all' || connectedOnly || linOnly;

  return (
    <aside className="tpn" aria-label="Tables panel" style={{ right }}>
      <div className="tpn-head">
        <div className="seg tpn-tabs" role="tablist" aria-label="Diagram panel">
          <button role="tab" id="tpn-tab-tables" aria-controls="tpn-tables" aria-selected={tab === 'tables'} className={tab === 'tables' ? 'on' : ''} onClick={() => onTab('tables')}>Tables <small>{tables.length - hidden.size}/{tables.length}</small></button>
          <button role="tab" id="tpn-tab-display" aria-controls="tpn-display" aria-selected={tab === 'display'} className={tab === 'display' ? 'on' : ''} onClick={() => onTab('display')}>Display</button>
        </div>
        <button className="tpn-x" onClick={onClose} title="Close the panel" aria-label="Close the panel">✕</button>
      </div>
      <div className="tpn-bar tpn-views">
        <select value={activeView} onChange={(e) => onView(e.target.value)} aria-label="Diagram view" title="Saved views: which tables are visible and where, detail level, highlights">
          <option value="">Main view</option>
          {views.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <button className="tpn-ic" onClick={() => setNaming((n) => !n)} title="Save what you see now as a new view"><Ic n="plus" s={15} /></button>
        {activeView && <button className="tpn-ic" onClick={() => { const n = window.prompt('Rename view', activeView); if (n) onRenameView(activeView, n); }} title="Rename this view"><Ic n="edit" s={15} /></button>}
        {activeView && <button className="tpn-ic" onClick={() => { if (window.confirm(`Delete the view "${activeView}"? The tables are not touched.`)) onDeleteView(activeView); }} title="Delete this view"><Ic n="trash" s={15} /></button>}
      </div>
      {naming && (
        <div className="tpn-bar">
          <input autoFocus placeholder="Name of the new view" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) { onCreateView(newName); setNewName(''); setNaming(false); } }} />
          <button className="tpn-chip" onClick={() => { if (newName.trim()) { onCreateView(newName); setNewName(''); setNaming(false); } }}>Save</button>
        </div>
      )}
      {tab === 'display' ? <div className="dbody tpn-display" id="tpn-display" role="tabpanel" aria-labelledby="tpn-tab-display">{display}</div> : <div className="tpn-tabpanel" id="tpn-tables" role="tabpanel" aria-labelledby="tpn-tab-tables">
      <div className="tpn-bar">
        <input ref={searchRef} placeholder="Search table, schema, column or group…" title="Plain text, VW_* wildcards or /regex/ (Ctrl+K)" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className={`tpn-ic ${filtered ? 'on' : ''}`} onClick={() => setFOpen((o) => !o)} title="Filters"><Ic n="funnel" s={15} /></button>
      </div>
      {fOpen && (
        <div className="tpn-filters">
          <label>Show <select value={vis} onChange={(e) => setVis(e.target.value)}><option value="all">All tables</option><option value="visible">Visible only</option><option value="hidden">Hidden only</option></select></label>
          <label className="chk"><input type="checkbox" checked={connectedOnly} onChange={(e) => setConnectedOnly(e.target.checked)} /> Only tables with relationships</label>
          {lineage.length > 0 && <label className="chk"><input type="checkbox" checked={linOnly} onChange={(e) => setLinOnly(e.target.checked)} /> Only tables with data lineage</label>}
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
            <div className="tpn-sh" data-mouse-extra onClick={() => toggleOpen(s.key)}>
              <button className="tpn-ic sm" aria-expanded={isOpen(s.key)} title={`${isOpen(s.key) ? 'Collapse' : 'Expand'} ${s.key}`} aria-label={`${isOpen(s.key) ? 'Collapse' : 'Expand'} ${s.key}`} onClick={(e) => { e.stopPropagation(); toggleOpen(s.key); }}><Chev open={isOpen(s.key)} /></button>
              {s.color ? <i className="tpn-dot" style={{ background: s.color }} /> : <i className="tpn-dot sq" />}
              <span className="tpn-sn" title={s.key}>{s.key}</span>
              <small className="tpn-cnt">{shownCount(s.all)}/{s.all.length}</small>
              <button className="tpn-ic sm" onClick={(e) => { e.stopPropagation(); toggleMany(s.all); }} title={shownCount(s.all) ? 'Hide all tables of this group' : 'Show all tables of this group'}><Eye off={!shownCount(s.all)} /></button>
            </div>
            {isOpen(s.key) && s.rows.map((t) => (
              <div key={t.id} className={`tpn-row ${activeId === t.id ? 'on' : ''} ${hidden.has(t.id) ? 'off' : ''}`} onClick={() => onFocus(t.id)} title={`${t.schema}.${t.name}`}>
                <span className="tpn-name">{t.name}</span>
                {by === 'group' && <small className="tpn-sch">{t.schema}</small>}
                {linIds.has(t.id) && <button className="tpn-ic sm hov" onClick={(e) => { e.stopPropagation(); onLineage(t.id); }} title="Show only this table and everything it is built from or feeds (data lineage)"><Ic n="flow" s={15} /></button>}
                <button className="tpn-ic sm hov" onClick={(e) => { e.stopPropagation(); only(t); }} title="Show only this table and the ones related to it"><Ic n="target" s={15} /></button>
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
      </div>}
    </aside>
  );
}
