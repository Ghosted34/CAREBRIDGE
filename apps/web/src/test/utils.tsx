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

type Reply = { status?: number; body: unknown };
/**
 * Route-aware fetch mock: keys are "METHOD /path" (path after /api/v1, query string ignored).
 * A value can be a reply or a list of replies used in order (the last one repeats).
 */
export function mockApi(routes: Record<string, Reply | Reply[]>) {
  const counters: Record<string, number> = {};
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace(/^\/api\/v1/, '').split('?')[0];
    const key = `${init?.method ?? 'GET'} ${path}`;
    const entry = routes[key];
    if (!entry) throw new Error(`Unmocked API call: ${key}`);
    const list = Array.isArray(entry) ? entry : [entry];
    const i = counters[key] ?? 0;
    counters[key] = i + 1;
    const r = list[Math.min(i, list.length - 1)]!;
    return new Response(JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Calls made to one route, with parsed JSON bodies. */
export function callsTo(fn: ReturnType<typeof mockApi>, key: string) {
  return fn.mock.calls
    .filter(
      ([url, init]) =>
        `${init?.method ?? 'GET'} ${
          String(url)
            .replace(/^\/api\/v1/, '')
            .split('?')[0]
        }` === key,
    )
    .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : undefined));
}

export const POLICIES_FIXTURE = [
  {
    type: 'terms',
    version: 'v1',
    title: 'Terms of use',
    summary: 'Terms summary.',
    required_at_registration: true,
    required_for_requests: true,
  },
  {
    type: 'privacy',
    version: 'v1',
    title: 'Privacy notice',
    summary: 'Privacy summary.',
    required_at_registration: true,
    required_for_requests: true,
  },
  {
    type: 'data_sharing',
    version: 'v1',
    title: 'Sharing your request with providers',
    summary: 'We share your request with verified providers.',
    required_at_registration: false,
    required_for_requests: true,
  },
  {
    type: 'marketing',
    version: 'v1',
    title: 'Updates and offers',
    summary: 'Optional.',
    required_at_registration: false,
    required_for_requests: false,
  },
];

export function consentsFixture(granted: Partial<Record<string, boolean>>) {
  return POLICIES_FIXTURE.map((p) => ({
    type: p.type,
    current_version: 'v1',
    granted: !!granted[p.type],
    granted_version: granted[p.type] ? 'v1' : null,
    up_to_date: !!granted[p.type],
    decided_at: granted[p.type] ? '2026-11-01T10:00:00Z' : null,
  }));
}
