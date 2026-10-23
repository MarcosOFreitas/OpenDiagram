// @vitest-environment node
import { test, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PAGES, NAV, ORDER, docsHref } from './nav.js';

// The documentation site: the user pages (./pages), the developer pages (docs/ and tools/README.md at the repository root, the same files
// GitHub shows) and every link between them. A developer page links the way GitHub wants (`releasing.md`, `../tools/README.md`); the site
// maps that to its own page; a link to another file of the repository is shown as text on the site.
const ROOT = new URL('../../../', import.meta.url);
const links = (text) => [...text.matchAll(/(?<!!)\[[^\]]+\]\(([^)\s]+)\)/g)].map((m) => m[1]);

test('every page of the navigation exists, and the developer pages are part of it', () => {
  for (const s of NAV.flatMap((n) => (typeof n === 'string' ? [n] : n.items))) expect(PAGES[s], s).toBeTruthy();
  expect(NAV.find((n) => n.title === 'For developers')?.items).toEqual(['developers', 'development', 'tools', 'releasing', 'forking', 'history']);
  expect(ORDER.length).toBe(Object.keys(PAGES).length); // no page outside the navigation
});

test('GitHub-style links of the developer pages go to the site\'s own pages; other repository files are not links', () => {
  expect(docsHref('releasing.md')).toBe('/docs/releasing');
  expect(docsHref('../tools/README.md')).toBe('/docs/tools');
  expect(docsHref('self-hosting#backup-and-moving-to-another-machine')).toBe('/docs/self-hosting#backup-and-moving-to-another-machine');
  expect(docsHref('https://example.com/x')).toBe('https://example.com/x');
  expect(docsHref('../.specs/04-formats.md')).toBe(null);
});

test('every link of every page resolves: to a page of the site, outside, or to a file that exists in the repository', () => {
  const bad = [];
  for (const [slug, { text, file }] of Object.entries(PAGES)) {
    for (const u of links(text)) {
      if (docsHref(u)) continue;
      const target = new URL(u.split('#')[0], new URL(file, ROOT));
      if (!u.startsWith('../') || !existsSync(fileURLToPath(target))) bad.push(`${slug}: ${u}`);
    }
  }
  expect(bad).toEqual([]);
});
