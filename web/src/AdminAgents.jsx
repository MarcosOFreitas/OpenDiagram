import { useCallback, useEffect, useState } from 'react';
import { api, errMsg, copyText } from './api.js';
import Loading from './Loading.jsx';
import Empty from './Empty.jsx';

const when = (t) => (t ? new Date(t * 1000).toLocaleString() : 'never');
const EXPIRY = [['', 'Never expires'], ['30', '30 days'], ['90', '90 days'], ['365', '1 year']];

// Administration → Agents: accounts for an AI client (the MCP connector). An agent can open nothing until the owner of a diagram shares it with it
// (Share → person → its name), and it never sees a database connection or a credential. Its token works only on /mcp and is shown once.
export default function AdminAgents({ settings, act, setErr, notify }) {
  const [list, setList] = useState(null);
  const [fresh, setFresh] = useState(null); // { agent, token } shown once
  const load = useCallback(() => api('admin/agents').then(setList).catch((e) => setErr(errMsg(e))), [setErr]);
  useEffect(() => { load(); }, [load]);
  const url = `${location.origin}/mcp`;
  const run = (fn, ok) => act(async () => { await fn(); await load(); }, ok);

  const create = (e) => {
    e.preventDefault();
    const form = e.currentTarget, name = String(new FormData(form).get('agent') || '').trim();
    if (!name) { setErr('give the agent a name'); return; }
    run(async () => { await api('admin/agents', { name }); form.reset(); }, 'Agent created: now create a token for it and share diagrams with it')();
  };
  const newToken = (a, e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(async () => { const r = await api(`admin/agents/${a.id}/tokens`, { name: String(f.get('tname') || '').trim() || 'token', ...(f.get('days') ? { expiresInDays: +f.get('days') } : {}) }); setFresh({ agent: a.name, token: r.token }); }, '')();
  };

  return (
    <>
      <div className="admin-top">
        <small className="hint">An <b>agent</b> is an account for an AI client (the MCP connector, for example Claude Code). It can open nothing until the owner of a diagram shares it with it, as with a person (<b>Share → Person</b>, search its name), at <b>view</b>, <b>comment</b> or <b>edit</b>. It never sees database connections or credentials. Every call goes to <b>Sign-ins &amp; connections</b>.</small>
      </div>
      {settings && !settings.allowAgents && <div className="warn">Agents are switched off: no token works. Turn them on in <b>Settings → Agents</b>.</div>}
      {fresh && (
        <div className="warn">
          <b>Token for {fresh.agent}</b> — shown only once. Copy it now.
          <div className="row"><input readOnly value={fresh.token} aria-label="New agent token" onFocus={(e) => e.target.select()} /><button type="button" onClick={() => copyText(fresh.token, 'Token copied', notify)}>Copy</button></div>
          <small className="hint">Claude Code: <code>claude mcp add --transport http opendiagram {url} --header "Authorization: Bearer …"</code> (see the documentation page <i>Connect Claude (MCP)</i>).</small>
          <button type="button" onClick={() => setFresh(null)}>I saved it</button>
        </div>
      )}
      <form className="admin-form group-form" onSubmit={create} autoComplete="off">
        <input name="agent" placeholder="New agent name (for example: Claude of the data team)" aria-label="New agent name" autoComplete="off" />
        <button type="submit" className="primary">Create agent</button>
      </form>
      {!list && <Loading label="Loading agents" />}
      {list && list.length === 0 && <Empty title="No agents yet">Create one, make a token for it, then share the diagrams it may use.</Empty>}
      <div className="admin-grid">
        {list?.map((a) => (
          <div key={a.id} className="group-card">
            <div className="group-head">
              <b>{a.name}</b>{a.disabled && <span className="chip">disabled</span>}
              <span className="grow" />
              <button onClick={() => { const n = window.prompt('Rename agent', a.name); if (n && n.trim() && n !== a.name) run(() => api(`admin/agents/${a.id}`, { name: n }, 'PATCH'), 'Agent renamed')(); }}>Rename</button>
              <button onClick={run(() => api(`admin/agents/${a.id}`, { disabled: !a.disabled }, 'PATCH'), a.disabled ? 'Agent enabled' : 'Agent disabled')}>{a.disabled ? 'Enable' : 'Disable'}</button>
              <button onClick={() => { if (window.confirm(`Delete the agent "${a.name}"? Its tokens stop working and its access to diagrams is removed.`)) run(() => api(`admin/agents/${a.id}`, undefined, 'DELETE'), 'Agent deleted')(); }}>Delete</button>
            </div>
            {a.tokens.length === 0 && <small className="hint">No token yet.</small>}
            {a.tokens.map((t) => (
              <div key={t.id} className="group-head">
                <span className="grow"><b>{t.name}</b><small className="hint"> made {when(t.createdAt)} · used {when(t.lastUsed)} · {t.revoked ? 'revoked' : t.expired ? 'expired' : t.expiresAt ? `expires ${when(t.expiresAt)}` : 'no expiry'}</small></span>
                {!t.revoked && <button onClick={() => { if (window.confirm(`Revoke the token "${t.name}"? It stops working at once.`)) run(() => api(`admin/agents/${a.id}/tokens/${t.id}`, undefined, 'DELETE'), 'Token revoked')(); }} aria-label={`Revoke token ${t.name}`}>Revoke</button>}
              </div>
            ))}
            <form className="row" onSubmit={(e) => newToken(a, e)}>
              <input name="tname" placeholder="Token name" aria-label={`Token name for ${a.name}`} autoComplete="off" />
              <select name="days" aria-label={`Token lifetime for ${a.name}`}>{EXPIRY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <button type="submit">+ Token</button>
            </form>
          </div>
        ))}
      </div>
    </>
  );
}
