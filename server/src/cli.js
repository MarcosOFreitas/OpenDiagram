// Operator tool (also the way back in if every administrator is locked out):
//   docker compose exec app node src/cli.js create-admin <email> <password> [name]
//   docker compose exec app node src/cli.js reset-password <email> <new-password>
//   docker compose exec app node src/cli.js list-users
import { db } from './db.js';
import * as auth from './auth.js';

const [cmd, a, b, c] = process.argv.slice(2);
const fail = (m) => { console.error(m); process.exit(1); };
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
  } else fail('commands: create-admin | reset-password | list-users');
} catch (e) { fail(e.message); }
