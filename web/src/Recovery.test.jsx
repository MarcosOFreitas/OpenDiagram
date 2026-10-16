import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./api.js', async (orig) => ({ ...(await orig()), api: vi.fn(), copyText: vi.fn() }));
import { api, copyText } from './api.js';
import { RecoveryKey } from './AccountSecurity.jsx';
import AuthScreen from './Auth.jsx';

beforeEach(() => { api.mockReset(); copyText.mockReset(); });

describe('RecoveryKey (Account)', () => {
  test('no key yet: asks for the password, shows the new key once with Copy, then hides it', async () => {
    api.mockImplementation(async (p, b, m) => (p === 'auth/recovery' && b ? { key: 'rk-aaaaa-bbbbb' } : { has: false, createdAt: null }));
    const user = userEvent.setup(), notify = vi.fn();
    render(<RecoveryKey notify={notify} />);
    await user.click(await screen.findByText('Generate a recovery key'));
    await user.type(screen.getByLabelText('Your password, to make the key'), 'my-password-1');
    await user.click(screen.getByText('Generate'));
    expect(await screen.findByDisplayValue('rk-aaaaa-bbbbb')).toBeTruthy();
    expect(screen.getByText(/only this once/)).toBeTruthy();
    expect(api).toHaveBeenCalledWith('auth/recovery', { password: 'my-password-1' });
    await user.click(screen.getByText('Copy'));
    expect(copyText).toHaveBeenCalledWith('rk-aaaaa-bbbbb', 'Recovery key copied', notify);
    await user.click(screen.getByText('I saved it'));
    expect(screen.queryByDisplayValue('rk-aaaaa-bbbbb')).toBeNull();
  });
  test('a wrong password shows the error and no key', async () => {
    api.mockImplementation(async (p, b) => { if (b) throw new Error('password is wrong'); return { has: true, createdAt: 1_700_000_000 }; });
    const user = userEvent.setup();
    render(<RecoveryKey notify={vi.fn()} />);
    await user.click(await screen.findByText('Generate a new key'));
    await user.type(screen.getByLabelText('Your password, to make the key'), 'nope');
    await user.click(screen.getByText('Generate'));
    expect(await screen.findByText('password is wrong')).toBeTruthy();
    expect(screen.queryByText(/only this once/)).toBeNull();
  });
  test('with a key: says so, and Remove deletes it', async () => {
    api.mockImplementation(async (p, b, m) => (m === 'DELETE' ? { ok: true } : { has: true, createdAt: 1_700_000_000 }));
    const user = userEvent.setup();
    render(<RecoveryKey notify={vi.fn()} />);
    expect(await screen.findByText(/You have a recovery key/)).toBeTruthy();
    await user.click(screen.getByText('Remove'));
    await waitFor(() => expect(api).toHaveBeenCalledWith('auth/recovery', undefined, 'DELETE'));
  });
});

describe('sign-in screen: forgot password', () => {
  test('the link opens the recovery form; the two new passwords must match; it sends e-mail, key and the new password', async () => {
    api.mockResolvedValue({ user: { id: 1 } });
    const onDone = vi.fn(), user = userEvent.setup();
    render(<AuthScreen onDone={onDone} />);
    await user.click(screen.getByText('Forgot your password?'));
    expect(screen.getByRole('heading', { name: 'Forgot your password?' })).toBeTruthy();
    await user.type(screen.getByPlaceholderText('E-mail'), 'me@example.com');
    await user.type(screen.getByLabelText('Recovery key'), 'rk-aaaaa-bbbbb');
    await user.type(screen.getByPlaceholderText('New password (10+ characters)'), 'a brand new password');
    await user.type(screen.getByPlaceholderText('Repeat new password'), 'different one entirely');
    await user.click(screen.getByText('Choose the new password'));
    expect(await screen.findByText('the two new passwords do not match')).toBeTruthy();
    expect(api).not.toHaveBeenCalled();
    await user.clear(screen.getByPlaceholderText('Repeat new password'));
    await user.type(screen.getByPlaceholderText('Repeat new password'), 'a brand new password');
    await user.click(screen.getByText('Choose the new password'));
    await waitFor(() => expect(api).toHaveBeenCalledWith('auth/recover', { email: 'me@example.com', key: 'rk-aaaaa-bbbbb', next: 'a brand new password' }));
    expect(onDone).toHaveBeenCalledWith({ id: 1 });
  });
  test('a server error is shown; Back to sign in returns', async () => {
    api.mockRejectedValue(new Error('invalid e-mail or recovery key'));
    const user = userEvent.setup();
    render(<AuthScreen onDone={vi.fn()} />);
    await user.click(screen.getByText('Forgot your password?'));
    await user.type(screen.getByPlaceholderText('E-mail'), 'me@example.com');
    await user.type(screen.getByLabelText('Recovery key'), 'x');
    await user.type(screen.getByPlaceholderText('New password (10+ characters)'), 'a brand new password');
    await user.type(screen.getByPlaceholderText('Repeat new password'), 'a brand new password');
    await user.click(screen.getByText('Choose the new password'));
    expect(await screen.findByText('invalid e-mail or recovery key')).toBeTruthy();
    await user.click(screen.getByText('Back to sign in'));
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy();
  });
  test('no recovery link on the very first screen (no account exists yet)', () => {
    render(<AuthScreen onDone={vi.fn()} firstRun />);
    expect(screen.queryByText('Forgot your password?')).toBeNull();
  });
});
