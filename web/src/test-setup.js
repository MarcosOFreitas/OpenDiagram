import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Node 25+ ships its own global `localStorage` (unusable without --localstorage-file) that hides jsdom's: put jsdom's back
if (typeof localStorage?.clear !== 'function' && globalThis.jsdom) for (const k of ['localStorage', 'sessionStorage']) Object.defineProperty(globalThis, k, { value: globalThis.jsdom.window[k], configurable: true });

afterEach(cleanup);
