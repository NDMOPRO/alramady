import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import winston from 'winston';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

// Route imports
import capacityRoutes from './routes/capacity.routes.js';
import classificationRoutes from './routes/classification.routes.js';
import readingRoutes from './routes/reading.routes.js';
import columnsRoutes from './routes/columns.routes.js';
import tablesRoutes from './routes/tables.routes.js';
import visualProcessingRoutes from './routes/visual-processing.routes.js';
import mixedFilesRoutes from './routes/mixed-files.routes.js';
import connectorsRoutes from './routes/connectors.routes.js';
import dataRoutes from './routes/data.routes.js';
import importRoutes from './routes/import.routes.js';
import sourcesRoutes from './routes/sources.routes.js';
import cleansingRoutes from './routes/cleansing.routes.js';
import kpiRegistryRoutes from './routes/kpi-registry.routes.js';
import scheduledSyncRoutes from './routes/scheduled-sync.routes.js';
import resumableUploadRoutes from './routes/resumable-upload.routes.js';
import knowledgeGraphRoutes from './routes/knowledge-graph.routes.js';
import dataPipelineRoutes from './routes/data-pipeline.routes.js';
import dataCatalogRoutes from './routes/data-catalog.routes.js';
import brandAssetRoutes from './routes/brand-asset.routes.js';
import competitorResearchRoutes from './routes/competitor-research.routes.js';
import webIntelligenceRoutes from './routes/web-intelligence.routes.js';
import sqlQueryRoutes from './routes/sql-query.routes.js';
import formulaEngineRoutes from './routes/formula-engine.routes.js';
import nlQueryRoutes from './routes/nl-query.routes.js';
import keyDetectionRoutes from './routes/key-detection.routes.js';
import semanticDiscoveryRoutes from './routes/semantic-discovery.routes.js';
import streamingPipelineRoutes from './routes/streaming-pipeline.routes.js';
import distributedQueryRoutes from './routes/distributed-query.routes.js';
import joinBuilderRoutes from './routes/join-builder.routes.js';
import tableDiffRoutes from './routes/table-diff.routes.js';
import patternDiscoveryRoutes from './routes/pattern-discovery.routes.js';
import predictiveEngineRoutes from './routes/predictive-engine.routes.js';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'data-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

const app = express();
const PORT = process.env.PORT || 8001;

const prisma = new PrismaClient({
  log: [
    { level: 'error', emit: 'event' },
    { level: 'warn', emit: 'event' },
  ],
});

prisma.$on('error' as never, (e: { message: string }) => {
  logger.error('Prisma error', { message: e.message });
});

prisma.$on('warn' as never, (e: { message: string }) => {
  logger.warn('Prisma warning', { message: e.message });
});

const redisUrl = process.env.REDIS_URL;
const redis = redisUrl ? new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    if (times > 10) return null;
    return Math.min(times * 200, 5000);
  },
  lazyConnect: true,
}) : new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    if (times > 10) return null;
    return Math.min(times * 200, 5000);
  },
  lazyConnect: true,
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error('Redis error', { error: err.message }));

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests, please try again later',
    code: 'RATE_LIMIT_EXCEEDED',
  },
});

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'x-tenant-id', 'x-user-id'],
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(limiter);

let dbConnected = false;
let redisConnected = false;

app.get('/health', async (_req, res) => {
  const memoryUsage = process.memoryUsage();

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbConnected = true;
  } catch {
    dbConnected = false;
  }

  try {
    await redis.ping();
    redisConnected = true;
  } catch {
    redisConnected = false;
  }

  const healthy = dbConnected;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'degraded',
    service: 'data-service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
    },
    connections: {
      database: dbConnected ? 'connected' : 'disconnected',
      redis: redisConnected ? 'connected' : 'disconnected',
    },
  });
});

app.get('/api/v1/data/ready', (_req, res) => {
  res.status(dbConnected && redisConnected ? 200 : 503).json({
    ready: dbConnected && redisConnected,
  });
});

// Mount service routes
app.use('/api/v1/data/capacity', capacityRoutes);
app.use('/api/v1/data/classification', classificationRoutes);
app.use('/api/v1/data/reading', readingRoutes);
app.use('/api/v1/data/columns', columnsRoutes);
app.use('/api/v1/data/tables', tablesRoutes);
app.use('/api/v1/data/visual-processing', visualProcessingRoutes);
app.use('/api/v1/data/mixed-files', mixedFilesRoutes);
app.use('/api/v1/data/connectors', connectorsRoutes);
app.use('/api/v1/data', dataRoutes);
app.use('/api/v1/data/import', importRoutes);
app.use('/api/v1/data/sources', sourcesRoutes);
app.use('/api/v1/data/cleansing', cleansingRoutes);
app.use('/api/v1/data/kpi-registry', kpiRegistryRoutes);
app.use('/api/v1/data/scheduled-sync', scheduledSyncRoutes);
app.use('/api/v1/data/resumable-upload', resumableUploadRoutes);
app.use('/api/v1/data/knowledge-graph', knowledgeGraphRoutes);
app.use('/api/v1/data/pipeline', dataPipelineRoutes);
app.use('/api/v1/data/catalog', dataCatalogRoutes);
app.use('/api/v1/data/brand-assets', brandAssetRoutes);
app.use('/api/v1/data/competitor-research', competitorResearchRoutes);
app.use('/api/v1/data/web-intelligence', webIntelligenceRoutes);
app.use('/api/v1/data/sql', sqlQueryRoutes);
app.use('/api/v1/data/formula', formulaEngineRoutes);
app.use('/api/v1/data/nl-query', nlQueryRoutes);
app.use('/api/v1/data/key-detection', keyDetectionRoutes);
app.use('/api/v1/data/semantic-discovery', semanticDiscoveryRoutes);
app.use('/api/v1/data/streaming', streamingPipelineRoutes);
app.use('/api/v1/data/distributed-query', distributedQueryRoutes);
app.use('/api/v1/data/joins', joinBuilderRoutes);
app.use('/api/v1/data/diff', tableDiffRoutes);
app.use('/api/v1/data/patterns', patternDiscoveryRoutes);
app.use('/api/v1/data/predictive', predictiveEngineRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

async function bootstrap(): Promise<void> {
  try {
    await prisma.$connect();
    dbConnected = true;
    logger.info('Database connected');

    try {
      await redis.connect();
      redisConnected = true;
      logger.info('Redis connected');
    } catch (redisErr) {
      logger.warn('Redis connection failed, continuing without cache', { error: redisErr });
      redisConnected = false;
    }

    app.listen(PORT, () => {
      logger.info(`data-service running on port ${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error('Failed to start data-service', { error });
    process.exit(1);
  }
}

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    await prisma.$disconnect();
    logger.info('Database disconnected');
  } catch (err) {
    logger.error('Error disconnecting database', { error: err });
  }

  try {
    await redis.quit();
    logger.info('Redis disconnected');
  } catch (err) {
    logger.error('Error disconnecting Redis', { error: err });
  }

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  process.exit(1);
});

bootstrap();

export { app, prisma, redis, logger };
