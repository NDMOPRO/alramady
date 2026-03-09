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
  defaultMeta: { service: 'localization-service' },
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
const PORT = process.env.PORT || 8008;

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

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    if (times > 10) {
      logger.error('Redis max retries reached, giving up');
      return null;
    }
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
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

  const healthy = dbConnected && redisConnected;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'degraded',
    service: 'localization-service',
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

app.get('/api/v1/localization/ready', (_req, res) => {
  res.status(dbConnected && redisConnected ? 200 : 503).json({
    ready: dbConnected && redisConnected,
  });
});

import localizationRoutes from './routes/localization.routes.js';
import arabicTypographyRoutes from './routes/arabic-typography.js';
import dataLocalizationRoutes from './routes/data-localization.js';
import languageIntelligenceRoutes from './routes/language-intelligence.js';
import qualityGateRoutes from './routes/quality-gate.js';
import rtlLayoutRoutes from './routes/rtl-layout.js';
import qualityMetricsRoutes from './routes/quality-metrics.routes.js';

app.use('/api/v1/localization', localizationRoutes);
app.use('/api/v1/localization/arabic-typography', arabicTypographyRoutes);
app.use('/api/v1/localization/data', dataLocalizationRoutes);
app.use('/api/v1/localization/language-intelligence', languageIntelligenceRoutes);
app.use('/api/v1/localization/quality-gate', qualityGateRoutes);
app.use('/api/v1/localization/rtl-layout', rtlLayoutRoutes);
app.use('/api/v1/localization/quality', qualityMetricsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

async function bootstrap(): Promise<void> {
  try {
    await prisma.$connect();
    dbConnected = true;
    logger.info('Database connected');

    await redis.connect();
    redisConnected = true;
    logger.info('Redis connected');

    app.listen(PORT, () => {
      logger.info(`localization-service running on port ${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error('Failed to start localization-service', { error });
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
