import { useCallback, useEffect, useState } from 'react';
import { api, ago, errMsg } from './api.js';

// Account → Sessions (where this person is signed in; end any other one) and → Delete my account
export function Sessions({ notify }) {
  const [list, setList] = useState(null);
  const load = useCallback(() => api('auth/sessions').then(setList).catch((e) => notify('err', errMsg(e))), [notify]);
  useEffect(() => { load(); }, [load]);
  const end = async (id) => { try { await api(id ? `auth/sessions/${id}` : 'auth/sessions', undefined, 'DELETE'); notify('ok', id ? 'Session ended' : 'Other sessions ended'); await load(); } catch (e) { notify('err', errMsg(e)); } };
  return (
    <>
      <h4>Sessions</h4>
      {list?.map((s) => (
        <div key={s.id} className="card static session">
          <div className="grow"><b>{s.agent || 'Unknown device'}</b>{s.current && <span className="chip">this device</span>}<small>{s.ip || 'unknown address'} · {s.current ? 'active now' : `last used ${ago((s.lastSeen || s.createdAt || 0) * 1000)}`}</small></div>
          {!s.current && <button onClick={() => end(s.id)} aria-label={`End session on ${s.agent || 'unknown device'}`}>End</button>}
        </div>
      ))}
      {list && list.length > 1 && <button onClick={() => end('')}>Sign out all other sessions</button>}
    </>
  );
}

export function DeleteAccount({ days = 7, onDone }) {
  const [open, setOpen] = useState(false), [pw, setPw] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api('auth/account', { password: pw }, 'DELETE'); onDone(); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };
  if (!open) return <button onClick={() => setOpen(true)}>Delete my account…</button>;
  return (
    <form className="pw-form" onSubmit={submit}>
      <div className="warn">This closes your account now: you are signed out everywhere and your database connections are deleted. Your diagrams are kept for {days} days with no links or shared access, so an administrator can hand them to someone; after that they are deleted for good.</div>
      <input type="password" placeholder="Your password" aria-label="Your password, to confirm" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required />
      {err && <div className="auth-err">{err}</div>}
      <div className="row"><button disabled={busy || !pw}>{busy ? '…' : 'Delete my account'}</button><button type="button" onClick={() => { setOpen(false); setPw(''); setErr(''); }}>Cancel</button></div>
    </form>
  );
}
