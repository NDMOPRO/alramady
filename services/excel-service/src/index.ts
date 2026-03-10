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
  defaultMeta: { service: 'excel-service' },
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
const PORT = process.env.PORT || 8002;

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

  const healthy = dbConnected;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'degraded',
    service: 'excel-service',
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

app.get('/api/v1/excel/ready', (_req, res) => {
  res.status(dbConnected && redisConnected ? 200 : 503).json({
    ready: dbConnected && redisConnected,
  });
});

import excelRoutes from './routes/excel.routes.js';
import formulaV2Routes from './routes/formula-v2.routes.js';
import professionalFormattingRoutes from './routes/professional-formatting.routes.js';
import excelMatchingRoutes from './routes/excel-matching.routes.js';
import modesV2Routes from './routes/modes-v2.routes.js';
import excelToSystemRoutes from './routes/excel-to-system.routes.js';
import formattingRoutes from './routes/formatting.routes.js';
import formulasRoutes from './routes/formulas.routes.js';
import matchingRoutes from './routes/matching.routes.js';
import modesRoutes from './routes/modes.routes.js';
import spreadsheetRoutes from './routes/spreadsheet.routes.js';

// Register formula functions
import './services/formula-functions/index.js';

app.use('/api/v1/excel', excelRoutes);
app.use('/api/v1/excel/formulas/v2', formulaV2Routes);
app.use('/api/v1/excel/formatting/pro', professionalFormattingRoutes);
app.use('/api/v1/excel/matching/engine', excelMatchingRoutes);
app.use('/api/v1/excel/modes/v2', modesV2Routes);
app.use('/api/v1/excel/system-import', excelToSystemRoutes);
app.use('/api/v1/excel/formatting', formattingRoutes);
app.use('/api/v1/excel/formulas', formulasRoutes);
app.use('/api/v1/excel/matching', matchingRoutes);
app.use('/api/v1/excel/modes', modesRoutes);
app.use('/api/v1/excel/spreadsheet', spreadsheetRoutes);

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
      logger.info(`excel-service running on port ${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error('Failed to start excel-service', { error });
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
