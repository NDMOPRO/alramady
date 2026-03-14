/**
 * RASID Auth Context — مصادقة حقيقية عبر governance-service
 * لا DEMO_USERS — لا mock — لا بيانات وهمية
 * تسجيل الدخول بالـ username (وليس email)
 */
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { governanceService } from '@/services/governanceService';

export type UserRole = 'root_admin' | 'admin' | 'editor' | 'viewer' | 'analyst';

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  role: UserRole;
  avatar?: string;
  department?: string;
  lastLogin?: string;
  status: 'active' | 'inactive' | 'suspended';
  permissions: string[];
  isOwner?: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  forgotPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  resetPassword: (token: string, password: string) => Promise<{ success: boolean; error?: string }>;
  updateProfile: (data: Partial<User>) => void;
}

interface RegisterData {
  name: string;
  username: string;
  password: string;
  email?: string;
  department?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapApiUser(apiUser: Record<string, unknown>): User {
  const isOwner = Boolean(apiUser.isOwner || apiUser.is_owner);
  const role = isOwner ? 'root_admin' : ((apiUser.role as string) || 'viewer');
  return {
    id: (apiUser.id as string) || '',
    name: (apiUser.display_name_ar as string) || (apiUser.displayName as string) || (apiUser.name as string) || (apiUser.username as string) || '',
    username: (apiUser.username as string) || (apiUser.name as string) || '',
    email: (apiUser.email as string) || '',
    role: role as UserRole,
    avatar: (apiUser.avatarUrl as string) || (apiUser.avatar_url as string) || undefined,
    department: (apiUser.department as string) || undefined,
    lastLogin: (apiUser.lastLoginAt as string) || (apiUser.last_login_at as string) || undefined,
    status: 'active',
    permissions: (apiUser.permissions as string[]) || [],
    isOwner,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // استعادة الجلسة من localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('rasid_auth');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.token && parsed.user) {
          setUser(mapApiUser(parsed.user));
        }
      }
    } catch { /* ignore */ }
    setIsLoading(false);
  }, []);

  // تسجيل الدخول — بالـ username
  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const result = await governanceService.login(username.trim(), password);
      if (result.success && result.data) {
        const { accessToken, refreshToken, user: apiUser } = result.data;
        const mappedUser = mapApiUser(apiUser as unknown as Record<string, unknown>);
        localStorage.setItem('rasid_auth', JSON.stringify({
          token: accessToken,
          refreshToken,
          user: apiUser,
        }));
        setUser(mappedUser);
        setIsLoading(false);
        return { success: true };
      }
      setIsLoading(false);
      return { success: false, error: 'فشل تسجيل الدخول' };
    } catch (err: unknown) {
      setIsLoading(false);
      const message = (err as Error)?.message || 'خطأ في الاتصال بالخادم';
      return { success: false, error: message };
    }
  }, []);

  // إنشاء حساب جديد
  const register = useCallback(async (data: RegisterData) => {
    setIsLoading(true);
    try {
      const result = await governanceService.register({
        username: data.username.trim(),
        password: data.password,
        email: data.email,
        name: data.name,
      });
      setIsLoading(false);
      if (result.success) {
        return { success: true };
      }
      return { success: false, error: (result as { message?: string }).message || 'فشل إنشاء الحساب' };
    } catch (err: unknown) {
      setIsLoading(false);
      return { success: false, error: (err as Error)?.message || 'خطأ في الاتصال' };
    }
  }, []);

  // تسجيل الخروج
  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('rasid_auth');
    localStorage.removeItem('rasid_user');
  }, []);

  // نسيت كلمة المرور
  const forgotPassword = useCallback(async (email: string) => {
    try {
      const result = await governanceService.forgotPassword(email.trim());
      return { success: result.success };
    } catch (err: unknown) {
      return { success: false, error: (err as Error)?.message || 'خطأ في الاتصال' };
    }
  }, []);

  // إعادة تعيين كلمة المرور
  const resetPassword = useCallback(async (token: string, password: string) => {
    try {
      const result = await governanceService.resetPassword(token, password);
      return { success: result.success };
    } catch (err: unknown) {
      return { success: false, error: (err as Error)?.message || 'خطأ في الاتصال' };
    }
  }, []);

  // تحديث الملف الشخصي
  const updateProfile = useCallback((data: Partial<User>) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...data };
      const stored = localStorage.getItem('rasid_auth');
      if (stored) {
        const parsed = JSON.parse(stored);
        parsed.user = { ...parsed.user, ...data };
        localStorage.setItem('rasid_auth', JSON.stringify(parsed));
      }
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      register,
      logout,
      forgotPassword,
      resetPassword,
      updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
