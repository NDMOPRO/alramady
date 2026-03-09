// @ts-nocheck

/* ───── Mocks ─────────────────────────────────────────────────────── */

// Mock minio
const mockPutObject = jest.fn().mockResolvedValue({});
const mockRemoveObject = jest.fn().mockResolvedValue({});
const mockPresignedGetObject = jest.fn().mockResolvedValue('https://minio.local/presigned-url');
const mockBucketExists = jest.fn().mockResolvedValue(true);
const mockMakeBucket = jest.fn().mockResolvedValue({});

jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => ({
    putObject: mockPutObject,
    removeObject: mockRemoveObject,
    presignedGetObject: mockPresignedGetObject,
    bucketExists: mockBucketExists,
    makeBucket: mockMakeBucket,
  })),
}));

// Mock sharp
const mockSharpInstance = {
  resize: jest.fn().mockReturnThis(),
  png: jest.fn().mockReturnThis(),
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('thumb-data')),
  metadata: jest.fn().mockResolvedValue({ width: 200, height: 200, format: 'png' }),
};
jest.mock('sharp', () => ({
  __esModule: true,
  default: jest.fn(() => mockSharpInstance),
}));

// file-type is mocked via moduleNameMapper -> src/__mocks__/file-type.ts

// Mock mime-types
jest.mock('mime-types', () => ({
  __esModule: true,
  default: { lookup: jest.fn().mockReturnValue('application/octet-stream') },
}));

// Mock Prisma
const mockCreate = jest.fn();
const mockFindUnique = jest.fn();
const mockFindMany = jest.fn();
const mockCount = jest.fn();
const mockUpdate = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    libraryAsset: {
      create: mockCreate,
      findUnique: mockFindUnique,
      findMany: mockFindMany,
      count: mockCount,
      update: mockUpdate,
    },
    folder: {
      findUnique: jest.fn(),
    },
  })),
}));

// Mock winston
jest.mock('winston', () => ({
  __esModule: true,
  default: {
    createLogger: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
    format: {
      combine: jest.fn(),
      timestamp: jest.fn(),
      json: jest.fn(),
    },
    transports: { Console: jest.fn() },
  },
}));

/* ───── Import SUT ────────────────────────────────────────────────── */

import {
  uploadAsset,
  getAsset,
  deleteAsset,
  listAssets,
  searchAssets,
  generateThumbnail,
  moveAsset,
} from '../services/asset-manager.service';

/* ───── Tests ─────────────────────────────────────────────────────── */

describe('AssetManagerService', () => {
  const tenantId = 'tenant-001';
  const userId = 'user-001';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── uploadAsset ─────────────────────────────────────────────────

  describe('uploadAsset', () => {
    it('should upload a file and return the asset record', async () => {
      const file = Buffer.from('image-data');
      const now = new Date();
      mockCreate.mockResolvedValue({
        id: 'uuid-1',
        name: 'photo.png',
        description: 'A photo',
        tags: ['nature'],
        mimeType: 'image/png',
        extension: 'png',
        fileSize: file.length,
        checksum: 'abc123',
        createdAt: now,
      });

      const result = await uploadAsset(
        file,
        'photo.png',
        { description: 'A photo', tags: ['nature'] },
        tenantId,
        userId,
      );

      expect(result).toHaveProperty('id', 'uuid-1');
      expect(result).toHaveProperty('name', 'photo.png');
      expect(result).toHaveProperty('mimeType', 'image/png');
      expect(mockPutObject).toHaveBeenCalled();
      expect(mockCreate).toHaveBeenCalled();
    });

    it('should generate a thumbnail for image files', async () => {
      const file = Buffer.from('image-data');
      mockCreate.mockResolvedValue({
        id: 'uuid-2',
        name: 'banner.png',
        description: null,
        tags: [],
        mimeType: 'image/png',
        extension: 'png',
        fileSize: file.length,
        checksum: 'def456',
        createdAt: new Date(),
      });

      const result = await uploadAsset(file, 'banner.png', {}, tenantId, userId);

      expect(result.hasThumbnail).toBe(true);
      // putObject called twice: once for main file, once for thumbnail
      expect(mockPutObject).toHaveBeenCalledTimes(2);
    });
  });

  // ── getAsset ────────────────────────────────────────────────────

  describe('getAsset', () => {
    it('should return asset with presigned download URL', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'asset-1',
        name: 'report.pdf',
        description: 'Report',
        tags: [],
        mimeType: 'application/pdf',
        extension: 'pdf',
        fileSize: 2048,
        checksum: 'hash1',
        folderId: null,
        storageKey: 'tenant-001/report.pdf',
        thumbnailKey: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        tenantId,
        userId,
        deletedAt: null,
      });

      const result = await getAsset('asset-1');

      expect(result.id).toBe('asset-1');
      expect(result.downloadUrl).toBe('https://minio.local/presigned-url');
      expect(result.thumbnailUrl).toBeNull();
      expect(mockPresignedGetObject).toHaveBeenCalledTimes(1);
    });

    it('should throw when asset is not found', async () => {
      mockFindUnique.mockResolvedValue(null);
      await expect(getAsset('nonexistent')).rejects.toThrow('Asset not found');
    });

    it('should throw when asset has been deleted', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'asset-del',
        deletedAt: new Date(),
      });
      await expect(getAsset('asset-del')).rejects.toThrow('Asset has been deleted');
    });
  });

  // ── deleteAsset ─────────────────────────────────────────────────

  describe('deleteAsset', () => {
    it('should soft-delete the asset and remove objects from storage', async () => {
      const deletedAt = new Date();
      mockFindUnique.mockResolvedValue({
        id: 'asset-3',
        name: 'old.png',
        storageKey: 'tenant-001/old.png',
        thumbnailKey: 'tenant-001/thumb-old.png',
        deletedAt: null,
      });
      mockUpdate.mockResolvedValue({
        id: 'asset-3',
        name: 'old.png',
        deletedAt,
        deletedBy: userId,
      });

      const result = await deleteAsset('asset-3', userId);

      expect(result.message).toBe('Asset successfully deleted');
      expect(mockRemoveObject).toHaveBeenCalledTimes(2);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('should throw when trying to delete an already-deleted asset', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'asset-4',
        deletedAt: new Date(),
      });
      await expect(deleteAsset('asset-4', userId)).rejects.toThrow('Asset already deleted');
    });
  });

  // ── listAssets ──────────────────────────────────────────────────

  describe('listAssets', () => {
    it('should return paginated results', async () => {
      const assets = [
        { id: 'a1', name: 'file1.png', tags: [], mimeType: 'image/png', fileSize: 100, createdAt: new Date() },
        { id: 'a2', name: 'file2.pdf', tags: [], mimeType: 'application/pdf', fileSize: 200, createdAt: new Date() },
      ];
      mockFindMany.mockResolvedValue(assets);
      mockCount.mockResolvedValue(12);

      const result = await listAssets(tenantId, {}, { page: 1, limit: 10 });

      expect(result.data).toHaveLength(2);
      expect(result.pagination.totalCount).toBe(12);
      expect(result.pagination.totalPages).toBe(2);
      expect(result.pagination.hasNextPage).toBe(true);
    });
  });

  // ── searchAssets ────────────────────────────────────────────────

  describe('searchAssets', () => {
    it('should return scored and sorted results', async () => {
      mockFindMany.mockResolvedValue([
        { id: 's1', name: 'logo', description: null, tags: ['logo'], mimeType: 'image/png', createdAt: new Date() },
        { id: 's2', name: 'brand-logo-v2', description: 'The updated logo', tags: [], mimeType: 'image/svg+xml', createdAt: new Date() },
      ]);

      const result = await searchAssets('logo', tenantId);

      expect(result.totalResults).toBe(2);
      // Exact name match should rank higher
      expect(result.results[0].id).toBe('s1');
      expect(result.results[0].relevanceScore).toBeGreaterThan(result.results[1].relevanceScore);
    });

    it('should throw on empty search query', async () => {
      await expect(searchAssets('', tenantId)).rejects.toThrow('Search query cannot be empty');
    });
  });

  // ── generateThumbnail ──────────────────────────────────────────

  describe('generateThumbnail', () => {
    it('should generate a thumbnail buffer of the requested size', async () => {
      const file = Buffer.from('image-bytes');
      const thumb = await generateThumbnail(file, 200);

      expect(Buffer.isBuffer(thumb)).toBe(true);
      expect(mockSharpInstance.resize).toHaveBeenCalledWith(200, 200, expect.any(Object));
      expect(mockSharpInstance.png).toHaveBeenCalled();
    });

    it('should clamp size between 32 and 1024', async () => {
      const file = Buffer.from('data');
      await generateThumbnail(file, 5);
      expect(mockSharpInstance.resize).toHaveBeenCalledWith(32, 32, expect.any(Object));

      await generateThumbnail(file, 9999);
      expect(mockSharpInstance.resize).toHaveBeenCalledWith(1024, 1024, expect.any(Object));
    });
  });
});
