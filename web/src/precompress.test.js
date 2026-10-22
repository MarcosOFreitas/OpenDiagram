// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { precompress } from '../precompress.js';

describe('precompress', () => {
  it('writes .br and .gz next to text files that are worth it, and leaves images and tiny files alone', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'od-precompress-'));
    mkdirSync(join(dir, 'assets'));
    const js = 'export const a = 1;\n'.repeat(500);
    writeFileSync(join(dir, 'assets', 'App-x.js'), js);
    writeFileSync(join(dir, 'index.html'), '<!doctype html>' + '<p>x</p>'.repeat(200));
    writeFileSync(join(dir, 'assets', 'tiny.css'), 'a{}');
    writeFileSync(join(dir, 'assets', 'shot.jpg'), Buffer.alloc(5000));
    await precompress(dir);
    expect(brotliDecompressSync(readFileSync(join(dir, 'assets', 'App-x.js.br'))).toString()).toBe(js);
    expect(gunzipSync(readFileSync(join(dir, 'assets', 'App-x.js.gz'))).toString()).toBe(js);
    expect(existsSync(join(dir, 'index.html.br'))).toBe(true);
    expect(existsSync(join(dir, 'assets', 'tiny.css.br'))).toBe(false);
    expect(existsSync(join(dir, 'assets', 'shot.jpg.br'))).toBe(false);
  });
});
