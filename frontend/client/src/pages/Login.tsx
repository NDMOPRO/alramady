/* RASID Visual DNA — Login Page
   Split layout: form (right) + branded visual (left)
   Mobile: full-width form with logo on top
   Local auth only — no OAuth */
import { useState, useCallback } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { LOGOS, CHARACTERS } from '@/lib/assets';
import MaterialIcon from '@/components/MaterialIcon';

export default function Login() {
  const { login } = useAuth();
  const { theme } = useTheme();
  const [, navigate] = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const logo = theme === 'dark' ? LOGOS.dark_header : LOGOS.light_header;

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password.trim()) {
      setError('يرجى إدخال اسم المستخدم وكلمة المرور');
      return;
    }
    setLoading(true);
    const result = await login(username, password);
    setLoading(false);
    if (result.success) {
      navigate('/');
    } else {
      setError(result.error || 'حدث خطأ في تسجيل الدخول');
    }
  }, [username, password, login, navigate]);

  return (
    <div className="min-h-screen flex bg-background" dir="rtl">
      {/* Right Side — Form */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 sm:px-12 lg:px-16 py-8">
        <div className="w-full max-w-[420px] animate-fade-in-up">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <img src={logo} alt="راصد" className="h-16 sm:h-20 object-contain animate-float-slow" />
          </div>

          {/* Welcome Text */}
          <div className="text-center mb-8">
            <h1 className="text-[24px] sm:text-[28px] font-bold text-foreground mb-2">مرحباً بك في راصد</h1>
            <p className="text-[14px] text-muted-foreground">سجّل دخولك للوصول إلى منصة البيانات الوطنية</p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 mb-5 rounded-xl bg-destructive/10 border border-destructive/20 animate-fade-in">
              <MaterialIcon icon="error" size={18} className="text-destructive shrink-0" />
              <span className="text-[12px] text-destructive font-medium">{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-[12px] font-bold text-foreground mb-1.5">اسم المستخدم</label>
              <div className="flex items-center gap-2 h-12 border border-border rounded-xl px-4 bg-card focus-within:border-primary/40 focus-within:shadow-md focus-within:shadow-primary/5 transition-all duration-200">
                <MaterialIcon icon="person" size={18} className="text-muted-foreground shrink-0" />
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="اسم المستخدم"
                  className="flex-1 bg-transparent text-[13px] outline-none text-foreground placeholder:text-muted-foreground"
                  autoComplete="username"
                  dir="ltr"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[12px] font-bold text-foreground mb-1.5">كلمة المرور</label>
              <div className="flex items-center gap-2 h-12 border border-border rounded-xl px-4 bg-card focus-within:border-primary/40 focus-within:shadow-md focus-within:shadow-primary/5 transition-all duration-200">
                <MaterialIcon icon="lock" size={18} className="text-muted-foreground shrink-0" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور"
                  className="flex-1 bg-transparent text-[13px] outline-none text-foreground placeholder:text-muted-foreground"
                  autoComplete="current-password"
                  dir="ltr"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <MaterialIcon icon={showPassword ? 'visibility_off' : 'visibility'} size={18} />
                </button>
              </div>
            </div>

            {/* Remember + Forgot */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => setRememberMe(!rememberMe)}
                  className={`w-4.5 h-4.5 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${
                    rememberMe ? 'bg-primary border-primary' : 'border-border hover:border-primary/40'
                  }`}
                >
                  {rememberMe && <MaterialIcon icon="check" size={12} className="text-primary-foreground" />}
                </div>
                <span className="text-[12px] text-muted-foreground">تذكرني</span>
              </label>
              <Link href="/forgot-password" className="text-[12px] text-primary hover:underline font-medium">
                نسيت كلمة المرور؟
              </Link>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-primary text-primary-foreground rounded-xl text-[14px] font-bold hover:opacity-90 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
            >
              {loading ? (
                <>
                  <MaterialIcon icon="progress_activity" size={18} className="animate-icon-spin" />
                  جاري تسجيل الدخول...
                </>
              ) : (
                <>
                  <MaterialIcon icon="login" size={18} />
                  تسجيل الدخول
                </>
              )}
            </button>
          </form>

          {/* Register Link */}
          <div className="text-center mt-6">
            <span className="text-[13px] text-muted-foreground">ليس لديك حساب؟ </span>
            <Link href="/register" className="text-[13px] text-primary hover:underline font-bold">
              إنشاء حساب جديد
            </Link>
          </div>

          {/* Demo Credentials */}
          <div className="mt-8 p-4 rounded-xl bg-accent/50 border border-border">
            <p className="text-[11px] font-bold text-foreground mb-2 flex items-center gap-1.5">
              <MaterialIcon icon="info" size={14} className="text-primary" />
              بيانات تجريبية للدخول
            </p>
            <div className="space-y-1.5">
              {[
                { label: 'مدير النظام', email: 'admin@ndmo.gov.sa', pass: 'admin123' },
                { label: 'محرر', email: 'editor@ndmo.gov.sa', pass: 'editor123' },
                { label: 'مشاهد', email: 'viewer@ndmo.gov.sa', pass: 'viewer123' },
              ].map(cred => (
                <button
                  key={cred.email}
                  type="button"
                  onClick={() => { setEmail(cred.email); setPassword(cred.pass); }}
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-accent transition-all text-right"
                >
                  <span className="text-[11px] font-medium text-foreground">{cred.label}</span>
                  <span className="text-[10px] text-muted-foreground font-mono" dir="ltr">{cred.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Left Side — Branded Visual (hidden on mobile) */}
      <div className="hidden lg:flex w-[45%] relative overflow-hidden items-center justify-center"
        style={{
          background: theme === 'dark'
            ? 'linear-gradient(135deg, oklch(0.20 0.06 250), oklch(0.14 0.04 250))'
            : 'linear-gradient(135deg, oklch(0.28 0.08 250), oklch(0.22 0.06 250))',
        }}
      >
        {/* Decorative circles */}
        <div className="absolute top-[10%] right-[10%] w-64 h-64 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, oklch(0.72 0.14 75), transparent)' }}
        />
        <div className="absolute bottom-[15%] left-[5%] w-48 h-48 rounded-full opacity-8"
          style={{ background: 'radial-gradient(circle, oklch(0.58 0.14 250), transparent)' }}
        />

        <div className="relative z-10 text-center px-12 animate-fade-in-up">
          <img
            src={CHARACTERS.char6_standing}
            alt="راصد"
            className="w-56 h-auto mx-auto mb-8 animate-float-slow drop-shadow-2xl"
          />
          <h2 className="text-[26px] font-bold text-white mb-3">منصة راصد البيانات</h2>
          <p className="text-[14px] text-white/70 leading-relaxed max-w-[320px] mx-auto">
            أداتك الذكية لرصد وتحليل البيانات الوطنية — أحد مبادرات مكتب إدارة البيانات الوطنية
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-2 mt-8">
            {['تحليل ذكي', 'تقارير احترافية', 'لوحات مؤشرات', 'مطابقة بصرية'].map(f => (
              <span key={f} className="px-3 py-1.5 rounded-full text-[11px] font-medium text-white/90 bg-white/10 backdrop-blur-sm border border-white/10">
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
