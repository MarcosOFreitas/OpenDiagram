// SQLite (node:sqlite, built in: no native dependency) in DATA_DIR/app.db
import { DatabaseSync } from 'node:sqlite';
import { accessSync, constants, mkdirSync } from 'node:fs';

export const DIR = process.env.DATA_DIR || './data';
mkdirSync(DIR, { recursive: true });
// the image runs as the unprivileged user `node`; a volume created by an older image (which ran as root) is not writable until it is handed over
try { accessSync(DIR, constants.W_OK); } catch {
  throw new Error(`${DIR} is not writable by this process (uid ${process.getuid?.()}). A data volume from an older image belongs to root: run once
  docker compose run --rm --user root --entrypoint chown app -R node:node /data`);
}

export const db = new DatabaseSync(`${DIR}/app.db`);
db.exec(`
pragma journal_mode = wal;
pragma foreign_keys = on;

create table if not exists users (
  id integer primary key,
  email text unique not null,
  name text not null,
  password_hash text not null,
  created_at integer not null,
  role text not null default 'member',
  disabled integer not null default 0,
  must_change_password integer not null default 0,
  kind text not null default 'human', -- 'agent' = an AI client's account (agents.js): no password, never an administrator
  recovery_hash text, recovery_at integer, -- sha-256 of the recovery key the person keeps (shown once); a use consumes it
  deleted_at integer -- the person closed the account: signed out for good, their diagrams wait here for an administrator (7 days) and are then deleted
);
create table if not exists sessions (
  token_hash text primary key,
  user_id integer not null references users(id) on delete cascade,
  expires_at integer not null,
  created_at integer, last_seen integer, ip text, agent text -- shown in Account -> Sessions
);
-- failed-attempt limiter (sign-in, sign-up, link passwords): survives a restart; the key is a hash, never an e-mail or an address
create table if not exists throttle (k text primary key, n integer not null, until integer not null);
create table if not exists connections (
  id text primary key,
  owner_id integer not null references users(id) on delete cascade,
  name text, type text, host text, port integer, database text, db_user text,
  tls text, server_dn text, block_writable integer, schemas text, tables text, refresh_minutes integer,
  password text, ca_pem text,
  shared integer not null default 0 -- 1 = registered by an administrator for people and groups
);
-- shared connections (registered by an administrator): who may use them. A diagram never carries the secret, only the connection id.
create table if not exists connection_access (
  connection_id text not null references connections(id) on delete cascade,
  subject_type text not null check (subject_type in ('user', 'group')),
  subject_id integer not null,
  primary key (connection_id, subject_type, subject_id)
);
-- bearer tokens of agents (agents.js): only the SHA-256 is kept
create table if not exists api_tokens (
  id text primary key,
  user_id integer not null references users(id) on delete cascade,
  name text not null, hash text unique not null,
  created_at integer not null, last_used integer, expires_at integer, revoked_at integer
);
-- use of shared connections and administrator actions (see audit.js)
create table if not exists audit_log (
  id integer primary key autoincrement,
  at integer not null,
  actor_id integer, actor_name text,
  action text not null,
  target text, connection_id text, diagram_id text,
  ok integer not null default 1,
  detail text
);
create index if not exists audit_log_at on audit_log (at);
create table if not exists diagrams (
  id text primary key,
  owner_id integer not null references users(id) on delete cascade,
  title text not null, dbml text not null, source text, layout text,
  created_at integer not null, updated_at integer not null,
  version integer not null default 1 -- +1 on every content save: edit-conflict detection and history
);
-- scheduled refresh of a linked diagram (see refresh.js): last run, last error, and the failures in a row (5 pause it until a manual refresh works)
create table if not exists refresh_state (
  diagram_id text primary key references diagrams(id) on delete cascade,
  last_run integer, last_error text, failures integer not null default 0, paused integer not null default 0
);
create table if not exists shares (
  id text primary key,
  diagram_id text not null references diagrams(id) on delete cascade,
  token text unique not null,
  access text not null check (access in ('view','comment','edit')),
  created_at integer not null,
  password_hash text, -- optional link password (scrypt)
  expires_at integer -- null = never; an expired link answers as if it did not exist
);
create table if not exists diagram_versions (
  id integer primary key autoincrement,
  diagram_id text not null references diagrams(id) on delete cascade,
  version integer not null,
  title text not null, dbml text not null, layout text,
  label text,
  author_id integer references users(id) on delete set null,
  author text,
  summary text not null default '',
  created_at integer not null, saved_at integer not null
);
create index if not exists diagram_versions_by_diagram on diagram_versions (diagram_id, version);
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

// columns added after the first release: an existing database gets them here (create table above only runs on a new one)
const addColumn = (table, col, ddl) => { if (!db.prepare(`pragma table_info(${table})`).all().some((c) => c.name === col)) db.exec(`alter table ${table} add column ${col} ${ddl}`); };
for (const c of ['created_at integer', 'last_seen integer', 'ip text', 'agent text']) addColumn('sessions', c.split(' ')[0], c.split(' ')[1]);
addColumn('shares', 'expires_at', 'integer');
addColumn('users', 'deleted_at', 'integer');
addColumn('users', 'recovery_hash', 'text');
addColumn('users', 'kind', "text not null default 'human'");
addColumn('users', 'recovery_at', 'integer');
