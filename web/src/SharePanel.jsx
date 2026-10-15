import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errMsg, copyText } from './api.js';

const LEVELS = [
  ['view', 'Can view', 'Can see the diagram, the docs and the comments.'],
  ['comment', 'Can comment', 'Like view, and can add comments.'],
  ['edit', 'Can edit', 'Like comment, and can change the DBML and the layout. Never your connections or credentials.'],
];
const hintOf = (a) => LEVELS.find((l) => l[0] === a)?.[2];
const Levels = ({ value, onChange }) => <select value={value} onChange={(e) => onChange(e.target.value)}>{LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;

// "Share" tab (owner only): people and groups of this installation, plus optional links
export default function SharePanel({ diagramId, notify }) {
  const [grants, setGrants] = useState([]);
  const [links, setLinks] = useState([]);
  const [groups, setGroups] = useState([]);
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [who, setWho] = useState('user');
  const [level, setLevel] = useState('view');
  const [linkLevel, setLinkLevel] = useState('view');
  const [linkPw, setLinkPw] = useState('');
  const timer = useRef(null);

  const load = useCallback(() => Promise.all([api(`diagrams/${diagramId}/access`), api(`diagrams/${diagramId}/shares`), api('directory/groups')])
    .then(([a, s, g]) => { setGrants(a); setLinks(s); setGroups(g); }).catch((e) => notify('err', errMsg(e))), [diagramId, notify]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    clearTimeout(timer.current);
    if (who !== 'user' || q.trim().length < 2) { setFound([]); return undefined; }
    timer.current = setTimeout(() => api(`directory/users?q=${encodeURIComponent(q.trim())}`).then(setFound).catch(() => setFound([])), 250);
    return () => clearTimeout(timer.current);
  }, [q, who]);

  const act = (fn, ok) => async () => { try { await fn(); await load(); if (ok) notify('ok', ok); } catch (e) { notify('err', errMsg(e)); } };
  const grant = (type, subjectId) => act(async () => { await api(`diagrams/${diagramId}/access`, { type, subjectId, access: level }); setQ(''); setFound([]); }, 'Access granted')();
  const url = (t) => `${location.origin}/s/${t}`;
  const copy = (t) => copyText(url(t), 'Link copied', notify);
  const granted = (type, id) => grants.some((g) => g.type === type && g.subjectId === id);

  return (
    <div className="dbody">
      <h4>People and groups</h4>
      <div className="seg">
        {[['user', 'Person'], ['group', 'Group']].map(([v, l]) => <button key={v} className={who === v ? 'on' : ''} onClick={() => { setWho(v); setQ(''); }}>{l}</button>)}
      </div>
      <div className="row">
        {who === 'user'
          ? <input placeholder="Search by name or e-mail…" value={q} onChange={(e) => setQ(e.target.value)} />
          : <select value="" onChange={(e) => e.target.value && grant('group', Number(e.target.value))}>
            <option value="">{groups.length ? 'Choose a group…' : 'No groups yet (ask an administrator)'}</option>
            {groups.filter((g) => !granted('group', g.id)).map((g) => <option key={g.id} value={g.id}>{g.name} ({g.members})</option>)}
          </select>}
        <Levels value={level} onChange={setLevel} />
      </div>
      {found.map((u) => (
        <div key={u.id} className="card" onClick={() => !granted('user', u.id) && grant('user', u.id)}>
          <div className="grow"><b>{u.name}</b><small>{u.email}</small></div>
          <small>{granted('user', u.id) ? 'already has access' : '+ add'}</small>
        </div>
      ))}
      {who === 'user' && q.trim().length >= 2 && found.length === 0 && <small className="hint">Nobody found.</small>}
      <small className="hint">{hintOf(level)}</small>

      {grants.length > 0 && <h4>Who has access</h4>}
      {grants.map((g) => (
        <div key={g.id} className="share">
          <div className="row">
            <div className="grow"><b>{g.name}</b><small className="hint"> {g.type === 'group' ? `group · ${g.members} member${g.members === 1 ? '' : 's'}` : g.email}</small></div>
          </div>
          <div className="row">
            <Levels value={g.access} onChange={(v) => act(() => api(`access/${g.id}`, { access: v }, 'PATCH'), 'Permission updated')()} />
            <button onClick={act(() => api(`access/${g.id}`, undefined, 'DELETE'), 'Access removed')}>Remove</button>
          </div>
        </div>
      ))}

      <h4>Links (optional)</h4>
      <small className="hint">Anyone with a link can open the diagram; comment/edit links ask people to sign in first. Revoke a link at any time.</small>
      <div className="row">
        <Levels value={linkLevel} onChange={setLinkLevel} />
        <button className="primary" onClick={act(async () => { await api(`diagrams/${diagramId}/shares`, { access: linkLevel, ...(linkPw ? { password: linkPw } : {}) }); setLinkPw(''); }, 'Link created')}>Create link</button>
      </div>
      <input type="password" autoComplete="new-password" placeholder="Password for the new link (optional, 6+ characters)" value={linkPw} onChange={(e) => setLinkPw(e.target.value)} />
      {links.map((s) => (
        <div key={s.id} className="share">
          <div className="row"><input readOnly value={url(s.token)} onFocus={(e) => e.target.select()} /><button onClick={() => copy(s.token)}>Copy</button></div>
          <div className="row">
            <Levels value={s.access} onChange={(v) => act(() => api(`shares/${s.id}`, { access: v }, 'PATCH'), 'Permission updated')()} />
            <button onClick={() => { const p = window.prompt(s.hasPassword ? 'New password for this link (6+ characters). Leave empty to remove the password.' : 'Password for this link (6+ characters):', ''); if (p === null) return; act(() => api(`shares/${s.id}`, { password: p }, 'PATCH'), p ? 'Password set' : 'Password removed')(); }}>{s.hasPassword ? '🔒 Change password' : 'Add password'}</button>
            <button onClick={() => { if (window.confirm('Revoke this link? Anyone using it will lose access.')) act(() => api(`shares/${s.id}`, undefined, 'DELETE'), 'Link revoked')(); }}>Revoke</button>
          </div>
        </div>
      ))}
      <small className="hint">Database connections and credentials are never shared.</small>
    </div>
  );
}
