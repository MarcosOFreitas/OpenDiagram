import { Parser, importer, exporter } from '@dbml/core';

const conns = {
  pg: { type: 'postgres', host: 'demo-pg', port: 5432, database: 'demo', user: 'postgres', password: 'demo', schemas: ['shop'] },
  oracle: { type: 'oracle', host: 'demo-oracle', port: 1521, database: 'FREEPDB1', user: 'shop', password: 'shop', schemas: ['SHOP'] },
};

const summarize = (dbml) => {
  const db = new Parser().parse(dbml, 'dbmlv2');
  const tables = {};
  for (const t of db.schemas.flatMap((s) => s.tables)) {
    tables[t.name.toLowerCase()] = {
      cols: t.fields.map((f) => `${f.name.toLowerCase()}:${String(f.type.type_name).toLowerCase().replace('timestamp without time zone','timestamp').replace('character varying','varchar')}${f.pk ? ':pk' : ''}${f.not_null ? ':nn' : ''}`),
      idx: t.indexes.length,
    };
  }
  const refs = db.schemas.flatMap((s) => s.refs).map((r) => r.endpoints.map((e) => `${e.tableName}.${e.fieldNames}`.toLowerCase()).sort().join('~')).sort();
  return { tables, refs };
};

const diff = (a, b) => {
  const out = [];
  for (const t of Object.keys(a.tables)) {
    const y = b.tables[t];
    if (!y) { out.push(`table ${t} missing`); continue; }
    const x = a.tables[t];
    for (const c of x.cols) if (!y.cols.includes(c)) out.push(`${t}: col ${c}  -> got [${y.cols.filter((k) => k.split(':')[0] === c.split(':')[0])}]`);
    if (x.idx !== y.idx) out.push(`${t}: indexes ${x.idx} -> ${y.idx}`);
  }
  if (JSON.stringify(a.refs) !== JSON.stringify(b.refs)) out.push(`refs ${JSON.stringify(a.refs)} -> ${JSON.stringify(b.refs)}`);
  return out;
};

for (const [name, body] of Object.entries(conns)) {
  const r = await (await fetch('http://localhost:3000/api/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  if (r.error) { console.log(name, 'IMPORT FAIL', r.error); continue; }
  const orig = summarize(r.dbml);
  console.log(`\n== ${name}: ${r.tables} tables, ${r.refs} refs`);
  for (const fmt of ['postgres', 'mysql', 'mssql', 'oracle', 'json']) {
    try {
      const out = exporter.export(r.dbml, fmt);
      if (fmt === 'oracle') { console.log(`${fmt}: export ok (${out.length}b), import unsupported`); continue; }
      const back = importer.import(out, fmt);
      const d = diff(orig, summarize(back));
      console.log(`${fmt}: ${d.length ? 'DIFFS' : 'identical'}`);
      d.slice(0, 8).forEach((x) => console.log('   -', x));
    } catch (e) { console.log(`${fmt}: FAIL ${String(e.message || JSON.stringify(e.diags || e)).slice(0, 160)}`); }
  }
}
