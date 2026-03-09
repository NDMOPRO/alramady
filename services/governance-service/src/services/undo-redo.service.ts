import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { z } from 'zod';

const MAX_STACK_SIZE = 50;
const UNDO_KEY_PREFIX = 'rasid:undo:';
const REDO_KEY_PREFIX = 'rasid:redo:';
const STACK_TTL_SECONDS = 86400; // 24 hours

const RecordActionInputSchema = z.object({
  userId: z.string().uuid(),
  action: z.object({
    type: z.string().min(1),
    entityType: z.string().min(1),
    entityId: z.string().min(1),
    previousState: z.unknown(),
    newState: z.unknown(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
});

const UndoInputSchema = z.object({
  userId: z.string().uuid(),
});

const RedoInputSchema = z.object({
  userId: z.string().uuid(),
});

const GetUndoHistoryInputSchema = z.object({
  userId: z.string().uuid(),
  limit: z.number().int().min(1).max(50).optional(),
});

interface ActionRecord {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  previousState: unknown;
  newState: unknown;
  metadata: Record<string, unknown> | undefined;
  timestamp: string;
}

interface UndoResult {
  success: boolean;
  restoredAction: ActionRecord | null;
}

interface RedoResult {
  success: boolean;
  reappliedAction: ActionRecord | null;
}

export class UndoRedoService {
  private readonly prisma: PrismaClient;
  private readonly redis: Redis;

  constructor(prisma: PrismaClient, redis: Redis) {
    this.prisma = prisma;
    this.redis = redis;
  }

  private undoKey(userId: string): string {
    return `${UNDO_KEY_PREFIX}${userId}`;
  }

  private redoKey(userId: string): string {
    return `${REDO_KEY_PREFIX}${userId}`;
  }

  private generateActionId(): string {
    const { randomUUID } = require('crypto');
    const uuid = (randomUUID() as string).replace(/-/g, '').substring(0, 16);
    return `act_${uuid}`;
  }

  async recordAction(input: z.infer<typeof RecordActionInputSchema>): Promise<ActionRecord> {
    const validated = RecordActionInputSchema.parse(input);

    const actionRecord: ActionRecord = {
      id: this.generateActionId(),
      type: validated.action.type,
      entityType: validated.action.entityType,
      entityId: validated.action.entityId,
      previousState: validated.action.previousState,
      newState: validated.action.newState,
      metadata: validated.action.metadata,
      timestamp: new Date().toISOString(),
    };

    const serialized = JSON.stringify(actionRecord);
    const undoListKey = this.undoKey(validated.userId);
    const redoListKey = this.redoKey(validated.userId);

    const pipeline = this.redis.pipeline();
    pipeline.lpush(undoListKey, serialized);
    pipeline.ltrim(undoListKey, 0, MAX_STACK_SIZE - 1);
    pipeline.expire(undoListKey, STACK_TTL_SECONDS);
    pipeline.del(redoListKey);
    await pipeline.exec();

    await this.prisma.actionLog.create({
      data: {
        actionId: actionRecord.id,
        userId: validated.userId,
        actionType: actionRecord.type,
        entityType: actionRecord.entityType,
        entityId: actionRecord.entityId,
        previousState: JSON.stringify(actionRecord.previousState),
        newState: JSON.stringify(actionRecord.newState),
        metadata: actionRecord.metadata ? JSON.stringify(actionRecord.metadata) : null,
        performedAt: new Date(actionRecord.timestamp),
      },
    });

    return actionRecord;
  }

  async undo(input: z.infer<typeof UndoInputSchema>): Promise<UndoResult> {
    const validated = UndoInputSchema.parse(input);

    const undoListKey = this.undoKey(validated.userId);
    const redoListKey = this.redoKey(validated.userId);

    const serialized = await this.redis.lpop(undoListKey);

    if (!serialized) {
      return { success: false, restoredAction: null };
    }

    const actionRecord = JSON.parse(serialized) as ActionRecord;

    const pipeline = this.redis.pipeline();
    pipeline.lpush(redoListKey, serialized);
    pipeline.ltrim(redoListKey, 0, MAX_STACK_SIZE - 1);
    pipeline.expire(redoListKey, STACK_TTL_SECONDS);
    await pipeline.exec();

    await this.prisma.actionLog.create({
      data: {
        actionId: this.generateActionId(),
        userId: validated.userId,
        actionType: `UNDO:${actionRecord.type}`,
        entityType: actionRecord.entityType,
        entityId: actionRecord.entityId,
        previousState: JSON.stringify(actionRecord.newState),
        newState: JSON.stringify(actionRecord.previousState),
        metadata: JSON.stringify({ undoneActionId: actionRecord.id }),
        performedAt: new Date(),
      },
    });

    return { success: true, restoredAction: actionRecord };
  }

  async redo(input: z.infer<typeof RedoInputSchema>): Promise<RedoResult> {
    const validated = RedoInputSchema.parse(input);

    const undoListKey = this.undoKey(validated.userId);
    const redoListKey = this.redoKey(validated.userId);

    const serialized = await this.redis.lpop(redoListKey);

    if (!serialized) {
      return { success: false, reappliedAction: null };
    }

    const actionRecord = JSON.parse(serialized) as ActionRecord;

    const pipeline = this.redis.pipeline();
    pipeline.lpush(undoListKey, serialized);
    pipeline.ltrim(undoListKey, 0, MAX_STACK_SIZE - 1);
    pipeline.expire(undoListKey, STACK_TTL_SECONDS);
    await pipeline.exec();

    await this.prisma.actionLog.create({
      data: {
        actionId: this.generateActionId(),
        userId: validated.userId,
        actionType: `REDO:${actionRecord.type}`,
        entityType: actionRecord.entityType,
        entityId: actionRecord.entityId,
        previousState: JSON.stringify(actionRecord.previousState),
        newState: JSON.stringify(actionRecord.newState),
        metadata: JSON.stringify({ redoneActionId: actionRecord.id }),
        performedAt: new Date(),
      },
    });

    return { success: true, reappliedAction: actionRecord };
  }

  async getUndoHistory(
    input: z.infer<typeof GetUndoHistoryInputSchema>
  ): Promise<{ undoStack: ActionRecord[]; redoStack: ActionRecord[] }> {
    const validated = GetUndoHistoryInputSchema.parse(input);
    const limit = validated.limit ?? 10;

    const undoListKey = this.undoKey(validated.userId);
    const redoListKey = this.redoKey(validated.userId);

    const [undoItems, redoItems] = await Promise.all([
      this.redis.lrange(undoListKey, 0, limit - 1),
      this.redis.lrange(redoListKey, 0, limit - 1),
    ]);

    const undoStack = undoItems.map((item) => JSON.parse(item) as ActionRecord);
    const redoStack = redoItems.map((item) => JSON.parse(item) as ActionRecord);

    return { undoStack, redoStack };
  }
}
