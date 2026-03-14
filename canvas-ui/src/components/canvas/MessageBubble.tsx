import { motion } from 'framer-motion';
import type { ChatMessage } from '@/types/canvas';
import { CardRenderer } from '@/components/cards/CardRenderer';
import { cn } from '@/lib/utils';
import { User, Bot } from 'lucide-react';

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex gap-3 max-w-3xl mx-auto w-full',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-1',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground'
        )}
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      {/* Content */}
      <div className={cn('flex-1 space-y-2 min-w-0', isUser && 'text-right')}>
        {/* Text content */}
        {message.content && (
          <div
            className={cn(
              'inline-block px-4 py-2.5 rounded-2xl text-sm leading-relaxed max-w-full',
              isUser
                ? 'bg-primary text-primary-foreground rounded-br-md'
                : 'bg-muted text-foreground rounded-bl-md'
            )}
          >
            {message.content}
          </div>
        )}

        {/* Cards */}
        {message.cards && message.cards.length > 0 && (
          <motion.div
            className="space-y-3"
            initial="initial"
            animate="animate"
            variants={{
              animate: { transition: { staggerChildren: 0.06 } },
            }}
          >
            {message.cards.map((card) => (
              <CardRenderer key={card.id} card={card} messageId={message.id} />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
