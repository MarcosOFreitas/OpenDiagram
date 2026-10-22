// @vitest-environment node
// What the Import drawer relies on from @dbml/core, pinned so a library upgrade that breaks it fails here (see .specs/04-formats.md).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { importer, Parser } from '@dbml/core';

const tables = (dbml) => new Parser().parse(dbml, 'dbmlv2').schemas.flatMap((s) => s.tables);

describe('Oracle SQL import', () => {
  // the DDL statements of the demo schema (the file is a SQL*Plus script: its `connect` lines and system grants are not plain DDL)
  const ddl = (readFileSync(new URL('../../demo/oracle.sql', import.meta.url), 'utf8').match(/(create table|alter table|create (unique )?index|comment on)[\s\S]*?;/gi) || []).join('\n');

  it('reads tables, keys, indexes and comments', () => {
    const t = tables(importer.import(ddl, 'oracle'));
    expect(t.map((x) => x.name).sort()).toEqual(['customers', 'order_items', 'orders', 'tickets']);
    expect(t.reduce((n, x) => n + x.indexes.length, 0)).toBeGreaterThan(0);
    expect(t.some((x) => x.note)).toBe(true);
  });

  it('skips views, sequences and triggers, and fails on SQL*Plus commands (the hint in the Import drawer says both)', () => {
    const extra = [
      'create view v as select id from customers;',
      'create sequence s start with 1;',
      'create or replace trigger trg before insert on customers for each row begin :new.id := 1; end;',
      '/',
    ].join('\n');
    expect(tables(importer.import(`${ddl}\n${extra}`, 'oracle'))).toHaveLength(4);
    expect(() => importer.import(`connect shop/shop\n${ddl}`, 'oracle')).toThrow();
  });
});
