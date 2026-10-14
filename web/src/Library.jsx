import { ago } from './api.js';

const ROLE = { view: 'can view', comment: 'can comment', edit: 'can edit', admin: 'administrator' };

// "Diagrams" tab: my diagrams (autosave) and the ones other people shared with me (directly or through a group)
export default function Library({ diagrams, currentId, isAdmin, templates = [], onOpen, onCreate, onDelete }) {
  const mine = diagrams.filter((d) => d.role === 'owner');
  const shared = diagrams.filter((d) => d.role !== 'owner');
  return (
    <div className="dbody">
      <button className="primary" onClick={() => onCreate()}>+ New blank diagram</button>
      {templates.length > 0 && <h4>Start from a template</h4>}
      {templates.map((t) => (
        <div key={t.id} className="card" onClick={() => onCreate(t.id)}>
          <div className="grow"><b>{t.name}</b><small>{t.description}</small></div>
          <small>+ create</small>
        </div>
      ))}
      <h4>My diagrams</h4>
      {mine.length === 0 && <small className="hint">No diagrams yet.</small>}
      {mine.map((d) => (
        <div key={d.id} className={`card ${d.id === currentId ? 'sel' : ''}`} onClick={() => onOpen(d.id)}>
          <div className="grow"><b>{d.title}</b><small>{ago(d.updatedAt * 1000)}{d.shares ? ` · shared with ${d.shares}` : ''}</small></div>
          <button className="ghost" title="Delete diagram" onClick={(e) => { e.stopPropagation(); onDelete(d); }}>✕</button>
        </div>
      ))}
      {shared.length > 0 && <h4>{isAdmin ? 'Everyone else\'s diagrams (administrator)' : 'Shared with me'}</h4>}
      {shared.map((d) => (
        <div key={d.id} className={`card ${d.id === currentId ? 'sel' : ''}`} onClick={() => onOpen(d.id)}>
          <div className="grow"><b>{d.title}</b><small>{d.ownerName} · {ROLE[d.role]} · {ago(d.updatedAt * 1000)}</small></div>
          {d.role === 'admin' && <button className="ghost" title="Delete diagram (administrator)" onClick={(e) => { e.stopPropagation(); onDelete(d); }}>✕</button>}
        </div>
      ))}
      <small className="hint">Changes are saved automatically. Deleting a diagram also removes its share links and comments.</small>
    </div>
  );
}
