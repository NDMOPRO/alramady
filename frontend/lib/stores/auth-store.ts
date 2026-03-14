import { create } from "zustand";
import { governanceApi } from "@/lib/api/client";
import { ensureE2EAuthStorage, isE2EAuthBypassed } from "@/lib/auth/e2e";

export type UserRole = 'root_admin' | 'admin' | 'editor' | 'viewer' | string;

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string;
  avatar?: string;
  isOwner?: boolean;
}

/**
 * يُحدّد الدور الفعلي للمستخدم — مالك النظام يحصل دائمًا على root_admin.
 */
export function resolveRole(user: User | null): UserRole {
  if (!user) return 'viewer';
  if (user.isOwner) return 'root_admin';
  return user.role || 'viewer';
}

/**
 * يتحقق هل المستخدم هو مالك النظام (isOwner).
 */
export function isSystemOwner(user: User | null): boolean {
  return user?.isOwner === true || user?.role === 'root_admin';
}

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;

  initialize: () => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshSession: () => Promise<void>;
  setUser: (user: User | null) => void;
  clearError: () => void;
}

// Auto-initialize from localStorage on client side
function getInitialState() {
  if (typeof window === "undefined") {
    return { user: null, token: null, refreshToken: null, isAuthenticated: false };
  }

  const e2eSnapshot = ensureE2EAuthStorage();
  if (e2eSnapshot) {
    return {
      user: e2eSnapshot.user,
      token: e2eSnapshot.token,
      refreshToken: e2eSnapshot.refreshToken,
      isAuthenticated: true,
    };
  }

  try {
    const token = localStorage.getItem("rasid_token");
    const refreshTokenVal = localStorage.getItem("rasid_refresh_token");
    const userStr = localStorage.getItem("rasid_user");
    if (token && userStr) {
      const user = JSON.parse(userStr) as User;
      return { user, token, refreshToken: refreshTokenVal, isAuthenticated: true };
    }
  } catch {
    localStorage.removeItem("rasid_token");
    localStorage.removeItem("rasid_refresh_token");
    localStorage.removeItem("rasid_user");
  }
  return { user: null, token: null, refreshToken: null, isAuthenticated: false };
}

export const useAuthStore = create<AuthState>((set, get) => {
  const initial = getInitialState();
  return {
  user: initial.user,
  token: initial.token,
  refreshToken: initial.refreshToken,
  isLoading: false,
  isAuthenticated: initial.isAuthenticated,
  error: null,

  initialize: () => {
    if (typeof window === "undefined") return;

    const e2eSnapshot = ensureE2EAuthStorage();
    if (e2eSnapshot) {
      set({
        token: e2eSnapshot.token,
        refreshToken: e2eSnapshot.refreshToken,
        user: e2eSnapshot.user,
        isAuthenticated: true,
      });
      return;
    }

    const token = localStorage.getItem("rasid_token");
    const refreshTokenVal = localStorage.getItem("rasid_refresh_token");
    const userStr = localStorage.getItem("rasid_user");

    if (token && userStr) {
      try {
        const user = JSON.parse(userStr) as User;
        set({
          token,
          refreshToken: refreshTokenVal,
          user,
          isAuthenticated: true,
        });
      } catch {
        // Corrupted data, clear everything
        localStorage.removeItem("rasid_token");
        localStorage.removeItem("rasid_refresh_token");
        localStorage.removeItem("rasid_user");
        set({ token: null, refreshToken: null, user: null, isAuthenticated: false });
      }
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });

    try {
      const response = await governanceApi.post("/auth/login", {
        email,
        password,
      });

      // API returns { success, data: { accessToken, refreshToken, user } }
      const payload = response.data.data || response.data;
      const { accessToken: token, token: tokenAlt, refreshToken: rt, user } = payload;
      const finalToken = token || tokenAlt;

      if (typeof window !== "undefined") {
        localStorage.setItem("rasid_token", finalToken);
        if (rt) localStorage.setItem("rasid_refresh_token", rt);
        localStorage.setItem("rasid_user", JSON.stringify(user));
      }

      set({
        user,
        token: finalToken,
        refreshToken: rt || null,
        isLoading: false,
        isAuthenticated: true,
        error: null,
      });
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      const message =
        error?.response?.data?.message ||
        "فشل تسجيل الدخول. يرجى المحاولة مرة أخرى.";
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  logout: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("rasid_token");
      localStorage.removeItem("rasid_refresh_token");
      localStorage.removeItem("rasid_user");
    }
    set({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      error: null,
    });
  },

  refreshSession: async () => {
    if (isE2EAuthBypassed()) {
      const e2eSnapshot = ensureE2EAuthStorage();
      if (e2eSnapshot) {
        set({
          token: e2eSnapshot.token,
          refreshToken: e2eSnapshot.refreshToken,
          user: e2eSnapshot.user,
          isAuthenticated: true,
        });
      }
      return;
    }

    const currentRefreshToken = get().refreshToken;
    if (!currentRefreshToken) {
      get().logout();
      return;
    }

    try {
      const response = await governanceApi.post("/auth/refresh", {
        refreshToken: currentRefreshToken,
      });

      const refreshPayload = response.data.data || response.data;
      const { token, accessToken, refreshToken: newRt } = refreshPayload;
      const newToken = token || accessToken;

      if (typeof window !== "undefined" && newToken) {
        localStorage.setItem("rasid_token", newToken);
        if (newRt) localStorage.setItem("rasid_refresh_token", newRt);
      }

      set({
        token: newToken,
        refreshToken: newRt || currentRefreshToken,
      });
    } catch {
      get().logout();
    }
  },

  setUser: (user) =>
    set({
      user,
      isAuthenticated: !!user,
    }),

  clearError: () => set({ error: null }),
};
});
