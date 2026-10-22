// @vitest-environment node
import { test, expect } from 'vitest';
import { Parser, ModelExporter } from '@dbml/core';
import { parseDbml } from './dbmlParse.js';
import { TEMPLATES } from './templates.js';

// parseDbml must give what @dbml/core's own Parser gives for 'dbmlv2', without loading the SQL parsers (.specs/15-audit-2026-10-22.md, P1)
const viaCore = (t) => new Parser().parse(t, 'dbmlv2');
const asJson = (db) => ModelExporter.export(db, 'json', false);

test('the same database for every starter template and a diagram with groups, notes, enums, checks and lineage comments', () => {
  const extra = "Table s.a [note: 'A'] {\n  id int [pk, increment]\n  k text [check: `k <> ''`]\n\n  checks {\n    `id > 0` [name: 'pos']\n  }\n}\nTable s.b {\n  a_id int [ref: > s.a.id]\n}\nTableGroup g [color: #3498DB] {\n  s.a\n}\nEnum s.e {\n  x\n  y\n}\nNote n {\n  'sticky'\n}\n// lineage: s.b <- s.a\n";
  for (const text of [...TEMPLATES.map((t) => t.dbml), extra]) expect(asJson(parseDbml(text))).toBe(asJson(viaCore(text)));
});

test('the same errors (CompilerError with diags) for DBML that does not parse', () => {
  const bad = 'Table a {\n  id int [pk\n}\nRef: a.x > b.y\n';
  const mine = (() => { try { parseDbml(bad); } catch (e) { return e; } })(), theirs = (() => { try { viaCore(bad); } catch (e) { return e; } })();
  expect(mine?.diags?.length).toBeGreaterThan(0);
  expect(mine.diags).toEqual(theirs.diags);
});
