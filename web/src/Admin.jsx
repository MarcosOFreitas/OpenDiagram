import { useCallback, useEffect, useState } from 'react';
import { api, errMsg, copyText } from './api.js';
import AdminConnections from './AdminConnections.jsx';
import AdminAudit from './AdminAudit.jsx';

// Administration overlay: users, groups (flat; one user can be in several) and instance settings
import Loading from './Loading.jsx';
import Empty from './Empty.jsx';

export default function Admin({ me, onClose, notify, onSettings }) {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [settings, setSettings] = useState(null);
  const [closed, setClosed] = useState([]); // diagrams of closed accounts, waiting for an administrator
  const [secret, setSecret] = useState(null); // { who, password } shown once after create / reset
  const [err, setErr] = useState('');
  const [ready, setReady] = useState(false); // the first load has finished (until then the panel shows the loading mark, at its final size)

  const load = useCallback(async () => {
    try { const [u, g, s, c] = await Promise.all([api('admin/users'), api('admin/groups'), api('admin/settings'), api('admin/closed-diagrams')]); setUsers(u); setGroups(g); setSettings(s); setClosed(c); }
    catch (e) { setErr(errMsg(e)); } finally { setReady(true); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // errors are shown inside the panel (a toast would sit behind it)
  const act = (fn, ok) => async () => { setErr(''); try { await fn(); await load(); if (ok) notify('ok', ok); } catch (e) { setErr(errMsg(e)); } };
  const copy = (t) => copyText(t, 'Copied', notify);

  const submitUser = (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = { email: String(f.get('email') || '').trim(), name: String(f.get('name') || '').trim(), role: f.get('role') || 'member', password: String(f.get('password') || '') || undefined };
    if (!body.email) { setErr('enter the e-mail of the new user'); return; }
    const form = e.currentTarget;
    act(async () => {
      const r = await api('admin/users', body);
      form.reset();       setSecret({ who: r.user.email, password: r.tempPassword ?? null });
    }, 'User created — they must choose a new password at first sign-in')();
  };
  const submitGroup = (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = String(new FormData(form).get('group') || '').trim();
    if (!name) { setErr('enter a name for the group'); return; }
    act(async () => { await api('admin/groups', { name }); form.reset(); }, 'Group created')();
  };
  const resetPassword = (u) => act(async () => {
    if (!window.confirm(`Reset the password of ${u.email}? They are signed out everywhere and must choose a new one.`)) return;
    const r = await api(`admin/users/${u.id}/reset-password`, {});
    setSecret({ who: u.email, password: r.tempPassword });
  })();
  const removeUser = (u) => act(async () => {
    if (!window.confirm(`Delete ${u.email}? Their diagrams and saved connections are deleted too. (Disabling keeps everything.)`)) return;
    await api(`admin/users/${u.id}`, undefined, 'DELETE');
  }, 'User deleted')();

  const notInGroup = (g) => users.filter((u) => !u.disabled && !g.members.some((m) => m.id === u.id));

  return (
    <div className="admin" role="dialog" aria-label="Administration">
      <div className="admin-card adm">
        <div className="admin-head">
          <h2>Administration</h2>
          <div className="dtabs">
            {[['users', `Users (${users.length})`], ['groups', `Groups (${groups.length})`], ['connections', 'Connections'], ['audit', 'Audit log'], ['access', 'Sign-ins & connections'], ['settings', 'Settings']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
          </div>
          <button className="x" onClick={onClose} title="Close (Esc)">✕</button>
        </div>

        <div className="admin-body">
          {err && <div className="auth-err">{err} <a onClick={() => setErr('')}>dismiss</a></div>}
          {secret && (
            <div className="warn">
              {secret.password
                ? <><b>Temporary password for {secret.who}</b> — shown only once. <code>{secret.password}</code> <button onClick={() => copy(secret.password)}>Copy</button> They must choose a new password at the next sign-in.</>
                : <><b>{secret.who}</b> was created with the password you typed; they must change it at first sign-in.</>}
              <button className="ghost" onClick={() => setSecret(null)}>✕</button>
            </div>
          )}

          {!ready && <Loading label="Loading administration" />}
          {ready && tab === 'users' && (<>
            <form className="admin-form" onSubmit={submitUser} autoComplete="off">
              <input name="email" type="text" inputMode="email" placeholder="E-mail" autoComplete="off" />
              <input name="name" placeholder="Name" autoComplete="off" />
              <select name="role" defaultValue="member"><option value="member">Member</option><option value="admin">Administrator</option></select>
              <input name="password" placeholder="Password (empty = generate)" autoComplete="new-password" />
              <button type="submit" className="primary">Add user</button>
            </form>
            <table className="admin-table">
              <thead><tr><th>User</th><th>Role</th><th>Groups</th><th>Status</th><th /></tr></thead>
              <tbody>
                {users.map((u) => {
                  const self = u.id === me.id;
                  return (
                    <tr key={u.id} className={u.disabled ? 'off' : ''}>
                      <td><b>{u.name}</b>{self && <span className="chip"> you</span>}<small>{u.email}</small></td>
                      <td>
                        <select value={u.role} disabled={self} onChange={(e) => act(() => api(`admin/users/${u.id}`, { role: e.target.value }, 'PATCH'), 'Role updated')()}>
                          <option value="member">Member</option><option value="admin">Administrator</option>
                        </select>
                      </td>
                      <td>{u.groups.map((g) => <span key={g.id} className="chip">{g.name}</span>)}</td>
                      <td>{u.disabled ? 'Disabled' : u.mustChangePassword ? 'Must change password' : 'Active'}</td>
                      <td className="actions">
                        <button disabled={self} onClick={act(() => api(`admin/users/${u.id}`, { disabled: !u.disabled }, 'PATCH'), u.disabled ? 'User enabled' : 'User disabled')}>{u.disabled ? 'Enable' : 'Disable'}</button>
                        <button onClick={() => resetPassword(u)}>Reset password</button>
                        <button onClick={act(async () => { const r = await api(`admin/users/${u.id}/sessions`, undefined, 'DELETE'); notify('ok', `${r.ended} session(s) ended`); })} aria-label={`Sign ${u.email} out everywhere`}>Sign out</button>
                        <button disabled={self} onClick={() => removeUser(u)}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>)}

          {ready && tab === 'users' && closed.length > 0 && (<>
            <h4>Diagrams of closed accounts</h4>
            <small className="hint">The person closed their account. Their diagrams have no links or shared access; hand each one to a person (and optionally give a group edit access) before the date shown, or it is deleted.</small>
            <div className="admin-grid">{closed.map((d) => <ClosedRow key={d.id} d={d} me={me} users={users} groups={groups} act={act} />)}</div>
          </>)}

          {ready && tab === 'groups' && (<>
            <form className="admin-form group-form" onSubmit={submitGroup} autoComplete="off">
              <input name="group" placeholder="New group name" autoComplete="off" />
              <button type="submit" className="primary">Create group</button>
            </form>
            <small className="hint">Groups are flat and a person can be in several. Share a diagram with a group from the diagram's Share tab.</small>
            {groups.length === 0 && <Empty title="No groups yet">Type a name above and press Create group. People in a group can be given access to a diagram in one step.</Empty>}
            <div className="admin-grid">
            {groups.map((g) => (
              <div key={g.id} className="group-card">
                <div className="group-head">
                  <b>{g.name}</b><span className="chip">{g.members.length} member{g.members.length === 1 ? '' : 's'}</span>
                  <span className="grow" />
                  <button onClick={() => { const n = window.prompt('Rename group', g.name); if (n && n.trim() && n !== g.name) act(() => api(`admin/groups/${g.id}`, { name: n }, 'PATCH'), 'Group renamed')(); }}>Rename</button>
                  <button onClick={() => { if (window.confirm(`Delete group "${g.name}"? Diagrams shared with it stop being visible to its members.`)) act(() => api(`admin/groups/${g.id}`, undefined, 'DELETE'), 'Group deleted')(); }}>Delete</button>
                </div>
                <div className="group-members">
                  {g.members.map((m) => <span key={m.id} className="chip member">{m.name}<a title={`Remove ${m.email}`} onClick={act(() => api(`admin/groups/${g.id}/members/${m.id}`, undefined, 'DELETE'))}>✕</a></span>)}
                  <select value="" onChange={(e) => e.target.value && act(() => api(`admin/groups/${g.id}/members/${e.target.value}`, {}, 'PUT'), 'Member added')()}>
                    <option value="">+ add member…</option>
                    {notInGroup(g).map((u) => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}
                  </select>
                </div>
              </div>
            ))}
            </div>
          </>)}

          {ready && tab === 'connections' && <AdminConnections users={users} groups={groups} act={act} setErr={setErr} />}
          {ready && tab === 'audit' && <AdminAudit kind="changes" setErr={setErr} />}
          {ready && tab === 'access' && <AdminAudit kind="access" setErr={setErr} />}

          {ready && tab === 'settings' && settings && (
            <div className="admin-settings">
              <div className="group-card">
                <h4>Organisation</h4>
                <label>Organisation name<input value={settings.orgName} onChange={(e) => setSettings({ ...settings, orgName: e.target.value })} placeholder="Shown on the sign-in screen and the top bar" /></label>
              </div>
              <div className="group-card">
                <h4>Sign-up</h4>
                <label className="chk">
                  <input type="checkbox" checked={settings.allowSignup} disabled={settings.signupForcedBy !== null} onChange={(e) => setSettings({ ...settings, allowSignup: e.target.checked })} />
                  Let people create their own account (as members)
                </label>
                {settings.signupForcedBy !== null && <small className="hint">Forced by the server environment (<code>ALLOW_SIGNUP={settings.signupForcedBy}</code>).</small>}
                <small className="hint">Keep this off to make the instance invitation-only: administrators create every account.</small>
              </div>
              <div className="group-card">
                <h4>Sessions</h4>
                <label>Session length (days)<input type="number" min="1" max="90" value={settings.sessionDays} onChange={(e) => setSettings({ ...settings, sessionDays: e.target.value })} /></label>
                <label>Sign out after days without use (0 = never)<input type="number" min="0" max="90" value={settings.sessionIdleDays} onChange={(e) => setSettings({ ...settings, sessionIdleDays: e.target.value })} /></label>
                <small className="hint">The session length applies to new sign-ins; the inactivity limit applies to every session at once.</small>
              </div>
              <button className="primary" onClick={act(async () => { const s = await api('admin/settings', { orgName: settings.orgName, allowSignup: settings.allowSignup, sessionDays: +settings.sessionDays, sessionIdleDays: +settings.sessionIdleDays }, 'PUT'); onSettings(s.orgName); }, 'Settings saved')}>Save settings</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ClosedRow({ d, me, users, groups, act }) {
  const [to, setTo] = useState(me.id), [group, setGroup] = useState('');
  const days = Math.max(0, Math.ceil((d.deletesAt * 1000 - Date.now()) / 86400000));
  return (
    <div className="group-card">
      <div className="group-head"><b>{d.title}</b><small className="hint">from {d.formerOwner} · deleted in {days} day{days === 1 ? '' : 's'}</small></div>
      <div className="group-members">
        <select value={to} onChange={(e) => setTo(+e.target.value)} aria-label={`Give ${d.title} to`}>{users.filter((u) => !u.disabled).map((u) => <option key={u.id} value={u.id}>{u.id === me.id ? 'Me' : `${u.name} — ${u.email}`}</option>)}</select>
        <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label={`Group that can edit ${d.title}`}><option value="">No group</option>{groups.map((g) => <option key={g.id} value={g.id}>Group: {g.name} can edit</option>)}</select>
        <button className="primary" onClick={act(() => api(`admin/closed-diagrams/${d.id}/adopt`, { userId: to, ...(group ? { groupId: +group } : {}) }), 'Diagram handed over')}>Hand over</button>
        <button onClick={() => { if (window.confirm(`Delete "${d.title}" now? This cannot be undone.`)) act(() => api(`admin/closed-diagrams/${d.id}`, undefined, 'DELETE'), 'Diagram deleted')(); }}>Delete now</button>
      </div>
    </div>
  );
}
