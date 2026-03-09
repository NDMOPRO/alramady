import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import * as crypto from 'crypto';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface SecurityScanResult {
  id: string;
  scanType: 'sql_injection' | 'xss' | 'file_upload' | 'brute_force' | 'session' | 'full';
  threats: SecurityThreat[];
  score: number;
  scannedAt: Date;
  durationMs: number;
}

export interface SecurityThreat {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  payload?: string;
  location: string;
  recommendation: string;
  cwe?: string;
}

export interface RateLimitConfig {
  key: string;
  maxRequests: number;
  windowMs: number;
  blockDurationMs: number;
  scope: 'user' | 'ip' | 'endpoint';
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  blocked: boolean;
  blockExpiresAt?: Date;
}

export interface BruteForceAttempt {
  userId?: string;
  ipAddress: string;
  endpoint: string;
  success: boolean;
  timestamp: Date;
  userAgent: string;
}

export interface SessionSecurityConfig {
  maxConcurrentSessions: number;
  sessionTimeoutMs: number;
  idleTimeoutMs: number;
  requireReauthForSensitive: boolean;
  rotateTokenOnRefresh: boolean;
  bindToIp: boolean;
}

export interface SecurityEvent {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  source: string;
  userId?: string;
  ipAddress?: string;
  description: string;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface FileSecurityResult {
  safe: boolean;
  threats: string[];
  mimeType: string;
  detectedExtension: string;
  fileSize: number;
  scanDetails: Record<string, unknown>;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class SecurityScannerService {
  private readonly SQL_INJECTION_PATTERNS = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|TRUNCATE)\b)/i,
    /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/i,
    /(--\s|#|\/\*)/,
    /(\bWHERE\b\s+\d+\s*=\s*\d+)/i,
    /(;\s*(DROP|DELETE|INSERT|UPDATE|CREATE)\b)/i,
    /(\b(CHAR|CONCAT|SUBSTRING|ASCII|HEX)\s*\()/i,
    /(SLEEP\s*\(\d+\))/i,
    /(WAITFOR\s+DELAY)/i,
    /(BENCHMARK\s*\()/i,
    /('\s*(OR|AND)\s+')/i,
  ];

  private readonly XSS_PATTERNS = [
    /<script[^>]*>.*?<\/script>/is,
    /javascript\s*:/i,
    /on(load|error|click|mouseover|focus|blur|submit|change|keyup|keydown)\s*=/i,
    /<\s*(img|iframe|object|embed|svg|math|audio|video)\b[^>]*\b(src|data|href|action)\s*=\s*["']?\s*javascript/i,
    /expression\s*\(/i,
    /url\s*\(\s*["']?\s*javascript/i,
    /<\s*(style|link)[^>]*>[^<]*expression\s*\(/i,
    /data\s*:\s*text\/html/i,
    /vbscript\s*:/i,
    /\balert\s*\(.*?\)/i,
  ];

  private readonly DANGEROUS_EXTENSIONS = new Set([
    '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.pif',
    '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.ps1',
    '.php', '.asp', '.aspx', '.jsp', '.cgi', '.sh', '.bash',
  ]);

  private readonly ALLOWED_MIME_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
  ]);

  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
  ) {}

  async scanForSqlInjection(input: string, location: string): Promise<SecurityThreat[]> {
    const threats: SecurityThreat[] = [];
    const decoded = this.decodeInput(input);
    const variants = [input, decoded, this.removeComments(decoded)];

    for (const variant of variants) {
      for (const pattern of this.SQL_INJECTION_PATTERNS) {
        const match = variant.match(pattern);
        if (match) {
          const threatId = crypto.createHash('md5').update(`sqli_${match[0]}_${location}`).digest('hex').slice(0, 12);
          const alreadyFound = threats.some(t => t.id === threatId);
          if (!alreadyFound) {
            threats.push({
              id: threatId,
              type: 'sql_injection',
              severity: this.classifySqlInjectionSeverity(match[0]),
              description: `Potential SQL injection detected: "${match[0].slice(0, 50)}"`,
              payload: match[0].slice(0, 200),
              location,
              recommendation: 'Use parameterized queries or prepared statements. Never concatenate user input into SQL.',
              cwe: 'CWE-89',
            });
          }
        }
      }
    }

    if (threats.length > 0) {
      await this.logSecurityEvent({
        type: 'sql_injection_detected',
        severity: threats[0].severity,
        source: location,
        description: `${threats.length} SQL injection patterns detected`,
        metadata: { threatCount: threats.length, input: input.slice(0, 100) },
      });
    }

    return threats;
  }

  private classifySqlInjectionSeverity(payload: string): SecurityThreat['severity'] {
    const upperPayload = payload.toUpperCase();
    if (upperPayload.includes('DROP') || upperPayload.includes('TRUNCATE') || upperPayload.includes('DELETE')) {
      return 'critical';
    }
    if (upperPayload.includes('UNION') || upperPayload.includes('EXEC')) {
      return 'high';
    }
    if (upperPayload.includes('OR') && /\d\s*=\s*\d/.test(payload)) {
      return 'high';
    }
    return 'medium';
  }

  async scanForXss(input: string, location: string): Promise<SecurityThreat[]> {
    const threats: SecurityThreat[] = [];
    const decoded = this.decodeInput(input);
    const variants = [input, decoded];

    for (const variant of variants) {
      for (const pattern of this.XSS_PATTERNS) {
        const match = variant.match(pattern);
        if (match) {
          const threatId = crypto.createHash('md5').update(`xss_${match[0]}_${location}`).digest('hex').slice(0, 12);
          const alreadyFound = threats.some(t => t.id === threatId);
          if (!alreadyFound) {
            const isStoredXss = location.includes('database') || location.includes('body');
            threats.push({
              id: threatId,
              type: 'xss',
              severity: isStoredXss ? 'critical' : 'high',
              description: `Potential XSS payload detected: "${match[0].slice(0, 50)}"`,
              payload: match[0].slice(0, 200),
              location,
              recommendation: 'Sanitize and encode all user-provided output. Use Content-Security-Policy headers.',
              cwe: 'CWE-79',
            });
          }
        }
      }
    }

    if (threats.length > 0) {
      await this.logSecurityEvent({
        type: 'xss_detected',
        severity: threats[0].severity,
        source: location,
        description: `${threats.length} XSS patterns detected`,
        metadata: { threatCount: threats.length, input: input.slice(0, 100) },
      });
    }

    return threats;
  }

  async validateFileUpload(
    fileName: string,
    mimeType: string,
    fileSize: number,
    fileBuffer: Buffer,
    maxSizeMb: number = 50,
  ): Promise<FileSecurityResult> {
    const threats: string[] = [];
    const extension = '.' + fileName.split('.').pop()?.toLowerCase();
    const maxSizeBytes = maxSizeMb * 1024 * 1024;

    if (this.DANGEROUS_EXTENSIONS.has(extension)) {
      threats.push(`Dangerous file extension: ${extension}`);
    }

    if (!this.ALLOWED_MIME_TYPES.has(mimeType)) {
      threats.push(`Disallowed MIME type: ${mimeType}`);
    }

    if (fileSize > maxSizeBytes) {
      threats.push(`File size ${fileSize} exceeds maximum ${maxSizeBytes}`);
    }

    const detectedMime = this.detectMimeFromMagicBytes(fileBuffer);
    if (detectedMime && detectedMime !== mimeType) {
      threats.push(`MIME type mismatch: declared ${mimeType} but detected ${detectedMime}`);
    }

    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      threats.push('Filename contains path traversal characters');
    }

    const hasNullBytes = fileBuffer.includes(0x00) && (mimeType.startsWith('text/') || mimeType === 'application/json');
    if (hasNullBytes) {
      threats.push('Text file contains null bytes (possible binary injection)');
    }

    const textContent = fileBuffer.toString('utf-8', 0, Math.min(fileBuffer.length, 10000));
    if (mimeType === 'image/svg+xml' || extension === '.svg') {
      const svgThreats = await this.scanForXss(textContent, `file:${fileName}`);
      if (svgThreats.length > 0) {
        threats.push(`SVG contains potentially malicious scripts (${svgThreats.length} patterns)`);
      }
    }

    const safe = threats.length === 0;

    if (!safe) {
      await this.logSecurityEvent({
        type: 'malicious_upload_blocked',
        severity: 'high',
        source: `file_upload:${fileName}`,
        description: `File upload blocked: ${threats.join('; ')}`,
        metadata: { fileName, mimeType, fileSize, threats },
      });
    }

    return {
      safe,
      threats,
      mimeType,
      detectedExtension: extension,
      fileSize,
      scanDetails: { detectedMime, hasNullBytes },
    };
  }

  private detectMimeFromMagicBytes(buffer: Buffer): string | null {
    if (buffer.length < 4) return null;
    const signatures: [number[], string][] = [
      [[0xFF, 0xD8, 0xFF], 'image/jpeg'],
      [[0x89, 0x50, 0x4E, 0x47], 'image/png'],
      [[0x47, 0x49, 0x46], 'image/gif'],
      [[0x25, 0x50, 0x44, 0x46], 'application/pdf'],
      [[0x50, 0x4B, 0x03, 0x04], 'application/zip'],
    ];

    for (const [sig, mime] of signatures) {
      let match = true;
      for (let i = 0; i < sig.length && i < buffer.length; i++) {
        if (buffer[i] !== sig[i]) { match = false; break; }
      }
      if (match) return mime;
    }

    return null;
  }

  async checkRateLimit(config: RateLimitConfig, identifier: string): Promise<RateLimitResult> {
    const blockKey = `ratelimit:block:${config.key}:${identifier}`;
    const blocked = await this.redis.get(blockKey);

    if (blocked) {
      const ttl = await this.redis.ttl(blockKey);
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(Date.now() + ttl * 1000),
        blocked: true,
        blockExpiresAt: new Date(Date.now() + ttl * 1000),
      };
    }

    const windowKey = `ratelimit:window:${config.key}:${identifier}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    await this.redis.zremrangebyscore(windowKey, '-inf', String(windowStart));
    const currentCount = await this.redis.zcard(windowKey);

    if (currentCount >= config.maxRequests) {
      await this.redis.set(blockKey, '1', 'PX', config.blockDurationMs);

      await this.logSecurityEvent({
        type: 'rate_limit_exceeded',
        severity: 'medium',
        source: config.key,
        description: `Rate limit exceeded for ${config.scope}: ${identifier}`,
        metadata: { config: config.key, identifier, count: currentCount },
      });

      const ttl = Math.ceil(config.blockDurationMs / 1000);
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(now + config.blockDurationMs),
        blocked: true,
        blockExpiresAt: new Date(now + config.blockDurationMs),
      };
    }

    const requestId = `${now}_${crypto.randomUUID().split('-')[0]}`;
    await this.redis.zadd(windowKey, String(now), requestId);
    await this.redis.expire(windowKey, Math.ceil(config.windowMs / 1000) + 1);

    const remaining = config.maxRequests - currentCount - 1;
    const oldestEntry = await this.redis.zrange(windowKey, 0, 0, 'WITHSCORES');
    const resetAt = oldestEntry.length >= 2
      ? new Date(parseInt(oldestEntry[1], 10) + config.windowMs)
      : new Date(now + config.windowMs);

    return { allowed: true, remaining: Math.max(0, remaining), resetAt, blocked: false };
  }

  async recordLoginAttempt(attempt: BruteForceAttempt): Promise<{ blocked: boolean; reason?: string }> {
    const ipKey = `bruteforce:ip:${attempt.ipAddress}`;
    const userKey = attempt.userId ? `bruteforce:user:${attempt.userId}` : null;
    const windowMs = 900000;
    const maxFailedAttempts = 5;
    const blockDurationMs = 1800000;

    if (!attempt.success) {
      const ipAttempts = await this.redis.incr(ipKey);
      if (ipAttempts === 1) {
        await this.redis.expire(ipKey, Math.ceil(windowMs / 1000));
      }

      if (userKey) {
        const userAttempts = await this.redis.incr(userKey);
        if (userAttempts === 1) {
          await this.redis.expire(userKey, Math.ceil(windowMs / 1000));
        }

        if (userAttempts >= maxFailedAttempts) {
          await this.redis.set(`bruteforce:locked:user:${attempt.userId}`, '1', 'PX', blockDurationMs);
          await this.logSecurityEvent({
            type: 'account_locked',
            severity: 'high',
            source: 'bruteforce_detection',
            userId: attempt.userId,
            ipAddress: attempt.ipAddress,
            description: `Account locked after ${userAttempts} failed login attempts`,
            metadata: { attempts: userAttempts, endpoint: attempt.endpoint },
          });
          return { blocked: true, reason: `Account locked after ${userAttempts} failed attempts` };
        }
      }

      if (ipAttempts >= maxFailedAttempts * 2) {
        await this.redis.set(`bruteforce:locked:ip:${attempt.ipAddress}`, '1', 'PX', blockDurationMs * 2);
        await this.logSecurityEvent({
          type: 'ip_blocked',
          severity: 'high',
          source: 'bruteforce_detection',
          ipAddress: attempt.ipAddress,
          description: `IP blocked after ${ipAttempts} failed login attempts`,
          metadata: { attempts: ipAttempts },
        });
        return { blocked: true, reason: `IP blocked after ${ipAttempts} failed attempts` };
      }
    } else {
      if (userKey) await this.redis.del(userKey);
    }

    const ipBlocked = await this.redis.get(`bruteforce:locked:ip:${attempt.ipAddress}`);
    if (ipBlocked) {
      return { blocked: true, reason: 'IP is temporarily blocked' };
    }

    if (attempt.userId) {
      const userBlocked = await this.redis.get(`bruteforce:locked:user:${attempt.userId}`);
      if (userBlocked) {
        return { blocked: true, reason: 'Account is temporarily locked' };
      }
    }

    await this.prisma.loginAttempt.create({
      data: {
        userId: attempt.userId || null,
        ipAddress: attempt.ipAddress,
        endpoint: attempt.endpoint,
        success: attempt.success,
        userAgent: attempt.userAgent,
        timestamp: new Date(),
      },
    });

    return { blocked: false };
  }

  async validateSession(
    sessionId: string,
    userId: string,
    ipAddress: string,
    config: SessionSecurityConfig,
  ): Promise<{ valid: boolean; reason?: string }> {
    const sessionKey = `session:${sessionId}`;
    const sessionData = await this.redis.get(sessionKey);

    if (!sessionData) {
      return { valid: false, reason: 'Session not found' };
    }

    const session = JSON.parse(sessionData);
    const now = Date.now();

    if (session.userId !== userId) {
      await this.logSecurityEvent({
        type: 'session_hijack_attempt',
        severity: 'critical',
        source: 'session_validation',
        userId,
        ipAddress,
        description: 'Session user ID mismatch',
        metadata: { sessionId, expectedUser: session.userId, actualUser: userId },
      });
      return { valid: false, reason: 'Session does not belong to user' };
    }

    if (config.bindToIp && session.ipAddress !== ipAddress) {
      await this.logSecurityEvent({
        type: 'session_ip_mismatch',
        severity: 'high',
        source: 'session_validation',
        userId,
        ipAddress,
        description: `Session IP mismatch: expected ${session.ipAddress}, got ${ipAddress}`,
        metadata: { sessionId },
      });
      return { valid: false, reason: 'Session IP address mismatch' };
    }

    if (now - session.createdAt > config.sessionTimeoutMs) {
      await this.redis.del(sessionKey);
      return { valid: false, reason: 'Session expired' };
    }

    if (now - session.lastActivityAt > config.idleTimeoutMs) {
      await this.redis.del(sessionKey);
      return { valid: false, reason: 'Session idle timeout' };
    }

    const userSessionsKey = `user-sessions:${userId}`;
    const activeSessions = await this.redis.scard(userSessionsKey);
    if (activeSessions > config.maxConcurrentSessions) {
      return { valid: false, reason: `Exceeds maximum concurrent sessions (${config.maxConcurrentSessions})` };
    }

    session.lastActivityAt = now;
    await this.redis.set(sessionKey, JSON.stringify(session), 'PX', config.sessionTimeoutMs);

    return { valid: true };
  }

  private async logSecurityEvent(
    event: Omit<SecurityEvent, 'id' | 'timestamp'>,
  ): Promise<void> {
    const securityEvent: SecurityEvent = {
      ...event,
      id: `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date(),
    };

    await this.prisma.securityEvent.create({
      data: {
        type: event.type,
        severity: event.severity,
        source: event.source,
        userId: event.userId || null,
        ipAddress: event.ipAddress || null,
        description: event.description,
        metadata: JSON.stringify(event.metadata),
        timestamp: new Date(),
      },
    });

    if (event.severity === 'critical' || event.severity === 'high') {
      await this.redis.publish('security:alerts', JSON.stringify(securityEvent));
    }

    await this.redis.lpush('security:events', JSON.stringify(securityEvent));
    await this.redis.ltrim('security:events', 0, 9999);
  }

  private decodeInput(input: string): string {
    let decoded = input;
    try {
      decoded = decodeURIComponent(decoded);
    } catch {}
    decoded = decoded.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
    decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
    decoded = decoded.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
    return decoded;
  }

  private removeComments(input: string): string {
    return input
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/--[^\n]*/g, '')
      .replace(/#[^\n]*/g, '');
  }
}
