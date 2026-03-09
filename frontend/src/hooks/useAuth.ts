'use client';

import { useAuthStore } from '@/lib/stores/auth-store';

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const refreshSession = useAuthStore((s) => s.refreshSession);
  const clearError = useAuthStore((s) => s.clearError);

  return {
    user,
    token,
    isLoading,
    error,
    isAuthenticated,
    login,
    logout,
    refreshToken: refreshSession,
    clearError,
  };
}
