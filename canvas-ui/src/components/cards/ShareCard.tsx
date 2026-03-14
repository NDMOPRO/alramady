import { motion } from 'framer-motion';
import type { CardData } from '@/types/canvas';
import { contextActionsVariants, hoverLift } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Link2, Mail, Copy, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

interface ShareCardProps {
  card: CardData;
}

// ShareCard — share artifact via link, email, or clipboard
export function ShareCard({ card }: ShareCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <motion.div
      variants={contextActionsVariants}
      initial="initial"
      animate="animate"
      className="rounded-xl border border-border/50 bg-card p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <Link2 className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-bold text-foreground">مشاركة</span>
      </div>

      <div className="flex gap-2">
        <motion.button
          onClick={handleCopyLink}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm',
            'border border-border/50 hover:bg-muted transition-colors',
            copied && 'border-success/50 bg-success/5'
          )}
          {...hoverLift}
        >
          {copied ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-success" />
              <span className="text-success">تم النسخ</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>نسخ الرابط</span>
            </>
          )}
        </motion.button>

        <motion.button
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm border border-border/50 hover:bg-muted transition-colors"
          {...hoverLift}
        >
          <Mail className="w-3.5 h-3.5" />
          <span>بريد</span>
        </motion.button>
      </div>
    </motion.div>
  );
}
