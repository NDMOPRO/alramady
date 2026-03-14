import { motion } from 'framer-motion';
import { useCanvasStore } from '@/stores/canvas-store';
import { focusStageVariants } from '@/lib/motion';
import { ArtifactRenderer } from '@/components/canvas/ArtifactRenderer';
import { Button } from '@/components/ui/button';
import { X, Download, ExternalLink, ZoomIn, ZoomOut, RotateCcw, Maximize2 } from 'lucide-react';
import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

// E07-0092 to E07-0097: Focus Stage — full-screen artifact view, no route change
export function FocusStage() {
  const focusStage = useCanvasStore((s) => s.focusStage);
  const closeFocusStage = useCanvasStore((s) => s.closeFocusStage);
  const [zoom, setZoom] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(200, z + 25)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(25, z - 25)), []);
  const handleZoomReset = useCallback(() => setZoom(100), []);

  // E07-0097: Keyboard shortcuts in focus mode
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === '+' || e.key === '=') handleZoomIn();
    if (e.key === '-') handleZoomOut();
    if (e.key === '0') handleZoomReset();
  }, [handleZoomIn, handleZoomOut, handleZoomReset]);

  if (!focusStage) return null;

  const typeLabels: Record<string, string> = {
    pptx: 'عرض تقديمي',
    docx: 'مستند Word',
    xlsx: 'جدول بيانات',
    dashboard: 'لوحة مؤشرات',
    pdf: 'ملف PDF',
    png: 'صورة',
    srt: 'ترجمة',
    json: 'بيانات JSON',
  };

  return (
    <motion.div
      className={cn(
        'flex-1 flex flex-col overflow-hidden bg-background',
        isFullscreen && 'fixed inset-0 z-50'
      )}
      variants={focusStageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Focus Stage header */}
      <div className="flex items-center justify-between h-12 px-4 border-b border-border/50 bg-background/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={closeFocusStage}
            aria-label="إغلاق المعاينة"
          >
            <X className="size-4.5" />
          </Button>
          <div>
            <h3 className="text-sm font-bold text-foreground truncate max-w-[300px]">
              {focusStage.title}
            </h3>
            <span className="text-[10px] text-muted-foreground">
              {typeLabels[focusStage.artifactType] || focusStage.artifactType}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Zoom controls */}
          <Button variant="ghost" size="icon-sm" onClick={handleZoomOut} aria-label="تصغير">
            <ZoomOut className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomReset}
            className="w-12 text-xs text-muted-foreground"
          >
            {zoom}%
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={handleZoomIn} aria-label="تكبير">
            <ZoomIn className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={handleZoomReset} aria-label="إعادة ضبط">
            <RotateCcw className="size-4" />
          </Button>

          <div className="w-px h-5 bg-border/50 mx-1" />

          {/* Fullscreen toggle */}
          <Button variant="ghost" size="icon-sm" onClick={() => setIsFullscreen((f) => !f)} aria-label="ملء الشاشة">
            <Maximize2 className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="تحميل">
            <Download className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="فتح في نافذة جديدة">
            <ExternalLink className="size-4" />
          </Button>
        </div>
      </div>

      {/* Focus Stage content — real artifact rendering */}
      <div className="flex-1 flex items-start justify-center overflow-auto p-8 bg-muted/30">
        <ArtifactRenderer data={focusStage} zoom={zoom} />
      </div>
    </motion.div>
  );
}
