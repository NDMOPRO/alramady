// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

/* ───── Mocks ─────────────────────────────────────────────────────── */

const mockApplyUpdate = jest.fn();
const mockEncodeStateAsUpdate = jest.fn().mockReturnValue(new Uint8Array([1, 2, 3]));
const mockYDocOn = jest.fn();
const mockYDocDestroy = jest.fn();

jest.mock('yjs', () => ({
  Doc: jest.fn().mockImplementation(() => ({
    on: mockYDocOn,
    destroy: mockYDocDestroy,
  })),
  encodeStateAsUpdate: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3])),
  applyUpdate: jest.fn(),
}));

const mockRedisGet = jest.fn().mockResolvedValue(null);
const mockRedisGetBuffer = jest.fn().mockResolvedValue(null);
const mockRedisSet = jest.fn().mockResolvedValue('OK');
const mockRedisSadd = jest.fn().mockResolvedValue(1);
const mockRedisSrem = jest.fn().mockResolvedValue(1);
const mockRedisScard = jest.fn().mockResolvedValue(0);
const mockRedisSmembers = jest.fn().mockResolvedValue(['user-1']);
const mockRedisExpire = jest.fn().mockResolvedValue(1);
const mockRedisHset = jest.fn().mockResolvedValue(1);
const mockRedisHdel = jest.fn().mockResolvedValue(1);
const mockRedisSubscribe = jest.fn().mockResolvedValue(undefined);
const mockRedisUnsubscribe = jest.fn().mockResolvedValue(undefined);
const mockRedisPublish = jest.fn().mockResolvedValue(1);

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    get: mockRedisGet,
    getBuffer: mockRedisGetBuffer,
    set: mockRedisSet,
    sadd: mockRedisSadd,
    srem: mockRedisSrem,
    scard: mockRedisScard,
    smembers: mockRedisSmembers,
    expire: mockRedisExpire,
    hset: mockRedisHset,
    hdel: mockRedisHdel,
    subscribe: mockRedisSubscribe,
    unsubscribe: mockRedisUnsubscribe,
    publish: mockRedisPublish,
  })),
}));

const mockPresentationStateFindUnique = jest.fn().mockResolvedValue(null);
const mockPresentationStateUpsert = jest.fn().mockResolvedValue({});
const mockCollabSessionCreate = jest.fn().mockResolvedValue({});
const mockCollabSessionUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
const mockCollabEventCreate = jest.fn().mockResolvedValue({});

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    presentationState: {
      findUnique: mockPresentationStateFindUnique,
      upsert: mockPresentationStateUpsert,
    },
    collaborationSession: {
      create: mockCollabSessionCreate,
      updateMany: mockCollabSessionUpdateMany,
    },
    collaborationEvent: {
      create: mockCollabEventCreate,
    },
  })),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { CollaborationService } from '../services/collaboration.service.js';
import { PrismaClient } from '@prisma/client';

/* ───── Tests ─────────────────────────────────────────────────────── */

describe('CollaborationService', () => {
  let service: InstanceType<typeof CollaborationService>;
  const prisma = new PrismaClient();
  const presentationId = 'pres-collab-1';
  const userId = 'user-1';

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisGetBuffer.mockResolvedValue(null);
    mockPresentationStateFindUnique.mockResolvedValue(null);
    mockRedisSmembers.mockResolvedValue([userId]);
    mockRedisScard.mockResolvedValue(1);
    service = new CollaborationService(prisma);
  });

  describe('getOrCreateDoc', () => {
    it('should create a new Y.Doc when no saved state exists', async () => {
      const doc = await service.getOrCreateDoc(presentationId);

      expect(doc).toBeDefined();
      expect(doc.on).toBeDefined();
      expect(mockRedisGetBuffer).toHaveBeenCalledWith(`crdt:doc:${presentationId}`);
    });

    it('should restore from Redis if a cached state exists', async () => {
      mockRedisGetBuffer.mockResolvedValue(Buffer.from([1, 2, 3]));

      const doc = await service.getOrCreateDoc(presentationId);

      expect(doc).toBeDefined();
    });

    it('should restore from database when Redis is empty', async () => {
      mockRedisGetBuffer.mockResolvedValue(null);
      mockPresentationStateFindUnique.mockResolvedValue({
        presentationId,
        crdtState: Buffer.from([4, 5, 6]).toString('base64'),
      });

      const doc = await service.getOrCreateDoc(presentationId);

      expect(doc).toBeDefined();
    });
  });

  describe('joinSession', () => {
    it('should join a collaboration session and return session info', async () => {
      const info = await service.joinSession(presentationId, userId);

      expect(info).toHaveProperty('sessionId');
      expect(info).toHaveProperty('initialState');
      expect(info).toHaveProperty('activeUsers');
      expect(info.activeUsers).toContain(userId);
      expect(mockRedisSadd).toHaveBeenCalled();
      expect(mockCollabSessionCreate).toHaveBeenCalled();
    });

    it('should publish a user_joined event', async () => {
      await service.joinSession(presentationId, userId);

      expect(mockRedisPublish).toHaveBeenCalledWith(
        `crdt:channel:${presentationId}`,
        expect.stringContaining('user_joined'),
      );
    });
  });

  describe('applyClientUpdate', () => {
    it('should apply a CRDT update and return merged state', async () => {
      const updateBase64 = Buffer.from([10, 20, 30]).toString('base64');

      const result = await service.applyClientUpdate(presentationId, userId, updateBase64);

      expect(result).toHaveProperty('mergedState');
      expect(result).toHaveProperty('activeUsers');
      expect(mockRedisPublish).toHaveBeenCalledWith(
        `crdt:channel:${presentationId}`,
        expect.stringContaining('doc_update'),
      );
      expect(mockCollabEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'update',
            userId,
          }),
        }),
      );
    });
  });

  describe('leaveSession', () => {
    it('should remove user from presence and publish user_left', async () => {
      await service.joinSession(presentationId, userId);
      jest.clearAllMocks();
      mockRedisScard.mockResolvedValue(0);

      await service.leaveSession(presentationId, userId);

      expect(mockRedisSrem).toHaveBeenCalledWith(
        expect.stringContaining('crdt:presence:'),
        userId,
      );
      expect(mockRedisPublish).toHaveBeenCalledWith(
        `crdt:channel:${presentationId}`,
        expect.stringContaining('user_left'),
      );
      expect(mockCollabSessionUpdateMany).toHaveBeenCalled();
    });

    it('should persist final state and destroy doc when last user leaves', async () => {
      await service.joinSession(presentationId, userId);
      jest.clearAllMocks();
      mockRedisScard.mockResolvedValue(0);

      await service.leaveSession(presentationId, userId);

      expect(mockPresentationStateUpsert).toHaveBeenCalled();
      expect(mockYDocDestroy).toHaveBeenCalled();
    });
  });

  describe('getActiveUsers', () => {
    it('should return list of active users from Redis', async () => {
      mockRedisSmembers.mockResolvedValue(['user-1', 'user-2']);

      const users = await service.getActiveUsers(presentationId);

      expect(users).toEqual(['user-1', 'user-2']);
      expect(mockRedisSmembers).toHaveBeenCalledWith(
        `crdt:presence:${presentationId}`,
      );
    });
  });
});
