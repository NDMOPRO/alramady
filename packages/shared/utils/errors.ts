/**
 * RASID Platform - Error Classes
 *
 * Structured error hierarchy for consistent error handling across all services.
 * Every error serializes cleanly to JSON for API responses.
 */

// ---------------------------------------------------------------------------
// Error types enum
// ---------------------------------------------------------------------------

export enum ErrorType {
  VALIDATION = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  CONFLICT = 'CONFLICT',
  BAD_REQUEST = 'BAD_REQUEST',
  INTERNAL = 'INTERNAL_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TIMEOUT = 'TIMEOUT',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT',
}

// ---------------------------------------------------------------------------
// Base AppError
// ---------------------------------------------------------------------------

export interface AppErrorJSON {
  success: false;
  error: {
    code: string;
    message: string;
    messageAr?: string;
    statusCode: number;
    type: string;
    details?: Record<string, unknown>;
    validationErrors?: Array<{ field: string; message: string; rule?: string }>;
    stack?: string;
  };
  timestamp: string;
}

/**
 * Base application error class.
 * All RASID errors extend this class for uniform handling.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly type: ErrorType;
  public readonly isOperational: boolean;
  public readonly messageAr?: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    type: ErrorType,
    options?: {
      messageAr?: string;
      details?: Record<string, unknown>;
      isOperational?: boolean;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.type = type;
    this.isOperational = options?.isOperational !== undefined ? options.isOperational : true;
    this.messageAr = options?.messageAr;
    this.details = options?.details;

    if (options?.cause) {
      this.cause = options.cause;
    }

    // Capture a proper stack trace, excluding the constructor call
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Serialize the error to a JSON-safe object suitable for API responses.
   * In production, the stack trace is omitted.
   */
  public toJSON(): AppErrorJSON {
    const isProduction = process.env.NODE_ENV === 'production';
    const errorBody: AppErrorJSON['error'] = {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      type: this.type,
    };

    if (this.messageAr) {
      errorBody.messageAr = this.messageAr;
    }
    if (this.details && Object.keys(this.details).length > 0) {
      errorBody.details = this.details;
    }
    if (!isProduction && this.stack) {
      errorBody.stack = this.stack;
    }

    return {
      success: false,
      error: errorBody,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Determine if an unknown caught value is an operational AppError.
   */
  public static isAppError(error: unknown): error is AppError {
    return error instanceof AppError;
  }

  /**
   * Wrap an unknown error as an AppError if it isn't already one.
   */
  public static from(error: unknown): AppError {
    if (error instanceof AppError) {
      return error;
    }
    if (error instanceof Error) {
      return new AppError(
        error.message,
        500,
        'INTERNAL_ERROR',
        ErrorType.INTERNAL,
        { isOperational: false, cause: error }
      );
    }
    return new AppError(
      String(error),
      500,
      'INTERNAL_ERROR',
      ErrorType.INTERNAL,
      { isOperational: false }
    );
  }
}

// ---------------------------------------------------------------------------
// NotFoundError
// ---------------------------------------------------------------------------

export class NotFoundError extends AppError {
  constructor(
    resource: string,
    identifier?: string,
    options?: { messageAr?: string; details?: Record<string, unknown> }
  ) {
    const idPart = identifier ? ` with identifier "${identifier}"` : '';
    const message = `${resource}${idPart} was not found`;
    const messageAr = options?.messageAr || `لم يتم العثور على ${resource}`;
    super(message, 404, 'NOT_FOUND', ErrorType.NOT_FOUND, {
      messageAr,
      details: {
        resource,
        identifier: identifier || null,
        ...options?.details,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// ValidationError
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  field: string;
  message: string;
  rule?: string;
  value?: unknown;
}

export class ValidationError extends AppError {
  public readonly validationErrors: ValidationIssue[];

  constructor(
    errors: ValidationIssue[],
    options?: { message?: string; messageAr?: string; details?: Record<string, unknown> }
  ) {
    const fieldList = errors.map((e) => e.field).join(', ');
    const message = options?.message || `Validation failed for fields: ${fieldList}`;
    const messageAr = options?.messageAr || `فشل التحقق من صحة الحقول: ${fieldList}`;
    super(message, 400, 'VALIDATION_ERROR', ErrorType.VALIDATION, {
      messageAr,
      details: options?.details,
    });
    this.validationErrors = errors;
  }

  public override toJSON(): AppErrorJSON {
    const base = super.toJSON();
    base.error.validationErrors = this.validationErrors.map((ve) => ({
      field: ve.field,
      message: ve.message,
      rule: ve.rule,
    }));
    return base;
  }
}

// ---------------------------------------------------------------------------
// UnauthorizedError
// ---------------------------------------------------------------------------

export class UnauthorizedError extends AppError {
  constructor(
    message?: string,
    options?: { messageAr?: string; details?: Record<string, unknown> }
  ) {
    const msg = message || 'Authentication is required to access this resource';
    const messageAr = options?.messageAr || 'يجب تسجيل الدخول للوصول إلى هذا المورد';
    super(msg, 401, 'UNAUTHORIZED', ErrorType.UNAUTHORIZED, {
      messageAr,
      details: options?.details,
    });
  }
}

// ---------------------------------------------------------------------------
// ForbiddenError
// ---------------------------------------------------------------------------

export class ForbiddenError extends AppError {
  constructor(
    message?: string,
    options?: {
      messageAr?: string;
      requiredPermission?: string;
      details?: Record<string, unknown>;
    }
  ) {
    const msg = message || 'You do not have permission to perform this action';
    const messageAr = options?.messageAr || 'ليس لديك صلاحية لتنفيذ هذا الإجراء';
    super(msg, 403, 'FORBIDDEN', ErrorType.FORBIDDEN, {
      messageAr,
      details: {
        requiredPermission: options?.requiredPermission || null,
        ...options?.details,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// ConflictError
// ---------------------------------------------------------------------------

export class ConflictError extends AppError {
  constructor(
    resource: string,
    conflictField?: string,
    options?: { messageAr?: string; details?: Record<string, unknown> }
  ) {
    const fieldPart = conflictField ? ` on field "${conflictField}"` : '';
    const message = `${resource} already exists${fieldPart}`;
    const messageAr = options?.messageAr || `${resource} موجود بالفعل`;
    super(message, 409, 'CONFLICT', ErrorType.CONFLICT, {
      messageAr,
      details: {
        resource,
        conflictField: conflictField || null,
        ...options?.details,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// BadRequestError
// ---------------------------------------------------------------------------

export class BadRequestError extends AppError {
  constructor(
    message?: string,
    options?: { messageAr?: string; details?: Record<string, unknown> }
  ) {
    const msg = message || 'The request is invalid or malformed';
    const messageAr = options?.messageAr || 'الطلب غير صالح أو مشوه';
    super(msg, 400, 'BAD_REQUEST', ErrorType.BAD_REQUEST, {
      messageAr,
      details: options?.details,
    });
  }
}

// ---------------------------------------------------------------------------
// RateLimitError
// ---------------------------------------------------------------------------

export class RateLimitError extends AppError {
  public readonly retryAfterMs: number;

  constructor(
    retryAfterMs: number,
    options?: { messageAr?: string; details?: Record<string, unknown> }
  ) {
    const retrySeconds = Math.ceil(retryAfterMs / 1000);
    const message = `Rate limit exceeded. Please retry after ${retrySeconds} seconds`;
    const messageAr = options?.messageAr || `تم تجاوز الحد الأقصى. يرجى المحاولة بعد ${retrySeconds} ثانية`;
    super(message, 429, 'RATE_LIMITED', ErrorType.RATE_LIMITED, {
      messageAr,
      details: {
        retryAfterMs,
        retryAfterSeconds: retrySeconds,
        ...options?.details,
      },
    });
    this.retryAfterMs = retryAfterMs;
  }
}

// ---------------------------------------------------------------------------
// Helper: HTTP status code to ErrorType mapping
// ---------------------------------------------------------------------------

export function errorTypeFromStatus(statusCode: number): ErrorType {
  const mapping: Record<number, ErrorType> = {
    400: ErrorType.BAD_REQUEST,
    401: ErrorType.UNAUTHORIZED,
    403: ErrorType.FORBIDDEN,
    404: ErrorType.NOT_FOUND,
    409: ErrorType.CONFLICT,
    413: ErrorType.PAYLOAD_TOO_LARGE,
    415: ErrorType.UNSUPPORTED_FORMAT,
    422: ErrorType.VALIDATION,
    429: ErrorType.RATE_LIMITED,
    500: ErrorType.INTERNAL,
    503: ErrorType.SERVICE_UNAVAILABLE,
    504: ErrorType.TIMEOUT,
  };
  return mapping[statusCode] || ErrorType.INTERNAL;
}
