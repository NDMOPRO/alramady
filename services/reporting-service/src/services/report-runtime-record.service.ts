import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface EnsureRuntimeReportInput {
  reportId: string;
  tenantId: string;
  userId: string;
  name: string;
  description?: string | null;
  dataSources?: unknown;
  format?: string | null;
}

function normalizeReportFormat(format?: string | null) {
  if (!format) {
    return undefined;
  }

  const normalized = format.toUpperCase();
  if (['PDF', 'DOCX', 'HTML', 'XLSX', 'CSV', 'JSON', 'PPTX'].includes(normalized)) {
    return normalized as 'PDF' | 'DOCX' | 'HTML' | 'XLSX' | 'CSV' | 'JSON' | 'PPTX';
  }

  return undefined;
}

export async function ensureRuntimeReportRecord(input: EnsureRuntimeReportInput): Promise<void> {
  const existing = await prisma.report.findUnique({
    where: { id: input.reportId },
  });

  const metadata = {
    source: 'report_definitions',
    sourceReportDefinitionId: input.reportId,
    syncedAt: new Date().toISOString(),
  };

  if (existing) {
    await prisma.report.update({
      where: { id: input.reportId },
      data: {
        name: input.name,
        description: input.description ?? null,
        format: normalizeReportFormat(input.format),
        dataSources: input.dataSources ? JSON.parse(JSON.stringify(input.dataSources)) : undefined,
        metadata: JSON.parse(JSON.stringify(metadata)),
        updatedAt: new Date(),
      },
    });
    return;
  }

  await prisma.report.create({
    data: {
      id: input.reportId,
      tenantId: input.tenantId,
      name: input.name,
      description: input.description ?? null,
      type: 'definition',
      format: normalizeReportFormat(input.format),
      status: 'PENDING',
      dataSources: input.dataSources ? JSON.parse(JSON.stringify(input.dataSources)) : null,
      metadata: JSON.parse(JSON.stringify(metadata)),
      createdBy: input.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

export async function deleteRuntimeReportRecord(reportId: string): Promise<void> {
  await prisma.report.deleteMany({
    where: { id: reportId },
  });
}
