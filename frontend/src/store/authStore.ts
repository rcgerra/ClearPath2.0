import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser, Role } from '../types';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  originalToken: string | null;
  originalUser: AuthUser | null;
  viewingAs: boolean;
  viewAsToken: string | null;
  setSession: (token: string, user: AuthUser) => void;
  startViewingAs: (viewAsToken: string, user: AuthUser) => void;
  stopViewingAs: () => void;
  logout: () => void;
  hasRole: (...roles: Role[]) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      originalToken: null,
      originalUser: null,
      viewingAs: false,
      viewAsToken: null,
      setSession: (token, user) => set({ token, user, originalToken: token, originalUser: user, viewingAs: false, viewAsToken: null }),
      startViewingAs: (viewAsToken, user) => set((state) => ({
        originalToken: state.originalToken ?? state.token,
        originalUser: state.originalUser ?? state.user,
        token: state.originalToken ?? state.token,
        user,
        viewingAs: true,
        viewAsToken,
      })),
      stopViewingAs: () => {
        const { originalToken, originalUser } = get();
        set({ token: originalToken, user: originalUser, viewingAs: false, viewAsToken: null });
      },
      logout: () => set({ token: null, user: null, originalToken: null, originalUser: null, viewingAs: false, viewAsToken: null }),
      hasRole: (...roles) => Boolean(get().user?.roles.some((role) => roles.includes(role))),
    }),
    { name: 'clearpath-auth' },
  ),
);
