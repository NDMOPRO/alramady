/* RASID Visual DNA — Profile Page
   Sections: Avatar + Info card, Personal Info form, Password change, Sessions, Activity log
   Avatar: click-to-upload with crop preview simulation
   Fully mobile responsive */
import { useState, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { LOGOS, CHARACTERS } from '@/lib/assets';
import MaterialIcon from '@/components/MaterialIcon';
import { toast } from 'sonner';

type Tab = 'info' | 'security' | 'sessions' | 'activity';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'info', label: 'المعلومات الشخصية', icon: 'person' },
  { id: 'security', label: 'الأمان', icon: 'lock' },
  { id: 'sessions', label: 'الجلسات', icon: 'devices' },
  { id: 'activity', label: 'سجل النشاط', icon: 'history' },
];

const DEPARTMENTS = [
  'إدارة البيانات الوطنية',
  'تحليل البيانات',
  'الرصد والمتابعة',
  'الامتثال والحوكمة',
  'التقنية والتطوير',
  'الشؤون الإدارية',
  'أخرى',
];

const DEMO_SESSIONS = [
  { id: '1', device: 'Chrome — Windows 11', ip: '10.0.1.45', location: 'الرياض، السعودية', lastActive: 'نشط الآن', current: true },
  { id: '2', device: 'Safari — iPhone 15', ip: '10.0.1.78', location: 'الرياض، السعودية', lastActive: 'منذ ساعتين', current: false },
  { id: '3', device: 'Firefox — macOS', ip: '10.0.2.12', location: 'جدة، السعودية', lastActive: 'أمس 14:30', current: false },
];

const DEMO_ACTIVITY = [
  { id: '1', action: 'تسجيل دخول', detail: 'Chrome — Windows 11', time: '2026-03-13 10:30', icon: 'login', color: '#2563eb' },
  { id: '2', action: 'تعديل الملف الشخصي', detail: 'تم تحديث الاسم والقسم', time: '2026-03-12 16:45', icon: 'edit', color: '#059669' },
  { id: '3', action: 'تغيير كلمة المرور', detail: 'تم تغيير كلمة المرور بنجاح', time: '2026-03-10 09:20', icon: 'lock', color: '#d97706' },
  { id: '4', action: 'إنشاء تقرير', detail: 'تقرير نضج البيانات Q4', time: '2026-03-08 11:00', icon: 'description', color: '#7c3aed' },
  { id: '5', action: 'تصدير بيانات', detail: 'تصدير جدول الامتثال — CSV', time: '2026-03-05 14:15', icon: 'download', color: '#0891b2' },
  { id: '6', action: 'مشاركة لوحة مؤشرات', detail: 'لوحة مؤشرات الامتثال — 3 مستلمين', time: '2026-03-03 10:00', icon: 'share', color: '#dc2626' },
  { id: '7', action: 'تسجيل دخول', detail: 'Safari — iPhone 15', time: '2026-03-01 08:45', icon: 'login', color: '#2563eb' },
];

// Avatar options — RASID characters as selectable avatars
const AVATAR_OPTIONS = [
  { id: 'char1', url: CHARACTERS.char1_waving, label: 'راصد يلوّح' },
  { id: 'char2', url: CHARACTERS.char2_shmagh, label: 'راصد بالشماغ' },
  { id: 'char4', url: CHARACTERS.char4_sunglasses, label: 'راصد بالنظارة' },
  { id: 'char5', url: CHARACTERS.char5_arms_crossed, label: 'راصد واثق' },
  { id: 'char6', url: CHARACTERS.char6_standing, label: 'راصد واقف' },
];

export default function Profile() {
  const { user, updateProfile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>('info');

  // Form states
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [saving, setSaving] = useState(false);

  // Avatar states
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar || '');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const logo = theme === 'dark' ? LOGOS.dark_header : LOGOS.light_header;

  const roleLabels: Record<string, { label: string; color: string }> = {
    admin: { label: 'مدير النظام', color: '#dc2626' },
    editor: { label: 'محرر', color: '#2563eb' },
    analyst: { label: 'محلل', color: '#7c3aed' },
    viewer: { label: 'مشاهد', color: '#059669' },
  };

  const userRole = roleLabels[user?.role || 'viewer'];

  const handleSaveInfo = useCallback(async () => {
    if (!name.trim()) {
      toast.error('يرجى إدخال الاسم');
      return;
    }
    if (!email.trim()) {
      toast.error('يرجى إدخال البريد الإلكتروني');
      return;
    }
    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    updateProfile({ name: name.trim(), email: email.trim(), department, avatar: avatarUrl || undefined });
    setSaving(false);
    toast.success('تم حفظ التعديلات بنجاح');
  }, [name, email, department, avatarUrl, updateProfile]);

  const handleChangePassword = useCallback(async () => {
    if (!currentPassword) {
      toast.error('يرجى إدخال كلمة المرور الحالية');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('كلمة المرور الجديدة وتأكيدها غير متطابقتين');
      return;
    }
    setChangingPassword(true);
    await new Promise(r => setTimeout(r, 800));
    setChangingPassword(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    toast.success('تم تغيير كلمة المرور بنجاح');
  }, [currentPassword, newPassword, confirmPassword]);

  const handleAvatarSelect = (url: string) => {
    setAvatarUrl(url);
    setShowAvatarPicker(false);
    updateProfile({ avatar: url });
    toast.success('تم تحديث الصورة الرمزية');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('يرجى اختيار ملف صورة');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('حجم الصورة يجب أن لا يتجاوز 5 ميجابايت');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setAvatarUrl(dataUrl);
      setShowAvatarPicker(false);
      updateProfile({ avatar: dataUrl });
      toast.success('تم رفع الصورة بنجاح');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    setAvatarUrl('');
    updateProfile({ avatar: undefined });
    setShowAvatarPicker(false);
    toast.success('تم إزالة الصورة الرمزية');
  };

  const passwordStrength = (() => {
    if (!newPassword) return { level: 0, label: '', color: '' };
    let score = 0;
    if (newPassword.length >= 8) score++;
    if (/[A-Z]/.test(newPassword)) score++;
    if (/[0-9]/.test(newPassword)) score++;
    if (/[^A-Za-z0-9]/.test(newPassword)) score++;
    if (score <= 1) return { level: 1, label: 'ضعيفة', color: 'bg-destructive' };
    if (score === 2) return { level: 2, label: 'متوسطة', color: 'bg-warning' };
    if (score === 3) return { level: 3, label: 'جيدة', color: 'bg-info' };
    return { level: 4, label: 'قوية', color: 'bg-success' };
  })();

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Top Navigation Bar */}
      <header className="h-[52px] sm:h-[58px] bg-card border-b border-border flex items-center px-4 sm:px-6 gap-3 shrink-0 z-50 shadow-[0_1px_3px_oklch(0_0_0/0.04)]">
        <button onClick={() => navigate('/')} className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-all">
          <MaterialIcon icon="arrow_forward" size={20} />
        </button>
        <img src={logo} alt="راصد" className="h-8 sm:h-9 object-contain" />
        <div className="w-px h-5 bg-border" />
        <h1 className="text-[14px] sm:text-[16px] font-bold text-foreground">الملف الشخصي</h1>
        <div className="flex-1" />
        <button onClick={toggleTheme} className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-all">
          <MaterialIcon icon={theme === 'dark' ? 'light_mode' : 'dark_mode'} size={20} />
        </button>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Profile Hero Card */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden mb-6 animate-fade-in-up">
          {/* Cover gradient */}
          <div className="h-28 sm:h-36 relative"
            style={{
              background: theme === 'dark'
                ? 'linear-gradient(135deg, oklch(0.22 0.08 250), oklch(0.16 0.05 250))'
                : 'linear-gradient(135deg, oklch(0.30 0.10 250), oklch(0.24 0.08 250))',
            }}
          >
            {/* Decorative circles */}
            <div className="absolute top-4 left-[15%] w-20 h-20 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, oklch(0.72 0.14 75), transparent)' }} />
            <div className="absolute bottom-2 right-[10%] w-16 h-16 rounded-full opacity-8" style={{ background: 'radial-gradient(circle, oklch(0.58 0.14 250), transparent)' }} />
          </div>

          {/* Avatar + Info */}
          <div className="px-5 sm:px-8 pb-5 -mt-14 sm:-mt-16 relative">
            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4">
              {/* Avatar */}
              <div className="relative group">
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl border-4 border-card bg-card shadow-lg overflow-hidden">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="الصورة الرمزية" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                      <span className="text-[36px] sm:text-[42px] font-bold text-primary">{user?.name?.charAt(0) || 'م'}</span>
                    </div>
                  )}
                </div>
                {/* Edit overlay */}
                <button
                  onClick={() => setShowAvatarPicker(true)}
                  className="absolute inset-0 rounded-2xl bg-black/0 group-hover:bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-md">
                    <MaterialIcon icon="photo_camera" size={20} className="text-gray-700" />
                  </div>
                </button>
                {/* Status dot */}
                <div className="absolute bottom-1 left-1 w-4 h-4 rounded-full bg-success border-2 border-card" />
              </div>

              {/* Name + Role */}
              <div className="flex-1 text-center sm:text-right sm:pb-1">
                <h2 className="text-[20px] sm:text-[24px] font-bold text-foreground">{user?.name || 'المستخدم'}</h2>
                <p className="text-[12px] text-muted-foreground mt-0.5">{user?.email}</p>
                <div className="flex items-center justify-center sm:justify-start gap-2 mt-2">
                  <span className="text-[10px] font-medium px-2.5 py-1 rounded-full" style={{ backgroundColor: `${userRole.color}15`, color: userRole.color }}>
                    {userRole.label}
                  </span>
                  <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-success/10 text-success">
                    نشط
                  </span>
                  {user?.department && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <MaterialIcon icon="business" size={12} /> {user.department}
                    </span>
                  )}
                </div>
              </div>

              {/* Quick actions */}
              <div className="flex items-center gap-2 sm:pb-1">
                <button
                  onClick={() => setShowAvatarPicker(true)}
                  className="h-9 px-3.5 rounded-xl bg-primary text-primary-foreground text-[12px] font-medium hover:opacity-90 transition-all active:scale-[0.97] flex items-center gap-1.5 shadow-sm"
                >
                  <MaterialIcon icon="photo_camera" size={15} />
                  تغيير الصورة
                </button>
                <button
                  onClick={() => { logout(); navigate('/login'); }}
                  className="h-9 px-3.5 rounded-xl border border-border text-[12px] font-medium text-destructive hover:bg-destructive/5 transition-all active:scale-[0.97] flex items-center gap-1.5"
                >
                  <MaterialIcon icon="logout" size={15} />
                  خروج
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Avatar Picker Modal */}
        {showAvatarPicker && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setShowAvatarPicker(false)}>
            <div className="absolute inset-0 bg-black/40 animate-fade-in" />
            <div className="relative bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md p-5 animate-bounce-in" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[16px] font-bold text-foreground">اختر صورة رمزية</h3>
                <button onClick={() => setShowAvatarPicker(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-accent transition-all">
                  <MaterialIcon icon="close" size={18} className="text-muted-foreground" />
                </button>
              </div>

              {/* Upload custom */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-all mb-4"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <MaterialIcon icon="cloud_upload" size={24} className="text-primary" />
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-bold text-foreground">رفع صورة مخصصة</p>
                  <p className="text-[10px] text-muted-foreground">JPG, PNG — حد أقصى 5 ميجابايت</p>
                </div>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />

              {/* Character avatars */}
              <p className="text-[11px] font-bold text-muted-foreground mb-2.5">أو اختر شخصية راصد</p>
              <div className="grid grid-cols-5 gap-2.5">
                {AVATAR_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => handleAvatarSelect(opt.url)}
                    className={`aspect-square rounded-xl border-2 overflow-hidden transition-all duration-200 hover:scale-105 ${
                      avatarUrl === opt.url ? 'border-primary shadow-md shadow-primary/20' : 'border-border hover:border-primary/30'
                    }`}
                    title={opt.label}
                  >
                    <img src={opt.url} alt={opt.label} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>

              {/* Remove avatar */}
              {avatarUrl && (
                <button
                  onClick={handleRemoveAvatar}
                  className="w-full mt-3 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] text-destructive hover:bg-destructive/5 transition-all"
                >
                  <MaterialIcon icon="delete" size={15} />
                  إزالة الصورة الرمزية
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 p-1 bg-card rounded-xl border border-border mb-6 overflow-x-auto no-scrollbar">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-[12px] font-medium whitespace-nowrap transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <MaterialIcon icon={tab.icon} size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="animate-fade-in-up">
          {/* ===== PERSONAL INFO TAB ===== */}
          {activeTab === 'info' && (
            <div className="space-y-5">
              <div className="bg-card rounded-2xl border border-border p-5 sm:p-6">
                <h3 className="text-[15px] font-bold text-foreground mb-5 flex items-center gap-2">
                  <MaterialIcon icon="person" size={20} className="text-primary" />
                  المعلومات الشخصية
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Name */}
                  <div>
                    <label className="block text-[12px] font-bold text-foreground mb-1.5">الاسم الكامل <span className="text-destructive">*</span></label>
                    <div className="flex items-center gap-2 h-11 border border-border rounded-xl px-3.5 bg-background focus-within:border-primary/40 focus-within:shadow-md focus-within:shadow-primary/5 transition-all duration-200">
                      <MaterialIcon icon="badge" size={18} className="text-muted-foreground shrink-0" />
                      <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="أدخل اسمك الكامل"
                        className="flex-1 bg-transparent text-[13px] outline-none text-foreground placeholder:text-muted-foreground"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-[12px] font-bold text-foreground mb-1.5">البريد الإلكتروني <span className="text-destructive">*</span></label>
                    <div className="flex items-center gap-2 h-11 border border-border rounded-xl px-3.5 bg-background focus-within:border-primary/40 focus-within:shadow-md focus-within:shadow-primary/5 transition-all duration-200">
                      <MaterialIcon icon="mail" size={18} className="text-muted-foreground shrink-0" />
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="example@ndmo.gov.sa"
                        className="flex-1 bg-transparent text-[13px] outline-none text-foreground placeholder:text-muted-foreground"
                        dir="ltr"
                      />
                    </div>
                  </div>

                  {/* Department */}
                  <div>
                    <label className="block text-[12px] font-bold text-foreground mb-1.5">القسم / الإدارة</label>
                    <div className="flex items-center gap-2 h-11 border border-border rounded-xl px-3.5 bg-background focus-within:border-primary/40 focus-within:shadow-md focus-within:shadow-primary/5 transition-all duration-200">
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

                  {/* Role (read-only) */}
                  <div>
                    <label className="block text-[12px] font-bold text-foreground mb-1.5">الدور</label>
                    <div className="flex items-center gap-2 h-11 border border-border rounded-xl px-3.5 bg-accent/30">
                      <MaterialIcon icon="shield" size={18} className="text-muted-foreground shrink-0" />
                      <span className="text-[13px] text-muted-foreground">{userRole.label}</span>
                      <MaterialIcon icon="lock" size={14} className="text-muted-foreground/50 mr-auto" />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">يتم تحديد الدور من قبل مدير النظام</p>
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border">
                  <button
                    onClick={() => { setName(user?.name || ''); setEmail(user?.email || ''); setDepartment(user?.department || ''); }}
                    className="h-10 px-4 rounded-xl border border-border text-[12px] font-medium text-muted-foreground hover:bg-accent transition-all"
                  >
                    إلغاء التعديلات
                  </button>
                  <button
                    onClick={handleSaveInfo}
                    disabled={saving}
                    className="h-10 px-5 bg-primary text-primary-foreground rounded-xl text-[12px] font-bold hover:opacity-90 transition-all active:scale-[0.97] disabled:opacity-50 flex items-center gap-1.5 shadow-sm shadow-primary/20"
                  >
                    {saving ? (
                      <><MaterialIcon icon="progress_activity" size={16} className="animate-icon-spin" /> جاري الحفظ...</>
                    ) : (
                      <><MaterialIcon icon="save" size={16} /> حفظ التعديلات</>
                    )}
                  </button>
                </div>
              </div>

              {/* Account Info (read-only) */}
              <div className="bg-card rounded-2xl border border-border p-5 sm:p-6">
                <h3 className="text-[15px] font-bold text-foreground mb-4 flex items-center gap-2">
                  <MaterialIcon icon="info" size={20} className="text-primary" />
                  معلومات الحساب
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { label: 'معرّف المستخدم', value: user?.id || '—', icon: 'fingerprint' },
                    { label: 'تاريخ الانضمام', value: '2025-01-15', icon: 'calendar_today' },
                    { label: 'آخر تسجيل دخول', value: user?.lastLogin?.split('T')[0] || '—', icon: 'schedule' },
                    { label: 'حالة الحساب', value: 'نشط', icon: 'check_circle' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-3 p-3 rounded-xl bg-accent/20">
                      <MaterialIcon icon={item.icon} size={18} className="text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">{item.label}</p>
                        <p className="text-[12px] font-medium text-foreground">{item.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ===== SECURITY TAB ===== */}
          {activeTab === 'security' && (
            <div className="space-y-5">
              {/* Change Password */}
              <div className="bg-card rounded-2xl border border-border p-5 sm:p-6">
                <h3 className="text-[15px] font-bold text-foreground mb-5 flex items-center gap-2">
                  <MaterialIcon icon="lock" size={20} className="text-primary" />
                  تغيير كلمة المرور
                </h3>

                <div className="space-y-4 max-w-md">
                  {/* Current Password */}
                  <div>
                    <label className="block text-[12px] font-bold text-foreground mb-1.5">كلمة المرور الحالية</label>
                    <div className="flex items-center gap-2 h-11 border border-border rounded-xl px-3.5 bg-background focus-within:border-primary/40 focus-within:shadow-md focus-within:shadow-primary/5 transition-all duration-200">
                      <MaterialIcon icon="lock" size={18} className="text-muted-foreground shrink-0" />
                      <input
                        type={showPasswords ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={e => setCurrentPassword(e.target.value)}
                        placeholder="أدخل كلمة المرور الحالية"
                        className="flex-1 bg-transparent text-[13px] outline-none text-foreground placeholder:text-muted-foreground"
                        dir="ltr"
                      />
                      <button type="button" onClick={() => setShowPasswords(!showPasswords)} className="text-muted-foreground hover:text-foreground transition-colors">
                        <MaterialIcon icon={showPasswords ? 'visibility_off' : 'visibility'} size={18} />
                      </button>
                    </div>
                  </div>

                  {/* New Password */}
                  <div>
                    <label className="block text-[12px] font-bold text-foreground mb-1.5">كلمة المرور الجديدة</label>
                    <div className="flex items-center gap-2 h-11 border border-border rounded-xl px-3.5 bg-background focus-within:border-primary/40 focus-within:shadow-md focus-within:shadow-primary/5 transition-all duration-200">
                      <MaterialIcon icon="lock" size={18} className="text-muted-foreground shrink-0" />
                      <input
                        type={showPasswords ? 'text' : 'password'}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="8 أحرف على الأقل"
                        className="flex-1 bg-transparent text-[13px] outline-none text-foreground placeholder:text-muted-foreground"
                        dir="ltr"
                      />
                    </div>
                    {newPassword && (
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

                  {/* Confirm New Password */}
                  <div>
                    <label className="block text-[12px] font-bold text-foreground mb-1.5">تأكيد كلمة المرور الجديدة</label>
                    <div className={`flex items-center gap-2 h-11 border rounded-xl px-3.5 bg-background transition-all duration-200 ${
                      confirmPassword && confirmPassword !== newPassword ? 'border-destructive/40' : 'border-border focus-within:border-primary/40 focus-within:shadow-md focus-within:shadow-primary/5'
                    }`}>
                      <MaterialIcon icon="lock" size={18} className="text-muted-foreground shrink-0" />
                      <input
                        type={showPasswords ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="أعد إدخال كلمة المرور الجديدة"
                        className="flex-1 bg-transparent text-[13px] outline-none text-foreground placeholder:text-muted-foreground"
                        dir="ltr"
                      />
                      {confirmPassword && (
                        <MaterialIcon
                          icon={confirmPassword === newPassword ? 'check_circle' : 'cancel'}
                          size={18}
                          className={confirmPassword === newPassword ? 'text-success' : 'text-destructive'}
                        />
                      )}
                    </div>
                  </div>

                  <button
                    onClick={handleChangePassword}
                    disabled={changingPassword}
                    className="h-10 px-5 bg-primary text-primary-foreground rounded-xl text-[12px] font-bold hover:opacity-90 transition-all active:scale-[0.97] disabled:opacity-50 flex items-center gap-1.5 shadow-sm shadow-primary/20"
                  >
                    {changingPassword ? (
                      <><MaterialIcon icon="progress_activity" size={16} className="animate-icon-spin" /> جاري التغيير...</>
                    ) : (
                      <><MaterialIcon icon="lock_reset" size={16} /> تغيير كلمة المرور</>
                    )}
                  </button>
                </div>
              </div>

              {/* Two-Factor Auth */}
              <div className="bg-card rounded-2xl border border-border p-5 sm:p-6">
                <h3 className="text-[15px] font-bold text-foreground mb-4 flex items-center gap-2">
                  <MaterialIcon icon="security" size={20} className="text-primary" />
                  المصادقة الثنائية
                </h3>
                <div className="flex items-center justify-between p-4 rounded-xl bg-accent/20 border border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
                      <MaterialIcon icon="phonelink_lock" size={22} className="text-warning" />
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-foreground">التحقق بخطوتين</p>
                      <p className="text-[10px] text-muted-foreground">أضف طبقة حماية إضافية لحسابك</p>
                    </div>
                  </div>
                  <button className="h-9 px-4 rounded-xl border border-border text-[12px] font-medium text-foreground hover:bg-accent transition-all">
                    تفعيل
                  </button>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="bg-card rounded-2xl border border-destructive/20 p-5 sm:p-6">
                <h3 className="text-[15px] font-bold text-destructive mb-4 flex items-center gap-2">
                  <MaterialIcon icon="warning" size={20} />
                  منطقة الخطر
                </h3>
                <div className="flex items-center justify-between p-4 rounded-xl bg-destructive/5 border border-destructive/10">
                  <div>
                    <p className="text-[13px] font-bold text-foreground">حذف الحساب</p>
                    <p className="text-[10px] text-muted-foreground">سيتم حذف جميع بياناتك نهائياً ولا يمكن التراجع</p>
                  </div>
                  <button className="h-9 px-4 rounded-xl bg-destructive text-destructive-foreground text-[12px] font-medium hover:opacity-90 transition-all">
                    حذف الحساب
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ===== SESSIONS TAB ===== */}
          {activeTab === 'sessions' && (
            <div className="space-y-5">
              <div className="bg-card rounded-2xl border border-border p-5 sm:p-6">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-[15px] font-bold text-foreground flex items-center gap-2">
                    <MaterialIcon icon="devices" size={20} className="text-primary" />
                    الجلسات النشطة
                  </h3>
                  <button className="h-9 px-3.5 rounded-xl border border-destructive/30 text-[11px] font-medium text-destructive hover:bg-destructive/5 transition-all flex items-center gap-1.5">
                    <MaterialIcon icon="logout" size={14} />
                    إنهاء جميع الجلسات
                  </button>
                </div>

                <div className="space-y-3">
                  {DEMO_SESSIONS.map((session, i) => (
                    <div key={session.id} className={`flex items-center gap-3 p-4 rounded-xl border transition-all animate-stagger-in ${
                      session.current ? 'border-primary/20 bg-primary/5' : 'border-border hover:bg-accent/20'
                    }`} style={{ animationDelay: `${i * 0.06}s` }}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        session.device.includes('Chrome') ? 'bg-info/10' :
                        session.device.includes('Safari') ? 'bg-warning/10' : 'bg-primary/10'
                      }`}>
                        <MaterialIcon
                          icon={session.device.includes('iPhone') ? 'phone_iphone' : session.device.includes('mac') ? 'laptop_mac' : 'computer'}
                          size={22}
                          className={session.device.includes('Chrome') ? 'text-info' : session.device.includes('Safari') ? 'text-warning' : 'text-primary'}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[12px] font-bold text-foreground">{session.device}</p>
                          {session.current && (
                            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-success/10 text-success">الجلسة الحالية</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1"><MaterialIcon icon="location_on" size={11} /> {session.location}</span>
                          <span className="flex items-center gap-1" dir="ltr"><MaterialIcon icon="router" size={11} /> {session.ip}</span>
                          <span className="flex items-center gap-1"><MaterialIcon icon="schedule" size={11} /> {session.lastActive}</span>
                        </div>
                      </div>
                      {!session.current && (
                        <button className="w-8 h-8 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10 transition-all shrink-0" title="إنهاء الجلسة">
                          <MaterialIcon icon="close" size={18} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ===== ACTIVITY TAB ===== */}
          {activeTab === 'activity' && (
            <div className="bg-card rounded-2xl border border-border p-5 sm:p-6">
              <h3 className="text-[15px] font-bold text-foreground mb-5 flex items-center gap-2">
                <MaterialIcon icon="history" size={20} className="text-primary" />
                سجل النشاط
              </h3>

              <div className="relative">
                {/* Timeline line */}
                <div className="absolute right-[19px] top-0 bottom-0 w-px bg-border" />

                <div className="space-y-0">
                  {DEMO_ACTIVITY.map((item, i) => (
                    <div key={item.id} className="flex gap-4 pb-5 relative animate-stagger-in" style={{ animationDelay: `${i * 0.05}s` }}>
                      {/* Timeline dot */}
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 relative z-10" style={{ backgroundColor: `${item.color}12` }}>
                        <MaterialIcon icon={item.icon} size={18} style={{ color: item.color } as any} />
                      </div>
                      {/* Content */}
                      <div className="flex-1 pt-1.5">
                        <p className="text-[12px] font-bold text-foreground">{item.action}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{item.detail}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1 flex items-center gap-1" dir="ltr">
                          <MaterialIcon icon="schedule" size={11} /> {item.time}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button className="w-full mt-2 py-2.5 rounded-xl border border-border text-[12px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-all flex items-center justify-center gap-1.5">
                <MaterialIcon icon="expand_more" size={16} />
                عرض المزيد
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
