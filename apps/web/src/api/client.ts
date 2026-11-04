/** Thin fetch wrapper that speaks the API's envelope and error format. */

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] } | unknown;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ApiErrorBody['details'],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field-level validation messages, if the API returned any. */
  fieldErrors(): Record<string, string[]> {
    const d = this.details as { fieldErrors?: Record<string, string[]> } | undefined;
    return d?.fieldErrors ?? {};
  }
}

const TOKEN_KEY = 'carebridge.token';

/**
 * The token lives in sessionStorage: it survives reloads but not closing the tab, which limits
 * exposure on shared devices. Known trade-off: readable by injected scripts — mitigated by a strict
 * CSP in nginx; moving to httpOnly cookies is tracked in docs/security.md.
 */
export const tokenStore = {
  get(): string | null {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string | null) {
    try {
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable (private mode); the session just won't survive a reload */
    }
  },
};

let onUnauthorized: () => void = () => {};
/** Called once by the auth provider so an expired token logs the user out everywhere. */
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

type Method = 'GET' | 'POST' | 'DELETE';

export async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK',
      'Cannot reach CareBridge. Check your connection and try again.',
    );
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json as { error?: ApiErrorBody } | null)?.error;
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(
      res.status,
      err?.code ?? 'HTTP_ERROR',
      err?.message ?? `Request failed (${res.status})`,
      err?.details,
    );
  }
  return json as T;
}

/** Build a query string, skipping empty values. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : '';
}
