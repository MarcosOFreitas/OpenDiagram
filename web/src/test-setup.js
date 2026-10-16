import { afterEach } from 'vitest';

// Node 25+ ships its own global `localStorage` (unusable without --localstorage-file) that hides jsdom's: put jsdom's back
if (globalThis.jsdom && typeof globalThis.localStorage?.clear !== "function") for (const k of ['localStorage', 'sessionStorage']) Object.defineProperty(globalThis, k, { value: globalThis.jsdom.window[k], configurable: true });

// tests of plain modules run in the `node` environment (`// @vitest-environment node` on top of the file): no DOM, nothing to clean up, and React is not even loaded
if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');
  afterEach(cleanup);
}
