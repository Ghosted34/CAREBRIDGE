import { useLocation } from 'react-router';

/**
 * Stand-in for the real login page in tests. It echoes back the address a route guard asked to
 * return to after signing in, so guards can be checked without rendering the whole auth flow.
 */
export function LoginStub() {
  const from = (useLocation().state as { from?: string } | null)?.from;
  return (
    <p>
      login page
      {from ? <span data-testid="login-from">{from}</span> : null}
    </p>
  );
}
