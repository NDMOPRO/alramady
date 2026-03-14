/* RASID Visual DNA — Ultra Premium Header
   Dark bg (#0f2744) matching brand image
   Logo: creative animation (float + glow + ring)
   Gold accent borders on buttons/options
   Light logo for dark header bg, dark logo for light header in dark mode variant
   Auth-aware: user avatar, admin link, logout
   Dual-toggle button for both panels */
import { useState, useRef, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import MaterialIcon from './MaterialIcon';
import { LOGOS } from '@/lib/assets';

interface NotebookHeaderProps {
  onShareClick: () => void;
  onSettingsClick: (e: React.MouseEvent) => void;
  onAnalyticsClick: () => void;
  onMenuToggle?: () => void;
  onToggleBoth?: () => void;
  bothPanelsOpen?: boolean;
}

export default function NotebookHeader({ onShareClick, onSettingsClick, onAnalyticsClick, onMenuToggle, onToggleBoth, bothPanelsOpen = true }: NotebookHeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const [titleEditing, setTitleEditing] = useState(false);
  const [title, setTitle] = useState('مساحة العمل الرئيسية');
  const [themeAnimating, setThemeAnimating] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Header always uses dark bg → always show light/cream logo
  // In dark mode header uses a slightly different accent
  const logo = theme === 'dark' ? LOGOS.dark_header : LOGOS.dark_header;

  const handleThemeToggle = () => {
    setThemeAnimating(true);
    toggleTheme?.();
    setTimeout(() => setThemeAnimating(false), 600);
  };

  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen]);

  const isAdmin = user?.role === 'admin' || user?.role === 'editor';

  return (
    <header
      className="h-[56px] sm:h-[62px] flex items-center px-3 sm:px-5 gap-2 sm:gap-4 shrink-0 z-50 relative overflow-hidden"
      style={{
        background: theme === 'dark'
          ? 'linear-gradient(135deg, #0a1628 0%, #162a4a 50%, #1a3358 100%)'
          : 'linear-gradient(135deg, #0b1a33 0%, #0f2744 40%, #163356 100%)',
      }}
    >
      {/* Subtle animated gradient overlay */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 30% 50%, rgba(212,175,55,0.15) 0%, transparent 60%), radial-gradient(ellipse at 80% 30%, rgba(59,130,246,0.1) 0%, transparent 50%)',
        }}
      />

      {/* Bottom gold accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, transparent 5%, rgba(212,175,55,0.5) 30%, rgba(212,175,55,0.8) 50%, rgba(212,175,55,0.5) 70%, transparent 95%)' }} />

      {/* Mobile menu button */}
      <button
        onClick={onMenuToggle}
        className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all"
      >
        <MaterialIcon icon="menu" size={22} />
      </button>

      {/* Right side: Logo + Brand + Title */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 flex-1 min-w-0 relative z-10">
        {/* Logo — Ultra Premium with creative animation */}
        <div className="relative shrink-0 group cursor-pointer">
          {/* Outer rotating ring with gold gradient */}
          <div
            className="absolute inset-[-6px] rounded-full animate-logo-ring opacity-40 group-hover:opacity-70 transition-opacity duration-500"
            style={{ border: '1.5px solid transparent', borderImage: 'linear-gradient(135deg, rgba(212,175,55,0.6), rgba(255,215,0,0.3), rgba(212,175,55,0.6)) 1' }}
          />
          {/* Inner glow pulse */}
          <div className="absolute inset-[-3px] rounded-full bg-gradient-to-br from-amber-400/10 via-transparent to-amber-500/10 animate-pulse-soft" />
          {/* Logo image with float animation */}
          <img
            src={logo}
            alt="راصد"
            className="w-[46px] h-[46px] sm:w-[54px] sm:h-[54px] object-contain drop-shadow-[0_0_12px_rgba(212,175,55,0.3)] transition-all duration-500 group-hover:drop-shadow-[0_0_20px_rgba(212,175,55,0.5)] group-hover:scale-105"
            style={{ animation: 'float-slow 5s ease-in-out infinite' }}
          />
        </div>

        {/* Brand text */}
        <div className="flex flex-col leading-tight shrink-0">
          <span className="text-[15px] sm:text-[17px] font-extrabold text-white tracking-tight drop-shadow-sm">
            راصد البيانات
          </span>
          <span className="text-[8px] sm:text-[10px] font-medium hidden sm:block" style={{ color: 'rgba(212,175,55,0.7)' }}>
            أحد مبادرات مكتب إدارة البيانات الوطنية
          </span>
        </div>

        {/* Gold divider */}
        <div className="w-px h-6 mx-1 shrink-0 hidden md:block" style={{ background: 'linear-gradient(180deg, transparent, rgba(212,175,55,0.4), transparent)' }} />

        {/* Editable workspace title — desktop only */}
        <div className="hidden md:block">
          {titleEditing ? (
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              onBlur={() => setTitleEditing(false)}
              onKeyDown={e => e.key === 'Enter' && setTitleEditing(false)}
              className="text-[13px] bg-white/10 border-b-2 border-amber-400/50 outline-none text-white px-2 py-1 min-w-[120px] rounded-t transition-colors"
            />
          ) : (
            <button
              onClick={() => setTitleEditing(true)}
              className="text-[13px] text-white/60 hover:text-white transition-all duration-200 truncate max-w-[200px] hover:bg-white/8 px-2 py-1 rounded-md group flex items-center gap-1.5"
            >
              {title}
              <MaterialIcon icon="edit" size={12} className="opacity-0 group-hover:opacity-60 transition-opacity" />
            </button>
          )}
        </div>
      </div>

      {/* Left side: Actions with gold accents */}
      <div className="flex items-center gap-1 relative z-10">
        {/* Create new workspace — desktop */}
        <GoldButton onClick={() => {}} className="hidden md:flex">
          <MaterialIcon icon="add" size={16} />
          مساحة جديدة
        </GoldButton>

        {/* Dual-toggle button — desktop only */}
        {onToggleBoth && (
          <GoldIconButton
            icon={bothPanelsOpen ? 'unfold_less' : 'unfold_more'}
            title={bothPanelsOpen ? 'طي القائمتين (Ctrl+B)' : 'فتح القائمتين (Ctrl+B)'}
            onClick={onToggleBoth}
            active={!bothPanelsOpen}
            className="hidden md:flex"
          >
            <span className="hidden lg:inline text-[11px] mr-1">{bothPanelsOpen ? 'تركيز' : 'فتح'}</span>
          </GoldIconButton>
        )}

        {/* Admin panel link — desktop, admin/editor only */}
        {isAdmin && (
          <GoldIconButton
            icon="admin_panel_settings"
            title="لوحة التحكم"
            onClick={() => navigate('/admin')}
            className="hidden md:flex"
          >
            <span className="hidden lg:inline text-[11px] mr-1">التحكم</span>
          </GoldIconButton>
        )}

        <GoldIconButton icon="bar_chart" title="التحليلات" onClick={onAnalyticsClick} className="hidden sm:flex" />
        <GoldIconButton icon="share" title="مشاركة" onClick={onShareClick} className="hidden sm:flex" />
        <GoldIconButton
          icon={theme === 'dark' ? 'light_mode' : 'dark_mode'}
          title={theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}
          onClick={handleThemeToggle}
          spinning={themeAnimating}
        />
        <GoldIconButton icon="settings" title="الإعدادات" onClick={onSettingsClick} />

        {/* User avatar with dropdown */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-[12px] font-bold mr-1 cursor-pointer transition-all duration-300 hover:scale-110 overflow-hidden ring-2 ring-amber-400/30 hover:ring-amber-400/60"
            style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.2), rgba(255,255,255,0.1))' }}
            title={user?.name || 'المستخدم'}
          >
            {user?.avatar ? (
              <img src={user.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white font-bold">{user?.name?.charAt(0) || 'م'}</span>
            )}
          </button>

          {/* User Dropdown */}
          {userMenuOpen && (
            <div className="absolute left-0 top-full mt-2 w-[230px] bg-card border border-border rounded-xl shadow-2xl z-[100] animate-fade-in-up overflow-hidden" dir="rtl">
              {/* User info header with gold accent */}
              <div className="p-3.5 border-b border-border relative overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(15,39,68,0.08), rgba(212,175,55,0.05))' }}>
                <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.5), transparent)' }} />
                <div className="flex items-center gap-2.5">
                  <div className="w-11 h-11 rounded-full flex items-center justify-center text-[15px] font-bold shrink-0 overflow-hidden ring-2 ring-amber-400/20" style={{ background: 'linear-gradient(135deg, rgba(15,39,68,0.15), rgba(212,175,55,0.1))' }}>
                    {user?.avatar ? (
                      <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-primary">{user?.name?.charAt(0) || 'م'}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-foreground truncate">{user?.name || 'المستخدم'}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{user?.email || ''}</p>
                    <span className="inline-block text-[9px] font-medium px-2 py-0.5 rounded-full mt-0.5" style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.05))', color: 'rgb(180,140,30)' }}>
                      {user?.role === 'admin' ? 'مدير النظام' : user?.role === 'editor' ? 'محرر' : user?.role === 'analyst' ? 'محلل' : 'مشاهد'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Keyboard shortcuts */}
              <div className="px-3.5 py-2.5 border-b border-border bg-accent/30">
                <p className="text-[9px] font-bold text-muted-foreground mb-1.5 flex items-center gap-1">
                  <MaterialIcon icon="keyboard" size={12} />
                  اختصارات لوحة المفاتيح
                </p>
                <div className="flex flex-col gap-1">
                  {[
                    { label: 'لوحة البيانات', key: 'Ctrl+D' },
                    { label: 'الاستوديو', key: 'Ctrl+Shift+S' },
                    { label: 'طي/فتح الكل', key: 'Ctrl+B' },
                  ].map(s => (
                    <div key={s.key} className="flex items-center justify-between">
                      <span className="text-[9px] text-muted-foreground">{s.label}</span>
                      <kbd className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-foreground/5 text-muted-foreground border border-border/30">{s.key}</kbd>
                    </div>
                  ))}
                </div>
              </div>

              {/* Menu items */}
              <div className="p-1.5">
                {isAdmin && (
                  <DropdownItem icon="admin_panel_settings" label="لوحة التحكم" onClick={() => { setUserMenuOpen(false); navigate('/admin'); }} />
                )}
                <DropdownItem icon="person" label="الملف الشخصي" onClick={() => { setUserMenuOpen(false); navigate('/profile'); }} />
                <DropdownItem icon="settings" label="الإعدادات" onClick={() => { setUserMenuOpen(false); onSettingsClick({} as React.MouseEvent); }} />
                <div className="h-px bg-border my-1" />
                <button
                  onClick={() => { setUserMenuOpen(false); logout(); navigate('/login'); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] text-red-500 hover:bg-red-500/8 transition-all"
                >
                  <MaterialIcon icon="logout" size={16} />
                  تسجيل الخروج
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/* ===== Gold-accented Primary Button ===== */
function GoldButton({ onClick, className = '', children }: { onClick: () => void; className?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`h-[33px] px-3.5 rounded-lg text-[12px] font-semibold transition-all duration-300 active:scale-[0.96] items-center gap-1.5 relative overflow-hidden group ${className}`}
      style={{
        background: 'linear-gradient(135deg, rgba(212,175,55,0.9), rgba(180,140,30,0.9))',
        color: '#0f2744',
        boxShadow: '0 2px 8px rgba(212,175,55,0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
      }}
    >
      {/* Hover shimmer */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
      <span className="relative flex items-center gap-1.5">{children}</span>
    </button>
  );
}

/* ===== Gold-accented Icon Button ===== */
function GoldIconButton({
  icon, title, onClick, spinning, active, className = '', children,
}: {
  icon: string; title: string; onClick?: (e: React.MouseEvent) => void; spinning?: boolean; active?: boolean; className?: string; children?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-[33px] min-w-[33px] px-1.5 rounded-lg flex items-center justify-center transition-all duration-300 active:scale-95 group relative ${
        active
          ? 'bg-amber-400/20 text-amber-300'
          : 'text-white/60 hover:text-white hover:bg-white/10'
      } ${className}`}
      title={title}
      style={{
        border: '1px solid rgba(212,175,55,0.15)',
      }}
    >
      {/* Hover gold border glow */}
      <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" style={{ boxShadow: 'inset 0 0 0 1px rgba(212,175,55,0.35), 0 0 8px rgba(212,175,55,0.1)' }} />
      <MaterialIcon
        icon={icon}
        size={18}
        className={`relative z-10 transition-transform duration-300 group-hover:scale-110 ${spinning ? 'animate-icon-spin' : ''}`}
      />
      {children && <span className="relative z-10">{children}</span>}
    </button>
  );
}

/* ===== Dropdown Menu Item ===== */
function DropdownItem({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] text-foreground hover:bg-accent transition-all group"
    >
      <MaterialIcon icon={icon} size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
      {label}
    </button>
  );
}
