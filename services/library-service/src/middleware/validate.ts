import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

interface ValidationTarget {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export function validate(schema: ZodSchema | ValidationTarget, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if ('parse' in schema && typeof (schema as ZodSchema).parse === 'function') {
        const result = (schema as ZodSchema).parse(req[source]);
        (req as unknown as Record<string, unknown>)[source] = result;
        next();
        return;
      }

      const target = schema as ValidationTarget;
      const errors: Array<{ source: string; field: string; message: string; code: string }> = [];

      if (target.body) {
        const bodyResult = target.body.safeParse(req.body);
        if (!bodyResult.success) {
          bodyResult.error.errors.forEach((err) => {
            errors.push({
              source: 'body',
              field: err.path.join('.'),
              message: err.message,
              code: err.code,
            });
          });
        } else {
          req.body = bodyResult.data;
        }
      }

      if (target.query) {
        const queryResult = target.query.safeParse(req.query);
        if (!queryResult.success) {
          queryResult.error.errors.forEach((err) => {
            errors.push({
              source: 'query',
              field: err.path.join('.'),
              message: err.message,
              code: err.code,
            });
          });
        } else {
          (req as unknown as Record<string, unknown>).query = queryResult.data;
        }
      }

      if (target.params) {
        const paramsResult = target.params.safeParse(req.params);
        if (!paramsResult.success) {
          paramsResult.error.errors.forEach((err) => {
            errors.push({
              source: 'params',
              field: err.path.join('.'),
              message: err.message,
              code: err.code,
            });
          });
        } else {
          (req as unknown as Record<string, unknown>).params = paramsResult.data;
        }
      }

      if (errors.length > 0) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors,
          count: errors.length,
        });
        return;
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        res.status(400).json({
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: formattedErrors,
          count: formattedErrors.length,
        });
        return;
      }

      next(error);
    }
  };
}
