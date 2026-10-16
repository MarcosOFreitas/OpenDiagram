import { useCallback, useEffect, useState } from 'react';
import { api, ago, errMsg, copyText } from './api.js';
import Loading from './Loading.jsx';

// Account → Sessions (where this person is signed in; end any other one) and → Delete my account
export function Sessions({ notify }) {
  const [list, setList] = useState(null);
  const load = useCallback(() => api('auth/sessions').then(setList).catch((e) => notify('err', errMsg(e))), [notify]);
  useEffect(() => { load(); }, [load]);
  const end = async (id) => { try { await api(id ? `auth/sessions/${id}` : 'auth/sessions', undefined, 'DELETE'); notify('ok', id ? 'Session ended' : 'Other sessions ended'); await load(); } catch (e) { notify('err', errMsg(e)); } };
  return (
    <>
      <h4>Sessions</h4>
      {!list && <Loading label="Loading sessions" />}
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

// Account → Recovery key: kept by the person (shown once); with it they choose a new password from the sign-in screen
export function RecoveryKey({ notify }) {
  const [st, setSt] = useState(null), [ask, setAsk] = useState(false), [pw, setPw] = useState(''), [key, setKey] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const load = useCallback(() => api('auth/recovery').then(setSt).catch((e) => notify('err', errMsg(e))), [notify]);
  useEffect(() => { load(); }, [load]);
  const make = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { setKey((await api('auth/recovery', { password: pw })).key); setAsk(false); setPw(''); await load(); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };
  const remove = async () => { try { await api('auth/recovery', undefined, 'DELETE'); setKey(''); notify('ok', 'Recovery key removed'); await load(); } catch (x) { notify('err', errMsg(x)); } };
  return (
    <>
      <h4>Recovery key</h4>
      <small className="hint">If you forget your password, this key lets you choose a new one from the sign-in screen, without an administrator. Keep it in a password manager: anyone who has it and knows your e-mail can take over the account. It works once.</small>
      {key && (
        <div className="warn">
          <b>Copy it now: it is shown only this once.</b>
          <div className="row"><input readOnly value={key} aria-label="Your new recovery key" onFocus={(e) => e.target.select()} /><button type="button" onClick={() => copyText(key, 'Recovery key copied', notify)}>Copy</button></div>
          <button type="button" onClick={() => setKey('')}>I saved it</button>
        </div>
      )}
      {!st && <Loading label="Loading" />}
      {st && !key && <small className="hint">{st.has ? `You have a recovery key (made ${new Date(st.createdAt * 1000).toLocaleDateString()}).` : 'You do not have one yet.'}</small>}
      {!ask && !key && <div className="row"><button onClick={() => setAsk(true)}>{st?.has ? 'Generate a new key' : 'Generate a recovery key'}</button>{st?.has && <button onClick={remove}>Remove</button>}</div>}
      {ask && (
        <form className="pw-form" onSubmit={make}>
          <input type="password" placeholder="Your password" aria-label="Your password, to make the key" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required />
          {err && <div className="auth-err">{err}</div>}
          <div className="row"><button className="primary" disabled={busy || !pw}>{busy ? '…' : 'Generate'}</button><button type="button" onClick={() => { setAsk(false); setPw(''); setErr(''); }}>Cancel</button></div>
        </form>
      )}
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
