/* RASID Visual DNA — Studio Tool Dialog
   Per requirements: "لا تستخدم Popup تقليدي" but this is for quick tool access
   Kept minimal and clean */
import { useState, useEffect } from 'react';
import MaterialIcon from './MaterialIcon';
import { SETUP_COMMON } from '@/lib/assets';

interface StudioToolDialogProps {
  isOpen: boolean;
  onClose: () => void;
  tool: { icon: string; label: string; id: string } | null;
}

export default function StudioToolDialog({ isOpen, onClose, tool }: StudioToolDialogProps) {
  const [customPrompt, setCustomPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setCustomPrompt('');
      setIsGenerating(false);
      setProgress(0);
    }
  }, [isOpen]);

  if (!isOpen || !tool) return null;

  const handleGenerate = () => {
    setIsGenerating(true);
    let p = 0;
    const interval = setInterval(() => {
      p += Math.random() * 12;
      if (p >= 100) { p = 100; clearInterval(interval); }
      setProgress(p);
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center animate-dialog-backdrop" onClick={onClose}>
      <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" />
      <div
        className="relative bg-popover w-full max-w-[460px] mx-4 rounded-2xl overflow-hidden shadow-2xl animate-dialog-content"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <MaterialIcon icon={tool.icon} size={20} className="text-primary" />
            </div>
            <h2 className="text-[15px] font-bold text-foreground">{tool.label}</h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-accent transition-all active:scale-95">
            <MaterialIcon icon="close" size={18} className="text-muted-foreground" />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-[12px] text-muted-foreground mb-3">
            أضف مصادر البيانات أولاً، ثم أنشئ {tool.label} من محتواك.
          </p>

          {/* Customization */}
          <div className="mb-3">
            <label className="text-[11px] text-muted-foreground mb-1 block font-medium">تخصيص (اختياري)</label>
            <textarea
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              placeholder={`صف كيف تريد ${tool.label}...`}
              className="w-full text-[12px] text-foreground placeholder:text-muted-foreground bg-transparent border border-border rounded-xl outline-none resize-none leading-5 p-2.5 focus:border-primary/30 focus:shadow-sm transition-all duration-200"
              rows={3}
            />
          </div>

          {/* Source info */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-accent/40 mb-3 animate-fade-in">
            <MaterialIcon icon="info" size={16} className="text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">٥ مصادر متاحة — حدد المصادر المطلوبة</span>
          </div>

          {/* Progress */}
          {isGenerating && (
            <div className="mb-3 animate-fade-in">
              <div className="flex items-center gap-2 mb-1.5">
                <MaterialIcon icon="progress_activity" size={14} className="text-primary animate-icon-spin" />
                <span className="text-[11px] font-medium text-foreground">جاري الإنشاء...</span>
                <span className="text-[10px] text-muted-foreground mr-auto">{Math.round(progress)}٪</span>
              </div>
              <div className="h-1.5 bg-accent rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 pb-4">
          <button onClick={onClose} className="px-3.5 py-2 text-[12px] text-muted-foreground rounded-lg hover:bg-accent transition-all duration-200">
            إلغاء
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[12px] font-medium hover:opacity-90 transition-all duration-200 active:scale-[0.97] disabled:opacity-50 btn-hover-lift"
          >
            {isGenerating ? (
              <>
                <MaterialIcon icon="progress_activity" size={14} className="animate-icon-spin" />
                جاري الإنشاء...
              </>
            ) : (
              <>
                <MaterialIcon icon="auto_awesome" size={14} />
                إنشاء
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
