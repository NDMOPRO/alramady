/**
 * RASID Platform - Service Factory
 *
 * Creates a fully configured Express application with:
 *  - CORS
 *  - JSON body parsing
 *  - Security headers (helmet-like)
 *  - Request logging
 *  - Health check endpoint
 *  - Error handler middleware
 *  - Graceful shutdown
 */

import express, { Request, Response, NextFunction, Application } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import http from 'http';
import { createLogger } from './logger';
import { AppError, ErrorType } from './errors';
import winston from 'winston';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ServiceAppConfig {
  /** Service name (e.g., 'rasid-data-service') */
  serviceName: string;
  /** Port to listen on */
  port: number;
  /** API version prefix (default: '/api/v1') */
  apiPrefix?: string;
  /** Allowed CORS origins (default: '*') */
  corsOrigins?: string | string[];
  /** Maximum request body size (default: '10mb') */
  bodyLimit?: string;
  /** Service version string */
  version?: string;
  /** Custom logger instance (one will be created if not provided) */
  logger?: winston.Logger;
  /** Additional health check data */
  healthCheckExtras?: () => Promise<Record<string, unknown>>;
  /** Callback when server is ready */
  onReady?: (app: Application, server: http.Server) => void;
  /** Callback when shutting down */
  onShutdown?: () => Promise<void>;
  /** Trusted proxy setting */
  trustProxy?: boolean | string | number;
}

export interface ServiceAppResult {
  app: Application;
  server: http.Server;
  logger: winston.Logger;
  start: () => Promise<http.Server>;
  shutdown: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Security headers middleware (helmet-like, no extra dependency)
// ---------------------------------------------------------------------------

function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // Enable XSS filter in older browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Control referrer information
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Restrict permissions/features
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );
  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'"
  );
  // Strict Transport Security (for HTTPS)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // Remove powered-by header
  res.removeHeader('X-Powered-By');

  next();
}

// ---------------------------------------------------------------------------
// Request logging middleware
// ---------------------------------------------------------------------------

function createRequestLogger(logger: winston.Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();
    const startTime = Date.now();

    // Attach request ID to response headers
    res.setHeader('X-Request-Id', requestId);

    // Store on request for downstream use
    (req as Request & { requestId: string }).requestId = requestId;

    // Log on response finish
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const logData = {
        requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: duration,
        contentLength: res.getHeader('content-length'),
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.socket.remoteAddress,
      };

      if (res.statusCode >= 500) {
        logger.error('Request completed with server error', logData);
      } else if (res.statusCode >= 400) {
        logger.warn('Request completed with client error', logData);
      } else {
        logger.http('Request completed', logData);
      }
    });

    next();
  };
}

// ---------------------------------------------------------------------------
// Health check handler
// ---------------------------------------------------------------------------

function createHealthCheckHandler(
  config: ServiceAppConfig,
  startTime: number
) {
  return async (_req: Request, res: Response): Promise<void> => {
    const uptimeMs = Date.now() - startTime;
    const memoryUsage = process.memoryUsage();

    const healthData: Record<string, unknown> = {
      status: 'ok',
      service: config.serviceName,
      version: config.version || '1.0.0',
      uptime: uptimeMs,
      uptimeHuman: formatUptime(uptimeMs),
      timestamp: new Date().toISOString(),
      memoryUsage: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024),
      },
      nodeVersion: process.version,
      pid: process.pid,
    };

    // Add custom health check data if provided
    if (config.healthCheckExtras) {
      try {
        const extras = await config.healthCheckExtras();
        healthData.dependencies = extras;
      } catch (err) {
        healthData.status = 'degraded';
        healthData.dependencies = {
          error: err instanceof Error ? err.message : 'Health check extras failed',
        };
      }
    }

    const statusCode = healthData.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(healthData);
  };
}

/**
 * Format milliseconds into a human-readable uptime string.
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours % 24 > 0) parts.push(`${hours % 24}h`);
  if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
  parts.push(`${seconds % 60}s`);

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Error handler middleware
// ---------------------------------------------------------------------------

function createErrorHandler(logger: winston.Logger) {
  return (err: Error, req: Request, res: Response, _next: NextFunction): void => {
    const requestId = (req as Request & { requestId?: string }).requestId || 'unknown';

    // Handle AppError instances
    if (AppError.isAppError(err)) {
      logger.error(`AppError [${err.code}]: ${err.message}`, {
        requestId,
        statusCode: err.statusCode,
        code: err.code,
        type: err.type,
        details: err.details,
        stack: err.stack,
      });

      const errorJson = err.toJSON();
      res.status(err.statusCode).json({
        ...errorJson,
        requestId,
      });
      return;
    }

    // Handle Zod validation errors
    if (err.name === 'ZodError' && 'issues' in err) {
      const zodErr = err as Error & { issues: Array<{ path: unknown[]; message: string; code: string }> };
      const validationErrors = zodErr.issues.map((issue) => ({
        field: issue.path.join('.') || 'root',
        message: issue.message,
        rule: issue.code,
      }));

      logger.warn('Validation error', { requestId, validationErrors });

      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          messageAr: 'فشل التحقق من صحة الطلب',
          statusCode: 400,
          type: ErrorType.VALIDATION,
          validationErrors,
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Handle JSON syntax errors from body parser
    if (err instanceof SyntaxError && 'body' in err) {
      logger.warn('Malformed JSON in request body', { requestId });

      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_JSON',
          message: 'Request body contains invalid JSON',
          messageAr: 'جسم الطلب يحتوي على JSON غير صالح',
          statusCode: 400,
          type: ErrorType.BAD_REQUEST,
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Generic unhandled error
    logger.error(`Unhandled error: ${err.message}`, {
      requestId,
      error: err.message,
      stack: err.stack,
      name: err.name,
    });

    const isProduction = process.env.NODE_ENV === 'production';
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: isProduction ? 'An internal server error occurred' : err.message,
        messageAr: 'حدث خطأ داخلي في الخادم',
        statusCode: 500,
        type: ErrorType.INTERNAL,
        stack: isProduction ? undefined : err.stack,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  };
}

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------

function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
      messageAr: `المسار ${req.method} ${req.originalUrl} غير موجود`,
      statusCode: 404,
      type: ErrorType.NOT_FOUND,
    },
    timestamp: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// createServiceApp
// ---------------------------------------------------------------------------

/**
 * Create a fully configured Express application for a RASID microservice.
 *
 * Includes: CORS, JSON body parsing, security headers, request logging,
 * health check endpoint, 404 handler, centralized error handler, and
 * graceful shutdown support.
 */
export function createServiceApp(config: ServiceAppConfig): ServiceAppResult {
  const app = express();
  const startTime = Date.now();

  // Create or use provided logger
  const logger = config.logger || createLogger({
    serviceName: config.serviceName,
    prettyPrint: process.env.NODE_ENV !== 'production',
  });

  // Trust proxy if configured
  if (config.trustProxy !== undefined) {
    app.set('trust proxy', config.trustProxy);
  }

  // --- Middleware stack ---

  // 1. Security headers
  app.use(securityHeaders);

  // 2. CORS
  app.use(cors({
    origin: config.corsOrigins || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'X-Tenant-Id',
      'X-Locale',
      'Accept-Language',
    ],
    exposedHeaders: ['X-Request-Id', 'X-Total-Count', 'X-Page-Count'],
    credentials: true,
    maxAge: 86400,
  }));

  // 3. Body parsing
  app.use(express.json({ limit: config.bodyLimit || '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: config.bodyLimit || '10mb' }));

  // 4. Request logging
  app.use(createRequestLogger(logger));

  // 5. Health check endpoint (before API prefix so it's always accessible)
  const healthHandler = createHealthCheckHandler(config, startTime);
  app.get('/health', healthHandler);
  app.get(`${config.apiPrefix || '/api/v1'}/health`, healthHandler);

  // --- Create server ---
  const server = http.createServer(app);

  // --- Graceful shutdown ---
  let isShuttingDown = false;

  async function shutdown(): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`Shutting down ${config.serviceName}...`);

    // Stop accepting new connections
    server.close(() => {
      logger.info('HTTP server closed');
    });

    // Run custom shutdown hook
    if (config.onShutdown) {
      try {
        await config.onShutdown();
        logger.info('Custom shutdown hook completed');
      } catch (err) {
        logger.error('Error during custom shutdown hook', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Force exit after timeout
    const forceExitTimeout = setTimeout(() => {
      logger.error('Forced exit after graceful shutdown timeout');
      process.exit(1);
    }, 15000);

    // Allow the timer to be cleared if shutdown completes
    forceExitTimeout.unref();

    logger.info(`${config.serviceName} shutdown complete`);
  }

  // Register OS signal handlers for graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM signal');
    shutdown();
  });

  process.on('SIGINT', () => {
    logger.info('Received SIGINT signal');
    shutdown();
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', {
      error: err.message,
      stack: err.stack,
    });
    shutdown().then(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  // --- Start function ---

  async function start(): Promise<http.Server> {
    // Apply 404 handler and error handler AFTER routes are registered
    app.use(notFoundHandler);
    app.use(createErrorHandler(logger));

    return new Promise((resolve, reject) => {
      server.listen(config.port, () => {
        logger.info(
          `${config.serviceName} listening on port ${config.port} [${process.env.NODE_ENV || 'development'}]`
        );

        if (config.onReady) {
          config.onReady(app, server);
        }

        resolve(server);
      });

      server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          logger.error(`Port ${config.port} is already in use`);
        } else {
          logger.error('Server error', { error: err.message });
        }
        reject(err);
      });
    });
  }

  return {
    app,
    server,
    logger,
    start,
    shutdown,
  };
}
