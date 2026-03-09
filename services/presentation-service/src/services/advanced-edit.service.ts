import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const MAX_UNDO_STACK = 50;
const STACK_TTL_SECONDS = 86400;

interface SlideElementSnapshot {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  style: Record<string, unknown>;
  rotation: number;
  zIndex: number;
}

interface SlideSnapshot {
  id: string;
  order: number;
  title: string;
  notes: string;
  backgroundColor: string;
  elements: SlideElementSnapshot[];
}

interface PresentationSnapshot {
  presentationId: string;
  title: string;
  theme: Record<string, unknown>;
  slides: SlideSnapshot[];
  capturedAt: string;
  action: string;
  userId: string;
}

interface UndoRedoResult {
  restored: boolean;
  action: string;
  undoRemaining: number;
  redoAvailable: number;
  restoredAt: string;
}

interface HistoryEntry {
  action: string;
  capturedAt: string;
  userId: string;
  slideCount: number;
}

interface PrismaPresentationDelegate {
  findUnique(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
}

interface PrismaTransactionClient {
  slide: {
    findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]>;
    deleteMany(args: Record<string, unknown>): Promise<unknown>;
    create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
  slideElement: {
    deleteMany(args: Record<string, unknown>): Promise<unknown>;
    create(args: Record<string, unknown>): Promise<unknown>;
  };
  presentation: {
    update(args: Record<string, unknown>): Promise<unknown>;
  };
}

export class AdvancedEditService {
  private redis: Redis;

  constructor(private prisma: PrismaClient) {
    this.redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
      lazyConnect: true,
    });

    this.redis.on('connect', () => {
      logger.info('AdvancedEditService: Redis connected');
    });

    this.redis.on('error', (err) => {
      logger.error('AdvancedEditService: Redis error', { error: err.message });
    });
  }

  private undoKey(presentationId: string, userId: string): string {
    return `undo:${presentationId}:${userId}`;
  }

  private redoKey(presentationId: string, userId: string): string {
    return `redo:${presentationId}:${userId}`;
  }

  async saveSnapshot(presentationId: string, userId: string, action: string): Promise<void> {
    const presentation = await (this.prisma as unknown as Record<string, PrismaPresentationDelegate>).presentation.findUnique({
      where: { id: presentationId },
      include: {
        slides: {
          orderBy: { order: 'asc' },
          include: { elements: true },
        },
      },
    });

    if (!presentation) {
      throw new Error(`Presentation not found: ${presentationId}`);
    }

    const snapshot: PresentationSnapshot = {
      presentationId,
      title: presentation.title as string,
      theme: (presentation.theme as Record<string, unknown>) || {},
      slides: ((presentation.slides as Record<string, unknown>[]) || []).map((slide: Record<string, unknown>) => ({
        id: slide.id as string,
        order: slide.order as number,
        title: (slide.title as string) || '',
        notes: (slide.notes as string) || '',
        backgroundColor: (slide.backgroundColor as string) || '#FFFFFF',
        elements: ((slide.elements as Record<string, unknown>[]) || []).map((el: Record<string, unknown>) => ({
          id: el.id as string,
          type: el.type as string,
          x: el.x as number,
          y: el.y as number,
          width: el.width as number,
          height: el.height as number,
          content: (el.content as string) || '',
          style: (el.style as Record<string, unknown>) || {},
          rotation: (el.rotation as number) || 0,
          zIndex: (el.zIndex as number) || 0,
        })),
      })),
      capturedAt: new Date().toISOString(),
      action,
      userId,
    };

    const serialized = JSON.stringify(snapshot);
    const uKey = this.undoKey(presentationId, userId);
    const rKey = this.redoKey(presentationId, userId);

    const pipeline = this.redis.pipeline();
    pipeline.lpush(uKey, serialized);
    pipeline.ltrim(uKey, 0, MAX_UNDO_STACK - 1);
    pipeline.del(rKey);
    pipeline.expire(uKey, STACK_TTL_SECONDS);
    await pipeline.exec();

    logger.info('Snapshot saved to undo stack', {
      presentationId,
      userId,
      action,
      slideCount: snapshot.slides.length,
    });
  }

  async undo(presentationId: string, userId: string): Promise<UndoRedoResult> {
    const uKey = this.undoKey(presentationId, userId);
    const rKey = this.redoKey(presentationId, userId);

    const snapshotJson = await this.redis.lpop(uKey);
    if (!snapshotJson) {
      throw new Error('Nothing to undo');
    }

    const snapshot: PresentationSnapshot = JSON.parse(snapshotJson);

    const currentPresentation = await (this.prisma as unknown as Record<string, PrismaPresentationDelegate>).presentation.findUnique({
      where: { id: presentationId },
      include: {
        slides: {
          orderBy: { order: 'asc' },
          include: { elements: true },
        },
      },
    });

    if (currentPresentation) {
      const currentSnapshot: PresentationSnapshot = {
        presentationId,
        title: currentPresentation.title,
        theme: (currentPresentation.theme as Record<string, unknown>) || {},
        slides: ((currentPresentation.slides as Record<string, unknown>[]) || []).map((slide: Record<string, unknown>) => ({
          id: slide.id as string,
          order: slide.order as number,
          title: (slide.title as string) || '',
          notes: (slide.notes as string) || '',
          backgroundColor: (slide.backgroundColor as string) || '#FFFFFF',
          elements: ((slide.elements as Record<string, unknown>[]) || []).map((el: Record<string, unknown>) => ({
            id: el.id as string,
            type: el.type as string,
            x: el.x as number,
            y: el.y as number,
            width: el.width as number,
            height: el.height as number,
            content: (el.content as string) || '',
            style: (el.style as Record<string, unknown>) || {},
            rotation: (el.rotation as number) || 0,
            zIndex: (el.zIndex as number) || 0,
          })),
        })),
        capturedAt: new Date().toISOString(),
        action: `undo:${snapshot.action}`,
        userId,
      };

      const pipeline = this.redis.pipeline();
      pipeline.lpush(rKey, JSON.stringify(currentSnapshot));
      pipeline.expire(rKey, STACK_TTL_SECONDS);
      await pipeline.exec();
    }

    await this.restoreState(presentationId, snapshot);

    const undoRemaining = await this.redis.llen(uKey);
    const redoAvailable = await this.redis.llen(rKey);

    logger.info('Undo performed', {
      presentationId,
      userId,
      action: snapshot.action,
      undoRemaining,
      redoAvailable,
    });

    return {
      restored: true,
      action: snapshot.action,
      undoRemaining,
      redoAvailable,
      restoredAt: new Date().toISOString(),
    };
  }

  async redo(presentationId: string, userId: string): Promise<UndoRedoResult> {
    const uKey = this.undoKey(presentationId, userId);
    const rKey = this.redoKey(presentationId, userId);

    const snapshotJson = await this.redis.lpop(rKey);
    if (!snapshotJson) {
      throw new Error('Nothing to redo');
    }

    const snapshot: PresentationSnapshot = JSON.parse(snapshotJson);

    const currentPresentation = await (this.prisma as unknown as Record<string, PrismaPresentationDelegate>).presentation.findUnique({
      where: { id: presentationId },
      include: {
        slides: {
          orderBy: { order: 'asc' },
          include: { elements: true },
        },
      },
    });

    if (currentPresentation) {
      const currentSnapshot: PresentationSnapshot = {
        presentationId,
        title: currentPresentation.title,
        theme: (currentPresentation.theme as Record<string, unknown>) || {},
        slides: ((currentPresentation.slides as Record<string, unknown>[]) || []).map((slide: Record<string, unknown>) => ({
          id: slide.id as string,
          order: slide.order as number,
          title: (slide.title as string) || '',
          notes: (slide.notes as string) || '',
          backgroundColor: (slide.backgroundColor as string) || '#FFFFFF',
          elements: ((slide.elements as Record<string, unknown>[]) || []).map((el: Record<string, unknown>) => ({
            id: el.id as string,
            type: el.type as string,
            x: el.x as number,
            y: el.y as number,
            width: el.width as number,
            height: el.height as number,
            content: (el.content as string) || '',
            style: (el.style as Record<string, unknown>) || {},
            rotation: (el.rotation as number) || 0,
            zIndex: (el.zIndex as number) || 0,
          })),
        })),
        capturedAt: new Date().toISOString(),
        action: `redo:${snapshot.action}`,
        userId,
      };

      const pipeline = this.redis.pipeline();
      pipeline.lpush(uKey, JSON.stringify(currentSnapshot));
      pipeline.expire(uKey, STACK_TTL_SECONDS);
      await pipeline.exec();
    }

    await this.restoreState(presentationId, snapshot);

    const undoRemaining = await this.redis.llen(uKey);
    const redoAvailable = await this.redis.llen(rKey);

    logger.info('Redo performed', {
      presentationId,
      userId,
      action: snapshot.action,
      undoRemaining,
      redoAvailable,
    });

    return {
      restored: true,
      action: snapshot.action,
      undoRemaining,
      redoAvailable,
      restoredAt: new Date().toISOString(),
    };
  }

  async restoreState(presentationId: string, snapshot: PresentationSnapshot): Promise<void> {
    await this.prisma.$transaction(async (tx: unknown) => {
      const txClient = tx as PrismaTransactionClient;
      const existingSlides = await txClient.slide.findMany({
        where: { presentationId },
        select: { id: true },
      });

      for (const slide of existingSlides) {
        await txClient.slideElement.deleteMany({
          where: { slideId: slide.id },
        });
      }

      await txClient.slide.deleteMany({
        where: { presentationId },
      });

      await txClient.presentation.update({
        where: { id: presentationId },
        data: {
          title: snapshot.title,
          theme: snapshot.theme,
        },
      });

      for (const slideSnap of snapshot.slides) {
        const newSlide = await txClient.slide.create({
          data: {
            presentationId,
            order: slideSnap.order,
            title: slideSnap.title,
            notes: slideSnap.notes,
            backgroundColor: slideSnap.backgroundColor,
          },
        });

        for (const elemSnap of slideSnap.elements) {
          await txClient.slideElement.create({
            data: {
              slideId: newSlide.id,
              type: elemSnap.type,
              x: elemSnap.x,
              y: elemSnap.y,
              width: elemSnap.width,
              height: elemSnap.height,
              content: elemSnap.content,
              style: elemSnap.style,
              rotation: elemSnap.rotation,
              zIndex: elemSnap.zIndex,
            },
          });
        }
      }

      logger.info('State restored from snapshot', {
        presentationId,
        slidesRestored: snapshot.slides.length,
        totalElements: snapshot.slides.reduce((sum, s) => sum + s.elements.length, 0),
      });
    });
  }

  async getHistory(presentationId: string, userId: string): Promise<{
    undoStack: HistoryEntry[];
    redoStack: HistoryEntry[];
    undoCount: number;
    redoCount: number;
  }> {
    const uKey = this.undoKey(presentationId, userId);
    const rKey = this.redoKey(presentationId, userId);

    const [undoEntries, redoEntries] = await Promise.all([
      this.redis.lrange(uKey, 0, -1),
      this.redis.lrange(rKey, 0, -1),
    ]);

    const parseEntry = (json: string): HistoryEntry => {
      const snap: PresentationSnapshot = JSON.parse(json);
      return {
        action: snap.action,
        capturedAt: snap.capturedAt,
        userId: snap.userId,
        slideCount: snap.slides.length,
      };
    };

    const undoStack = undoEntries.map(parseEntry);
    const redoStack = redoEntries.map(parseEntry);

    return {
      undoStack,
      redoStack,
      undoCount: undoStack.length,
      redoCount: redoStack.length,
    };
  }

  async clearHistory(presentationId: string, userId: string): Promise<{ cleared: true; keysDeleted: number }> {
    const uKey = this.undoKey(presentationId, userId);
    const rKey = this.redoKey(presentationId, userId);

    const deleted = await this.redis.del(uKey, rKey);

    logger.info('Undo/redo history cleared', { presentationId, userId, keysDeleted: deleted });

    return { cleared: true, keysDeleted: deleted };
  }
}
