import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { z } from 'zod';

const prisma = new PrismaClient();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const LakehouseQuerySchema = z.object({
  tenantId: z.string().uuid(),
  query: z.string().min(1),
  engine: z.enum(['duckdb', 'clickhouse', 'arrow']).default('duckdb'),
  limit: z.number().max(1000000).default(10000),
});

const CreateTableSchema = z.object({
  tenantId: z.string().uuid(),
  datasetId: z.string().uuid(),
  schema: z.record(z.unknown()),
  partitionBy: z.string().optional(),
  fileFormat: z.enum(['parquet', 'orc', 'avro', 'iceberg']).default('parquet'),
});

// ─── Service ─────────────────────────────────────────────────────────────────

export class LakehouseService {
  private getQueue(engine: string): Queue {
    return new Queue(`lakehouse-${engine}`, {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    });
  }

  async executeAnalyticsQuery(input: z.infer<typeof LakehouseQuerySchema>): Promise<{
    jobId: string;
    status: string;
    engine: string;
  }> {
    const validated = LakehouseQuerySchema.parse(input);

    await prisma.tenant.findUniqueOrThrow({ where: { id: validated.tenantId } });

    await prisma.auditLog.create({
      data: {
        tenantId: validated.tenantId,
        action: 'EXECUTE',
        resourceType: 'DATASET',
        resourceId: validated.tenantId,
        resourceName: `Lakehouse query (${validated.engine})`,
        metadata: { engine: validated.engine, queryLength: validated.query.length },
      },
    });

    const queue = this.getQueue(validated.engine);
    const job = await queue.add('analytics-query', {
      query: validated.query,
      limit: validated.limit,
      tenantId: validated.tenantId,
    });

    return { jobId: job.id || '', status: 'queued', engine: validated.engine };
  }

  async getQueryStatus(jobId: string, engine: string): Promise<{
    jobId: string;
    state: string;
    result: unknown;
  }> {
    const queue = this.getQueue(engine);
    const job = await queue.getJob(jobId);
    if (!job) throw new Error('Job not found');

    const state = await job.getState();
    return { jobId, state, result: job.returnvalue };
  }

  async createLakehouseTable(input: z.infer<typeof CreateTableSchema>): Promise<unknown> {
    const validated = CreateTableSchema.parse(input);

    const dataset = await prisma.dataset.findFirst({
      where: { id: validated.datasetId, tenantId: validated.tenantId },
    });
    if (!dataset) throw new Error('Dataset not found');

    return prisma.dataset.update({
      where: { id: validated.datasetId },
      data: {
        metadata: {
          ...(dataset.metadata as Record<string, unknown> || {}),
          lakehouseEnabled: true,
          lakehouseSchema: validated.schema,
          fileFormat: validated.fileFormat,
          partitionBy: validated.partitionBy,
        },
      },
    });
  }

  async listLakehouseTables(tenantId: string): Promise<unknown[]> {
    const datasets = await prisma.dataset.findMany({
      where: { tenantId },
      select: { id: true, name: true, metadata: true, rowCount: true, createdAt: true },
    });

    return datasets.filter((d) => {
      const meta = d.metadata as Record<string, unknown> | null;
      return meta?.lakehouseEnabled === true;
    });
  }
}
