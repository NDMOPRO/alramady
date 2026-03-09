import { Request, Response, NextFunction } from 'express';
import { validate, uuidParamSchema, capacityCreateSchema, classificationCreateSchema } from '../../middleware/validation';

function createMockReqRes(data: Record<string, unknown> = {}, source: 'body' | 'params' = 'body') {
  const req: Partial<Request> = { body: {}, query: {}, params: {} as any };
  (req as any)[source] = data;
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis() as any,
    json: jest.fn().mockReturnThis() as any,
  };
  const next = jest.fn() as NextFunction;
  return { req: req as Request, res: res as Response, next };
}

describe('validate middleware', () => {
  it('passes valid body data', () => {
    const { req, res, next } = createMockReqRes({
      id: '550e8400-e29b-41d4-a716-446655440000',
    }, 'params');

    validate(uuidParamSchema, 'params')(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects invalid UUID', () => {
    const { req, res, next } = createMockReqRes({ id: 'not-a-uuid' }, 'params');

    validate(uuidParamSchema, 'params')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_ERROR' })
    );
  });
});

describe('capacityCreateSchema', () => {
  it('validates correct capacity data', () => {
    const { req, res, next } = createMockReqRes({
      organizationId: '550e8400-e29b-41d4-a716-446655440000',
      totalBytes: 1000000,
      maxDatasets: 50,
    });

    validate(capacityCreateSchema)(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects missing required fields', () => {
    const { req, res, next } = createMockReqRes({ totalBytes: 1000 });

    validate(capacityCreateSchema)(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('classificationCreateSchema', () => {
  it('validates correct classification data', () => {
    const { req, res, next } = createMockReqRes({
      fileName: 'test.xlsx',
      fileType: 'xlsx',
      fileSize: 1024,
      classifiedType: 'financial',
      confidence: 0.95,
    });

    validate(classificationCreateSchema)(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects confidence out of range', () => {
    const { req, res, next } = createMockReqRes({
      fileName: 'test.xlsx',
      fileType: 'xlsx',
      fileSize: 1024,
      classifiedType: 'financial',
      confidence: 1.5,
    });

    validate(classificationCreateSchema)(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
