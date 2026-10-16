// What a metadata refresh keeps of the existing diagram text (TableGroups, hand-written lineage) and the one-line summary of what changed.
// Mirrors keepGroups/withGroups/diffSummary of web/src/diagramModel.js (the browser's manual refresh): server/test/merge.test.js and web/src/diagramModel.test.js run the same cases.
import { Parser } from '@dbml/core';

const MANUAL = /^\s*\/\/\s*lineage:/i; // by hand (not `(auto)`)
const tid = (schema, name) => `${schema || 'public'}.${name}`;
const qid = (x) => (/^[A-Za-z_]\w*$/.test(x) ? x : `"${x.replaceAll('"', '\\"')}"`);

function parse(text) {
  try {
    const db = new Parser().parse(text, 'dbmlv2');
    const tables = db.schemas.flatMap((s) => s.tables).map((t) => ({ id: tid(t.schema.name, t.name), sig: t.fields.map((f) => `${f.name}:${f.type.type_name}`).join(',') }));
    const groups = db.schemas.flatMap((s) => s.tableGroups || []).map((g) => ({ name: g.name, color: g.color, tables: g.tables.map((t) => tid(t.schema?.name ?? t.schemaName, t.name)) }));
    return { tables, groups };
  } catch { return { error: true }; }
}

function withGroups(newDbml, groups) {
  const n = parse(newDbml);
  if (n.error || !groups?.length) return newDbml;
  const have = new Set(n.tables.map((t) => t.id));
  const blocks = groups.map((g) => ({ ...g, tables: g.tables.filter((id) => have.has(id)) })).filter((g) => g.tables.length).map((g) => {
    const members = g.tables.map((id) => { const [sc, ...rest] = id.split('.'); return `  ${qid(sc)}.${qid(rest.join('.'))}`; });
    return `TableGroup ${qid(g.name)}${g.color ? ` [color: ${g.color}]` : ''} {\n${members.join('\n')}\n}`;
  });
  return blocks.length ? `${newDbml.trimEnd()}\n\n${blocks.join('\n\n')}\n` : newDbml;
}

export function keepGroups(oldDbml, newDbml) {
  const o = parse(oldDbml);
  if (o.error) return newDbml;
  const have = new Set(newDbml.split('\n').map((l) => l.trim()));
  const manual = oldDbml.split('\n').filter((l) => MANUAL.test(l) && !have.has(l.trim()));
  return withGroups(manual.length ? `${newDbml.replace(/\n*$/, '\n')}\n${manual.join('\n')}\n` : newDbml, o.groups);
}

export function diffSummary(oldDbml, newDbml) {
  const o = parse(oldDbml), n = parse(newDbml);
  if (o.error || n.error) return 'schema changed';
  const om = new Map(o.tables.map((t) => [t.id, t.sig])), nm = new Map(n.tables.map((t) => [t.id, t.sig]));
  let add = 0, rem = 0, chg = 0;
  for (const [k, v] of nm) { if (!om.has(k)) add++; else if (om.get(k) !== v) chg++; }
  for (const k of om.keys()) if (!nm.has(k)) rem++;
  const parts = [add && `+${add} table(s)`, rem && `−${rem} table(s)`, chg && `${chg} changed`].filter(Boolean);
  return parts.length ? parts.join(', ') : 'indexes/relationships/comments changed';
}
