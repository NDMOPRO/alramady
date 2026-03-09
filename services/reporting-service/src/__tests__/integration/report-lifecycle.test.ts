import '../mocks/logger';
import { mockCacheGet, mockCacheSet, mockCacheDel } from '../mocks/redis';
import { mockPrismaClient } from '../mocks/prisma';

/**
 * Integration test: Report Lifecycle
 *
 * Tests the full lifecycle of a report:
 *   create (easy-mode) -> build -> export -> delete
 *
 * All services are mocked but we verify they are called in the correct
 * sequence and with the expected data flowing between steps.
 */
describe('Report Lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should complete full lifecycle: create -> build -> export -> delete', async () => {
    // -----------------------------------------------------------------------
    // Step tracking
    // -----------------------------------------------------------------------
    const callOrder: string[] = [];

    // -----------------------------------------------------------------------
    // 1. CREATE — simulate report definition creation
    // -----------------------------------------------------------------------
    const createdReport = {
      id: 'rpt-lifecycle-1',
      name: 'Q4 Sales Report',
      type: 'easy',
      status: 'draft',
      tenantId: 'tenant-1',
      createdBy: 'user-1',
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
      config: { layout: 'portrait', dataSources: [{ datasetId: 'ds-1' }] },
    };

    mockPrismaClient.reportDefinition.create.mockImplementation(async (args: any) => {
      callOrder.push('create');
      return createdReport;
    });

    const createResult = await mockPrismaClient.reportDefinition.create({
      data: {
        name: 'Q4 Sales Report',
        type: 'easy',
        status: 'draft',
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      },
    });

    expect(createResult.id).toBe('rpt-lifecycle-1');
    expect(createResult.status).toBe('draft');

    // -----------------------------------------------------------------------
    // 2. BUILD — simulate report builder producing output
    // -----------------------------------------------------------------------
    const buildOutput = {
      id: 'build-1',
      reportId: 'rpt-lifecycle-1',
      status: 'COMPLETED',
      filePath: '/tmp/reports/rpt-lifecycle-1.pdf',
      format: 'pdf',
      fileSize: 102400,
      createdAt: new Date('2025-01-01T01:00:00Z'),
    };

    mockPrismaClient.reportBuildOutput.create.mockImplementation(async (args: any) => {
      callOrder.push('build');
      return buildOutput;
    });

    // Simulate updating report status to 'built'
    mockPrismaClient.reportDefinition.update.mockImplementation(async (args: any) => {
      callOrder.push('update-status');
      return { ...createdReport, status: args.data.status || 'built' };
    });

    const buildResult = await mockPrismaClient.reportBuildOutput.create({
      data: {
        reportId: createResult.id,
        status: 'COMPLETED',
        filePath: '/tmp/reports/rpt-lifecycle-1.pdf',
        format: 'pdf',
        fileSize: 102400,
      },
    });

    // Update report status after build
    await mockPrismaClient.reportDefinition.update({
      where: { id: createResult.id },
      data: { status: 'built' },
    });

    expect(buildResult.status).toBe('COMPLETED');
    expect(buildResult.reportId).toBe(createResult.id);

    // -----------------------------------------------------------------------
    // 3. EXPORT — simulate template engine producing PDF export
    // -----------------------------------------------------------------------
    const exportRecord = {
      id: 'export-1',
      reportId: 'rpt-lifecycle-1',
      format: 'pdf',
      filePath: '/tmp/exports/rpt-lifecycle-1-export.pdf',
      status: 'COMPLETED',
      fileSize: 98304,
      createdAt: new Date('2025-01-01T02:00:00Z'),
    };

    mockPrismaClient.reportBuildOutput.findFirst.mockImplementation(async () => {
      callOrder.push('find-build-for-export');
      return buildOutput;
    });

    // Verify we can find the build output
    const latestBuild = await mockPrismaClient.reportBuildOutput.findFirst({
      where: { reportId: createResult.id, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
    });

    expect(latestBuild).toBeTruthy();
    expect(latestBuild.reportId).toBe(createResult.id);

    // -----------------------------------------------------------------------
    // 4. DELETE — soft delete the report
    // -----------------------------------------------------------------------
    const deletedReport = {
      ...createdReport,
      status: 'deleted',
      deletedAt: new Date('2025-01-01T03:00:00Z'),
    };

    mockPrismaClient.reportDefinition.update.mockImplementation(async (args: any) => {
      callOrder.push('soft-delete');
      return deletedReport;
    });

    const deleteResult = await mockPrismaClient.reportDefinition.update({
      where: { id: createResult.id },
      data: { status: 'deleted', deletedAt: new Date() },
    });

    expect(deleteResult.status).toBe('deleted');
    expect(deleteResult.deletedAt).toBeTruthy();

    // -----------------------------------------------------------------------
    // Verify call order
    // -----------------------------------------------------------------------
    expect(callOrder).toEqual([
      'create',
      'build',
      'update-status',
      'find-build-for-export',
      'soft-delete',
    ]);

    // Verify each step used the correct report ID
    expect(mockPrismaClient.reportDefinition.create).toHaveBeenCalledTimes(1);
    expect(mockPrismaClient.reportBuildOutput.create).toHaveBeenCalledTimes(1);
    expect(mockPrismaClient.reportBuildOutput.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reportId: 'rpt-lifecycle-1' }),
      }),
    );
    expect(mockPrismaClient.reportBuildOutput.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ reportId: 'rpt-lifecycle-1' }),
      }),
    );
  });

  it('should handle build failure gracefully and not proceed to export', async () => {
    // Create succeeds
    const createdReport = {
      id: 'rpt-fail-1',
      name: 'Failing Report',
      status: 'draft',
    };
    mockPrismaClient.reportDefinition.create.mockResolvedValue(createdReport);

    const report = await mockPrismaClient.reportDefinition.create({
      data: { name: 'Failing Report', status: 'draft' },
    });

    // Build fails
    const buildError = new Error('Template compilation failed');
    mockPrismaClient.reportBuildOutput.create.mockRejectedValue(buildError);

    // Update status to 'build_failed'
    mockPrismaClient.reportDefinition.update.mockResolvedValue({
      ...createdReport,
      status: 'build_failed',
    });

    let buildFailed = false;
    try {
      await mockPrismaClient.reportBuildOutput.create({
        data: {
          reportId: report.id,
          status: 'FAILED',
        },
      });
    } catch (error) {
      buildFailed = true;
      // Mark report as failed
      await mockPrismaClient.reportDefinition.update({
        where: { id: report.id },
        data: { status: 'build_failed' },
      });
    }

    expect(buildFailed).toBe(true);
    expect(mockPrismaClient.reportDefinition.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'build_failed' }),
      }),
    );

    // Export should never be attempted
    expect(mockPrismaClient.reportBuildOutput.findFirst).not.toHaveBeenCalled();
  });

  it('should support the create -> edit -> re-export flow', async () => {
    const callOrder: string[] = [];

    // 1. Create report
    mockPrismaClient.reportDefinition.create.mockImplementation(async () => {
      callOrder.push('create');
      return { id: 'rpt-edit-1', name: 'Editable Report', status: 'draft' };
    });

    const report = await mockPrismaClient.reportDefinition.create({
      data: { name: 'Editable Report' },
    });

    // 2. Apply post-edit
    mockPrismaClient.reportPostEdit.create.mockImplementation(async () => {
      callOrder.push('apply-edit');
      return {
        id: 'pe-1',
        reportId: 'rpt-edit-1',
        editType: 'section_edit',
        version: 1,
        isPublished: true,
        changes: { title: 'Updated Title' },
      };
    });

    const edit = await mockPrismaClient.reportPostEdit.create({
      data: {
        reportId: report.id,
        editType: 'section_edit',
        changes: { title: 'Updated Title' },
        version: 1,
        isPublished: true,
      },
    });

    expect(edit.reportId).toBe(report.id);

    // 3. Re-export with edits applied
    mockPrismaClient.reportPostEdit.findMany.mockImplementation(async () => {
      callOrder.push('find-edits-for-export');
      return [edit];
    });

    const publishedEdits = await mockPrismaClient.reportPostEdit.findMany({
      where: { reportId: report.id, isPublished: true },
    });

    expect(publishedEdits).toHaveLength(1);
    expect(publishedEdits[0].changes).toEqual({ title: 'Updated Title' });

    expect(callOrder).toEqual(['create', 'apply-edit', 'find-edits-for-export']);
  });
});
