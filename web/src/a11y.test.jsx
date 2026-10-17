import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { press } from './a11y.js';

describe('press: a non-button that acts like one', () => {
  test('is reachable by Tab, named, and Enter or Space press it once; a click too', async () => {
    const fn = vi.fn(), user = userEvent.setup({ delay: null });
    render(<><a {...press('Remove x', fn)}>✕</a><a {...press(null, fn)}>all</a></>);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Remove x' })).toBe(document.activeElement);
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(fn).toHaveBeenCalledTimes(2);
    await user.keyboard('a');
    expect(fn).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('button', { name: 'all' })); // no label: the text is the name
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
