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
  selectedSiteId: string | null;
  setSelectedSiteId: (siteId: string | null) => void;
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
      selectedSiteId: null,
      setSelectedSiteId: (selectedSiteId) => set({ selectedSiteId }),
      setSession: (token, user) => set((state) => ({ token, user, originalToken: token, originalUser: user,
        viewingAs: false, viewAsToken: null,
        selectedSiteId: !state.viewingAs && state.user?.userId === user.userId ? state.selectedSiteId : null })),
      startViewingAs: (viewAsToken, user) => set((state) => ({
        originalToken: state.originalToken ?? state.token,
        originalUser: state.originalUser ?? state.user,
        token: state.originalToken ?? state.token,
        user,
        viewingAs: true,
        viewAsToken,
        selectedSiteId: null,
      })),
      stopViewingAs: () => {
        const { originalToken, originalUser } = get();
        set({ token: originalToken, user: originalUser, viewingAs: false, viewAsToken: null, selectedSiteId: null });
      },
      logout: () => set({ token: null, user: null, originalToken: null, originalUser: null, viewingAs: false, viewAsToken: null, selectedSiteId: null }),
      hasRole: (...roles) => Boolean(get().user?.roles.some((role) => roles.includes(role))),
    }),
    { name: 'clearpath-auth' },
  ),
);
