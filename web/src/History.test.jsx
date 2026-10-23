import { test, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import History from './History.jsx';

// The Compare dialog: the structural diff (server/src/schemaDiff.js) above the text diff (.specs/09)
const OLD = 'Table shop.orders {\n  id int [pk]\n  status varchar(20)\n}\nTable legacy {\n  id int\n}\n';
const NOW = 'Table shop.orders {\n  id int [pk]\n  status text [not null]\n}\nTable shop.invoices {\n  id int [pk]\n}\n';
const mockApi = (old) => vi.stubGlobal('fetch', vi.fn(async (url) => {
  const path = String(url).replace(/^\/api\//, '');
  const body = path === 'diagrams/d1/versions' ? [{ id: 7, version: 1, label: 'Release 1', author: 'Ana', summary: '', savedAt: 1, current: false }, { id: 8, version: 2, label: null, author: 'Ana', summary: '', savedAt: 2, current: true }]
    : path === 'diagrams/d1/versions/7' ? { id: 7, version: 1, dbml: old } : {};
  return { ok: true, status: 200, json: async () => body };
}));
afterEach(() => vi.unstubAllGlobals());

const compare = async (old, now = NOW) => {
  mockApi(old);
  const user = userEvent.setup({ delay: null });
  render(<History diagramId="d1" version={2} dbml={now} notify={() => {}} onRestored={() => {}} />);
  await user.click(await screen.findByRole('button', { name: 'Compare' }));
  return screen.findByRole('dialog', { name: 'Compare versions' });
};

test('the structure comes first: a summary line, then the changes grouped by table; the text diff stays below', async () => {
  const d = await compare(OLD);
  expect(within(d).getByText('1 table added, 1 table removed, 1 table changed')).toBeTruthy();
  const rows = [...d.querySelectorAll('.sdiff .dl')].map((r) => r.textContent);
  expect(rows).toEqual(['-legacy', '+shop.invoices', '~shop.orders', '~column status: type varchar(20) → text; null → not null']);
  expect(d.querySelector('.sdiff .dl.del')?.textContent).toBe('-legacy');
  expect(within(d).getByRole('heading', { name: 'Text' })).toBeTruthy();
  expect([...d.querySelectorAll('.diff .dl.add')].some((r) => r.textContent.includes('Table shop.invoices'))).toBe(true);
});

test('an old version that does not parse: the structure is not compared, the text diff is shown', async () => {
  const d = await compare('Table broken {\n  id int [pk\n}\n');
  expect(within(d).getByText('The structure is not compared: Release 1 has DBML errors.')).toBeTruthy();
  expect(d.querySelectorAll('.sdiff .dl')).toHaveLength(0);
  expect(d.querySelectorAll('.diff .dl.add').length).toBeGreaterThan(0);
});

test('only text that is not structure changed: the dialog says so', async () => {
  const d = await compare(NOW.replace('Table shop.invoices', '// a comment\nTable shop.invoices'));
  expect(within(d).getByText('No structural change')).toBeTruthy();
});

test('a very large diff shows the first 300 lines and how many more there are', async () => {
  const many = Array.from({ length: 320 }, (_, i) => `Table t${String(i).padStart(3, '0')} {\n  id int\n}`).join('\n');
  const d = await compare('Table a {\n  id int\n}\n', many);
  expect(d.querySelectorAll('.sdiff .dl')).toHaveLength(300);
  expect(within(d).getByText('…and 21 more')).toBeTruthy(); // 320 added + 1 removed
});
