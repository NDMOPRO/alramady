import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { Prisma, PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import winston from 'winston';
import { Request, Response, NextFunction } from 'express';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { authMiddleware } from './middleware/auth.js';

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'governance-service' },
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
const PORT = process.env.PORT || 8010;

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
    service: 'governance-service',
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

app.get('/api/v1/governance/ready', (_req, res) => {
  res.status(dbConnected && redisConnected ? 200 : 503).json({
    ready: dbConnected && redisConnected,
  });
});

// Mount service routes
import governanceRoutes from './routes/governance.routes.js';
import messagingRoutes from './routes/messaging.routes.js';
import authRoutes from './routes/auth.routes.js';
import advancedCompareRoutes from './routes/advanced-compare.js';
import auditReplayRoutes from './routes/audit-replay.js';
import engineIntegrationRoutes from './routes/engine-integration.js';
import oneClickOpsRoutes from './routes/one-click-ops.js';
import permissionsSecurityRoutes from './routes/permissions-security.js';
import productLevelsRoutes from './routes/product-levels.js';
import teamworkRoutes from './routes/teamwork.js';
import versionsRoutes from './routes/versions.js';
import featureFlagsRoutes from './routes/feature-flags.js';

app.use('/api/v1/governance', governanceRoutes);
app.use('/api/v1/governance/messaging', messagingRoutes);
app.use('/api/v1/governance/auth', authRoutes);
app.use('/api/v1/governance/compare', advancedCompareRoutes);
app.use('/api/v1/governance/audit-replay', auditReplayRoutes);
app.use('/api/v1/governance/integrations', engineIntegrationRoutes);
app.use('/api/v1/governance/one-click', oneClickOpsRoutes);
app.use('/api/v1/governance/permissions', permissionsSecurityRoutes);
app.use('/api/v1/governance/product-levels', productLevelsRoutes);
app.use('/api/v1/governance/teamwork', teamworkRoutes);
app.use('/api/v1/governance/versions', versionsRoutes);
app.use('/api/v1/governance/feature-flags', featureFlagsRoutes);

// User management routes
app.get('/api/v1/governance/users', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user?.tenantId || req.user?.organizationId;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const users = await prisma.user.findMany({
    where: tenantId ? { tenantId } : {},
    skip: (page - 1) * limit,
    take: limit,
    select: { id: true, email: true, name: true, role: true, status: true, createdAt: true, updatedAt: true, tenantId: true },
    orderBy: { createdAt: 'desc' },
  });
  const total = await prisma.user.count({ where: tenantId ? { tenantId } : {} });
  res.json({ success: true, data: users, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}));

app.get('/api/v1/governance/users/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      tenantId: true,
      locale: true,
      timezone: true,
      preferences: true,
    },
  });
  if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }
  res.json({ success: true, data: user });
}));

app.patch('/api/v1/governance/users/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const payload = req.body as {
    role?: string;
    status?: string;
    locale?: string;
    timezone?: string;
    preferences?: Record<string, unknown>;
  };

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      ...(payload.role !== undefined ? { role: payload.role } : {}),
      ...(payload.status !== undefined ? { status: payload.status as never } : {}),
      ...(payload.locale !== undefined ? { locale: payload.locale as never } : {}),
      ...(payload.timezone !== undefined ? { timezone: payload.timezone } : {}),
      ...(payload.preferences !== undefined ? { preferences: payload.preferences as Prisma.InputJsonValue } : {}),
      updatedAt: new Date(),
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      tenantId: true,
      locale: true,
      timezone: true,
      preferences: true,
    },
  });

  res.json({ success: true, data: user });
}));

app.get('/api/v1/governance/users/:id/usage', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.id;
  const tenantId = req.user?.tenantId || req.user?.organizationId;
  const tenantClause = tenantId ? Prisma.sql`AND tenant_id = ${tenantId}` : Prisma.empty;

  const [
    user,
    datasets,
    dashboards,
    reports,
    auditCount,
    recentAudit,
    teamMemberships,
    permissionSuggestions,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        lastLoginAt: true,
        lastLogin: true,
        createdAt: true,
      },
    }),
    prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS count
      FROM datasets
      WHERE (created_by_id = ${userId} OR created_by = ${userId})
      ${tenantClause}
    `),
    prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS count
      FROM dashboards
      WHERE user_id = ${userId}
      ${tenantClause}
    `),
    prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS count
      FROM reports
      WHERE created_by = ${userId}
      ${tenantClause}
    `),
    prisma.auditLog.count({ where: { userId, ...(tenantId ? { tenantId } : {}) } }),
    prisma.auditLog.findMany({
      where: { userId, ...(tenantId ? { tenantId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
      },
    }),
    prisma.teamMember.count({ where: { userId } }),
    prisma.permissionSuggestion.count({ where: { userId } }),
  ]);

  if (!user) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }

  res.json({
    success: true,
    data: {
      user,
      usage: {
        datasetsCreated: datasets[0]?.count ?? 0,
        dashboardsCreated: dashboards[0]?.count ?? 0,
        reportsCreated: reports[0]?.count ?? 0,
        presentationsCreated: 0,
        projectsTotal: (dashboards[0]?.count ?? 0) + (reports[0]?.count ?? 0),
        auditEventsTotal: auditCount,
        teamMemberships,
        permissionSuggestions,
        filesTracked: null,
        lastLoginAt: user.lastLoginAt ?? user.lastLogin ?? null,
      },
      recentActivity: recentAudit,
      availability: {
        filesTracked: false,
        projectsTotal: true,
        activity: true,
        usageIndicators: true,
      },
    },
  });
}));

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
      logger.info(`governance-service running on port ${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error('Failed to start governance-service', { error });
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

if (process.env.NODE_ENV !== 'test') {
  bootstrap();
}

export { app, prisma, redis, logger };
