import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/auth-store';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading, error, clearError } = useAuthStore();

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!username.trim() || !password.trim()) return;
      try {
        await login(username.trim(), password);
      } catch {
        // Error is in store
      }
    },
    [username, password, login]
  );

  return (
    <div
      className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden"
      dir="rtl"
    >
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          {/* Logo & Title */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-emerald-500 mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white">راصد</h1>
            <p className="text-sm text-white/50 mt-1">نظام التشغيل الذكي للمستندات والبيانات</p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center"
              >
                <p className="text-red-400 text-sm">{error}</p>
                <button
                  type="button"
                  onClick={clearError}
                  className="text-red-400/60 text-xs mt-1 hover:text-red-400 transition-colors"
                >
                  إغلاق
                </button>
              </motion.div>
            )}

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-white/70 mb-2">
                اسم المستخدم
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                placeholder="أدخل اسم المستخدم"
                autoComplete="username"
                autoFocus
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-white/70 mb-2">
                كلمة المرور
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                placeholder="أدخل كلمة المرور"
                autoComplete="current-password"
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !username.trim() || !password.trim()}
              className="w-full py-3 px-4 bg-gradient-to-l from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-medium rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
                    <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" opacity="0.75" />
                  </svg>
                  <span>جارٍ تسجيل الدخول...</span>
                </>
              ) : (
                <span>تسجيل الدخول</span>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-white/5 text-center">
            <p className="text-white/30 text-xs">
              راصد v2.0 — جميع الحقوق محفوظة
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
