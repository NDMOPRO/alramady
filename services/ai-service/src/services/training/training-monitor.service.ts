import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import * as crypto from 'crypto';
import winston from 'winston';
import { z } from 'zod';

// ─── Logger ──────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  defaultMeta: { service: 'training-monitor' },
  transports: [new winston.transports.Console()],
});

// ─── Interfaces ──────────────────────────────────────────────────────

export interface TrainingMetrics {
  jobId: string;
  status: string;
  currentEpoch: number;
  totalEpochs: number;
  trainLoss: number[];
  trainAccuracy: number[];
  validationLoss: number[];
  validationAccuracy: number[];
  learningRate: number[];
  stepMetrics: StepMetric[];
  estimatedTimeRemaining: number;
  elapsedTime: number;
  progress: number;
}

export interface StepMetric {
  step: number;
  epoch: number;
  trainLoss: number;
  trainAccuracy: number | null;
  validationLoss: number | null;
  validationAccuracy: number | null;
  learningRate: number | null;
  timestamp: Date;
}

export interface ResourceUtilization {
  gpuUtilization: number;
  gpuMemoryUsed: number;
  gpuMemoryTotal: number;
  cpuUtilization: number;
  memoryUsed: number;
  memoryTotal: number;
  diskUsed: number;
  diskTotal: number;
  timestamp: Date;
}

export interface EarlyStoppingStatus {
  shouldStop: boolean;
  reason: string | null;
  bestEpoch: number;
  bestMetricValue: number;
  epochsWithoutImprovement: number;
  patience: number;
}

export interface TrainingAnomaly {
  id: string;
  jobId: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  detectedAt: Date;
  metricValues: Record<string, number>;
}

export interface TrainingAlert {
  id: string;
  jobId: string;
  alertType: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  acknowledged: boolean;
  createdAt: Date;
}

// ─── Service ─────────────────────────────────────────────────────────

export class TrainingMonitorService {
  private openai: OpenAI;
  private monitorTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(private prisma: PrismaClient) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  // ── Get Training Metrics ────────────────────────────────────────

  async getTrainingMetrics(jobId: string, tenantId: string): Promise<TrainingMetrics> {
    const job = await this.prisma.trainingJob.findFirst({
      where: { id: jobId, tenantId },
    });

    if (!job) {
      throw new Error(`Training job not found: ${jobId}`);
    }

    const typed = job as Record<string, unknown>;

    const trainLoss = (typed.trainLoss as number[]) || [];
    const trainAccuracy = (typed.trainAccuracy as number[]) || [];
    const validationLoss = (typed.validationLoss as number[]) || [];
    const validationAccuracy = (typed.validationAccuracy as number[]) || [];
    const currentEpoch = (typed.currentEpoch as number) || 0;
    const totalEpochs = (typed.totalEpochs as number) || 0;
    const status = (typed.status as string) || 'unknown';

    // Build step metrics
    const stepMetrics: StepMetric[] = [];
    const maxSteps = Math.max(trainLoss.length, trainAccuracy.length, validationLoss.length);

    for (let i = 0; i < maxSteps; i++) {
      stepMetrics.push({
        step: i + 1,
        epoch: totalEpochs > 0 ? Math.floor((i / maxSteps) * totalEpochs) + 1 : 1,
        trainLoss: trainLoss[i] ?? 0,
        trainAccuracy: trainAccuracy[i] ?? null,
        validationLoss: validationLoss[i] ?? null,
        validationAccuracy: validationAccuracy[i] ?? null,
        learningRate: null,
        timestamp: new Date(
          (typed.createdAt as Date).getTime() + i * 30000,
        ),
      });
    }

    // Compute progress and time estimates
    const progress = totalEpochs > 0 ? Math.min(1, currentEpoch / totalEpochs) : 0;
    const createdAt = typed.createdAt as Date;
    const elapsedTime = Date.now() - createdAt.getTime();
    const estimatedTimeRemaining = progress > 0
      ? (elapsedTime / progress) * (1 - progress)
      : 0;

    return {
      jobId,
      status,
      currentEpoch,
      totalEpochs,
      trainLoss,
      trainAccuracy,
      validationLoss,
      validationAccuracy,
      learningRate: [],
      stepMetrics,
      estimatedTimeRemaining: Math.round(estimatedTimeRemaining / 1000),
      elapsedTime: Math.round(elapsedTime / 1000),
      progress: Math.round(progress * 10000) / 10000,
    };
  }

  // ── Get Resource Utilization ────────────────────────────────────

  async getResourceUtilization(jobId: string, tenantId: string): Promise<ResourceUtilization> {
    const job = await this.prisma.trainingJob.findFirst({
      where: { id: jobId, tenantId },
    });

    if (!job) {
      throw new Error(`Training job not found: ${jobId}`);
    }

    // Since we use OpenAI API for fine-tuning, resource utilization is
    // approximated from the job status and metrics
    const typed = job as Record<string, unknown>;
    const status = typed.status as string;

    const memUsage = process.memoryUsage();

    const isActive = ['running', 'validating_files', 'queued'].includes(status);

    return {
      gpuUtilization: isActive ? 85 : 0,
      gpuMemoryUsed: isActive ? 12288 : 0,
      gpuMemoryTotal: 16384,
      cpuUtilization: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
      memoryUsed: Math.round(memUsage.rss / 1024 / 1024),
      memoryTotal: Math.round(require('os').totalmem() / 1024 / 1024),
      diskUsed: 0,
      diskTotal: 0,
      timestamp: new Date(),
    };
  }

  // ── Early Stopping Detection ────────────────────────────────────

  async checkEarlyStopping(
    jobId: string,
    tenantId: string,
    patience: number = 3,
    minDelta: number = 0.001,
  ): Promise<EarlyStoppingStatus> {
    const metrics = await this.getTrainingMetrics(jobId, tenantId);

    const validationLoss = metrics.validationLoss.length > 0
      ? metrics.validationLoss
      : metrics.trainLoss;

    if (validationLoss.length < 2) {
      return {
        shouldStop: false,
        reason: null,
        bestEpoch: 1,
        bestMetricValue: validationLoss[0] ?? Infinity,
        epochsWithoutImprovement: 0,
        patience,
      };
    }

    let bestValue = Infinity;
    let bestEpoch = 1;
    let epochsWithoutImprovement = 0;

    for (let i = 0; i < validationLoss.length; i++) {
      if (validationLoss[i] < bestValue - minDelta) {
        bestValue = validationLoss[i];
        bestEpoch = i + 1;
        epochsWithoutImprovement = 0;
      } else {
        epochsWithoutImprovement++;
      }
    }

    const shouldStop = epochsWithoutImprovement >= patience;
    let reason: string | null = null;

    if (shouldStop) {
      reason = `Validation loss has not improved for ${epochsWithoutImprovement} epochs. ` +
        `Best loss: ${bestValue.toFixed(6)} at epoch ${bestEpoch}.`;
    }

    return {
      shouldStop,
      reason,
      bestEpoch,
      bestMetricValue: Math.round(bestValue * 100000) / 100000,
      epochsWithoutImprovement,
      patience,
    };
  }

  // ── Anomaly Detection ───────────────────────────────────────────

  async detectAnomalies(jobId: string, tenantId: string): Promise<TrainingAnomaly[]> {
    const metrics = await this.getTrainingMetrics(jobId, tenantId);
    const anomalies: TrainingAnomaly[] = [];

    const trainLoss = metrics.trainLoss;
    const validationLoss = metrics.validationLoss;

    if (trainLoss.length < 3) return anomalies;

    // 1. Loss spike detection
    for (let i = 2; i < trainLoss.length; i++) {
      const avgPrev = (trainLoss[i - 1] + trainLoss[i - 2]) / 2;
      if (trainLoss[i] > avgPrev * 2) {
        anomalies.push({
          id: crypto.randomUUID(),
          jobId,
          type: 'loss_spike',
          severity: 'warning',
          message: `Training loss spiked at step ${i + 1}: ${trainLoss[i].toFixed(4)} (previous avg: ${avgPrev.toFixed(4)})`,
          detectedAt: new Date(),
          metricValues: { currentLoss: trainLoss[i], previousAvg: avgPrev },
        });
      }
    }

    // 2. Loss plateau detection
    if (trainLoss.length >= 5) {
      const lastFive = trainLoss.slice(-5);
      const range = Math.max(...lastFive) - Math.min(...lastFive);
      if (range < 0.0001) {
        anomalies.push({
          id: crypto.randomUUID(),
          jobId,
          type: 'loss_plateau',
          severity: 'info',
          message: `Training loss appears to have plateaued. Range over last 5 steps: ${range.toFixed(6)}`,
          detectedAt: new Date(),
          metricValues: { range, lastLoss: lastFive[lastFive.length - 1] },
        });
      }
    }

    // 3. Loss divergence (NaN or very high)
    for (let i = 0; i < trainLoss.length; i++) {
      if (isNaN(trainLoss[i]) || trainLoss[i] > 100) {
        anomalies.push({
          id: crypto.randomUUID(),
          jobId,
          type: 'loss_divergence',
          severity: 'critical',
          message: `Training loss diverged at step ${i + 1}: ${trainLoss[i]}. Consider reducing learning rate.`,
          detectedAt: new Date(),
          metricValues: { loss: trainLoss[i], step: i + 1 },
        });
        break;
      }
    }

    // 4. Overfitting detection
    if (validationLoss.length >= 3 && trainLoss.length >= 3) {
      const lastTrainLoss = trainLoss[trainLoss.length - 1];
      const lastValLoss = validationLoss[validationLoss.length - 1];

      if (lastValLoss > lastTrainLoss * 1.5) {
        anomalies.push({
          id: crypto.randomUUID(),
          jobId,
          type: 'overfitting',
          severity: 'warning',
          message: `Possible overfitting detected. Train loss: ${lastTrainLoss.toFixed(4)}, Validation loss: ${lastValLoss.toFixed(4)}`,
          detectedAt: new Date(),
          metricValues: { trainLoss: lastTrainLoss, validationLoss: lastValLoss },
        });
      }

      // Check if validation loss is increasing while train loss decreasing
      const valTrend = validationLoss[validationLoss.length - 1] - validationLoss[validationLoss.length - 3];
      const trainTrend = trainLoss[trainLoss.length - 1] - trainLoss[trainLoss.length - 3];

      if (valTrend > 0 && trainTrend < 0) {
        anomalies.push({
          id: crypto.randomUUID(),
          jobId,
          type: 'overfitting_trend',
          severity: 'warning',
          message: 'Validation loss is increasing while training loss is decreasing. Training should likely be stopped.',
          detectedAt: new Date(),
          metricValues: { validationTrend: valTrend, trainTrend: trainTrend },
        });
      }
    }

    // 5. Training too slow
    if (metrics.elapsedTime > 0 && metrics.progress > 0) {
      const estimatedTotal = metrics.elapsedTime / metrics.progress;
      if (estimatedTotal > 24 * 3600) { // More than 24 hours
        anomalies.push({
          id: crypto.randomUUID(),
          jobId,
          type: 'slow_training',
          severity: 'info',
          message: `Training is estimated to take ${Math.round(estimatedTotal / 3600)} hours. Consider reducing dataset size or epochs.`,
          detectedAt: new Date(),
          metricValues: { estimatedTotalSeconds: estimatedTotal, progress: metrics.progress },
        });
      }
    }

    // Store anomalies
    if (anomalies.length > 0) {
      await this.prisma.trainingAnomaly.createMany({
        data: anomalies.map((a) => ({
          id: a.id,
          jobId: a.jobId,
          type: a.type,
          severity: a.severity,
          message: a.message,
          metricValues: JSON.stringify(a.metricValues),
          detectedAt: a.detectedAt,
        })),
      });
    }

    logger.info('Anomaly detection complete', { jobId, anomalyCount: anomalies.length });

    return anomalies;
  }

  // ── Get Anomalies ───────────────────────────────────────────────

  async getAnomalies(jobId: string): Promise<TrainingAnomaly[]> {
    const anomalies = await this.prisma.trainingAnomaly.findMany({
      where: { jobId },
      orderBy: { detectedAt: 'desc' },
    });

    return anomalies.map((a: Record<string, unknown>) => {
      let metricValues: Record<string, number>;
      try {
        const raw = a.metricValues;
        metricValues = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, number>) || {};
      } catch {
        metricValues = {};
      }

      return {
        id: a.id as string,
        jobId: a.jobId as string,
        type: a.type as string,
        severity: a.severity as TrainingAnomaly['severity'],
        message: a.message as string,
        detectedAt: a.detectedAt as Date,
        metricValues,
      };
    });
  }

  // ── Create Alert ────────────────────────────────────────────────

  async createAlert(
    jobId: string,
    alertType: string,
    severity: 'info' | 'warning' | 'critical',
    message: string,
  ): Promise<TrainingAlert> {
    const alert = await this.prisma.trainingAlert.create({
      data: {
        id: crypto.randomUUID(),
        jobId,
        alertType,
        severity,
        message,
        acknowledged: false,
        createdAt: new Date(),
      },
    });

    logger.info('Alert created', { jobId, alertType, severity });

    return {
      id: alert.id as string,
      jobId: (alert as Record<string, unknown>).jobId as string,
      alertType: (alert as Record<string, unknown>).alertType as string,
      severity: (alert as Record<string, unknown>).severity as TrainingAlert['severity'],
      message: (alert as Record<string, unknown>).message as string,
      acknowledged: false,
      createdAt: (alert as Record<string, unknown>).createdAt as Date,
    };
  }

  // ── Get Alerts ──────────────────────────────────────────────────

  async getAlerts(
    jobId: string,
    options: { unacknowledgedOnly?: boolean } = {},
  ): Promise<TrainingAlert[]> {
    const where: Record<string, unknown> = { jobId };
    if (options.unacknowledgedOnly) where.acknowledged = false;

    const alerts = await this.prisma.trainingAlert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return alerts.map((a: Record<string, unknown>) => ({
      id: a.id as string,
      jobId: a.jobId as string,
      alertType: a.alertType as string,
      severity: a.severity as TrainingAlert['severity'],
      message: a.message as string,
      acknowledged: (a.acknowledged as boolean) || false,
      createdAt: a.createdAt as Date,
    }));
  }

  // ── Acknowledge Alert ───────────────────────────────────────────

  async acknowledgeAlert(alertId: string): Promise<void> {
    await this.prisma.trainingAlert.update({
      where: { id: alertId },
      data: { acknowledged: true },
    });
  }

  // ── Start Monitoring Job ────────────────────────────────────────

  startMonitoring(jobId: string, tenantId: string): void {
    if (this.monitorTimers.has(jobId)) return;

    logger.info('Starting training monitoring', { jobId });

    const timer = setInterval(async () => {
      try {
        const job = await this.prisma.trainingJob.findFirst({
          where: { id: jobId, tenantId },
        });

        if (!job) {
          this.stopMonitoring(jobId);
          return;
        }

        const typed = job as Record<string, unknown>;
        const status = typed.status as string;

        // Check if job is in terminal state
        if (['succeeded', 'failed', 'cancelled'].includes(status)) {
          if (status === 'failed') {
            await this.createAlert(jobId, 'training_failed', 'critical',
              `Training job failed: ${(typed.error as string) || 'Unknown error'}`);
          }

          if (status === 'succeeded') {
            await this.createAlert(jobId, 'training_completed', 'info',
              `Training completed successfully. Model: ${typed.fineTunedModel || 'N/A'}`);
          }

          this.stopMonitoring(jobId);
          return;
        }

        // Detect anomalies periodically
        const anomalies = await this.detectAnomalies(jobId, tenantId);

        for (const anomaly of anomalies) {
          if (anomaly.severity === 'critical') {
            await this.createAlert(jobId, anomaly.type, 'critical', anomaly.message);
          }
        }

        // Check early stopping
        const earlyStop = await this.checkEarlyStopping(jobId, tenantId);
        if (earlyStop.shouldStop) {
          await this.createAlert(jobId, 'early_stopping_recommended', 'warning',
            earlyStop.reason || 'Early stopping conditions met');
        }
      } catch (err) {
        logger.error('Monitoring error', {
          jobId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, 60_000);

    this.monitorTimers.set(jobId, timer);
  }

  // ── Stop Monitoring ─────────────────────────────────────────────

  stopMonitoring(jobId: string): void {
    const timer = this.monitorTimers.get(jobId);
    if (timer) {
      clearInterval(timer);
      this.monitorTimers.delete(jobId);
      logger.info('Stopped monitoring', { jobId });
    }
  }

  // ── Stop All Monitoring ─────────────────────────────────────────

  stopAllMonitoring(): void {
    for (const [jobId, timer] of this.monitorTimers) {
      clearInterval(timer);
      logger.info('Stopped monitoring for job', { jobId });
    }
    this.monitorTimers.clear();
  }
}
