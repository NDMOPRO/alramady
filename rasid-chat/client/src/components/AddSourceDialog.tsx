/* RASID Visual DNA — Add Source Dialog
   Professional file upload with drag-and-drop, source type tabs, mobile-responsive */
import { useState, useRef, useEffect, type DragEvent } from 'react';
import MaterialIcon from './MaterialIcon';

interface AddSourceDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const sourceTypes = [
  { icon: 'upload_file', label: 'رفع ملفات', desc: 'PDF, Excel, Word, CSV' },
  { icon: 'link', label: 'رابط موقع', desc: 'استيراد من URL' },
  { icon: 'table_chart', label: 'جدول بيانات', desc: 'Google Sheets, Excel' },
  { icon: 'content_paste', label: 'نص منسوخ', desc: 'لصق نص مباشرة' },
  { icon: 'mic', label: 'ملف صوتي', desc: 'MP3, WAV, M4A' },
  { icon: 'videocam', label: 'فيديو', desc: 'MP4, WebM' },
];

export default function AddSourceDialog({ isOpen, onClose }: AddSourceDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeType, setActiveType] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleDragOver = (e: DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: DragEvent) => { e.preventDefault(); setIsDragging(false); };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-dialog-backdrop" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-popover w-full max-w-[520px] rounded-2xl overflow-hidden shadow-2xl animate-dialog-content max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <MaterialIcon icon="add_circle" size={18} className="text-primary" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-foreground">إضافة مصدر بيانات</h3>
              <p className="text-[10px] text-muted-foreground">ارفع ملفاتك أو أضف روابط لتبدأ التحليل</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent transition-all active:scale-95">
            <MaterialIcon icon="close" size={18} className="text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Search */}
          <div className="mb-4">
            <div className="flex items-center gap-2 h-10 border border-border rounded-xl px-3 focus-within:border-primary/40 focus-within:shadow-sm transition-all duration-200">
              <MaterialIcon icon="search" size={18} className="text-muted-foreground shrink-0" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="ابحث عن مصادر أو الصق رابط..."
                className="flex-1 text-[12px] text-foreground placeholder:text-muted-foreground bg-transparent outline-none"
              />
            </div>
          </div>

          {/* Drop Zone */}
          <div
            className={`mb-5 flex flex-col items-center justify-center py-8 sm:py-10 rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer ${
              isDragging ? 'border-primary bg-primary/5 shadow-inner' : 'border-border hover:border-primary/30 hover:bg-accent/30'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <MaterialIcon icon="cloud_upload" size={36} className={isDragging ? 'text-primary animate-bounce-in' : 'text-muted-foreground/30'} />
            <p className="text-[13px] font-medium text-foreground mt-2.5">أسقط الملفات هنا</p>
            <p className="text-[11px] text-muted-foreground mt-1">أو اضغط لاختيار الملفات</p>
            <p className="text-[9px] text-muted-foreground/60 mt-1">الحد الأقصى: 50MB لكل ملف</p>
            <input ref={fileInputRef} type="file" className="hidden" multiple />
          </div>

          {/* Source Types Grid */}
          <div>
            <label className="text-[11px] font-bold text-muted-foreground mb-2 block">أو اختر نوع المصدر</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {sourceTypes.map((type, i) => (
                <button
                  key={type.label}
                  onClick={() => setActiveType(i)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all duration-200 active:scale-[0.97] animate-stagger-in ${
                    activeType === i
                      ? 'bg-primary/5 border-primary/30 text-primary'
                      : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                  style={{ animationDelay: `${i * 0.04}s` }}
                >
                  <MaterialIcon icon={type.icon} size={22} />
                  <span className="text-[11px] font-medium">{type.label}</span>
                  <span className="text-[8px] text-muted-foreground">{type.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-border gap-2 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[12px] font-medium text-muted-foreground hover:bg-accent transition-all">
            إلغاء
          </button>
          <button className="px-5 py-2 bg-primary text-primary-foreground rounded-xl text-[12px] font-medium hover:opacity-90 transition-all duration-200 active:scale-[0.97] flex items-center gap-1.5">
            <MaterialIcon icon="add" size={16} />
            إضافة
          </button>
        </div>
      </div>
    </div>
  );
}
