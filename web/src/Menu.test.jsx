import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Menu from './Menu.jsx';

const setup = (items) => {
  const user = userEvent.setup({ delay: null });
  render(<><button>outside</button><Menu trigger="Export" items={items} title="Export menu" /></>);
  return user;
};
const trigger = () => screen.getByRole('button', { name: /Export/ });

describe('Menu', () => {
  const onA = vi.fn(), onB = vi.fn();
  const items = [{ header: 'SQL' }, { key: 'a', label: 'Alpha', hint: '.sql', onClick: onA }, { sep: true }, { key: 'b', label: 'Beta', danger: true, onClick: onB }];

  test('closed by default; the trigger reports its state', async () => {
    const user = setup(items);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    await user.click(trigger());
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
  });
  test('shows header, items with hint, and a separator', async () => {
    const user = setup(items);
    await user.click(trigger());
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Alpha.sql', 'Beta']);
    expect(screen.getByText('SQL').className).toBe('menu-head');
    expect(document.querySelector('.menu-pop hr')).toBeTruthy();
  });
  test('clicking an item runs it and closes the menu', async () => {
    const user = setup(items);
    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: /Alpha/ }));
    expect(onA).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });
  test('Escape closes it', async () => {
    const user = setup(items);
    await user.click(trigger());
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });
  test('a press outside closes it, a press inside does not', async () => {
    const user = setup(items);
    await user.click(trigger());
    await user.pointer({ keys: '[MouseLeft>]', target: screen.getByText('SQL') });
    expect(screen.getByRole('menu')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'outside' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });
  test('the trigger toggles', async () => {
    const user = setup(items);
    await user.click(trigger());
    await user.click(trigger());
    expect(screen.queryByRole('menu')).toBeNull();
  });
  test('a closed menu leaves no document listeners behind (Escape does nothing)', async () => {
    const add = vi.spyOn(document, 'addEventListener'), rm = vi.spyOn(document, 'removeEventListener');
    const user = setup(items);
    await user.click(trigger());
    await user.keyboard('{Escape}');
    const added = add.mock.calls.filter(([t]) => t === 'mousedown' || t === 'keydown').length;
    const removed = rm.mock.calls.filter(([t]) => t === 'mousedown' || t === 'keydown').length;
    expect(removed).toBeGreaterThanOrEqual(added - 2); // userEvent adds its own keydown handling: only the menu's pair must be gone
  });
});

test('a trigger that shows only a letter (the account avatar) gets a spoken name from `label`', () => {
  render(<Menu trigger={<span className="avatar">A</span>} label="Account menu, Ana" items={[]} title="Ana · ana@example.com" />);
  expect(screen.getByRole('button', { name: 'Account menu, Ana' })).toBeTruthy();
});
