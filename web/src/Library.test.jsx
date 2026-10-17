import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Library from './Library.jsx';

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

  test('delete buttons say which diagram they delete', async () => {
    const { user, onDelete } = setup();
    expect(screen.getAllByRole('button', { name: /^Delete / }).map((b) => b.getAttribute('aria-label'))).toEqual(['Delete Orders', 'Delete Inventory', 'Delete Audit']);
    await user.click(screen.getByRole('button', { name: 'Delete Inventory' }));
    expect(onDelete).toHaveBeenCalledWith(diagrams[1]);
  });

  test('the open diagram is marked for assistive tech and in words, not only by color', () => {
    setup();
    expect(screen.getByRole('button', { name: /^Orders/ }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('button', { name: /^Inventory/ }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('button', { name: /^Orders/ }).textContent).toMatch(/Open now/);
  });
});
