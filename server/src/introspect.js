import pg from 'pg';
import oracledb from 'oracledb';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ACTION } from './dbml.js';

const key = (s, n) => `${s}.${n}`;

function assemble(tableRows, colRows, pkRows, fkRows, idxRows) {
  const tables = new Map();
  for (const r of tableRows) tables.set(key(r.schema, r.name), { schema: r.schema, name: r.name, comment: r.comment, columns: [], pk: [], indexes: [] });
  for (const r of colRows) tables.get(key(r.schema, r.table))?.columns.push(r.col);
  for (const r of pkRows) tables.get(key(r.schema, r.table))?.pk.push(...r.cols);
  for (const r of idxRows) {
    const t = tables.get(key(r.schema, r.table));
    if (!t) continue;
    const samePk = r.unique && t.pk.length === r.columns.length && r.columns.every((c, i) => c === t.pk[i]);
    if (!samePk) t.indexes.push({ name: r.name, unique: r.unique, type: r.type, columns: r.columns });
  }
  const refs = fkRows.filter((r) => tables.has(key(r.from.schema, r.from.name)) && tables.has(key(r.to.schema, r.to.name)));
  return { tables: [...tables.values()], refs };
}

// ---------- Postgres ----------
// tls: off | verify (validate chain + hostname, optional CA PEM) | noverify (encrypted, certificate not checked)
const pgSsl = (c) => (c.tls === 'verify' ? { rejectUnauthorized: true, ...(c.caPem ? { ca: c.caPem } : {}) } : c.tls === 'noverify' ? { rejectUnauthorized: false } : false);

// guardrail 1: every session is read-only (server-side), whatever privileges the credential has
async function pgWith(c, fn) {
  const cl = new pg.Client({
    host: c.host, port: +c.port || 5432, database: c.database, user: c.user, password: c.password, ssl: pgSsl(c), connectionTimeoutMillis: 8000,
    options: '-c default_transaction_read_only=on -c statement_timeout=30000 -c idle_in_transaction_session_timeout=60000',
  });
  await cl.connect();
  try {
    await cl.query('BEGIN READ ONLY');
    return await fn(cl);
  } finally {
    try { await cl.query('ROLLBACK'); } catch { /* connection already gone */ }
    await cl.end();
  }
}

const pgSchemas = (c) => pgWith(c, async (cl) =>
  (await cl.query(`select nspname from pg_namespace where nspname not like 'pg\\_%' and nspname <> 'information_schema' order by 1`)).rows.map((r) => r.nspname));

const pgImport = (c, schemas) => pgWith(c, async (cl) => {
  const q = async (sql) => (await cl.query(sql, [schemas])).rows;
  const tableRows = await q(`select n.nspname schema, c.relname name, obj_description(c.oid) comment from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname = any($1) order by 1,2`);
  const colRows = (await q(`select n.nspname schema, c.relname "table", a.attname, format_type(a.atttypid,a.atttypmod) type, a.attnotnull nn, pg_get_expr(d.adbin,d.adrelid) def, col_description(c.oid,a.attnum) cmt
    from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
    where c.relkind in ('r','p') and n.nspname = any($1) order by 1,2,a.attnum`))
    .map((r) => ({ schema: r.schema, table: r.table, col: { name: r.attname, type: r.type, nullable: !r.nn, default: r.def, comment: r.cmt } }));
  const cons = await q(`select n.nspname schema, c.relname "table", con.conname, con.contype, con.confupdtype, con.confdeltype,
      (select array_agg(a.attname::text order by k.ord) from unnest(con.conkey) with ordinality k(n,ord) join pg_attribute a on a.attrelid=con.conrelid and a.attnum=k.n) cols,
      fn.nspname fschema, fc.relname ftable,
      (select array_agg(a.attname::text order by k.ord) from unnest(con.confkey) with ordinality k(n,ord) join pg_attribute a on a.attrelid=con.confrelid and a.attnum=k.n) fcols
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
    left join pg_class fc on fc.oid=con.confrelid left join pg_namespace fn on fn.oid=fc.relnamespace
    where con.contype in ('p','f') and n.nspname = any($1)`);
  const pkRows = cons.filter((r) => r.contype === 'p');
  const fkRows = cons.filter((r) => r.contype === 'f').map((r) => ({
    name: r.conname, from: { schema: r.schema, name: r.table, columns: r.cols }, to: { schema: r.fschema, name: r.ftable, columns: r.fcols },
    onDelete: ACTION[r.confdeltype], onUpdate: ACTION[r.confupdtype],
  }));
  const idxRows = (await q(`select n.nspname schema, t.relname "table", i.relname name, ix.indisunique uq, am.amname type,
      (select array_agg(pg_get_indexdef(ix.indexrelid,k,true) order by k) from generate_series(1,ix.indnkeyatts) k) cols
    from pg_index ix join pg_class i on i.oid=ix.indexrelid join pg_class t on t.oid=ix.indrelid
    join pg_namespace n on n.oid=t.relnamespace join pg_am am on am.oid=i.relam
    where n.nspname = any($1) and t.relkind in ('r','p') and not ix.indisprimary order by 1,2,3`))
    .map((r) => ({ schema: r.schema, table: r.table, name: r.name, unique: r.uq, type: r.type, columns: r.cols }));
  return assemble(tableRows, colRows, pkRows, fkRows, idxRows);
});

// ---------- Oracle (thin mode, no Instant Client) ----------
const SAFE = /^[^()="'\\\s]+$/; // keeps user input from breaking out of the connect descriptor

function oraConnectString(c) {
  const port = +c.port || 1521;
  for (const v of [c.host, c.database]) if (!v || !SAFE.test(v)) throw Object.assign(new Error('invalid host or service name'), { statusCode: 400 });
  if (c.serverDn && /["()]/.test(c.serverDn)) throw Object.assign(new Error('invalid server certificate DN'), { statusCode: 400 });
  const tls = c.tls === 'verify' || c.tls === 'noverify';
  const security = tls ? `(SECURITY=(SSL_SERVER_DN_MATCH=${c.tls === 'verify' ? 'ON' : 'OFF'})${c.serverDn ? `(SSL_SERVER_CERT_DN="${c.serverDn}")` : ''})` : '';
  return `(DESCRIPTION=(ADDRESS=(PROTOCOL=${tls ? 'tcps' : 'tcp'})(HOST=${c.host})(PORT=${port}))(CONNECT_DATA=(SERVICE_NAME=${c.database}))${security})`;
}

// guardrail 1: SET TRANSACTION READ ONLY — the session cannot change data even if the user could
async function oraWith(c, fn) {
  const cfg = { user: c.user, password: c.password, connectString: oraConnectString(c), connectTimeout: 8 };
  let dir, conn;
  if (c.tls !== 'off' && c.caPem) { // custom CA / wallet in PEM form -> thin-mode walletLocation (ewallet.pem)
    dir = mkdtempSync(join(tmpdir(), 'ora-wallet-'));
    writeFileSync(join(dir, 'ewallet.pem'), c.caPem, { mode: 0o600 });
    cfg.walletLocation = dir;
    if (c.walletPassword) cfg.walletPassword = c.walletPassword;
  }
  try {
    conn = await oracledb.getConnection(cfg);
    conn.callTimeout = 30000;
    await conn.execute('SET TRANSACTION READ ONLY');
    return await fn(conn);
  } finally {
    try { await conn?.close(); } finally { if (dir) rmSync(dir, { recursive: true, force: true }); }
  }
}

const oraSchemas = (c) => oraWith(c, async (conn) =>
  (await conn.execute(`select distinct t.owner from all_tables t join all_users u on u.username=t.owner where u.oracle_maintained='N' order by 1`)).rows.map((r) => r[0]));

function oraType(r) {
  const t = r.DATA_TYPE;
  if (/^(VARCHAR2|NVARCHAR2|CHAR|NCHAR)$/.test(t)) return `${t}(${r.CHAR_LENGTH})`;
  if (t === 'NUMBER') return r.DATA_PRECISION == null ? (r.DATA_SCALE === 0 ? 'NUMBER(38)' : 'NUMBER') : `NUMBER(${r.DATA_PRECISION}${r.DATA_SCALE ? `,${r.DATA_SCALE}` : ''})`;
  if (t === 'RAW') return `RAW(${r.DATA_LENGTH})`;
  return t;
}

const oraImport = (c, schemas) => oraWith(c, async (conn) => {
  const binds = Object.fromEntries(schemas.map((s, i) => [`s${i}`, s]));
  const inl = schemas.map((_, i) => `:s${i}`).join(',');
  const q = async (sql) => (await conn.execute(sql.replace('@IN', inl), binds, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;
  const tableRows = await q(`select t.owner "schema", t.table_name "name", c.comments "comment" from all_tables t
    left join all_tab_comments c on c.owner=t.owner and c.table_name=t.table_name and c.table_type='TABLE'
    where t.owner in (@IN) and t.nested='NO' and t.secondary='N' and t.table_name not like 'BIN$%' order by 1,2`);
  const colRows = (await q(`select c.owner, c.table_name, c.column_name, c.data_type, c.data_length, c.char_length, c.data_precision, c.data_scale, c.nullable, c.data_default, cm.comments
    from all_tab_cols c join all_tables t on t.owner=c.owner and t.table_name=c.table_name
    left join all_col_comments cm on cm.owner=c.owner and cm.table_name=c.table_name and cm.column_name=c.column_name
    where c.owner in (@IN) and c.hidden_column='NO' order by c.owner,c.table_name,c.column_id`))
    .map((r) => ({ schema: r.OWNER, table: r.TABLE_NAME, col: { name: r.COLUMN_NAME, type: oraType(r), nullable: r.NULLABLE === 'Y', default: r.DATA_DEFAULT, comment: r.COMMENTS } }));
  const cons = await q(`select c.owner, c.table_name, c.constraint_name, c.constraint_type, c.delete_rule, cc.column_name, cc.position,
      rc.owner r_owner, rc.table_name r_table, rcc.column_name r_column
    from all_constraints c join all_cons_columns cc on cc.owner=c.owner and cc.constraint_name=c.constraint_name
    left join all_constraints rc on rc.owner=c.r_owner and rc.constraint_name=c.r_constraint_name
    left join all_cons_columns rcc on rcc.owner=rc.owner and rcc.constraint_name=rc.constraint_name and rcc.position=cc.position
    where c.owner in (@IN) and c.constraint_type in ('P','R') order by c.owner,c.constraint_name,cc.position`);
  const group = new Map();
  for (const r of cons) {
    const k = `${r.OWNER}.${r.CONSTRAINT_NAME}`;
    if (!group.has(k)) group.set(k, { r, cols: [], rcols: [] });
    group.get(k).cols.push(r.COLUMN_NAME);
    if (r.R_COLUMN) group.get(k).rcols.push(r.R_COLUMN);
  }
  const pkRows = [], fkRows = [];
  for (const { r, cols, rcols } of group.values()) {
    if (r.CONSTRAINT_TYPE === 'P') pkRows.push({ schema: r.OWNER, table: r.TABLE_NAME, cols });
    else fkRows.push({ name: r.CONSTRAINT_NAME, from: { schema: r.OWNER, name: r.TABLE_NAME, columns: cols }, to: { schema: r.R_OWNER, name: r.R_TABLE, columns: rcols }, onDelete: ({ CASCADE: 'cascade', 'SET NULL': 'set null' })[r.DELETE_RULE] });
  }
  const idx = new Map();
  for (const r of await q(`select i.owner, i.table_name, i.index_name, i.uniqueness, i.index_type, ic.column_name, ic.column_position
    from all_indexes i join all_ind_columns ic on ic.index_owner=i.owner and ic.index_name=i.index_name
    where i.owner in (@IN) and i.index_type in ('NORMAL','FUNCTION-BASED NORMAL','BITMAP') order by i.owner,i.index_name,ic.column_position`)) {
    const k = `${r.OWNER}.${r.INDEX_NAME}`;
    if (!idx.has(k)) idx.set(k, { schema: r.OWNER, table: r.TABLE_NAME, name: r.INDEX_NAME, unique: r.UNIQUENESS === 'UNIQUE', type: r.INDEX_TYPE === 'BITMAP' ? 'bitmap' : 'btree', columns: [] });
    idx.get(k).columns.push(r.COLUMN_NAME);
  }
  return assemble(tableRows, colRows, pkRows, fkRows, [...idx.values()]);
});

// guardrail 2: detect credentials that can do more than read metadata. Returns [{level, message}]
async function pgPrivileges(c, schemas) {
  return pgWith(c, async (cl) => {
    const r = (await cl.query(
      `select r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolbypassrls,
         exists(select 1 from pg_class t join pg_namespace n on n.oid=t.relnamespace where t.relkind in ('r','p') and n.nspname = any($1)
                and has_table_privilege(t.oid,'INSERT,UPDATE,DELETE,TRUNCATE')) can_write,
         exists(select 1 from pg_namespace n where n.nspname = any($1) and has_schema_privilege(n.oid,'CREATE')) can_create
       from pg_roles r where r.rolname = current_user`, [schemas])).rows[0] ?? {};
    const w = [];
    if (r.rolsuper) w.push('superuser role');
    if (r.rolcreaterole) w.push('can create roles');
    if (r.rolcreatedb) w.push('can create databases');
    if (r.rolbypassrls) w.push('bypasses row-level security');
    if (r.can_write) w.push('can INSERT/UPDATE/DELETE/TRUNCATE tables in the selected schemas');
    if (r.can_create) w.push('can CREATE objects in the selected schemas');
    return w;
  });
}

const ORA_RISKY = /(^|\s)(ANY|DBA|GRANT|CREATE TABLE|CREATE PROCEDURE|CREATE VIEW|CREATE SEQUENCE|CREATE TRIGGER|UNLIMITED TABLESPACE)\b/;
const ORA_READONLY = /^(SELECT|READ|ANALYZE|DEBUG|FLASHBACK|QUERY REWRITE|EXECUTE) ANY|^SELECT ANY|^READ ANY/;
async function oraPrivileges(c, schemas) {
  return oraWith(c, async (conn) => {
    const rows = async (sql, binds = {}) => (await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;
    const w = [];
    const roles = (await rows('select role from session_roles')).map((r) => r.ROLE);
    for (const role of ['DBA', 'RESOURCE']) if (roles.includes(role)) w.push(`has the ${role} role`);
    const privs = (await rows('select privilege from session_privs')).map((r) => r.PRIVILEGE).filter((p) => ORA_RISKY.test(p) && !/^(SELECT|READ|ANALYZE|DEBUG|FLASHBACK|QUERY REWRITE) ANY/.test(p) && !ORA_READONLY.test(p));
    if (privs.length) w.push(`system privileges beyond read: ${privs.slice(0, 6).join(', ')}${privs.length > 6 ? ` (+${privs.length - 6})` : ''}`);
    const binds = Object.fromEntries(schemas.map((s, i) => [`s${i}`, s]));
    const inl = schemas.map((_, i) => `:s${i}`).join(',') || "''";
    const [{ N }] = await rows(`select count(*) n from all_tab_privs_recd where privilege in ('INSERT','UPDATE','DELETE') and owner in (${inl})`, binds);
    if (N > 0) w.push('has INSERT/UPDATE/DELETE grants on objects in the selected schemas');
    const me = (await rows("select sys_context('USERENV','CURRENT_USER') u from dual"))[0].U;
    if (schemas.includes(me)) w.push(`is the owner of schema ${me} (full control of its objects)`);
    return w;
  });
}

const drivers = { postgres: { schemas: pgSchemas, import: pgImport, privileges: pgPrivileges }, oracle: { schemas: oraSchemas, import: oraImport, privileges: oraPrivileges } };
export const listSchemas = (c) => drivers[c.type].schemas(c);
export const privilegeWarnings = (c, schemas) => drivers[c.type].privileges(c, schemas);
export async function importModel(c, schemas, tables) {
  const m = await drivers[c.type].import(c, schemas);
  if (tables?.length) {
    const want = new Set(tables.map((t) => t.toLowerCase()));
    m.tables = m.tables.filter((t) => want.has(t.name.toLowerCase()));
    const have = new Set(m.tables.map((t) => key(t.schema, t.name)));
    m.refs = m.refs.filter((r) => have.has(key(r.from.schema, r.from.name)) && have.has(key(r.to.schema, r.to.name)));
  }
  return m;
}
