import { createContext, ReactNode, useContext, useMemo } from 'react';
import type { AuthUser, Role } from '../types';
import { useAuthStore } from '../store/authStore';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  hasRole: (...roles: Role[]) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const hasRole = useAuthStore((state) => state.hasRole);
  const value = useMemo(() => ({ user, token, isAuthenticated: Boolean(token && user), hasRole, logout }), [user, token, hasRole, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider.');
  return context;
}

// TODO(Entra): AuthProvider will become the Entra MSAL boundary after identity migration.
export default AuthContext;
