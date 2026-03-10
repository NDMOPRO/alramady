import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import winston from 'winston';

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

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
    details?: unknown
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id
      ? `${resource} with id '${id}' not found`
      : `${resource} not found`;
    super(message, 404, 'NOT_FOUND');
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'BAD_REQUEST', true, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.headers['x-request-id'] || 'unknown';

  if (err instanceof AppError) {
    logger.warn('Application error', {
      requestId,
      code: err.code,
      statusCode: err.statusCode,
      message: err.message,
      path: req.path,
      method: req.method,
    });

    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    const formattedErrors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
      code: e.code,
    }));

    logger.warn('Zod validation error', {
      requestId,
      errors: formattedErrors,
      path: req.path,
    });

    res.status(400).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: formattedErrors,
    });
    return;
  }

  if (err.constructor.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as unknown as { code: string; meta?: Record<string, unknown> };
    logger.warn('Prisma known error', {
      requestId,
      prismaCode: prismaErr.code,
      meta: prismaErr.meta,
      path: req.path,
    });

    if (prismaErr.code === 'P2002') {
      res.status(409).json({
        success: false,
        error: 'A record with this value already exists',
        code: 'UNIQUE_CONSTRAINT_VIOLATION',
        details: { fields: prismaErr.meta?.target },
      });
      return;
    }
    if (prismaErr.code === 'P2025') {
      res.status(404).json({
        success: false,
        error: 'Record not found',
        code: 'NOT_FOUND',
      });
      return;
    }
    if (prismaErr.code === 'P2003') {
      res.status(400).json({
        success: false,
        error: 'Foreign key constraint failed',
        code: 'FOREIGN_KEY_VIOLATION',
        details: { field: prismaErr.meta?.field_name },
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: 'Database request error',
      code: 'PRISMA_' + prismaErr.code,
    });
    return;
  }

  if (err.constructor.name === 'PrismaClientValidationError') {
    logger.warn('Prisma validation error', {
      requestId,
      message: err.message,
      path: req.path,
    });

    res.status(400).json({
      success: false,
      error: 'Invalid data provided to database',
      code: 'DB_VALIDATION_ERROR',
    });
    return;
  }

  logger.error('Unhandled error', {
    requestId,
    name: err.name,
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
    code: 'INTERNAL_ERROR',
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  logger.warn('Route not found', {
    path: req.path,
    method: req.method,
  });

  res.status(404).json({
    success: false,
    error: 'Route ' + req.method + ' ' + req.path + ' not found',
    code: 'ROUTE_NOT_FOUND',
  });
}
