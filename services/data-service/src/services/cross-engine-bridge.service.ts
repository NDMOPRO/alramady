import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { z } from 'zod';

const prisma = new PrismaClient();

// ─── Engine URLs ─────────────────────────────────────────────────────────────

const ENGINE_URLS: Record<string, string> = {
  data: process.env.DATA_SERVICE_URL || 'http://data-service:3001',
  excel: process.env.EXCEL_SERVICE_URL || 'http://excel-service:3002',
  dashboard: process.env.DASHBOARD_SERVICE_URL || 'http://dashboard-service:3003',
  report: process.env.REPORTING_SERVICE_URL || 'http://reporting-service:3004',
  presentation: process.env.PRESENTATION_SERVICE_URL || 'http://presentation-service:3005',
  ai: process.env.AI_SERVICE_URL || 'http://ai-service:3006',
  replication: process.env.REPLICATION_SERVICE_URL || 'http://replication-service:3007',
  conversion: process.env.CONVERSION_SERVICE_URL || 'http://conversion-service:3008',
  localization: process.env.LOCALIZATION_SERVICE_URL || 'http://localization-service:3009',
  governance: process.env.GOVERNANCE_SERVICE_URL || 'http://governance-service:3010',
};

// ─── Schemas ─────────────────────────────────────────────────────────────────

const TransferDataSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  sourceEngine: z.string().min(1),
  targetEngine: z.string().min(1),
  dataId: z.string().min(1),
  transformOptions: z.record(z.unknown()).optional(),
});

// ─── Service ─────────────────────────────────────────────────────────────────

export class CrossEngineBridgeService {
  async transferData(input: z.infer<typeof TransferDataSchema>): Promise<{
    success: boolean;
    sourceEngine: string;
    targetEngine: string;
    targetId: string;
  }> {
    const validated = TransferDataSchema.parse(input);
    const { tenantId, userId, sourceEngine, targetEngine, dataId } = validated;

    const sourceUrl = ENGINE_URLS[sourceEngine];
    const targetUrl = ENGINE_URLS[targetEngine];

    if (!sourceUrl) throw new Error(`Unknown source engine: ${sourceEngine}`);
    if (!targetUrl) throw new Error(`Unknown target engine: ${targetEngine}`);

    const internalHeaders = {
      'X-Tenant-Id': tenantId,
      'X-Internal-Key': process.env.INTERNAL_API_KEY || '',
    };

    // Fetch data from source engine
    const sourceResponse = await axios.get(
      `${sourceUrl}/internal/export/${dataId}`,
      { headers: internalHeaders, timeout: 60000 },
    );

    // Send data to target engine
    const targetResponse = await axios.post(
      `${targetUrl}/internal/import`,
      {
        data: sourceResponse.data,
        tenantId,
        sourceEngine,
        sourceDataId: dataId,
        transformOptions: validated.transformOptions,
      },
      { headers: internalHeaders, timeout: 60000 },
    );

    // Record the transfer in bridge payloads and lineage
    const payload = await prisma.bridgePayload.create({
      data: {
        tenantId,
        userId,
        sourceEngine,
        targetEngine,
        dataType: 'cross-engine-transfer',
        payload: {
          sourceDataId: dataId,
          targetDataId: targetResponse.data?.id,
          transformOptions: validated.transformOptions,
        },
        status: 'COMPLETED',
      },
    });

    await prisma.dataLineage.create({
      data: {
        payloadId: payload.id,
        tenantId,
        userId,
        sourceEngine,
        targetEngine,
        dataType: 'transfer',
        transformations: validated.transformOptions ? [validated.transformOptions] : [],
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'EXECUTE',
        resourceType: 'DATASET',
        resourceId: dataId,
        resourceName: `Cross-engine transfer: ${sourceEngine} -> ${targetEngine}`,
        metadata: { sourceEngine, targetEngine, dataId },
      },
    });

    return {
      success: true,
      sourceEngine,
      targetEngine,
      targetId: targetResponse.data?.id || '',
    };
  }

  async getAvailableEngines(): Promise<Array<{ name: string; status: string }>> {
    const results = await Promise.allSettled(
      Object.entries(ENGINE_URLS).map(async ([name, url]) => {
        await axios.get(`${url}/health`, { timeout: 3000 });
        return { name, status: 'healthy' };
      }),
    );

    return results.map((result, index) => ({
      name: Object.keys(ENGINE_URLS)[index],
      status: result.status === 'fulfilled' ? 'healthy' : 'unhealthy',
    }));
  }

  async getTransferHistory(tenantId: string): Promise<unknown[]> {
    return prisma.bridgePayload.findMany({
      where: { tenantId, dataType: 'cross-engine-transfer' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        lineage: true,
      },
    });
  }
}
