import { ago } from './api.js';
import { Ic } from './Icons.jsx';

const ROLE = { view: 'can view', comment: 'can comment', edit: 'can edit', admin: 'administrator' };

// the card's real control: a button stretched over the whole card (`.card-open`), so the card opens with a click, Tab + Enter or Space
const Open = ({ current, onClick, children }) => (
  <button type="button" className="card-open grow" aria-current={current ? 'true' : undefined} onClick={onClick}>{children}</button>
);
const Text = ({ children }) => <span className="grow">{children}</span>;
const Trash = ({ d, title = 'Delete diagram', onDelete }) => (
  <button type="button" className="ghost" aria-label={`Delete ${d.title}`} title={title} onClick={() => onDelete(d)}><Ic n="trash" /></button>
);

// "Diagrams" tab: my diagrams (autosave) and the ones other people shared with me (directly or through a group)
export default function Library({ diagrams, currentId, isAdmin, templates = [], onOpen, onCreate, onDelete }) {
  const mine = diagrams.filter((d) => d.role === 'owner');
  const shared = diagrams.filter((d) => d.role !== 'owner');
  const now = (d) => d.id === currentId;
  return (
    <div className="dbody">
      <button className="primary" onClick={() => onCreate()}>+ New blank diagram</button>
      {templates.length > 0 && <h4>Start from a template</h4>}
      {templates.map((t) => (
        <div key={t.id} className="card act">
          <Open onClick={() => onCreate(t.id)}><Text><b>{t.name}</b><small>{t.description}</small></Text><small>+ create</small></Open>
        </div>
      ))}
      <h4>My diagrams</h4>
      {mine.length === 0 && <small className="hint">No diagrams yet.</small>}
      {mine.map((d) => (
        <div key={d.id} className={`card act ${now(d) ? 'sel' : ''}`}>
          <Open current={now(d)} onClick={() => onOpen(d.id)}><Text><b>{d.title}</b><small>{now(d) ? 'Open now · ' : ''}{ago(d.updatedAt * 1000)}{d.shares ? ` · shared with ${d.shares}` : ''}</small></Text></Open>
          <Trash d={d} onDelete={onDelete} />
        </div>
      ))}
      {shared.length > 0 && <h4>{isAdmin ? 'Everyone else\'s diagrams (administrator)' : 'Shared with me'}</h4>}
      {shared.map((d) => (
        <div key={d.id} className={`card act ${now(d) ? 'sel' : ''}`}>
          <Open current={now(d)} onClick={() => onOpen(d.id)}><Text><b>{d.title}</b><small>{now(d) ? 'Open now · ' : ''}{d.ownerName} · {ROLE[d.role]} · {ago(d.updatedAt * 1000)}</small></Text></Open>
          {d.role === 'admin' && <Trash d={d} title="Delete diagram (administrator)" onDelete={onDelete} />}
        </div>
      ))}
      <small className="hint">Changes are saved automatically. Deleting a diagram also removes its share links and comments.</small>
    </div>
  );
}
