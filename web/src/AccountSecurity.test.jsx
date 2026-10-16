import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./api.js', async (orig) => ({ ...(await orig()), api: vi.fn() }));
import { api } from './api.js';
import { Sessions, DeleteAccount } from './AccountSecurity.jsx';

const NOW = Math.floor(Date.now() / 1000);
const LIST = [{ id: 'aaaa', current: true, createdAt: NOW, lastSeen: NOW, ip: '1.2.3.4', agent: 'Chrome on Windows' }, { id: 'bbbb', current: false, createdAt: NOW - 90000, lastSeen: NOW - 7200, ip: '5.6.7.8', agent: 'Firefox on Linux' }];
beforeEach(() => { api.mockReset(); });

describe('Sessions', () => {
  test('lists the devices; the current one has no End button; the other can be ended', async () => {
    api.mockImplementation(async (p, b, m) => (m === 'DELETE' ? { ended: 1 } : LIST));
    const notify = vi.fn(), user = userEvent.setup();
    render(<Sessions notify={notify} />);
    expect(await screen.findByText('Firefox on Linux')).toBeTruthy();
    expect(screen.getByText('this device')).toBeTruthy();
    expect(screen.getByText(/last used 2 h ago/)).toBeTruthy();
    expect(screen.queryByLabelText('End session on Chrome on Windows')).toBeNull();
    await user.click(screen.getByLabelText('End session on Firefox on Linux'));
    await waitFor(() => expect(api).toHaveBeenCalledWith('auth/sessions/bbbb', undefined, 'DELETE'));
    expect(notify).toHaveBeenCalledWith('ok', 'Session ended');
  });
  test('"Sign out all other sessions" only when there is another one', async () => {
    api.mockImplementation(async (p, b, m) => (m === 'DELETE' ? { ended: 1 } : LIST));
    const user = userEvent.setup();
    render(<Sessions notify={vi.fn()} />);
    await user.click(await screen.findByText('Sign out all other sessions'));
    await waitFor(() => expect(api).toHaveBeenCalledWith('auth/sessions', undefined, 'DELETE'));
  });
  test('alone: no bulk button', async () => {
    api.mockResolvedValue([LIST[0]]);
    render(<Sessions notify={vi.fn()} />);
    await screen.findByText('Chrome on Windows');
    expect(screen.queryByText('Sign out all other sessions')).toBeNull();
  });
});

describe('DeleteAccount', () => {
  test('asks for the password after a warning that says what happens to the diagrams; sends it; signs out', async () => {
    api.mockResolvedValue({ ok: true });
    const onDone = vi.fn(), user = userEvent.setup();
    render(<DeleteAccount onDone={onDone} />);
    expect(api).not.toHaveBeenCalled();
    await user.click(screen.getByText('Delete my account…'));
    expect(screen.getByText(/kept for 7 days/)).toBeTruthy();
    await user.type(screen.getByLabelText('Your password, to confirm'), 'my-secret-pass');
    await user.click(screen.getByText('Delete my account'));
    await waitFor(() => expect(api).toHaveBeenCalledWith('auth/account', { password: 'my-secret-pass' }, 'DELETE'));
    expect(onDone).toHaveBeenCalled();
  });
  test('a wrong password shows the error and keeps the session', async () => {
    api.mockRejectedValue(new Error('password is wrong'));
    const onDone = vi.fn(), user = userEvent.setup();
    render(<DeleteAccount onDone={onDone} />);
    await user.click(screen.getByText('Delete my account…'));
    await user.type(screen.getByLabelText('Your password, to confirm'), 'x');
    await user.click(screen.getByText('Delete my account'));
    expect(await screen.findByText('password is wrong')).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });
  test('Cancel closes the form without calling the server', async () => {
    const user = userEvent.setup();
    render(<DeleteAccount onDone={vi.fn()} />);
    await user.click(screen.getByText('Delete my account…'));
    await user.click(screen.getByText('Cancel'));
    expect(screen.getByText('Delete my account…')).toBeTruthy();
    expect(api).not.toHaveBeenCalled();
  });
});
