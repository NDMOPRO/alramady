import { motion } from 'framer-motion';
import type { CardData } from '@/types/canvas';
import { contextActionsVariants } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Circle, CheckCircle2, Loader2, XCircle } from 'lucide-react';

interface PlanCardProps {
  card: CardData;
}

const statusIcons = {
  pending: Circle,
  running: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
};

const statusColors = {
  pending: 'text-muted-foreground',
  running: 'text-primary',
  completed: 'text-success',
  failed: 'text-destructive',
};

// E07-0049 to E07-0053: PlanCard — step-by-step plan display
export function PlanCard({ card }: PlanCardProps) {
  const steps = card.planSteps;
  if (!steps || steps.length === 0) return null;

  return (
    <motion.div
      variants={contextActionsVariants}
      initial="initial"
      animate="animate"
      className="rounded-xl border border-border/50 bg-card p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
        <p className="text-xs font-bold text-foreground">خطة التنفيذ</p>
      </div>

      <div className="space-y-1.5">
        {steps.map((step, index) => {
          const Icon = statusIcons[step.status];
          const color = statusColors[step.status];

          return (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.08, duration: 0.24 }}
              className="flex items-center gap-2.5 py-1"
            >
              <Icon
                className={cn('w-4 h-4 flex-shrink-0', color, step.status === 'running' && 'animate-spin')}
              />
              <span
                className={cn(
                  'text-sm',
                  step.status === 'completed'
                    ? 'text-muted-foreground line-through'
                    : step.status === 'running'
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground'
                )}
              >
                {step.label}
              </span>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
