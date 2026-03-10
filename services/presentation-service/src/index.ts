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
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { authMiddleware } from './middleware/auth.js';
import { tenantMiddleware } from './middleware/tenant.js';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'presentation-service' },
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
const PORT = process.env.PORT || 8005;

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
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));
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
    service: 'presentation-service',
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

app.get('/api/v1/presentation/ready', (_req, res) => {
  res.status(dbConnected && redisConnected ? 200 : 503).json({
    ready: dbConnected && redisConnected,
  });
});

import presentationRoutes from './routes/presentation.routes.js';
import aiMediaRoutes from './routes/ai-media.routes.js';
import websiteBuilderRoutes from './routes/website-builder.routes.js';
import visualReplicationRoutes from './routes/visual-replication.routes.js';
import advancedEditRoutes from './routes/advanced-edit.js';
import aiContentRoutes from './routes/ai-content.js';
import animationRoutes from './routes/animation.js';
import collaborationRoutes from './routes/collaboration.js';
import exportShareRoutes from './routes/export-share.js';
import integrationRoutes from './routes/integration.js';
import multiSourceRoutes from './routes/multi-source.js';
import smartDesignRoutes from './routes/smart-design.js';
import templatesThemesRoutes from './routes/templates-themes.routes.js';
import collaborationLiveRoutes from './routes/collaboration-live.routes.js';
import interactiveRoutes from './routes/interactive.routes.js';
import infographicRoutes from './routes/infographic.routes.js';
import editingRoutes from './routes/editing.routes.js';
import exportPublishRoutes from './routes/export-publish.routes.js';
import generateRoutes from './routes/generate.routes.js';
import aiGenerationRoutes from './routes/ai-generation.routes.js';
import animationTransitionRoutes from './routes/animation-transition.routes.js';
import integrationImportRoutes from './routes/integration-import.routes.js';

app.use('/api/v1/presentation', authMiddleware, tenantMiddleware, presentationRoutes);
app.use('/api/v1/presentation/ai-media', authMiddleware, tenantMiddleware, aiMediaRoutes);
app.use('/api/v1/presentation/website-builder', authMiddleware, tenantMiddleware, websiteBuilderRoutes);
app.use('/api/v1/presentation/replicate', authMiddleware, tenantMiddleware, visualReplicationRoutes);
app.use('/api/v1/presentation/advanced-edit', authMiddleware, tenantMiddleware, advancedEditRoutes);
app.use('/api/v1/presentation/ai-content', authMiddleware, tenantMiddleware, aiContentRoutes);
app.use('/api/v1/presentation/animation', authMiddleware, tenantMiddleware, animationRoutes);
app.use('/api/v1/presentation/collaboration', authMiddleware, tenantMiddleware, collaborationRoutes);
app.use('/api/v1/presentation/export-share', authMiddleware, tenantMiddleware, exportShareRoutes);
app.use('/api/v1/presentation/integration', authMiddleware, tenantMiddleware, integrationRoutes);
app.use('/api/v1/presentation/multi-source', authMiddleware, tenantMiddleware, multiSourceRoutes);
app.use('/api/v1/presentation/smart-design', authMiddleware, tenantMiddleware, smartDesignRoutes);
app.use('/api/v1/presentation/templates-themes', authMiddleware, tenantMiddleware, templatesThemesRoutes);
app.use('/api/v1/presentation/collab', authMiddleware, tenantMiddleware, collaborationLiveRoutes);
app.use('/api/v1/presentation/interactive', authMiddleware, tenantMiddleware, interactiveRoutes);
app.use('/api/v1/presentation/infographic', authMiddleware, tenantMiddleware, infographicRoutes);
app.use('/api/v1/presentation/editing', authMiddleware, tenantMiddleware, editingRoutes);
app.use('/api/v1/presentation/export-publish', authMiddleware, tenantMiddleware, exportPublishRoutes);
app.use('/api/v1/presentation/generate', authMiddleware, tenantMiddleware, generateRoutes);
app.use('/api/v1/presentation/ai', authMiddleware, tenantMiddleware, aiGenerationRoutes);
app.use('/api/v1/presentation/animations', authMiddleware, tenantMiddleware, animationTransitionRoutes);
app.use('/api/v1/presentation/integrations', authMiddleware, tenantMiddleware, integrationImportRoutes);

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
      logger.info(`presentation-service running on port ${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error('Failed to start presentation-service', { error });
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
