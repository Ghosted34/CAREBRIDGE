import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { patientUser, renderApp } from '../test/utils';
import { RequireRole } from './RequireRole';

const guarded = <RequireRole roles={['provider_staff']}>secret provider screen</RequireRole>;

describe('RequireRole', () => {
  it('sends signed-out visitors to the login page', () => {
    renderApp(guarded, { route: '/provider' });
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('sends users with another role to their own home', () => {
    renderApp(guarded, { route: '/provider', auth: { user: patientUser } });
    expect(screen.getByText('patient home')).toBeInTheDocument();
    expect(screen.queryByText('secret provider screen')).not.toBeInTheDocument();
  });

  it('remembers the full address, query string included, for after sign-in', () => {
    renderApp(<RequireRole roles={['patient']}>new request</RequireRole>, {
      route: '/patient/new?providerId=3',
      auth: { user: null },
    });
    expect(screen.getByText('login page')).toBeInTheDocument();
    expect(screen.getByTestId('login-from')).toHaveTextContent('/patient/new?providerId=3');
  });

  it('renders for the right role, and waits while the session loads', () => {
    const { unmount } = renderApp(guarded, { route: '/provider', auth: { loading: true } });
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
    unmount();
    renderApp(guarded, {
      route: '/provider',
      auth: { user: { ...patientUser, role: 'provider_staff' } },
    });
    expect(screen.getByText('secret provider screen')).toBeInTheDocument();
  });
});
