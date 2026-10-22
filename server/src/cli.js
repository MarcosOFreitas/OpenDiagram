// Operator tool (also the way back in if every administrator is locked out):
//   docker compose exec app node src/cli.js create-admin <email> <password> [name]
//   docker compose exec app node src/cli.js reset-password <email> <new-password>
//   docker compose exec app node src/cli.js list-users
//   docker compose exec app node src/cli.js backup [file]          a consistent copy while the app runs (default /data/backup-<date>-<time>.db)
//   docker compose stop app && docker compose run --rm app node src/cli.js restore <file> [--force] && docker compose start app
import { copyFileSync, existsSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const [cmd, a, b, c] = process.argv.slice(2);
const fail = (m) => { console.error(m); process.exit(1); };
const ALIVE = 90; // seconds: the server marks the database every 30 s while it runs (index.js)

// restore replaces app.db, so it must not open it through db.js (which keeps it open and migrates it)
if (cmd === 'restore') {
  if (!a) fail('usage: restore <file> [--force]   (stop the app first)');
  const target = join(process.env.DATA_DIR || './data', 'app.db');
  let valid = false;
  try {
    const src = new DatabaseSync(a, { readOnly: true });
    valid = src.prepare('pragma integrity_check').get()?.integrity_check === 'ok' && !!src.prepare("select 1 from sqlite_master where type = 'table' and name = 'users'").get();
    src.close();
  } catch { /* not SQLite */ }
  if (!valid) fail(`${a} is not an OpenDiagram database (or it is damaged); nothing was changed`);
  if (existsSync(target) && b !== '--force') {
    const cur = new DatabaseSync(target, { readOnly: true });
    let at = 0;
    try { at = +cur.prepare("select value from settings where key = 'server_alive'").get()?.value || 0; } catch { /* older database */ }
    cur.close();
    if (at > Date.now() / 1000 - ALIVE) fail('the server is running on this database: stop it first (docker compose stop app), or add --force if it is not');
  }
  copyFileSync(a, target + '.restore');
  for (const f of [target, target + '-wal', target + '-shm']) rmSync(f, { force: true });
  renameSync(target + '.restore', target);
  const d = new DatabaseSync(target);
  d.prepare("delete from settings where key = 'server_alive'").run(); // the copy carries the mark of the server it was taken from
  d.close();
  console.log(`restored ${a}; start the app again (it runs any pending migration on start)`);
  process.exit(0);
}

const { db, DIR } = await import('./db.js');
const auth = await import('./auth.js');
const find = (email) => db.prepare('select id, email, role from users where email = ?').get(String(email ?? '').trim().toLowerCase());

try {
  if (cmd === 'create-admin') {
    if (!a || !b) fail('usage: create-admin <email> <password> [name]');
    const existing = find(a);
    if (existing) { db.prepare("update users set role = 'admin', disabled = 0 where id = ?").run(existing.id); await auth.adminSetPassword(existing.id, b); db.prepare('update users set must_change_password = 0 where id = ?').run(existing.id); console.log(`${a} is now an active administrator (password updated)`); }
    else { const u = await auth.createUser({ email: a, password: b, name: c, role: 'admin' }); console.log(`created administrator ${u.email}`); }
  } else if (cmd === 'reset-password') {
    if (!a || !b) fail('usage: reset-password <email> <new-password>');
    const u = find(a);
    if (!u) fail('no such user');
    await auth.adminSetPassword(u.id, b);
    console.log(`password updated for ${u.email}; they must change it at next sign-in`);
  } else if (cmd === 'list-users') {
    for (const u of db.prepare('select email, name, role, disabled from users order by id').all()) console.log(`${u.role.padEnd(7)} ${u.disabled ? 'disabled' : 'active  '} ${u.email} (${u.name})`);
  } else if (cmd === 'backup') {
    const file = a || join(DIR, `backup-${new Date().toISOString().replace(/\D/g, '').slice(0, 14).replace(/^(\d{8})/, '$1-')}.db`);
    if (existsSync(file)) fail(`${file} exists: choose another name`);
    db.prepare('vacuum into ?').run(file);
    console.log(`backup written to ${file}`);
  } else fail('commands: create-admin | reset-password | list-users | backup | restore');
} catch (e) { fail(e.message); }
