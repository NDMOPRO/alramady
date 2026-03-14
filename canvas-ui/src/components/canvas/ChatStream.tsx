import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { useCanvasStore } from '@/stores/canvas-store';
import { MessageBubble } from '@/components/canvas/MessageBubble';
import { cn } from '@/lib/utils';
import { Sparkles, FileSearch, LayoutDashboard, FileOutput } from 'lucide-react';

// E07-0019 to E07-0021: Chat Stream — virtualized, auto-scroll, sticky bottom
export function ChatStream() {
  const messages = useCanvasStore((s) => s.messages);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  useEffect(() => {
    if (messages.length > 0) {
      virtuosoRef.current?.scrollToIndex({
        index: messages.length - 1,
        behavior: 'smooth',
        align: 'end',
      });
    }
  }, [messages.length]);

  if (messages.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex-1 overflow-hidden">
      <Virtuoso
        ref={virtuosoRef}
        data={messages}
        followOutput="smooth"
        className="h-full"
        itemContent={(index, message) => (
          <AnimatePresence mode="popLayout">
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, ease: [0.33, 1, 0.68, 1] }}
              className={cn('px-4 sm:px-6 lg:px-8 py-2', index === 0 && 'pt-6')}
            >
              <MessageBubble message={message} />
            </motion.div>
          </AnimatePresence>
        )}
        components={{
          Footer: () => <div className="h-4" />,
        }}
      />
    </div>
  );
}

// E07-0062 to E07-0068: Empty state — welcome + 3 suggestion chips + drop hint
function EmptyState() {
  const setComposerText = useCanvasStore((s) => s.setComposerText);
  const handleSendMessage = useCanvasStore((s) => s.handleSendMessage);

  const suggestions = [
    { icon: FileSearch, label: 'حلّل ملف', command: 'حلّل الملف' },
    { icon: LayoutDashboard, label: 'أنشئ لوحة', command: 'أنشئ لوحة مؤشرات' },
    { icon: FileOutput, label: 'حوّل PDF', command: 'حوّل ملف PDF' },
  ];

  const handleChipClick = (command: string) => {
    setComposerText(command);
    handleSendMessage();
  };

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.36, ease: [0.33, 1, 0.68, 1] }}
        className="text-center max-w-md space-y-6"
      >
        {/* Animated sparkles icon */}
        <motion.div
          className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center"
          animate={{ boxShadow: ['0 0 0 0 transparent', '0 0 16px 2px var(--primary)', '0 0 0 0 transparent'] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          style={{ '--primary': 'oklch(0.546 0.245 262.881 / 0.15)' } as React.CSSProperties}
        >
          <Sparkles className="w-8 h-8 text-primary" />
        </motion.div>

        {/* E07-0063: Short welcome 1-2 lines */}
        <div className="space-y-1.5">
          <h2 className="text-xl font-bold text-foreground">مرحباً براصد</h2>
          <p className="text-sm text-muted-foreground">
            ابدأ بسحب ملف أو اختر إجراءً سريعاً
          </p>
        </div>

        {/* E07-0064: 3 suggestion chips */}
        <div className="flex flex-wrap justify-center gap-2">
          {suggestions.map((chip) => (
            <motion.button
              key={chip.label}
              onClick={() => handleChipClick(chip.command)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm',
                'bg-muted/60 border border-border/50 text-foreground',
                'hover:bg-primary/10 hover:border-primary/30 hover:text-primary',
                'transition-all duration-200'
              )}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
            >
              <chip.icon className="size-4" />
              <span>{chip.label}</span>
            </motion.button>
          ))}
        </div>

        {/* E07-0065: Drop hint */}
        <p className="text-xs text-muted-foreground/50">اسحب ملفك هنا</p>
      </motion.div>
    </div>
  );
}
