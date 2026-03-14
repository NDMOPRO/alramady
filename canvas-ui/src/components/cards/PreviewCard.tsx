import { motion } from 'framer-motion';
import type { CardData } from '@/types/canvas';
import { resultCardVariants } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface PreviewCardProps {
  card: CardData;
}

// E07-0059 to E07-0061: PreviewCard — shows real content
export function PreviewCard({ card }: PreviewCardProps) {
  const [activeSlide, setActiveSlide] = useState(0);
  const thumbnails = card.previewThumbnails || [];
  const hasTable = card.tableData && card.tableData.headers.length > 0;
  const hasHtml = card.htmlContent;
  const hasPreviewUrl = card.previewUrl;
  const hasContent = hasTable || hasHtml || hasPreviewUrl || thumbnails.length > 0;

  return (
    <motion.div
      variants={resultCardVariants}
      initial="initial"
      animate="animate"
      className="rounded-xl border border-border/50 bg-card overflow-hidden"
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30">
        <Eye className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">معاينة النتيجة</span>
      </div>

      {/* HTML content */}
      {hasHtml && (
        <div
          className="px-2 text-foreground"
          dangerouslySetInnerHTML={{ __html: card.htmlContent! }}
        />
      )}

      {/* Table data — real parsed data */}
      {hasTable && (
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-muted/50 sticky top-0">
                {card.tableData!.headers.map((h, i) => (
                  <th
                    key={i}
                    className="px-3 py-2 text-right font-medium text-foreground border-b border-border/30 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {card.tableData!.rows.map((row, ri) => (
                <tr
                  key={ri}
                  className={cn(
                    'hover:bg-muted/30 transition-colors',
                    ri % 2 === 0 ? 'bg-transparent' : 'bg-muted/10'
                  )}
                >
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="px-3 py-1.5 text-muted-foreground border-b border-border/20 whitespace-nowrap"
                      dir="auto"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {card.tableData!.rows.length >= 50 && (
            <p className="text-[10px] text-muted-foreground/50 text-center py-2">
              يعرض أول 50 صف — الملف الكامل في التحميل
            </p>
          )}
        </div>
      )}

      {/* Image preview */}
      {hasPreviewUrl && !hasHtml && (
        <div className="p-4 flex justify-center">
          <img
            src={card.previewUrl}
            alt="معاينة"
            className="max-w-full max-h-[400px] object-contain rounded-lg"
          />
        </div>
      )}

      {/* Thumbnail carousel */}
      {thumbnails.length > 0 && (
        <div className="relative aspect-[16/10] bg-muted/30 flex items-center justify-center">
          <img
            src={thumbnails[activeSlide]}
            alt={`معاينة ${activeSlide + 1}`}
            className="max-w-full max-h-full object-contain"
          />
          {thumbnails.length > 1 && (
            <>
              <button
                onClick={() => setActiveSlide((p) => (p > 0 ? p - 1 : thumbnails.length - 1))}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full bg-background/80 backdrop-blur-sm border border-border/50 text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setActiveSlide((p) => (p < thumbnails.length - 1 ? p + 1 : 0))}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-1 rounded-full bg-background/80 backdrop-blur-sm border border-border/50 text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                {thumbnails.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveSlide(i)}
                    className={cn(
                      'w-1.5 h-1.5 rounded-full transition-colors',
                      i === activeSlide ? 'bg-primary' : 'bg-muted-foreground/30'
                    )}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Loading state — only when no content at all */}
      {!hasContent && (
        <div className="p-6 text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center mx-auto">
            <Eye className="w-6 h-6 text-muted-foreground/50" />
          </div>
          <p className="text-xs text-muted-foreground">جارٍ إعداد المعاينة…</p>
          <div className="w-32 h-1 rounded-full bg-muted overflow-hidden mx-auto">
            <div className="h-full bg-primary/50 animate-shimmer shimmer-bg" />
          </div>
        </div>
      )}
    </motion.div>
  );
}
