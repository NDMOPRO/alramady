/* RASID Visual DNA — Settings Menu
   Positioned dropdown with theme toggle, language, and help options
   Mobile-responsive */
import { useEffect, useRef } from 'react';
import MaterialIcon from './MaterialIcon';
import { useTheme } from '@/contexts/ThemeContext';

interface SettingsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
}

export default function SettingsMenu({ isOpen, onClose, anchorEl }: SettingsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        anchorEl && !anchorEl.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose, anchorEl]);

  if (!isOpen) return null;

  const menuSections: Array<{ items: Array<{ icon: string; label: string; onClick?: () => void; badge?: string }> }> = [
    {
      items: [
        {
          icon: theme === 'dark' ? 'light_mode' : 'dark_mode',
          label: theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي',
          onClick: () => { toggleTheme?.(); },
          badge: theme === 'dark' ? 'فاتح' : 'داكن',
        },
        { icon: 'language', label: 'لغة المخرجات', badge: 'العربية' },
        { icon: 'text_increase', label: 'حجم الخط', badge: 'متوسط' },
      ],
    },
    {
      items: [
        { icon: 'fullscreen', label: 'وضع العرض الكامل' },
        { icon: 'notifications', label: 'الإشعارات' },
        { icon: 'keyboard', label: 'اختصارات لوحة المفاتيح' },
      ],
    },
    {
      items: [
        { icon: 'help', label: 'المساعدة والدعم' },
        { icon: 'feedback', label: 'إرسال ملاحظة' },
        { icon: 'info', label: 'حول راصد' },
        { icon: 'description', label: 'التراخيص والسياسات' },
      ],
    },
  ];

  return (
    <div
      ref={menuRef}
      className="absolute z-[100] bg-popover py-1.5 min-w-[220px] rounded-xl border border-border shadow-xl animate-dropdown"
      style={{ top: '100%', left: 0, marginTop: 4 }}
    >
      {menuSections.map((section, si) => (
        <div key={si}>
          {si > 0 && <div className="h-px bg-border mx-2 my-1" />}
          {section.items.map((item, i) => (
            <button
              key={item.label}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-right hover:bg-accent transition-all duration-150 active:scale-[0.98]"
              onClick={() => {
                if (item.onClick) item.onClick();
                else onClose();
              }}
            >
              <MaterialIcon icon={item.icon} size={17} className="text-muted-foreground" />
              <span className="text-[12px] text-foreground flex-1">{item.label}</span>
              {'badge' in item && item.badge && (
                <span className="text-[9px] text-muted-foreground bg-accent px-1.5 py-0.5 rounded-md">{item.badge}</span>
              )}
            </button>
          ))}
        </div>
      ))}

      {/* Version */}
      <div className="h-px bg-border mx-2 my-1" />
      <div className="px-3 py-1.5 text-[9px] text-muted-foreground/50 text-center">
        راصد البيانات v2.0 — NDMO
      </div>
    </div>
  );
}
