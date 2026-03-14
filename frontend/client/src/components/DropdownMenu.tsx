/*
 * Generic Dropdown Menu component
 * Used for: Chat options, Note more_vert, Studio more_vert
 */

import { useEffect, useRef } from 'react';
import MaterialIcon from './MaterialIcon';

interface MenuItem {
  icon?: string;
  label: string;
  sublabel?: string;
  danger?: boolean;
  divider?: boolean;
}

interface DropdownMenuProps {
  isOpen: boolean;
  onClose: () => void;
  items: MenuItem[];
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  position?: 'left' | 'right';
}

export default function DropdownMenu({ isOpen, onClose, items, anchorRef, position = 'right' }: DropdownMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
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
  }, [isOpen, onClose, anchorRef]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="absolute z-50 bg-white py-2 min-w-[200px]"
      style={{
        borderRadius: 8,
        boxShadow: '0 2px 6px 2px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.3)',
        top: '100%',
        [position === 'right' ? 'right' : 'left']: 0,
        marginTop: 4,
      }}
    >
      {items.map((item, i) => {
        if (item.divider) {
          return <div key={i} className="my-1 mx-3" style={{ borderTop: '1px solid #e0e0e0' }} />;
        }
        return (
          <button
            key={item.label}
            className={`flex items-start gap-3 w-full px-4 py-2.5 text-left hover:bg-black/[0.04] transition-colors ${item.danger ? 'text-red-600' : ''}`}
            onClick={onClose}
          >
            {item.icon && (
              <MaterialIcon icon={item.icon} size={20} className={item.danger ? 'text-red-600' : 'text-[#444746]'} />
            )}
            <div className="flex flex-col">
              <span className={`text-[14px] ${item.danger ? 'text-red-600' : 'text-[#303030]'}`} style={{ fontFamily: "'Google Sans Text', sans-serif" }}>
                {item.label}
              </span>
              {item.sublabel && (
                <span className="text-[11px] text-[#5f6368] mt-0.5" style={{ fontFamily: "'Google Sans Text', sans-serif" }}>
                  {item.sublabel}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
