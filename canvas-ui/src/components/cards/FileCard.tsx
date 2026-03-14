import { motion } from 'framer-motion';
import type { CardData } from '@/types/canvas';
import { fileCardVariants } from '@/lib/motion';
import { formatFileSize, getFileTypeLabel, cn } from '@/lib/utils';
import {
  FileText,
  FileSpreadsheet,
  Presentation,
  Image,
  Video,
  Music,
  File,
} from 'lucide-react';

interface FileCardProps {
  card: CardData;
}

const categoryIcons: Record<string, typeof FileText> = {
  document: FileText,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  image: Image,
  video: Video,
  audio: Music,
  unknown: File,
};

const categoryColors: Record<string, string> = {
  document: 'bg-red-500/10 text-red-600 dark:text-red-400',
  spreadsheet: 'bg-green-500/10 text-green-600 dark:text-green-400',
  presentation: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  image: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  video: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  audio: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
  unknown: 'bg-muted text-muted-foreground',
};

// E07-0036 to E07-0040: FileCard — immediate display after upload
export function FileCard({ card }: FileCardProps) {
  const file = card.file;
  if (!file) return null;

  const Icon = categoryIcons[file.category] || File;
  const colorClass = categoryColors[file.category] || categoryColors.unknown;

  return (
    <motion.div
      variants={fileCardVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl border border-border/50',
        'bg-card hover:bg-card/80 transition-colors'
      )}
    >
      {/* File type icon */}
      <div className={cn('flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center', colorClass)}>
        <Icon className="w-5 h-5" />
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{getFileTypeLabel(file.mimeType)}</span>
          <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
          <span>{formatFileSize(file.size)}</span>
          {file.pageCount && (
            <>
              <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
              <span>{file.pageCount} صفحة</span>
            </>
          )}
        </div>
      </div>

      {/* Upload progress */}
      {file.uploadProgress !== undefined && file.uploadProgress < 100 && (
        <div className="flex-shrink-0 w-16">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${file.uploadProgress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground mt-0.5 block text-center">
            {file.uploadProgress}%
          </span>
        </div>
      )}

      {/* Success indicator */}
      {file.uploadProgress === 100 && (
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-success/10 flex items-center justify-center">
          <span className="text-success text-xs">✓</span>
        </div>
      )}
    </motion.div>
  );
}
