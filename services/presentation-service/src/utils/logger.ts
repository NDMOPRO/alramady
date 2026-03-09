import winston from 'winston';

const { combine, timestamp, errors, json, colorize, simple } = winston.format;

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    json()
  ),
  defaultMeta: { service: 'presentation-service' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error', maxsize: 10485760, maxFiles: 5 }),
    new winston.transports.File({ filename: 'logs/combined.log', maxsize: 10485760, maxFiles: 5 }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: combine(colorize(), simple()),
  }));
}
