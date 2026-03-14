import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { DesignProvider } from '@/contexts/DesignContext';
import { HeaderBar } from '@/components/layout/HeaderBar';
import { Sidebar } from '@/components/layout/Sidebar';
import { ChatStream } from '@/components/canvas/ChatStream';
import { Composer } from '@/components/canvas/Composer';
import { DropZone } from '@/components/canvas/DropZone';
import { FocusStage } from '@/components/canvas/FocusStage';
import { ParticleBackground } from '@/components/canvas/ParticleBackground';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { TutorialOverlay } from '@/components/canvas/TutorialOverlay';
import { SmartStepsPanel } from '@/components/canvas/SmartStepsPanel';
import { PreviewPanelController } from '@/components/canvas/PreviewPanel';
import { LoginPage } from '@/components/auth/LoginPage';
import { useCanvasStore } from '@/stores/canvas-store';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';
import { Toaster } from 'sonner';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Sparkles, Eye } from 'lucide-react';

function CanvasLayout() {
  const sidebarState = useCanvasStore((s) => s.sidebarState);
  const focusStage = useCanvasStore((s) => s.focusStage);
  const setCommandPaletteOpen = useCanvasStore((s) => s.setCommandPaletteOpen);
  const setIsDragging = useCanvasStore((s) => s.setIsDragging);
  const messages = useCanvasStore((s) => s.messages);

  const [showSmartSteps, setShowSmartSteps] = useState(false);
  const [previewArtifactId, setPreviewArtifactId] = useState<string | null>(null);

  // Find the latest artifact for preview button
  const latestArtifactId = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (!msg.cards) continue;
      for (const card of msg.cards) {
        if (card.type === 'result' && card.artifact) return card.artifact.id;
      }
    }
    return null;
  })();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
      if (e.key === 'Escape') {
        const store = useCanvasStore.getState();
        if (store.focusStage) store.closeFocusStage();
        if (store.commandPaletteOpen) store.setCommandPaletteOpen(false);
        setShowSmartSteps(false);
        setPreviewArtifactId(null);
      }
    },
    [setCommandPaletteOpen]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDragging(true);
      }
    };
    const handleDragOver = (e: DragEvent) => e.preventDefault();
    const handleDragEnd = () => setIsDragging(false);
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragEnd);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragEnd);
      window.removeEventListener('drop', handleDrop);
    };
  }, [setIsDragging]);

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-background text-foreground font-sans">
      <HeaderBar />

      <div className="flex flex-1 overflow-hidden relative">
        {/* E07-0130: Background particles + gradient shifts */}
        <ParticleBackground />
        <main
          className={cn(
            'flex-1 flex flex-col overflow-hidden relative transition-all duration-200',
            sidebarState === 'full' && 'lg:ml-0 lg:mr-0'
          )}
        >
          <AnimatePresence mode="wait">
            {focusStage ? (
              <FocusStage key="focus-stage" />
            ) : (
              <>
                <ChatStream />
                <Composer />
              </>
            )}
          </AnimatePresence>

          <DropZone />

          {/* SmartStepsPanel floating overlay */}
          <AnimatePresence>
            {showSmartSteps && (
              <SmartStepsPanel
                key="smart-steps"
                onClose={() => setShowSmartSteps(false)}
              />
            )}
          </AnimatePresence>

          {/* Floating action buttons */}
          {!showSmartSteps && !focusStage && (
            <div className="absolute bottom-24 left-4 flex flex-col gap-2 z-30" dir="ltr">
              {/* Smart Steps trigger */}
              <button
                onClick={() => setShowSmartSteps(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all text-xs font-semibold"
                title="معالج التحويل الذكي"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">تحويل ذكي</span>
              </button>

              {/* Preview trigger (only when artifact is available) */}
              {latestArtifactId && (
                <button
                  onClick={() => setPreviewArtifactId(latestArtifactId)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-border/50 text-foreground shadow-md hover:bg-muted transition-all text-xs font-semibold"
                  title="معاينة قبل التصدير"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">معاينة</span>
                </button>
              )}
            </div>
          )}
        </main>

        <AnimatePresence>
          {sidebarState !== 'hidden' && <Sidebar key="sidebar" />}
        </AnimatePresence>
      </div>

      <CommandPalette />
      <TutorialOverlay />

      {/* Preview-before-export panel */}
      <AnimatePresence>
        {previewArtifactId && (
          <PreviewPanelController
            key={previewArtifactId}
            artifactId={previewArtifactId}
            onClose={() => setPreviewArtifactId(null)}
          />
        )}
      </AnimatePresence>

      <Toaster
        position="bottom-left"
        dir="rtl"
        toastOptions={{
          className: 'font-sans',
        }}
      />
    </div>
  );
}

function AuthGate() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <ThemeProvider defaultTheme="light">
      <DesignProvider>
        <TooltipPrimitive.Provider>
          <CanvasLayout />
        </TooltipPrimitive.Provider>
      </DesignProvider>
    </ThemeProvider>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <AuthGate />
    </ErrorBoundary>
  );
}
