import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

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

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    logger.warn('Application error', {
      code: err.code,
      statusCode: err.statusCode,
      message: err.message,
    });

    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  if (err.constructor.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as unknown as { code: string; meta?: Record<string, unknown> };
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
      });
      return;
    }
  }

  if (err.constructor.name === 'PrismaClientValidationError') {
    res.status(400).json({
      success: false,
      error: 'Invalid data provided',
      code: 'VALIDATION_ERROR',
    });
    return;
  }

  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    name: err.name,
  });

  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
    code: 'INTERNAL_ERROR',
  });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    code: 'ROUTE_NOT_FOUND',
  });
}
