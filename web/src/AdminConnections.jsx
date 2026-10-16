import { useCallback, useEffect, useState } from 'react';
import { api, errMsg } from './api.js';
import Loading from './Loading.jsx';
import Empty from './Empty.jsx';

const BLANK = { id: '', type: 'postgres', name: '', host: '', port: 5432, database: '', user: '', password: '', tls: 'verify', serverDn: '', caPem: '', blockWritable: true };

// Administration → Connections: database connections registered once by an administrator (read-only credential) and shared with people and groups.
// Members use them without ever seeing the user, the password or the CA; every use goes to the audit log.
export default function AdminConnections({ users, groups, act, setErr }) {
  const [list, setList] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [open, setOpen] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const load = useCallback(() => api('admin/connections').then(setList).catch((e) => setErr(errMsg(e))), [setErr]);
  useEffect(() => { load(); }, [load]);

  const edit = (c) => { setForm({ ...BLANK, ...c, password: '', caPem: '' }); setOpen(true); };
  const save = act(async () => {
    if (!form.id && !form.password) throw new Error('enter the password of the database user');
    await api('admin/connections', { ...form, port: +form.port || (form.type === 'oracle' ? 1521 : 5432), ...(form.id ? {} : { id: undefined }) });
    setForm(BLANK); setOpen(false); await load();
  }, 'Connection saved');
  const test = (c) => act(async () => { const r = await api('schemas', { id: c.id }); if (r.warnings?.length) throw new Error(`Connected, but this credential ${r.warnings.join('; ')}. Use a read-only user.`); }, 'Connected (read-only session): no extra privileges')();
  const remove = (c) => { if (window.confirm(`Delete the shared connection "${c.name}"? Diagrams linked to it keep their text but can no longer refresh.`)) act(async () => { await api(`admin/connections/${c.id}`, undefined, 'DELETE'); await load(); }, 'Connection deleted')(); };
  const grant = (c, next) => act(async () => { await api(`admin/connections/${c.id}/access`, { users: next.filter((a) => a.type === 'user').map((a) => a.id), groups: next.filter((a) => a.type === 'group').map((a) => a.id) }, 'PUT'); await load(); }, 'Access updated')();

  return (
    <>
      <div className="admin-top">
        <small className="hint">Register a connection once with a <b>read-only</b> database user and choose who may use it. People see its name, type, host and database, never the user, the password or the certificate. Every use is recorded in the <b>Sign-ins &amp; connections</b> log.</small>
        {!open && <button className="primary" onClick={() => { setForm(BLANK); setOpen(true); }}>+ Register a shared connection</button>}
      </div>
      {open && (
        <form className="conn-form" onSubmit={(e) => { e.preventDefault(); save(); }} autoComplete="off">
          <div className="seg">{[['postgres', 'PostgreSQL'], ['oracle', 'Oracle']].map(([v, l]) => <button type="button" key={v} className={form.type === v ? 'on' : ''} onClick={() => setForm({ ...form, type: v, port: v === 'oracle' ? 1521 : 5432 })}>{l}</button>)}</div>
          <input placeholder="Name (shown to people)" value={form.name} onChange={set('name')} required />
          <div className="row"><input placeholder="Host" value={form.host} onChange={set('host')} required /><input className="port" placeholder="Port" value={form.port} onChange={set('port')} /></div>
          <input placeholder={form.type === 'oracle' ? 'Service name (e.g. FREEPDB1)' : 'Database'} value={form.database} onChange={set('database')} required />
          <div className="row"><input placeholder="Database user (read-only)" value={form.user} onChange={set('user')} required autoComplete="off" /><input type="password" placeholder={form.id ? '(unchanged)' : 'Password'} value={form.password} onChange={set('password')} autoComplete="new-password" /></div>
          <select value={form.tls} onChange={set('tls')} title="Transport encryption">
            <option value="off">TLS: off</option>
            <option value="verify">TLS: on — verify certificate</option>
            <option value="noverify">TLS: on — do not verify (not recommended)</option>
          </select>
          {form.tls === 'verify' && form.type === 'postgres' && <textarea className="pem" placeholder={form.hasCa ? '(CA certificate saved — paste a new PEM to replace)' : 'CA certificate (PEM) — only for a private CA'} value={form.caPem} onChange={set('caPem')} />}
          {form.type === 'oracle' && form.tls === 'verify' && <input placeholder="Expected server certificate DN (optional)" value={form.serverDn} onChange={set('serverDn')} />}
          <label className="chk"><input type="checkbox" checked={!!form.blockWritable} onChange={set('blockWritable')} /> Refuse to use this credential if it has write privileges (strict, recommended)</label>
          <div className="row"><button type="submit" className="primary">{form.id ? 'Save changes' : 'Register'}</button><button type="button" onClick={() => { setForm(BLANK); setOpen(false); }}>Cancel</button></div>
        </form>
      )}
      {!list && <Loading label="Loading connections" />}
      {list && list.length === 0 && !open && <Empty title="No shared connections yet">Register one with a read-only database user, then choose the groups and people who may use it.</Empty>}
      <div className="admin-grid">
      {list?.map((c) => {
        const addable = [...groups.filter((g) => !c.access.some((a) => a.type === 'group' && a.id === g.id)).map((g) => ({ type: 'group', id: g.id, name: `Group: ${g.name}` })),
          ...users.filter((u) => !u.disabled && !c.access.some((a) => a.type === 'user' && a.id === u.id)).map((u) => ({ type: 'user', id: u.id, name: `${u.name} — ${u.email}` }))];
        return (
          <div key={c.id} className="group-card">
            <div className="group-head">
              <span className={`badge ${c.type}`}>{c.type === 'oracle' ? 'ORA' : 'PG'}</span>
              <b>{c.name}</b><small>{c.host}:{c.port}/{c.database} · user <code>{c.user}</code> · TLS {c.tls}</small>
              <span className="grow" />
              <button onClick={() => test(c)}>Test</button>
              <button onClick={() => edit(c)}>Edit</button>
              <button onClick={() => remove(c)}>Delete</button>
            </div>
            <div className="group-members">
              {c.access.length === 0 && <small className="hint">Nobody can use it yet (administrators always can).</small>}
              {c.access.map((a) => <span key={`${a.type}${a.id}`} className="chip member">{a.type === 'group' ? `Group: ${a.name}` : a.name}<a title="Remove access" onClick={() => grant(c, c.access.filter((x) => !(x.type === a.type && x.id === a.id)))}>✕</a></span>)}
              <select value="" onChange={(e) => { const a = addable.find((x) => `${x.type}:${x.id}` === e.target.value); if (a) grant(c, [...c.access, a]); }}>
                <option value="">+ give access to…</option>
                {addable.map((a) => <option key={`${a.type}:${a.id}`} value={`${a.type}:${a.id}`}>{a.name}</option>)}
              </select>
            </div>
          </div>
        );
      })}
      </div>
    </>
  );
}
