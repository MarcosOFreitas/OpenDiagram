// Import this FIRST in a test that touches the database: it points DATA_DIR at a throw-away folder (db.js opens it at import time)
// and fixes APP_SECRET. Every test file runs in its own process, so each gets its own empty database.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'opendiagram-test-'));
process.env.APP_SECRET = 'unit-test-secret-0000000000000000';
