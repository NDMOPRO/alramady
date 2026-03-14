import { useState } from 'react';
import { useCanvasStore } from '@/stores/canvas-store';
import { useAuthStore } from '@/stores/auth-store';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Moon,
  Sun,
  Type,
  Rows3,
  Globe,
  Bell,
  Palette,
  User,
  ShieldCheck,
  Lock,
  BellRing,
  ChevronDown,
  ChevronUp,
  Badge,
  Key,
  Clock,
  Smartphone,
  Mail,
  BellOff,
  Monitor,
  AlignLeft,
  Check,
} from 'lucide-react';

// ─── Section definitions ──────────────────────────────────────────────────────

type SectionId = 'account' | 'permissions' | 'security' | 'notifications' | 'appearance';

const SECTIONS: { id: SectionId; label: string; icon: typeof User }[] = [
  { id: 'account',       label: 'الحساب',    icon: User },
  { id: 'permissions',   label: 'الصلاحيات', icon: ShieldCheck },
  { id: 'security',      label: 'الأمان',    icon: Lock },
  { id: 'notifications', label: 'الإشعارات', icon: Bell },
  { id: 'appearance',    label: 'المظهر',    icon: Palette },
];

// ─── Permission categories ────────────────────────────────────────────────────

const PERMISSION_CATEGORIES = [
  { key: 'data:read',          label: 'قراءة البيانات',      desc: 'الوصول إلى قراءة الملفات والمصادر' },
  { key: 'data:write',         label: 'كتابة البيانات',      desc: 'رفع وتعديل الملفات والمصادر' },
  { key: 'convert:strict',     label: 'التحويل 1:1 (STRICT)', desc: 'تشغيل محرك التحويل الدقيق' },
  { key: 'dashboard:create',   label: 'إنشاء Dashboards',    desc: 'بناء لوحات المؤشرات' },
  { key: 'report:generate',    label: 'توليد التقارير',      desc: 'إنشاء وتصدير التقارير' },
  { key: 'governance:view',    label: 'عرض الحوكمة',         desc: 'الاطلاع على سجلات التدقيق' },
  { key: 'governance:manage',  label: 'إدارة الحوكمة',       desc: 'تعديل الصلاحيات والأدوار' },
  { key: 'ai:query',           label: 'استجواب الذكاء الاصطناعي', desc: 'استخدام محركات الذكاء الاصطناعي' },
];

// ─── Main component ───────────────────────────────────────────────────────────

// GP-0071: Customization (font size, UI density, shortcuts)
// GP-0232: Language/region settings
// GP-0233: Arabic mode default
// GP-0234: UI density + shortcuts
// GP-0235: Notifications
// GP-0236: Preferences/brand personal
export function SettingsPanel() {
  const [openSection, setOpenSection] = useState<SectionId>('appearance');

  const toggleSection = (id: SectionId) => {
    setOpenSection((prev) => (prev === id ? ('appearance' as SectionId) : id));
  };

  return (
    <div className="space-y-1.5">
      {SECTIONS.map((section) => (
        <CollapsibleSection
          key={section.id}
          id={section.id}
          label={section.label}
          icon={section.icon}
          isOpen={openSection === section.id}
          onToggle={() => toggleSection(section.id)}
        >
          <SectionContent id={section.id} />
        </CollapsibleSection>
      ))}

      {/* Keyboard shortcuts reference */}
      <div className="bg-muted/30 rounded-xl p-3 mt-3 space-y-1.5">
        <p className="text-xs font-medium text-foreground">اختصارات لوحة المفاتيح</p>
        <div className="space-y-1 text-[10px] text-muted-foreground">
          <ShortcutRow keys="⌘K" label="لوحة الأوامر" />
          <ShortcutRow keys="⌘B" label="تبديل اللوحة الجانبية" />
          <ShortcutRow keys="⌘U" label="رفع ملف" />
          <ShortcutRow keys="⌘D" label="إنشاء Dashboard" />
          <ShortcutRow keys="⌘R" label="إنشاء تقرير" />
          <ShortcutRow keys="Enter" label="إرسال الأمر" />
          <ShortcutRow keys="Shift+Enter" label="سطر جديد" />
          <ShortcutRow keys="Escape" label="إغلاق النافذة" />
        </div>
      </div>
    </div>
  );
}

// ─── Collapsible section wrapper ──────────────────────────────────────────────

function CollapsibleSection({
  id,
  label,
  icon: Icon,
  isOpen,
  onToggle,
  children,
}: {
  id: SectionId;
  label: string;
  icon: typeof User;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border transition-all duration-200',
        isOpen ? 'border-primary/30 bg-primary/5' : 'border-border/30 bg-transparent'
      )}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 text-right"
        aria-expanded={isOpen}
        aria-controls={`settings-section-${id}`}
      >
        <div className="flex items-center gap-2">
          <Icon
            className={cn(
              'w-3.5 h-3.5 transition-colors',
              isOpen ? 'text-primary' : 'text-muted-foreground'
            )}
          />
          <span
            className={cn(
              'text-xs font-medium transition-colors',
              isOpen ? 'text-primary' : 'text-foreground'
            )}
          >
            {label}
          </span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-3.5 h-3.5 text-primary" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>

      {isOpen && (
        <div
          id={`settings-section-${id}`}
          className="px-3 pb-3 pt-0 border-t border-border/20 space-y-3"
        >
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Section content router ───────────────────────────────────────────────────

function SectionContent({ id }: { id: SectionId }) {
  switch (id) {
    case 'account':       return <AccountSection />;
    case 'permissions':   return <PermissionsSection />;
    case 'security':      return <SecuritySection />;
    case 'notifications': return <NotificationsSection />;
    case 'appearance':    return <AppearanceSection />;
  }
}

// ─── Account ──────────────────────────────────────────────────────────────────

function AccountSection() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const displayName = user?.displayNameAr || user?.displayName || user?.username || 'مستخدم';
  const roles = user?.roles ?? [];
  const isOwner = user?.isOwner ?? false;

  return (
    <div className="space-y-3 pt-2">
      {/* Avatar + info */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
          <span className="text-base font-bold text-primary">
            {displayName.charAt(0)}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
          {user?.email && (
            <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
          )}
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            مُعرّف: {user?.id?.slice(0, 12) ?? '—'}…
          </p>
        </div>
      </div>

      {/* Role badges */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-medium text-muted-foreground">الأدوار</p>
        <div className="flex flex-wrap gap-1.5">
          {isOwner && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20">
              <ShieldCheck className="w-2.5 h-2.5" />
              مالك
            </span>
          )}
          {roles.length === 0 && !isOwner && (
            <span className="text-[10px] text-muted-foreground/60">لا توجد أدوار محددة</span>
          )}
          {roles.map((role) => (
            <span
              key={role}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20"
            >
              {role}
            </span>
          ))}
        </div>
      </div>

      {/* Meta */}
      <div className="space-y-1 text-[10px] text-muted-foreground">
        <InfoRow label="اللغة" value={user?.locale ?? 'ar'} />
        <InfoRow label="المنطقة الزمنية" value={user?.timezone ?? 'Asia/Riyadh'} />
        <InfoRow label="المستأجر" value={user?.tenantId?.slice(0, 8) ?? '—'} />
      </div>

      {/* Logout */}
      <button
        onClick={() => { void logout(); }}
        className="w-full py-2 rounded-lg border border-destructive/30 text-xs text-destructive hover:bg-destructive/10 transition-colors"
      >
        تسجيل الخروج
      </button>
    </div>
  );
}

// ─── Permissions ──────────────────────────────────────────────────────────────

function PermissionsSection() {
  const user = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);

  return (
    <div className="space-y-2 pt-2">
      <p className="text-[10px] text-muted-foreground">
        صلاحياتك الحالية بناءً على أدوارك في النظام. التعديل يتطلب صلاحية إدارة.
      </p>
      {PERMISSION_CATEGORIES.map((perm) => {
        const granted = user?.isOwner || hasPermission(perm.key);
        return (
          <div
            key={perm.key}
            className={cn(
              'flex items-center justify-between p-2.5 rounded-lg border transition-colors',
              granted
                ? 'border-green-500/20 bg-green-500/5'
                : 'border-border/20 bg-muted/20'
            )}
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground">{perm.label}</p>
              <p className="text-[9px] text-muted-foreground/70">{perm.desc}</p>
            </div>
            <div
              className={cn(
                'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ml-2',
                granted ? 'bg-green-500/20 text-green-600' : 'bg-muted text-muted-foreground/40'
              )}
              aria-label={granted ? 'ممنوح' : 'غير ممنوح'}
            >
              {granted ? (
                <Check className="w-3 h-3" />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Security ─────────────────────────────────────────────────────────────────

function SecuritySection() {
  const [sessionTimeout, setSessionTimeout] = useState<'15m' | '1h' | '8h' | '30d'>('8h');
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);

  const SESSION_OPTIONS: { value: typeof sessionTimeout; label: string }[] = [
    { value: '15m',  label: '١٥ دقيقة' },
    { value: '1h',   label: 'ساعة واحدة' },
    { value: '8h',   label: '٨ ساعات' },
    { value: '30d',  label: '٣٠ يوماً' },
  ];

  return (
    <div className="space-y-3 pt-2">
      {/* Session timeout */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <Label className="text-xs font-medium text-foreground">انتهاء الجلسة</Label>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {SESSION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSessionTimeout(opt.value)}
              className={cn(
                'py-1.5 rounded-lg text-[11px] transition-all border',
                sessionTimeout === opt.value
                  ? 'bg-primary text-primary-foreground border-primary font-medium'
                  : 'bg-muted/30 text-muted-foreground border-border/20 hover:bg-muted/60'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2FA */}
      <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/20 bg-muted/10">
        <div className="flex items-center gap-2">
          <Smartphone className="w-3.5 h-3.5 text-muted-foreground" />
          <div>
            <Label className="text-xs font-medium text-foreground">المصادقة الثنائية (2FA)</Label>
            <p className="text-[9px] text-muted-foreground/70">طبقة حماية إضافية عبر التطبيق</p>
          </div>
        </div>
        <Switch
          checked={twoFAEnabled}
          onCheckedChange={setTwoFAEnabled}
          aria-label="تفعيل المصادقة الثنائية"
        />
      </div>

      {/* API Key management */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Key className="w-3 h-3 text-muted-foreground" />
          <Label className="text-xs font-medium text-foreground">مفتاح API</Label>
        </div>
        <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border/20 bg-muted/10">
          <code
            className={cn(
              'flex-1 text-[10px] font-mono truncate transition-all',
              apiKeyVisible ? 'text-foreground' : 'text-muted-foreground/40 blur-[3px] select-none'
            )}
          >
            rsdk_live_a9f3b2c1d8e4f7g6h5i2j0k1l3m9n4
          </code>
          <button
            onClick={() => setApiKeyVisible((v) => !v)}
            className="text-[10px] text-primary hover:text-primary/80 transition-colors flex-shrink-0"
          >
            {apiKeyVisible ? 'إخفاء' : 'إظهار'}
          </button>
        </div>
        <button className="w-full py-1.5 rounded-lg text-[11px] text-destructive border border-destructive/20 hover:bg-destructive/5 transition-colors">
          تجديد المفتاح
        </button>
      </div>
    </div>
  );
}

// ─── Notifications ────────────────────────────────────────────────────────────

function NotificationsSection() {
  const preferences = useCanvasStore((s) => s.preferences);
  const updatePreferences = useCanvasStore((s) => s.updatePreferences);

  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);
  const [inAppNotifications, setInAppNotifications] = useState(true);
  const [operationAlerts, setOperationAlerts] = useState(true);
  const [errorAlerts, setErrorAlerts] = useState(true);

  const toggleRows: {
    key: string;
    label: string;
    desc: string;
    icon: typeof Mail;
    value: boolean;
    onChange: (v: boolean) => void;
  }[] = [
    {
      key: 'email',
      label: 'البريد الإلكتروني',
      desc: 'إشعارات عبر البريد عند اكتمال العمليات',
      icon: Mail,
      value: emailNotifications,
      onChange: setEmailNotifications,
    },
    {
      key: 'push',
      label: 'إشعارات المتصفح',
      desc: 'إشعارات فورية في المتصفح',
      icon: Smartphone,
      value: pushNotifications,
      onChange: setPushNotifications,
    },
    {
      key: 'inapp',
      label: 'داخل التطبيق',
      desc: 'شريط الإشعارات داخل راصد',
      icon: BellRing,
      value: inAppNotifications,
      onChange: (v) => {
        setInAppNotifications(v);
        updatePreferences({ notifications: v });
      },
    },
    {
      key: 'ops',
      label: 'تنبيهات العمليات',
      desc: 'إشعار عند اكتمال أو فشل عملية',
      icon: BellRing,
      value: operationAlerts,
      onChange: setOperationAlerts,
    },
    {
      key: 'errors',
      label: 'تنبيهات الأخطاء',
      desc: 'إشعار فوري عند أي خطأ حرج',
      icon: BellOff,
      value: errorAlerts,
      onChange: setErrorAlerts,
    },
  ];

  return (
    <div className="space-y-2 pt-2">
      {toggleRows.map(({ key, label, desc, icon: Icon, value, onChange }) => (
        <div
          key={key}
          className="flex items-center justify-between p-2.5 rounded-lg border border-border/20 bg-muted/10"
        >
          <div className="flex items-center gap-2">
            <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <div>
              <Label className="text-xs font-medium text-foreground">{label}</Label>
              <p className="text-[9px] text-muted-foreground/70">{desc}</p>
            </div>
          </div>
          <Switch
            checked={value}
            onCheckedChange={onChange}
            aria-label={label}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Appearance ───────────────────────────────────────────────────────────────

function AppearanceSection() {
  const preferences = useCanvasStore((s) => s.preferences);
  const updatePreferences = useCanvasStore((s) => s.updatePreferences);
  const { theme, toggleTheme } = useTheme();

  const themeOptions: { value: 'light' | 'dark' | 'auto'; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'فاتح',   icon: Sun },
    { value: 'dark',  label: 'داكن',   icon: Moon },
    { value: 'auto',  label: 'تلقائي', icon: Monitor },
  ];

  // We store the user's theme preference locally; 'auto' defers to system
  const [themeChoice, setThemeChoice] = useState<'light' | 'dark' | 'auto'>('auto');

  const handleThemeSelect = (choice: 'light' | 'dark' | 'auto') => {
    setThemeChoice(choice);
    if (choice === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark && theme !== 'dark') toggleTheme();
      if (!prefersDark && theme !== 'light') toggleTheme();
    } else if (choice !== theme) {
      toggleTheme();
    }
  };

  return (
    <div className="space-y-4 pt-2">
      {/* Theme selector */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Palette className="w-3 h-3 text-muted-foreground" />
          <Label className="text-xs font-medium text-foreground">السمة</Label>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {themeOptions.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => handleThemeSelect(value)}
              className={cn(
                'flex flex-col items-center gap-1.5 py-2.5 rounded-xl border text-[11px] transition-all',
                themeChoice === value
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border/20 bg-muted/20 text-muted-foreground hover:bg-muted/50'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Language selector */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Globe className="w-3 h-3 text-muted-foreground" />
          <Label className="text-xs font-medium text-foreground">اللغة</Label>
        </div>
        <div className="flex gap-1.5">
          {(['ar', 'en'] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => updatePreferences({ language: lang })}
              className={cn(
                'flex-1 py-1.5 rounded-lg text-xs transition-all border',
                preferences.language === lang
                  ? 'bg-primary text-primary-foreground border-primary font-medium'
                  : 'bg-muted/30 text-muted-foreground border-border/20 hover:bg-muted/60'
              )}
            >
              {lang === 'ar' ? 'العربية' : 'English'}
            </button>
          ))}
        </div>
      </div>

      {/* Font size */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Type className="w-3 h-3 text-muted-foreground" />
          <Label className="text-xs font-medium text-foreground">حجم الخط</Label>
        </div>
        <div className="flex gap-1.5">
          {(['small', 'medium', 'large'] as const).map((size) => (
            <button
              key={size}
              onClick={() => updatePreferences({ fontSize: size })}
              className={cn(
                'flex-1 py-1.5 rounded-lg text-xs transition-all border',
                preferences.fontSize === size
                  ? 'bg-primary text-primary-foreground border-primary font-medium'
                  : 'bg-muted/30 text-muted-foreground border-border/20 hover:bg-muted/60'
              )}
            >
              {size === 'small' ? 'صغير' : size === 'medium' ? 'متوسط' : 'كبير'}
            </button>
          ))}
        </div>
      </div>

      {/* UI density */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Rows3 className="w-3 h-3 text-muted-foreground" />
          <Label className="text-xs font-medium text-foreground">كثافة الواجهة</Label>
        </div>
        <div className="flex gap-1.5">
          {(['compact', 'normal', 'comfortable'] as const).map((density) => (
            <button
              key={density}
              onClick={() => updatePreferences({ uiDensity: density })}
              className={cn(
                'flex-1 py-1.5 rounded-lg text-xs transition-all border',
                preferences.uiDensity === density
                  ? 'bg-primary text-primary-foreground border-primary font-medium'
                  : 'bg-muted/30 text-muted-foreground border-border/20 hover:bg-muted/60'
              )}
            >
              {density === 'compact' ? 'مضغوط' : density === 'normal' ? 'عادي' : 'مريح'}
            </button>
          ))}
        </div>
      </div>

      {/* Arabic mode */}
      <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/20 bg-muted/10">
        <div className="flex items-center gap-2">
          <AlignLeft className="w-3.5 h-3.5 text-muted-foreground" />
          <div>
            <Label className="text-xs font-medium text-foreground">الوضع العربي (ELITE)</Label>
            <p className="text-[9px] text-muted-foreground/70">تفعيل دعم اللغة العربية المتقدم</p>
          </div>
        </div>
        <Switch
          checked={preferences.arabicMode}
          onCheckedChange={(v) => updatePreferences({ arabicMode: v })}
          aria-label="تفعيل الوضع العربي المتقدم"
        />
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted-foreground/70">{label}</span>
      <span className="font-medium text-foreground/80">{value}</span>
    </div>
  );
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <kbd className="px-1.5 py-0.5 rounded bg-muted text-[9px] font-mono">{keys}</kbd>
    </div>
  );
}

// Re-export icons that were imported (used in SettingsSection which was removed)
// Keeping the named export for the Globe icon used externally
export { Globe };
