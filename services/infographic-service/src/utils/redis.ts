import Redis from 'ioredis';
import { logger } from './logger.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const DEFAULT_TTL = parseInt(process.env.CACHE_TTL || '3600', 10);
const KEY_PREFIX = 'infographic:';

let client: Redis | null = null;

export async function getRedisClient(): Promise<Redis> {
  if (!client) {
    client = new Redis(REDIS_URL);
    client.on('error', (err: Error) => logger.error('Redis Client Error', err));
    client.on('connect', () => logger.info('Redis connected'));
  }
  return client;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const redis = await getRedisClient();
    const data = await redis.get(`${KEY_PREFIX}${key}`);
    if (data) {
      logger.debug(`Cache HIT: ${key}`);
      return JSON.parse(data) as T;
    }
    logger.debug(`Cache MISS: ${key}`);
    return null;
  } catch (err) {
    logger.warn('Cache get error', { key, error: err });
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttl: number = DEFAULT_TTL): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.set(`${KEY_PREFIX}${key}`, JSON.stringify(value), 'EX', ttl);
    logger.debug(`Cache SET: ${key} (TTL: ${ttl}s)`);
  } catch (err) {
    logger.warn('Cache set error', { key, error: err });
  }
}

export async function cacheDel(pattern: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    const keys = await redis.keys(`${KEY_PREFIX}${pattern}`);
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.debug(`Cache DEL: ${keys.length} keys matching ${pattern}`);
    }
  } catch (err) {
    logger.warn('Cache del error', { pattern, error: err });
  }
}

export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit();
    logger.info('Redis disconnected');
  }
}
