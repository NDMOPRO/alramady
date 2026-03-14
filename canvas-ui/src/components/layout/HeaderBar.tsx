import { motion } from 'framer-motion';
import { PanelRightOpen, PanelRightClose, Moon, Sun, Command, Sparkles, Zap, HelpCircle } from 'lucide-react';
import { useCanvasStore } from '@/stores/canvas-store';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// E07-0013 to E07-0017: Header Bar
export function HeaderBar() {
  const sidebarState = useCanvasStore((s) => s.sidebarState);
  const toggleSidebar = useCanvasStore((s) => s.toggleSidebar);
  const { theme, toggleTheme } = useTheme();
  const setCommandPaletteOpen = useCanvasStore((s) => s.setCommandPaletteOpen);
  const canvasState = useCanvasStore((s) => s.canvasState);
  const executionMode = useCanvasStore((s) => s.executionMode);
  const setExecutionMode = useCanvasStore((s) => s.setExecutionMode);
  const setShowTutorial = useCanvasStore((s) => s.setShowTutorial);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 flex items-center justify-between h-14 px-4',
        'bg-background/80 backdrop-blur-xl border-b border-border/50',
        'transition-all duration-200'
      )}
    >
      {/* E07-0014: Logo + connection status */}
      <div className="flex items-center gap-3">
        <motion.div
          className="flex items-center gap-2 cursor-pointer"
          whileHover={{ y: -1 }}
          transition={{ duration: 0.15 }}
        >
          <div className="relative">
            <Sparkles className="w-7 h-7 text-primary" />
            <span
              className={cn(
                'absolute -bottom-0.5 -left-0.5 w-2.5 h-2.5 rounded-full border-2 border-background',
                canvasState === 'RUNNING' || canvasState === 'VERIFYING'
                  ? 'bg-yellow-500 animate-pulse'
                  : 'bg-green-500'
              )}
            />
          </div>
          <span className="text-lg font-bold text-foreground tracking-tight">
            راصد
          </span>
        </motion.div>

        {/* Connection status */}
        <span className="text-xs text-muted-foreground hidden sm:block">
          {canvasState === 'IDLE' ? 'متصل' : canvasState === 'RUNNING' ? 'جارٍ التنفيذ…' : canvasState === 'VERIFYING' ? 'قيد التحقق…' : 'متصل'}
        </span>
      </div>

      {/* Right side buttons */}
      <div className="flex items-center gap-1">
        {/* GP-0046/GP-0068: Auto/Guided mode toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExecutionMode(executionMode === 'auto' ? 'guided' : 'auto')}
              className={cn(
                'gap-1.5 text-xs',
                executionMode === 'auto'
                  ? 'text-primary border-primary/30'
                  : 'text-amber-600 border-amber-500/30'
              )}
            >
              <Zap className="size-3.5" />
              <span className="hidden sm:inline">
                {executionMode === 'auto' ? 'تلقائي' : 'موجّه'}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {executionMode === 'auto'
              ? 'الوضع التلقائي: تنفيذ كامل بدون أسئلة'
              : 'الوضع الموجّه: أسئلة قصيرة خطوة بخطوة'}
          </TooltipContent>
        </Tooltip>

        {/* GP-0195: Tutorial button */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setShowTutorial(true)}
          aria-label="دليل الاستخدام"
        >
          <HelpCircle className="size-4" />
        </Button>

        {/* E07-0017: Command Palette */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCommandPaletteOpen(true)}
          className="gap-1.5 text-muted-foreground"
        >
          <Command className="size-3.5" />
          <span className="hidden sm:inline">بحث</span>
          <Kbd className="hidden sm:inline">⌘K</Kbd>
        </Button>

        {/* E07-0016: Theme toggle */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleTheme}
          aria-label={theme === 'light' ? 'الوضع الداكن' : 'الوضع الفاتح'}
        >
          {theme === 'light' ? <Moon className="size-4" /> : <Sun className="size-4" />}
        </Button>

        {/* E07-0015: Sidebar toggle */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleSidebar}
          aria-label={sidebarState === 'hidden' ? 'إظهار اللوحة الجانبية' : 'إخفاء اللوحة الجانبية'}
        >
          {sidebarState === 'hidden' ? (
            <PanelRightOpen className="size-4" />
          ) : (
            <PanelRightClose className="size-4" />
          )}
        </Button>
      </div>
    </header>
  );
}
