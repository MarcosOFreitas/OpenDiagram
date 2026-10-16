import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./api.js', async (orig) => ({ ...(await orig()), api: vi.fn(), copyText: vi.fn() }));
import { api, copyText } from './api.js';
import AdminAgents from './AdminAgents.jsx';

const AGENTS = [{ id: 7, name: 'Claude of data', disabled: false, createdAt: 1_700_000_000, tokens: [{ id: 't1', name: 'laptop', createdAt: 1_700_000_000, lastUsed: null, expiresAt: null, revoked: false, expired: false }, { id: 't2', name: 'old', createdAt: 1_700_000_000, lastUsed: 1_700_000_100, expiresAt: null, revoked: true, expired: false }] }];
const act = (fn) => async () => { await fn(); };
const setup = (settings = { allowAgents: true }, list = AGENTS) => {
  api.mockImplementation(async (p, b, m) => (p === 'admin/agents' && !b ? list : p.endsWith('/tokens') ? { id: 't9', token: 'odt_SECRET-TOKEN-VALUE' } : { ok: true }));
  const setErr = vi.fn(), notify = vi.fn();
  render(<AdminAgents settings={settings} act={act} setErr={setErr} notify={notify} />);
  return { setErr, notify, user: userEvent.setup({ delay: null }) };
};
beforeEach(() => { api.mockReset(); copyText.mockReset(); });

describe('AdminAgents', () => {
  test('lists the agents with their tokens; a revoked token has no Revoke button', async () => {
    setup();
    expect(await screen.findByText('Claude of data')).toBeTruthy();
    expect(screen.getByLabelText('Revoke token laptop')).toBeTruthy();
    expect(screen.queryByLabelText('Revoke token old')).toBeNull();
    expect(screen.getByText(/used never/)).toBeTruthy();
  });
  test('warns while agents are switched off', async () => {
    setup({ allowAgents: false });
    expect(await screen.findByText(/Agents are switched off/)).toBeTruthy();
  });
  test('no agents: an empty state that says what to do', async () => {
    setup({ allowAgents: true }, []);
    expect(await screen.findByText('No agents yet')).toBeTruthy();
  });
  test('creating a token shows it once, with Copy, and hides it again', async () => {
    const { user, notify } = setup();
    await screen.findByText('Claude of data');
    await user.click(screen.getByText('+ Token'));
    expect(await screen.findByDisplayValue('odt_SECRET-TOKEN-VALUE')).toBeTruthy();
    expect(screen.getByText(/shown only once/)).toBeTruthy();
    await user.click(screen.getByText('Copy'));
    expect(copyText).toHaveBeenCalledWith('odt_SECRET-TOKEN-VALUE', 'Token copied', notify);
    await user.click(screen.getByText('I saved it'));
    expect(screen.queryByDisplayValue('odt_SECRET-TOKEN-VALUE')).toBeNull();
    expect(JSON.stringify(api.mock.calls)).not.toContain('odt_SECRET'); // the token is never sent back to the server
  });
  test('Create agent sends the name; an empty name is refused without a call', async () => {
    const { user, setErr } = setup();
    await screen.findByText('Claude of data');
    await user.click(screen.getByText('Create agent'));
    expect(setErr).toHaveBeenCalledWith('give the agent a name');
    await user.type(screen.getByLabelText('New agent name'), 'Bot 2');
    await user.click(screen.getByText('Create agent'));
    await waitFor(() => expect(api).toHaveBeenCalledWith('admin/agents', { name: 'Bot 2' }));
  });
  test('Disable and Delete (after a confirmation) call the server', async () => {
    const { user } = setup();
    await user.click(await screen.findByText('Disable'));
    await waitFor(() => expect(api).toHaveBeenCalledWith('admin/agents/7', { disabled: true }, 'PATCH'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByText('Delete'));
    await waitFor(() => expect(api).toHaveBeenCalledWith('admin/agents/7', undefined, 'DELETE'));
  });
});
