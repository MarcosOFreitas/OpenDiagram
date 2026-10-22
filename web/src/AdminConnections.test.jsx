import { test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./api.js', async (orig) => ({ ...(await orig()), api: vi.fn(async () => []) }));
import AdminConnections from './AdminConnections.jsx';

// a shared connection with TLS "verify" takes a private CA for PostgreSQL and MySQL (introspect.js pgSsl / myConfig use it); Oracle has none
// (its CA is trusted through NODE_EXTRA_CA_CERTS) and asks for the expected certificate DN instead
test('the CA certificate field is offered with TLS verify for PostgreSQL and MySQL, not for Oracle', async () => {
  const user = userEvent.setup({ delay: null });
  render(<AdminConnections users={[]} groups={[]} act={(f) => f} setErr={() => {}} />);
  await user.click(await screen.findByRole('button', { name: /Register a shared connection/ }));
  const ca = () => screen.queryByPlaceholderText(/CA certificate/);
  expect(ca()).toBeTruthy(); // PostgreSQL, the default
  await user.click(screen.getByRole('button', { name: 'MySQL' }));
  expect(ca()).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Oracle' }));
  expect(ca()).toBeNull();
  expect(screen.getByPlaceholderText(/Expected server certificate DN/)).toBeTruthy();
});
