/* RASID Visual DNA — Forgot Password Page
   Email input with OTP verification step
   Matching auth page design */
import { useState, useCallback } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { LOGOS, CHARACTERS } from '@/lib/assets';
import MaterialIcon from '@/components/MaterialIcon';

type Step = 'email' | 'otp' | 'reset' | 'success';

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const { theme } = useTheme();
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const logo = theme === 'dark' ? LOGOS.dark_header : LOGOS.light_header;

  const handleEmailSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('يرجى إدخال البريد الإلكتروني');
      return;
    }
    setLoading(true);
    const result = await forgotPassword(email);
    setLoading(false);
    if (result.success) {
      setStep('otp');
    } else {
      setError(result.error || 'حدث خطأ');
    }
  }, [email, forgotPassword]);

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    // Auto-focus next
    if (value && index < 5) {
      const next = document.getElementById(`otp-${index + 1}`);
      next?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const prev = document.getElementById(`otp-${index - 1}`);
      prev?.focus();
    }
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const code = otp.join('');
    if (code.length < 6) {
      setError('يرجى إدخال رمز التحقق كاملاً');
      return;
    }
    // Demo: accept any 6-digit code
    setStep('reset');
  };

  const handleResetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('كلمة المرور وتأكيدها غير متطابقتين');
      return;
    }
    setStep('success');
  };

  const stepConfig = {
    email: { icon: 'mail', title: 'استرجاع كلمة المرور', desc: 'أدخل بريدك الإلكتروني لإرسال رمز التحقق' },
    otp: { icon: 'pin', title: 'رمز التحقق', desc: `تم إرسال رمز التحقق إلى ${email}` },
    reset: { icon: 'lock_reset', title: 'كلمة مرور جديدة', desc: 'أدخل كلمة المرور الجديدة' },
    success: { icon: 'check_circle', title: 'تم بنجاح', desc: 'تم تغيير كلمة المرور بنجاح' },
  };

  const current = stepConfig[step];

  return (
    <div className="min-h-screen flex bg-background" dir="rtl">
      {/* Right Side — Form */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 sm:px-12 lg:px-16 py-8">
        <div className="w-full max-w-[420px] animate-fade-in-up">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <img src={logo} alt="راصد" className="h-14 sm:h-16 object-contain" />
          </div>

          {/* Step Progress */}
          <div className="flex items-center justify-center gap-1 mb-6">
            {(['email', 'otp', 'reset', 'success'] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                <div className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                  step === s ? 'bg-primary scale-125' :
                  (['email', 'otp', 'reset', 'success'].indexOf(step) > i) ? 'bg-primary/40' : 'bg-border'
                }`} />
                {i < 3 && <div className={`w-8 h-0.5 rounded-full transition-all duration-300 ${
                  (['email', 'otp', 'reset', 'success'].indexOf(step) > i) ? 'bg-primary/40' : 'bg-border'
                }`} />}
              </div>
            ))}
          </div>

          {/* Header Icon */}
          <div className="flex justify-center mb-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
              step === 'success' ? 'bg-success/10' : 'bg-primary/10'
            }`}>
              <MaterialIcon icon={current.icon} size={32} className={step === 'success' ? 'text-success' : 'text-primary'} />
            </div>
          </div>

          <div className="text-center mb-6">
            <h1 className="text-[22px] font-bold text-foreground mb-1.5">{current.title}</h1>
            <p className="text-[13px] text-muted-foreground">{current.desc}</p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-destructive/10 border border-destructive/20 animate-fade-in">
              <MaterialIcon icon="error" size={18} className="text-destructive shrink-0" />
              <span className="text-[12px] text-destructive font-medium">{error}</span>
            </div>
          )}

          {/* Step: Email */}
          {step === 'email' && (
            <form onSubmit={handleEmailSubmit} className="space-y-4 animate-fade-in-up">
              <div>
                <label className="block text-[12px] font-bold text-foreground mb-1.5">البريد الإلكتروني</label>
                <div className="flex items-center gap-2 h-12 border border-border rounded-xl px-4 bg-card focus-within:border-primary/40 focus-within:shadow-md focus-within:shadow-primary/5 transition-all duration-200">
                  <MaterialIcon icon="mail" size={18} className="text-muted-foreground shrink-0" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="example@ndmo.gov.sa"
                    className="flex-1 bg-transparent text-[13px] outline-none text-foreground placeholder:text-muted-foreground"
                    dir="ltr"
                    autoFocus
                  />
                </div>
              </div>
              <button type="submit" disabled={loading}
                className="w-full h-12 bg-primary text-primary-foreground rounded-xl text-[14px] font-bold hover:opacity-90 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
              >
                {loading ? (
                  <><MaterialIcon icon="progress_activity" size={18} className="animate-icon-spin" /> جاري الإرسال...</>
                ) : (
                  <><MaterialIcon icon="send" size={18} /> إرسال رمز التحقق</>
                )}
              </button>
            </form>
          )}

          {/* Step: OTP */}
          {step === 'otp' && (
            <form onSubmit={handleOtpSubmit} className="space-y-5 animate-fade-in-up">
              <div className="flex justify-center gap-2" dir="ltr">
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    id={`otp-${i}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleOtpChange(i, e.target.value.replace(/\D/g, ''))}
                    onKeyDown={e => handleOtpKeyDown(i, e)}
                    className="w-12 h-14 text-center text-[20px] font-bold text-foreground bg-card border border-border rounded-xl outline-none focus:border-primary focus:shadow-md focus:shadow-primary/10 transition-all duration-200"
                    autoFocus={i === 0}
                  />
                ))}
              </div>
              <button type="submit"
                className="w-full h-12 bg-primary text-primary-foreground rounded-xl text-[14px] font-bold hover:opacity-90 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
              >
                <MaterialIcon icon="verified" size={18} /> تحقق
              </button>
              <button type="button" onClick={() => setStep('email')} className="w-full text-[12px] text-muted-foreground hover:text-primary transition-colors">
                لم تستلم الرمز؟ أعد الإرسال
              </button>
            </form>
          )}

          {/* Step: Reset */}
          {step === 'reset' && (
            <form onSubmit={handleResetSubmit} className="space-y-4 animate-fade-in-up">
              <div>
                <label className="block text-[12px] font-bold text-foreground mb-1.5">كلمة المرور الجديدة</label>
                <div className="flex items-center gap-2 h-12 border border-border rounded-xl px-4 bg-card focus-within:border-primary/40 focus-within:shadow-md focus-within:shadow-primary/5 transition-all duration-200">
                  <MaterialIcon icon="lock" size={18} className="text-muted-foreground shrink-0" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="8 أحرف على الأقل"
                    className="flex-1 bg-transparent text-[13px] outline-none text-foreground placeholder:text-muted-foreground"
                    dir="ltr"
                    autoFocus
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-muted-foreground hover:text-foreground transition-colors">
                    <MaterialIcon icon={showPassword ? 'visibility_off' : 'visibility'} size={18} />
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-bold text-foreground mb-1.5">تأكيد كلمة المرور</label>
                <div className="flex items-center gap-2 h-12 border border-border rounded-xl px-4 bg-card focus-within:border-primary/40 focus-within:shadow-md focus-within:shadow-primary/5 transition-all duration-200">
                  <MaterialIcon icon="lock" size={18} className="text-muted-foreground shrink-0" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="أعد إدخال كلمة المرور"
                    className="flex-1 bg-transparent text-[13px] outline-none text-foreground placeholder:text-muted-foreground"
                    dir="ltr"
                  />
                </div>
              </div>
              <button type="submit"
                className="w-full h-12 bg-primary text-primary-foreground rounded-xl text-[14px] font-bold hover:opacity-90 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
              >
                <MaterialIcon icon="lock_reset" size={18} /> تغيير كلمة المرور
              </button>
            </form>
          )}

          {/* Step: Success */}
          {step === 'success' && (
            <div className="text-center animate-bounce-in">
              <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
                <MaterialIcon icon="check_circle" size={40} className="text-success" />
              </div>
              <p className="text-[14px] text-muted-foreground mb-6">يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة</p>
              <button
                onClick={() => navigate('/login')}
                className="w-full h-12 bg-primary text-primary-foreground rounded-xl text-[14px] font-bold hover:opacity-90 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
              >
                <MaterialIcon icon="login" size={18} /> تسجيل الدخول
              </button>
            </div>
          )}

          {/* Back to login */}
          {step !== 'success' && (
            <div className="text-center mt-6">
              <Link href="/login" className="text-[13px] text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-1">
                <MaterialIcon icon="arrow_forward" size={16} />
                العودة لتسجيل الدخول
              </Link>
            </div>
          )}
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
        <div className="absolute top-[15%] right-[15%] w-56 h-56 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, oklch(0.72 0.14 75), transparent)' }}
        />
        <div className="relative z-10 text-center px-12 animate-fade-in-up">
          <img
            src={CHARACTERS.char2_shmagh}
            alt="راصد"
            className="w-48 h-auto mx-auto mb-8 animate-float-slow drop-shadow-2xl"
          />
          <h2 className="text-[24px] font-bold text-white mb-3">لا تقلق!</h2>
          <p className="text-[14px] text-white/70 leading-relaxed max-w-[300px] mx-auto">
            سنساعدك في استرجاع حسابك بخطوات بسيطة وآمنة
          </p>
        </div>
      </div>
    </div>
  );
}
