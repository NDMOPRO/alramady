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
  defaultMeta: { service: 'conversion-service' },
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
const PORT = process.env.PORT || 8013;

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
    service: 'conversion-service',
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

app.get('/api/v1/conversion/ready', (_req, res) => {
  res.status(dbConnected && redisConnected ? 200 : 503).json({
    ready: dbConnected && redisConnected,
  });
});

// Mount service routes
import conversionRoutes from './routes/conversion.routes.js';
import documentExtractionRoutes from './routes/document-extraction.routes.js';
import socialMediaRoutes from './routes/social-media.routes.js';
import udrRoutes from './routes/udr.routes.js';
import converterRoutes from './routes/converter.routes.js';
import coreRoutes from './routes/core.routes.js';
import matrixRoutes from './routes/matrix.routes.js';
import universalRoutes from './routes/universal.routes.js';

app.use('/api/v1/conversion', conversionRoutes);
app.use('/api/v1/conversion', documentExtractionRoutes);
app.use('/api/v1/conversion/social-media', socialMediaRoutes);
app.use('/api/v1/conversion/udr', udrRoutes);
app.use('/api/v1/conversion/converter', converterRoutes);
app.use('/api/v1/conversion/core', coreRoutes);
app.use('/api/v1/conversion/matrix', matrixRoutes);
app.use('/api/v1/conversion/universal', universalRoutes);

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
      logger.info(`conversion-service running on port ${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error('Failed to start conversion-service', { error });
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
