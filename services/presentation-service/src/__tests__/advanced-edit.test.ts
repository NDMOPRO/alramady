// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPresentation = {
  id: 'pres-001',
  title: 'Q4 Business Review',
  theme: { primaryColor: '#1a73e8', fontFamily: 'Arial' },
  slides: [
    {
      id: 'slide-001',
      order: 0,
      title: 'Introduction',
      notes: 'Opening slide',
      backgroundColor: '#FFFFFF',
      elements: [
        { id: 'el-001', type: 'text', x: 1, y: 1, width: 8, height: 1, content: 'Welcome', style: { fontSize: 36 }, rotation: 0, zIndex: 1 },
        { id: 'el-002', type: 'shape', x: 0, y: 0, width: 10, height: 0.1, content: '', style: { backgroundColor: '#1a73e8' }, rotation: 0, zIndex: 0 },
      ],
    },
    {
      id: 'slide-002',
      order: 1,
      title: 'Revenue',
      notes: '',
      backgroundColor: '#F5F5F5',
      elements: [
        { id: 'el-003', type: 'text', x: 1, y: 0.5, width: 8, height: 1, content: 'Revenue Growth', style: { fontSize: 28 }, rotation: 0, zIndex: 1 },
      ],
    },
  ],
};

const snapshotJson = JSON.stringify({
  presentationId: 'pres-001',
  title: 'Q4 Business Review',
  theme: { primaryColor: '#1a73e8' },
  slides: [
    {
      id: 'slide-001',
      order: 0,
      title: 'Introduction',
      notes: 'Opening slide',
      backgroundColor: '#FFFFFF',
      elements: [
        { id: 'el-001', type: 'text', x: 1, y: 1, width: 8, height: 1, content: 'Welcome', style: {}, rotation: 0, zIndex: 1 },
      ],
    },
  ],
  capturedAt: '2025-12-01T10:00:00.000Z',
  action: 'edit_text',
  userId: 'user-abc',
});

const mockPipeline = {
  lpush: jest.fn().mockReturnThis(),
  ltrim: jest.fn().mockReturnThis(),
  del: jest.fn().mockReturnThis(),
  expire: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([]),
};

const mockRedisInstance = {
  pipeline: jest.fn(() => mockPipeline),
  lpop: jest.fn().mockResolvedValue(snapshotJson),
  llen: jest.fn().mockResolvedValue(3),
  lrange: jest.fn().mockResolvedValue([snapshotJson]),
  del: jest.fn().mockResolvedValue(2),
  on: jest.fn(),
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockRedisInstance),
}));

const mockTx = {
  slide: {
    findMany: jest.fn().mockResolvedValue([{ id: 'slide-001' }, { id: 'slide-002' }]),
    deleteMany: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({ id: 'new-slide-001' }),
  },
  slideElement: {
    deleteMany: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
  },
  presentation: {
    update: jest.fn().mockResolvedValue({}),
  },
};

const mockPrisma = {
  presentation: {
    findUnique: jest.fn().mockResolvedValue(mockPresentation),
  },
  $transaction: jest.fn((fn) => fn(mockTx)),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { AdvancedEditService } from '../services/advanced-edit.service.js';

describe('Advanced Edit Service (Section 5.5)', () => {
  let service: AdvancedEditService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdvancedEditService(mockPrisma as any);
  });

  describe('saveSnapshot', () => {
    it('should capture the current presentation state and push to undo stack', async () => {
      await service.saveSnapshot('pres-001', 'user-abc', 'edit_text');
      expect(mockPrisma.presentation.findUnique).toHaveBeenCalledWith({
        where: { id: 'pres-001' },
        include: {
          slides: {
            orderBy: { order: 'asc' },
            include: { elements: true },
          },
        },
      });
      expect(mockPipeline.lpush).toHaveBeenCalled();
      expect(mockPipeline.ltrim).toHaveBeenCalled();
      expect(mockPipeline.del).toHaveBeenCalled();
      expect(mockPipeline.expire).toHaveBeenCalled();
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it('should throw when the presentation does not exist', async () => {
      mockPrisma.presentation.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.saveSnapshot('nonexistent', 'user-abc', 'delete_slide'),
      ).rejects.toThrow('Presentation not found: nonexistent');
    });

    it('should clear the redo stack when a new snapshot is saved', async () => {
      await service.saveSnapshot('pres-001', 'user-abc', 'add_element');
      const delCall = mockPipeline.del.mock.calls[0];
      expect(delCall[0]).toBe('redo:pres-001:user-abc');
    });
  });

  describe('undo', () => {
    it('should pop a snapshot from the undo stack and restore it', async () => {
      const result = await service.undo('pres-001', 'user-abc');
      expect(result.restored).toBe(true);
      expect(result.action).toBe('edit_text');
      expect(result.undoRemaining).toBe(3);
      expect(result.redoAvailable).toBe(3);
      expect(result.restoredAt).toBeDefined();
    });

    it('should throw when there is nothing to undo', async () => {
      mockRedisInstance.lpop.mockResolvedValueOnce(null);
      await expect(service.undo('pres-001', 'user-abc')).rejects.toThrow('Nothing to undo');
    });

    it('should push the current state onto the redo stack before restoring', async () => {
      await service.undo('pres-001', 'user-abc');
      // The redo pipeline should have been called with lpush
      expect(mockPipeline.lpush).toHaveBeenCalled();
      const lpushArgs = mockPipeline.lpush.mock.calls;
      const redoCall = lpushArgs.find((args: any) => args[0].startsWith('redo:'));
      expect(redoCall).toBeDefined();
    });
  });

  describe('redo', () => {
    it('should pop a snapshot from the redo stack and restore it', async () => {
      const result = await service.redo('pres-001', 'user-abc');
      expect(result.restored).toBe(true);
      expect(result.action).toBe('edit_text');
      expect(result.undoRemaining).toBe(3);
      expect(result.redoAvailable).toBe(3);
    });

    it('should throw when there is nothing to redo', async () => {
      mockRedisInstance.lpop.mockResolvedValueOnce(null);
      await expect(service.redo('pres-001', 'user-abc')).rejects.toThrow('Nothing to redo');
    });
  });

  describe('restoreState', () => {
    it('should delete existing slides and recreate from snapshot within a transaction', async () => {
      const snapshot = JSON.parse(snapshotJson);
      await service.restoreState('pres-001', snapshot);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockTx.slideElement.deleteMany).toHaveBeenCalled();
      expect(mockTx.slide.deleteMany).toHaveBeenCalledWith({
        where: { presentationId: 'pres-001' },
      });
      expect(mockTx.presentation.update).toHaveBeenCalledWith({
        where: { id: 'pres-001' },
        data: { title: snapshot.title, theme: snapshot.theme },
      });
      expect(mockTx.slide.create).toHaveBeenCalled();
      expect(mockTx.slideElement.create).toHaveBeenCalled();
    });
  });

  describe('getHistory', () => {
    it('should return undo and redo stacks with counts', async () => {
      const history = await service.getHistory('pres-001', 'user-abc');
      expect(history.undoStack).toHaveLength(1);
      expect(history.redoStack).toHaveLength(1);
      expect(history.undoCount).toBe(1);
      expect(history.redoCount).toBe(1);
      expect(history.undoStack[0].action).toBe('edit_text');
      expect(history.undoStack[0].userId).toBe('user-abc');
      expect(history.undoStack[0].slideCount).toBe(1);
    });
  });

  describe('clearHistory', () => {
    it('should delete both undo and redo keys from Redis', async () => {
      const result = await service.clearHistory('pres-001', 'user-abc');
      expect(result.cleared).toBe(true);
      expect(result.keysDeleted).toBe(2);
      expect(mockRedisInstance.del).toHaveBeenCalledWith(
        'undo:pres-001:user-abc',
        'redo:pres-001:user-abc',
      );
    });
  });
});
