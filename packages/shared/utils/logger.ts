/**
 * RASID Platform - Winston Logger Utility
 *
 * Centralized logging with JSON format, service name tagging, timestamps,
 * and configurable log levels per environment.
 */

import winston from 'winston';

// ---------------------------------------------------------------------------
// Log levels (matching syslog-style severity)
// ---------------------------------------------------------------------------

const LOG_LEVELS: Record<string, number> = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6,
};

const LOG_COLORS: Record<string, string> = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  verbose: 'cyan',
  debug: 'blue',
  silly: 'grey',
};

// ---------------------------------------------------------------------------
// Logger configuration
// ---------------------------------------------------------------------------

export interface LoggerConfig {
  /** Name of the service (appears in every log entry) */
  serviceName: string;
  /** Minimum log level. Defaults to 'info' in production, 'debug' otherwise */
  level?: string;
  /** Whether to output pretty-printed logs to console (useful in dev) */
  prettyPrint?: boolean;
  /** Whether to log to a file as well */
  logFilePath?: string;
  /** Additional default metadata attached to every log entry */
  defaultMeta?: Record<string, unknown>;
  /** Suppress console output (e.g., during tests) */
  silent?: boolean;
}

// ---------------------------------------------------------------------------
// Create logger
// ---------------------------------------------------------------------------

/**
 * Create a configured Winston logger instance for a RASID microservice.
 *
 * Every log entry includes:
 *  - timestamp (ISO 8601)
 *  - level
 *  - service name
 *  - message
 *  - optional metadata
 *
 * In production, output is JSON for structured log ingestion (ELK / Loki).
 * In development, output is colorized and human-readable.
 */
export function createLogger(config: LoggerConfig): winston.Logger {
  const isProduction = process.env.NODE_ENV === 'production';
  const level = config.level || (isProduction ? 'info' : 'debug');

  winston.addColors(LOG_COLORS);

  // Base format: always include timestamp and service metadata
  const baseFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.metadata({
      fillExcept: ['message', 'level', 'timestamp', 'service'],
    })
  );

  // JSON format for production / structured logging
  const jsonFormat = winston.format.combine(
    baseFormat,
    winston.format.json()
  );

  // Human-readable format for development
  const prettyFormat = winston.format.combine(
    baseFormat,
    winston.format.colorize({ all: true }),
    winston.format.printf(({ timestamp, level: lvl, message, service, metadata }) => {
      const svc = service || config.serviceName;
      const meta = metadata && Object.keys(metadata as object).length > 0
        ? ` ${JSON.stringify(metadata)}`
        : '';
      return `${timestamp} [${svc}] ${lvl}: ${message}${meta}`;
    })
  );

  const usePretty = config.prettyPrint !== undefined ? config.prettyPrint : !isProduction;
  const chosenFormat = usePretty ? prettyFormat : jsonFormat;

  // Build transports array
  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: chosenFormat,
      silent: config.silent === true,
    }),
  ];

  // Optional file transport
  if (config.logFilePath) {
    transports.push(
      new winston.transports.File({
        filename: config.logFilePath,
        format: jsonFormat,
        maxsize: 10 * 1024 * 1024, // 10 MB
        maxFiles: 5,
        tailable: true,
      })
    );
  }

  const logger = winston.createLogger({
    levels: LOG_LEVELS,
    level,
    defaultMeta: {
      service: config.serviceName,
      ...config.defaultMeta,
    },
    transports,
    exitOnError: false,
  });

  // Log startup
  logger.info(`Logger initialized for service "${config.serviceName}" at level "${level}"`);

  return logger;
}

// ---------------------------------------------------------------------------
// Default / singleton logger
// ---------------------------------------------------------------------------

let _defaultLogger: winston.Logger | null = null;

/**
 * Get or create the default shared logger.
 * Uses RASID_SERVICE_NAME env variable, or 'rasid-shared' as fallback.
 */
export function getDefaultLogger(): winston.Logger {
  if (!_defaultLogger) {
    _defaultLogger = createLogger({
      serviceName: process.env.RASID_SERVICE_NAME || 'rasid-shared',
      level: process.env.LOG_LEVEL || undefined,
      prettyPrint: process.env.NODE_ENV !== 'production',
      silent: process.env.NODE_ENV === 'test',
    });
  }
  return _defaultLogger;
}

/**
 * Replace the default logger (useful for testing or custom configurations).
 */
export function setDefaultLogger(logger: winston.Logger): void {
  _defaultLogger = logger;
}

// ---------------------------------------------------------------------------
// Convenience child logger
// ---------------------------------------------------------------------------

/**
 * Create a child logger with additional context (e.g., request ID, user ID).
 */
export function createChildLogger(
  parent: winston.Logger,
  context: Record<string, unknown>
): winston.Logger {
  return parent.child(context);
}
