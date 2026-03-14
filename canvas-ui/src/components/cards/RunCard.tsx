import { motion } from 'framer-motion';
import type { CardData } from '@/types/canvas';
import { runCardVariants } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Circle, CheckCircle2, Loader2, XCircle } from 'lucide-react';

interface RunCardProps {
  card: CardData;
}

// E07-0054 to E07-0058: RunCard — live execution progress with teasers
export function RunCard({ card }: RunCardProps) {
  const stages = card.runStages;
  if (!stages || stages.length === 0) return null;

  const completedCount = stages.filter((s) => s.status === 'completed').length;
  const progress = Math.round((completedCount / stages.length) * 100);
  const currentStage = stages.find((s) => s.status === 'running');

  return (
    <motion.div
      variants={runCardVariants}
      initial="initial"
      animate="animate"
      className="rounded-xl border border-border/50 bg-card overflow-hidden"
    >
      {/* Shimmer progress bar */}
      <div className="h-1 bg-muted relative overflow-hidden">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
        {progress < 100 && (
          <div className="absolute inset-0 shimmer-bg animate-shimmer" style={{ width: `${progress}%` }} />
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {progress < 100 ? (
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-success" />
            )}
            <span className="text-xs font-bold text-foreground">
              {progress < 100 ? 'جارٍ التنفيذ' : 'اكتمل التنفيذ'}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">{progress}%</span>
        </div>

        {/* Stages */}
        <div className="space-y-2">
          {stages.map((stage) => {
            const isRunning = stage.status === 'running';
            const isCompleted = stage.status === 'completed';
            const isFailed = stage.status === 'failed';

            return (
              <div key={stage.id} className="flex items-center gap-2.5">
                {isCompleted ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />
                ) : isRunning ? (
                  <Loader2 className="w-3.5 h-3.5 text-primary animate-spin flex-shrink-0" />
                ) : isFailed ? (
                  <XCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <span
                    className={cn(
                      'text-xs',
                      isRunning ? 'text-foreground font-medium' : isCompleted ? 'text-muted-foreground' : 'text-muted-foreground/60'
                    )}
                  >
                    {stage.label}
                  </span>
                  {/* E07-0121 to E07-0127: Teaser microcopy */}
                  {isRunning && stage.teaserText && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-[10px] text-primary/70"
                    >
                      {stage.teaserText}
                    </motion.p>
                  )}
                </div>
                {/* Stage progress */}
                {isRunning && stage.progress !== undefined && (
                  <span className="text-[10px] text-muted-foreground">{stage.progress}%</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Current stage teaser */}
        {currentStage && (
          <motion.div
            key={currentStage.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="pt-2 border-t border-border/30"
          >
            <p className="text-[11px] text-muted-foreground italic">
              {currentStage.teaserText}
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
