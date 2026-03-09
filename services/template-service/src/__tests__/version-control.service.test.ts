// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockPrisma = {
  templateVersion: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
}));

jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'vc-uuid-1234'),
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn(() => 'sha256hash'),
  })),
}));

import VersionControlService from '../services/version-control.service';

describe('VersionControlService', () => {
  let service: VersionControlService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new VersionControlService(mockPrisma as any);
  });

  // ── createVersion ─────────────────────────────────────────────────
  describe('createVersion', () => {
    it('should create initial version on empty history', async () => {
      mockPrisma.templateVersion.findMany.mockResolvedValue([]);
      mockPrisma.templateVersion.create.mockResolvedValue({});

      const result = await service.createVersion('t1', { title: 'Hello' }, 'user1', 'Initial');

      expect(result.version).toBe(1);
      expect(result.templateId).toBe('t1');
      expect(result.branchName).toBe('main');
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].type).toBe('add');
      expect(mockPrisma.templateVersion.create).toHaveBeenCalledTimes(1);
    });

    it('should increment version number', async () => {
      mockPrisma.templateVersion.findMany.mockResolvedValue([
        {
          id: 'v1', templateId: 't1', version: 1, branchName: 'main',
          content: { title: 'Old' }, contentHash: 'h1', changes: [],
          createdBy: 'user1', createdAt: new Date(), message: 'v1',
          parentVersionId: null, tags: [], size: 10,
        },
      ]);
      mockPrisma.templateVersion.create.mockResolvedValue({});

      const result = await service.createVersion('t1', { title: 'New' }, 'user1', 'Update title');
      expect(result.version).toBe(2);
    });

    it('should compute changes between versions', async () => {
      mockPrisma.templateVersion.findMany.mockResolvedValue([
        {
          id: 'v1', templateId: 't1', version: 1, branchName: 'main',
          content: { title: 'Old', body: 'text' }, contentHash: 'h1', changes: [],
          createdBy: 'user1', createdAt: new Date(), message: 'v1',
          parentVersionId: null, tags: [], size: 20,
        },
      ]);
      mockPrisma.templateVersion.create.mockResolvedValue({});

      const result = await service.createVersion('t1', { title: 'New', extra: true }, 'user1', 'changes');
      const changeTypes = result.changes.map(c => c.type);
      expect(changeTypes).toContain('modify');  // title changed
      expect(changeTypes).toContain('delete');  // body removed
      expect(changeTypes).toContain('add');     // extra added
    });
  });

  // ── getVersion ────────────────────────────────────────────────────
  describe('getVersion', () => {
    it('should return null when version not found', async () => {
      mockPrisma.templateVersion.findMany.mockResolvedValue([]);
      mockPrisma.templateVersion.findFirst.mockResolvedValue(null);

      // Need to call getVersionHistory first to avoid cache issues
      const result = await service.getVersion('t1', 99);
      expect(result).toBeNull();
    });

    it('should return version from DB', async () => {
      mockPrisma.templateVersion.findFirst.mockResolvedValue({
        id: 'v1', templateId: 't1', version: 1, branchName: 'main',
        content: { title: 'Hello' }, contentHash: 'h', changes: [],
        createdBy: 'u1', createdAt: new Date(), message: 'init',
        parentVersionId: null, tags: ['release'], size: 15,
      });

      const result = await service.getVersion('t1', 1);
      expect(result).not.toBeNull();
      expect(result.version).toBe(1);
      expect(result.tags).toContain('release');
    });
  });

  // ── getVersionHistory ─────────────────────────────────────────────
  describe('getVersionHistory', () => {
    it('should return empty history', async () => {
      mockPrisma.templateVersion.findMany.mockResolvedValue([]);
      const result = await service.getVersionHistory('t1');
      expect(result.versions).toHaveLength(0);
      expect(result.totalVersions).toBe(0);
      expect(result.currentVersion).toBe(0);
    });

    it('should build branch info correctly', async () => {
      const now = new Date();
      mockPrisma.templateVersion.findMany.mockResolvedValue([
        {
          id: 'v2', templateId: 't1', version: 2, branchName: 'main',
          content: {}, contentHash: 'h', changes: [],
          createdBy: 'u1', createdAt: now, message: 'v2',
          parentVersionId: 'v1', tags: [], size: 10,
        },
        {
          id: 'v1', templateId: 't1', version: 1, branchName: 'main',
          content: {}, contentHash: 'h', changes: [],
          createdBy: 'u1', createdAt: new Date(now.getTime() - 1000), message: 'v1',
          parentVersionId: null, tags: [], size: 10,
        },
      ]);

      const result = await service.getVersionHistory('t1');
      expect(result.totalVersions).toBe(2);
      expect(result.currentVersion).toBe(2);
      expect(result.branches).toHaveLength(1);
      expect(result.branches[0].name).toBe('main');
      expect(result.branches[0].isDefault).toBe(true);
    });
  });

  // ── diffVersions ──────────────────────────────────────────────────
  describe('diffVersions', () => {
    it('should throw when a version is not found', async () => {
      mockPrisma.templateVersion.findFirst.mockResolvedValue(null);
      mockPrisma.templateVersion.findMany.mockResolvedValue([]);
      await expect(service.diffVersions('t1', 1, 2)).rejects.toThrow('Version not found');
    });

    it('should compute diff between two versions', async () => {
      // Seed versions into cache via getVersionHistory
      mockPrisma.templateVersion.findMany.mockResolvedValue([
        {
          id: 'v1', templateId: 't1', version: 1, branchName: 'main',
          content: { a: 1 }, contentHash: 'h1', changes: [],
          createdBy: 'u1', createdAt: new Date(), message: 'v1',
          parentVersionId: null, tags: [], size: 5,
        },
        {
          id: 'v2', templateId: 't1', version: 2, branchName: 'main',
          content: { a: 2, b: 'new' }, contentHash: 'h2', changes: [],
          createdBy: 'u1', createdAt: new Date(), message: 'v2',
          parentVersionId: 'v1', tags: [], size: 10,
        },
      ]);
      await service.getVersionHistory('t1');

      const diff = await service.diffVersions('t1', 1, 2);
      expect(diff.summary.totalChanges).toBeGreaterThan(0);
      expect(diff.summary.additions).toBeGreaterThanOrEqual(1);  // b added
      expect(diff.summary.modifications).toBeGreaterThanOrEqual(1);  // a modified
    });
  });

  // ── createBranch ──────────────────────────────────────────────────
  describe('createBranch', () => {
    it('should throw when branch already exists', async () => {
      mockPrisma.templateVersion.findMany.mockResolvedValue([
        {
          id: 'v1', templateId: 't1', version: 1, branchName: 'main',
          content: { a: 1 }, contentHash: 'h', changes: [],
          createdBy: 'u1', createdAt: new Date(), message: 'init',
          parentVersionId: null, tags: [], size: 5,
        },
        {
          id: 'v2', templateId: 't1', version: 1, branchName: 'feature',
          content: { a: 1 }, contentHash: 'h', changes: [],
          createdBy: 'u1', createdAt: new Date(), message: 'branch',
          parentVersionId: null, tags: [], size: 5,
        },
      ]);

      await expect(service.createBranch('t1', 'feature', 'u1')).rejects.toThrow('already exists');
    });

    it('should create a new branch from main', async () => {
      mockPrisma.templateVersion.findMany.mockResolvedValue([
        {
          id: 'v1', templateId: 't1', version: 1, branchName: 'main',
          content: { title: 'Hello' }, contentHash: 'h', changes: [],
          createdBy: 'u1', createdAt: new Date(), message: 'init',
          parentVersionId: null, tags: [], size: 10,
        },
      ]);
      mockPrisma.templateVersion.create.mockResolvedValue({});

      const branch = await service.createBranch('t1', 'dev', 'u1');
      expect(branch.name).toBe('dev');
      expect(branch.isDefault).toBe(false);
    });
  });

  // ── tagVersion ────────────────────────────────────────────────────
  describe('tagVersion', () => {
    it('should throw when version not found', async () => {
      mockPrisma.templateVersion.findMany.mockResolvedValue([]);
      mockPrisma.templateVersion.findFirst.mockResolvedValue(null);
      await expect(service.tagVersion('t1', 99, 'release')).rejects.toThrow('not found');
    });

    it('should add tag to version', async () => {
      // Seed cache
      mockPrisma.templateVersion.findMany.mockResolvedValue([
        {
          id: 'v1', templateId: 't1', version: 1, branchName: 'main',
          content: {}, contentHash: 'h', changes: [],
          createdBy: 'u1', createdAt: new Date(), message: 'init',
          parentVersionId: null, tags: [], size: 5,
        },
      ]);
      await service.getVersionHistory('t1');
      mockPrisma.templateVersion.update.mockResolvedValue({});

      await service.tagVersion('t1', 1, 'v1.0');
      expect(mockPrisma.templateVersion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { tags: ['v1.0'] },
        }),
      );
    });
  });

  // ── getVersionByTag ───────────────────────────────────────────────
  describe('getVersionByTag', () => {
    it('should return null when tag not found', async () => {
      mockPrisma.templateVersion.findFirst.mockResolvedValue(null);
      const result = await service.getVersionByTag('t1', 'nonexistent');
      expect(result).toBeNull();
    });

    it('should return version by tag', async () => {
      mockPrisma.templateVersion.findFirst.mockResolvedValue({
        id: 'v1', templateId: 't1', version: 1, branchName: 'main',
        content: { x: 1 }, contentHash: 'h', changes: [],
        createdBy: 'u1', createdAt: new Date(), message: 'init',
        parentVersionId: null, tags: ['release'], size: 5,
      });

      const result = await service.getVersionByTag('t1', 'release');
      expect(result).not.toBeNull();
      expect(result.tags).toContain('release');
    });
  });
});
