import { motion } from 'framer-motion';
import type { CardData } from '@/types/canvas';
import { resultCardVariants } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Shield, CheckCircle2, XCircle, Hash, Clock, Eye } from 'lucide-react';

interface EvidenceCardProps {
  card: CardData;
}

// E07-0083: EvidenceCard — cryptographic evidence and gate results
export function EvidenceCard({ card }: EvidenceCardProps) {
  const evidence = card.evidenceData;
  if (!evidence) return null;

  return (
    <motion.div
      variants={resultCardVariants}
      initial="initial"
      animate="animate"
      className="rounded-xl border border-border/50 bg-card overflow-hidden"
    >
      {/* Gate status bar */}
      <div
        className={cn(
          'h-0.5',
          evidence.gatesPassed
            ? 'bg-gradient-to-l from-success/0 via-success to-success/0'
            : 'bg-gradient-to-l from-destructive/0 via-destructive to-destructive/0'
        )}
      />

      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Shield
            className={cn('w-4 h-4', evidence.gatesPassed ? 'text-success' : 'text-destructive')}
          />
          <span className="text-xs font-bold text-foreground">شهادة التحقق</span>
          {evidence.gatesPassed ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-success mr-auto" />
          ) : (
            <XCircle className="w-3.5 h-3.5 text-destructive mr-auto" />
          )}
        </div>

        {/* Evidence details */}
        <div className="space-y-2 text-xs">
          {/* Pixel diff */}
          <div className="flex items-center justify-between py-1.5 border-b border-border/30">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Eye className="w-3 h-3" />
              <span>PixelDiff</span>
            </div>
            <span
              className={cn(
                'font-mono font-medium',
                evidence.pixelDiff === 0 ? 'text-success' : 'text-warning'
              )}
            >
              {evidence.pixelDiff.toFixed(4)}%
            </span>
          </div>

          {/* Hash */}
          <div className="flex items-center justify-between py-1.5 border-b border-border/30">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Hash className="w-3 h-3" />
              <span>SHA-256</span>
            </div>
            <span className="font-mono text-foreground/80 truncate max-w-[200px]" dir="ltr">
              {evidence.structuralHash}
            </span>
          </div>

          {/* Evidence ID */}
          <div className="flex items-center justify-between py-1.5 border-b border-border/30">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Shield className="w-3 h-3" />
              <span>معرّف الشهادة</span>
            </div>
            <span className="font-mono text-foreground/80 text-[10px]" dir="ltr">
              {evidence.evidenceId}
            </span>
          </div>

          {/* Timestamp */}
          <div className="flex items-center justify-between py-1.5">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>التوقيت</span>
            </div>
            <span className="text-foreground/80" dir="ltr">
              {new Date(evidence.timestamp).toLocaleString('ar-SA')}
            </span>
          </div>
        </div>

        {/* Gate result badge */}
        <div
          className={cn(
            'flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold',
            evidence.gatesPassed
              ? 'bg-success/10 text-success'
              : 'bg-destructive/10 text-destructive'
          )}
        >
          {evidence.gatesPassed ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>جميع البوابات مرّت بنجاح</span>
            </>
          ) : (
            <>
              <XCircle className="w-4 h-4" />
              <span>فشل في واحدة أو أكثر من البوابات</span>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
