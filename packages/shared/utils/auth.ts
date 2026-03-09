/**
 * RASID Platform - JWT Authentication Middleware
 *
 * Express middleware for token verification, role-based access control,
 * and user context extraction. Integrates with Redis for token blacklisting.
 */

import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenPayload extends JwtPayload {
  userId: string;
  email: string;
  roles: string[];
  tenantId?: string;
  permissions?: string[];
  locale?: 'ar' | 'en';
  sessionId?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
  token?: string;
}

export interface AuthConfig {
  /** JWT secret key (should come from environment variable) */
  jwtSecret: string;
  /** JWT issuer (for verification) */
  issuer?: string;
  /** JWT audience (for verification) */
  audience?: string;
  /** Token expiry tolerance in seconds */
  clockTolerance?: number;
  /** Redis client for token blacklist checking. If null, blacklist check is skipped. */
  redisClient?: RedisLike | null;
  /** Key prefix for blacklisted tokens in Redis */
  blacklistPrefix?: string;
}

/**
 * Minimal Redis-like interface so we don't hard-depend on a specific Redis library.
 */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, expiryMode?: string, time?: number): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Module-level configuration
// ---------------------------------------------------------------------------

let _authConfig: AuthConfig = {
  jwtSecret: process.env.JWT_SECRET || '',
  issuer: process.env.JWT_ISSUER || 'rasid-platform',
  audience: process.env.JWT_AUDIENCE || 'rasid-services',
  clockTolerance: 10,
  redisClient: null,
  blacklistPrefix: 'token:blacklist:',
};

/**
 * Configure the auth module. Must be called once at service startup.
 */
export function configureAuth(config: Partial<AuthConfig>): void {
  _authConfig = {
    ..._authConfig,
    ...config,
  };
  if (!_authConfig.jwtSecret) {
    console.warn(
      '[RASID Auth] WARNING: JWT_SECRET is not configured. Authentication will fail.'
    );
  }
}

/**
 * Get the current auth configuration (read-only).
 */
export function getAuthConfig(): Readonly<AuthConfig> {
  return Object.freeze({ ..._authConfig });
}

// ---------------------------------------------------------------------------
// Token verification
// ---------------------------------------------------------------------------

/**
 * Verify a JWT token string and return the decoded payload.
 *
 * Steps:
 *  1. Verify signature and standard claims (exp, iss, aud)
 *  2. Check Redis blacklist (if Redis client is configured)
 *  3. Validate required fields in payload
 *  4. Return typed TokenPayload
 */
export async function verifyToken(token: string): Promise<TokenPayload> {
  if (!_authConfig.jwtSecret) {
    throw new AuthenticationError('JWT secret is not configured');
  }

  // Step 1: Verify the JWT signature and standard claims
  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, _authConfig.jwtSecret, {
      issuer: _authConfig.issuer,
      audience: _authConfig.audience,
      clockTolerance: _authConfig.clockTolerance || 10,
      algorithms: ['HS256', 'HS384', 'HS512'],
    }) as JwtPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Token has expired', 'TOKEN_EXPIRED');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Token is invalid or malformed', 'INVALID_TOKEN');
    }
    if (err instanceof jwt.NotBeforeError) {
      throw new AuthenticationError('Token is not yet active', 'TOKEN_NOT_ACTIVE');
    }
    throw new AuthenticationError('Token verification failed', 'VERIFICATION_FAILED');
  }

  // Step 2: Check the Redis blacklist (for logout / revocation)
  if (_authConfig.redisClient) {
    const jti = decoded.jti || token.slice(-32);
    const blacklistKey = `${_authConfig.blacklistPrefix}${jti}`;
    try {
      const blacklisted = await _authConfig.redisClient.get(blacklistKey);
      if (blacklisted !== null) {
        throw new AuthenticationError('Token has been revoked', 'TOKEN_REVOKED');
      }
    } catch (err) {
      if (err instanceof AuthenticationError) throw err;
      // Redis failure should not block authentication in production
      console.error('[RASID Auth] Redis blacklist check failed:', err);
    }
  }

  // Step 3: Validate required payload fields
  if (!decoded.userId || typeof decoded.userId !== 'string') {
    throw new AuthenticationError('Token payload missing required field: userId', 'INVALID_PAYLOAD');
  }
  if (!decoded.email || typeof decoded.email !== 'string') {
    throw new AuthenticationError('Token payload missing required field: email', 'INVALID_PAYLOAD');
  }
  if (!Array.isArray(decoded.roles)) {
    throw new AuthenticationError('Token payload missing required field: roles', 'INVALID_PAYLOAD');
  }

  // Step 4: Return typed payload
  return {
    userId: decoded.userId as string,
    email: decoded.email as string,
    roles: decoded.roles as string[],
    tenantId: decoded.tenantId as string | undefined,
    permissions: decoded.permissions as string[] | undefined,
    locale: (decoded.locale as 'ar' | 'en') || 'en',
    sessionId: decoded.sessionId as string | undefined,
    iat: decoded.iat,
    exp: decoded.exp,
    iss: decoded.iss,
    aud: decoded.aud,
    jti: decoded.jti,
    sub: decoded.sub,
  };
}

// ---------------------------------------------------------------------------
// Blacklist a token (for logout)
// ---------------------------------------------------------------------------

/**
 * Add a token to the Redis blacklist. Used when a user logs out.
 * The blacklist entry expires when the token itself would expire.
 */
export async function blacklistToken(token: string): Promise<void> {
  if (!_authConfig.redisClient) {
    console.warn('[RASID Auth] Cannot blacklist token: Redis client not configured');
    return;
  }

  let decoded: JwtPayload;
  try {
    decoded = jwt.decode(token) as JwtPayload;
  } catch {
    throw new Error('Cannot decode token for blacklisting');
  }

  if (!decoded) {
    throw new Error('Token could not be decoded');
  }

  const jti = decoded.jti || token.slice(-32);
  const blacklistKey = `${_authConfig.blacklistPrefix}${jti}`;

  // Calculate TTL: time remaining until token expires
  const now = Math.floor(Date.now() / 1000);
  const exp = decoded.exp || now + 3600;
  const ttl = Math.max(exp - now, 60);

  await _authConfig.redisClient.set(blacklistKey, 'revoked', 'EX', ttl);
}

// ---------------------------------------------------------------------------
// Express middleware: requireAuth
// ---------------------------------------------------------------------------

/**
 * Express middleware that requires a valid JWT in the Authorization header.
 * Populates req.user with the decoded token payload.
 *
 * Usage:
 *   router.get('/protected', requireAuth, (req, res) => { ... });
 */
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({
      success: false,
      error: {
        code: 'MISSING_TOKEN',
        message: 'Authorization header is required',
        messageAr: 'رأس التفويض مطلوب',
        statusCode: 401,
      },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Support "Bearer <token>" format
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_AUTH_FORMAT',
        message: 'Authorization header must be in format: Bearer <token>',
        messageAr: 'يجب أن يكون رأس التفويض بالتنسيق: Bearer <token>',
        statusCode: 401,
      },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const token = parts[1];

  verifyToken(token)
    .then((payload) => {
      req.user = payload;
      req.token = token;
      next();
    })
    .catch((err) => {
      const code = err instanceof AuthenticationError ? err.code : 'AUTH_FAILED';
      const message = err instanceof Error ? err.message : 'Authentication failed';
      res.status(401).json({
        success: false,
        error: {
          code,
          message,
          messageAr: 'فشل المصادقة',
          statusCode: 401,
        },
        timestamp: new Date().toISOString(),
      });
    });
}

// ---------------------------------------------------------------------------
// Express middleware: requireRole
// ---------------------------------------------------------------------------

/**
 * Express middleware factory that checks whether the authenticated user
 * has at least one of the required roles.
 *
 * Must be used AFTER requireAuth.
 *
 * Usage:
 *   router.delete('/admin-only', requireAuth, requireRole('admin', 'superadmin'), handler);
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'NOT_AUTHENTICATED',
          message: 'Authentication is required before role checking',
          messageAr: 'يجب المصادقة قبل التحقق من الدور',
          statusCode: 401,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const userRoles = req.user.roles || [];
    const hasRole = allowedRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_ROLE',
          message: `Requires one of: ${allowedRoles.join(', ')}. You have: ${userRoles.join(', ') || 'none'}`,
          messageAr: 'ليس لديك الدور المطلوب لتنفيذ هذا الإجراء',
          statusCode: 403,
          details: {
            requiredRoles: allowedRoles,
            userRoles,
          },
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// Helper: extractUserId
// ---------------------------------------------------------------------------

/**
 * Extract the user ID from an authenticated request.
 * Throws if the request is not authenticated.
 */
export function extractUserId(req: AuthenticatedRequest): string {
  if (!req.user || !req.user.userId) {
    throw new AuthenticationError(
      'Cannot extract user ID: request is not authenticated',
      'NOT_AUTHENTICATED'
    );
  }
  return req.user.userId;
}

/**
 * Extract the full user context from an authenticated request.
 */
export function extractUserContext(req: AuthenticatedRequest): TokenPayload {
  if (!req.user) {
    throw new AuthenticationError(
      'Cannot extract user context: request is not authenticated',
      'NOT_AUTHENTICATED'
    );
  }
  return req.user;
}

// ---------------------------------------------------------------------------
// Token generation (for testing / governance service)
// ---------------------------------------------------------------------------

/**
 * Generate a signed JWT token. Primarily used by the Governance (auth) service.
 */
export function generateToken(
  payload: Omit<TokenPayload, 'iat' | 'exp' | 'iss' | 'aud'>,
  expiresIn: string | number = '24h'
): string {
  if (!_authConfig.jwtSecret) {
    throw new Error('JWT secret is not configured');
  }
  return jwt.sign(
    {
      userId: payload.userId,
      email: payload.email,
      roles: payload.roles,
      tenantId: payload.tenantId,
      permissions: payload.permissions,
      locale: payload.locale,
      sessionId: payload.sessionId,
    },
    _authConfig.jwtSecret,
    {
      issuer: _authConfig.issuer,
      audience: _authConfig.audience,
      expiresIn,
      subject: payload.userId,
    }
  );
}

// ---------------------------------------------------------------------------
// AuthenticationError
// ---------------------------------------------------------------------------

export class AuthenticationError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code: string = 'AUTH_ERROR') {
    super(message);
    this.name = 'AuthenticationError';
    this.code = code;
    this.statusCode = 401;
    Error.captureStackTrace(this, this.constructor);
  }
}
