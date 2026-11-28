import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import Swal from 'sweetalert2';

vi.mock('../config', () => ({ USE_MOCKS: false, USE_VISUALIZATION_MOCKS: false, SERVICE_URLS: { users: '', projects: '', hardware: '', visualization: '' } }));
// The third-party alert UI is verified in the browser; keep transport, services,
// authentication state, routes and workspace real in these contract regressions.
vi.mock('sweetalert2', () => ({ default: { fire: vi.fn(async () => ({})) } }));

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
let returning;
let rejected;
let transport;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/login');
  returning = false;
  rejected = false;
  Swal.fire.mockClear();
  transport = vi.fn(async (url, options) => {
    if (url.endsWith('/login')) return json({ mfaToken: 'temporary-mfa', nextStep: returning ? '2fa_verify' : '2fa_setup' });
    if (url.endsWith('/2fa/setup')) return json({ qrCodeDataUrl: 'data:image/svg+xml,%3Csvg/%3E', secret: 'fixture-secret' });
    if (url.endsWith('/2fa/enable') || url.endsWith('/2fa/verify')) return rejected ? json({ error: 'Invalid code' }, 401) : json({ accessToken: 'final-access' });
    if (url.endsWith('/me')) return options.headers.Authorization === 'Bearer final-access' ? json({ user: { id: 7, username: 'staff', agencyCode: 'AUS' } }) : json({ error: 'Unauthorized' }, 401);
    if (url.endsWith('/projects/search_project')) return json({ projectList: [] });
    if (url.endsWith('/api/visualization')) return json({ metrics: [], hardware: [], pipelines: [] });
    return json({});
  });
  vi.stubGlobal('fetch', transport);
});
afterEach(() => vi.unstubAllGlobals());

test('a reloaded MFA setup keeps the temporary session without reading the authenticated profile', async () => {
  sessionStorage.setItem('mfaToken', 'temporary-mfa');
  window.history.replaceState({}, '', '/2fa/setup');
  render(<App />);
  expect(await screen.findByRole('img', { name: /QR code/ })).toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: 'Header navigation' })).not.toBeInTheDocument();
  expect(transport.mock.calls.some(([url]) => url.endsWith('/me'))).toBe(false);
  expect(transport).toHaveBeenCalledWith('/api/users-service/2fa/setup', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer temporary-mfa' }) }));
});

test.each([false, true])('password → MFA → authenticated workspace preserves the current flow (returning=%s)', async (isReturning) => {
  returning = isReturning;
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByPlaceholderText('Enter username'), 'staff');
  await user.type(screen.getByPlaceholderText('Enter password'), 'password');
  await user.click(screen.getByRole('button', { name: 'Login', exact: true }));
  await screen.findByRole('heading', { name: returning ? 'Enter Code' : 'Set Up Two-Factor' });
  expect(localStorage.getItem('token')).toBeNull();
  expect(window.location.pathname).toBe(returning ? '/2fa/verify' : '/2fa/setup');
  await user.type(screen.getByPlaceholderText('Enter 6-digit code'), '123456');
  await user.click(screen.getByRole('button', { name: returning ? 'Verify' : 'Enable Two-Factor', exact: true }));
  const projects = await screen.findByRole('link', { name: 'Projects', exact: true }, { timeout: 4000 });
  await user.click(projects);
  expect(await screen.findByRole('heading', { name: 'No projects joined yet' })).toBeInTheDocument();
  expect(screen.getByText('staff')).toBeInTheDocument();
  expect(localStorage.getItem('token')).toBe('final-access');
  expect(sessionStorage.getItem('mfaToken')).toBeNull();
  expect(transport).toHaveBeenCalledWith(`/api/users-service/2fa/${returning ? 'verify' : 'enable'}`, expect.objectContaining({ method: 'POST', body: JSON.stringify({ code: '123456' }), headers: expect.objectContaining({ Authorization: 'Bearer temporary-mfa' }) }));
  expect(transport).toHaveBeenCalledWith('/api/projects-service/projects/search_project', expect.objectContaining({ body: JSON.stringify({ orgId: 'AUS', projectId: null, userId: '7' }), headers: expect.objectContaining({ Authorization: 'Bearer final-access' }) }));
}, 10000);

test('a rejected MFA code keeps the user outside the workspace', async () => {
  rejected = true;
  sessionStorage.setItem('mfaToken', 'temporary-mfa');
  window.history.replaceState({}, '', '/2fa/verify');
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByPlaceholderText('Enter 6-digit code'), '000000');
  await user.click(screen.getByRole('button', { name: 'Verify', exact: true }));
  await waitFor(() => expect(Swal.fire).toHaveBeenCalledWith(expect.objectContaining({ title: 'Code Not Accepted' })));
  expect(localStorage.getItem('token')).toBeNull();
  expect(window.location.pathname).toBe('/2fa/verify');
  expect(screen.queryByRole('navigation', { name: 'Workspace' })).not.toBeInTheDocument();
});
