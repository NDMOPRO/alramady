import { motion } from 'framer-motion';
import type { CardData, ContextAction } from '@/types/canvas';
import { contextActionsVariants, staggerItem, hoverLift } from '@/lib/motion';
import { useCanvasStore } from '@/stores/canvas-store';
import { cn } from '@/lib/utils';
import {
  FileOutput,
  FileText,
  Table,
  Languages,
  LayoutDashboard,
  FileBarChart,
  Sparkles,
  GitCompare,
  Presentation,
  Captions,
  ScanText,
  Search,
  Merge,
  TableProperties,
  TrendingUp,
  Image,
  Database,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface ContextActionsCardProps {
  card: CardData;
}

const iconMap: Record<string, LucideIcon> = {
  FileOutput,
  FileText,
  Table,
  Languages,
  LayoutDashboard,
  FileBarChart,
  Sparkles,
  GitCompare,
  Presentation,
  Captions,
  ScanText,
  Search,
  Merge,
  TableProperties,
  TrendingUp,
  Image,
  Database,
};

const categoryGradients: Record<string, string> = {
  convert: 'from-blue-500/10 to-blue-600/5 border-blue-500/20',
  extract: 'from-green-500/10 to-green-600/5 border-green-500/20',
  localize: 'from-purple-500/10 to-purple-600/5 border-purple-500/20',
  analyze: 'from-orange-500/10 to-orange-600/5 border-orange-500/20',
  create: 'from-primary/10 to-primary/5 border-primary/20',
  clean: 'from-emerald-500/10 to-emerald-600/5 border-emerald-500/20',
  merge: 'from-cyan-500/10 to-cyan-600/5 border-cyan-500/20',
  compare: 'from-amber-500/10 to-amber-600/5 border-amber-500/20',
  transcribe: 'from-pink-500/10 to-pink-600/5 border-pink-500/20',
};

// E07-0041 to E07-0048: ContextActionsCard — 3-7 actions, progressive disclosure
// APX-0369: No Dead-End Rule — cancel button that proposes alternatives
export function ContextActionsCard({ card }: ContextActionsCardProps) {
  const actions = card.actions;
  const handleActionSelect = useCanvasStore((s) => s.handleActionSelect);
  const handleCancelAction = useCanvasStore((s) => s.handleCancelAction);

  if (!actions || actions.length === 0) return null;

  return (
    <motion.div
      variants={contextActionsVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="space-y-2"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground font-medium">اختر إجراءً:</p>
        {/* APX-0369: Cancel button — never dead-end */}
        <button
          onClick={handleCancelAction}
          className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          <XCircle className="size-3" />
          لا شيء مما سبق
        </button>
      </div>

      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 gap-2"
        initial="initial"
        animate="animate"
        variants={{ animate: { transition: { staggerChildren: 0.06 } } }}
      >
        {actions.map((action) => (
          <ActionButton key={action.id} action={action} onSelect={handleActionSelect} />
        ))}
      </motion.div>
    </motion.div>
  );
}

function ActionButton({
  action,
  onSelect,
}: {
  action: ContextAction;
  onSelect: (action: ContextAction) => void;
}) {
  const Icon = iconMap[action.icon] || Sparkles;
  const gradient = categoryGradients[action.category] || categoryGradients.create;

  return (
    <motion.button
      variants={staggerItem}
      onClick={() => onSelect(action)}
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl border text-right w-full',
        'bg-gradient-to-l transition-all duration-240',
        'hover:shadow-sm active:scale-[0.98]',
        gradient
      )}
      {...hoverLift}
    >
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-background/50 flex items-center justify-center">
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{action.label}</p>
        {action.description && (
          <p className="text-[10px] text-muted-foreground truncate">{action.description}</p>
        )}
      </div>
    </motion.button>
  );
}
