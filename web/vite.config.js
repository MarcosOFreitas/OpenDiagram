import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { precompressPlugin } from './precompress.js';

export default defineConfig({
  plugins: [react(), precompressPlugin()],
  build: { outDir: '../server/public', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:3000' }, fs: { allow: ['..'] } }, // History imports server/src/schemaDiff.js (one module for both sides)
  test: { environment: 'jsdom', include: ['src/**/*.test.{js,jsx}'], setupFiles: ['./src/test-setup.js'] },
});
