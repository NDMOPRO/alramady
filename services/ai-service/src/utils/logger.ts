import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return stack
    ? `${ts} [ai-service] ${level}: ${message}\n${stack}${metaStr}`
    : `${ts} [ai-service] ${level}: ${message}${metaStr}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat,
  ),
  defaultMeta: { service: 'ai-service' },
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), logFormat),
    }),
    new winston.transports.File({
      filename: 'logs/ai-service-error.log',
      level: 'error',
      maxsize: 5_242_880,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: 'logs/ai-service-combined.log',
      maxsize: 5_242_880,
      maxFiles: 5,
    }),
  ],
});
