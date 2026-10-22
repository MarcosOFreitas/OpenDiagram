import { useState } from 'react';
import { ago } from './api.js';
import { Ic } from './Icons.jsx';

const ROLE = { view: 'can view', comment: 'can comment', edit: 'can edit', admin: 'administrator' };
const SEARCH_FROM = 8; // the search box appears once the list is longer than this

// which diagrams to list and in which order: q matches the title or the owner's name; sort 'recent' (default) or 'name'; linked = only the ones linked to a database
export function pickDiagrams(list, { q = '', sort = 'recent', linked = false } = {}) {
  const t = q.trim().toLowerCase();
  const out = list.filter((d) => (!t || d.title.toLowerCase().includes(t) || (d.ownerName || '').toLowerCase().includes(t)) && (!linked || d.linked));
  return out.sort(sort === 'name' ? (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) : (a, b) => b.updatedAt - a.updatedAt);
}

// the card's real control: a button stretched over the whole card (`.card-open`), so the card opens with a click, Tab + Enter or Space
const Open = ({ current, onClick, children }) => (
  <button type="button" className="card-open grow" aria-current={current ? 'true' : undefined} onClick={onClick}>{children}</button>
);
const Text = ({ title, children }) => <span className="grow"><b title={title}>{title}</b>{children}</span>;

// deleting asks in the card itself; Cancel takes the focus, so Enter right after the click does nothing harmful
function Trash({ d, title = 'Delete diagram', asking, onAsk, onDelete }) {
  if (!asking) return <button type="button" className="ghost" aria-label={`Delete ${d.title}`} title={title} onClick={() => onAsk(d.id)}><Ic n="trash" /></button>;
  return (
    <span className="card-ask" role="group" aria-label={`Delete ${d.title}?`}>
      <button type="button" className="danger" aria-label={`Yes, delete ${d.title}`} onClick={() => { onAsk(null); onDelete(d); }}>Delete</button>
      <button type="button" autoFocus onClick={() => onAsk(null)}>Cancel</button>
    </span>
  );
}

// a new diagram: blank or from a template; in the Diagrams tab and on the screen of an account without diagrams
export const CreateOptions = ({ templates = [], onCreate }) => (<>
  <button className="primary" onClick={() => onCreate()}>+ New blank diagram</button>
  {templates.length > 0 && <h4>Start from a template</h4>}
  {templates.map((t) => (
    <div key={t.id} className="card act">
      <Open onClick={() => onCreate(t.id)}><Text title={t.name}><small>{t.description}</small></Text><small>+ create</small></Open>
    </div>
  ))}
</>);

// "Diagrams" tab: my diagrams (autosave) and the ones other people shared with me (directly or through a group)
export default function Library({ diagrams, currentId, isAdmin, templates = [], onOpen, onCreate, onDelete }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('recent');
  const [linked, setLinked] = useState(false);
  const [asking, setAsking] = useState(null);
  const tools = diagrams.length > SEARCH_FROM;
  const shown = pickDiagrams(diagrams, { q, sort, linked });
  const mine = shown.filter((d) => d.role === 'owner');
  const shared = shown.filter((d) => d.role !== 'owner');
  const now = (d) => d.id === currentId;
  const trash = (d, title) => <Trash d={d} title={title} asking={asking === d.id} onAsk={setAsking} onDelete={onDelete} />;
  return (
    <div className="dbody">
      <CreateOptions templates={templates} onCreate={onCreate} />
      {tools && (
        <div className="lib-tools">
          <input type="search" placeholder="Search by name or owner" aria-label="Search diagrams" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort diagrams">
            <option value="recent">Last changed</option><option value="name">Name</option>
          </select>
          {diagrams.some((d) => d.linked) && <label className="chk"><input type="checkbox" checked={linked} onChange={(e) => setLinked(e.target.checked)} /> Only diagrams linked to a database</label>}
        </div>
      )}
      <h4>My diagrams</h4>
      {mine.length === 0 && <small className="hint">{q || linked ? 'No diagram matches.' : 'No diagrams yet.'}</small>}
      {mine.map((d) => (
        <div key={d.id} className={`card act ${now(d) ? 'sel' : ''}`}>
          <Open current={now(d)} onClick={() => onOpen(d.id)}><Text title={d.title}><small>{now(d) ? 'Open now · ' : ''}{ago(d.updatedAt * 1000)}{d.shares ? ` · shared with ${d.shares}` : ''}{d.linked ? ' · linked to a database' : ''}</small></Text></Open>
          {trash(d)}
        </div>
      ))}
      {shared.length > 0 && <h4>{isAdmin ? 'Everyone else\'s diagrams (administrator)' : 'Shared with me'}</h4>}
      {shared.map((d) => (
        <div key={d.id} className={`card act ${now(d) ? 'sel' : ''}`}>
          <Open current={now(d)} onClick={() => onOpen(d.id)}><Text title={d.title}><small>{now(d) ? 'Open now · ' : ''}{d.ownerName} · {ROLE[d.role]} · {ago(d.updatedAt * 1000)}</small></Text></Open>
          {d.role === 'admin' && trash(d, 'Delete diagram (administrator)')}
        </div>
      ))}
      <small className="hint">Changes are saved automatically. Deleting a diagram also removes its share links and comments.</small>
    </div>
  );
}
