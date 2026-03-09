// @ts-nocheck

/* ───── Mocks ─────────────────────────────────────────────────────── */

// Mock canvas
jest.mock('canvas', () => ({
  createCanvas: jest.fn().mockReturnValue({
    getContext: jest.fn().mockReturnValue({
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      font: '',
      textAlign: '',
      textBaseline: '',
      fillRect: jest.fn(),
      strokeRect: jest.fn(),
      fillText: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      arc: jest.fn(),
      arcTo: jest.fn(),
      closePath: jest.fn(),
      fill: jest.fn(),
      stroke: jest.fn(),
      save: jest.fn(),
      restore: jest.fn(),
      clip: jest.fn(),
      setLineDash: jest.fn(),
      measureText: jest.fn().mockReturnValue({ width: 50 }),
      createLinearGradient: jest.fn().mockReturnValue({
        addColorStop: jest.fn(),
      }),
    }),
    toBuffer: jest.fn().mockReturnValue(Buffer.from('png-data')),
  }),
}));

// Mock sharp
const mockSharpInstance = {
  resize: jest.fn().mockReturnThis(),
  jpeg: jest.fn().mockReturnThis(),
  png: jest.fn().mockReturnThis(),
  webp: jest.fn().mockReturnThis(),
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('output-data')),
  metadata: jest.fn().mockResolvedValue({ width: 800, height: 600 }),
};
jest.mock('sharp', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(() => mockSharpInstance), {
    kernel: { lanczos3: 'lanczos3' },
  }),
}));

// Mock Prisma
const mockInfographicCreate = jest.fn();
const mockInfographicFindUnique = jest.fn();
const mockInfographicUpdate = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    infographics: {
      create: mockInfographicCreate,
      findUnique: mockInfographicFindUnique,
      update: mockInfographicUpdate,
    },
  })),
}));

// Mock crypto
jest.mock('crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('infographic-uuid-001'),
}));

/* ───── Import SUT ────────────────────────────────────────────────── */

import {
  createInfographic,
  addSection,
  addStatistic,
  addTimeline,
  addComparison,
  addFlowchart,
  renderInfographic,
  exportToImage,
  exportToPDF,
} from '../services/infographic-builder.service';

/* ───── Helpers ────────────────────────────────────────────────────── */

const baseInfographicRecord = {
  id: 'infographic-uuid-001',
  name: 'Test Infographic',
  template: 'modern',
  width: 800,
  height: 1200,
  bg_color: '#FFFFFF',
  font_family: 'Arial',
  accent_color: '#2563EB',
  elements_json: '[]',
  status: 'draft',
  version: 1,
  tenant_id: 'tenant-1',
  user_id: 'user-1',
  created_at: new Date(),
  updated_at: new Date(),
};

/* ───── Tests ─────────────────────────────────────────────────────── */

describe('InfographicBuilderService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── createInfographic ──────────────────────────────────────────

  describe('createInfographic', () => {
    it('should create an infographic with validated dimensions', async () => {
      mockInfographicCreate.mockResolvedValue(baseInfographicRecord);

      const result = await createInfographic('Test Infographic', 'modern', { width: 800, height: 1200 }, 'tenant-1', 'user-1');

      expect(result.id).toBe('infographic-uuid-001');
      expect(result.template).toBe('modern');
      expect(result.status).toBe('draft');
      expect(result.dimensions).toEqual({ width: 800, height: 1200 });
      expect(mockInfographicCreate).toHaveBeenCalled();
    });

    it('should clamp dimensions within valid range', async () => {
      mockInfographicCreate.mockResolvedValue({
        ...baseInfographicRecord,
        width: 400,
        height: 400,
      });

      const result = await createInfographic('Small', 'modern', { width: 100, height: 100 }, 'tenant-1', 'user-1');

      expect(result.dimensions.width).toBeGreaterThanOrEqual(400);
      expect(result.dimensions.height).toBeGreaterThanOrEqual(400);
    });
  });

  // ── addSection ──────────────────────────────────────────────────

  describe('addSection', () => {
    it('should add a header section element', async () => {
      mockInfographicFindUnique.mockResolvedValue(baseInfographicRecord);
      mockInfographicUpdate.mockResolvedValue({ ...baseInfographicRecord, version: 2 });

      const result = await addSection('infographic-uuid-001', 'header', { text: 'Title' }, { x: 0, y: 0, w: 800, h: 100 });

      expect(result.element.type).toBe('header');
      expect(result.totalElements).toBe(1);
      expect(result.infographicVersion).toBe(2);
      expect(mockInfographicUpdate).toHaveBeenCalled();
    });

    it('should throw when infographic is not found', async () => {
      mockInfographicFindUnique.mockResolvedValue(null);

      await expect(
        addSection('nonexistent', 'text', { text: 'Hello' }, { x: 0, y: 0, w: 200, h: 50 }),
      ).rejects.toThrow('not found');
    });
  });

  // ── addStatistic ────────────────────────────────────────────────

  describe('addStatistic', () => {
    it('should add a statistic element with proper defaults', async () => {
      mockInfographicFindUnique.mockResolvedValue(baseInfographicRecord);
      mockInfographicUpdate.mockResolvedValue({ ...baseInfographicRecord, version: 2 });

      const result = await addStatistic('infographic-uuid-001', '1500+', 'Users', 'people', { x: 10, y: 10, w: 200, h: 120 });

      expect(result.element.type).toBe('statistic');
      expect(result.element.content.value).toBe('1500+');
      expect(result.element.content.label).toBe('Users');
      expect(result.element.content.valueFontSize).toBe(48);
    });
  });

  // ── addTimeline ─────────────────────────────────────────────────

  describe('addTimeline', () => {
    it('should add a timeline with sorted events', async () => {
      mockInfographicFindUnique.mockResolvedValue(baseInfographicRecord);
      mockInfographicUpdate.mockResolvedValue({ ...baseInfographicRecord, version: 2 });

      const events = [
        { date: '2025-06-01', title: 'Launch', description: 'Product launch' },
        { date: '2025-01-01', title: 'Kickoff', description: 'Project start' },
      ];

      const result = await addTimeline('infographic-uuid-001', events, { x: 0, y: 0, w: 400, h: 300 });

      expect(result.eventsCount).toBe(2);
      expect(result.element.content.events[0].date).toBe('2025-01-01');
      expect(result.element.content.events[1].date).toBe('2025-06-01');
    });

    it('should throw when no valid events are provided', async () => {
      mockInfographicFindUnique.mockResolvedValue(baseInfographicRecord);

      await expect(
        addTimeline('infographic-uuid-001', [{ date: '', title: '', description: '' }], { x: 0, y: 0, w: 400, h: 300 }),
      ).rejects.toThrow('At least one valid event');
    });
  });

  // ── addComparison ──────────────────────────────────────────────

  describe('addComparison', () => {
    it('should create a comparison element with items and keys', async () => {
      mockInfographicFindUnique.mockResolvedValue(baseInfographicRecord);
      mockInfographicUpdate.mockResolvedValue({ ...baseInfographicRecord, version: 2 });

      const items = [
        { name: 'Plan A', values: { price: '$10', storage: '100GB' } },
        { name: 'Plan B', values: { price: '$20', storage: '500GB' } },
      ];

      const result = await addComparison('infographic-uuid-001', items, { x: 0, y: 0, w: 600, h: 200 });

      expect(result.comparedItems).toBe(2);
      expect(result.comparisonKeys).toContain('price');
      expect(result.comparisonKeys).toContain('storage');
    });

    it('should throw when fewer than 2 items are provided', async () => {
      mockInfographicFindUnique.mockResolvedValue(baseInfographicRecord);

      await expect(
        addComparison('infographic-uuid-001', [{ name: 'Only One', values: {} }], { x: 0, y: 0, w: 600, h: 200 }),
      ).rejects.toThrow('At least two items');
    });
  });

  // ── addFlowchart ────────────────────────────────────────────────

  describe('addFlowchart', () => {
    it('should add a flowchart with sanitized steps', async () => {
      mockInfographicFindUnique.mockResolvedValue(baseInfographicRecord);
      mockInfographicUpdate.mockResolvedValue({ ...baseInfographicRecord, version: 2 });

      const steps = [
        { title: 'Start', description: 'Begin process' },
        { title: 'Process', description: 'Do work' },
        { title: 'End', description: 'Complete' },
      ];

      const result = await addFlowchart('infographic-uuid-001', steps, { x: 0, y: 0, w: 800, h: 200 });

      expect(result.stepsCount).toBe(3);
      expect(result.element.content.steps[0].shape).toBe('rounded');
      expect(result.element.content.steps[1].shape).toBe('rect');
      expect(result.element.content.steps[2].shape).toBe('rounded');
    });

    it('should throw when fewer than 2 steps are provided', async () => {
      mockInfographicFindUnique.mockResolvedValue(baseInfographicRecord);

      await expect(
        addFlowchart('infographic-uuid-001', [{ title: 'Only', description: '' }], { x: 0, y: 0, w: 800, h: 200 }),
      ).rejects.toThrow('At least two steps');
    });
  });

  // ── renderInfographic ──────────────────────────────────────────

  describe('renderInfographic', () => {
    it('should render and return a PNG buffer', async () => {
      mockInfographicFindUnique.mockResolvedValue(baseInfographicRecord);

      const result = await renderInfographic('infographic-uuid-001');

      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('should throw when infographic is not found', async () => {
      mockInfographicFindUnique.mockResolvedValue(null);
      await expect(renderInfographic('missing')).rejects.toThrow('not found');
    });
  });

  // ── exportToImage ──────────────────────────────────────────────

  describe('exportToImage', () => {
    it('should export in JPEG format with correct content type', async () => {
      mockInfographicFindUnique.mockResolvedValue(baseInfographicRecord);

      const result = await exportToImage('infographic-uuid-001', 'jpeg');

      expect(result.contentType).toBe('image/jpeg');
      expect(result.filename).toContain('.jpg');
      expect(Buffer.isBuffer(result.buffer)).toBe(true);
    });
  });
});
