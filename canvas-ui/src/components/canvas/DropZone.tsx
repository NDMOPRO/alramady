import { useCallback, type DragEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCanvasStore } from '@/stores/canvas-store';
import { Upload } from 'lucide-react';

// E07-0005, E07-0069: Full-screen drop zone overlay
// CRITICAL FIX: removed the invisible pointer-events:auto overlay that was blocking all clicks
export function DropZone() {
  const isDragging = useCanvasStore((s) => s.isDragging);
  const setIsDragging = useCanvasStore((s) => s.setIsDragging);
  const handleFilesDrop = useCanvasStore((s) => s.handleFilesDrop);
  const setSidebarState = useCanvasStore((s) => s.setSidebarState);
  const setSidebarTab = useCanvasStore((s) => s.setSidebarTab);

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // APX-0354: detect drag near right edge (sidebar zone)
      const windowWidth = window.innerWidth;
      if (e.clientX > windowWidth - 80) {
        setSidebarState('peek');
        setSidebarTab('library');
      }
    },
    [setSidebarState, setSidebarTab]
  );

  const handleDragLeave = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.currentTarget === e.target) {
        setIsDragging(false);
      }
    },
    [setIsDragging]
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        handleFilesDrop(files);
      }
    },
    [setIsDragging, handleFilesDrop]
  );

  // Drag detection is handled by window-level listeners in App.tsx
  // No invisible overlay needed — that was blocking all clicks
  return (
    <AnimatePresence>
      {isDragging && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="absolute inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.95 }}
            className="flex flex-col items-center gap-4 p-12 rounded-3xl border-2 border-dashed border-primary/50 bg-primary/5"
          >
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Upload className="w-12 h-12 text-primary" />
            </motion.div>
            <div className="text-center space-y-1">
              <p className="text-lg font-bold text-foreground">أفلت الملفات هنا</p>
              <p className="text-sm text-muted-foreground">
                PDF, Excel, Word, PowerPoint, صور, فيديو, صوت
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
