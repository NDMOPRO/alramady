import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { z } from 'zod';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const CanvasNodeSchema = z.object({
  id: z.string(),
  type: z.enum(['source', 'transform', 'filter', 'join', 'aggregate', 'output', 'ai', 'formula']),
  position: z.object({ x: z.number(), y: z.number() }),
  config: z.record(z.unknown()),
  label: z.string().optional(),
});

const CanvasEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
});

const CanvasPipelineSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  nodes: z.array(CanvasNodeSchema),
  edges: z.array(CanvasEdgeSchema),
});

// ─── Service ─────────────────────────────────────────────────────────────────

export class DataCanvasService {
  private getQueue(): Queue {
    return new Queue('data-pipeline-canvas', {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    });
  }

  async savePipeline(input: z.infer<typeof CanvasPipelineSchema>): Promise<unknown> {
    const validated = CanvasPipelineSchema.parse(input);
    const payloadId = randomUUID();

    const payload = await prisma.bridgePayload.create({
      data: {
        id: payloadId,
        tenantId: validated.tenantId,
        userId: validated.userId,
        sourceEngine: 'data',
        targetEngine: 'data',
        dataType: 'canvas-pipeline',
        payload: {
          name: validated.name,
          description: validated.description,
          nodes: validated.nodes,
          edges: validated.edges,
        },
        status: 'PENDING',
      },
    });

    return {
      pipelineId: payload.id,
      name: validated.name,
      nodeCount: validated.nodes.length,
      edgeCount: validated.edges.length,
      status: 'DRAFT',
      createdAt: payload.createdAt,
    };
  }

  async executePipeline(pipelineId: string, tenantId: string, userId: string): Promise<{
    jobId: string;
    pipelineId: string;
    status: string;
  }> {
    const pipeline = await prisma.bridgePayload.findFirst({
      where: { id: pipelineId, tenantId, dataType: 'canvas-pipeline' },
    });
    if (!pipeline) throw new Error('Pipeline not found');

    const queue = this.getQueue();
    const job = await queue.add('execute-canvas', {
      pipelineId,
      tenantId,
      userId,
      definition: pipeline.payload,
    });

    await prisma.bridgePayload.update({
      where: { id: pipelineId },
      data: { status: 'PROCESSING' },
    });

    return { jobId: job.id || '', pipelineId, status: 'running' };
  }

  async listPipelines(tenantId: string): Promise<unknown[]> {
    return prisma.bridgePayload.findMany({
      where: { tenantId, dataType: 'canvas-pipeline' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        payload: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getPipeline(pipelineId: string, tenantId: string): Promise<unknown> {
    const pipeline = await prisma.bridgePayload.findFirst({
      where: { id: pipelineId, tenantId, dataType: 'canvas-pipeline' },
    });
    if (!pipeline) throw new Error('Pipeline not found');
    return pipeline;
  }

  async deletePipeline(pipelineId: string, tenantId: string): Promise<void> {
    const pipeline = await prisma.bridgePayload.findFirst({
      where: { id: pipelineId, tenantId, dataType: 'canvas-pipeline' },
    });
    if (!pipeline) throw new Error('Pipeline not found');

    await prisma.bridgePayload.delete({ where: { id: pipelineId } });
  }
}
