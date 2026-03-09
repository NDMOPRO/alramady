import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import * as crypto from 'crypto';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface CellEdit {
  id: string;
  workbookId: string;
  sheetId: string;
  cellRef: string;
  userId: string;
  previousValue: unknown;
  newValue: unknown;
  previousFormula?: string;
  newFormula?: string;
  timestamp: number;
  operationType: 'insert' | 'delete' | 'update' | 'format';
}

export interface OperationalTransform {
  id: string;
  baseVersion: number;
  operations: CellOperation[];
  userId: string;
  timestamp: number;
}

export interface CellOperation {
  type: 'set_value' | 'set_formula' | 'set_format' | 'insert_row' | 'delete_row' | 'insert_col' | 'delete_col';
  cellRef?: string;
  value?: unknown;
  formula?: string;
  format?: Record<string, unknown>;
  rowIndex?: number;
  colIndex?: number;
}

export interface CellLock {
  workbookId: string;
  sheetId: string;
  cellRef: string;
  userId: string;
  userName: string;
  lockedAt: Date;
  expiresAt: Date;
}

export interface ConflictResolution {
  cellRef: string;
  conflictType: 'concurrent_edit' | 'stale_version' | 'lock_violation';
  serverValue: unknown;
  clientValue: unknown;
  resolvedValue: unknown;
  resolution: 'server_wins' | 'client_wins' | 'merge' | 'manual';
}

export interface ChangeHistoryEntry {
  id: string;
  workbookId: string;
  sheetId: string;
  userId: string;
  userName: string;
  action: string;
  cellRef?: string;
  previousValue?: unknown;
  newValue?: unknown;
  timestamp: Date;
  batchId?: string;
}

export interface UserPresence {
  userId: string;
  userName: string;
  workbookId: string;
  sheetId: string;
  activeCellRef?: string;
  selectionRange?: string;
  color: string;
  lastActiveAt: Date;
  status: 'active' | 'idle' | 'away';
}

export interface CellComment {
  id: string;
  workbookId: string;
  sheetId: string;
  cellRef: string;
  threadId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: Date;
  updatedAt?: Date;
  resolved: boolean;
  parentCommentId?: string;
  mentions: string[];
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class CollaborationService {
  private readonly LOCK_TTL_SECONDS = 300;
  private readonly PRESENCE_TTL_SECONDS = 60;
  private versionCounters: Map<string, number>;

  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
  ) {
    this.versionCounters = new Map();
  }

  async applyEdit(edit: CellEdit): Promise<{ accepted: boolean; conflicts: ConflictResolution[]; version: number }> {
    const lockKey = `lock:${edit.workbookId}:${edit.sheetId}:${edit.cellRef}`;
    const existingLock = await this.redis.get(lockKey);

    if (existingLock) {
      const lock: CellLock = JSON.parse(existingLock);
      if (lock.userId !== edit.userId && new Date() < lock.expiresAt) {
        return {
          accepted: false,
          conflicts: [{
            cellRef: edit.cellRef,
            conflictType: 'lock_violation',
            serverValue: null,
            clientValue: edit.newValue,
            resolvedValue: null,
            resolution: 'server_wins',
          }],
          version: this.getCurrentVersion(edit.workbookId),
        };
      }
    }

    const currentVersion = this.getCurrentVersion(edit.workbookId);
    const serverStateKey = `cell:${edit.workbookId}:${edit.sheetId}:${edit.cellRef}`;
    const serverState = await this.redis.get(serverStateKey);
    const serverValue = serverState ? JSON.parse(serverState) : null;

    const conflicts: ConflictResolution[] = [];
    if (serverValue && serverValue.value !== edit.previousValue && edit.previousValue !== undefined) {
      const resolution = this.resolveConflict(edit.cellRef, serverValue.value, edit.newValue, edit.previousValue);
      conflicts.push(resolution);

      if (resolution.resolution === 'server_wins') {
        return { accepted: false, conflicts, version: currentVersion };
      }
    }

    const newVersion = currentVersion + 1;
    this.versionCounters.set(edit.workbookId, newVersion);

    await this.redis.set(serverStateKey, JSON.stringify({
      value: edit.newValue,
      formula: edit.newFormula,
      version: newVersion,
      lastEditBy: edit.userId,
      lastEditAt: edit.timestamp,
    }));

    await this.prisma.cellEditHistory.create({
      data: {
        workbookId: edit.workbookId,
        sheetId: edit.sheetId,
        cellRef: edit.cellRef,
        userId: edit.userId,
        previousValue: edit.previousValue !== undefined ? JSON.stringify(edit.previousValue) : null,
        newValue: JSON.stringify(edit.newValue),
        previousFormula: edit.previousFormula || null,
        newFormula: edit.newFormula || null,
        operationType: edit.operationType,
        version: newVersion,
        timestamp: new Date(edit.timestamp),
      },
    });

    await this.redis.publish(`workbook:${edit.workbookId}:changes`, JSON.stringify({
      type: 'cell_edit',
      edit: { ...edit, version: newVersion },
      conflicts,
    }));

    return { accepted: true, conflicts, version: newVersion };
  }

  private resolveConflict(
    cellRef: string,
    serverValue: unknown,
    clientValue: unknown,
    baseValue: unknown,
  ): ConflictResolution {
    if (typeof serverValue === 'number' && typeof clientValue === 'number' && typeof baseValue === 'number') {
      const serverDelta = serverValue - baseValue;
      const clientDelta = clientValue - baseValue;
      const mergedValue = baseValue + serverDelta + clientDelta;
      return {
        cellRef,
        conflictType: 'concurrent_edit',
        serverValue,
        clientValue,
        resolvedValue: mergedValue,
        resolution: 'merge',
      };
    }

    if (typeof serverValue === 'string' && typeof clientValue === 'string') {
      const serverTime = Date.now();
      return {
        cellRef,
        conflictType: 'concurrent_edit',
        serverValue,
        clientValue,
        resolvedValue: clientValue,
        resolution: 'client_wins',
      };
    }

    return {
      cellRef,
      conflictType: 'concurrent_edit',
      serverValue,
      clientValue,
      resolvedValue: serverValue,
      resolution: 'server_wins',
    };
  }

  async transformOperations(transform: OperationalTransform): Promise<{
    transformedOps: CellOperation[];
    newVersion: number;
  }> {
    const currentVersion = this.getCurrentVersion(transform.id);
    const versionKey = `ops:${transform.id}`;

    const serverOps: string[] = [];
    if (transform.baseVersion < currentVersion) {
      const rawOps = await this.redis.lrange(versionKey, transform.baseVersion, currentVersion - 1);
      serverOps.push(...rawOps);
    }

    let transformedOps = [...transform.operations];

    for (const rawServerOp of serverOps) {
      const serverOp: CellOperation = JSON.parse(rawServerOp);
      transformedOps = transformedOps.map(clientOp => {
        return this.transformSingleOperation(clientOp, serverOp);
      });
    }

    const newVersion = currentVersion + 1;
    this.versionCounters.set(transform.id, newVersion);

    for (const op of transformedOps) {
      await this.redis.rpush(versionKey, JSON.stringify(op));
    }

    await this.redis.publish(`workbook:${transform.id}:ops`, JSON.stringify({
      userId: transform.userId,
      operations: transformedOps,
      version: newVersion,
    }));

    return { transformedOps, newVersion };
  }

  private transformSingleOperation(clientOp: CellOperation, serverOp: CellOperation): CellOperation {
    if (clientOp.type === 'set_value' && serverOp.type === 'insert_row') {
      const cellRef = clientOp.cellRef || '';
      const match = cellRef.match(/^([A-Z]+)(\d+)$/);
      if (match && serverOp.rowIndex !== undefined) {
        const col = match[1];
        const row = parseInt(match[2], 10);
        if (row >= serverOp.rowIndex) {
          return { ...clientOp, cellRef: `${col}${row + 1}` };
        }
      }
      return clientOp;
    }

    if (clientOp.type === 'set_value' && serverOp.type === 'delete_row') {
      const cellRef = clientOp.cellRef || '';
      const match = cellRef.match(/^([A-Z]+)(\d+)$/);
      if (match && serverOp.rowIndex !== undefined) {
        const col = match[1];
        const row = parseInt(match[2], 10);
        if (row === serverOp.rowIndex) {
          return { ...clientOp, type: 'set_value', value: undefined };
        }
        if (row > serverOp.rowIndex) {
          return { ...clientOp, cellRef: `${col}${row - 1}` };
        }
      }
      return clientOp;
    }

    if (clientOp.type === 'set_value' && serverOp.type === 'set_value' && clientOp.cellRef === serverOp.cellRef) {
      return clientOp;
    }

    return clientOp;
  }

  async acquireCellLock(
    workbookId: string,
    sheetId: string,
    cellRef: string,
    userId: string,
    userName: string,
  ): Promise<{ acquired: boolean; lock?: CellLock; existingLock?: CellLock }> {
    const lockKey = `lock:${workbookId}:${sheetId}:${cellRef}`;
    const existingRaw = await this.redis.get(lockKey);

    if (existingRaw) {
      const existing: CellLock = JSON.parse(existingRaw);
      if (existing.userId !== userId && new Date() < new Date(existing.expiresAt)) {
        return { acquired: false, existingLock: existing };
      }
    }

    const lock: CellLock = {
      workbookId,
      sheetId,
      cellRef,
      userId,
      userName,
      lockedAt: new Date(),
      expiresAt: new Date(Date.now() + this.LOCK_TTL_SECONDS * 1000),
    };

    const setResult = await this.redis.set(
      lockKey,
      JSON.stringify(lock),
      'EX', this.LOCK_TTL_SECONDS,
      'NX',
    );

    if (!setResult && existingRaw) {
      const existing: CellLock = JSON.parse(existingRaw);
      if (existing.userId !== userId) {
        return { acquired: false, existingLock: existing };
      }
      await this.redis.set(lockKey, JSON.stringify(lock), 'EX', this.LOCK_TTL_SECONDS);
    }

    await this.redis.sadd(`locks:${workbookId}:${userId}`, `${sheetId}:${cellRef}`);

    await this.redis.publish(`workbook:${workbookId}:locks`, JSON.stringify({
      type: 'lock_acquired',
      lock,
    }));

    return { acquired: true, lock };
  }

  async releaseCellLock(workbookId: string, sheetId: string, cellRef: string, userId: string): Promise<boolean> {
    const lockKey = `lock:${workbookId}:${sheetId}:${cellRef}`;
    const existingRaw = await this.redis.get(lockKey);

    if (!existingRaw) {
      return false;
    }

    const existing: CellLock = JSON.parse(existingRaw);
    if (existing.userId !== userId) {
      return false;
    }

    await this.redis.del(lockKey);
    await this.redis.srem(`locks:${workbookId}:${userId}`, `${sheetId}:${cellRef}`);

    await this.redis.publish(`workbook:${workbookId}:locks`, JSON.stringify({
      type: 'lock_released',
      workbookId,
      sheetId,
      cellRef,
      userId,
    }));

    return true;
  }

  async releaseAllUserLocks(workbookId: string, userId: string): Promise<number> {
    const lockRefs = await this.redis.smembers(`locks:${workbookId}:${userId}`);
    let releasedCount = 0;

    for (const ref of lockRefs) {
      const [sheetId, cellRef] = ref.split(':');
      const released = await this.releaseCellLock(workbookId, sheetId, cellRef, userId);
      if (released) releasedCount += 1;
    }

    await this.redis.del(`locks:${workbookId}:${userId}`);
    return releasedCount;
  }

  async getChangeHistory(
    workbookId: string,
    options?: { sheetId?: string; cellRef?: string; userId?: string; limit?: number; offset?: number },
  ): Promise<{ entries: ChangeHistoryEntry[]; totalCount: number }> {
    const where: Record<string, unknown> = { workbookId };
    if (options?.sheetId) where.sheetId = options.sheetId;
    if (options?.cellRef) where.cellRef = options.cellRef;
    if (options?.userId) where.userId = options.userId;

    const [records, totalCount] = await Promise.all([
      this.prisma.cellEditHistory.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: options?.limit || 50,
        skip: options?.offset || 0,
        include: { user: { select: { id: true, name: true } } },
      }),
      this.prisma.cellEditHistory.count({ where }),
    ]);

    const entries: ChangeHistoryEntry[] = records.map(r => ({
      id: r.id,
      workbookId: r.workbookId,
      sheetId: r.sheetId,
      userId: r.userId,
      userName: (r as unknown as Record<string, Record<string, unknown>>).user?.name as string || 'Unknown',
      action: r.operationType,
      cellRef: r.cellRef,
      previousValue: r.previousValue ? JSON.parse(r.previousValue) : undefined,
      newValue: r.newValue ? JSON.parse(r.newValue) : undefined,
      timestamp: r.timestamp,
      batchId: r.batchId || undefined,
    }));

    return { entries, totalCount };
  }

  async updatePresence(presence: Omit<UserPresence, 'lastActiveAt' | 'status'>): Promise<UserPresence[]> {
    const fullPresence: UserPresence = {
      ...presence,
      lastActiveAt: new Date(),
      status: 'active',
    };

    const presenceKey = `presence:${presence.workbookId}`;
    await this.redis.hset(presenceKey, presence.userId, JSON.stringify(fullPresence));
    await this.redis.expire(presenceKey, this.PRESENCE_TTL_SECONDS * 5);

    const userPresenceKey = `presence:${presence.workbookId}:${presence.userId}`;
    await this.redis.set(userPresenceKey, JSON.stringify(fullPresence), 'EX', this.PRESENCE_TTL_SECONDS);

    await this.redis.publish(`workbook:${presence.workbookId}:presence`, JSON.stringify({
      type: 'presence_update',
      user: fullPresence,
    }));

    return this.getActiveUsers(presence.workbookId);
  }

  async getActiveUsers(workbookId: string): Promise<UserPresence[]> {
    const presenceKey = `presence:${workbookId}`;
    const allPresence = await this.redis.hgetall(presenceKey);
    const now = Date.now();
    const activeUsers: UserPresence[] = [];

    for (const [userId, rawPresence] of Object.entries(allPresence)) {
      const presence: UserPresence = JSON.parse(rawPresence);
      const lastActive = new Date(presence.lastActiveAt).getTime();
      const idleThreshold = this.PRESENCE_TTL_SECONDS * 1000;
      const awayThreshold = idleThreshold * 3;

      if (now - lastActive > awayThreshold) {
        await this.redis.hdel(presenceKey, userId);
        continue;
      }

      if (now - lastActive > idleThreshold) {
        presence.status = 'idle';
      } else {
        presence.status = 'active';
      }

      activeUsers.push(presence);
    }

    return activeUsers.sort((a, b) => {
      const statusOrder = { active: 0, idle: 1, away: 2 };
      return statusOrder[a.status] - statusOrder[b.status];
    });
  }

  async removePresence(workbookId: string, userId: string): Promise<void> {
    const presenceKey = `presence:${workbookId}`;
    await this.redis.hdel(presenceKey, userId);
    await this.redis.del(`presence:${workbookId}:${userId}`);
    await this.releaseAllUserLocks(workbookId, userId);

    await this.redis.publish(`workbook:${workbookId}:presence`, JSON.stringify({
      type: 'user_left',
      userId,
      workbookId,
    }));
  }

  async addComment(
    workbookId: string,
    sheetId: string,
    cellRef: string,
    userId: string,
    userName: string,
    content: string,
    parentCommentId?: string,
  ): Promise<CellComment> {
    const threadId = parentCommentId
      ? (await this.prisma.cellComment.findUnique({ where: { id: parentCommentId } }))?.threadId || `thread_${Date.now()}`
      : `thread_${Date.now()}_${crypto.randomUUID().split('-')[0]}`;

    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(content)) !== null) {
      mentions.push(match[1]);
    }

    const comment = await this.prisma.cellComment.create({
      data: {
        workbookId,
        sheetId,
        cellRef,
        threadId,
        userId,
        userName,
        content,
        resolved: false,
        parentCommentId: parentCommentId || null,
        mentions: JSON.stringify(mentions),
        createdAt: new Date(),
      },
    });

    const cellComment: CellComment = {
      id: comment.id,
      workbookId,
      sheetId,
      cellRef,
      threadId,
      userId,
      userName,
      content,
      createdAt: comment.createdAt,
      resolved: false,
      parentCommentId,
      mentions,
    };

    await this.redis.publish(`workbook:${workbookId}:comments`, JSON.stringify({
      type: 'comment_added',
      comment: cellComment,
    }));

    return cellComment;
  }

  async resolveCommentThread(threadId: string, userId: string): Promise<void> {
    const comments = await this.prisma.cellComment.findMany({
      where: { threadId },
    });

    if (comments.length === 0) {
      throw new Error(`Thread ${threadId} not found`);
    }

    await this.prisma.cellComment.updateMany({
      where: { threadId },
      data: { resolved: true, resolvedBy: userId, resolvedAt: new Date() },
    });

    const workbookId = comments[0].workbookId;
    await this.redis.publish(`workbook:${workbookId}:comments`, JSON.stringify({
      type: 'thread_resolved',
      threadId,
      resolvedBy: userId,
    }));
  }

  async getCommentThreads(
    workbookId: string,
    sheetId: string,
    options?: { cellRef?: string; resolved?: boolean },
  ): Promise<{ threadId: string; cellRef: string; comments: CellComment[]; resolved: boolean }[]> {
    const where: Record<string, unknown> = { workbookId, sheetId };
    if (options?.cellRef) where.cellRef = options.cellRef;
    if (options?.resolved !== undefined) where.resolved = options.resolved;

    const comments = await this.prisma.cellComment.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    const threadMap = new Map<string, CellComment[]>();
    for (const c of comments) {
      const threadComments = threadMap.get(c.threadId) || [];
      threadComments.push({
        id: c.id,
        workbookId: c.workbookId,
        sheetId: c.sheetId,
        cellRef: c.cellRef,
        threadId: c.threadId,
        userId: c.userId,
        userName: c.userName,
        content: c.content,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt || undefined,
        resolved: c.resolved,
        parentCommentId: c.parentCommentId || undefined,
        mentions: JSON.parse(c.mentions as string || '[]'),
      });
      threadMap.set(c.threadId, threadComments);
    }

    const threads = Array.from(threadMap.entries()).map(([threadId, threadComments]) => ({
      threadId,
      cellRef: threadComments[0].cellRef,
      comments: threadComments,
      resolved: threadComments[0].resolved,
    }));

    return threads;
  }

  private getCurrentVersion(workbookId: string): number {
    return this.versionCounters.get(workbookId) || 0;
  }
}
