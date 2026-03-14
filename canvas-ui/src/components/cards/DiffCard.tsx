import { motion } from 'framer-motion';
import type { CardData } from '@/types/canvas';
import { contextActionsVariants } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { GitCompare, Plus, Minus, PenLine } from 'lucide-react';

interface DiffCardProps {
  card: CardData;
}

// E07-0086: DiffCard — visual diff between original and result
export function DiffCard({ card }: DiffCardProps) {
  const diff = card.diffData;
  if (!diff) return null;

  return (
    <motion.div
      variants={contextActionsVariants}
      initial="initial"
      animate="animate"
      className="rounded-xl border border-border/50 bg-card overflow-hidden"
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30">
        <GitCompare className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">مقارنة الفروقات</span>
        <span className="text-[10px] text-muted-foreground mr-auto">
          {diff.type === 'pixel' ? 'Pixel Diff' : diff.type === 'row' ? 'Row Diff' : 'Structural'}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* Pixel diff */}
        {diff.type === 'pixel' && diff.pixelDiff !== undefined && (
          <div className="text-center space-y-2">
            <div
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold',
                diff.pixelDiff === 0
                  ? 'bg-success/10 text-success'
                  : diff.pixelDiff < 1
                  ? 'bg-warning/10 text-warning'
                  : 'bg-destructive/10 text-destructive'
              )}
            >
              <span>PixelDiff</span>
              <span className="font-mono">{diff.pixelDiff.toFixed(4)}%</span>
            </div>
            {diff.heatmapUrl && (
              <div className="aspect-[16/10] bg-muted/30 rounded-lg overflow-hidden">
                <img src={diff.heatmapUrl} alt="خريطة الفروقات" className="w-full h-full object-contain" />
              </div>
            )}
          </div>
        )}

        {/* Row diff */}
        {diff.type === 'row' && (
          <div className="flex justify-center gap-6">
            <div className="flex items-center gap-1.5 text-sm">
              <Plus className="w-4 h-4 text-success" />
              <span className="text-success font-medium">{diff.addedCount || 0}</span>
              <span className="text-muted-foreground text-xs">مُضاف</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <Minus className="w-4 h-4 text-destructive" />
              <span className="text-destructive font-medium">{diff.removedCount || 0}</span>
              <span className="text-muted-foreground text-xs">محذوف</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <PenLine className="w-4 h-4 text-warning" />
              <span className="text-warning font-medium">{diff.modifiedCount || 0}</span>
              <span className="text-muted-foreground text-xs">مُعدَّل</span>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
