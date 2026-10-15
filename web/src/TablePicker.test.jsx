import { describe, test, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TablePicker, { matcher, tableMatcher } from './TablePicker.jsx';

const items = ['shop.customers', 'shop.orders', 'shop.items', 'shop.vw_totals', 'audit.log', 'audit.mv_daily'].map((name) => ({ name, view: /\.(vw|mv)_/.test(name) }));
const setup = (props = {}) => {
  const onApply = vi.fn(), onClose = vi.fn();
  render(<TablePicker items={items} selected={[]} groups={[]} onApply={onApply} onClose={onClose} {...props} />);
  return { onApply, onClose, user: userEvent.setup() };
};
const card = (name) => screen.getByTitle(name).querySelector('input'); // Tables tab card: title = schema.table
const footer = () => document.querySelector('.tp-foot .hint').textContent;
const useBtn = () => screen.getByRole('button', { name: /^Use / });

describe('matcher', () => {
  test('plain text = contains, case-insensitive', () => {
    const m = matcher('ORD');
    expect(m('shop.orders')).toBe(true);
    expect(m('shop.items')).toBe(false);
  });
  test('wildcards * and ? are anchored and also match the bare table name', () => {
    expect(matcher('vw_*')('shop.vw_totals')).toBe(true);
    expect(matcher('vw_*')('shop.x_vw_totals')).toBe(false);
    expect(matcher('log_??')('audit.log_ab')).toBe(true);
    expect(matcher('log_??')('audit.log_abc')).toBe(false);
  });
  test('regex between slashes; an incomplete regex matches nothing instead of throwing', () => {
    expect(matcher('/^shop\\.o/')('shop.orders')).toBe(true);
    expect(matcher('/(/')('shop.orders')).toBe(false);
  });
  test('regex metacharacters in a wildcard are literal', () => {
    expect(matcher('a.b*')('x.a.b1')).toBe(true);
    expect(matcher('a.b*')('x.axb1')).toBe(false);
  });
  test('empty search matches everything', () => expect(matcher('  ')('anything')).toBe(true));
  test('tableMatcher also matches a column name or the group name', () => {
    const t = { schema: 's', name: 'users', fields: [{ name: 'email' }] };
    expect(tableMatcher('email')(t)).toBe(true);
    expect(tableMatcher('crm')({ ...t, fields: [] }, 'CRM core')).toBe(true);
    expect(tableMatcher('zzz')(t)).toBe(false);
  });
});

describe('TablePicker import selection', () => {
  test('nothing ticked = import all (apply sends an empty list)', async () => {
    const { onApply, user } = setup();
    expect(footer()).toBe('Nothing selected = import all 6');
    await user.click(useBtn());
    expect(onApply).toHaveBeenCalledWith({ tables: [], groups: [], ddl: false });
  });
  test('ticked tables are sent and counted', async () => {
    const { onApply, user } = setup();
    await user.click(card('shop.orders'));
    await user.click(card('audit.log'));
    expect(footer()).toBe('2 selected of 6');
    await user.click(screen.getByRole('button', { name: 'Use 2 table(s)' }));
    expect(onApply.mock.calls[0][0].tables.sort()).toEqual(['audit.log', 'shop.orders']);
  });
  test('Select shown honours the search, Clear all empties', async () => {
    const { user } = setup();
    await user.type(screen.getAllByPlaceholderText(/Search/)[0], 'shop.');
    await user.click(screen.getByText(/Select shown \(4\)/));
    expect(footer()).toBe('4 selected of 6');
    await user.click(screen.getByText('Clear all'));
    expect(footer()).toBe('Nothing selected = import all 6');
  });
  test('kind filter: views only', async () => {
    const { user } = setup();
    await user.selectOptions(screen.getByDisplayValue('Tables and views'), 'view');
    expect(document.querySelectorAll('.tp-list .tp-card')).toHaveLength(2);
  });
  test('Escape closes only the picker', async () => {
    const { onClose, user } = setup();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('TablePicker groups (regression: grouped tables count as selected)', () => {
  const makeGroup = async (user, name, tables) => {
    await user.click(screen.getByRole('button', { name: /^Groups/ }));
    await user.type(screen.getByPlaceholderText('Group name'), name);
    const chooser = document.querySelector('.tp-new .tp-chlist');
    for (const t of tables) await user.click(within(chooser).getByText(t.split('.')[1]).closest('label').querySelector('input'));
    await user.click(screen.getByRole('button', { name: /^Create group/ }));
  };
  test('creating a group ticks its tables: the footer counts them and apply imports just those, not all', async () => {
    const { onApply, user } = setup();
    await makeGroup(user, 'Sales', ['shop.customers', 'shop.orders']);
    expect(footer()).toBe('2 selected of 6 · 1 group(s)');
    await user.click(screen.getByRole('button', { name: 'Use 2 table(s)' }));
    const arg = onApply.mock.calls[0][0];
    expect(arg.tables.sort()).toEqual(['shop.customers', 'shop.orders']);
    expect(arg.groups).toEqual([expect.objectContaining({ name: 'Sales', tables: ['shop.customers', 'shop.orders'] })]);
  });
  test('a table lives in one group: a second group takes it over', async () => {
    const { onApply, user } = setup();
    await makeGroup(user, 'A', ['shop.customers', 'shop.orders']);
    await makeGroup(user, 'B', ['shop.orders']);
    await user.click(useBtn());
    const g = Object.fromEntries(onApply.mock.calls[0][0].groups.map((x) => [x.name, x.tables]));
    expect(g).toEqual({ A: ['shop.customers'], B: ['shop.orders'] });
  });
  test('a duplicate group name is refused', async () => {
    const { user } = setup();
    await makeGroup(user, 'A', ['shop.customers']);
    await user.type(screen.getByPlaceholderText('Group name'), 'A');
    expect(screen.getByRole('button', { name: /^Create group/ }).disabled).toBe(true);
    expect(screen.getByText('A group with this name already exists.')).toBeTruthy();
  });
  test('groups from the diagram: empty ones vanish; tables of a group count when nothing else is ticked', async () => {
    const { onApply, user } = setup({ groups: [{ name: 'Empty', color: '#111111', tables: [] }, { name: 'Ok', color: '#222222', tables: ['shop.items'] }] });
    await user.click(useBtn());
    expect(onApply.mock.calls[0][0].groups.map((g) => g.name)).toEqual(['Ok']);
  });
  test('apply: with a ticked table the grouped tables are imported too', async () => {
    const { onApply, user } = setup({ selected: ['shop.orders'], groups: [{ name: 'Ok', color: '#222222', tables: ['shop.items', 'gone.table'] }] });
    await user.click(useBtn());
    expect(onApply.mock.calls[0][0].tables.sort()).toEqual(['shop.items', 'shop.orders']); // gone.table is not in this import
  });
  test('duplicate names across groups are made unique on apply', async () => {
    const { onApply, user } = setup({ groups: [{ name: 'G', color: '#111111', tables: ['shop.items'] }, { name: 'G', color: '#222222', tables: ['shop.orders'] }] });
    await user.click(useBtn());
    expect(onApply.mock.calls[0][0].groups.map((g) => g.name)).toEqual(['G', 'G 2']);
  });
});

describe('TablePicker Full DDL', () => {
  test('default off; the value travels in onApply', async () => {
    const { onApply, user } = setup();
    const box = screen.getByLabelText('Full DDL of views');
    expect(box.checked).toBe(false);
    await user.click(box);
    await user.click(useBtn());
    expect(onApply.mock.calls[0][0].ddl).toBe(true);
  });
  test('initial ddl prop is honoured', () => {
    setup({ ddl: true });
    expect(screen.getByLabelText('Full DDL of views').checked).toBe(true);
  });
  test('no views = no checkbox', () => {
    setup({ items: items.filter((i) => !i.view) });
    expect(screen.queryByLabelText('Full DDL of views')).toBeNull();
  });
});
