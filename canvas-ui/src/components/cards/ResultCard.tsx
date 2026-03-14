import { motion } from 'framer-motion';
import type { CardData } from '@/types/canvas';
import { resultCardVariants, hoverLift } from '@/lib/motion';
import { useCanvasStore } from '@/stores/canvas-store';
import { cn } from '@/lib/utils';
import {
  Download,
  Maximize2,
  Share2,
  CheckCircle2,
  FileText,
  FileSpreadsheet,
  Presentation,
  LayoutDashboard,
  Image,
  FileJson,
} from 'lucide-react';

interface ResultCardProps {
  card: CardData;
  messageId: string;
}

const typeIcons: Record<string, typeof FileText> = {
  pptx: Presentation,
  docx: FileText,
  xlsx: FileSpreadsheet,
  dashboard: LayoutDashboard,
  pdf: FileText,
  png: Image,
  srt: FileText,
  json: FileJson,
};

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

// E07-0062 to E07-0068: ResultCard — artifact result with download/focus/share
export function ResultCard({ card }: ResultCardProps) {
  const artifact = card.artifact;
  const openFocusStage = useCanvasStore((s) => s.openFocusStage);

  if (!artifact) return null;

  const Icon = typeIcons[artifact.type] || FileText;

  const handleFocusOpen = () => {
    openFocusStage({
      artifactId: artifact.id,
      artifactType: artifact.type,
      title: artifact.name,
    });
  };

  const handleDownload = () => {
    if (artifact.downloadUrl) {
      const a = document.createElement('a');
      a.href = artifact.downloadUrl;
      a.download = artifact.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: artifact.name, text: `مخرج راصد: ${artifact.name}` });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(`راصد: ${artifact.name}`);
    }
  };

  return (
    <motion.div
      variants={resultCardVariants}
      initial="initial"
      animate="animate"
      className="rounded-xl border border-border/50 bg-card overflow-hidden"
    >
      {/* Success glow */}
      {artifact.gatesPassed && (
        <div className="h-0.5 bg-gradient-to-l from-success/0 via-success to-success/0" />
      )}

      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', 'bg-success/10 text-success')}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-bold text-foreground truncate">{artifact.name}</p>
              {artifact.gatesPassed && <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />}
            </div>
            <p className="text-[10px] text-muted-foreground">{typeLabels[artifact.type] || artifact.type}</p>
          </div>
        </div>

        {/* Gates badge */}
        {artifact.gatesPassed !== undefined && (
          <div
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium w-fit',
              artifact.gatesPassed
                ? 'bg-success/10 text-success'
                : 'bg-destructive/10 text-destructive'
            )}
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>{artifact.gatesPassed ? 'بوابات التحقق ✓' : 'فشل التحقق'}</span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <motion.button
            onClick={handleFocusOpen}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm',
              'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors'
            )}
            {...hoverLift}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>عرض</span>
          </motion.button>

          <motion.button
            onClick={handleDownload}
            className={cn(
              'flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm',
              'border border-border/50 text-foreground hover:bg-muted transition-colors',
              !artifact.downloadUrl && 'opacity-50 cursor-not-allowed'
            )}
            {...hoverLift}
          >
            <Download className="w-3.5 h-3.5" />
            <span>تحميل</span>
          </motion.button>

          <motion.button
            onClick={handleShare}
            className={cn(
              'flex items-center justify-center p-2 rounded-lg',
              'border border-border/50 text-muted-foreground hover:bg-muted transition-colors'
            )}
            {...hoverLift}
            aria-label="مشاركة"
          >
            <Share2 className="w-3.5 h-3.5" />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
