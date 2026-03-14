import { motion } from 'framer-motion';
import type { CardData } from '@/types/canvas';
import { contextActionsVariants } from '@/lib/motion';
import { Edit3, Save, RotateCcw, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';

interface EditorCardProps {
  card: CardData;
}

// E07-0085: EditorCard — in-place edit of artifact content with save + undo
export function EditorCard({ card }: EditorCardProps) {
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [history, setHistory] = useState<string[]>(['']);
  const hIdxRef = useRef<number>(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const pushHistory = useCallback((text: string) => {
    setHistory((prev) => {
      const trimmed = prev.slice(0, hIdxRef.current + 1);
      hIdxRef.current = trimmed.length;
      return [...trimmed, text];
    });
  }, []);

  const handleChange = useCallback((value: string) => {
    setContent(value);
    setIsDirty(value !== savedContent);
    setIsSaved(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => pushHistory(value), 500);
  }, [savedContent, pushHistory]);

  const handleUndo = useCallback(() => {
    if (hIdxRef.current > 0) {
      hIdxRef.current -= 1;
      const val = history[hIdxRef.current];
      setContent(val);
      setIsDirty(val !== savedContent);
    }
  }, [history, savedContent]);

  const handleSave = useCallback(() => {
    setSavedContent(content);
    setIsDirty(false);
    setIsSaved(true);
    toast.success('تم حفظ التعديلات');
    setTimeout(() => setIsSaved(false), 2000);
  }, [content]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      if (isDirty) handleSave();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      e.preventDefault();
      handleUndo();
    }
  }, [isDirty, handleSave, handleUndo]);

  const canUndo = hIdxRef.current > 0;

  return (
    <motion.div
      variants={contextActionsVariants}
      initial="initial"
      animate="animate"
      className="rounded-xl border border-border/50 bg-card overflow-hidden"
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
        <div className="flex items-center gap-2">
          <Edit3 className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium text-foreground">محرر المحتوى</span>
          {isDirty && (
            <span className="w-1.5 h-1.5 rounded-full bg-warning" title="تغييرات غير محفوظة" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleUndo}
            className={cn(
              'p-1 rounded-md transition-colors',
              canUndo ? 'hover:bg-muted text-muted-foreground' : 'text-muted-foreground/30'
            )}
            aria-label="تراجع"
            title="Ctrl+Z"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors',
              isSaved
                ? 'bg-success/10 text-success'
                : isDirty
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            )}
            title="Ctrl+S"
          >
            {isSaved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
            {isSaved ? 'تم الحفظ' : 'حفظ'}
          </button>
        </div>
      </div>

      <textarea
        value={content}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full min-h-[200px] p-4 text-sm bg-transparent text-foreground resize-none focus:outline-none font-mono"
        dir="auto"
        placeholder="محتوى الملف سيظهر هنا للتعديل المباشر…"
      />

      <div className="flex items-center justify-between px-4 py-1.5 border-t border-border/30 text-[10px] text-muted-foreground/60">
        <span>{content.length} حرف</span>
        <span>Ctrl+S للحفظ · Ctrl+Z للتراجع</span>
      </div>
    </motion.div>
  );
}
