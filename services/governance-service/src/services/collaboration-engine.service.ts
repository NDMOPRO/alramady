import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { z } from 'zod';

const SESSION_PREFIX = 'rasid:collab:session:';
const COLLABORATORS_PREFIX = 'rasid:collab:users:';
const OPS_PREFIX = 'rasid:collab:ops:';
const STATE_PREFIX = 'rasid:collab:state:';
const COLLABORATOR_TTL_SECONDS = 300; // 5 minutes heartbeat window
const MAX_OPS_PER_SESSION = 10000;

const StartCollaborationSessionInputSchema = z.object({
  documentId: z.string().uuid(),
  userId: z.string().uuid(),
  userName: z.string().min(1),
  documentType: z.string().min(1),
});

const ApplyOperationInputSchema = z.object({
  sessionId: z.string().min(1),
  userId: z.string().uuid(),
  operation: z.object({
    type: z.enum(['INSERT', 'DELETE', 'UPDATE', 'MOVE']),
    path: z.string().min(1),
    value: z.unknown().optional(),
    previousValue: z.unknown().optional(),
    position: z.number().int().min(0).optional(),
    length: z.number().int().min(0).optional(),
    timestamp: z.number().int().optional(),
  }),
});

const GetActiveCollaboratorsInputSchema = z.object({
  sessionId: z.string().min(1),
});

const SyncStateInputSchema = z.object({
  sessionId: z.string().min(1),
  userId: z.string().uuid(),
  lastSeenOpIndex: z.number().int().min(0).optional(),
});

interface CollaborationSession {
  sessionId: string;
  documentId: string;
  documentType: string;
  startedAt: string;
  collaboratorCount: number;
}

interface CRDTOperation {
  id: string;
  userId: string;
  type: string;
  path: string;
  value: unknown;
  previousValue: unknown;
  position: number | null;
  length: number | null;
  timestamp: number;
  lamportClock: number;
}

interface ApplyOperationResult {
  accepted: boolean;
  operation: CRDTOperation;
  currentOpIndex: number;
}

interface Collaborator {
  userId: string;
  userName: string;
  joinedAt: string;
  lastActiveAt: string;
  isActive: boolean;
}

interface SyncStateResult {
  sessionId: string;
  currentOpIndex: number;
  missedOperations: CRDTOperation[];
  activeCollaborators: Collaborator[];
  documentState: unknown;
}

export class CollaborationEngineService {
  private readonly prisma: PrismaClient;
  private readonly redis: Redis;

  constructor(prisma: PrismaClient, redis: Redis) {
    this.prisma = prisma;
    this.redis = redis;
  }

  private sessionKey(sessionId: string): string {
    return `${SESSION_PREFIX}${sessionId}`;
  }

  private collaboratorsKey(sessionId: string): string {
    return `${COLLABORATORS_PREFIX}${sessionId}`;
  }

  private opsKey(sessionId: string): string {
    return `${OPS_PREFIX}${sessionId}`;
  }

  private stateKey(sessionId: string): string {
    return `${STATE_PREFIX}${sessionId}`;
  }

  private generateSessionId(documentId: string): string {
    const { randomUUID } = require('crypto');
    const uuid = (randomUUID() as string).replace(/-/g, '').substring(0, 12);
    return `sess_${documentId.substring(0, 8)}_${uuid}`;
  }

  private generateOperationId(): string {
    const { randomUUID } = require('crypto');
    const uuid = (randomUUID() as string).replace(/-/g, '').substring(0, 16);
    return `op_${uuid}`;
  }

  async startCollaborationSession(
    input: z.infer<typeof StartCollaborationSessionInputSchema>
  ): Promise<CollaborationSession> {
    const validated = StartCollaborationSessionInputSchema.parse(input);

    const existingSessionKeys = await this.redis.keys(`${SESSION_PREFIX}*`);
    let existingSessionId: string | null = null;

    for (const key of existingSessionKeys) {
      const sessionData = await this.redis.get(key);
      if (sessionData) {
        const parsed = JSON.parse(sessionData) as { documentId: string };
        if (parsed.documentId === validated.documentId) {
          existingSessionId = key.replace(SESSION_PREFIX, '');
          break;
        }
      }
    }

    const sessionId = existingSessionId || this.generateSessionId(validated.documentId);
    const now = new Date().toISOString();

    if (!existingSessionId) {
      const sessionData = {
        sessionId,
        documentId: validated.documentId,
        documentType: validated.documentType,
        startedAt: now,
      };

      await this.redis.set(
        this.sessionKey(sessionId),
        JSON.stringify(sessionData),
        'EX',
        86400 // 24 hours max session
      );

      await this.prisma.collaborationSession.create({
        data: {
          sessionId,
          documentId: validated.documentId,
          documentType: validated.documentType,
          startedAt: new Date(),
          isActive: true,
        },
      });
    }

    const collaboratorData: Collaborator = {
      userId: validated.userId,
      userName: validated.userName,
      joinedAt: now,
      lastActiveAt: now,
      isActive: true,
    };

    await this.redis.hset(
      this.collaboratorsKey(sessionId),
      validated.userId,
      JSON.stringify(collaboratorData)
    );
    await this.redis.expire(this.collaboratorsKey(sessionId), 86400);

    await this.prisma.collaborationParticipant.upsert({
      where: {
        sessionId_userId: {
          sessionId,
          userId: validated.userId,
        },
      },
      create: {
        sessionId,
        userId: validated.userId,
        userName: validated.userName,
        joinedAt: new Date(),
      },
      update: {
        lastActiveAt: new Date(),
      },
    });

    const collaboratorCount = await this.redis.hlen(this.collaboratorsKey(sessionId));

    return {
      sessionId,
      documentId: validated.documentId,
      documentType: validated.documentType,
      startedAt: existingSessionId
        ? (JSON.parse((await this.redis.get(this.sessionKey(sessionId)))!) as { startedAt: string }).startedAt
        : now,
      collaboratorCount,
    };
  }

  async applyOperation(
    input: z.infer<typeof ApplyOperationInputSchema>
  ): Promise<ApplyOperationResult> {
    const validated = ApplyOperationInputSchema.parse(input);

    const sessionData = await this.redis.get(this.sessionKey(validated.sessionId));
    if (!sessionData) {
      throw new Error(`Collaboration session not found: ${validated.sessionId}`);
    }

    const collaborator = await this.redis.hget(
      this.collaboratorsKey(validated.sessionId),
      validated.userId
    );
    if (!collaborator) {
      throw new Error(`User ${validated.userId} is not a collaborator in session ${validated.sessionId}`);
    }

    const currentOpsCount = await this.redis.llen(this.opsKey(validated.sessionId));
    const lamportClock = currentOpsCount + 1;

    const operation: CRDTOperation = {
      id: this.generateOperationId(),
      userId: validated.userId,
      type: validated.operation.type,
      path: validated.operation.path,
      value: validated.operation.value ?? null,
      previousValue: validated.operation.previousValue ?? null,
      position: validated.operation.position ?? null,
      length: validated.operation.length ?? null,
      timestamp: validated.operation.timestamp ?? Date.now(),
      lamportClock,
    };

    const serializedOp = JSON.stringify(operation);

    const pipeline = this.redis.pipeline();
    pipeline.rpush(this.opsKey(validated.sessionId), serializedOp);
    pipeline.ltrim(this.opsKey(validated.sessionId), -MAX_OPS_PER_SESSION, -1);
    pipeline.expire(this.opsKey(validated.sessionId), 86400);
    await pipeline.exec();

    await this.applyOperationToState(validated.sessionId, operation);

    const now = new Date().toISOString();
    const collaboratorData = JSON.parse(collaborator) as Collaborator;
    collaboratorData.lastActiveAt = now;
    collaboratorData.isActive = true;

    await this.redis.hset(
      this.collaboratorsKey(validated.sessionId),
      validated.userId,
      JSON.stringify(collaboratorData)
    );

    const newOpsCount = await this.redis.llen(this.opsKey(validated.sessionId));

    return {
      accepted: true,
      operation,
      currentOpIndex: newOpsCount - 1,
    };
  }

  private async applyOperationToState(sessionId: string, operation: CRDTOperation): Promise<void> {
    const stateRaw = await this.redis.get(this.stateKey(sessionId));
    const state: Record<string, unknown> = stateRaw ? JSON.parse(stateRaw) as Record<string, unknown> : {};

    switch (operation.type) {
      case 'INSERT':
      case 'UPDATE':
        this.setNestedValue(state, operation.path, operation.value);
        break;
      case 'DELETE':
        this.deleteNestedValue(state, operation.path);
        break;
      case 'MOVE':
        if (operation.previousValue !== null) {
          this.deleteNestedValue(state, String(operation.previousValue));
        }
        this.setNestedValue(state, operation.path, operation.value);
        break;
    }

    await this.redis.set(
      this.stateKey(sessionId),
      JSON.stringify(state),
      'EX',
      86400
    );
  }

  private setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const keys = path.split('.');
    let current: Record<string, unknown> = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }

    current[keys[keys.length - 1]] = value;
  }

  private deleteNestedValue(obj: Record<string, unknown>, path: string): void {
    const keys = path.split('.');
    let current: Record<string, unknown> = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
        return;
      }
      current = current[key] as Record<string, unknown>;
    }

    delete current[keys[keys.length - 1]];
  }

  async getActiveCollaborators(
    input: z.infer<typeof GetActiveCollaboratorsInputSchema>
  ): Promise<Collaborator[]> {
    const validated = GetActiveCollaboratorsInputSchema.parse(input);

    const sessionData = await this.redis.get(this.sessionKey(validated.sessionId));
    if (!sessionData) {
      throw new Error(`Collaboration session not found: ${validated.sessionId}`);
    }

    const allCollaborators = await this.redis.hgetall(this.collaboratorsKey(validated.sessionId));
    const now = Date.now();
    const collaborators: Collaborator[] = [];

    for (const [, value] of Object.entries(allCollaborators)) {
      const collaborator = JSON.parse(value) as Collaborator;
      const lastActive = new Date(collaborator.lastActiveAt).getTime();
      const isActive = now - lastActive < COLLABORATOR_TTL_SECONDS * 1000;

      collaborators.push({
        ...collaborator,
        isActive,
      });
    }

    return collaborators.sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      return new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime();
    });
  }

  async syncState(input: z.infer<typeof SyncStateInputSchema>): Promise<SyncStateResult> {
    const validated = SyncStateInputSchema.parse(input);

    const sessionData = await this.redis.get(this.sessionKey(validated.sessionId));
    if (!sessionData) {
      throw new Error(`Collaboration session not found: ${validated.sessionId}`);
    }

    const lastSeenIndex = validated.lastSeenOpIndex ?? -1;

    const allOps = await this.redis.lrange(this.opsKey(validated.sessionId), 0, -1);
    const totalOps = allOps.length;

    const missedOperations: CRDTOperation[] = [];
    if (lastSeenIndex < totalOps - 1) {
      const startIndex = Math.max(0, lastSeenIndex + 1);
      for (let i = startIndex; i < totalOps; i++) {
        missedOperations.push(JSON.parse(allOps[i]) as CRDTOperation);
      }
    }

    const activeCollaborators = await this.getActiveCollaborators({
      sessionId: validated.sessionId,
    });

    const stateRaw = await this.redis.get(this.stateKey(validated.sessionId));
    const documentState = stateRaw ? JSON.parse(stateRaw) : {};

    const collaboratorEntry = await this.redis.hget(
      this.collaboratorsKey(validated.sessionId),
      validated.userId
    );

    if (collaboratorEntry) {
      const collaboratorData = JSON.parse(collaboratorEntry) as Collaborator;
      collaboratorData.lastActiveAt = new Date().toISOString();
      collaboratorData.isActive = true;
      await this.redis.hset(
        this.collaboratorsKey(validated.sessionId),
        validated.userId,
        JSON.stringify(collaboratorData)
      );
    }

    return {
      sessionId: validated.sessionId,
      currentOpIndex: totalOps - 1,
      missedOperations,
      activeCollaborators,
      documentState,
    };
  }
}
