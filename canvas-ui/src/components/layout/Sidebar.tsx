import { motion } from 'framer-motion';
import { useCanvasStore } from '@/stores/canvas-store';
import { useAuthStore } from '@/stores/auth-store';
import type { SidebarTab } from '@/types/canvas';
import { cn } from '@/lib/utils';
import { durations, easings } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import {
  Library,
  LayoutTemplate,
  Clock,
  Download,
  ShieldCheck,
  ChevronRight,
  X,
  Pin,
  PinOff,
  FileText,
  Table,
  Presentation,
  Image,
  Video,
  Music,
  CheckCircle2,
  XCircle,
  Eye,
  Search,
  Settings,
  BookOpen,
  Database,
  Sparkles,
  FileSpreadsheet,
  FileJson,
  LayoutDashboard,
  Badge,
  Lock,
  Key,
  User,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { SettingsPanel } from '@/components/layout/SettingsPanel';

// APX-0357/0358: Sidebar includes Library, Search, History, Exports, Settings, Permissions
const tabs: { id: SidebarTab; label: string; icon: typeof Library }[] = [
  { id: 'library',     label: 'المكتبة',    icon: Library },
  { id: 'history',     label: 'السجل',      icon: Clock },
  { id: 'exports',     label: 'التصدير',    icon: Download },
  { id: 'permissions', label: 'الصلاحيات',  icon: ShieldCheck },
  { id: 'search',      label: 'البحث',      icon: Search },
  { id: 'templates',   label: 'القوالب',    icon: LayoutTemplate },
  { id: 'governance',  label: 'الحوكمة',    icon: Lock },
  { id: 'settings',    label: 'الإعدادات',  icon: Settings },
];

// Primary 4 tabs shown prominently at top
const primaryTabs = tabs.slice(0, 4);
// Secondary tabs in overflow scroll row
const secondaryTabs = tabs.slice(4);

// APX-0359: Pin mode — sidebar stays open
// E07-0098 to E07-0107: Sidebar — collapsible panel with tabs
export function Sidebar() {
  const sidebarState = useCanvasStore((s) => s.sidebarState);
  const sidebarTab = useCanvasStore((s) => s.sidebarTab);
  const setSidebarTab = useCanvasStore((s) => s.setSidebarTab);
  const setSidebarState = useCanvasStore((s) => s.setSidebarState);
  const [pinned, setPinned] = useState(false);

  const isPeek = sidebarState === 'peek';

  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{
        width: isPeek ? 64 : 320,
        opacity: 1,
      }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: durations.base, ease: easings.default as unknown as number[] }}
      className="flex-shrink-0 border-r border-border/50 bg-background/80 backdrop-blur-sm overflow-hidden h-full"
    >
      {isPeek ? (
        <PeekSidebar
          activeTab={sidebarTab}
          onTabSelect={(tab) => {
            setSidebarTab(tab);
            setSidebarState('full');
          }}
        />
      ) : (
        <FullSidebar
          activeTab={sidebarTab}
          onTabSelect={setSidebarTab}
          onClose={() => {
            if (!pinned) setSidebarState('hidden');
          }}
          onCollapse={() => {
            if (!pinned) setSidebarState('peek');
          }}
          pinned={pinned}
          onTogglePin={() => setPinned((p) => !p)}
        />
      )}
    </motion.aside>
  );
}

function PeekSidebar({
  activeTab,
  onTabSelect,
}: {
  activeTab: SidebarTab;
  onTabSelect: (tab: SidebarTab) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1 py-3">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabSelect(tab.id)}
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center transition-colors',
            tab.id === activeTab
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted'
          )}
          title={tab.label}
          aria-label={tab.label}
        >
          <tab.icon className="w-5 h-5" />
        </button>
      ))}
    </div>
  );
}

function FullSidebar({
  activeTab,
  onTabSelect,
  onClose,
  onCollapse,
  pinned,
  onTogglePin,
}: {
  activeTab: SidebarTab;
  onTabSelect: (tab: SidebarTab) => void;
  onClose: () => void;
  onCollapse: () => void;
  pinned: boolean;
  onTogglePin: () => void;
}) {
  return (
    <div className="flex flex-col h-full w-[320px]">
      {/* Header */}
      <div className="flex items-center justify-between h-12 px-3 border-b border-border/50">
        <span className="text-sm font-bold text-foreground">
          {tabs.find((t) => t.id === activeTab)?.label}
        </span>
        <div className="flex items-center gap-0.5">
          {/* APX-0359: Pin button */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onTogglePin}
            className={cn(pinned && 'bg-primary/10 text-primary')}
            aria-label={pinned ? 'إلغاء التثبيت' : 'تثبيت اللوحة'}
            title={pinned ? 'إلغاء التثبيت' : 'تثبيت اللوحة'}
          >
            {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onCollapse}
            aria-label="تصغير اللوحة"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="إغلاق اللوحة"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Primary 4 tab bar — prominent */}
      <div className="grid grid-cols-4 border-b border-border/50 bg-muted/20">
        {primaryTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabSelect(tab.id)}
            className={cn(
              'flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] transition-all relative',
              tab.id === activeTab
                ? 'text-primary font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            )}
          >
            <tab.icon className="w-4 h-4" />
            <span>{tab.label}</span>
            {tab.id === activeTab && (
              <motion.div
                layoutId="primary-tab-indicator"
                className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full"
                transition={{ duration: durations.short }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Secondary tabs — overflow scroll */}
      <div className="flex border-b border-border/30 overflow-x-auto bg-muted/10">
        {secondaryTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabSelect(tab.id)}
            className={cn(
              'flex-shrink-0 flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] transition-colors whitespace-nowrap',
              tab.id === activeTab
                ? 'text-primary border-b-2 border-primary font-medium'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <tab.icon className="w-3 h-3" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        <SidebarContent tab={activeTab} />
      </div>
    </div>
  );
}

// ─── Category icons map ────────────────────────────────────────────────────────

const categoryIcons: Record<string, typeof FileText> = {
  document:     FileText,
  spreadsheet:  Table,
  presentation: Presentation,
  image:        Image,
  video:        Video,
  audio:        Music,
};

const categoryLabels: Record<string, string> = {
  document:     'مستند',
  spreadsheet:  'جدول',
  presentation: 'عرض',
  image:        'صورة',
  video:        'فيديو',
  audio:        'صوت',
  unknown:      'ملف',
};

const artifactIcons: Record<string, typeof FileText> = {
  pptx:      Presentation,
  docx:      FileText,
  xlsx:      FileSpreadsheet,
  dashboard: LayoutDashboard,
  pdf:       FileText,
  png:       Image,
  srt:       FileText,
  json:      FileJson,
};

const artifactColors: Record<string, string> = {
  pptx:      'text-orange-500 bg-orange-500/10',
  docx:      'text-blue-500 bg-blue-500/10',
  xlsx:      'text-green-500 bg-green-500/10',
  dashboard: 'text-purple-500 bg-purple-500/10',
  pdf:       'text-red-500 bg-red-500/10',
  png:       'text-sky-500 bg-sky-500/10',
  srt:       'text-muted-foreground bg-muted',
  json:      'text-amber-500 bg-amber-500/10',
};

// ─── Permission definitions ───────────────────────────────────────────────────

const PERMISSION_DEFINITIONS: { key: string; label: string; desc: string; category: string }[] = [
  { key: 'data:read',         label: 'قراءة البيانات',          desc: 'الوصول لقراءة الملفات والمصادر',       category: 'بيانات' },
  { key: 'data:write',        label: 'كتابة البيانات',          desc: 'رفع وتعديل الملفات والمصادر',         category: 'بيانات' },
  { key: 'convert:strict',    label: 'التحويل STRICT 1:1',      desc: 'تشغيل محرك التحويل الدقيق',           category: 'تحويل' },
  { key: 'dashboard:create',  label: 'إنشاء Dashboards',        desc: 'بناء لوحات المؤشرات التفاعلية',       category: 'تحليل' },
  { key: 'report:generate',   label: 'توليد التقارير',          desc: 'إنشاء وتصدير التقارير التنفيذية',     category: 'تقارير' },
  { key: 'governance:view',   label: 'عرض الحوكمة',             desc: 'الاطلاع على سجلات التدقيق والأدلة',  category: 'حوكمة' },
  { key: 'governance:manage', label: 'إدارة الحوكمة',           desc: 'تعديل الصلاحيات والأدوار',            category: 'حوكمة' },
  { key: 'ai:query',          label: 'استجواب الذكاء الاصطناعي', desc: 'استخدام محركات الذكاء الاصطناعي',  category: 'ذكاء' },
];

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  admin:    { label: 'مدير النظام',  color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  owner:    { label: 'مالك',         color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  manager:  { label: 'مدير',         color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  analyst:  { label: 'محلل',         color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  viewer:   { label: 'مشاهد',        color: 'bg-muted text-muted-foreground' },
};

// ─── SidebarContent ───────────────────────────────────────────────────────────

function SidebarContent({ tab }: { tab: SidebarTab }) {
  const uploadedFiles = useCanvasStore((s) => s.uploadedFiles);
  const messages = useCanvasStore((s) => s.messages);
  const openFocusStage = useCanvasStore((s) => s.openFocusStage);

  // Extract completed artifacts from messages
  const artifacts = useMemo(() => {
    const results: {
      name: string;
      type: string;
      id: string;
      timestamp: Date;
      downloadUrl?: string;
      gatesPassed?: boolean;
    }[] = [];
    messages.forEach((msg) => {
      msg.cards?.forEach((card) => {
        if (card.type === 'result' && card.artifact) {
          results.push({
            name: card.artifact.name,
            type: card.artifact.type,
            id: card.artifact.id,
            timestamp: msg.timestamp,
            downloadUrl: card.artifact.downloadUrl,
            gatesPassed: card.artifact.gatesPassed,
          });
        }
      });
    });
    return results;
  }, [messages]);

  // Extract pipeline/history runs from messages
  const historyRuns = useMemo(() => {
    const runs: {
      id: string;
      sourceFormat: string;
      targetFormat: string;
      status: 'running' | 'done' | 'failed';
      timestamp: Date;
      fileName: string;
    }[] = [];
    messages.forEach((msg) => {
      if (msg.role !== 'user') return;
      if (!msg.content.startsWith('تم رفع ')) return;
      // Look for result cards in assistant messages after this
      const idx = messages.indexOf(msg);
      const assistantMsg = messages[idx + 1];
      const hasResult = assistantMsg?.cards?.some((c) => c.type === 'result');
      const hasPlan = assistantMsg?.cards?.some((c) => c.type === 'plan');

      if (hasPlan || hasResult) {
        const resultCard = assistantMsg?.cards?.find((c) => c.type === 'result');
        runs.push({
          id: `run_${msg.id}`,
          sourceFormat: msg.content.replace('تم رفع ', ''),
          targetFormat: resultCard?.artifact?.type?.toUpperCase() ?? 'PPTX',
          status: hasResult ? 'done' : 'running',
          timestamp: msg.timestamp,
          fileName: msg.content.replace('تم رفع ', ''),
        });
      }
    });
    return runs.reverse().slice(0, 20);
  }, [messages]);

  // Extract evidence/governance records
  const evidenceRecords = useMemo(() => {
    const records: { id: string; passed: boolean; timestamp: Date; pixelDiff: number }[] = [];
    messages.forEach((msg) => {
      msg.cards?.forEach((card) => {
        if (card.type === 'evidence' && card.evidenceData) {
          records.push({
            id: card.evidenceData.evidenceId,
            passed: card.evidenceData.gatesPassed,
            timestamp: card.evidenceData.timestamp,
            pixelDiff: card.evidenceData.pixelDiff,
          });
        }
      });
    });
    return records;
  }, [messages]);

  switch (tab) {
    // ── 1. Library ──────────────────────────────────────────────────────────
    case 'library':
      return <LibraryTab uploadedFiles={uploadedFiles} />;

    // ── 2. History ──────────────────────────────────────────────────────────
    case 'history':
      return <HistoryTab historyRuns={historyRuns} messages={messages} />;

    // ── 3. Exports ──────────────────────────────────────────────────────────
    case 'exports':
      return (
        <ExportsTab
          artifacts={artifacts}
          openFocusStage={openFocusStage}
        />
      );

    // ── 4. Permissions ──────────────────────────────────────────────────────
    case 'permissions':
      return <PermissionsTab />;

    // APX-0357: Search tab
    case 'search':
      return <SearchTab />;

    case 'templates':
      return <TemplatesTab />;

    case 'governance':
      return <GovernanceTab evidenceRecords={evidenceRecords} />;

    // GP-0232-0236 + GP-0071: Settings tab
    case 'settings':
      return <SettingsPanel />;

    default:
      return null;
  }
}

// ─── Library Tab ──────────────────────────────────────────────────────────────

function LibraryTab({
  uploadedFiles,
}: {
  uploadedFiles: ReturnType<typeof useCanvasStore.getState>['uploadedFiles'];
}) {
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'size'>('date');

  const filtered = useMemo(() => {
    let list = [...uploadedFiles];
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((f) => f.name.toLowerCase().includes(q));
    }
    if (sortBy === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    if (sortBy === 'size') list.sort((a, b) => b.size - a.size);
    return list;
  }, [uploadedFiles, query, sortBy]);

  return (
    <div className="space-y-3">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث في الملفات…"
          className="w-full pr-8 pl-3 py-2 text-xs bg-muted/50 border border-border/30 rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
          dir="auto"
        />
      </div>

      {/* Sort controls */}
      {uploadedFiles.length > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground ml-1">ترتيب:</span>
          {(['date', 'name', 'size'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={cn(
                'text-[9px] px-1.5 py-0.5 rounded-md transition-colors',
                sortBy === s
                  ? 'bg-primary/15 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              {s === 'date' ? 'تاريخ' : s === 'name' ? 'اسم' : 'حجم'}
            </button>
          ))}
          <span className="text-[9px] text-muted-foreground mr-auto">{filtered.length} ملف</span>
        </div>
      )}

      {/* File list */}
      {filtered.length === 0 ? (
        <EmptyTab
          message={
            query ? 'لا توجد ملفات تطابق بحثك.' : 'لا توجد ملفات بعد. اسحب ملفاً للبدء.'
          }
        />
      ) : (
        <div className="space-y-1">
          {filtered.map((file) => {
            const Icon = categoryIcons[file.category] || FileText;
            return (
              <motion.div
                key={file.id}
                layout
                className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/50 transition-colors group cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground truncate font-medium">{file.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
                      {categoryLabels[file.category] || 'ملف'}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {formatBytes(file.size)}
                    </span>
                  </div>
                </div>
                {file.uploadProgress !== undefined && file.uploadProgress < 100 ? (
                  <div className="flex items-center gap-1">
                    <Loader2 className="w-3 h-3 text-primary animate-spin" />
                    <span className="text-[9px] text-primary">{file.uploadProgress}%</span>
                  </div>
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-success opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────

const statusConfig = {
  running: {
    label: 'جارٍ',
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    dot: 'bg-amber-400 animate-pulse',
    icon: Loader2,
  },
  done: {
    label: 'مكتمل',
    color: 'bg-success/10 text-success',
    dot: 'bg-success',
    icon: CheckCircle2,
  },
  failed: {
    label: 'فشل',
    color: 'bg-destructive/10 text-destructive',
    dot: 'bg-destructive',
    icon: XCircle,
  },
};

function HistoryTab({
  historyRuns,
  messages,
}: {
  historyRuns: {
    id: string;
    sourceFormat: string;
    targetFormat: string;
    status: 'running' | 'done' | 'failed';
    timestamp: Date;
    fileName: string;
  }[];
  messages: ReturnType<typeof useCanvasStore.getState>['messages'];
}) {
  // Show message history when no pipeline runs
  const showMessages = historyRuns.length === 0;

  if (showMessages) {
    return (
      <div className="space-y-2">
        {messages.length === 0 ? (
          <EmptyTab message="سجل العمليات السابقة سيظهر هنا." />
        ) : (
          <>
            <p className="text-[10px] text-muted-foreground mb-2">{messages.length} رسالة</p>
            {[...messages].reverse().slice(0, 20).map((msg) => (
              <div
                key={msg.id}
                className="flex items-start gap-2 p-2 rounded-lg hover:bg-muted/30 transition-colors text-xs"
              >
                <div
                  className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-0.5',
                    msg.role === 'user' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {msg.role === 'user' ? 'أ' : 'ر'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-foreground truncate">
                    {msg.content || (msg.cards?.length ? `${msg.cards.length} بطاقات` : '…')}
                  </p>
                  <p className="text-[9px] text-muted-foreground/60 mt-0.5">
                    {msg.timestamp.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-muted-foreground mb-2">{historyRuns.length} عملية تحويل</p>
      {historyRuns.map((run) => {
        const cfg = statusConfig[run.status];
        const Icon = cfg.icon;
        return (
          <div
            key={run.id}
            className="p-2.5 rounded-xl border border-border/40 hover:border-primary/30 hover:bg-primary/3 transition-all group"
          >
            {/* Source → Target */}
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                {run.sourceFormat.split('.').pop()?.toUpperCase() ?? 'ملف'}
              </span>
              <svg className="w-3 h-3 text-muted-foreground flex-shrink-0" viewBox="0 0 12 12" fill="none">
                <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[10px] font-mono bg-primary/10 px-1.5 py-0.5 rounded text-primary font-semibold">
                {run.targetFormat}
              </span>

              {/* Status badge */}
              <span
                className={cn(
                  'mr-auto text-[9px] font-semibold px-1.5 py-0.5 rounded-md flex items-center gap-1',
                  cfg.color
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                {cfg.label}
              </span>
            </div>

            {/* File name */}
            <p className="text-[10px] text-foreground truncate mb-1">{run.fileName}</p>

            {/* Timestamp */}
            <p className="text-[9px] text-muted-foreground">
              {run.timestamp.toLocaleString('ar-SA', {
                hour: '2-digit',
                minute: '2-digit',
                day: 'numeric',
                month: 'short',
              })}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Exports Tab ──────────────────────────────────────────────────────────────

function ExportsTab({
  artifacts,
  openFocusStage,
}: {
  artifacts: {
    name: string;
    type: string;
    id: string;
    timestamp: Date;
    downloadUrl?: string;
    gatesPassed?: boolean;
  }[];
  openFocusStage: ReturnType<typeof useCanvasStore.getState>['openFocusStage'];
}) {
  function handleDownload(art: typeof artifacts[0]) {
    if (!art.downloadUrl) return;
    const a = document.createElement('a');
    a.href = art.downloadUrl;
    a.download = art.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div className="space-y-2">
      {artifacts.length === 0 ? (
        <EmptyTab message="المخرجات المصدّرة ستظهر هنا بعد إتمام أول عملية." />
      ) : (
        <>
          <p className="text-[10px] text-muted-foreground mb-2">{artifacts.length} مخرج</p>
          {artifacts.map((art) => {
            const Icon = artifactIcons[art.type] || FileText;
            const colorCls = artifactColors[art.type] || 'text-muted-foreground bg-muted';

            return (
              <div
                key={art.id}
                className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border/40 hover:border-primary/30 hover:bg-primary/3 transition-all group"
              >
                {/* Format icon */}
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', colorCls)}>
                  <Icon className="w-4 h-4" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-semibold text-foreground truncate">{art.name}</p>
                    {art.gatesPassed && (
                      <CheckCircle2 className="w-3 h-3 text-success flex-shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[9px] text-muted-foreground uppercase font-mono">{art.type}</span>
                    <span className="text-[9px] text-muted-foreground">
                      {art.timestamp.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() =>
                      openFocusStage({
                        artifactId: art.id,
                        artifactType: art.type as 'pptx' | 'docx' | 'xlsx' | 'dashboard' | 'pdf' | 'png' | 'srt' | 'json',
                        title: art.name,
                      })
                    }
                    className="w-6 h-6 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                    title="معاينة"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDownload(art)}
                    disabled={!art.downloadUrl}
                    className={cn(
                      'w-6 h-6 rounded-md flex items-center justify-center transition-colors',
                      art.downloadUrl
                        ? 'hover:bg-primary/10 text-primary hover:text-primary'
                        : 'text-muted-foreground/30 cursor-not-allowed'
                    )}
                    title="تحميل"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ─── Permissions Tab ──────────────────────────────────────────────────────────

function PermissionsTab() {
  const user = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const categories = useMemo(
    () => [...new Set(PERMISSION_DEFINITIONS.map((p) => p.category))],
    []
  );

  const filtered = useMemo(() => {
    if (!categoryFilter) return PERMISSION_DEFINITIONS;
    return PERMISSION_DEFINITIONS.filter((p) => p.category === categoryFilter);
  }, [categoryFilter]);

  // Determine primary role label
  const primaryRole = useMemo(() => {
    if (!user) return null;
    if (user.isOwner) return 'owner';
    const known = ['admin', 'manager', 'analyst', 'viewer'];
    return user.roles.find((r) => known.includes(r)) ?? user.roles[0] ?? null;
  }, [user]);

  const roleCfg = primaryRole ? (ROLE_LABELS[primaryRole] ?? { label: primaryRole, color: 'bg-muted text-muted-foreground' }) : null;

  if (!user) {
    return (
      <div className="flex items-center justify-center h-32 text-center px-4">
        <div>
          <User className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">لم يتم تسجيل الدخول</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* User card */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/30">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <User className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground truncate">
            {user.displayNameAr ?? user.displayName ?? user.username}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">{user.email ?? user.username}</p>
        </div>
        {/* Role badge */}
        {roleCfg && (
          <span className={cn('text-[9px] font-bold px-2 py-1 rounded-lg flex-shrink-0', roleCfg.color)}>
            {roleCfg.label}
          </span>
        )}
      </div>

      {/* Owner indicator */}
      {user.isOwner && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-purple-50 border border-purple-200 dark:bg-purple-900/20 dark:border-purple-700/40">
          <Key className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
          <p className="text-[10px] text-purple-700 dark:text-purple-400 font-medium">
            مالك المنصة — صلاحيات كاملة
          </p>
        </div>
      )}

      {/* All roles */}
      {user.roles.length > 1 && (
        <div>
          <p className="text-[10px] text-muted-foreground mb-1.5 font-semibold">الأدوار</p>
          <div className="flex flex-wrap gap-1">
            {user.roles.map((role) => {
              const cfg = ROLE_LABELS[role] ?? { label: role, color: 'bg-muted text-muted-foreground' };
              return (
                <span key={role} className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded-md', cfg.color)}>
                  {cfg.label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Category filter */}
      <div>
        <p className="text-[10px] text-muted-foreground mb-1.5 font-semibold">الصلاحيات</p>
        <div className="flex flex-wrap gap-1 mb-2">
          <button
            onClick={() => setCategoryFilter(null)}
            className={cn(
              'text-[9px] px-1.5 py-0.5 rounded-md transition-colors',
              !categoryFilter ? 'bg-primary/15 text-primary font-medium' : 'bg-muted text-muted-foreground hover:bg-muted/70'
            )}
          >
            الكل
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat === categoryFilter ? null : cat)}
              className={cn(
                'text-[9px] px-1.5 py-0.5 rounded-md transition-colors',
                categoryFilter === cat
                  ? 'bg-primary/15 text-primary font-medium'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70'
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Permission list */}
        <div className="space-y-1.5">
          {filtered.map((perm) => {
            const allowed = user.isOwner || hasPermission(perm.key);
            return (
              <div
                key={perm.key}
                className={cn(
                  'flex items-start gap-2.5 p-2.5 rounded-lg border transition-all',
                  allowed
                    ? 'border-success/20 bg-success/3'
                    : 'border-border/30 bg-muted/20 opacity-60'
                )}
              >
                {/* Check/X icon */}
                <div className="mt-0.5 flex-shrink-0">
                  {allowed ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-muted-foreground/50" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[11px] font-semibold text-foreground">{perm.label}</p>
                    <span className="text-[8px] font-mono text-muted-foreground/50 bg-muted px-1 py-0.5 rounded">
                      {perm.category}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{perm.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Permission key list */}
      <div>
        <p className="text-[10px] text-muted-foreground mb-1.5 font-semibold flex items-center gap-1">
          <Lock className="w-3 h-3" />
          مفاتيح الصلاحيات (API)
        </p>
        <div className="rounded-lg border border-border/30 divide-y divide-border/20 overflow-hidden">
          {user.permissions.length === 0 && !user.isOwner ? (
            <div className="p-3 text-center">
              <AlertCircle className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
              <p className="text-[10px] text-muted-foreground">لا توجد صلاحيات محددة</p>
            </div>
          ) : (
            (user.isOwner ? PERMISSION_DEFINITIONS.map((p) => p.key) : user.permissions).map(
              (perm) => (
                <div key={perm} className="flex items-center gap-2 px-2.5 py-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
                  <span className="text-[9px] font-mono text-muted-foreground">{perm}</span>
                </div>
              )
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Search Tab ───────────────────────────────────────────────────────────────

function SearchTab() {
  const [query, setQuery] = useState('');
  const uploadedFiles = useCanvasStore((s) => s.uploadedFiles);
  const messages = useCanvasStore((s) => s.messages);

  const results = useMemo(() => {
    if (!query.trim()) return { files: uploadedFiles, messages: [] };
    const q = query.toLowerCase();
    return {
      files: uploadedFiles.filter((f) => f.name.toLowerCase().includes(q)),
      messages: messages.filter((m) => m.content.toLowerCase().includes(q)),
    };
  }, [query, uploadedFiles, messages]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث في الملفات والسجل…"
          className="w-full pr-8 pl-3 py-2 text-xs bg-muted/50 border border-border/30 rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
          dir="auto"
        />
      </div>

      {results.files.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground mb-1.5">{results.files.length} ملف</p>
          {results.files.map((file) => (
            <div key={file.id} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted/30 text-xs">
              <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="truncate text-foreground">{file.name}</span>
            </div>
          ))}
        </div>
      )}

      {results.messages.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground mb-1.5">{results.messages.length} رسالة</p>
          {results.messages.slice(0, 10).map((msg) => (
            <div key={msg.id} className="p-1.5 rounded-lg hover:bg-muted/30 text-xs text-foreground truncate">
              {msg.content || '…'}
            </div>
          ))}
        </div>
      )}

      {query && results.files.length === 0 && results.messages.length === 0 && (
        <EmptyTab message="لا توجد نتائج لبحثك." />
      )}

      {!query && (
        <EmptyTab message="اكتب للبحث في ملفاتك ورسائلك وعملياتك." />
      )}
    </div>
  );
}

// ─── Templates Tab ────────────────────────────────────────────────────────────

function TemplatesTab() {
  return (
    <div className="space-y-4">
      {/* Recipes */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <BookOpen className="w-3.5 h-3.5 text-primary" />
          <p className="text-[10px] text-primary font-medium">وصفات جاهزة (Recipes)</p>
        </div>
        {[
          { name: 'PDF → PowerPoint 1:1', cmd: 'حوّل PDF إلى PowerPoint 1:1', desc: 'تحويل مطابق pixel-perfect مع قابلية التعديل' },
          { name: 'صورة جدول → Excel',   cmd: 'استخرج الجدول من الصورة إلى Excel', desc: 'استخراج الجدول من صورة إلى XLSX editable' },
          { name: 'ملفات → Dashboard',   cmd: 'حلّل الملفات واصنع Dashboard', desc: 'تحليل شامل + لوحة مؤشرات تفاعلية' },
          { name: 'تعريب احترافي',        cmd: 'عرّب الملف بوضع PRO', desc: 'تعريب مع الحفاظ على التصميم' },
        ].map((recipe) => (
          <button
            key={recipe.name}
            onClick={() => {
              const store = useCanvasStore.getState();
              store.setComposerText(recipe.cmd);
              store.handleSendMessage();
            }}
            className="w-full text-right p-2 rounded-lg border border-border/30 hover:border-primary/30 hover:bg-primary/5 transition-all mb-1.5"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">{recipe.name}</p>
                <p className="text-[10px] text-muted-foreground">{recipe.desc}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Sandbox datasets */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Database className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-[10px] text-muted-foreground font-medium">بيانات تجريبية (Sandbox)</p>
        </div>
        {[
          { name: 'بيانات مبيعات Q4', desc: 'جدول مبيعات ربع سنوي — 500 صف' },
          { name: 'تقرير أداء سنوي',  desc: 'PDF تقرير إدارة — 12 صفحة' },
          { name: 'عرض تسويقي',       desc: 'عرض PPTX — 15 شريحة بالعربية' },
        ].map((ds) => (
          <div
            key={ds.name}
            className="p-2 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer mb-1"
          >
            <p className="text-xs text-foreground">{ds.name}</p>
            <p className="text-[10px] text-muted-foreground">{ds.desc}</p>
          </div>
        ))}
      </div>

      {/* Template gallery */}
      <div>
        <p className="text-[10px] text-muted-foreground mb-2">قوالب جاهزة</p>
        {[
          { name: 'تقرير تنفيذي',        type: 'docx',      desc: 'قالب تقرير رسمي للإدارة العليا' },
          { name: 'عرض تقديمي أعمال',    type: 'pptx',      desc: 'قالب عرض احترافي ١٦:٩' },
          { name: 'لوحة مؤشرات KPI',     type: 'dashboard', desc: 'لوحة مؤشرات أداء تفاعلية' },
          { name: 'جدول مالي',           type: 'xlsx',      desc: 'قالب جدول بيانات مالية' },
          { name: 'تقرير مقارنة',        type: 'docx',      desc: 'مقارنة فترات أو نسخ' },
          { name: 'إنفوجرافيك',          type: 'png',       desc: 'قالب إنفوجرافيك عربي' },
        ].map((tmpl) => (
          <div
            key={tmpl.name}
            className="p-2.5 rounded-lg border border-border/30 hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer group mb-1.5"
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                <LayoutTemplate className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">{tmpl.name}</p>
                <p className="text-[10px] text-muted-foreground">{tmpl.desc}</p>
              </div>
              <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground uppercase">
                {tmpl.type}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Governance Tab ───────────────────────────────────────────────────────────

function GovernanceTab({
  evidenceRecords,
}: {
  evidenceRecords: { id: string; passed: boolean; timestamp: Date; pixelDiff: number }[];
}) {
  return (
    <div className="space-y-2">
      {evidenceRecords.length === 0 ? (
        <EmptyTab message="سجل الحوكمة والتحقق سيظهر هنا بعد إتمام أول عملية مع بوابات التحقق." />
      ) : (
        <>
          <p className="text-[10px] text-muted-foreground mb-2">{evidenceRecords.length} تحقق</p>
          {evidenceRecords.map((rec) => (
            <div key={rec.id} className="p-2.5 rounded-lg border border-border/30">
              <div className="flex items-center gap-2">
                {rec.passed ? (
                  <CheckCircle2 className="w-4 h-4 text-success" />
                ) : (
                  <XCircle className="w-4 h-4 text-destructive" />
                )}
                <span className="text-xs font-medium text-foreground">
                  {rec.passed ? 'بوابات التحقق مرت' : 'فشل في التحقق'}
                </span>
              </div>
              <div className="mt-1.5 space-y-1 text-[10px] text-muted-foreground">
                <div className="flex justify-between">
                  <span>فرق البكسل:</span>
                  <span className={rec.pixelDiff === 0 ? 'text-success' : 'text-amber-600'}>
                    {rec.pixelDiff}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>المعرّف:</span>
                  <span className="font-mono text-[9px]">{rec.id.slice(0, 16)}…</span>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function EmptyTab({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-32 text-center">
      <p className="text-xs text-muted-foreground leading-relaxed">{message}</p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0';
  const k = 1024;
  const sizes = ['بايت', 'ك.ب', 'م.ب'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
