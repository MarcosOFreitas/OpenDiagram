// After the build: write .br and .gz next to every text file, so the server sends them as they are (@fastify/static preCompressed).
// Images are already compressed; files under 1 KB are not worth a second request path.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';

const br = promisify(brotliCompress), gz = promisify(gzip);
const TEXT = /\.(js|css|html|svg|json|md|txt)$/;

export async function precompress(dir) {
  const files = (await readdir(dir, { recursive: true })).filter((f) => TEXT.test(f));
  await Promise.all(files.map(async (f) => {
    const path = join(dir, f), data = await readFile(path);
    if (data.length < 1024) return;
    await Promise.all([
      br(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: data.length } }).then((b) => writeFile(path + '.br', b)),
      gz(data, { level: 9 }).then((b) => writeFile(path + '.gz', b)),
    ]);
  }));
}

// Vite plugin: runs once the bundle is on disk
export function precompressPlugin() {
  let out;
  return { name: 'precompress', apply: 'build', configResolved: (c) => { out = resolve(c.root, c.build.outDir); }, closeBundle: () => precompress(out) };
}
