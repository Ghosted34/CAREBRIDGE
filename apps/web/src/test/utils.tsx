import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { vi } from 'vitest';
import type { Me } from '../api/types';
import { AuthContext, type AuthState } from '../auth/authContext';

export const patientUser: Me = {
  id: 1,
  full_name: 'Ada Patient',
  email: 'ada@test.local',
  phone: '+2348000000000',
  role: 'patient',
  status: 'active',
  created_at: '2026-11-01T10:00:00Z',
  memberships: [],
};

/** Render with a fresh QueryClient, a memory router and a fixed auth state. */
export function renderApp(
  ui: ReactNode,
  {
    route = '/',
    path = '*',
    auth = {},
  }: { route?: string; path?: string; auth?: Partial<AuthState> } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const value: AuthState = {
    user: null,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    ...auth,
  };
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={value}>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path={path} element={ui} />
            <Route path="/login" element={<p>login page</p>} />
            <Route path="/patient" element={<p>patient home</p>} />
            <Route path="/patient/requests/:id" element={<p>request page</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

/** Stub global fetch with a sequence of JSON responses. */
export function mockFetch(...responses: { status?: number; body: unknown }[]) {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce(
      new Response(JSON.stringify(r.body), {
        status: r.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }
  vi.stubGlobal('fetch', fn);
  return fn;
}
