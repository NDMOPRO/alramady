import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthUser {
  id: string;
  username: string;
  displayName: string | null;
  displayNameAr: string | null;
  email: string | null;
  locale: string;
  timezone: string;
  isOwner: boolean;
  roles: string[];
  permissions: string[];
  tenantId: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
}

const API_BASE = '/api/v1/governance/auth';

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const res = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
          });

          const data = await res.json();

          if (!res.ok || !data.success) {
            throw new Error(data.error || 'Login failed');
          }

          set({
            user: data.data.user,
            accessToken: data.data.accessToken,
            refreshToken: data.data.refreshToken,
            expiresAt: Date.now() + data.data.expiresIn * 1000,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (err) {
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : 'Login failed',
            isAuthenticated: false,
            user: null,
            accessToken: null,
            refreshToken: null,
          });
          throw err;
        }
      },

      logout: async () => {
        const { accessToken } = get();
        if (accessToken) {
          try {
            await fetch(`${API_BASE}/logout`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            });
          } catch {
            // Ignore logout errors
          }
        }
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          expiresAt: null,
          isAuthenticated: false,
          error: null,
        });
      },

      refresh: async () => {
        const { refreshToken: rt } = get();
        if (!rt) {
          set({ isAuthenticated: false, user: null, accessToken: null });
          return;
        }

        try {
          const res = await fetch(`${API_BASE}/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: rt }),
          });

          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error('Refresh failed');
          }

          set({
            accessToken: data.data.accessToken,
            expiresAt: Date.now() + data.data.expiresIn * 1000,
          });
        } catch {
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            expiresAt: null,
            isAuthenticated: false,
          });
        }
      },

      clearError: () => set({ error: null }),

      hasPermission: (permission: string) => {
        const { user } = get();
        if (!user) return false;
        if (user.isOwner) return true;
        return user.permissions.includes(permission);
      },

      hasRole: (role: string) => {
        const { user } = get();
        if (!user) return false;
        if (user.isOwner) return true;
        return user.roles.includes(role);
      },
    }),
    {
      name: 'rasid-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        expiresAt: state.expiresAt,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
