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

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'reporting-service' },
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
const PORT = process.env.PORT || 8004;

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
    service: 'reporting-service',
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

app.get('/api/v1/reporting/ready', (_req, res) => {
  res.status(dbConnected && redisConnected ? 200 : 503).json({
    ready: dbConnected && redisConnected,
  });
});

// Mount service routes
import reportingRoutes from './routes/reporting.routes.js';
import easyModeRoutes from './routes/easy-mode.routes.js';
import advancedModeRoutes from './routes/advanced-mode.routes.js';
import postEditRoutes from './routes/post-edit.routes.js';
import templateLibraryRoutes from './routes/template-library.routes.js';
import externalSimulationRoutes from './routes/external-simulation.routes.js';
import compareScheduleRoutes from './routes/compare-schedule.routes.js';
import distributionRoutes from './routes/distribution.routes.js';
import interactiveRoutes from './routes/interactive.routes.js';
import toolsRoutes from './routes/tools.routes.js';

app.use('/api/v1/reporting', reportingRoutes);
app.use('/api/v1/reporting/easy-mode', easyModeRoutes);
app.use('/api/v1/reporting/advanced-mode', advancedModeRoutes);
app.use('/api/v1/reporting/post-edit', postEditRoutes);
app.use('/api/v1/reporting/templates', templateLibraryRoutes);
app.use('/api/v1/reporting/external-simulation', externalSimulationRoutes);
app.use('/api/v1/reporting/compare', compareScheduleRoutes);
app.use('/api/v1/reporting/distribution', distributionRoutes);
app.use('/api/v1/reporting/interactive', interactiveRoutes);
app.use('/api/v1/tools', toolsRoutes);

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
      logger.info(`reporting-service running on port ${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error('Failed to start reporting-service', { error });
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
