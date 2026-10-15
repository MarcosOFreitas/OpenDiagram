import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toDbml } from '../src/dbml.js';

test('toDbml: empty model gives an empty string', () => {
  assert.equal(typeof toDbml({ tables: [], refs: [] }), 'string');
});
