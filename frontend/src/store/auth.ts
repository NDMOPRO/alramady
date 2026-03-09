import { create } from 'zustand';
import { authApi } from '@/lib/api';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  clearError: () => void;
  initialize: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: false,
  error: null,

  initialize: () => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('rasid_token');
      const userStr = localStorage.getItem('rasid_user');
      if (token && userStr) {
        try {
          const user = JSON.parse(userStr) as User;
          set({ token, user });
        } catch {
          localStorage.removeItem('rasid_token');
          localStorage.removeItem('rasid_user');
        }
      }
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.post('/login', { email, password });
      const { accessToken: token, user } = response.data;

      if (typeof window !== 'undefined') {
        localStorage.setItem('rasid_token', token);
        localStorage.setItem('rasid_user', JSON.stringify(user));
      }

      set({ user, token, isLoading: false, error: null });
    } catch (err: any) {
      const message =
        err.response?.data?.message || 'Login failed. Please try again.';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('rasid_token');
      localStorage.removeItem('rasid_user');
    }
    set({ user: null, token: null, error: null });
  },

  refreshToken: async () => {
    try {
      const response = await authApi.post('/refresh');
      const { token } = response.data;

      if (typeof window !== 'undefined') {
        localStorage.setItem('rasid_token', token);
      }

      set({ token });
    } catch (err) {
      // If refresh fails, logout
      get().logout();
    }
  },

  setUser: (user) => set({ user }),
  setToken: (token) => set({ token }),
  clearError: () => set({ error: null }),
}));

// Selector for isAuthenticated
export const selectIsAuthenticated = (state: AuthState) =>
  !!state.token && !!state.user;
