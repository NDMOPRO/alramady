import * as Y from 'yjs';
import { encodeStateAsUpdate, applyUpdate } from 'yjs';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface SessionInfo {
  sessionId: string;
  initialState: string;
  activeUsers: string[];
}

export interface MergeResult {
  mergedState: string;
  activeUsers: string[];
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class CollaborationService {
  private docs: Map<string, Y.Doc> = new Map();
  private redis: Redis;
  private subscriber: Redis;
  private publisher: Redis;

  private static readonly DOC_KEY_PREFIX = 'crdt:doc:';
  private static readonly PRESENCE_KEY_PREFIX = 'crdt:presence:';
  private static readonly SESSION_TTL = 86400;

  constructor(private prisma: PrismaClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.redis = new Redis(redisUrl);
    this.subscriber = new Redis(redisUrl);
    this.publisher = new Redis(redisUrl);
  }

  async getOrCreateDoc(presentationId: string): Promise<Y.Doc> {
    const existing = this.docs.get(presentationId);
    if (existing) {
      return existing;
    }

    const doc = new Y.Doc();

    const savedState = await this.redis.getBuffer(
      `${CollaborationService.DOC_KEY_PREFIX}${presentationId}`,
    );

    if (savedState) {
      const stateArray = new Uint8Array(savedState);
      applyUpdate(doc, stateArray);
    } else {
      const dbRecord = await this.prisma.presentationState.findUnique({
        where: { presentationId },
      });

      if (dbRecord && dbRecord.crdtState) {
        const stateBuffer = Buffer.from(dbRecord.crdtState as string, 'base64');
        const stateArray = new Uint8Array(stateBuffer);
        applyUpdate(doc, stateArray);
      }
    }

    doc.on('update', async (_update: Uint8Array) => {
      const fullState = encodeStateAsUpdate(doc);
      const stateBuffer = Buffer.from(fullState);

      await this.redis.set(
        `${CollaborationService.DOC_KEY_PREFIX}${presentationId}`,
        stateBuffer,
        'EX',
        CollaborationService.SESSION_TTL,
      );

      const base64State = stateBuffer.toString('base64');
      await this.prisma.presentationState.upsert({
        where: { presentationId },
        create: {
          presentationId,
          crdtState: base64State,
          updatedAt: new Date(),
        },
        update: {
          crdtState: base64State,
          updatedAt: new Date(),
        },
      });
    });

    this.docs.set(presentationId, doc);
    return doc;
  }

  async joinSession(
    presentationId: string,
    userId: string,
  ): Promise<SessionInfo> {
    const doc = await this.getOrCreateDoc(presentationId);

    const presenceKey = `${CollaborationService.PRESENCE_KEY_PREFIX}${presentationId}`;
    await this.redis.sadd(presenceKey, userId);
    await this.redis.expire(presenceKey, CollaborationService.SESSION_TTL);

    await this.redis.hset(
      `${presenceKey}:details`,
      userId,
      JSON.stringify({
        userId,
        joinedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      }),
    );

    await this.subscriber.subscribe(`crdt:channel:${presentationId}`);

    const sessionId = this.generateSessionId(presentationId, userId);

    const stateUpdate = encodeStateAsUpdate(doc);
    const initialState = Buffer.from(stateUpdate).toString('base64');

    const activeUsers = await this.redis.smembers(presenceKey);

    await this.publisher.publish(
      `crdt:channel:${presentationId}`,
      JSON.stringify({
        type: 'user_joined',
        userId,
        timestamp: Date.now(),
      }),
    );

    await this.prisma.collaborationSession.create({
      data: {
        sessionId,
        presentationId,
        userId,
        joinedAt: new Date(),
        active: true,
      },
    });

    return {
      sessionId,
      initialState,
      activeUsers,
    };
  }

  async applyClientUpdate(
    presentationId: string,
    userId: string,
    updateBase64: string,
  ): Promise<MergeResult> {
    const doc = await this.getOrCreateDoc(presentationId);

    const updateBuffer = Buffer.from(updateBase64, 'base64');
    const updateArray = new Uint8Array(updateBuffer);

    applyUpdate(doc, updateArray);

    const mergedFullState = encodeStateAsUpdate(doc);
    const mergedState = Buffer.from(mergedFullState).toString('base64');

    await this.publisher.publish(
      `crdt:channel:${presentationId}`,
      JSON.stringify({
        type: 'doc_update',
        userId,
        update: updateBase64,
        timestamp: Date.now(),
      }),
    );

    const presenceKey = `${CollaborationService.PRESENCE_KEY_PREFIX}${presentationId}`;

    await this.redis.hset(
      `${presenceKey}:details`,
      userId,
      JSON.stringify({
        userId,
        lastActiveAt: new Date().toISOString(),
      }),
    );

    const activeUsers = await this.redis.smembers(presenceKey);

    await this.prisma.collaborationEvent.create({
      data: {
        presentationId,
        userId,
        eventType: 'update',
        updateSize: updateBuffer.length,
        createdAt: new Date(),
      },
    });

    return {
      mergedState,
      activeUsers,
    };
  }

  async leaveSession(
    presentationId: string,
    userId: string,
  ): Promise<void> {
    const presenceKey = `${CollaborationService.PRESENCE_KEY_PREFIX}${presentationId}`;

    await this.redis.srem(presenceKey, userId);
    await this.redis.hdel(`${presenceKey}:details`, userId);

    await this.publisher.publish(
      `crdt:channel:${presentationId}`,
      JSON.stringify({
        type: 'user_left',
        userId,
        timestamp: Date.now(),
      }),
    );

    const sessionId = this.generateSessionId(presentationId, userId);
    await this.prisma.collaborationSession.updateMany({
      where: {
        sessionId,
        presentationId,
        userId,
        active: true,
      },
      data: {
        active: false,
        leftAt: new Date(),
      },
    });

    const remainingUsers = await this.redis.scard(presenceKey);
    if (remainingUsers === 0) {
      const doc = this.docs.get(presentationId);
      if (doc) {
        const finalState = encodeStateAsUpdate(doc);
        const base64State = Buffer.from(finalState).toString('base64');

        await this.prisma.presentationState.upsert({
          where: { presentationId },
          create: {
            presentationId,
            crdtState: base64State,
            updatedAt: new Date(),
          },
          update: {
            crdtState: base64State,
            updatedAt: new Date(),
          },
        });

        doc.destroy();
        this.docs.delete(presentationId);
      }

      await this.subscriber.unsubscribe(`crdt:channel:${presentationId}`);
    }
  }

  async getActiveUsers(presentationId: string): Promise<string[]> {
    const presenceKey = `${CollaborationService.PRESENCE_KEY_PREFIX}${presentationId}`;
    const members = await this.redis.smembers(presenceKey);
    return members;
  }

  private generateSessionId(
    presentationId: string,
    userId: string,
  ): string {
    const { createHash } = require('crypto');
    const hash = createHash('sha256')
      .update(`${presentationId}:${userId}:${Date.now()}`)
      .digest('hex');
    return hash.substring(0, 32);
  }
}
