// Optional daily backup: BACKUP_DIR set = one copy of the database per day (VACUUM INTO, safe while the app runs), named
// opendiagram-YYYYMMDD.db, the ones older than BACKUP_KEEP_DAYS (default 7) deleted. Run by the daily housekeeping of index.js.
// A copy in the data volume survives a bug or a bad restore, not a lost disk: the Hosting page shows how to copy them off the host.
import { mkdirSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { db } from './db.js';

const NAME = /^opendiagram-(\d{8})\.db$/;
const day = (d) => d.toISOString().slice(0, 10).replaceAll('-', '');

// the folder, or null when backups are off; a relative path is inside DATA_DIR (the only writable place in the container)
export const backupDir = (env = process.env) => (env.BACKUP_DIR ? (isAbsolute(env.BACKUP_DIR) ? env.BACKUP_DIR : join(env.DATA_DIR || './data', env.BACKUP_DIR)) : null);

export function dailyBackup(dir, keepDays = 7, now = new Date()) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `opendiagram-${day(now)}.db`);
  const made = existsSync(file) ? null : (db.prepare('vacuum into ?').run(file), file);
  const oldest = day(new Date(now.getTime() - keepDays * 24 * 3600 * 1000));
  const removed = readdirSync(dir).filter((f) => NAME.exec(f)?.[1] < oldest).sort();
  for (const f of removed) unlinkSync(join(dir, f));
  return { made, removed };
}
