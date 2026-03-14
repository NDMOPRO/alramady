import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCanvasStore } from '@/stores/canvas-store';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import {
  FileText,
  LayoutDashboard,
  FileBarChart,
  Presentation,
  Languages,
  Moon,
  Sun,
  PanelRightOpen,
  Upload,
  FileOutput,
  Table,
  Settings,
  Search,
  GitCompare,
  Sparkles,
  Layers,
  ShieldCheck,
  X,
  ArrowLeft,
  Zap,
  BookOpen,
  HelpCircle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type CommandCategory = 'files' | 'convert' | 'analyze' | 'export' | 'settings';

interface CommandEntry {
  id: string;
  /** Arabic label — primary search target */
  label: string;
  /** English alias for bilingual search */
  labelEn: string;
  icon: typeof FileText;
  category: CommandCategory;
  /** Keyboard shortcut hint (display only) */
  shortcut?: string;
  action: (helpers: CommandHelpers) => void;
}

interface CommandHelpers {
  setComposerText: (t: string) => void;
  handleSendMessage: () => void;
  toggleSidebar: () => void;
  toggleTheme: () => void;
  setSidebarTab: (tab: string) => void;
  setSidebarState: (state: string) => void;
  setShowTutorial: (v: boolean) => void;
  close: () => void;
}

const CATEGORY_META: Record<CommandCategory, { label: string; labelEn: string }> = {
  files:    { label: 'ملفات',   labelEn: 'Files' },
  convert:  { label: 'تحويل',   labelEn: 'Convert' },
  analyze:  { label: 'تحليل',   labelEn: 'Analysis' },
  export:   { label: 'تصدير',   labelEn: 'Export' },
  settings: { label: 'الإعدادات', labelEn: 'Settings' },
};

const CATEGORY_ORDER: CommandCategory[] = ['files', 'convert', 'analyze', 'export', 'settings'];

// ─── Command Registry ─────────────────────────────────────────────────────────

function buildCommands(theme: 'light' | 'dark'): CommandEntry[] {
  return [
    // ── Files ──────────────────────────────────────────────────────────────
    {
      id: 'upload-file',
      label: 'رفع ملف',
      labelEn: 'Upload File',
      icon: Upload,
      category: 'files',
      shortcut: '⌘U',
      action: ({ close }) => {
        close();
        // Trigger the hidden file input in DropZone
        document.querySelector<HTMLInputElement>('input[type="file"]')?.click();
      },
    },
    {
      id: 'open-library',
      label: 'فتح المكتبة',
      labelEn: 'Open Library',
      icon: BookOpen,
      category: 'files',
      action: ({ toggleSidebar, setSidebarTab, setSidebarState, close }) => {
        setSidebarTab('library');
        setSidebarState('full');
        close();
      },
    },
    {
      id: 'open-templates',
      label: 'قوالب جاهزة',
      labelEn: 'Templates',
      icon: LayoutDashboard,
      category: 'files',
      action: ({ setSidebarTab, setSidebarState, close }) => {
        setSidebarTab('templates');
        setSidebarState('full');
        close();
      },
    },

    // ── Convert ────────────────────────────────────────────────────────────
    {
      id: 'start-replication',
      label: 'بدء التحويل 1:1 (STRICT)',
      labelEn: 'Start Replication STRICT 1:1',
      icon: Layers,
      category: 'convert',
      action: ({ setComposerText, handleSendMessage, close }) => {
        close();
        setComposerText('حوّل الملف إلى PowerPoint 1:1');
        handleSendMessage();
      },
    },
    {
      id: 'convert-pptx',
      label: 'تحويل إلى PowerPoint',
      labelEn: 'Convert to PowerPoint PPTX',
      icon: Presentation,
      category: 'convert',
      action: ({ setComposerText, handleSendMessage, close }) => {
        close();
        setComposerText('حوّل إلى PowerPoint 1:1');
        handleSendMessage();
      },
    },
    {
      id: 'convert-docx',
      label: 'تحويل إلى Word',
      labelEn: 'Convert to Word DOCX',
      icon: FileText,
      category: 'convert',
      action: ({ setComposerText, handleSendMessage, close }) => {
        close();
        setComposerText('حوّل إلى Word 1:1');
        handleSendMessage();
      },
    },
    {
      id: 'convert-xlsx',
      label: 'تحويل إلى Excel',
      labelEn: 'Convert to Excel XLSX',
      icon: Table,
      category: 'convert',
      action: ({ setComposerText, handleSendMessage, close }) => {
        close();
        setComposerText('حوّل إلى Excel 1:1');
        handleSendMessage();
      },
    },
    {
      id: 'localize',
      label: 'تعريب الملف',
      labelEn: 'Localize / Arabize',
      icon: Languages,
      category: 'convert',
      action: ({ setComposerText, handleSendMessage, close }) => {
        close();
        setComposerText('عرّب الملف بوضع PRO');
        handleSendMessage();
      },
    },

    // ── Analyze ────────────────────────────────────────────────────────────
    {
      id: 'run-analysis',
      label: 'تشغيل التحليل',
      labelEn: 'Run Analysis',
      icon: Search,
      category: 'analyze',
      action: ({ setComposerText, handleSendMessage, close }) => {
        close();
        setComposerText('حلّل الملف تحليلاً شاملاً');
        handleSendMessage();
      },
    },
    {
      id: 'create-dashboard',
      label: 'أنشئ لوحة مؤشرات',
      labelEn: 'Create Dashboard',
      icon: LayoutDashboard,
      category: 'analyze',
      shortcut: '⌘D',
      action: ({ setComposerText, handleSendMessage, close }) => {
        close();
        setComposerText('أنشئ لوحة مؤشرات تفاعلية');
        handleSendMessage();
      },
    },
    {
      id: 'create-report',
      label: 'أنشئ تقرير',
      labelEn: 'Create Report',
      icon: FileBarChart,
      category: 'analyze',
      shortcut: '⌘R',
      action: ({ setComposerText, handleSendMessage, close }) => {
        close();
        setComposerText('أنشئ تقرير تنفيذي');
        handleSendMessage();
      },
    },
    {
      id: 'compare-files',
      label: 'مقارنة الملفات',
      labelEn: 'Compare Files',
      icon: GitCompare,
      category: 'analyze',
      action: ({ setComposerText, handleSendMessage, close }) => {
        close();
        setComposerText('قارن الملفات');
        handleSendMessage();
      },
    },
    {
      id: 'ai-query',
      label: 'استجواب الملف بالذكاء الاصطناعي',
      labelEn: 'AI Query / Intelligence',
      icon: Sparkles,
      category: 'analyze',
      action: ({ setComposerText, handleSendMessage, close }) => {
        close();
        setComposerText('استجوب الملف وأجب على أسئلتي');
        handleSendMessage();
      },
    },

    // ── Export ─────────────────────────────────────────────────────────────
    {
      id: 'export-pptx',
      label: 'تصدير PPTX',
      labelEn: 'Export PPTX PowerPoint',
      icon: FileOutput,
      category: 'export',
      action: ({ setComposerText, handleSendMessage, close }) => {
        close();
        setComposerText('صدّر النتيجة كـ PowerPoint');
        handleSendMessage();
      },
    },
    {
      id: 'export-docx',
      label: 'تصدير DOCX',
      labelEn: 'Export DOCX Word',
      icon: FileText,
      category: 'export',
      action: ({ setComposerText, handleSendMessage, close }) => {
        close();
        setComposerText('صدّر النتيجة كـ Word');
        handleSendMessage();
      },
    },
    {
      id: 'export-xlsx',
      label: 'تصدير XLSX',
      labelEn: 'Export XLSX Excel',
      icon: Table,
      category: 'export',
      action: ({ setComposerText, handleSendMessage, close }) => {
        close();
        setComposerText('صدّر النتيجة كـ Excel');
        handleSendMessage();
      },
    },
    {
      id: 'export-pdf',
      label: 'تصدير PDF',
      labelEn: 'Export PDF',
      icon: FileBarChart,
      category: 'export',
      action: ({ setComposerText, handleSendMessage, close }) => {
        close();
        setComposerText('صدّر النتيجة كـ PDF');
        handleSendMessage();
      },
    },
    {
      id: 'open-exports',
      label: 'فتح قائمة التصديرات',
      labelEn: 'Open Exports List',
      icon: FileOutput,
      category: 'export',
      action: ({ setSidebarTab, setSidebarState, close }) => {
        setSidebarTab('exports');
        setSidebarState('full');
        close();
      },
    },

    // ── Settings ───────────────────────────────────────────────────────────
    {
      id: 'open-settings',
      label: 'فتح الإعدادات',
      labelEn: 'Open Settings',
      icon: Settings,
      category: 'settings',
      action: ({ setSidebarTab, setSidebarState, close }) => {
        setSidebarTab('settings');
        setSidebarState('full');
        close();
      },
    },
    {
      id: 'toggle-theme',
      label: theme === 'light' ? 'الوضع الداكن' : 'الوضع الفاتح',
      labelEn: theme === 'light' ? 'Dark Mode' : 'Light Mode',
      icon: theme === 'light' ? Moon : Sun,
      category: 'settings',
      action: ({ toggleTheme, close }) => {
        toggleTheme();
        close();
      },
    },
    {
      id: 'toggle-sidebar',
      label: 'تبديل اللوحة الجانبية',
      labelEn: 'Toggle Sidebar',
      icon: PanelRightOpen,
      category: 'settings',
      shortcut: '⌘B',
      action: ({ toggleSidebar, close }) => {
        toggleSidebar();
        close();
      },
    },
    {
      id: 'governance',
      label: 'الحوكمة والصلاحيات',
      labelEn: 'Governance Permissions',
      icon: ShieldCheck,
      category: 'settings',
      action: ({ setSidebarTab, setSidebarState, close }) => {
        setSidebarTab('governance');
        setSidebarState('full');
        close();
      },
    },
    {
      id: 'open-tutorial',
      label: 'دليل الاستخدام',
      labelEn: 'Help Tutorial',
      icon: HelpCircle,
      category: 'settings',
      shortcut: '?',
      action: ({ setShowTutorial, close }) => {
        close();
        setShowTutorial(true);
      },
    },
    {
      id: 'strict-tools',
      label: 'أدوات STRICT المتاحة',
      labelEn: 'STRICT Engine Tools',
      icon: Zap,
      category: 'settings',
      action: ({ setComposerText, handleSendMessage, close }) => {
        close();
        setComposerText('اعرض أدوات المحرك STRICT المتاحة');
        handleSendMessage();
      },
    },
  ];
}

// ─── Fuzzy match ──────────────────────────────────────────────────────────────

/**
 * Simple substring fuzzy match: returns true if every character in `query`
 * appears in order in `target` (case-insensitive, supports Arabic).
 */
function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return true;
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

function matchesCommand(query: string, cmd: CommandEntry): boolean {
  if (!query) return true;
  return fuzzyMatch(query, cmd.label) || fuzzyMatch(query, cmd.labelEn);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CommandPalette() {
  const open = useCanvasStore((s) => s.commandPaletteOpen);
  const setOpen = useCanvasStore((s) => s.setCommandPaletteOpen);
  const { theme, toggleTheme } = useTheme();
  const toggleSidebar = useCanvasStore((s) => s.toggleSidebar);
  const setComposerText = useCanvasStore((s) => s.setComposerText);
  const handleSendMessage = useCanvasStore((s) => s.handleSendMessage);
  const setSidebarTab = useCanvasStore((s) => s.setSidebarTab);
  const setSidebarState = useCanvasStore((s) => s.setSidebarState);
  const setShowTutorial = useCanvasStore((s) => s.setShowTutorial);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo(() => buildCommands(theme), [theme]);

  const helpers: CommandHelpers = useMemo(
    () => ({
      setComposerText,
      handleSendMessage,
      toggleSidebar,
      toggleTheme,
      setSidebarTab: (tab) => setSidebarTab(tab as Parameters<typeof setSidebarTab>[0]),
      setSidebarState: (state) => setSidebarState(state as Parameters<typeof setSidebarState>[0]),
      setShowTutorial,
      close: () => setOpen(false),
    }),
    [setComposerText, handleSendMessage, toggleSidebar, toggleTheme, setSidebarTab, setSidebarState, setShowTutorial, setOpen]
  );

  // Filtered + grouped commands
  const filtered = useMemo(
    () => commands.filter((cmd) => matchesCommand(query, cmd)),
    [commands, query]
  );

  const grouped = useMemo(() => {
    const map = new Map<CommandCategory, CommandEntry[]>();
    for (const cat of CATEGORY_ORDER) {
      const items = filtered.filter((c) => c.category === cat);
      if (items.length > 0) map.set(cat, items);
    }
    return map;
  }, [filtered]);

  // Flat ordered list for keyboard navigation
  const flatFiltered = useMemo(
    () => CATEGORY_ORDER.flatMap((cat) => grouped.get(cat) ?? []),
    [grouped]
  );

  // Reset state when palette opens/closes
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Keep active index in bounds
  useEffect(() => {
    if (activeIndex >= flatFiltered.length) {
      setActiveIndex(Math.max(0, flatFiltered.length - 1));
    }
  }, [flatFiltered.length, activeIndex]);

  const executeCommand = useCallback(
    (cmd: CommandEntry) => {
      cmd.action(helpers);
    },
    [helpers]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, flatFiltered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = flatFiltered[activeIndex];
        if (cmd) executeCommand(cmd);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    },
    [flatFiltered, activeIndex, executeCommand, setOpen]
  );

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[200] flex items-start justify-center pt-[12vh]"
        aria-modal="true"
        role="dialog"
        aria-label="لوحة الأوامر"
        onClick={() => setOpen(false)}
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        />

        {/* Panel */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: -8 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            'relative z-10 w-full max-w-[600px] mx-4',
            'bg-background/95 backdrop-blur-xl',
            'border border-border/60 rounded-2xl shadow-2xl',
            'overflow-hidden'
          )}
          onClick={(e) => e.stopPropagation()}
          dir="rtl"
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/40">
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="ابحث عن أمر… (بحث عربي وإنجليزي)"
              className={cn(
                'flex-1 bg-transparent text-sm text-foreground',
                'placeholder:text-muted-foreground/60',
                'outline-none border-none focus:ring-0',
                'min-w-0'
              )}
              dir="auto"
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button
                onClick={() => { setQuery(''); setActiveIndex(0); inputRef.current?.focus(); }}
                className="text-muted-foreground/60 hover:text-foreground transition-colors"
                aria-label="مسح البحث"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors"
              aria-label="إغلاق"
            >
              <ArrowLeft className="w-3 h-3" />
              <kbd className="px-1.5 py-0.5 rounded bg-muted/50 font-mono text-[10px]">Esc</kbd>
            </button>
          </div>

          {/* Category filter pills (shown when no query) */}
          {!query && (
            <div className="flex gap-1.5 px-4 py-2 border-b border-border/30 overflow-x-auto scrollbar-none">
              {CATEGORY_ORDER.map((cat) => {
                const meta = CATEGORY_META[cat];
                const count = commands.filter((c) => c.category === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => {
                      // Scroll the category heading into view
                      const el = listRef.current?.querySelector(`[data-category="${cat}"]`) as HTMLElement | null;
                      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className={cn(
                      'flex-shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all',
                      'bg-muted/50 text-muted-foreground hover:bg-primary/10 hover:text-primary'
                    )}
                  >
                    {meta.label}
                    <span className="mr-1 text-[9px] text-muted-foreground/50">{count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Results */}
          <div
            ref={listRef}
            className="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain py-2"
          >
            {flatFiltered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                <Search className="w-8 h-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">لا توجد نتائج لـ "{query}"</p>
                <p className="text-[11px] text-muted-foreground/50">جرّب كلمة مختلفة أو بحث بالإنجليزية</p>
              </div>
            ) : (
              CATEGORY_ORDER.map((cat) => {
                const items = grouped.get(cat);
                if (!items) return null;
                const meta = CATEGORY_META[cat];

                return (
                  <div key={cat}>
                    {/* Category heading */}
                    <div
                      data-category={cat}
                      className="flex items-center gap-2 px-4 py-1.5 sticky top-0 bg-background/90 backdrop-blur-sm z-10"
                    >
                      <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                        {meta.label}
                      </span>
                      <span className="text-[9px] text-muted-foreground/40">{meta.labelEn}</span>
                    </div>

                    {/* Command items */}
                    {items.map((cmd) => {
                      const flatIdx = flatFiltered.indexOf(cmd);
                      const isActive = flatIdx === activeIndex;
                      return (
                        <button
                          key={cmd.id}
                          data-idx={flatIdx}
                          onClick={() => executeCommand(cmd)}
                          onMouseEnter={() => setActiveIndex(flatIdx)}
                          className={cn(
                            'w-full flex items-center gap-3 px-4 py-2.5 text-right transition-colors',
                            isActive
                              ? 'bg-primary/10 text-primary'
                              : 'text-foreground hover:bg-muted/50'
                          )}
                        >
                          {/* Icon */}
                          <div
                            className={cn(
                              'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
                              isActive ? 'bg-primary/20' : 'bg-muted/60'
                            )}
                          >
                            <cmd.icon
                              className={cn(
                                'w-3.5 h-3.5',
                                isActive ? 'text-primary' : 'text-muted-foreground'
                              )}
                            />
                          </div>

                          {/* Labels */}
                          <div className="flex-1 min-w-0 text-right">
                            <p className="text-sm leading-snug truncate">{cmd.label}</p>
                            {query && (
                              <p className="text-[10px] text-muted-foreground/60 truncate">{cmd.labelEn}</p>
                            )}
                          </div>

                          {/* Shortcut */}
                          {cmd.shortcut && (
                            <kbd
                              className={cn(
                                'flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors',
                                isActive
                                  ? 'bg-primary/20 text-primary'
                                  : 'bg-muted text-muted-foreground'
                              )}
                            >
                              {cmd.shortcut}
                            </kbd>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer hint */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-border/30 bg-muted/20">
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground/50">
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[9px]">↑↓</kbd>
                تنقل
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[9px]">↵</kbd>
                تنفيذ
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[9px]">⌘K</kbd>
                إغلاق
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground/40">
              {flatFiltered.length} أمر
            </span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
