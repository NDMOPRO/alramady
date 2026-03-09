import { Request, Response, NextFunction } from 'express';
import { AppError, NotFoundError, BadRequestError, ConflictError, errorHandler, notFoundHandler } from '../../middleware/errorHandler';

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

function createMockResponse(): Response {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis() as any,
    json: jest.fn().mockReturnThis() as any,
  };
  return res as Response;
}

describe('Error Classes', () => {
  it('AppError sets default values', () => {
    const err = new AppError('test');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.isOperational).toBe(true);
  });

  it('NotFoundError sets 404 status', () => {
    const err = new NotFoundError('User', '123');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toContain('123');
  });

  it('BadRequestError sets 400 status', () => {
    const err = new BadRequestError('Invalid input');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('BAD_REQUEST');
  });

  it('ConflictError sets 409 status', () => {
    const err = new ConflictError('Duplicate entry');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
  });
});

describe('errorHandler middleware', () => {
  it('handles AppError correctly', () => {
    const err = new NotFoundError('Item');
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    errorHandler(err, {} as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'NOT_FOUND' })
    );
  });

  it('handles unknown errors with 500', () => {
    const err = new Error('unexpected');
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    errorHandler(err, {} as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'INTERNAL_ERROR' })
    );
  });
});

describe('notFoundHandler', () => {
  it('returns 404 for unknown routes', () => {
    const res = createMockResponse();
    notFoundHandler({} as Request, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'ROUTE_NOT_FOUND' })
    );
  });
});
