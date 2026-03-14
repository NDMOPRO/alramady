/* RASID Visual DNA — Register Page
   Split layout matching Login page
   Fields: name, email, department, password, confirm password
   Local auth — no OAuth */
import { useState, useCallback } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { LOGOS, CHARACTERS } from '@/lib/assets';
import MaterialIcon from '@/components/MaterialIcon';

const DEPARTMENTS = [
  'إدارة البيانات الوطنية',
  'تحليل البيانات',
  'الرصد والمتابعة',
  'الامتثال والحوكمة',
  'التقنية والتطوير',
  'الشؤون الإدارية',
  'أخرى',
];

export default function Register() {
  const { register } = useAuth();
  const { theme } = useTheme();
  const [, navigate] = useLocation();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [department, setDepartment] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const logo = theme === 'dark' ? LOGOS.dark_header : LOGOS.light_header;

  const passwordStrength = (() => {
    if (!password) return { level: 0, label: '', color: '' };
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    if (score <= 1) return { level: 1, label: 'ضعيفة', color: 'bg-destructive' };
    if (score === 2) return { level: 2, label: 'متوسطة', color: 'bg-warning' };
    if (score === 3) return { level: 3, label: 'جيدة', color: 'bg-info' };
    return { level: 4, label: 'قوية', color: 'bg-success' };
  })();

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim() || !username.trim() || !password.trim()) {
      setError('يرجى تعبئة جميع الحقول المطلوبة');
      return;
    }
    if (password.length < 8) {
      setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
      return;
    }
    if (password !== confirmPassword) {
      setError('كلمة المرور وتأكيدها غير متطابقتين');
      return;
    }
    if (!agreed) {
      setError('يرجى الموافقة على الشروط والأحكام');
      return;
    }

    setLoading(true);
    const result = await register({ name, username, password });
    setLoading(false);
    if (result.success) {
      navigate('/login');
    } else {
      setError(result.error || 'حدث خطأ في التسجيل');
    }
  }, [name, username, password, confirmPassword, department, agreed, register, navigate]);

  return (
    <div className="min-h-screen flex bg-background" dir="rtl">
      {/* Right Side — Form */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 sm:px-12 lg:px-16 py-8 overflow-y-auto">
        <div className="w-full max-w-[420px] animate-fade-in-up">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <img src={logo} alt="راصد" className="h-14 sm:h-16 object-contain animate-float-slow" />
          </div>

          {/* Title */}
          <div className="text-center mb-6">
            <h1 className="text-[22px] sm:text-[26px] font-bold text-foreground mb-1.5">إنشاء حساب جديد</h1>
            <p className="text-[13px] text-muted-foreground">انضم إلى منصة راصد البيانات الوطنية</p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-destructive/10 border border-destructive/20 animate-fade-in">
              <MaterialIcon icon="error" size={18} className="text-destructive shrink-0" />
              <span className="text-[12px] text-destructive font-medium">{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Name */}
            <div>
              <label className="block text-[12px] font-bold text-foreground mb-1.5">الاسم الكامل <span className="text-destructive">*</span></label>
              <div className="flex items-center gap-2 h-11 border border-border rounded-xl px-3.5 bg-card focus-within:border-primary/40 focus-within:shadow-md focus-within:shadow-primary/5 transition-all duration-200">
                <MaterialIcon icon="person" size={18} className="text-muted-foreground shrink-0" />
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="أدخل اسمك الكامل"
                  className="flex-1 bg-transparent text-[13px] outline-none text-foreground placeholder:text-muted-foreground"
                />
              </div>
            </div>

            {/* Username */}
            <div>
              <label className="block text-[12px] font-bold text-foreground mb-1.5">اسم المستخدم <span className="text-destructive">*</span></label>
              <div className="flex items-center gap-2 h-11 border border-border rounded-xl px-3.5 bg-card focus-within:border-primary/40 focus-within:shadow-md focus-within:shadow-primary/5 transition-all duration-200">
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

            {/* Department */}
            <div>
              <label className="block text-[12px] font-bold text-foreground mb-1.5">القسم / الإدارة</label>
              <div className="flex items-center gap-2 h-11 border border-border rounded-xl px-3.5 bg-card focus-within:border-primary/40 focus-within:shadow-md focus-within:shadow-primary/5 transition-all duration-200">
                <MaterialIcon icon="business" size={18} className="text-muted-foreground shrink-0" />
                <select
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                  className="flex-1 bg-transparent text-[13px] outline-none text-foreground appearance-none cursor-pointer"
                >
                  <option value="">اختر القسم</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <MaterialIcon icon="expand_more" size={18} className="text-muted-foreground" />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[12px] font-bold text-foreground mb-1.5">كلمة المرور <span className="text-destructive">*</span></label>
              <div className="flex items-center gap-2 h-11 border border-border rounded-xl px-3.5 bg-card focus-within:border-primary/40 focus-within:shadow-md focus-within:shadow-primary/5 transition-all duration-200">
                <MaterialIcon icon="lock" size={18} className="text-muted-foreground shrink-0" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="8 أحرف على الأقل"
                  className="flex-1 bg-transparent text-[13px] outline-none text-foreground placeholder:text-muted-foreground"
                  dir="ltr"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <MaterialIcon icon={showPassword ? 'visibility_off' : 'visibility'} size={18} />
                </button>
              </div>
              {/* Strength indicator */}
              {password && (
                <div className="flex items-center gap-2 mt-1.5 animate-fade-in">
                  <div className="flex-1 flex gap-1">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= passwordStrength.level ? passwordStrength.color : 'bg-border'}`} />
                    ))}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{passwordStrength.label}</span>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-[12px] font-bold text-foreground mb-1.5">تأكيد كلمة المرور <span className="text-destructive">*</span></label>
              <div className={`flex items-center gap-2 h-11 border rounded-xl px-3.5 bg-card transition-all duration-200 ${
                confirmPassword && confirmPassword !== password ? 'border-destructive/40' : 'border-border focus-within:border-primary/40 focus-within:shadow-md focus-within:shadow-primary/5'
              }`}>
                <MaterialIcon icon="lock" size={18} className="text-muted-foreground shrink-0" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="أعد إدخال كلمة المرور"
                  className="flex-1 bg-transparent text-[13px] outline-none text-foreground placeholder:text-muted-foreground"
                  dir="ltr"
                />
                {confirmPassword && (
                  <MaterialIcon
                    icon={confirmPassword === password ? 'check_circle' : 'cancel'}
                    size={18}
                    className={confirmPassword === password ? 'text-success' : 'text-destructive'}
                  />
                )}
              </div>
            </div>

            {/* Terms */}
            <label className="flex items-start gap-2 cursor-pointer pt-1">
              <div
                onClick={() => setAgreed(!agreed)}
                className={`w-4.5 h-4.5 rounded-md border-2 flex items-center justify-center transition-all duration-200 mt-0.5 shrink-0 ${
                  agreed ? 'bg-primary border-primary' : 'border-border hover:border-primary/40'
                }`}
              >
                {agreed && <MaterialIcon icon="check" size={12} className="text-primary-foreground" />}
              </div>
              <span className="text-[11px] text-muted-foreground leading-relaxed">
                أوافق على <button type="button" className="text-primary hover:underline font-medium">الشروط والأحكام</button> و<button type="button" className="text-primary hover:underline font-medium">سياسة الخصوصية</button>
              </span>
            </label>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-primary text-primary-foreground rounded-xl text-[14px] font-bold hover:opacity-90 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
            >
              {loading ? (
                <>
                  <MaterialIcon icon="progress_activity" size={18} className="animate-icon-spin" />
                  جاري إنشاء الحساب...
                </>
              ) : (
                <>
                  <MaterialIcon icon="person_add" size={18} />
                  إنشاء حساب
                </>
              )}
            </button>
          </form>

          {/* Login Link */}
          <div className="text-center mt-5">
            <span className="text-[13px] text-muted-foreground">لديك حساب بالفعل؟ </span>
            <Link href="/login" className="text-[13px] text-primary hover:underline font-bold">
              تسجيل الدخول
            </Link>
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
        <div className="absolute top-[10%] left-[10%] w-64 h-64 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, oklch(0.72 0.14 75), transparent)' }}
        />
        <div className="absolute bottom-[20%] right-[5%] w-48 h-48 rounded-full opacity-8"
          style={{ background: 'radial-gradient(circle, oklch(0.58 0.14 250), transparent)' }}
        />

        <div className="relative z-10 text-center px-12 animate-fade-in-up">
          <img
            src={CHARACTERS.char5_arms_crossed}
            alt="راصد"
            className="w-52 h-auto mx-auto mb-8 animate-float-slow drop-shadow-2xl"
          />
          <h2 className="text-[24px] font-bold text-white mb-3">انضم إلى فريق راصد</h2>
          <p className="text-[14px] text-white/70 leading-relaxed max-w-[300px] mx-auto">
            ابدأ رحلتك في تحليل ورصد البيانات الوطنية مع أدوات ذكية ومتقدمة
          </p>
        </div>
      </div>
    </div>
  );
}
