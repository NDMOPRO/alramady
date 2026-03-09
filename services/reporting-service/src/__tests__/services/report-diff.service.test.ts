import '../mocks/logger';

import { ReportDiffService } from '../../services/report-diff.service';
import type { Report, ReportSection, SectionDiff } from '../../services/report-diff.service';

describe('ReportDiffService', () => {
  let service: ReportDiffService;

  beforeEach(() => {
    service = new ReportDiffService();
  });

  // ── Helper factories ──────────────────────────────────────────────────

  function makeSection(overrides: Partial<ReportSection> = {}): ReportSection {
    return {
      id: 's1',
      title: 'Section 1',
      type: 'text',
      content: 'Default content',
      ...overrides,
    };
  }

  function makeReport(id: string, sections: ReportSection[]): Report {
    return { id, title: `Report ${id}`, sections };
  }

  // ── compareReports() ──────────────────────────────────────────────────

  describe('compareReports()', () => {
    it('should return no changes for identical reports', () => {
      const sections = [
        makeSection({ id: 's1', content: 'Same' }),
        makeSection({ id: 's2', title: 'Section 2', content: 'Also same' }),
      ];
      const reportA = makeReport('rA', sections);
      const reportB = makeReport('rB', sections);

      const result = service.compareReports(reportA, reportB);

      expect(result.reportAId).toBe('rA');
      expect(result.reportBId).toBe('rB');
      expect(result.addedSections).toEqual([]);
      expect(result.removedSections).toEqual([]);
      expect(result.changedSections).toEqual([]);
      expect(result.unchangedSections).toHaveLength(2);
      expect(result.totalSections.a).toBe(2);
      expect(result.totalSections.b).toBe(2);
    });

    it('should detect added sections in report B', () => {
      const reportA = makeReport('rA', [makeSection({ id: 's1' })]);
      const reportB = makeReport('rB', [
        makeSection({ id: 's1' }),
        makeSection({ id: 's2', title: 'New Section', content: 'Added' }),
      ]);

      const result = service.compareReports(reportA, reportB);

      expect(result.addedSections).toContain('s2');
      expect(result.unchangedSections).toContain('s1');
    });

    it('should detect removed sections from report A', () => {
      const reportA = makeReport('rA', [
        makeSection({ id: 's1' }),
        makeSection({ id: 's2', title: 'Will be removed' }),
      ]);
      const reportB = makeReport('rB', [makeSection({ id: 's1' })]);

      const result = service.compareReports(reportA, reportB);

      expect(result.removedSections).toContain('s2');
    });

    it('should detect changed sections', () => {
      const reportA = makeReport('rA', [makeSection({ id: 's1', content: 'Version 1' })]);
      const reportB = makeReport('rB', [makeSection({ id: 's1', content: 'Version 2' })]);

      const result = service.compareReports(reportA, reportB);

      expect(result.changedSections).toContain('s1');
    });

    it('should detect a mix of added, removed, changed, and unchanged', () => {
      const reportA = makeReport('rA', [
        makeSection({ id: 's1', content: 'Same' }),
        makeSection({ id: 's2', content: 'Will change' }),
        makeSection({ id: 's3', title: 'Removed section' }),
      ]);
      const reportB = makeReport('rB', [
        makeSection({ id: 's1', content: 'Same' }),
        makeSection({ id: 's2', content: 'Changed' }),
        makeSection({ id: 's4', title: 'Added section', content: 'New' }),
      ]);

      const result = service.compareReports(reportA, reportB);

      expect(result.unchangedSections).toContain('s1');
      expect(result.changedSections).toContain('s2');
      expect(result.removedSections).toContain('s3');
      expect(result.addedSections).toContain('s4');
    });
  });

  // ── compareSections() ─────────────────────────────────────────────────

  describe('compareSections()', () => {
    it('should return unchanged for identical sections', () => {
      const section = makeSection({ id: 's1', content: 'same' });

      const diffs = service.compareSections([section], [section]);

      expect(diffs).toHaveLength(1);
      expect(diffs[0].changeType).toBe('unchanged');
      expect(diffs[0].changes).toEqual([]);
    });

    it('should detect modified text content', () => {
      const secA = makeSection({ id: 's1', type: 'text', content: 'Hello world' });
      const secB = makeSection({ id: 's1', type: 'text', content: 'Hello universe' });

      const diffs = service.compareSections([secA], [secB]);

      expect(diffs).toHaveLength(1);
      expect(diffs[0].changeType).toBe('changed');
      const contentChange = diffs[0].changes.find((c) => c.field === 'content');
      expect(contentChange).toBeDefined();
      expect(contentChange!.oldValue).toBe('Hello world');
      expect(contentChange!.newValue).toBe('Hello universe');
    });

    it('should detect title changes', () => {
      const secA = makeSection({ id: 's1', title: 'Old Title', content: 'same' });
      const secB = makeSection({ id: 's1', title: 'New Title', content: 'same' });

      const diffs = service.compareSections([secA], [secB]);

      expect(diffs[0].changeType).toBe('changed');
      const titleChange = diffs[0].changes.find((c) => c.field === 'title');
      expect(titleChange).toBeDefined();
      expect(titleChange!.oldValue).toBe('Old Title');
      expect(titleChange!.newValue).toBe('New Title');
    });

    it('should detect type changes', () => {
      const secA = makeSection({ id: 's1', type: 'text', content: 'data' });
      const secB = makeSection({ id: 's1', type: 'summary', content: 'data' });

      const diffs = service.compareSections([secA], [secB]);

      expect(diffs[0].changeType).toBe('changed');
      const typeChange = diffs[0].changes.find((c) => c.field === 'type');
      expect(typeChange).toBeDefined();
    });

    it('should detect added sections', () => {
      const secB = makeSection({ id: 'new-section', title: 'New', content: 'added' });

      const diffs = service.compareSections([], [secB]);

      expect(diffs).toHaveLength(1);
      expect(diffs[0].changeType).toBe('added');
      expect(diffs[0].sectionId).toBe('new-section');
    });

    it('should detect removed sections', () => {
      const secA = makeSection({ id: 'old-section', title: 'Old', content: 'removed' });

      const diffs = service.compareSections([secA], []);

      expect(diffs).toHaveLength(1);
      expect(diffs[0].changeType).toBe('removed');
      expect(diffs[0].sectionId).toBe('old-section');
    });

    it('should diff table sections with row-level changes', () => {
      const secA = makeSection({
        id: 's1', type: 'table',
        content: [
          { id: '1', name: 'Row A', value: 100 },
          { id: '2', name: 'Row B', value: 200 },
        ],
      });
      const secB = makeSection({
        id: 's1', type: 'table',
        content: [
          { id: '1', name: 'Row A', value: 150 },
          { id: '3', name: 'Row C', value: 300 },
        ],
      });

      const diffs = service.compareSections([secA], [secB]);

      expect(diffs[0].changeType).toBe('changed');
      expect(diffs[0].rowDiffs).toBeDefined();
      const rowDiffs = diffs[0].rowDiffs!;
      const changedRow = rowDiffs.find((r) => r.changeType === 'changed');
      const removedRow = rowDiffs.find((r) => r.changeType === 'removed');
      const addedRow = rowDiffs.find((r) => r.changeType === 'added');
      expect(changedRow).toBeDefined();
      expect(removedRow).toBeDefined();
      expect(addedRow).toBeDefined();
    });

    it('should diff chart sections with data point changes', () => {
      const secA = makeSection({
        id: 's1', type: 'chart',
        content: { dataPoints: [{ label: 'Jan', value: 100 }, { label: 'Feb', value: 200 }] },
      });
      const secB = makeSection({
        id: 's1', type: 'chart',
        content: { dataPoints: [{ label: 'Jan', value: 150 }, { label: 'Feb', value: 200 }] },
      });

      const diffs = service.compareSections([secA], [secB]);

      expect(diffs[0].changeType).toBe('changed');
      expect(diffs[0].dataPointDiffs).toBeDefined();
      expect(diffs[0].dataPointDiffs!.length).toBe(1);
      expect(diffs[0].dataPointDiffs![0].percentageChange).toBeCloseTo(50, 0);
    });
  });

  // ── compareData() ─────────────────────────────────────────────────────

  describe('compareData()', () => {
    it('should detect matching rows', () => {
      const data = [
        { id: '1', name: 'A', value: 100 },
        { id: '2', name: 'B', value: 200 },
      ];

      const result = service.compareData(data, data);

      expect(result.added).toEqual([]);
      expect(result.removed).toEqual([]);
      expect(result.changed).toEqual([]);
    });

    it('should detect added rows', () => {
      const dataA = [{ id: '1', name: 'A' }];
      const dataB = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }];

      const result = service.compareData(dataA, dataB);

      expect(result.added).toHaveLength(1);
      expect(result.added[0].id).toBe('2');
    });

    it('should detect removed rows', () => {
      const dataA = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }];
      const dataB = [{ id: '1', name: 'A' }];

      const result = service.compareData(dataA, dataB);

      expect(result.removed).toHaveLength(1);
      expect(result.removed[0].id).toBe('2');
    });

    it('should detect changed rows with percentage changes for numeric fields', () => {
      const dataA = [{ id: '1', name: 'A', value: 100 }];
      const dataB = [{ id: '1', name: 'A', value: 150 }];

      const result = service.compareData(dataA, dataB);

      expect(result.changed).toHaveLength(1);
      expect(result.changed[0].key).toBe('1');
      const valueChange = result.changed[0].cellChanges.find((c) => c.field === 'value');
      expect(valueChange).toBeDefined();
      expect(valueChange!.oldValue).toBe(100);
      expect(valueChange!.newValue).toBe(150);
      expect(valueChange!.percentageChange).toBeCloseTo(50, 0);
    });

    it('should detect added and removed fields within a changed row', () => {
      const dataA = [{ id: '1', oldField: 'x' }];
      const dataB = [{ id: '1', newField: 'y' }];

      const result = service.compareData(dataA, dataB);

      expect(result.changed).toHaveLength(1);
      const addedField = result.changed[0].cellChanges.find((c) => c.field === 'newField');
      const removedField = result.changed[0].cellChanges.find((c) => c.field === 'oldField');
      expect(addedField!.changeType).toBe('added');
      expect(removedField!.changeType).toBe('removed');
    });

    it('should handle empty arrays', () => {
      const result = service.compareData([], []);

      expect(result.added).toEqual([]);
      expect(result.removed).toEqual([]);
      expect(result.changed).toEqual([]);
    });
  });

  // ── generateDiffSummary() ─────────────────────────────────────────────

  describe('generateDiffSummary()', () => {
    it('should report no differences for identical reports', () => {
      const diffs: SectionDiff[] = [
        { sectionId: 's1', sectionTitle: 'Section 1', sectionType: 'text', changeType: 'unchanged', changes: [] },
      ];

      const summary = service.generateDiffSummary(diffs);

      expect(summary.overview).toContain('identical');
      expect(summary.statistics.totalChanges).toBe(0);
      expect(summary.sectionSummaries).toHaveLength(0);
    });

    it('should summarize added sections', () => {
      const diffs: SectionDiff[] = [
        {
          sectionId: 's1', sectionTitle: 'New Section', sectionType: 'text',
          changeType: 'added',
          changes: [{ field: 'content', oldValue: null, newValue: 'text', changeType: 'added' }],
        },
      ];

      const summary = service.generateDiffSummary(diffs);

      expect(summary.statistics.additions).toBe(1);
      expect(summary.sectionSummaries[0]).toContain('added');
    });

    it('should summarize removed sections', () => {
      const diffs: SectionDiff[] = [
        {
          sectionId: 's1', sectionTitle: 'Old Section', sectionType: 'text',
          changeType: 'removed',
          changes: [{ field: 'content', oldValue: 'text', newValue: null, changeType: 'removed' }],
        },
      ];

      const summary = service.generateDiffSummary(diffs);

      expect(summary.statistics.removals).toBe(1);
      expect(summary.sectionSummaries[0]).toContain('removed');
    });

    it('should summarize changed sections with title changes', () => {
      const diffs: SectionDiff[] = [
        {
          sectionId: 's1', sectionTitle: 'Updated Title', sectionType: 'text',
          changeType: 'changed',
          changes: [
            { field: 'title', oldValue: 'Old Title', newValue: 'Updated Title', changeType: 'changed' },
            { field: 'content', oldValue: 'v1', newValue: 'v2', changeType: 'changed' },
          ],
        },
      ];

      const summary = service.generateDiffSummary(diffs);

      expect(summary.statistics.modifications).toBe(1);
      expect(summary.sectionSummaries[0]).toContain('title changed');
      expect(summary.sectionSummaries[0]).toContain('content was modified');
    });

    it('should summarize row-level changes in table sections', () => {
      const diffs: SectionDiff[] = [
        {
          sectionId: 's1', sectionTitle: 'Data Table', sectionType: 'table',
          changeType: 'changed',
          changes: [],
          rowDiffs: [
            { key: '1', changeType: 'added', cellChanges: [] },
            { key: '2', changeType: 'removed', cellChanges: [] },
            { key: '3', changeType: 'changed', cellChanges: [{ field: 'val', oldValue: 1, newValue: 2, changeType: 'changed' }] },
          ],
        },
      ];

      const summary = service.generateDiffSummary(diffs);

      expect(summary.sectionSummaries[0]).toContain('1 row added');
      expect(summary.sectionSummaries[0]).toContain('1 row removed');
      expect(summary.sectionSummaries[0]).toContain('1 row modified');
    });

    it('should include data point change counts for chart sections', () => {
      const diffs: SectionDiff[] = [
        {
          sectionId: 's1', sectionTitle: 'Chart', sectionType: 'chart',
          changeType: 'changed',
          changes: [],
          dataPointDiffs: [
            { field: 'Jan', oldValue: 100, newValue: 150, changeType: 'changed', percentageChange: 50 },
            { field: 'Feb', oldValue: 200, newValue: 250, changeType: 'changed', percentageChange: 25 },
          ],
        },
      ];

      const summary = service.generateDiffSummary(diffs);

      expect(summary.sectionSummaries[0]).toContain('2 data points changed');
    });

    it('should combine all statistics in the overview', () => {
      const diffs: SectionDiff[] = [
        { sectionId: 's1', sectionTitle: 'A', sectionType: 'text', changeType: 'added', changes: [] },
        { sectionId: 's2', sectionTitle: 'B', sectionType: 'text', changeType: 'removed', changes: [] },
        { sectionId: 's3', sectionTitle: 'C', sectionType: 'text', changeType: 'changed', changes: [] },
        { sectionId: 's4', sectionTitle: 'D', sectionType: 'text', changeType: 'unchanged', changes: [] },
      ];

      const summary = service.generateDiffSummary(diffs);

      expect(summary.statistics.totalChanges).toBe(3);
      expect(summary.statistics.additions).toBe(1);
      expect(summary.statistics.removals).toBe(1);
      expect(summary.statistics.modifications).toBe(1);
      expect(summary.overview).toContain('3 section changes');
      expect(summary.overview).toContain('1 section remained unchanged');
    });
  });
});
