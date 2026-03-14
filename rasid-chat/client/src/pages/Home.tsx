/* RASID Visual DNA — Home Page
   Smooth morphing panel transitions (animated width, not mount/unmount)
   Keyboard shortcuts: Ctrl+D (data), Ctrl+Shift+S (studio), Ctrl+B (both)
   Ultra Premium collapsed panels with glassmorphism
   Mobile: drawers from sides, canvas always centered */
import { useState, useCallback, useRef, useEffect } from 'react';
import NotebookHeader from '@/components/NotebookHeader';
import DataPanel from '@/components/DataPanel';
import ChatCanvas from '@/components/ChatCanvas';
import StudioPanel from '@/components/StudioPanel';
import MaterialIcon from '@/components/MaterialIcon';
import AddSourceDialog from '@/components/AddSourceDialog';
import ShareDialog from '@/components/ShareDialog';
import AnalyticsDialog from '@/components/AnalyticsDialog';
import StudioToolDialog from '@/components/StudioToolDialog';
import SettingsMenu from '@/components/SettingsMenu';
import WorkspaceView from '@/components/WorkspaceView';
import { WORKSPACE_VIEWS } from '@/lib/assets';
import { useTheme } from '@/contexts/ThemeContext';

export interface DataItem {
  id: string;
  title: string;
  type: 'file' | 'table' | 'group' | 'flow';
  status: 'ready' | 'processing' | 'review' | 'failed' | 'merged';
  icon: string;
  size?: string;
}

export interface StudioOutput {
  id: string;
  title: string;
  type: string;
  time: string;
  icon: string;
}

/* ===== Collapsed Data Panel — Ultra Premium ===== */
function CollapsedDataPanel({ onExpand }: { onExpand: () => void }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div className="flex flex-col items-center h-full shrink-0 w-[52px] animate-collapsed-enter">
      <div className="h-full w-full rounded-2xl glass border border-border/40 flex flex-col items-center py-3 gap-1 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full bg-gradient-to-l from-primary/60 via-primary to-primary/60" />
        <button
          onClick={onExpand}
          className="group relative w-10 h-10 flex items-center justify-center rounded-xl bg-primary/8 hover:bg-primary/15 transition-all duration-300 hover:scale-110 mt-1"
          title="فتح لوحة البيانات (Ctrl+D)"
        >
          <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ boxShadow: `0 0 16px 2px ${isDark ? 'oklch(0.58 0.14 250 / 0.3)' : 'oklch(0.30 0.08 250 / 0.2)'}` }} />
          <MaterialIcon icon="database" size={20} className="text-primary transition-transform duration-300 group-hover:scale-110" />
        </button>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 relative">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse-soft" />
          <span className="text-[9px] font-bold text-primary/70 writing-mode-vertical tracking-[0.15em] select-none">البيانات</span>
          <div className="flex flex-col gap-1.5 items-center">
            <div className="w-5 h-[3px] rounded-full bg-success/40 animate-pulse-soft" style={{ animationDelay: '0s' }} />
            <div className="w-4 h-[3px] rounded-full bg-warning/40 animate-pulse-soft" style={{ animationDelay: '0.3s' }} />
            <div className="w-3 h-[3px] rounded-full bg-info/40 animate-pulse-soft" style={{ animationDelay: '0.6s' }} />
          </div>
          <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse-soft" style={{ animationDelay: '1s' }} />
        </div>
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center mb-1">
          <span className="text-[10px] font-bold text-primary">8</span>
        </div>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full bg-gradient-to-l from-primary/60 via-primary to-primary/60" />
      </div>
    </div>
  );
}

/* ===== Collapsed Studio Panel — Ultra Premium ===== */
function CollapsedStudioPanel({ onExpand }: { onExpand: () => void }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div className="flex flex-col items-center h-full shrink-0 w-[52px] animate-collapsed-enter">
      <div className="h-full w-full rounded-2xl glass border border-border/40 flex flex-col items-center py-3 gap-1 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full bg-gradient-to-l from-gold/60 via-gold to-gold/60" />
        <button
          onClick={onExpand}
          className="group relative w-10 h-10 flex items-center justify-center rounded-xl bg-gold/8 hover:bg-gold/15 transition-all duration-300 hover:scale-110 mt-1"
          title="فتح الاستوديو (Ctrl+Shift+S)"
        >
          <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ boxShadow: `0 0 16px 2px ${isDark ? 'oklch(0.78 0.12 75 / 0.3)' : 'oklch(0.72 0.14 75 / 0.2)'}` }} />
          <MaterialIcon icon="auto_awesome" size={20} className="text-gold transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12" />
        </button>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 relative">
          <div className="w-1.5 h-1.5 rounded-full bg-gold/40 animate-pulse-soft" />
          <span className="text-[9px] font-bold text-gold/70 writing-mode-vertical tracking-[0.15em] select-none">الاستوديو</span>
          <div className="flex flex-col gap-2 items-center">
            {['dashboard', 'description', 'slideshow'].map((icon, i) => (
              <div key={icon} className="w-6 h-6 rounded-md bg-card border border-border/30 flex items-center justify-center shadow-sm animate-stagger-in" style={{ animationDelay: `${i * 0.15}s` }}>
                <MaterialIcon icon={icon} size={12} className="text-muted-foreground" />
              </div>
            ))}
          </div>
          <div className="w-1.5 h-1.5 rounded-full bg-gold/40 animate-pulse-soft" style={{ animationDelay: '1s' }} />
        </div>
        <div className="w-7 h-7 rounded-lg bg-gold/10 flex items-center justify-center mb-1">
          <span className="text-[10px] font-bold text-gold">3</span>
        </div>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full bg-gradient-to-l from-gold/60 via-gold to-gold/60" />
      </div>
    </div>
  );
}

/* ===== Keyboard Shortcut Tooltip ===== */
function ShortcutToast({ shortcuts, visible }: { shortcuts: string; visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[200] animate-slide-up">
      <div className="glass border border-border/50 rounded-xl px-4 py-2.5 shadow-xl flex items-center gap-2.5">
        <MaterialIcon icon="keyboard" size={18} className="text-primary" />
        <span className="text-[12px] font-medium text-foreground">{shortcuts}</span>
      </div>
    </div>
  );
}

export default function Home() {
  const { theme } = useTheme();
  const [dataOpen, setDataOpen] = useState(true);
  const [studioOpen, setStudioOpen] = useState(true);
  const [activeView, setActiveView] = useState<string>('chat');
  const [prevView, setPrevView] = useState<string>('chat');
  const workspaceRef = useRef<HTMLDivElement>(null);

  // Mobile drawer states
  const [mobileDrawer, setMobileDrawer] = useState<'data' | 'studio' | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Shortcut toast
  const [shortcutToast, setShortcutToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showShortcutToast = useCallback((msg: string) => {
    setShortcutToast(msg);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 1800);
  }, []);

  // Panel morphing animation state
  const [dataMorphing, setDataMorphing] = useState(false);
  const [studioMorphing, setStudioMorphing] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const [dataItems] = useState<DataItem[]>([
    { id: '1', title: 'بيانات الجهات الحكومية Q4', type: 'file', status: 'ready', icon: 'table_chart', size: '2.4 MB' },
    { id: '2', title: 'تقرير الامتثال السنوي', type: 'file', status: 'ready', icon: 'description', size: '1.1 MB' },
    { id: '3', title: 'مؤشرات النضج الوطنية', type: 'table', status: 'processing', icon: 'grid_on', size: '850 KB' },
    { id: '4', title: 'بيانات الربع الثالث', type: 'file', status: 'review', icon: 'table_chart', size: '3.2 MB' },
    { id: '5', title: 'الجداول الموحدة', type: 'group', status: 'merged', icon: 'folder', size: '12 ملف' },
    { id: '6', title: 'جدول تصنيف البيانات', type: 'table', status: 'ready', icon: 'grid_on', size: '420 KB' },
    { id: '7', title: 'سجل البيانات الشخصية', type: 'file', status: 'ready', icon: 'person_search', size: '780 KB' },
    { id: '8', title: 'تدفق معالجة البيانات', type: 'flow', status: 'ready', icon: 'account_tree', size: '—' },
  ]);

  const [studioOutputs] = useState<StudioOutput[]>([
    { id: '1', title: 'لوحة مؤشرات نضج البيانات', type: 'dashboard', time: 'منذ ساعتين', icon: 'dashboard' },
    { id: '2', title: 'تقرير الرصد الربعي', type: 'report', time: 'منذ ٥ ساعات', icon: 'description' },
    { id: '3', title: 'عرض نتائج التقييم', type: 'presentation', time: 'أمس', icon: 'slideshow' },
  ]);

  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(null);
  const [selectedTool, setSelectedTool] = useState<{ icon: string; label: string; id: string } | null>(null);
  const [toolDialogOpen, setToolDialogOpen] = useState(false);

  /* ===== Toggle handlers with morphing animation ===== */
  const toggleData = useCallback(() => {
    setDataMorphing(true);
    setDataOpen(prev => !prev);
    setTimeout(() => setDataMorphing(false), 400);
  }, []);

  const toggleStudio = useCallback(() => {
    setStudioMorphing(true);
    setStudioOpen(prev => !prev);
    setTimeout(() => setStudioMorphing(false), 400);
  }, []);

  const toggleBoth = useCallback(() => {
    const bothOpen = dataOpen && studioOpen;
    setDataMorphing(true);
    setStudioMorphing(true);
    setDataOpen(!bothOpen);
    setStudioOpen(!bothOpen);
    setTimeout(() => { setDataMorphing(false); setStudioMorphing(false); }, 400);
    showShortcutToast(bothOpen ? 'تم طي القائمتين — وضع التركيز' : 'تم فتح القائمتين');
  }, [dataOpen, studioOpen, showShortcutToast]);

  /* ===== Keyboard Shortcuts ===== */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Ctrl+D: Toggle data panel
      if (e.ctrlKey && !e.shiftKey && e.key === 'd') {
        e.preventDefault();
        toggleData();
        showShortcutToast(dataOpen ? 'طي لوحة البيانات (Ctrl+D)' : 'فتح لوحة البيانات (Ctrl+D)');
      }
      // Ctrl+Shift+S: Toggle studio panel
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        toggleStudio();
        showShortcutToast(studioOpen ? 'طي الاستوديو (Ctrl+Shift+S)' : 'فتح الاستوديو (Ctrl+Shift+S)');
      }
      // Ctrl+B: Toggle both panels
      if (e.ctrlKey && !e.shiftKey && e.key === 'b') {
        e.preventDefault();
        toggleBoth();
      }
      // Escape: Close mobile drawer
      if (e.key === 'Escape' && mobileDrawer) {
        setMobileDrawer(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleData, toggleStudio, toggleBoth, dataOpen, studioOpen, mobileDrawer, showShortcutToast]);

  const handleToolClick = useCallback((tool: { icon: string; label: string; id: string }) => {
    setSelectedTool(tool);
    setToolDialogOpen(true);
  }, []);

  const handleSettingsClick = useCallback((e: React.MouseEvent) => {
    setSettingsAnchor(e.currentTarget as HTMLElement);
    setSettingsOpen(prev => !prev);
  }, []);

  const handleWorkspaceChange = useCallback((viewId: string) => {
    setPrevView(activeView);
    setActiveView(viewId);
  }, [activeView]);

  const handleMenuToggle = useCallback(() => {
    if (isMobile) {
      setMobileDrawer(prev => prev === 'data' ? null : 'data');
    }
  }, [isMobile]);

  // Trigger workspace switch animation
  useEffect(() => {
    if (workspaceRef.current && prevView !== activeView) {
      workspaceRef.current.classList.remove('animate-workspace-switch');
      void workspaceRef.current.offsetWidth;
      workspaceRef.current.classList.add('animate-workspace-switch');
    }
  }, [activeView, prevView]);

  const bothOpen = dataOpen && studioOpen;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-canvas-bg" style={{ backgroundImage: 'radial-gradient(ellipse at 50% 0%, oklch(0.30 0.08 250 / 0.02) 0%, transparent 60%)' }}>
      <NotebookHeader
        onShareClick={() => setShareOpen(true)}
        onAnalyticsClick={() => setAnalyticsOpen(true)}
        onSettingsClick={handleSettingsClick}
        onMenuToggle={handleMenuToggle}
        onToggleBoth={toggleBoth}
        bothPanelsOpen={bothOpen}
      />

      <div className="flex-1 flex overflow-hidden p-1.5 sm:p-2.5 gap-1.5 sm:gap-2.5">
        {/* RIGHT Panel: البيانات — Desktop with morphing transition */}
        {!isMobile && (
          <div
            className={`hidden md:block shrink-0 transition-all duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden ${dataMorphing ? 'pointer-events-none' : ''}`}
            style={{
              width: dataOpen ? 260 : 52,
              minWidth: dataOpen ? 260 : 52,
            }}
          >
            {dataOpen ? (
              <div className="h-full animate-morph-in" key="data-open">
                <DataPanel
                  isOpen={dataOpen}
                  onToggle={toggleData}
                  onAddSourceClick={() => setAddSourceOpen(true)}
                  items={dataItems}
                />
              </div>
            ) : (
              <CollapsedDataPanel onExpand={toggleData} />
            )}
          </div>
        )}

        {/* CENTER: Canvas Area */}
        <div className="flex-1 flex flex-col min-w-0 gap-1.5 sm:gap-2.5 transition-all duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)]">
          {/* Workspace Navigation Tabs */}
          <div className="flex items-center gap-0.5 bg-card rounded-xl px-1 sm:px-1.5 py-1 shrink-0 shadow-sm border border-border/30 overflow-x-auto no-scrollbar">
            {WORKSPACE_VIEWS.map(view => (
              <button
                key={view.id}
                onClick={() => handleWorkspaceChange(view.id)}
                className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg text-[11px] sm:text-[12px] font-medium transition-all duration-200 whitespace-nowrap ${
                  activeView === view.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                <MaterialIcon icon={view.icon} size={15} />
                <span className="hidden xs:inline sm:inline">{view.label}</span>
              </button>
            ))}

            {/* Mobile: Data & Studio toggle buttons */}
            {isMobile && (
              <>
                <div className="w-px h-5 bg-border mx-1 shrink-0" />
                <button
                  onClick={() => setMobileDrawer(prev => prev === 'data' ? null : 'data')}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                    mobileDrawer === 'data' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'
                  }`}
                >
                  <MaterialIcon icon="database" size={15} />
                </button>
                <button
                  onClick={() => setMobileDrawer(prev => prev === 'studio' ? null : 'studio')}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                    mobileDrawer === 'studio' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'
                  }`}
                >
                  <MaterialIcon icon="auto_awesome" size={15} />
                </button>
              </>
            )}
          </div>

          {/* Active Workspace Content */}
          <div ref={workspaceRef} className="flex-1 min-h-0">
            {activeView === 'chat' ? (
              <ChatCanvas />
            ) : (
              <WorkspaceView viewId={activeView} />
            )}
          </div>
        </div>

        {/* LEFT Panel: الاستوديو — Desktop with morphing transition */}
        {!isMobile && (
          <div
            className={`hidden md:block shrink-0 transition-all duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden ${studioMorphing ? 'pointer-events-none' : ''}`}
            style={{
              width: studioOpen ? 220 : 52,
              minWidth: studioOpen ? 220 : 52,
            }}
          >
            {studioOpen ? (
              <div className="h-full animate-morph-in" key="studio-open">
                <StudioPanel
                  isOpen={studioOpen}
                  onToggle={toggleStudio}
                  onToolClick={handleToolClick}
                  outputs={studioOutputs}
                />
              </div>
            ) : (
              <CollapsedStudioPanel onExpand={toggleStudio} />
            )}
          </div>
        )}
      </div>

      {/* Mobile Drawer Overlay */}
      {isMobile && mobileDrawer && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setMobileDrawer(null)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-fade-in" />
          <div
            className={`relative z-10 h-full w-[300px] max-w-[85vw] bg-card shadow-2xl ${
              mobileDrawer === 'data' ? 'mr-auto animate-slide-in-right' : 'ml-auto animate-slide-in-left'
            }`}
            onClick={e => e.stopPropagation()}
          >
            {mobileDrawer === 'data' ? (
              <DataPanel
                isOpen={true}
                onToggle={() => setMobileDrawer(null)}
                onAddSourceClick={() => { setAddSourceOpen(true); setMobileDrawer(null); }}
                items={dataItems}
              />
            ) : (
              <StudioPanel
                isOpen={true}
                onToggle={() => setMobileDrawer(null)}
                onToolClick={(tool) => { handleToolClick(tool); setMobileDrawer(null); }}
                outputs={studioOutputs}
              />
            )}
          </div>
        </div>
      )}

      {/* Shortcut Toast */}
      <ShortcutToast shortcuts={shortcutToast} visible={toastVisible} />

      {/* Dialogs */}
      <AddSourceDialog isOpen={addSourceOpen} onClose={() => setAddSourceOpen(false)} />
      <ShareDialog isOpen={shareOpen} onClose={() => setShareOpen(false)} />
      <AnalyticsDialog isOpen={analyticsOpen} onClose={() => setAnalyticsOpen(false)} />
      <StudioToolDialog isOpen={toolDialogOpen} onClose={() => setToolDialogOpen(false)} tool={selectedTool} />
      <SettingsMenu isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} anchorEl={settingsAnchor} />
    </div>
  );
}
