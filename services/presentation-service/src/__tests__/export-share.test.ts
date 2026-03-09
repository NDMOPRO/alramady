// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

/* ───── Mocks ─────────────────────────────────────────────────────── */

const mockExistsSync = jest.fn().mockReturnValue(true);
const mockMkdirSync = jest.fn();
const mockStatSync = jest.fn().mockReturnValue({ size: 5000 });
const mockUnlinkSync = jest.fn();
const mockReadFileSync = jest.fn().mockReturnValue(Buffer.from('image'));
const mockCreateWriteStream = jest.fn().mockReturnValue({
  on: jest.fn((event, cb) => { if (event === 'finish') setTimeout(cb, 0); }),
  pipe: jest.fn(),
});

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  statSync: jest.fn().mockReturnValue({ size: 5000 }),
  unlinkSync: jest.fn(),
  readFileSync: jest.fn().mockReturnValue(Buffer.from('image')),
  createWriteStream: jest.fn().mockReturnValue({
    on: jest.fn((event, cb) => { if (event === 'finish') setTimeout(cb, 0); }),
    pipe: jest.fn(),
  }),
  default: {
    existsSync: jest.fn().mockReturnValue(true),
    mkdirSync: jest.fn(),
    statSync: jest.fn().mockReturnValue({ size: 5000 }),
    unlinkSync: jest.fn(),
    readFileSync: jest.fn().mockReturnValue(Buffer.from('image')),
    createWriteStream: jest.fn().mockReturnValue({
      on: jest.fn((event, cb) => { if (event === 'finish') setTimeout(cb, 0); }),
      pipe: jest.fn(),
    }),
  },
}));

const mockAddSlide = jest.fn().mockReturnValue({
  addText: jest.fn(),
  addShape: jest.fn(),
  addImage: jest.fn(),
  addTable: jest.fn(),
  addNotes: jest.fn(),
  background: null,
});
const mockWriteFile = jest.fn().mockResolvedValue(undefined);

jest.mock('pptxgenjs', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    title: '',
    subject: '',
    author: '',
    rtlMode: false,
    layout: '',
    addSlide: jest.fn().mockReturnValue({
      addText: jest.fn(),
      addShape: jest.fn(),
      addImage: jest.fn(),
      addTable: jest.fn(),
      addNotes: jest.fn(),
      background: null,
    }),
    writeFile: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('pdfkit', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => {
    const fakeDoc = {
      pipe: jest.fn(),
      addPage: jest.fn().mockReturnThis(),
      rect: jest.fn().mockReturnThis(),
      fill: jest.fn().mockReturnThis(),
      fontSize: jest.fn().mockReturnThis(),
      fillColor: jest.fn().mockReturnThis(),
      text: jest.fn().mockReturnThis(),
      save: jest.fn().mockReturnThis(),
      restore: jest.fn().mockReturnThis(),
      ellipse: jest.fn().mockReturnThis(),
      roundedRect: jest.fn().mockReturnThis(),
      lineWidth: jest.fn().mockReturnThis(),
      fillAndStroke: jest.fn().mockReturnThis(),
      stroke: jest.fn().mockReturnThis(),
      image: jest.fn().mockReturnThis(),
      end: jest.fn(),
    };
    return fakeDoc;
  }),
}));

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('export-uuid-1234'),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockPresentationFindUnique = jest.fn();
const mockExportShareCreate = jest.fn();
const mockExportShareFindUnique = jest.fn();
const mockExportShareFindMany = jest.fn();
const mockExportShareDelete = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    presentation: { findUnique: mockPresentationFindUnique },
    presentationExportShare: {
      create: mockExportShareCreate,
      findUnique: mockExportShareFindUnique,
      findMany: mockExportShareFindMany,
      delete: mockExportShareDelete,
    },
  })),
}));

import { ExportShareService } from '../services/export-share.service.js';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

/* ───── Tests ─────────────────────────────────────────────────────── */

describe('ExportShareService', () => {
  let service: InstanceType<typeof ExportShareService>;
  const prisma = new PrismaClient();

  const samplePresentation = {
    id: 'pres-1',
    title: 'My Presentation',
    userId: 'user-1',
    theme: {},
    slides: [
      {
        id: 'slide-1',
        order: 1,
        title: 'Slide 1',
        backgroundColor: '#FFFFFF',
        elements: [
          {
            id: 'el-1',
            type: 'text',
            x: 96,
            y: 96,
            width: 480,
            height: 96,
            content: 'Hello World',
            style: { fontSize: 24, color: '#000000' },
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as any).mockReturnValue(true);
    (fs.statSync as any).mockReturnValue({ size: 5000 });
    service = new ExportShareService(prisma);
  });

  describe('generateExport', () => {
    it('should generate a PPTX export and return result', async () => {
      mockPresentationFindUnique.mockResolvedValue(samplePresentation);
      mockExportShareCreate.mockResolvedValue({ id: 'export-uuid-1234' });

      const result = await service.generateExport('pres-1', 'pptx', 'user-1');

      expect(result.id).toBe('export-uuid-1234');
      expect(result.format).toBe('pptx');
      expect(result.sizeBytes).toBe(5000);
      expect(result.downloadUrl).toContain('export-uuid-1234');
    });

    it('should throw when presentation is not found', async () => {
      mockPresentationFindUnique.mockResolvedValue(null);
      await expect(service.generateExport('missing', 'pptx', 'user-1'))
        .rejects.toThrow('Presentation not found');
    });

    it('should throw when user does not own the presentation', async () => {
      mockPresentationFindUnique.mockResolvedValue({ ...samplePresentation, userId: 'other-user' });
      await expect(service.generateExport('pres-1', 'pptx', 'user-1'))
        .rejects.toThrow('Access denied');
    });

    it('should throw when export file is too small (corrupt)', async () => {
      mockPresentationFindUnique.mockResolvedValue(samplePresentation);
      (fs.statSync as any).mockReturnValue({ size: 10 });

      await expect(service.generateExport('pres-1', 'pptx', 'user-1'))
        .rejects.toThrow('too small');
    });
  });

  describe('getDownloadUrl', () => {
    it('should return download info for a valid export', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      mockExportShareFindUnique.mockResolvedValue({
        id: 'exp-1',
        userId: 'user-1',
        filePath: '/exports/file.pptx',
        fileName: 'file.pptx',
        exportFormat: 'pptx',
        expiresAt: futureDate,
      });

      const result = await service.getDownloadUrl('exp-1', 'user-1');

      expect(result.exportId).toBe('exp-1');
      expect(result.contentType).toContain('presentationml');
    });

    it('should throw when export is not found', async () => {
      mockExportShareFindUnique.mockResolvedValue(null);
      await expect(service.getDownloadUrl('missing', 'user-1'))
        .rejects.toThrow('Export not found');
    });

    it('should throw when user does not own the export', async () => {
      mockExportShareFindUnique.mockResolvedValue({
        id: 'exp-2',
        userId: 'other-user',
      });
      await expect(service.getDownloadUrl('exp-2', 'user-1'))
        .rejects.toThrow('Access denied');
    });

    it('should throw when export has expired', async () => {
      const pastDate = new Date(Date.now() - 86400000);
      mockExportShareFindUnique.mockResolvedValue({
        id: 'exp-3',
        userId: 'user-1',
        filePath: '/exports/old.pptx',
        exportFormat: 'pptx',
        expiresAt: pastDate,
      });

      await expect(service.getDownloadUrl('exp-3', 'user-1'))
        .rejects.toThrow('expired');
    });
  });

  describe('cleanupExpired', () => {
    it('should delete expired files and records', async () => {
      mockExportShareFindMany.mockResolvedValue([
        { id: 'old-1', filePath: '/exports/old1.pptx' },
        { id: 'old-2', filePath: '/exports/old2.pdf' },
      ]);
      mockExportShareDelete.mockResolvedValue({});

      const result = await service.cleanupExpired();

      expect(result.deletedCount).toBe(2);
      expect(result.freedBytes).toBe(10000);
      expect((fs.unlinkSync as any)).toHaveBeenCalledTimes(2);
      expect(mockExportShareDelete).toHaveBeenCalledTimes(2);
    });
  });
});
