import { Logo } from './Icons.jsx';
import { useState } from 'react';
import { api } from './api.js';

const Brand = ({ org }) => <div className="brand"><Logo /> {org || 'OpenDiagram'}</div>;

// e-mail + password sign in / sign up. `signup`: public sign-up is open. `firstRun`: no account exists yet (this one becomes the administrator).
export default function AuthScreen({ onDone, onCancel, signup = false, firstRun = false, org, hint }) {
  const [mode, setMode] = useState(firstRun ? 'register' : 'login');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { onDone((await api(`auth/${mode === 'login' ? 'login' : 'register'}`, f)).user); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <Brand org={org} />
        <h2>{mode === 'login' ? 'Sign in' : firstRun ? 'Welcome — create the administrator account' : 'Create your account'}</h2>
        {firstRun && mode === 'register' && <p className="hint">This is a new installation: the first account becomes the administrator and can then create everyone else's account and groups.</p>}
        {hint && <p className="hint">{hint}</p>}
        {mode === 'register' && <input placeholder="Name" value={f.name} onChange={set('name')} autoComplete="name" />}
        <input type="email" placeholder="E-mail" value={f.email} onChange={set('email')} autoComplete="email" required autoFocus />
        <input type="password" placeholder={mode === 'register' ? 'Password (10+ characters)' : 'Password'} value={f.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
        {err && <div className="auth-err">{err}</div>}
        <button className="primary" disabled={busy}>{busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        {signup && !firstRun && (
          <small className="hint">
            {mode === 'login' ? <>No account? <a onClick={() => { setMode('register'); setErr(''); }}>Create one</a></> : <>Already registered? <a onClick={() => { setMode('login'); setErr(''); }}>Sign in</a></>}
          </small>
        )}
        {!signup && mode === 'login' && <small className="hint">Accounts are created by an administrator of this installation.</small>}
        {onCancel && <small className="hint"><a onClick={onCancel}>Continue without signing in</a></small>}
      </form>
    </div>
  );
}

// change password (used in the Account tab and as the full-screen step for accounts created/reset by an administrator)
export function PasswordForm({ forced, onDone, org }) {
  const [f, setF] = useState({ current: '', next: '', again: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    if (f.next !== f.again) return setErr('the two new passwords do not match');
    setBusy(true); setErr(''); setOk(false);
    try { const r = await api('auth/password', { current: f.current, next: f.next }); setF({ current: '', next: '', again: '' }); setOk(true); onDone?.(r.user); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const form = (
    <form className={forced ? 'auth-card' : 'pw-form'} onSubmit={submit}>
      {forced && <><Brand org={org} /><h2>Choose a new password</h2><p className="hint">An administrator created or reset your account. Enter the temporary password you were given and choose your own.</p></>}
      <input type="password" placeholder={forced ? 'Temporary password' : 'Current password'} value={f.current} onChange={set('current')} autoComplete="current-password" required />
      <input type="password" placeholder="New password (10+ characters)" value={f.next} onChange={set('next')} autoComplete="new-password" required />
      <input type="password" placeholder="Repeat new password" value={f.again} onChange={set('again')} autoComplete="new-password" required />
      {err && <div className="auth-err">{err}</div>}
      {ok && !forced && <div className="auth-ok">Password changed. Your other sessions were signed out.</div>}
      <button className="primary" disabled={busy}>{busy ? '…' : 'Change password'}</button>
    </form>
  );
  return forced ? <div className="auth-wrap">{form}</div> : form;
}
