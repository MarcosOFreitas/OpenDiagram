// Documentation pages live in ./pages/*.md (the first "# " line is the title); this file only orders them.
const raw = import.meta.glob('./pages/*.md', { query: '?raw', import: 'default', eager: true });

export const PAGES = Object.fromEntries(Object.entries(raw).map(([path, text]) => {
  const slug = path.replace(/^.*\/(.+)\.md$/, '$1');
  return [slug, { slug, title: /^# (.+)$/m.exec(text)?.[1] || slug, text }];
}));

// a string = a page, { title, items } = a collapsible section
export const NAV = [
  'introduction',
  'getting-started',
  { title: 'Syntax', items: ['dbml', 'relationships', 'enums-indexes-schemas'] },
  { title: 'Database import', items: ['database-import', 'database-security'] },
  { title: 'Working with diagrams', items: ['diagram-basics', 'tables-panel-and-views', 'arrange', 'table-groups', 'data-lineage'] },
  'generated-documentation',
  'import-export',
  { title: 'Sharing & collaboration', items: ['accounts-and-sharing', 'share-links', 'versions-and-history'] },
  'administration',
  'self-hosting',
  'shortcuts-faq',
  'release-notes',
];

export const ORDER = NAV.flatMap((n) => (typeof n === 'string' ? [n] : n.items)).filter((s) => PAGES[s]);
