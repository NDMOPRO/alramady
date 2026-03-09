/**
 * Fine-tuning Management Service — Rasid Platform
 * إدارة التدريب المخصص للنماذج عبر OpenAI Fine-tuning API
 */

import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' });

interface TrainingExample {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}

interface FineTuneJob {
  id: string;
  openaiJobId: string;
  tenantId: string;
  baseModel: string;
  status: 'validating' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  trainedTokens: number;
  epochs: number;
  trainingFileId: string;
  resultModelId?: string;
  createdAt: Date;
  finishedAt?: Date;
  error?: string;
}

interface FineTuneConfig {
  baseModel: 'gpt-4o-mini-2024-07-18' | 'gpt-3.5-turbo-0125';
  suffix: string;
  epochs?: number;
  learningRateMultiplier?: number;
  batchSize?: number;
}

export class FineTuningService {
  constructor(private prisma: PrismaClient) {}

  async uploadTrainingData(
    tenantId: string,
    examples: TrainingExample[]
  ): Promise<{ fileId: string; exampleCount: number; validationErrors: string[] }> {
    const validationErrors: string[] = [];

    for (let i = 0; i < examples.length; i++) {
      const ex = examples[i];
      if (!ex.messages || ex.messages.length < 2) {
        validationErrors.push(`Example ${i}: must have at least 2 messages`);
        continue;
      }

      const hasSystem = ex.messages.some(m => m.role === 'system');
      const hasUser = ex.messages.some(m => m.role === 'user');
      const hasAssistant = ex.messages.some(m => m.role === 'assistant');

      if (!hasUser || !hasAssistant) {
        validationErrors.push(`Example ${i}: must have at least one user and one assistant message`);
      }

      if (!hasSystem) {
        validationErrors.push(`Example ${i}: recommended to include a system message`);
      }

      for (const msg of ex.messages) {
        if (!msg.content || msg.content.trim().length === 0) {
          validationErrors.push(`Example ${i}: empty content in ${msg.role} message`);
        }
      }
    }

    if (examples.length < 10) {
      validationErrors.push('Minimum 10 training examples required (50+ recommended)');
    }

    const criticalErrors = validationErrors.filter(e => !e.includes('recommended'));
    if (criticalErrors.length > 0) {
      return { fileId: '', exampleCount: examples.length, validationErrors };
    }

    const jsonlContent = examples
      .map(ex => JSON.stringify({ messages: ex.messages }))
      .join('\n');

    const blob = new Blob([jsonlContent], { type: 'application/jsonl' });
    const file = new File([blob], `training_${tenantId}_${Date.now()}.jsonl`);

    const uploadedFile = await openai.files.create({
      file,
      purpose: 'fine-tune',
    });

    await this.prisma.trainingFile.create({
      data: {
        tenantId,
        openaiFileId: uploadedFile.id,
        exampleCount: examples.length,
        fileHash: createHash('sha256').update(jsonlContent).digest('hex'),
        status: 'uploaded',
        createdAt: new Date(),
      },
    });

    return {
      fileId: uploadedFile.id,
      exampleCount: examples.length,
      validationErrors,
    };
  }

  async createFineTuneJob(
    tenantId: string,
    trainingFileId: string,
    config: FineTuneConfig
  ): Promise<FineTuneJob> {
    const hyperparameters: Record<string, unknown> = {};
    if (config.epochs !== undefined) hyperparameters.n_epochs = config.epochs;
    if (config.learningRateMultiplier !== undefined) {
      hyperparameters.learning_rate_multiplier = config.learningRateMultiplier;
    }
    if (config.batchSize !== undefined) hyperparameters.batch_size = config.batchSize;

    const job = await openai.fineTuning.jobs.create({
      training_file: trainingFileId,
      model: config.baseModel,
      suffix: config.suffix,
      hyperparameters: Object.keys(hyperparameters).length > 0 ? hyperparameters : undefined,
    });

    const dbJob = await this.prisma.fineTuneJob.create({
      data: {
        tenantId,
        openaiJobId: job.id,
        baseModel: config.baseModel,
        trainingFileId,
        status: job.status,
        suffix: config.suffix,
        hyperparameters: JSON.stringify(hyperparameters),
        createdAt: new Date(),
      },
    });

    return {
      id: dbJob.id,
      openaiJobId: job.id,
      tenantId,
      baseModel: config.baseModel,
      status: job.status as FineTuneJob['status'],
      trainedTokens: 0,
      epochs: config.epochs ?? 3,
      trainingFileId,
      createdAt: dbJob.createdAt,
    };
  }

  async getJobStatus(jobId: string): Promise<FineTuneJob> {
    const dbJob = await this.prisma.fineTuneJob.findUniqueOrThrow({
      where: { id: jobId },
    });

    const openaiJob = await openai.fineTuning.jobs.retrieve(dbJob.openaiJobId);

    const statusChanged = openaiJob.status !== dbJob.status;

    if (statusChanged) {
      await this.prisma.fineTuneJob.update({
        where: { id: jobId },
        data: {
          status: openaiJob.status,
          resultModelId: openaiJob.fine_tuned_model ?? undefined,
          trainedTokens: openaiJob.trained_tokens ?? 0,
          finishedAt: openaiJob.finished_at ? new Date(openaiJob.finished_at * 1000) : undefined,
          error: openaiJob.error?.message ?? undefined,
        },
      });
    }

    return {
      id: dbJob.id,
      openaiJobId: dbJob.openaiJobId,
      tenantId: dbJob.tenantId,
      baseModel: dbJob.baseModel,
      status: openaiJob.status as FineTuneJob['status'],
      trainedTokens: openaiJob.trained_tokens ?? 0,
      epochs: JSON.parse(dbJob.hyperparameters as string).n_epochs ?? 3,
      trainingFileId: dbJob.trainingFileId,
      resultModelId: openaiJob.fine_tuned_model ?? undefined,
      createdAt: dbJob.createdAt,
      finishedAt: openaiJob.finished_at ? new Date(openaiJob.finished_at * 1000) : undefined,
      error: openaiJob.error?.message ?? undefined,
    };
  }

  async listJobs(tenantId: string): Promise<FineTuneJob[]> {
    const jobs = await this.prisma.fineTuneJob.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return jobs.map(j => ({
      id: j.id,
      openaiJobId: j.openaiJobId,
      tenantId: j.tenantId,
      baseModel: j.baseModel,
      status: j.status as FineTuneJob['status'],
      trainedTokens: j.trainedTokens ?? 0,
      epochs: JSON.parse(j.hyperparameters as string).n_epochs ?? 3,
      trainingFileId: j.trainingFileId,
      resultModelId: j.resultModelId ?? undefined,
      createdAt: j.createdAt,
      finishedAt: j.finishedAt ?? undefined,
      error: j.error ?? undefined,
    }));
  }

  async cancelJob(jobId: string): Promise<void> {
    const dbJob = await this.prisma.fineTuneJob.findUniqueOrThrow({
      where: { id: jobId },
    });

    await openai.fineTuning.jobs.cancel(dbJob.openaiJobId);

    await this.prisma.fineTuneJob.update({
      where: { id: jobId },
      data: { status: 'cancelled' },
    });
  }

  async getJobEvents(jobId: string): Promise<Array<{
    type: string;
    message: string;
    createdAt: Date;
  }>> {
    const dbJob = await this.prisma.fineTuneJob.findUniqueOrThrow({
      where: { id: jobId },
    });

    const events = await openai.fineTuning.jobs.listEvents(dbJob.openaiJobId, {
      limit: 100,
    });

    return events.data.map(e => ({
      type: e.type ?? 'message',
      message: e.message,
      createdAt: new Date(e.created_at * 1000),
    }));
  }

  async deleteModel(jobId: string): Promise<void> {
    const dbJob = await this.prisma.fineTuneJob.findUniqueOrThrow({
      where: { id: jobId },
    });

    if (!dbJob.resultModelId) {
      throw new Error('No fine-tuned model found for this job');
    }

    await openai.models.del(dbJob.resultModelId);

    await this.prisma.fineTuneJob.update({
      where: { id: jobId },
      data: { resultModelId: null, status: 'deleted' as string },
    });
  }

  async useFineTunedModel(
    jobId: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  ): Promise<{ content: string; model: string; usage: { promptTokens: number; completionTokens: number } }> {
    const dbJob = await this.prisma.fineTuneJob.findUniqueOrThrow({
      where: { id: jobId },
    });

    if (!dbJob.resultModelId) {
      throw new Error('Fine-tuned model not ready. Check job status.');
    }

    const response = await openai.chat.completions.create({
      model: dbJob.resultModelId,
      messages,
      temperature: 0.7,
    });

    return {
      content: response.choices[0]?.message?.content ?? '',
      model: dbJob.resultModelId,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }
}
