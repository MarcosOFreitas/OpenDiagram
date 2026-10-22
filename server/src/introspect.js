import pg from 'pg';
import oracledb from 'oracledb';
import mysql from 'mysql2/promise';
import { ACTION } from './dbml.js';
import { viewColumnLineage } from './lineage.js';

const key = (s, n) => `${s}.${n}`;

// views are tables with a `view` flag (definition text); triggers hang off their table/view; enums and sequences are separate lists.
// `seqUse` = [{ seq: {schema, name}, table: {schema, name}, column? }]: which table (and column) uses a sequence (a column default, or a trigger); only tables of this import count.
export function assemble(tableRows, colRows, pkRows, fkRows, idxRows, trigRows = [], enums = [], sequences = [], lineageRows = [], seqUse = []) {
  const tables = new Map();
  const sqlOf = new Map(); // the SQL the lineage parser reads: a driver may give a standard-SQL copy of the view text (MySQL backticks)
  for (const r of tableRows) { tables.set(key(r.schema, r.name), { schema: r.schema, name: r.name, comment: r.comment, view: r.view ?? null, viewKind: r.viewKind ?? null, columns: [], pk: [], indexes: [], triggers: [] }); if (r.lineageSql) sqlOf.set(key(r.schema, r.name), r.lineageSql); }
  for (const r of colRows) tables.get(key(r.schema, r.table))?.columns.push(r.col);
  for (const r of pkRows) tables.get(key(r.schema, r.table))?.pk.push(...r.cols);
  for (const r of idxRows) {
    const t = tables.get(key(r.schema, r.table));
    if (!t) continue;
    const samePk = r.unique && t.pk.length === r.columns.length && r.columns.every((c, i) => c === t.pk[i]);
    if (!samePk) t.indexes.push({ name: r.name, unique: r.unique, type: r.type, columns: r.columns });
  }
  for (const r of trigRows) tables.get(key(r.schema, r.table))?.triggers.push({ name: r.name, def: r.def });
  const refs = fkRows.filter((r) => tables.has(key(r.from.schema, r.from.name)) && tables.has(key(r.to.schema, r.to.name)));
  // data lineage: which tables (and the columns of them) a view / materialized view is built from. Only between tables of this import.
  const lin = new Map();
  for (const r of lineageRows) {
    const tk = key(r.target.schema, r.target.name), sk = key(r.source.schema, r.source.name);
    if (tk === sk || !tables.has(tk) || !tables.has(sk)) continue;
    if (!lin.has(tk)) lin.set(tk, { target: r.target, sources: [] });
    lin.get(tk).sources.push({ ...r.source, columns: r.columns ?? [] });
  }
  // which source column each output column of a view comes from (parsing the view's SQL); added to the table-level entries
  for (const c of viewColumnLineage([...tables.values()].map((t) => ({ schema: t.schema, name: t.name, columns: t.columns.map((x) => x.name), view: sqlOf.get(key(t.schema, t.name)) ?? t.view })))) {
    const k = key(c.target.schema, c.target.name);
    if (!lin.has(k)) lin.set(k, { target: c.target, sources: [] });
    lin.get(k).columns = c.columns;
  }
  const used = new Map();
  for (const u of seqUse) {
    const tk = key(u.table.schema, u.table.name);
    if (!tables.has(tk)) continue;
    const sk = key(u.seq.schema, u.seq.name);
    if (!used.has(sk)) used.set(sk, new Map());
    const m = used.get(sk);
    if (!m.has(tk)) m.set(tk, { schema: u.table.schema, name: u.table.name, columns: [] });
    if (u.column && !m.get(tk).columns.includes(u.column)) m.get(tk).columns.push(u.column);
  }
  return { tables: [...tables.values()], refs, enums, sequences: sequences.map((q) => ({ ...q, usedBy: [...(used.get(key(q.schema, q.name))?.values() ?? [])] })), lineage: [...lin.values()] };
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

const pgTables = (c, schemas) => pgWith(c, async (cl) =>
  (await cl.query(`select n.nspname schema, c.relname name, c.relkind in ('v','m') "view" from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p','v','m') and n.nspname = any($1) order by 1,2`, [schemas])).rows);

const pgImport = (c, schemas) => pgWith(c, async (cl) => {
  const q = async (sql) => (await cl.query(sql, [schemas])).rows;
  const tableRows = await q(`select n.nspname schema, c.relname name, obj_description(c.oid) comment, case when c.relkind in ('v','m') then pg_get_viewdef(c.oid,true) end view, case c.relkind when 'v' then 'VIEW' when 'm' then 'MATERIALIZED VIEW' end "viewKind"
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p','v','m') and n.nspname = any($1) order by 1,2`);
  const colRows = (await q(`select n.nspname schema, c.relname "table", a.attname, format_type(a.atttypid,a.atttypmod) type, a.attnotnull nn, pg_get_expr(d.adbin,d.adrelid) def, col_description(c.oid,a.attnum) cmt
    from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
    where c.relkind in ('r','p','v','m') and n.nspname = any($1) order by 1,2,a.attnum`))
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
    where n.nspname = any($1) and t.relkind in ('r','p','m') and not ix.indisprimary order by 1,2,3`))
    .map((r) => ({ schema: r.schema, table: r.table, name: r.name, unique: r.uq, type: r.type, columns: r.cols }));
  const trigRows = await q(`select n.nspname schema, c.relname "table", t.tgname name, pg_get_triggerdef(t.oid,true) def
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname = any($1) order by 1,2,3`);
  const enums = await q(`select n.nspname schema, t.typname name, array_agg(e.enumlabel::text order by e.enumsortorder) "values"
    from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace where n.nspname = any($1) group by 1,2 order by 1,2`);
  // sequences owned by a column (serial / identity) are implementation detail: skipped
  const sequences = (await q(`select n.nspname schema, c.relname name, s.seqtypid::regtype::text type, s.seqstart::text start, s.seqincrement::text step, s.seqmin::text min, s.seqmax::text max, s.seqcycle cycle, obj_description(c.oid,'pg_class') comment
    from pg_sequence s join pg_class c on c.oid=s.seqrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname = any($1) and not exists (select 1 from pg_depend d where d.objid=c.oid and d.deptype in ('a','i')) order by 1,2`))
    .map((r) => ({ schema: r.schema, name: r.name, comment: r.comment, desc: `${r.type} start ${r.start} step ${r.step} min ${r.min} max ${r.max}${r.cycle ? ' cycle' : ''}` }));
  // lineage: the rewrite rule of a view depends on the tables and columns it reads (pg_depend); the mapping output column -> source column is not in the catalog
  const lineage = (await q(`select vn.nspname vschema, v.relname vname, sn.nspname sschema, s.relname sname, array_remove(array_agg(distinct a.attname::text), null) cols
    from pg_depend d join pg_rewrite r on r.oid=d.objid join pg_class v on v.oid=r.ev_class join pg_namespace vn on vn.oid=v.relnamespace
    join pg_class s on s.oid=d.refobjid join pg_namespace sn on sn.oid=s.relnamespace
    left join pg_attribute a on a.attrelid=d.refobjid and a.attnum=d.refobjsubid and d.refobjsubid > 0
    where d.classid='pg_rewrite'::regclass and d.refclassid='pg_class'::regclass and v.relkind in ('v','m') and s.oid <> v.oid and vn.nspname = any($1)
    group by 1,2,3,4 order by 1,2,3,4`))
    .map((r) => ({ target: { schema: r.vschema, name: r.vname }, source: { schema: r.sschema, name: r.sname }, columns: r.cols }));
  // which table (and column) uses a sequence: the default expression of a column (`default nextval('seq')`) depends on it
  const seqUse = (await q(`select sn.nspname seq_schema, s.relname seq_name, tn.nspname tschema, t.relname "table", a.attname::text col
    from pg_depend d join pg_class s on s.oid=d.refobjid and s.relkind='S' join pg_namespace sn on sn.oid=s.relnamespace
    join pg_attrdef ad on ad.oid=d.objid join pg_class t on t.oid=ad.adrelid join pg_namespace tn on tn.oid=t.relnamespace
    join pg_attribute a on a.attrelid=ad.adrelid and a.attnum=ad.adnum
    where d.classid='pg_attrdef'::regclass and d.refclassid='pg_class'::regclass and sn.nspname = any($1) order by 1,2,3,4,5`))
    .map((r) => ({ seq: { schema: r.seq_schema, name: r.seq_name }, table: { schema: r.tschema, name: r.table }, column: r.col }));
  return assemble(tableRows, colRows, pkRows, fkRows, idxRows, trigRows, enums, sequences, lineage, seqUse);
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
  // Oracle is reached through a connection string only (TCPS with the server certificate checked against the system trust store, plus the optional DN):
  // no wallets. A private CA is trusted by the server process itself (NODE_EXTRA_CA_CERTS), not per connection.
  const cfg = { user: c.user, password: c.password, connectString: oraConnectString(c), connectTimeout: 8 };
  let conn;
  try {
    conn = await oracledb.getConnection(cfg);
    conn.callTimeout = 30000;
    await conn.execute('SET TRANSACTION READ ONLY');
    return await fn(conn);
  } finally {
    await conn?.close();
  }
}

const oraSchemas = (c) => oraWith(c, async (conn) =>
  (await conn.execute(`select distinct t.owner from all_tables t join all_users u on u.username=t.owner where u.oracle_maintained='N' order by 1`)).rows.map((r) => r[0]));

const oraTables = (c, schemas) => oraWith(c, async (conn) => {
  const [binds, inl] = inBinds(schemas);
  return (await conn.execute(`select t.owner "schema", t.table_name "name", (select count(*) from all_mviews m where m.owner=t.owner and m.mview_name=t.table_name) "view" from all_tables t where t.owner in (${inl})
    and t.nested='NO' and t.secondary='N' and t.table_name not like 'BIN$%' and t.table_name not like 'MLOG$\\_%' escape '\\' and t.table_name not like 'RUPD$\\_%' escape '\\'
    union all select v.owner, v.view_name, 1 from all_views v where v.owner in (${inl}) order by 1,2`, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows.map((r) => ({ ...r, view: !!r.view }));
});

function oraType(r) {
  const t = r.DATA_TYPE;
  if (/^(VARCHAR2|NVARCHAR2|CHAR|NCHAR)$/.test(t)) return `${t}(${r.CHAR_LENGTH})`;
  if (t === 'NUMBER') return r.DATA_PRECISION == null ? (r.DATA_SCALE === 0 ? 'NUMBER(38)' : 'NUMBER') : `NUMBER(${r.DATA_PRECISION}${r.DATA_SCALE ? `,${r.DATA_SCALE}` : ''})`;
  if (t === 'RAW') return `RAW(${r.DATA_LENGTH})`;
  return t;
}

const oraImport = (c, schemas) => oraWith(c, async (conn) => {
  const [binds, inl] = inBinds(schemas);
  const q = async (sql) => (await conn.execute(sql.replaceAll('@IN', inl), binds, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;
  const tableRows = await q(`select t.owner "schema", t.table_name "name", c.comments "comment" from all_tables t
    left join all_tab_comments c on c.owner=t.owner and c.table_name=t.table_name and c.table_type='TABLE'
    where t.owner in (@IN) and t.nested='NO' and t.secondary='N' and t.table_name not like 'BIN$%' and t.table_name not like 'MLOG$\\_%' escape '\\' and t.table_name not like 'RUPD$\\_%' escape '\\' order by 1,2`);
  // a materialized view also exists as a TABLE of the same name: show it once, as a view (its query is a LONG, fetched as string)
  const mv = new Map((await q(`select owner, mview_name, query from all_mviews where owner in (@IN)`)).map((r) => [`${r.OWNER}.${r.MVIEW_NAME}`, r.QUERY]));
  for (const t of tableRows) if (mv.has(`${t.schema}.${t.name}`)) { t.view = mv.get(`${t.schema}.${t.name}`) ?? ''; t.viewKind = 'MATERIALIZED VIEW'; }
  tableRows.push(...await q(`select v.owner "schema", v.view_name "name", c.comments "comment", v.text_vc "view", 'VIEW' "viewKind" from all_views v
    left join all_tab_comments c on c.owner=v.owner and c.table_name=v.view_name and c.table_type='VIEW' where v.owner in (@IN) order by 1,2`));
  const colRows = (await q(`select c.owner, c.table_name, c.column_name, c.data_type, c.data_length, c.char_length, c.data_precision, c.data_scale, c.nullable, c.data_default, cm.comments
    from all_tab_cols c
    left join all_col_comments cm on cm.owner=c.owner and cm.table_name=c.table_name and cm.column_name=c.column_name
    where c.owner in (@IN) and c.hidden_column='NO' and (c.owner, c.table_name) in (select owner, table_name from all_tables union all select owner, view_name from all_views) order by c.owner,c.table_name,c.column_id`))
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
    if (r.INDEX_NAME.startsWith('I_SNAP$')) continue; // internal index of a materialized view
    const k = `${r.OWNER}.${r.INDEX_NAME}`;
    if (!idx.has(k)) idx.set(k, { schema: r.OWNER, table: r.TABLE_NAME, name: r.INDEX_NAME, unique: r.UNIQUENESS === 'UNIQUE', type: r.INDEX_TYPE === 'BITMAP' ? 'bitmap' : 'btree', columns: [] });
    idx.get(k).columns.push(r.COLUMN_NAME);
  }
  const trigRows = (await q(`select owner, table_name, trigger_name, trigger_type, triggering_event, status from all_triggers
    where owner in (@IN) and base_object_type in ('TABLE','VIEW') order by owner,table_name,trigger_name`))
    .map((r) => ({ schema: r.OWNER, table: r.TABLE_NAME, name: r.TRIGGER_NAME, def: `${r.TRIGGER_TYPE} ${r.TRIGGERING_EVENT}${r.STATUS === 'DISABLED' ? ' (disabled)' : ''}` }));
  // sequences behind identity columns (ISEQ$$_*) are implementation detail: skipped
  const sequences = (await q(`select s.sequence_owner, s.sequence_name, s.min_value, s.max_value, s.increment_by, s.cycle_flag from all_sequences s
    where s.sequence_owner in (@IN) and s.sequence_name not like 'ISEQ$$_%' order by 1,2`))
    .map((r) => ({ schema: r.SEQUENCE_OWNER, name: r.SEQUENCE_NAME, desc: `min ${r.MIN_VALUE} step ${r.INCREMENT_BY}${r.CYCLE_FLAG === 'Y' ? ' cycle' : ''}` }));
  // lineage at table level (ALL_DEPENDENCIES has no columns); a materialized view's dependency on its own container table is dropped by assemble
  const lineage = (await q(`select owner, name, referenced_owner, referenced_name from all_dependencies
    where owner in (@IN) and type in ('VIEW','MATERIALIZED VIEW') and referenced_type in ('TABLE','VIEW','MATERIALIZED VIEW') and referenced_owner in (@IN) order by 1,2,3,4`))
    .map((r) => ({ target: { schema: r.OWNER, name: r.NAME }, source: { schema: r.REFERENCED_OWNER, name: r.REFERENCED_NAME } }));
  // which table uses a sequence: a trigger (its table) or a table whose default reads seq.NEXTVAL depends on it (ALL_DEPENDENCIES)
  const trigTable = new Map(trigRows.map((t) => [key(t.schema, t.name), t]));
  const seqUse = (await q(`select referenced_owner seq_owner, referenced_name seq_name, owner, name, type from all_dependencies
    where referenced_type = 'SEQUENCE' and referenced_owner in (@IN) and type in ('TRIGGER','TABLE') order by 1,2,3,4`))
    .flatMap((r) => {
      const seq = { schema: r.SEQ_OWNER, name: r.SEQ_NAME };
      if (r.TYPE === 'TABLE') return [{ seq, table: { schema: r.OWNER, name: r.NAME } }];
      const t = trigTable.get(key(r.OWNER, r.NAME));
      return t ? [{ seq, table: { schema: t.schema, name: t.table } }] : [];
    });
  return assemble(tableRows, colRows, pkRows, fkRows, [...idx.values()], trigRows, [], sequences, lineage, seqUse);
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

const inBinds = (v) => [Object.fromEntries(v.map((x, i) => [`s${i}`, x])), v.map((_, i) => `:s${i}`).join(',')]; // named binds + their :s0,:s1 list for an IN (...)
const ORA_RISKY = /(^|\s)(ANY|DBA|GRANT|CREATE TABLE|CREATE PROCEDURE|CREATE VIEW|CREATE SEQUENCE|CREATE TRIGGER|UNLIMITED TABLESPACE)\b/;
const ORA_READONLY = /^(SELECT|READ|ANALYZE|DEBUG|FLASHBACK|QUERY REWRITE|EXECUTE) ANY|^SELECT ANY|^READ ANY/;
async function oraPrivileges(c, schemas) {
  return oraWith(c, async (conn) => {
    const rows = async (sql, binds = {}) => (await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;
    const w = [];
    const roles = (await rows('select role from session_roles')).map((r) => r.ROLE);
    for (const role of ['DBA', 'RESOURCE']) if (roles.includes(role)) w.push(`has the ${role} role`);
    const privs = (await rows('select privilege from session_privs')).map((r) => r.PRIVILEGE).filter((p) => ORA_RISKY.test(p) && !ORA_READONLY.test(p));
    if (privs.length) w.push(`system privileges beyond read: ${privs.slice(0, 6).join(', ')}${privs.length > 6 ? ` (+${privs.length - 6})` : ''}`);
    const [binds, inl0] = inBinds(schemas), inl = inl0 || "''";
    const [{ N }] = await rows(`select count(*) n from all_tab_privs_recd where privilege in ('INSERT','UPDATE','DELETE') and owner in (${inl})`, binds);
    if (N > 0) w.push('has INSERT/UPDATE/DELETE grants on objects in the selected schemas');
    const me = (await rows("select sys_context('USERENV','CURRENT_USER') u from dual"))[0].U;
    if (schemas.includes(me)) w.push(`is the owner of schema ${me} (full control of its objects)`);
    return w;
  });
}

// ---------- MySQL 8.0+ (MariaDB 10.6+ best effort) ----------
// A database is a schema: the Database field only sets the session default. The server may be one a user controls (any host the
// policy allows), so the driver never runs code built from what it sends (disableEval) and never offers to read local files.
export const myConfig = (c) => ({
  host: c.host, port: +c.port || 3306, user: c.user, password: c.password, database: c.database || undefined,
  ssl: c.tls === 'verify' ? { rejectUnauthorized: true, ...(c.caPem ? { ca: c.caPem } : {}) } : c.tls === 'noverify' ? { rejectUnauthorized: false } : undefined,
  connectTimeout: 8000, disableEval: true, flags: ['-LOCAL_FILES'], multipleStatements: false, dateStrings: true, supportBigNumbers: true, bigNumberStrings: true,
});

// guardrail 1: the session default and every use are read-only transactions; each query stops after 30 s
export async function myWith(c, fn, connect = (o) => mysql.createConnection(o)) {
  const cn = await connect(myConfig(c));
  try {
    await cn.query('SET SESSION TRANSACTION READ ONLY');
    await cn.query('SET SESSION max_execution_time = 30000');
    await cn.query('START TRANSACTION READ ONLY');
    return await fn(cn);
  } finally {
    try { await cn.query('ROLLBACK'); } catch { /* connection already gone */ }
    try { await cn.end(); } catch { /* already closed */ }
  }
}

// guardrail 2: SHOW GRANTS lines -> warnings. An allowlist, so a privilege a later version adds is reported, never assumed harmless.
const MY_ALLOWED = new Set(['USAGE', 'SELECT', 'SHOW VIEW', 'SHOW DATABASES']);
const myUnquote = (s) => s.replace(/^`|`$/g, '').replace(/``/g, '`');
// a database name in GRANT ... ON `db\_%`.* is a LIKE pattern: % any text, _ one character, a backslash makes the next one literal
function myLike(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\' && i + 1 < pattern.length) re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else re += ch === '%' ? '.*' : ch === '_' ? '.' : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}
export function myGrantWarnings(lines, schemas) {
  const out = [];
  for (const line of lines) {
    const m = /^GRANT (.+?) ON (.+?) TO .+?( WITH GRANT OPTION)?$/.exec(line.trim());
    if (!m) continue; // a role granted to the user: its privileges come through SHOW GRANTS ... USING
    const on = m[2].trim();
    let scope;
    if (on === '*.*') scope = '*.*';
    else {
      const t = /^(`(?:[^`]|``)*`|[^.]+)\.(\*|`(?:[^`]|``)*`|\S+)$/.exec(on);
      if (!t) { scope = on; } else {
        const db = myUnquote(t[1]);
        if (!schemas.some((s) => s === db || myLike(t[1].replace(/^`|`$/g, '')).test(s))) continue; // not one of the imported databases
        scope = `${db}.${t[2] === '*' ? '*' : myUnquote(t[2])}`;
      }
    }
    const privs = m[1].replace(/\([^)]*\)/g, '').split(',').map((p) => p.trim().toUpperCase()).filter(Boolean); // column lists (`col`) dropped
    const risky = [...new Set(privs.filter((p) => !MY_ALLOWED.has(p)))];
    if (risky.length) out.push(`has ${risky.length > 8 ? `${risky.slice(0, 8).join(', ')} and ${risky.length - 8} more` : risky.join(', ')} on ${scope}`);
    if (m[3]) out.push(`can grant its privileges to others (WITH GRANT OPTION) on ${scope}`);
  }
  return [...new Set(out)];
}

// one information_schema.COLUMNS row -> the neutral column; an enum column also gives a DBML enum named after its table and column
const MY_TEXT = /char|text|enum|set|date|time|year|blob|binary|json/;
export function myColumn(r) {
  let type = r.COLUMN_TYPE, en = null;
  if (r.DATA_TYPE === 'enum') {
    const values = [...r.COLUMN_TYPE.slice(5, -1).matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1].replace(/''/g, "'"));
    en = { schema: r.TABLE_SCHEMA, name: `${r.TABLE_NAME}_${r.COLUMN_NAME}`, values };
    type = `${en.schema}.${en.name}`;
  }
  const d = r.COLUMN_DEFAULT;
  const def = d == null ? undefined : /DEFAULT_GENERATED/i.test(r.EXTRA || '') ? d : MY_TEXT.test(r.DATA_TYPE) ? `'${String(d).replace(/'/g, "''")}'` : String(d);
  const col = { name: r.COLUMN_NAME, type, nullable: r.IS_NULLABLE === 'YES', default: def, comment: r.COLUMN_COMMENT || undefined };
  if (/auto_increment/i.test(r.EXTRA || '')) col.increment = true;
  return { schema: r.TABLE_SCHEMA, table: r.TABLE_NAME, col, enum: en };
}

const MY_SYSTEM = ['mysql', 'sys', 'information_schema', 'performance_schema'];
// one information_schema.TABLES row (s, n, t = TABLE_TYPE, cm = TABLE_COMMENT) -> the neutral table; MySQL writes "VIEW" as the comment of every view.
// The lineage parser reads standard SQL, so it gets a copy of the view text with backticks as double quotes; the DDL keeps MySQL's own text.
export const myTableRow = (r, view) => {
  const isView = r.t === 'VIEW';
  return { schema: r.s, name: r.n, comment: (isView && r.cm === 'VIEW') || !r.cm ? undefined : r.cm, view: isView ? view ?? '' : null, viewKind: isView ? 'VIEW' : null, lineageSql: isView ? (view ?? '').replace(/`/g, '"') : undefined };
};
const myRows = async (cn, sql, params = []) => (await cn.query(sql, params))[0];

const mySchemas = (c) => myWith(c, async (cn) =>
  (await myRows(cn, 'SELECT SCHEMA_NAME AS s FROM information_schema.SCHEMATA WHERE SCHEMA_NAME NOT IN (?) ORDER BY 1', [MY_SYSTEM])).map((r) => r.s));

const myTables = (c, schemas) => myWith(c, async (cn) =>
  (await myRows(cn, `SELECT TABLE_SCHEMA AS s, TABLE_NAME AS n, TABLE_TYPE = 'VIEW' AS v FROM information_schema.TABLES WHERE TABLE_SCHEMA IN (?) ORDER BY 1, 2`, [schemas]))
    .map((r) => ({ schema: r.s, name: r.n, view: !!r.v })));

const myImport = (c, schemas) => myWith(c, async (cn) => {
  const q = (sql) => myRows(cn, sql, [schemas]);
  const views = new Map((await q('SELECT TABLE_SCHEMA AS s, TABLE_NAME AS n, VIEW_DEFINITION AS d FROM information_schema.VIEWS WHERE TABLE_SCHEMA IN (?)')).map((r) => [key(r.s, r.n), r.d ?? '']));
  const tableRows = (await q('SELECT TABLE_SCHEMA AS s, TABLE_NAME AS n, TABLE_TYPE AS t, TABLE_COMMENT AS cm FROM information_schema.TABLES WHERE TABLE_SCHEMA IN (?) ORDER BY 1, 2'))
    .map((r) => myTableRow(r, r.t === 'VIEW' ? views.get(key(r.s, r.n)) ?? '' : undefined));
  const enums = [], colRows = [];
  for (const r of await q('SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, COLUMN_COMMENT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA IN (?) ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION')) {
    const m = myColumn(r);
    colRows.push({ schema: m.schema, table: m.table, col: m.col });
    if (m.enum) enums.push(m.enum);
  }
  const keys = await q(`SELECT k.TABLE_SCHEMA AS s, k.TABLE_NAME AS t, k.CONSTRAINT_NAME AS c, k.COLUMN_NAME AS col, k.REFERENCED_TABLE_SCHEMA AS rs, k.REFERENCED_TABLE_NAME AS rt, k.REFERENCED_COLUMN_NAME AS rc, r.UPDATE_RULE AS up, r.DELETE_RULE AS del
    FROM information_schema.KEY_COLUMN_USAGE k LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.TABLE_NAME = k.TABLE_NAME
    WHERE k.TABLE_SCHEMA IN (?) AND (k.CONSTRAINT_NAME = 'PRIMARY' OR k.REFERENCED_TABLE_NAME IS NOT NULL) ORDER BY k.TABLE_SCHEMA, k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION`);
  const group = (rows) => { const g = new Map(); for (const r of rows) { const k = `${r.s}.${r.t}.${r.c}`; if (!g.has(k)) g.set(k, []); g.get(k).push(r); } return [...g.values()]; };
  const pkRows = group(keys.filter((r) => r.c === 'PRIMARY')).map((g) => ({ schema: g[0].s, table: g[0].t, cols: g.map((r) => r.col) }));
  const fkRows = group(keys.filter((r) => r.c !== 'PRIMARY')).map((g) => ({
    name: g[0].c, from: { schema: g[0].s, name: g[0].t, columns: g.map((r) => r.col) }, to: { schema: g[0].rs, name: g[0].rt, columns: g.map((r) => r.rc) },
    onDelete: g[0].del?.toLowerCase(), onUpdate: g[0].up?.toLowerCase(),
  }));
  const idx = await q(`SELECT TABLE_SCHEMA AS s, TABLE_NAME AS t, INDEX_NAME AS c, NON_UNIQUE AS nu, INDEX_TYPE AS ty, COALESCE(COLUMN_NAME, CONCAT('(', EXPRESSION, ')')) AS col
    FROM information_schema.STATISTICS WHERE TABLE_SCHEMA IN (?) AND INDEX_NAME <> 'PRIMARY' ORDER BY 1, 2, 3, SEQ_IN_INDEX`);
  const idxRows = group(idx).map((g) => ({ schema: g[0].s, table: g[0].t, name: g[0].c, unique: Number(g[0].nu) === 0, type: String(g[0].ty).toLowerCase(), columns: g.map((r) => r.col) }));
  const trigRows = (await q('SELECT EVENT_OBJECT_SCHEMA AS s, EVENT_OBJECT_TABLE AS t, TRIGGER_NAME AS n, ACTION_TIMING AS ti, EVENT_MANIPULATION AS ev, ACTION_STATEMENT AS st FROM information_schema.TRIGGERS WHERE EVENT_OBJECT_SCHEMA IN (?) ORDER BY 1, 2, 3'))
    .map((r) => ({ schema: r.s, table: r.t, name: r.n, def: `${r.ti} ${r.ev} FOR EACH ROW ${r.st}` })); // shown only to an account with the TRIGGER privilege
  let lineage = [];
  try { // VIEW_TABLE_USAGE: MySQL 8.0.13+; MariaDB has none (then only the columns parsed from the view text)
    lineage = (await q('SELECT VIEW_SCHEMA AS vs, VIEW_NAME AS vn, TABLE_SCHEMA AS ts, TABLE_NAME AS tn FROM information_schema.VIEW_TABLE_USAGE WHERE VIEW_SCHEMA IN (?)'))
      .map((r) => ({ target: { schema: r.vs, name: r.vn }, source: { schema: r.ts, name: r.tn }, columns: [] }));
  } catch { /* not available */ }
  return assemble(tableRows, colRows, pkRows, fkRows, idxRows, trigRows, enums, [], lineage, []);
});

async function myPrivileges(c, schemas) {
  return myWith(c, async (cn) => {
    let lines;
    try {
      const role = Object.values((await myRows(cn, 'SELECT CURRENT_ROLE() AS r'))[0] ?? {})[0];
      lines = await myRows(cn, `SHOW GRANTS FOR CURRENT_USER()${role && role !== 'NONE' ? ` USING ${role}` : ''}`); // the privileges of the active roles too
    } catch { lines = await myRows(cn, 'SHOW GRANTS'); } // MariaDB
    return myGrantWarnings(lines.map((r) => String(Object.values(r)[0])), schemas);
  });
}

const drivers = { postgres: { schemas: pgSchemas, tables: pgTables, import: pgImport, privileges: pgPrivileges }, oracle: { schemas: oraSchemas, tables: oraTables, import: oraImport, privileges: oraPrivileges },
  mysql: { schemas: mySchemas, tables: myTables, import: myImport, privileges: myPrivileges } };
export const listSchemas = (c) => drivers[c.type].schemas(c);
export const listTables = (c, schemas) => drivers[c.type].tables(c, schemas);
export const privilegeWarnings = (c, schemas) => drivers[c.type].privileges(c, schemas);
// `tables` is the stored selection: [] or missing = every table, otherwise exactly those (`schema.name`, or the plain name). Never more than asked for.
// `m.missing` = the asked-for tables the database does not have (any more): the caller says so instead of silently importing fewer.
export function filterModel(m, tables) {
  m.missing = [];
  if (tables?.length) {
    const want = new Set(tables.map((t) => t.toLowerCase()));
    m.tables = m.tables.filter((t) => want.has(t.name.toLowerCase()) || want.has(`${t.schema}.${t.name}`.toLowerCase())); // plain name or schema.name
    const found = new Set(m.tables.flatMap((t) => [t.name.toLowerCase(), `${t.schema}.${t.name}`.toLowerCase()]));
    m.missing = tables.filter((t) => !found.has(t.toLowerCase()));
    const have = new Set(m.tables.map((t) => key(t.schema, t.name)));
    m.refs = m.refs.filter((r) => have.has(key(r.from.schema, r.from.name)) && have.has(key(r.to.schema, r.to.name)));
    m.lineage = (m.lineage ?? []).filter((l) => have.has(key(l.target.schema, l.target.name)))
      .map((l) => ({ ...l, sources: l.sources.filter((s) => have.has(key(s.schema, s.name))), columns: (l.columns ?? []).map((c) => ({ ...c, from: c.from.filter((s) => have.has(key(s.schema, s.name))) })).filter((c) => c.from.length) }))
      .filter((l) => l.sources.length || l.columns.length);
  }
  return m;
}
export async function importModel(c, schemas, tables) { return filterModel(await drivers[c.type].import(c, schemas), tables); }
