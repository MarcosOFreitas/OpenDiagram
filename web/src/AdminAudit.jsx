import { useCallback, useEffect, useState } from 'react';
import { api, errMsg } from './api.js';

const FILTERS = [['', 'Everything'], ['connection', 'Use of shared connections'], ['admin', 'Administrator actions']];
const when = (t) => new Date(t * 1000).toLocaleString();

// Administration → Audit log: who used which shared connection and what the administrators changed (180 days; never any secret or request body)
export default function AdminAudit({ setErr }) {
  const [rows, setRows] = useState(null), [action, setAction] = useState(''), [q, setQ] = useState(''), [more, setMore] = useState(false);
  const query = (before) => new URLSearchParams({ limit: '100', ...(action ? { action } : {}), ...(q.trim() ? { q: q.trim() } : {}), ...(before ? { before } : {}) }).toString();
  const load = useCallback((append) => api(`admin/audit?${query(append ? rows?.[rows.length - 1]?.id : '')}`).then((r) => { setRows((old) => (append ? [...(old || []), ...r] : r)); setMore(r.length === 100); }).catch((e) => setErr(errMsg(e))), [action, q, rows]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => load(false), 250); return () => clearTimeout(t); }, [action, q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="audit-bar">
        <select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Kind of event">{FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <input placeholder="Search person, connection, diagram or detail" value={q} onChange={(e) => setQ(e.target.value)} />
        <a className="tbtn" href={`/api/admin/audit.csv?${new URLSearchParams({ ...(action ? { action } : {}), ...(q.trim() ? { q: q.trim() } : {}) })}`} download>Download CSV</a>
      </div>
      <small className="hint">Kept for 180 days. It records the use of <b>shared</b> connections (test, list tables, import, refresh) and every change made in the Administration panel. Personal connections are private and are not recorded.</small>
      {rows && rows.length === 0 && <small className="hint">Nothing recorded for this filter.</small>}
      {rows && rows.length > 0 && (
        <table className="admin-table audit">
          <thead><tr><th>When</th><th>Who</th><th>What</th><th>Target</th><th>Diagram</th><th>Detail</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className={r.ok ? '' : 'bad'}>
              <td>{when(r.at)}</td><td>{r.actor || '—'}</td><td><code>{r.action}</code>{!r.ok && <span className="chip">failed</span>}</td>
              <td>{r.target || ''}</td><td title={r.diagramId || ''}>{r.diagramId ? r.diagramId.slice(0, 8) : ''}</td><td className="audit-detail">{r.detail || ''}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {more && <button onClick={() => load(true)}>Load more</button>}
    </>
  );
}
