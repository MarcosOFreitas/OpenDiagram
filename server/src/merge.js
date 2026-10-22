// What a metadata refresh keeps of the existing diagram text (TableGroups, hand-written lineage) and the one-line summary of what changed.
// keepGroups/withGroups mirror web/src/diagramModel.js (the browser's manual refresh): server/test/merge.test.js and web/src/diagramModel.test.js run the same cases.
// The DBML parse (dbmlParse.js, a few MB of memory once loaded) is needed only by a refresh or an MCP save: it is loaded on first use.
import { schemaDiff, summaryLine } from './schemaDiff.js';

let parseDbml;
export const loadParser = async () => { parseDbml ??= (await import('./dbmlParse.js')).parseDbml; };
const parser = () => { if (!parseDbml) throw new Error('merge.js: await loadParser() first'); return parseDbml; };

const MANUAL = /^\s*\/\/\s*lineage:/i; // by hand (not `(auto)`)
const tid = (schema, name) => `${schema || 'public'}.${name}`;
const qid = (x) => (/^[A-Za-z_]\w*$/.test(x) ? x : `"${x.replaceAll('"', '\\"')}"`);

function parse(text) {
  const p = parser();
  try {
    const db = p(text);
    const tables = db.schemas.flatMap((s) => s.tables).map((t) => ({ id: tid(t.schema.name, t.name) }));
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

// null when the text is valid DBML, otherwise the first problem ("line N: message")
export function validDbml(text) {
  const p = parser();
  try { p(text); return null; } catch (e) { const d = e?.diags?.[0]; return d ? `line ${d.location?.start?.line ?? 1}: ${d.message}` : String(e?.message ?? 'syntax error').split('\n')[0].slice(0, 200); }
}

export function keepGroups(oldDbml, newDbml) {
  const o = parse(oldDbml);
  if (o.error) return newDbml;
  const have = new Set(newDbml.split('\n').map((l) => l.trim()));
  const manual = oldDbml.split('\n').filter((l) => MANUAL.test(l) && !have.has(l.trim()));
  return withGroups(manual.length ? `${newDbml.replace(/\n*$/, '\n')}\n${manual.join('\n')}\n` : newDbml, o.groups);
}

// what a refresh changed in the structure, in the words of History -> Compare ("1 table added, 2 tables changed"); null when nothing
// structural changed or a side does not parse. A person can send a refresh save of 2 MB: past MAX_PARSE the line summary is enough.
const MAX_PARSE = 500_000;
export function structural(oldDbml, newDbml) {
  const p = parser();
  if (oldDbml.length > MAX_PARSE || newDbml.length > MAX_PARSE) return null;
  try {
    const changes = schemaDiff(p(oldDbml), p(newDbml));
    return changes.length ? summaryLine(changes) : null;
  } catch { return null; } // a save must never fail for its summary: the line summary then
}
