// SQLite (node:sqlite, built in: no native dependency) in DATA_DIR/app.db
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';

export const DIR = process.env.DATA_DIR || './data';
mkdirSync(DIR, { recursive: true });

export const db = new DatabaseSync(`${DIR}/app.db`);
db.exec(`
pragma journal_mode = wal;
pragma foreign_keys = on;

create table if not exists users (
  id integer primary key,
  email text unique not null,
  name text not null,
  password_hash text not null,
  created_at integer not null
);
create table if not exists sessions (
  token_hash text primary key,
  user_id integer not null references users(id) on delete cascade,
  expires_at integer not null
);
create table if not exists connections (
  id text primary key,
  owner_id integer not null references users(id) on delete cascade,
  name text, type text, host text, port integer, database text, db_user text,
  tls text, server_dn text, block_writable integer, schemas text, tables text, refresh_minutes integer,
  password text, ca_pem text, wallet_password text
);
create table if not exists diagrams (
  id text primary key,
  owner_id integer not null references users(id) on delete cascade,
  title text not null, dbml text not null, source text, layout text,
  created_at integer not null, updated_at integer not null
);
create table if not exists shares (
  id text primary key,
  diagram_id text not null references diagrams(id) on delete cascade,
  token text unique not null,
  access text not null check (access in ('view','comment','edit')),
  created_at integer not null
);
create table if not exists comments (
  id text primary key,
  diagram_id text not null references diagrams(id) on delete cascade,
  key text not null,
  user_id integer references users(id) on delete set null,
  author text not null,
  text text not null,
  created_at integer not null
);
create table if not exists settings (key text primary key, value text not null);
create table if not exists groups (
  id integer primary key,
  name text unique not null collate nocase,
  created_at integer not null
);
create table if not exists group_members (
  group_id integer not null references groups(id) on delete cascade,
  user_id integer not null references users(id) on delete cascade,
  primary key (group_id, user_id)
);
-- who besides the owner may open a diagram (a user or a whole group) and with which level
create table if not exists diagram_access (
  id integer primary key,
  diagram_id text not null references diagrams(id) on delete cascade,
  subject_type text not null check (subject_type in ('user','group')),
  subject_id integer not null,
  access text not null check (access in ('view','comment','edit')),
  created_at integer not null,
  unique (diagram_id, subject_type, subject_id)
);
create index if not exists idx_access_subject on diagram_access(subject_type, subject_id);
create index if not exists idx_members_user on group_members(user_id);
create index if not exists idx_comments_diagram on comments(diagram_id);
create index if not exists idx_diagrams_owner on diagrams(owner_id);
create index if not exists idx_connections_owner on connections(owner_id);
`);

// columns added after the first release (create table above only runs on a fresh database)
const userCols = db.prepare('pragma table_info(users)').all().map((c) => c.name);
for (const [name, ddl] of [['role', "text not null default 'member'"], ['disabled', 'integer not null default 0'], ['must_change_password', 'integer not null default 0']]) {
  if (!userCols.includes(name)) db.exec(`alter table users add column ${name} ${ddl}`);
}
// the oldest account is the administrator when nobody is (databases created before roles existed)
db.exec("update users set role = 'admin' where id = (select min(id) from users) and not exists (select 1 from users where role = 'admin')");
