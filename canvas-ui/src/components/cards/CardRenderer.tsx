import type { CardData } from '@/types/canvas';
import { FileCard } from './FileCard';
import { ContextActionsCard } from './ContextActionsCard';
import { PlanCard } from './PlanCard';
import { RunCard } from './RunCard';
import { PreviewCard } from './PreviewCard';
import { ResultCard } from './ResultCard';
import { EditorCard } from './EditorCard';
import { DiffCard } from './DiffCard';
import { EvidenceCard } from './EvidenceCard';
import { ShareCard } from './ShareCard';

interface CardRendererProps {
  card: CardData;
  messageId: string;
}

export function CardRenderer({ card, messageId }: CardRendererProps) {
  switch (card.type) {
    case 'file':
      return <FileCard card={card} />;
    case 'context-actions':
      return <ContextActionsCard card={card} />;
    case 'plan':
      return <PlanCard card={card} />;
    case 'run':
      return <RunCard card={card} />;
    case 'preview':
      return <PreviewCard card={card} />;
    case 'result':
      return <ResultCard card={card} messageId={messageId} />;
    case 'editor':
      return <EditorCard card={card} />;
    case 'diff':
      return <DiffCard card={card} />;
    case 'evidence':
      return <EvidenceCard card={card} />;
    case 'share':
      return <ShareCard card={card} />;
    default:
      return null;
  }
}
