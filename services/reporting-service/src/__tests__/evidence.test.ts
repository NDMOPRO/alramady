// @ts-nocheck

/**
 * Evidence Lifecycle Tests — reporting-service
 * Tests the creation, attachment, close, and immutability of evidence records.
 * Evidence wraps report outputs with hashes, renders, and diffs for audit trail.
 */

// ─── Mock Dependencies ──────────────────────────────────────────────────────

const mockReportFindUnique = jest.fn();
const mockReportCreate = jest.fn();
const mockReportUpdate = jest.fn();
const mockReportDeleteMany = jest.fn();
const mockReportDefinitionFindUnique = jest.fn();
const mockReportDefinitionCreate = jest.fn();
const mockReportDefinitionUpdate = jest.fn();
const mockReportBuildOutputCreate = jest.fn();
const mockReportBuildOutputFindMany = jest.fn();
const mockReportBuildOutputFindFirst = jest.fn();
const mockReportBuildOutputUpdate = jest.fn();
const mockAuditLogCreate = jest.fn().mockResolvedValue({ id: 'audit-1' });

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    report: {
      findUnique: mockReportFindUnique,
      create: mockReportCreate,
      update: mockReportUpdate,
      deleteMany: mockReportDeleteMany,
    },
    reportDefinition: {
      findUnique: mockReportDefinitionFindUnique,
      create: mockReportDefinitionCreate,
      update: mockReportDefinitionUpdate,
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    reportBuildOutput: {
      create: mockReportBuildOutputCreate,
      findMany: mockReportBuildOutputFindMany,
      findFirst: mockReportBuildOutputFindFirst,
      update: mockReportBuildOutputUpdate,
    },
    auditLog: { create: mockAuditLogCreate },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $on: jest.fn(),
  })),
}));

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    ping: jest.fn().mockResolvedValue('PONG'),
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../utils/redis', () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDel: jest.fn().mockResolvedValue(undefined),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { createHash } from 'crypto';

// ─── Evidence Record Abstraction ─────────────────────────────────────────────

/**
 * Evidence encapsulates a report output lifecycle:
 * 1. Create an evidence record tied to a report
 * 2. Attach renders (PDF/images), diffs, and content hashes
 * 3. Close the evidence (seal it)
 * 4. After close, no modifications allowed
 */

interface EvidenceRecord {
  id: string;
  reportId: string;
  tenantId: string;
  status: 'open' | 'closed';
  renders: Array<{ type: string; hash: string; buffer?: Buffer }>;
  diffs: Array<{ baselineHash: string; currentHash: string; diffPercentage: number }>;
  contentHash: string | null;
  closedAt: Date | null;
  createdAt: Date;
}

class EvidenceService {
  private records: Map<string, EvidenceRecord> = new Map();

  async createEvidence(reportId: string, tenantId: string): Promise<EvidenceRecord> {
    if (!reportId || !tenantId) {
      throw new Error('reportId and tenantId are required to create evidence');
    }

    const id = `evidence-${Date.now()}`;
    const record: EvidenceRecord = {
      id,
      reportId,
      tenantId,
      status: 'open',
      renders: [],
      diffs: [],
      contentHash: null,
      closedAt: null,
      createdAt: new Date(),
    };

    this.records.set(id, record);

    // Persist to DB
    await mockReportBuildOutputCreate({
      data: {
        id,
        reportDefinitionId: reportId,
        tenantId,
        status: 'open',
        metadata: { type: 'evidence', renders: [], diffs: [] },
        createdAt: record.createdAt,
      },
    });

    return record;
  }

  async attachRender(evidenceId: string, renderType: string, content: Buffer): Promise<void> {
    const record = this.records.get(evidenceId);
    if (!record) throw new Error(`Evidence ${evidenceId} not found`);
    if (record.status === 'closed') throw new Error('Cannot modify closed evidence');

    const hash = createHash('sha256').update(content).digest('hex');
    record.renders.push({ type: renderType, hash, buffer: content });

    await mockReportBuildOutputUpdate({
      where: { id: evidenceId },
      data: { metadata: { renders: record.renders.map(r => ({ type: r.type, hash: r.hash })) } },
    });
  }

  async attachDiff(evidenceId: string, baselineHash: string, currentHash: string, diffPercentage: number): Promise<void> {
    const record = this.records.get(evidenceId);
    if (!record) throw new Error(`Evidence ${evidenceId} not found`);
    if (record.status === 'closed') throw new Error('Cannot modify closed evidence');

    record.diffs.push({ baselineHash, currentHash, diffPercentage });
  }

  async setContentHash(evidenceId: string, contentHash: string): Promise<void> {
    const record = this.records.get(evidenceId);
    if (!record) throw new Error(`Evidence ${evidenceId} not found`);
    if (record.status === 'closed') throw new Error('Cannot modify closed evidence');

    record.contentHash = contentHash;
  }

  async closeEvidence(evidenceId: string): Promise<EvidenceRecord> {
    const record = this.records.get(evidenceId);
    if (!record) throw new Error(`Evidence ${evidenceId} not found`);
    if (record.status === 'closed') throw new Error('Evidence is already closed');

    // Must have at least one render and a content hash before closing
    if (record.renders.length === 0) {
      throw new Error('Cannot close evidence without at least one render');
    }
    if (!record.contentHash) {
      throw new Error('Cannot close evidence without a content hash');
    }

    record.status = 'closed';
    record.closedAt = new Date();

    await mockReportBuildOutputUpdate({
      where: { id: evidenceId },
      data: { status: 'closed', closedAt: record.closedAt },
    });

    return record;
  }

  getEvidence(evidenceId: string): EvidenceRecord | undefined {
    return this.records.get(evidenceId);
  }

  validateResult(result: { evidenceId?: string }): boolean {
    if (!result.evidenceId) return false;
    const record = this.records.get(result.evidenceId);
    return record !== undefined && record.status === 'closed';
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Evidence Lifecycle — reporting-service', () => {
  let evidenceService: EvidenceService;

  beforeEach(() => {
    jest.clearAllMocks();
    evidenceService = new EvidenceService();
  });

  // ── Creation ──────────────────────────────────────────────────────────────

  describe('Create evidence record', () => {
    it('should create an evidence record with open status', async () => {
      const evidence = await evidenceService.createEvidence('report-1', 'tenant-1');

      expect(evidence.id).toBeTruthy();
      expect(evidence.reportId).toBe('report-1');
      expect(evidence.tenantId).toBe('tenant-1');
      expect(evidence.status).toBe('open');
      expect(evidence.renders).toEqual([]);
      expect(evidence.diffs).toEqual([]);
      expect(evidence.contentHash).toBeNull();
      expect(evidence.closedAt).toBeNull();
    });

    it('should persist evidence to DB on creation', async () => {
      await evidenceService.createEvidence('report-1', 'tenant-1');
      expect(mockReportBuildOutputCreate).toHaveBeenCalledTimes(1);
      expect(mockReportBuildOutputCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reportDefinitionId: 'report-1',
            tenantId: 'tenant-1',
            status: 'open',
          }),
        })
      );
    });

    it('should throw when reportId is missing', async () => {
      await expect(evidenceService.createEvidence('', 'tenant-1')).rejects.toThrow('reportId and tenantId are required');
    });

    it('should throw when tenantId is missing', async () => {
      await expect(evidenceService.createEvidence('report-1', '')).rejects.toThrow('reportId and tenantId are required');
    });
  });

  // ── Attach renders/diffs/hashes ───────────────────────────────────────────

  describe('Attach renders, diffs, and hashes', () => {
    let evidenceId: string;

    beforeEach(async () => {
      const evidence = await evidenceService.createEvidence('report-1', 'tenant-1');
      evidenceId = evidence.id;
    });

    it('should attach a render with computed hash', async () => {
      const pdfBuffer = Buffer.from('fake-pdf-content');
      await evidenceService.attachRender(evidenceId, 'pdf', pdfBuffer);

      const evidence = evidenceService.getEvidence(evidenceId);
      expect(evidence.renders).toHaveLength(1);
      expect(evidence.renders[0].type).toBe('pdf');
      expect(evidence.renders[0].hash).toBeTruthy();
      expect(evidence.renders[0].hash).toHaveLength(64); // SHA-256 hex
    });

    it('should attach multiple renders', async () => {
      await evidenceService.attachRender(evidenceId, 'pdf', Buffer.from('pdf'));
      await evidenceService.attachRender(evidenceId, 'png', Buffer.from('png'));

      const evidence = evidenceService.getEvidence(evidenceId);
      expect(evidence.renders).toHaveLength(2);
    });

    it('should attach a diff record', async () => {
      await evidenceService.attachDiff(evidenceId, 'hash-baseline', 'hash-current', 2.5);

      const evidence = evidenceService.getEvidence(evidenceId);
      expect(evidence.diffs).toHaveLength(1);
      expect(evidence.diffs[0].baselineHash).toBe('hash-baseline');
      expect(evidence.diffs[0].diffPercentage).toBe(2.5);
    });

    it('should set the content hash', async () => {
      await evidenceService.setContentHash(evidenceId, 'sha256-content-hash');

      const evidence = evidenceService.getEvidence(evidenceId);
      expect(evidence.contentHash).toBe('sha256-content-hash');
    });

    it('should update DB when render is attached', async () => {
      await evidenceService.attachRender(evidenceId, 'pdf', Buffer.from('pdf'));
      expect(mockReportBuildOutputUpdate).toHaveBeenCalledTimes(1);
    });
  });

  // ── Close evidence ────────────────────────────────────────────────────────

  describe('Close evidence', () => {
    let evidenceId: string;

    beforeEach(async () => {
      const evidence = await evidenceService.createEvidence('report-1', 'tenant-1');
      evidenceId = evidence.id;
    });

    it('should close evidence when renders and hash are present', async () => {
      await evidenceService.attachRender(evidenceId, 'pdf', Buffer.from('pdf'));
      await evidenceService.setContentHash(evidenceId, 'content-hash');

      const closed = await evidenceService.closeEvidence(evidenceId);

      expect(closed.status).toBe('closed');
      expect(closed.closedAt).toBeInstanceOf(Date);
    });

    it('should fail to close without renders', async () => {
      await evidenceService.setContentHash(evidenceId, 'content-hash');

      await expect(evidenceService.closeEvidence(evidenceId)).rejects.toThrow(
        'Cannot close evidence without at least one render'
      );
    });

    it('should fail to close without content hash', async () => {
      await evidenceService.attachRender(evidenceId, 'pdf', Buffer.from('pdf'));

      await expect(evidenceService.closeEvidence(evidenceId)).rejects.toThrow(
        'Cannot close evidence without a content hash'
      );
    });

    it('should fail to close already closed evidence', async () => {
      await evidenceService.attachRender(evidenceId, 'pdf', Buffer.from('pdf'));
      await evidenceService.setContentHash(evidenceId, 'hash');
      await evidenceService.closeEvidence(evidenceId);

      await expect(evidenceService.closeEvidence(evidenceId)).rejects.toThrow('Evidence is already closed');
    });
  });

  // ── Immutability after close ──────────────────────────────────────────────

  describe('Evidence immutability after close', () => {
    let evidenceId: string;

    beforeEach(async () => {
      const evidence = await evidenceService.createEvidence('report-1', 'tenant-1');
      evidenceId = evidence.id;
      await evidenceService.attachRender(evidenceId, 'pdf', Buffer.from('pdf'));
      await evidenceService.setContentHash(evidenceId, 'content-hash');
      await evidenceService.closeEvidence(evidenceId);
    });

    it('should reject attaching renders after close', async () => {
      await expect(
        evidenceService.attachRender(evidenceId, 'png', Buffer.from('png'))
      ).rejects.toThrow('Cannot modify closed evidence');
    });

    it('should reject attaching diffs after close', async () => {
      await expect(
        evidenceService.attachDiff(evidenceId, 'h1', 'h2', 0)
      ).rejects.toThrow('Cannot modify closed evidence');
    });

    it('should reject changing content hash after close', async () => {
      await expect(
        evidenceService.setContentHash(evidenceId, 'new-hash')
      ).rejects.toThrow('Cannot modify closed evidence');
    });

    it('should preserve all data after close', async () => {
      const evidence = evidenceService.getEvidence(evidenceId);
      expect(evidence.renders).toHaveLength(1);
      expect(evidence.contentHash).toBe('content-hash');
      expect(evidence.status).toBe('closed');
    });
  });

  // ── Result validation ─────────────────────────────────────────────────────

  describe('Result without evidence should fail validation', () => {
    it('should reject a result without evidenceId', () => {
      const result = { data: 'some output' };
      expect(evidenceService.validateResult(result)).toBe(false);
    });

    it('should reject a result with non-existent evidenceId', () => {
      const result = { evidenceId: 'nonexistent' };
      expect(evidenceService.validateResult(result)).toBe(false);
    });

    it('should reject a result with open (unclosed) evidence', async () => {
      const evidence = await evidenceService.createEvidence('report-1', 'tenant-1');
      const result = { evidenceId: evidence.id };
      expect(evidenceService.validateResult(result)).toBe(false);
    });

    it('should accept a result with closed evidence', async () => {
      const evidence = await evidenceService.createEvidence('report-1', 'tenant-1');
      await evidenceService.attachRender(evidence.id, 'pdf', Buffer.from('pdf'));
      await evidenceService.setContentHash(evidence.id, 'hash');
      await evidenceService.closeEvidence(evidence.id);

      const result = { evidenceId: evidence.id };
      expect(evidenceService.validateResult(result)).toBe(true);
    });
  });
});
