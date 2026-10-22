// Optional daily backup (BACKUP_DIR): a copy of the database per day, the old ones deleted (.specs/15-audit-2026-10-22.md, O1)
import './env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createUser } from '../src/auth.js';
import { dailyBackup, backupDir } from '../src/backup.js';

await createUser({ email: 'ana@example.com', password: 'long-enough-pass', name: 'Ana' });

test('one copy per day, named by the day, a complete database that opens on its own; a second run the same day does nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-backup-'));
  const r = dailyBackup(dir, 7, new Date('2026-10-22T03:00:00Z'));
  assert.equal(r.made, join(dir, 'opendiagram-20261022.db'));
  const copy = new DatabaseSync(r.made, { readOnly: true });
  assert.equal(copy.prepare('select count(*) n from users').get().n, 1);
  copy.close();
  assert.equal(dailyBackup(dir, 7, new Date('2026-10-22T20:00:00Z')).made, null);
});

test('copies older than the kept days are deleted; other files in the folder are left alone', () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-backup-'));
  for (const f of ['opendiagram-20261010.db', 'opendiagram-20261015.db', 'opendiagram-20261020.db', 'notes.txt', 'opendiagram-old.db']) writeFileSync(join(dir, f), 'x');
  const r = dailyBackup(dir, 7, new Date('2026-10-22T03:00:00Z'));
  assert.deepEqual(r.removed, ['opendiagram-20261010.db']);
  assert.deepEqual(readdirSync(dir).sort(), ['notes.txt', 'opendiagram-20261015.db', 'opendiagram-20261020.db', 'opendiagram-20261022.db', 'opendiagram-old.db']);
});

test('the folder: off unless set; a relative path is inside DATA_DIR (the only writable place in the container)', () => {
  assert.equal(backupDir({}), null);
  assert.equal(backupDir({ BACKUP_DIR: '/data/backups' }), '/data/backups');
  assert.equal(backupDir({ BACKUP_DIR: 'backups', DATA_DIR: '/data' }), join('/data', 'backups'));
});
