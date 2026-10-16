// @vitest-environment node
import { describe, test, expect } from 'vitest';
import { Parser } from '@dbml/core';
import { BLANK, TEMPLATES } from './templates.js';
import { buildModel, toMarkdown } from './docsModel.js';
import { parse } from './diagramModel.js';

describe('starter diagrams', () => {
  test('the blank starter parses', () => expect(new Parser().parse(BLANK, 'dbmlv2')).toBeTruthy());
  test('at least one template, unique ids, name and description present', () => {
    expect(TEMPLATES.length).toBeGreaterThan(0);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    for (const t of TEMPLATES) expect([typeof t.name, typeof t.description, typeof t.dbml]).toEqual(['string', 'string', 'string']);
  });
  test.each(TEMPLATES.map((t) => [t.id, t]))('%s parses, has tables and refs, and its documentation builds', (_id, t) => {
    const p = parse(t.dbml);
    expect(p.error, p.error).toBeUndefined();
    expect(p.tables.length).toBeGreaterThan(0);
    expect(p.refs.length).toBeGreaterThan(0);
    const db = new Parser().parse(t.dbml, 'dbmlv2');
    expect(() => toMarkdown(buildModel(db), t.name)).not.toThrow();
  });
});
