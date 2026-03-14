import { useRef, useCallback, type KeyboardEvent, type ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCanvasStore } from '@/stores/canvas-store';
import { cn } from '@/lib/utils';
import { Send, Paperclip, Upload, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

// E07-0022 to E07-0028: Composer — bottom input bar
export function Composer() {
  const composerText = useCanvasStore((s) => s.composerText);
  const setComposerText = useCanvasStore((s) => s.setComposerText);
  const handleSendMessage = useCanvasStore((s) => s.handleSendMessage);
  const handleFilesDrop = useCanvasStore((s) => s.handleFilesDrop);
  const canvasState = useCanvasStore((s) => s.canvasState);
  const messages = useCanvasStore((s) => s.messages);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isProcessing = canvasState !== 'IDLE' && canvasState !== 'COMPLETED' && canvasState !== 'FAILED';
  const hasMessages = messages.length > 0;

  const handleSubmit = useCallback(() => {
    if (composerText.trim() && !isProcessing) {
      handleSendMessage();
    }
  }, [composerText, isProcessing, handleSendMessage]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleTextChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setComposerText(e.target.value);
      const textarea = e.target;
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
    },
    [setComposerText]
  );

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFilesChosen = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFilesDrop(Array.from(files));
        e.target.value = '';
      }
    },
    [handleFilesDrop]
  );

  return (
    <div className="sticky bottom-0 bg-background/80 backdrop-blur-xl border-t border-border/50 px-4 sm:px-6 lg:px-8 py-3">
      <div className="max-w-3xl mx-auto">
        {/* Processing indicator */}
        <AnimatePresence>
          {isProcessing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 mb-2 text-xs text-muted-foreground"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
              <span>
                {canvasState === 'RUNNING'
                  ? 'جارٍ التنفيذ…'
                  : canvasState === 'VERIFYING'
                  ? 'قيد التحقق…'
                  : canvasState === 'PLANNING'
                  ? 'جارٍ التخطيط…'
                  : canvasState === 'ANALYZING'
                  ? 'جارٍ التحليل…'
                  : canvasState === 'UPLOADING'
                  ? 'جارٍ الرفع…'
                  : canvasState === 'EXPORTING'
                  ? 'جارٍ التصدير…'
                  : 'يعمل…'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Prominent upload button when no messages yet */}
        {!hasMessages && (
          <div className="flex justify-center mb-3">
            <Button
              onClick={handleFileSelect}
              variant="outline"
              size="lg"
              className="gap-2 text-primary border-primary/30 hover:bg-primary/10 hover:border-primary/50"
            >
              <Upload className="size-5" />
              <span className="font-medium">ارفع ملف</span>
            </Button>
          </div>
        )}

        {/* Composer container */}
        <div
          className={cn(
            'flex items-end gap-2 rounded-xl border bg-card p-2 transition-all duration-200',
            'border-border/50 focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
            isProcessing && 'opacity-70'
          )}
        >
          {/* Attach file button — always visible */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleFileSelect}
            aria-label="إرفاق ملف"
            className="text-muted-foreground hover:text-primary"
            title="ارفع ملف (PDF, Excel, Word, صور…)"
          >
            <Paperclip className="size-5" />
          </Button>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.pptx,.docx,.xlsx,.csv,.png,.jpg,.jpeg,.webp,.mp4,.mp3,.wav,.srt"
            className="hidden"
            onChange={handleFilesChosen}
          />

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={composerText}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder="اكتب أمراً أو اضغط 📎 لرفع ملف…"
            rows={1}
            disabled={isProcessing}
            className={cn(
              'flex-1 resize-none bg-transparent text-foreground text-sm leading-relaxed',
              'placeholder:text-muted-foreground/60 focus:outline-none',
              'min-h-[40px] max-h-[160px] py-2'
            )}
            dir="auto"
          />

          {/* Send button */}
          <Button
            onClick={handleSubmit}
            disabled={!composerText.trim() || isProcessing}
            size="icon-sm"
            className={cn(
              'transition-all duration-200',
              composerText.trim() && !isProcessing
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground'
            )}
            aria-label="إرسال"
          >
            {isProcessing ? (
              <Sparkles className="size-5 animate-pulse" />
            ) : (
              <Send className="size-5 rotate-180" />
            )}
          </Button>
        </div>

        {/* Keyboard shortcut hint */}
        <p className="text-[10px] text-muted-foreground/50 text-center mt-1.5">
          Enter للإرسال · Shift+Enter لسطر جديد · ⌘K للبحث السريع
        </p>
      </div>
    </div>
  );
}
