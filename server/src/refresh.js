// Scheduled refresh: re-reads the metadata of linked diagrams on the server, so it no longer needs an open page.
// Every minute: the diagrams whose connection has an interval (>= 5 min, plus a few seconds of jitter per diagram) that is due, one at a time, as the diagram's OWNER
// (through the same resolve/privilege checks as a manual refresh). The result is saved as a "Refresh from database" history entry authored by "Scheduled refresh".
// A diagram someone is editing is skipped (tried again next minute); 5 failures in a row pause it until a manual refresh works.
import { createHash } from 'node:crypto';
import { db } from './db.js';
import * as dg from './diagrams.js';
import * as audit from './audit.js';
import * as presence from './presence.js';
import { userById } from './auth.js';
import { getForUse } from './store.js';
import { keepGroups, diffSummary } from './merge.js';

export const MIN = 5, MAX_FAILURES = 5;
const ACTOR = { id: null, name: 'Scheduled refresh' };
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
export const genHash = (dbml) => createHash('sha1').update(dbml).digest('hex'); // what the import generated: a refresh that generates the same text changes nothing (manual edits stay)
const jitter = (id) => [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 60, 0); // seconds, spreads diagrams that share an interval

export const stateOf = (diagramId) => { const r = db.prepare('select * from refresh_state where diagram_id = ?').get(diagramId); return r ? { lastRun: r.last_run, lastError: r.last_error, paused: !!r.paused } : null; };
const record = (id, ok, error, now) => {
  const failures = ok ? 0 : (db.prepare('select failures from refresh_state where diagram_id = ?').get(id)?.failures ?? 0) + 1;
  db.prepare(`insert into refresh_state (diagram_id, last_run, last_error, failures, paused) values (?, ?, ?, ?, ?)
    on conflict(diagram_id) do update set last_run = excluded.last_run, last_error = excluded.last_error, failures = excluded.failures, paused = excluded.paused`)
    .run(id, now, ok ? null : String(error).slice(0, 300), failures, failures >= MAX_FAILURES ? 1 : 0);
};
export const clear = (diagramId) => db.prepare('update refresh_state set failures = 0, paused = 0, last_error = null where diagram_id = ?').run(diagramId); // a manual refresh worked

// diagrams linked to a connection with an interval, not paused, whose next run has come
export function due(now = Math.floor(Date.now() / 1000)) {
  return db.prepare(`select d.*, c.refresh_minutes mins, s.last_run from diagrams d join connections c on c.id = json_extract(d.source, '$.connId') join users o on o.id = d.owner_id and o.disabled = 0
    left join refresh_state s on s.diagram_id = d.id where d.source is not null and c.refresh_minutes > 0 and coalesce(s.paused, 0) = 0`).all()
    .filter((d) => now >= Math.max(d.last_run || 0, Math.floor((json(d.source)?.at || 0) / 1000)) + Math.max(MIN, d.mins) * 60 + jitter(d.id));
}

// deps = { resolve(body, user), generate(conn, { schemas, tables, ddl }) }: the same functions as the manual refresh
export async function refreshOne(d, { resolve, generate }, now = Math.floor(Date.now() / 1000)) {
  const src = json(d.source);
  let conn;
  try {
    const owner = userById(d.owner_id);
    if (!owner || db.prepare('select disabled from users where id = ?').get(owner.id).disabled) throw new Error('the owner of the diagram is disabled');
    if (!getForUse(owner, src.connId)) throw new Error('the owner no longer has access to the connection');
    conn = await resolve({ id: src.connId }, owner);
    const r = await generate(conn, { schemas: src.schemas, tables: src.tables, ddl: !!src.ddl });
    const gen = genHash(r.dbml);
    let detail = 'already up to date';
    if (!src.gen) { // linked before the server knew what the last import generated: remember it now, change nothing (manual edits made since the import stay)
      dg.update(d.id, { source: { ...src, at: r.at, gen } }, { includeSource: true, baseVersion: d.version });
      detail = 'baseline';
    } else if (gen !== src.gen) {
      const merged = keepGroups(d.dbml, r.dbml);
      dg.update(d.id, { dbml: merged, source: { ...src, at: r.at, gen } }, { includeSource: true, baseVersion: d.version, actor: ACTOR, separate: true, reason: 'Refresh from database' });
      detail = diffSummary(d.dbml, merged);
    }
    record(d.id, true, null, now);
    if (conn.shared) audit.log(ACTOR, 'connection.refresh', { target: conn.name, connectionId: conn.id, diagramId: d.id, detail: `scheduled: ${detail}` });
  } catch (e) {
    if (e.code === 'conflict') return; // someone saved in the meantime: try again next minute, not a failure
    record(d.id, false, e.message, now);
    if (conn?.shared) audit.log(ACTOR, 'connection.refresh', { target: conn.name, connectionId: conn.id, diagramId: d.id, ok: false, detail: `scheduled: ${e.message}` });
  }
}

let running = false;
export async function tick(deps, now) {
  if (running) return;
  running = true;
  try { for (const d of due(now)) if (!presence.others(d.id, null).some((p) => p.editing)) await refreshOne(d, deps, now); } finally { running = false; }
}
export const start = (deps) => setInterval(() => tick(deps).catch(() => {}), 60_000).unref();
