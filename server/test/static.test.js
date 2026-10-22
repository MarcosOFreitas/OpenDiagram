// The built UI: hashed files under /assets are cached for a year and served pre-compressed; index.html is always revalidated.
import './env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';

const pub = mkdtempSync(join(tmpdir(), 'opendiagram-public-'));
mkdirSync(join(pub, 'assets'));
const js = 'console.log("app");'.repeat(100);
writeFileSync(join(pub, 'index.html'), '<!doctype html><title>OpenDiagram</title>');
writeFileSync(join(pub, 'assets', 'App-abc123.js'), js);
writeFileSync(join(pub, 'assets', 'App-abc123.js.br'), brotliCompressSync(js));
writeFileSync(join(pub, 'assets', 'App-abc123.js.gz'), gzipSync(js));
process.env.OD_PUBLIC_DIR = pub;
process.env.OD_NO_LISTEN = '1';
const { app } = await import('../src/index.js');
const get = (url, headers = {}) => app.inject({ method: 'GET', url, headers });

test('a hashed asset is cached for a year, as immutable', async () => {
  const r = await get('/assets/App-abc123.js');
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['cache-control'], 'public, max-age=31536000, immutable');
});

test('a hashed asset is sent pre-compressed: brotli first, then gzip, plain without Accept-Encoding', async () => {
  const br = await get('/assets/App-abc123.js', { 'accept-encoding': 'gzip, deflate, br' });
  assert.equal(br.headers['content-encoding'], 'br');
  assert.match(br.headers['content-type'], /javascript/);
  assert.match(br.headers.vary, /accept-encoding/i);
  const gz = await get('/assets/App-abc123.js', { 'accept-encoding': 'gzip' });
  assert.equal(gz.headers['content-encoding'], 'gzip');
  const plain = await get('/assets/App-abc123.js', { 'accept-encoding': 'identity' });
  assert.equal(plain.headers['content-encoding'], undefined);
  assert.equal(plain.body, js);
  assert.equal(plain.headers['cache-control'], 'public, max-age=31536000, immutable');
});

test('index.html is revalidated on every load, also through the SPA fallback', async () => {
  for (const url of ['/', '/index.html', '/s/some-share-token']) {
    const r = await get(url, { 'accept-encoding': 'br' });
    assert.equal(r.statusCode, 200, url);
    assert.equal(r.headers['cache-control'], 'no-cache', url);
  }
});
