import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Library, { pickDiagrams } from './Library.jsx';

const diagrams = [
  { id: 'a', title: 'Orders', role: 'owner', updatedAt: 1, shares: 2 },
  { id: 'b', title: 'Inventory', role: 'owner', updatedAt: 1 },
  { id: 'c', title: 'Billing', role: 'edit', ownerName: 'Ana', updatedAt: 1 },
  { id: 'd', title: 'Audit', role: 'admin', ownerName: 'Bia', updatedAt: 1 },
];
const templates = [{ id: 't1', name: 'Online store', description: 'sample' }];
const setup = (props = {}) => {
  const fns = { onOpen: vi.fn(), onCreate: vi.fn(), onDelete: vi.fn() };
  render(<Library diagrams={diagrams} currentId="a" isAdmin templates={templates} {...fns} {...props} />);
  return { ...fns, user: userEvent.setup({ delay: null }) };
};

describe('Library: keyboard and screen readers', () => {
  test('every diagram and template opens from the keyboard (Tab to it, Enter)', async () => {
    const { user, onOpen, onCreate } = setup();
    await user.tab(); await user.tab(); // "New blank diagram", then the first template
    expect(document.activeElement.textContent).toMatch(/Online store/);
    await user.keyboard('{Enter}');
    expect(onCreate).toHaveBeenCalledWith('t1');
    await user.click(screen.getByRole('button', { name: /^Inventory/ }));
    expect(onOpen).toHaveBeenCalledWith('b');
    screen.getByRole('button', { name: /^Inventory/ }).focus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledTimes(2); // a click and a key press each open once, never twice
  });

  test('delete buttons say which diagram they delete, and deleting asks in the card first', async () => {
    const { user, onDelete } = setup();
    expect(screen.getAllByRole('button', { name: /^Delete / }).map((b) => b.getAttribute('aria-label'))).toEqual(['Delete Orders', 'Delete Inventory', 'Delete Audit']);
    await user.click(screen.getByRole('button', { name: 'Delete Inventory' }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(document.activeElement.textContent).toBe('Cancel'); // the safe choice has the focus
    await user.keyboard('{Enter}');
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete Inventory' }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete Inventory' }));
    expect(onDelete).toHaveBeenCalledWith(diagrams[1]);
  });

  test('the open diagram is marked for assistive tech and in words, not only by color', () => {
    setup();
    expect(screen.getByRole('button', { name: /^Orders/ }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('button', { name: /^Inventory/ }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('button', { name: /^Orders/ }).textContent).toMatch(/Open now/);
  });
});

describe('Library: finding a diagram', () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, title: `Model ${String.fromCharCode(74 - i)}`, role: 'owner', updatedAt: i, linked: i % 2 === 0 }));

  test('pickDiagrams: search by title or owner, newest first or by name, only the ones linked to a database', () => {
    const list = [...diagrams, { id: 'e', title: 'orders archive', role: 'owner', updatedAt: 5, linked: true }];
    expect(pickDiagrams(list, { q: 'ORDERS' }).map((d) => d.id)).toEqual(['e', 'a']);
    expect(pickDiagrams(list, { q: 'ana' }).map((d) => d.id)).toEqual(['c']);
    expect(pickDiagrams(list, { sort: 'name' }).map((d) => d.title)).toEqual(['Audit', 'Billing', 'Inventory', 'Orders', 'orders archive']);
    expect(pickDiagrams(list, { linked: true }).map((d) => d.id)).toEqual(['e']);
  });

  test('the search shows once there are more than 8 diagrams, and says when nothing matches', async () => {
    const { user } = setup({ diagrams: many });
    const box = screen.getByRole('searchbox', { name: 'Search diagrams' });
    await user.type(box, 'model j');
    expect(screen.getAllByRole('button', { name: /^Model / }).map((b) => b.textContent)).toEqual([expect.stringMatching(/^Model J/)]);
    await user.clear(box); await user.type(box, 'zzz');
    expect(screen.getByText('No diagram matches.')).toBeTruthy();
  });

  test('few diagrams: no search box', () => {
    setup();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });
});

describe('Library: "changed since you last opened it" (.specs/14, item 9)', () => {
  test('people who can edit see the latest change and how many there are; the others see the badge alone; nothing new, nothing shown', () => {
    const at = Math.floor(Date.now() / 1000) - 7200;
    setup({ diagrams: [
      { id: 'a', title: 'Orders', role: 'owner', updatedAt: at, unseen: true, lastChange: { summary: 'Refresh from database: 1 table added', author: 'Scheduled refresh', at, count: 3 } },
      { id: 'b', title: 'Billing', role: 'edit', ownerName: 'Ana', updatedAt: at, unseen: true, lastChange: { summary: 'added c; +1 / -0 lines', author: 'Ana', at, count: 1 } },
      { id: 'c', title: 'Audit', role: 'view', ownerName: 'Ana', updatedAt: at, unseen: true },
      { id: 'd', title: 'Stock', role: 'owner', updatedAt: at, unseen: false },
    ] });
    const card = (name) => screen.getByRole('button', { name: new RegExp(`^${name}`) }).textContent;
    expect(card('Orders')).toMatch(/Changed since you last opened it \(3\) Refresh from database: 1 table added · Scheduled refresh · 2 h ago$/);
    expect(card('Billing')).toMatch(/Changed since you last opened it added c; \+1 \/ -0 lines · Ana · 2 h ago$/); // one change: no count
    expect(card('Audit')).toMatch(/Changed since you last opened it$/);
    expect(card('Stock')).not.toMatch(/Changed/);
  });
});
