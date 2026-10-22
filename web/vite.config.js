import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { precompressPlugin } from './precompress.js';

export default defineConfig({
  plugins: [react(), precompressPlugin()],
  // @dbml/core exports only its entry point, whose Parser pulls in every SQL parser: src/dbmlParse.js reads two inner modules through this
  resolve: { alias: { '@dbml-core-lib': fileURLToPath(new URL('./node_modules/@dbml/core/lib', import.meta.url)) } },
  build: { outDir: '../server/public', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:3000' }, fs: { allow: ['..'] } }, // History imports server/src/schemaDiff.js (one module for both sides)
  test: { environment: 'jsdom', include: ['src/**/*.test.{js,jsx}'], setupFiles: ['./src/test-setup.js'] },
});
