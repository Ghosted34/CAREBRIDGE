import { describe, expect, it, vi } from 'vitest';
import { mockFetch } from '../test/utils';
import { ApiError, qs, request, setUnauthorizedHandler, tokenStore } from './client';

describe('api client', () => {
  it('sends the bearer token and JSON body to /api/v1', async () => {
    tokenStore.set('abc');
    const fetchFn = mockFetch({ body: { data: { ok: true } } });
    const res = await request('POST', '/requests', { a: 1 });
    expect(res).toEqual({ data: { ok: true } });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('/api/v1/requests');
    expect(init.headers.Authorization).toBe('Bearer abc');
    expect(init.body).toBe('{"a":1}');
  });

  it('turns the API error envelope into an ApiError with field errors', async () => {
    mockFetch({
      status: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request',
          details: { fieldErrors: { email: ['Bad'] } },
        },
      },
    });
    const err = (await request('POST', '/auth/register', {}).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.fieldErrors()).toEqual({ email: ['Bad'] });
  });

  it('calls the unauthorized handler on 401 when a token was sent', async () => {
    tokenStore.set('expired');
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    mockFetch({
      status: 401,
      body: { error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired token' } },
    });
    await expect(request('GET', '/me')).rejects.toThrow('Invalid or expired token');
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('reports network failures in plain language', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(request('GET', '/providers')).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('builds query strings without empty values', () => {
    expect(qs({ a: 'x', b: undefined, c: '', d: 2 })).toBe('?a=x&d=2');
    expect(qs({})).toBe('');
  });
});
