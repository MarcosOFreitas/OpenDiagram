// Audit log (administrators read it): use of shared database connections and administrator actions. Never contains secrets or request bodies:
// only who, what, which connection / diagram, whether it worked and a short detail (counts, schema names, an error message).
import { db } from './db.js';

const RETENTION = 180 * 86400; // seconds
const now = () => Math.floor(Date.now() / 1000);

export function log(actor, action, { target, connectionId, diagramId, ok = true, detail } = {}) {
  try {
    db.prepare('insert into audit_log (at, actor_id, actor_name, action, target, connection_id, diagram_id, ok, detail) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(now(), actor?.id ?? null, actor ? actor.name || actor.email : null, action, target ?? null, connectionId ?? null, diagramId ?? null, ok ? 1 : 0, detail ? String(detail).slice(0, 300) : null);
  } catch { /* the log never blocks the action it describes */ }
}

// newest first; filters: action prefix, free text over actor / target / detail, since / until (unix seconds), before = id for paging
export function list({ limit = 100, before, action, q, since, until } = {}) {
  const where = [], args = [];
  if (before) { where.push('id < ?'); args.push(+before); }
  if (action) { where.push('action like ?'); args.push(`${String(action).replace(/[%_]/g, '')}%`); }
  if (q) { where.push("(actor_name like ? or target like ? or detail like ? or diagram_id like ?)"); const l = `%${String(q).replace(/[%_]/g, '')}%`; args.push(l, l, l, l); }
  if (since) { where.push('at >= ?'); args.push(+since); }
  if (until) { where.push('at <= ?'); args.push(+until); }
  const rows = db.prepare(`select * from audit_log ${where.length ? `where ${where.join(' and ')}` : ''} order by id desc limit ?`).all(...args, Math.min(Math.max(+limit || 100, 1), 5000));
  return rows.map((r) => ({ id: r.id, at: r.at, actor: r.actor_name, actorId: r.actor_id, action: r.action, target: r.target, connectionId: r.connection_id, diagramId: r.diagram_id, ok: !!r.ok, detail: r.detail }));
}

// spreadsheet-safe CSV (a cell that starts with = + - @ is prefixed so it cannot run as a formula)
export function csv(rows) {
  const cell = (v) => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"', '""')}"`; };
  const head = ['time (UTC)', 'actor', 'action', 'target', 'diagram', 'ok', 'detail'];
  return [head.join(','), ...rows.map((r) => [new Date(r.at * 1000).toISOString(), r.actor, r.action, r.target, r.diagramId, r.ok ? 'yes' : 'no', r.detail].map(cell).join(','))].join('\n') + '\n';
}

export const purge = () => db.prepare('delete from audit_log where at < ?').run(now() - RETENTION).changes;
