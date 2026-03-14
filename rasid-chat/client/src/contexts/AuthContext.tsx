/* RASID Visual DNA — Auth Context
   Local authentication system (no OAuth)
   Manages user state, login, register, logout, password recovery */
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export type UserRole = 'admin' | 'editor' | 'viewer' | 'analyst';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  department?: string;
  lastLogin?: string;
  status: 'active' | 'inactive' | 'suspended';
  permissions: string[];
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  forgotPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  resetPassword: (token: string, password: string) => Promise<{ success: boolean; error?: string }>;
  updateProfile: (data: Partial<User>) => void;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  department?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Demo users for local simulation
const DEMO_USERS: (User & { password: string })[] = [
  {
    id: '1',
    name: 'أحمد المالكي',
    email: 'admin@ndmo.gov.sa',
    password: 'admin123',
    role: 'admin',
    department: 'إدارة البيانات الوطنية',
    status: 'active',
    lastLogin: '2026-03-13T10:00:00',
    permissions: ['manage_users', 'manage_content', 'manage_roles', 'view_analytics', 'manage_settings', 'manage_data', 'create_reports', 'approve_content'],
  },
  {
    id: '2',
    name: 'سارة العتيبي',
    email: 'editor@ndmo.gov.sa',
    password: 'editor123',
    role: 'editor',
    department: 'تحليل البيانات',
    status: 'active',
    lastLogin: '2026-03-12T14:30:00',
    permissions: ['manage_content', 'view_analytics', 'manage_data', 'create_reports'],
  },
  {
    id: '3',
    name: 'خالد الشمري',
    email: 'viewer@ndmo.gov.sa',
    password: 'viewer123',
    role: 'viewer',
    department: 'الرصد والمتابعة',
    status: 'active',
    lastLogin: '2026-03-11T09:15:00',
    permissions: ['view_analytics', 'view_data'],
  },
];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for stored session on mount
  useEffect(() => {
    const stored = localStorage.getItem('rasid_user');
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch { /* ignore */ }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    // Simulate API delay
    await new Promise(r => setTimeout(r, 800));
    
    const found = DEMO_USERS.find(u => u.email === email && u.password === password);
    if (found) {
      const { password: _, ...userData } = found;
      setUser(userData);
      localStorage.setItem('rasid_user', JSON.stringify(userData));
      setIsLoading(false);
      return { success: true };
    }
    setIsLoading(false);
    return { success: false, error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' };
  }, []);

  const register = useCallback(async (data: RegisterData) => {
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 800));
    
    const exists = DEMO_USERS.find(u => u.email === data.email);
    if (exists) {
      setIsLoading(false);
      return { success: false, error: 'البريد الإلكتروني مسجل مسبقاً' };
    }

    const newUser: User = {
      id: String(Date.now()),
      name: data.name,
      email: data.email,
      role: 'viewer',
      department: data.department || '',
      status: 'active',
      lastLogin: new Date().toISOString(),
      permissions: ['view_analytics', 'view_data'],
    };
    setUser(newUser);
    localStorage.setItem('rasid_user', JSON.stringify(newUser));
    setIsLoading(false);
    return { success: true };
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('rasid_user');
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    await new Promise(r => setTimeout(r, 800));
    const found = DEMO_USERS.find(u => u.email === email);
    if (found) {
      return { success: true };
    }
    return { success: false, error: 'البريد الإلكتروني غير مسجل في النظام' };
  }, []);

  const resetPassword = useCallback(async (_token: string, _password: string) => {
    await new Promise(r => setTimeout(r, 800));
    return { success: true };
  }, []);

  const updateProfile = useCallback((data: Partial<User>) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...data };
      localStorage.setItem('rasid_user', JSON.stringify(updated));
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
