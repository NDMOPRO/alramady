/* RASID Visual DNA — Share Dialog
   Professional sharing with link copy, permissions, and team members */
import { useState, useEffect } from 'react';
import MaterialIcon from './MaterialIcon';

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ShareDialog({ isOpen, onClose }: ShareDialogProps) {
  const [email, setEmail] = useState('');
  const [copied, setCopied] = useState(false);
  const [permission, setPermission] = useState<'view' | 'edit' | 'admin'>('view');

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText('https://rasid.ndmo.gov.sa/workspace/abc123').catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const permissionOptions = [
    { id: 'view' as const, label: 'عرض فقط', icon: 'visibility', desc: 'يمكن للمستلم عرض المحتوى فقط' },
    { id: 'edit' as const, label: 'تعديل', icon: 'edit', desc: 'يمكن للمستلم التعديل على المحتوى' },
    { id: 'admin' as const, label: 'إدارة كاملة', icon: 'admin_panel_settings', desc: 'صلاحيات كاملة بما فيها الحذف' },
  ];

  const teamMembers = [
    { name: 'أحمد المالكي', role: 'مدير المشروع', avatar: 'أ', email: 'ahmed@ndmo.gov.sa' },
    { name: 'سارة العتيبي', role: 'محلل بيانات', avatar: 'س', email: 'sara@ndmo.gov.sa' },
    { name: 'خالد الشمري', role: 'مطور', avatar: 'خ', email: 'khalid@ndmo.gov.sa' },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center animate-dialog-backdrop" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-popover w-full max-w-[480px] mx-4 rounded-2xl overflow-hidden shadow-2xl animate-dialog-content"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <MaterialIcon icon="share" size={18} className="text-primary" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-foreground">مشاركة مساحة العمل</h3>
              <p className="text-[10px] text-muted-foreground">شارك مع فريقك أو أنشئ رابط عام</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent transition-all active:scale-95">
            <MaterialIcon icon="close" size={18} className="text-muted-foreground" />
          </button>
        </div>

        <div className="p-5">
          {/* Add people */}
          <div className="mb-4">
            <div className="flex items-center gap-2 h-10 border border-border rounded-xl px-3 focus-within:border-primary/40 focus-within:shadow-sm transition-all duration-200">
              <MaterialIcon icon="person_add" size={18} className="text-muted-foreground" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="أضف أشخاص أو مجموعات..."
                className="flex-1 bg-transparent text-[13px] outline-none text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Share Link */}
          <div className="mb-5">
            <label className="text-[11px] font-bold text-muted-foreground mb-2 block">رابط المشاركة</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-10 bg-accent/40 rounded-xl px-3 flex items-center text-[11px] text-muted-foreground truncate border border-border">
                https://rasid.ndmo.gov.sa/workspace/abc123
              </div>
              <button
                onClick={handleCopyLink}
                className={`h-10 px-4 rounded-xl text-[12px] font-medium transition-all duration-200 flex items-center gap-1.5 shrink-0 ${
                  copied
                    ? 'bg-green-500/10 text-green-600 border border-green-500/20'
                    : 'bg-primary text-primary-foreground hover:opacity-90'
                }`}
              >
                <MaterialIcon icon={copied ? 'check' : 'content_copy'} size={15} />
                {copied ? 'تم' : 'نسخ'}
              </button>
            </div>
          </div>

          {/* Permission Level */}
          <div className="mb-5">
            <label className="text-[11px] font-bold text-muted-foreground mb-2 block">مستوى الصلاحية</label>
            <div className="flex flex-col gap-1.5">
              {permissionOptions.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setPermission(opt.id)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-right transition-all duration-200 ${
                    permission === opt.id
                      ? 'border-primary/30 bg-primary/5'
                      : 'border-border hover:bg-accent'
                  }`}
                >
                  <MaterialIcon icon={opt.icon} size={16} className={permission === opt.id ? 'text-primary' : 'text-muted-foreground'} />
                  <div className="flex-1">
                    <p className={`text-[12px] font-medium ${permission === opt.id ? 'text-primary' : 'text-foreground'}`}>{opt.label}</p>
                    <p className="text-[9px] text-muted-foreground">{opt.desc}</p>
                  </div>
                  {permission === opt.id && <MaterialIcon icon="check_circle" size={16} className="text-primary" />}
                </button>
              ))}
            </div>
          </div>

          {/* Team Members */}
          <div>
            <label className="text-[11px] font-bold text-muted-foreground mb-2 block">أعضاء الفريق</label>
            <div className="flex flex-col gap-1">
              {teamMembers.map(member => (
                <div key={member.name} className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-accent/40 transition-all">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[12px] font-bold shrink-0">
                    {member.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-foreground">{member.name}</p>
                    <p className="text-[9px] text-muted-foreground">{member.email}</p>
                  </div>
                  <select className="text-[10px] text-muted-foreground bg-accent/40 rounded-lg px-2 py-1 border-none outline-none cursor-pointer">
                    <option>عرض</option>
                    <option>تعديل</option>
                    <option>إدارة</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-border gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[12px] font-medium text-muted-foreground hover:bg-accent transition-all">
            إلغاء
          </button>
          <button className="px-5 py-2 bg-primary text-primary-foreground rounded-xl text-[12px] font-medium hover:opacity-90 transition-all duration-200 active:scale-[0.97]">
            حفظ
          </button>
        </div>
      </div>
    </div>
  );
}
