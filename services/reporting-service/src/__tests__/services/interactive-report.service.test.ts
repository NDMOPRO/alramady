import '../mocks/logger';
import { mockCacheGet, mockCacheSet, mockCacheDel } from '../mocks/redis';
import { mockPrismaClient } from '../mocks/prisma';

import { InteractiveReportService } from '../../services/interactive-report.service';

describe('InteractiveReportService', () => {
  let service: InteractiveReportService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InteractiveReportService(mockPrismaClient as any);
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const makeValidInput = (overrides: Record<string, unknown> = {}) => ({
    name: 'Sales Dashboard',
    description: 'Interactive sales report',
    baseReportId: 'rpt-base-1',
    elements: [
      {
        id: 'elem-1',
        type: 'filter' as const,
        config: {
          field: 'region',
          filterType: 'single_select' as const,
          options: [{ label: 'US', value: 'us' }],
          defaultValue: 'us',
        },
        targetSections: ['section-1'],
        position: { x: 0, y: 0, width: 200, height: 50 },
      },
    ],
    parameters: [
      {
        id: 'param-1',
        name: 'year',
        label: 'Year',
        type: 'number' as const,
        defaultValue: 2025,
        required: true,
        description: 'Report year',
      },
    ],
    linkedReports: [] as any[],
    bookmarks: [] as any[],
    createdBy: 'user-1',
    ...overrides,
  });

  const makeMockDbReport = (overrides: Record<string, unknown> = {}) => ({
    id: 'ir-1',
    name: 'Sales Dashboard',
    description: 'Interactive sales report',
    reportId: 'rpt-base-1',
    elements: JSON.stringify([
      {
        id: 'elem-1',
        type: 'filter',
        config: { field: 'region', filterType: 'single_select', defaultValue: 'us' },
        targetSections: ['section-1'],
        position: { x: 0, y: 0, width: 200, height: 50 },
      },
    ]),
    parameters: JSON.stringify([
      { id: 'param-1', name: 'year', label: 'Year', type: 'number', defaultValue: 2025, required: true, description: 'Report year' },
    ]),
    linkedReports: '[]',
    bookmarks: '[]',
    version: 1,
    createdBy: 'user-1',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  });

  // ---------------------------------------------------------------------------
  // list() — via prisma.interactiveReport.findMany (used internally)
  // ---------------------------------------------------------------------------
  describe('list() / getReport()', () => {
    it('should retrieve interactive report by id', async () => {
      mockPrismaClient.interactiveReport.findUniqueOrThrow.mockResolvedValue(makeMockDbReport());

      // getReport is private, so we test it through public methods
      // createBookmark calls getReport internally
      mockPrismaClient.interactiveReport.update.mockResolvedValue({});

      const bookmark = await service.createBookmark(
        'ir-1',
        'Default View',
        {
          filterValues: {},
          sortState: [],
          drillDownState: {},
          scrollPosition: { x: 0, y: 0 },
          expandedSections: [],
        },
        'user-1',
      );

      expect(mockPrismaClient.interactiveReport.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'ir-1' },
      });
      expect(bookmark.name).toBe('Default View');
    });

    it('should throw when report not found', async () => {
      mockPrismaClient.interactiveReport.findUniqueOrThrow.mockRejectedValue(
        new Error('No InteractiveReport found'),
      );

      await expect(
        service.createBookmark('bad-id', 'BM', {
          filterValues: {},
          sortState: [],
          drillDownState: {},
          scrollPosition: { x: 0, y: 0 },
          expandedSections: [],
        }, 'user-1'),
      ).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // create() — createInteractiveReport
  // ---------------------------------------------------------------------------
  describe('createInteractiveReport()', () => {
    it('should create an interactive report mapping baseReportId to reportId', async () => {
      const input = makeValidInput();
      const dbRecord = {
        id: 'ir-new',
        createdAt: new Date('2025-06-01'),
        updatedAt: new Date('2025-06-01'),
      };
      mockPrismaClient.interactiveReport.create.mockResolvedValue(dbRecord);
      mockPrismaClient.interactiveReportVersion.create.mockResolvedValue({});

      const result = await service.createInteractiveReport(input as any);

      expect(result.id).toBe('ir-new');
      expect(result.name).toBe('Sales Dashboard');
      expect(result.baseReportId).toBe('rpt-base-1');
      expect(result.version).toBe(1);
      expect(mockPrismaClient.interactiveReport.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Sales Dashboard',
          reportId: 'rpt-base-1', // mapped from baseReportId
          version: 1,
          createdBy: 'user-1',
        }),
      });
      // Should also create initial version record
      expect(mockPrismaClient.interactiveReportVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reportId: 'ir-new',
          version: 1,
          changeDescription: 'Initial creation',
        }),
      });
    });

    it('should reject when name is empty', async () => {
      const input = makeValidInput({ name: '' });

      await expect(service.createInteractiveReport(input as any)).rejects.toThrow(
        'Report name is required',
      );
    });

    it('should reject when baseReportId is missing', async () => {
      const input = makeValidInput({ baseReportId: '' });

      await expect(service.createInteractiveReport(input as any)).rejects.toThrow(
        'Base report ID is required',
      );
    });

    it('should reject duplicate element IDs', async () => {
      const input = makeValidInput({
        elements: [
          { id: 'dup', type: 'filter', config: { field: 'a', filterType: 'text_search' }, targetSections: ['s1'], position: { x: 0, y: 0, width: 1, height: 1 } },
          { id: 'dup', type: 'sort', config: { field: 'b', direction: 'asc', multiSort: false }, targetSections: ['s1'], position: { x: 0, y: 0, width: 1, height: 1 } },
        ],
      });

      await expect(service.createInteractiveReport(input as any)).rejects.toThrow(
        'Duplicate element ID: dup',
      );
    });

    it('should reject required enum param without valid values', async () => {
      const input = makeValidInput({
        parameters: [
          { id: 'p1', name: 'status', label: 'Status', type: 'enum', required: false, description: 'Status filter' },
        ],
      });

      await expect(service.createInteractiveReport(input as any)).rejects.toThrow(
        'enum type must specify valid values',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // update() — via prisma directly (no dedicated update method, tested via elements update)
  // ---------------------------------------------------------------------------
  describe('update via createBookmark / executeDrillDown', () => {
    it('should update interactive report elements', async () => {
      mockPrismaClient.interactiveReport.findUniqueOrThrow.mockResolvedValue(
        makeMockDbReport({
          elements: JSON.stringify([
            {
              id: 'dd-1',
              type: 'drill_down',
              config: {
                levels: [
                  { field: 'country', label: 'Country', aggregation: 'count' },
                  { field: 'city', label: 'City', aggregation: 'count' },
                ],
                currentLevel: 0,
                breadcrumb: [],
              },
              targetSections: ['s1'],
              position: { x: 0, y: 0, width: 1, height: 1 },
            },
          ]),
        }),
      );
      mockPrismaClient.reportDefinition.findUnique.mockResolvedValue({
        id: 'rpt-base-1',
        config: {},
        dataSources: [],
      });
      mockPrismaClient.interactiveReport.update.mockResolvedValue({});

      const result = await service.executeDrillDown('ir-1', 'dd-1', 'US');

      expect(result.currentLevel).toBe(1);
      expect(result.breadcrumb).toHaveLength(1);
      expect(result.breadcrumb[0].filterValue).toBe('US');
      expect(mockPrismaClient.interactiveReport.update).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // remove() — no dedicated remove in service, tested via deleteDistributionConfig pattern
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // executeWithParameters()
  // ---------------------------------------------------------------------------
  describe('executeWithParameters()', () => {
    it('should filter dataset rows by applied parameters', async () => {
      mockPrismaClient.interactiveReport.findUniqueOrThrow.mockResolvedValue(
        makeMockDbReport({
          parameters: JSON.stringify([
            { id: 'p1', name: 'region', label: 'Region', type: 'string', required: false, description: 'Filter by region' },
          ]),
        }),
      );
      mockPrismaClient.reportDefinition.findUnique.mockResolvedValue({
        id: 'rpt-base-1',
        config: { dataSources: [{ datasetId: 'ds-1' }] },
        dataSources: [],
      });
      mockPrismaClient.dataset.findUnique.mockResolvedValue({
        id: 'ds-1',
        data: [
          { region: 'US', sales: 100 },
          { region: 'EU', sales: 200 },
          { region: 'US', sales: 150 },
        ],
      });

      const result = await service.executeWithParameters('ir-1', { region: 'US' });

      expect(result.data).toHaveLength(2);
      expect(result.appliedParams).toEqual({ region: 'US' });
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should use default value for required params when value not provided', async () => {
      mockPrismaClient.interactiveReport.findUniqueOrThrow.mockResolvedValue(
        makeMockDbReport({
          parameters: JSON.stringify([
            { id: 'p1', name: 'year', label: 'Year', type: 'number', defaultValue: 2025, required: true, description: 'Year' },
          ]),
        }),
      );
      mockPrismaClient.reportDefinition.findUnique.mockResolvedValue({
        id: 'rpt-base-1',
        config: {},
        dataSources: [],
      });

      const result = await service.executeWithParameters('ir-1', {});

      expect(result.appliedParams).toEqual({ year: 2025 });
    });

    it('should throw when required param is missing and has no default', async () => {
      mockPrismaClient.interactiveReport.findUniqueOrThrow.mockResolvedValue(
        makeMockDbReport({
          parameters: JSON.stringify([
            { id: 'p1', name: 'region', label: 'Region', type: 'string', required: true, description: 'Region' },
          ]),
        }),
      );

      await expect(service.executeWithParameters('ir-1', {})).rejects.toThrow(
        'Required parameter region is missing',
      );
    });

    it('should reject invalid enum values', async () => {
      mockPrismaClient.interactiveReport.findUniqueOrThrow.mockResolvedValue(
        makeMockDbReport({
          parameters: JSON.stringify([
            { id: 'p1', name: 'status', label: 'Status', type: 'enum', required: false, validValues: ['active', 'inactive'], description: 'Status' },
          ]),
        }),
      );

      await expect(
        service.executeWithParameters('ir-1', { status: 'deleted' }),
      ).rejects.toThrow('invalid value');
    });

    it('should reject non-number value for number param', async () => {
      mockPrismaClient.interactiveReport.findUniqueOrThrow.mockResolvedValue(
        makeMockDbReport({
          parameters: JSON.stringify([
            { id: 'p1', name: 'count', label: 'Count', type: 'number', required: false, description: 'Count' },
          ]),
        }),
      );

      await expect(
        service.executeWithParameters('ir-1', { count: 'abc' }),
      ).rejects.toThrow('expects a number');
    });
  });

  // ---------------------------------------------------------------------------
  // executeDrillDown()
  // ---------------------------------------------------------------------------
  describe('executeDrillDown()', () => {
    const makeDrillDownReport = () =>
      makeMockDbReport({
        elements: JSON.stringify([
          {
            id: 'dd-1',
            type: 'drill_down',
            config: {
              levels: [
                { field: 'country', label: 'Country', aggregation: 'count' },
                { field: 'city', label: 'City', aggregation: 'sum' },
              ],
              currentLevel: 0,
              breadcrumb: [],
            },
            targetSections: ['s1'],
            position: { x: 0, y: 0, width: 1, height: 1 },
          },
        ]),
      });

    it('should drill down and filter by config', async () => {
      mockPrismaClient.interactiveReport.findUniqueOrThrow.mockResolvedValue(makeDrillDownReport());
      mockPrismaClient.reportDefinition.findUnique.mockResolvedValue({
        id: 'rpt-base-1',
        config: { dataSources: [{ datasetId: 'ds-1' }] },
        dataSources: [],
      });
      mockPrismaClient.dataset.findUnique.mockResolvedValue({
        id: 'ds-1',
        data: [
          { country: 'US', city: 'NYC' },
          { country: 'US', city: 'LA' },
          { country: 'EU', city: 'London' },
        ],
      });
      mockPrismaClient.interactiveReport.update.mockResolvedValue({});

      const result = await service.executeDrillDown('ir-1', 'dd-1', 'US');

      expect(result.currentLevel).toBe(1);
      expect(result.breadcrumb).toHaveLength(1);
      expect(result.breadcrumb[0]).toEqual({
        level: 0,
        label: 'US',
        filterValue: 'US',
      });
      // Data should be filtered to US entries and grouped by city
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should throw when element not found', async () => {
      mockPrismaClient.interactiveReport.findUniqueOrThrow.mockResolvedValue(makeDrillDownReport());

      await expect(
        service.executeDrillDown('ir-1', 'non-existent', 'US'),
      ).rejects.toThrow('not found');
    });

    it('should throw at deepest level', async () => {
      mockPrismaClient.interactiveReport.findUniqueOrThrow.mockResolvedValue(
        makeMockDbReport({
          elements: JSON.stringify([
            {
              id: 'dd-1',
              type: 'drill_down',
              config: {
                levels: [{ field: 'country', label: 'Country', aggregation: 'count' }],
                currentLevel: 0,
                breadcrumb: [],
              },
              targetSections: ['s1'],
              position: { x: 0, y: 0, width: 1, height: 1 },
            },
          ]),
        }),
      );

      await expect(
        service.executeDrillDown('ir-1', 'dd-1', 'US'),
      ).rejects.toThrow('deepest drill-down level');
    });
  });

  // ---------------------------------------------------------------------------
  // getVersions() — via compareVersions
  // ---------------------------------------------------------------------------
  describe('compareVersions()', () => {
    it('should return version differences', async () => {
      mockPrismaClient.interactiveReportVersion.findFirst
        .mockResolvedValueOnce({
          version: 1,
          elements: JSON.stringify([
            { id: 'e1', type: 'filter', config: {}, targetSections: ['s1'], position: {} },
          ]),
          parameters: JSON.stringify([]),
        })
        .mockResolvedValueOnce({
          version: 2,
          elements: JSON.stringify([
            { id: 'e1', type: 'filter', config: { updated: true }, targetSections: ['s1'], position: {} },
            { id: 'e2', type: 'sort', config: {}, targetSections: ['s2'], position: {} },
          ]),
          parameters: JSON.stringify([
            { id: 'p1', name: 'region' },
          ]),
        });

      const result = await service.compareVersions('ir-1', 1, 2);

      expect(result.version1).toBe(1);
      expect(result.version2).toBe(2);
      expect(result.changes.length).toBeGreaterThan(0);
      // e1 should be modified, e2 should be added, p1 should be added
      const types = result.changes.map((c) => c.type);
      expect(types).toContain('modified');
      expect(types).toContain('added');
      expect(result.summary).toContain('changes');
    });

    it('should throw when version not found', async () => {
      mockPrismaClient.interactiveReportVersion.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await expect(service.compareVersions('ir-1', 1, 2)).rejects.toThrow(
        'One or both versions not found',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // createVersion() — via createInteractiveReport (creates version 1 automatically)
  // ---------------------------------------------------------------------------
  describe('createVersion (via createInteractiveReport)', () => {
    it('should create version 1 on report creation', async () => {
      const input = makeValidInput();
      mockPrismaClient.interactiveReport.create.mockResolvedValue({
        id: 'ir-new',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPrismaClient.interactiveReportVersion.create.mockResolvedValue({});

      await service.createInteractiveReport(input as any);

      expect(mockPrismaClient.interactiveReportVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reportId: 'ir-new',
          version: 1,
          changedBy: 'user-1',
          changeDescription: 'Initial creation',
        }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // addBookmark() / getBookmarks()
  // ---------------------------------------------------------------------------
  describe('addBookmark()', () => {
    it('should add a bookmark to the report', async () => {
      mockPrismaClient.interactiveReport.findUniqueOrThrow.mockResolvedValue(makeMockDbReport());
      mockPrismaClient.interactiveReport.update.mockResolvedValue({});

      const state = {
        filterValues: { region: 'US' },
        sortState: [{ field: 'sales', direction: 'desc' as const }],
        drillDownState: {},
        scrollPosition: { x: 0, y: 100 },
        expandedSections: ['section-1'],
      };

      const bookmark = await service.createBookmark('ir-1', 'US View', state, 'user-1');

      expect(bookmark.name).toBe('US View');
      expect(bookmark.state).toEqual(state);
      expect(bookmark.createdBy).toBe('user-1');
      expect(bookmark.id).toMatch(/^bm_/);
      expect(mockPrismaClient.interactiveReport.update).toHaveBeenCalledWith({
        where: { id: 'ir-1' },
        data: expect.objectContaining({
          bookmarks: expect.any(String),
        }),
      });
    });

    it('should set isDefault and clear other defaults', async () => {
      const existingBookmarks = [
        { id: 'bm-old', name: 'Old Default', isDefault: true, state: {}, createdBy: 'user-1', createdAt: new Date() },
      ];
      mockPrismaClient.interactiveReport.findUniqueOrThrow.mockResolvedValue(
        makeMockDbReport({ bookmarks: JSON.stringify(existingBookmarks) }),
      );
      mockPrismaClient.interactiveReport.update.mockResolvedValue({});

      const bookmark = await service.createBookmark(
        'ir-1',
        'New Default',
        { filterValues: {}, sortState: [], drillDownState: {}, scrollPosition: { x: 0, y: 0 }, expandedSections: [] },
        'user-1',
        true,
      );

      expect(bookmark.isDefault).toBe(true);
      // Verify the old bookmark had its isDefault cleared
      const updateCall = mockPrismaClient.interactiveReport.update.mock.calls[0][0];
      const savedBookmarks = JSON.parse(updateCall.data.bookmarks);
      const oldBookmark = savedBookmarks.find((b: any) => b.id === 'bm-old');
      expect(oldBookmark.isDefault).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // addComment() / getComments()
  // ---------------------------------------------------------------------------
  describe('addComment()', () => {
    it('should create a comment and extract mentions', async () => {
      mockPrismaClient.reportComment.create.mockResolvedValue({
        id: 'comment-1',
        createdAt: new Date('2025-06-01'),
      });

      const result = await service.addComment(
        'ir-1',
        'user-1',
        'Alice',
        'Hey @bob please review this @charlie',
        'section-1',
      );

      expect(result.id).toBe('comment-1');
      expect(result.content).toContain('@bob');
      expect(mockPrismaClient.reportComment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reportId: 'ir-1',
          userId: 'user-1',
          userName: 'Alice',
          content: 'Hey @bob please review this @charlie',
          sectionId: 'section-1',
          mentions: JSON.stringify(['bob', 'charlie']),
          resolved: false,
        }),
      });
    });

    it('should handle comments without mentions', async () => {
      mockPrismaClient.reportComment.create.mockResolvedValue({
        id: 'comment-2',
        createdAt: new Date(),
      });

      await service.addComment('ir-1', 'user-1', 'Alice', 'Simple comment');

      expect(mockPrismaClient.reportComment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          mentions: '[]',
        }),
      });
    });
  });

  describe('getComments()', () => {
    it('should return comments for a report', async () => {
      mockPrismaClient.reportComment.findMany.mockResolvedValue([
        {
          id: 'c-1',
          reportId: 'ir-1',
          sectionId: null,
          userId: 'user-1',
          userName: 'Alice',
          content: 'Great report',
          parentCommentId: null,
          resolved: false,
          createdAt: new Date(),
          updatedAt: null,
        },
      ]);

      const result = await service.getComments('ir-1');

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Great report');
      expect(result[0].sectionId).toBeUndefined();
    });

    it('should filter by sectionId and resolved status', async () => {
      mockPrismaClient.reportComment.findMany.mockResolvedValue([]);

      await service.getComments('ir-1', { sectionId: 's1', resolved: false });

      expect(mockPrismaClient.reportComment.findMany).toHaveBeenCalledWith({
        where: { reportId: 'ir-1', sectionId: 's1', resolved: false },
        orderBy: { createdAt: 'asc' },
      });
    });
  });
});
