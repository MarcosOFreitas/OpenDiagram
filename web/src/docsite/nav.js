// User pages live in ./pages/*.md; the developer pages are docs/*.md and tools/README.md at the repository root, the same files GitHub
// shows (the first "# " line is the title). This file only orders them.
const raw = {
  ...import.meta.glob('./pages/*.md', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../../../docs/*.md', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../../../tools/README.md', { query: '?raw', import: 'default', eager: true }),
};
// `file`: where the page lives in the repository, for its relative links
const fileOf = (path) => (path.startsWith('./') ? `web/src/docsite/${path.slice(2)}` : path.replace(/^(\.\.\/)+/, ''));

export const PAGES = Object.fromEntries(Object.entries(raw).map(([path, text]) => {
  const slug = path.endsWith('tools/README.md') ? 'tools' : path.replace(/^.*\/(.+)\.md$/, '$1');
  return [slug, { slug, file: fileOf(path), title: /^# (.+)$/m.exec(text)?.[1] || slug, text }];
}));

// a link as a page writes it -> where it goes on this site. The developer pages link the way GitHub wants (`releasing.md`,
// `../tools/README.md`); a link to another file of the repository (a spec, AGENTS.md) has no page here: null, shown as text
export function docsHref(u) {
  if (/^(https?:|mailto:|#|\/)/.test(u)) return u;
  const [path, hash] = u.split('#');
  const slug = path === '../tools/README.md' ? 'tools' : path.replace(/\.md$/, '');
  return PAGES[slug] ? `/docs/${slug}${hash ? `#${hash}` : ''}` : null;
}

// a string = a page, { title, items } = a collapsible section
export const NAV = [
  'introduction',
  'getting-started',
  { title: 'Syntax', items: ['dbml', 'relationships', 'enums-indexes-schemas'] },
  { title: 'Database import', items: ['database-import', 'shared-connections', 'database-security'] },
  { title: 'Working with diagrams', items: ['diagram-basics', 'tables-panel-and-views', 'arrange', 'table-groups', 'data-lineage'] },
  'generated-documentation',
  'import-export',
  { title: 'Sharing & collaboration', items: ['accounts-and-sharing', 'share-links', 'versions-and-history', 'connect-claude-mcp'] },
  'administration',
  'self-hosting',
  'hosting-requirements',
  'shortcuts-faq',
  'license',
  'release-notes',
  { title: 'For developers', items: ['developers', 'development', 'tools', 'releasing', 'forking', 'history'] },
];

export const ORDER = NAV.flatMap((n) => (typeof n === 'string' ? [n] : n.items)).filter((s) => PAGES[s]);
