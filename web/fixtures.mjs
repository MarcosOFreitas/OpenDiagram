// Shared by the UI tools (uiaudit.mjs, docshots.mjs): an API client with a cookie jar, and the accounts and diagrams they need
// on a THROW-AWAY instance (it creates users, a group, a shared connection and diagrams).
import { sleep } from './cdp.mjs';

export class Api {
  cookie = '';
  constructor(base) { this.base = base; }
  async call(method, path, body) {
    const r = await fetch(this.base + path, { method, headers: { 'content-type': 'application/json', origin: this.base, ...(this.cookie ? { cookie: this.cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = r.headers.get('set-cookie'); if (set) this.cookie = set.split(';')[0];
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${j.error || ''}`);
    return j;
  }
}

const DEMO_DB = { host: 'demo-pg', port: 5432, database: 'demo', user: 'reader', password: 'reader' }; // docker compose up -d: reachable from the app container

// `admin` is an Api already signed in as an administrator. Creates Maya (a member who has chosen her own password), the group
// Analytics with her in it, a shared connection to the demo database for that group (she tests and imports through it, so the audit
// log has entries), and two diagrams she can edit: `sample` (+ `sampleExtra`) and the one imported through the shared connection
// (+ `lineageExtra`). `versions` = [[dbml, label], ...] are saved and named on the first diagram.
export async function seedTeam({ base, admin, sample, mayaPass, sampleExtra = '', lineageExtra = '', versions = [] }) {
  const maya = new Api(base);
  await admin.call('POST', '/api/admin/users', { email: 'maya@example.com', name: 'Maya Santos', password: 'Maya-temp-pass-0' });
  const mayaId = (await admin.call('GET', '/api/admin/users')).find((u) => u.email === 'maya@example.com').id;
  await maya.call('POST', '/api/auth/login', { email: 'maya@example.com', password: 'Maya-temp-pass-0' });
  await maya.call('POST', '/api/auth/password', { current: 'Maya-temp-pass-0', next: mayaPass });
  const group = (await admin.call('POST', '/api/admin/groups', { name: 'Analytics' })).id;
  await admin.call('PUT', `/api/admin/groups/${group}/members/${mayaId}`, {});
  const shared = await admin.call('POST', '/api/admin/connections', { type: 'postgres', name: 'Demo shop (read-only)', ...DEMO_DB, tls: 'off' });
  await admin.call('PUT', `/api/admin/connections/${shared.id}/access`, { groups: [group], users: [] });
  await maya.call('POST', '/api/schemas', { id: shared.id });
  const imp = await maya.call('POST', '/api/import', { id: shared.id, schemas: ['shop'] });
  const shop = (await admin.call('POST', '/api/diagrams', { title: 'Online store - sample', dbml: sample + sampleExtra })).id;
  const lin = (await admin.call('POST', '/api/diagrams', { title: 'Shop (PostgreSQL)', dbml: imp.dbml + lineageExtra })).id;
  for (const [dbml, label] of versions) { await admin.call('PUT', `/api/diagrams/${shop}`, { dbml }); await admin.call('POST', `/api/diagrams/${shop}/versions`, { label }); await sleep(1100); } // distinct times
  for (const d of [shop, lin]) await admin.call('POST', `/api/diagrams/${d}/access`, { type: 'user', subjectId: mayaId, access: 'edit' });
  return { maya, mayaId, group, shared, shop, lin };
}
