import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { outDir: '../server/public', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:3000' } },
  test: { environment: 'jsdom', include: ['src/**/*.test.{js,jsx}'], setupFiles: ['./src/test-setup.js'] },
});
