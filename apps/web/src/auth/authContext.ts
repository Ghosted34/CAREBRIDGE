import { createContext, useContext } from 'react';
import type { Me, Role } from '../api/types';

export interface AuthState {
  user: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<Me>;
  logout: () => void;
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Where each role lands after signing in. */
export function homePathFor(role: Role): string {
  switch (role) {
    case 'patient':
      return '/patient';
    case 'provider_staff':
      return '/provider';
    case 'operator':
    case 'admin':
      return '/ops';
  }
}
