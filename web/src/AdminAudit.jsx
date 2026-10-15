import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errMsg } from './api.js';

// Type filter: value = the comma-separated action prefixes the server matches; the label is also what the table shows for that action
const TYPES = [
  ['', 'Everything'],
  ['admin', 'Administrator actions', [['admin.post', 'Added'], ['admin.put,admin.patch', 'Changed'], ['admin.delete', 'Deleted']]],
  ['connection', 'Shared-connection use', [['connection.import', 'Imported'], ['connection.refresh', 'Refreshed'], ['connection.test', 'Tested'], ['connection.tables', 'Listed tables']]],
];
const LABEL = { 'admin.post': 'Added', 'admin.put': 'Changed', 'admin.patch': 'Changed', 'admin.delete': 'Deleted', 'connection.import': 'Imported', 'connection.refresh': 'Refreshed', 'connection.test': 'Tested', 'connection.tables': 'Listed tables' };
const SCOPES = [['users', 'Users'], ['groups', 'Groups'], ['settings', 'Settings']];
const when = (t) => new Date(t * 1000).toLocaleString();

// Administration → Audit log: who used which shared connection and what the administrators changed (180 days; never any secret or request body)
export default function AdminAudit({ setErr }) {
  const [rows, setRows] = useState(null), [more, setMore] = useState(false), [facets, setFacets] = useState({ actors: [], connections: [], diagrams: [] });
  const [type, setType] = useState(''), [actorId, setActorId] = useState(''), [on, setOn] = useState(''), [q, setQ] = useState(''); // on = 'connection:<id>' | 'diagram:<id>' | 'scope:<name>'
  const filt = () => {
    const [kind, v] = on.split(/:(.*)/);
    return { ...(type ? { action: type } : {}), ...(actorId ? { actorId } : {}), ...(kind === 'connection' ? { connectionId: v } : kind === 'diagram' ? { diagramId: v } : kind === 'scope' ? { scope: v } : {}), ...(q.trim() ? { q: q.trim() } : {}) };
  };
  const active = Object.keys(filt()).length > 0;
  const query = (before) => new URLSearchParams({ limit: '100', ...filt(), ...(before ? { before } : {}) }).toString();
  const load = useCallback((append) => api(`admin/audit?${query(append ? rows?.[rows.length - 1]?.id : '')}`).then((r) => { setRows((old) => (append ? [...(old || []), ...r] : r)); setMore(r.length === 100); }).catch((e) => setErr(errMsg(e))), [type, actorId, on, q, rows]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => load(false), 250); return () => clearTimeout(t); }, [type, actorId, on, q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api('admin/audit/facets').then(setFacets).catch((e) => setErr(errMsg(e))); }, [setErr]);
  const people = useMemo(() => { const n = new Map(); facets.actors.forEach((a) => n.set(a.name, (n.get(a.name) || 0) + 1)); return facets.actors.map((a) => ({ ...a, label: n.get(a.name) > 1 ? `${a.name} (#${a.id})` : a.name })); }, [facets.actors]);
  const clear = () => { setType(''); setActorId(''); setOn(''); setQ(''); };

  return (
    <>
      <div className="audit-bar">
        <select value={actorId} onChange={(e) => setActorId(e.target.value)} aria-label="Done by">
          <option value="">Done by: everybody</option>
          {people.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <select value={on} onChange={(e) => setOn(e.target.value)} aria-label="Target">
          <option value="">Target: everything</option>
          {facets.connections.length > 0 && <optgroup label="Databases">{facets.connections.map((c) => <option key={c.id} value={`connection:${c.id}`}>{c.name}</option>)}</optgroup>}
          {facets.diagrams.length > 0 && <optgroup label="Diagrams">{facets.diagrams.map((d) => <option key={d.id} value={`diagram:${d.id}`}>{d.title || `${d.id.slice(0, 8)} (deleted)`}</option>)}</optgroup>}
          <optgroup label="Administration">{SCOPES.map(([v, l]) => <option key={v} value={`scope:${v}`}>{l}</option>)}</optgroup>
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type of operation">
          {TYPES.map(([v, l, sub]) => (sub
            ? <optgroup key={v} label={l}><option value={v}>All: {l.toLowerCase()}</option>{sub.map(([sv, sl]) => <option key={sv} value={sv}>{sl}</option>)}</optgroup>
            : <option key={v} value={v}>Type: {l.toLowerCase()}</option>))}
        </select>
        <input placeholder="Search person, connection, diagram or detail" value={q} onChange={(e) => setQ(e.target.value)} />
        {active && <button type="button" onClick={clear}>Clear filters</button>}
        <a className="btn" href={`/api/admin/audit.csv?${new URLSearchParams(filt())}`} download>Download CSV</a>
      </div>
      <small className="hint">Kept for 180 days. It records the use of <b>shared</b> connections (test, list tables, import, refresh) and every change made in the Administration panel. Personal connections are private and are not recorded.</small>
      {rows && rows.length === 0 && <small className="hint">Nothing recorded for this filter.</small>}
      {rows && rows.length > 0 && (
        <table className="admin-table audit">
          <thead><tr><th>When</th><th>Who</th><th>What</th><th>Target</th><th>Diagram</th><th>Detail</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className={r.ok ? '' : 'bad'}>
              <td>{when(r.at)}</td><td>{r.actor || '—'}</td><td>{LABEL[r.action] && <b>{LABEL[r.action]} </b>}<code>{r.action}</code>{!r.ok && <span className="chip">failed</span>}</td>
              <td>{r.target || ''}</td><td title={r.diagramId || ''}>{r.diagramId ? r.diagramId.slice(0, 8) : ''}</td><td className="audit-detail">{r.detail || ''}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {more && <button onClick={() => load(true)}>Load more</button>}
    </>
  );
}
