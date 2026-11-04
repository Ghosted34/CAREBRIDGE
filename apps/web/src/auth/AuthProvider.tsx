import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setUnauthorizedHandler, tokenStore } from '../api/client';
import { api } from '../api/endpoints';
import { AuthContext } from './authContext';

/** Holds the session token and the signed-in user (`GET /me`, cached by React Query). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState(() => tokenStore.get());

  const me = useQuery({
    queryKey: ['me', token],
    queryFn: async () => (await api.me()).data,
    enabled: !!token,
    retry: false,
    staleTime: 60_000,
  });

  const logout = useCallback(() => {
    tokenStore.set(null);
    setToken(null);
    queryClient.clear(); // never show one user's cached data to the next
  }, [queryClient]);

  // An expired/invalid token anywhere logs the user out (subscription to an external system).
  useEffect(() => setUnauthorizedHandler(logout), [logout]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await api.login(email, password);
      tokenStore.set(data.token);
      const user = await queryClient.fetchQuery({
        queryKey: ['me', data.token],
        queryFn: async () => (await api.me()).data,
      });
      setToken(data.token);
      return user;
    },
    [queryClient],
  );

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['me'] });
  }, [queryClient]);

  const value = useMemo(
    () => ({
      user: token ? (me.data ?? null) : null,
      loading: !!token && me.isPending,
      login,
      logout,
      refresh,
    }),
    [token, me.data, me.isPending, login, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
