import { createClient, RedisClientType } from 'redis';
import { logger } from './logger';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const DEFAULT_TTL = parseInt(process.env.CACHE_TTL || '3600', 10);
const KEY_PREFIX = 'localization:';

let client: RedisClientType;

export async function getRedisClient(): Promise<RedisClientType> {
  if (!client) {
    client = createClient({ url: REDIS_URL }) as RedisClientType;
    client.on('error', (err) => logger.error('Redis client error', { error: err.message }));
    client.on('connect', () => logger.info('Redis client connected'));
    await client.connect();
  }
  return client;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const redis = await getRedisClient();
    const cached = await redis.get(`${KEY_PREFIX}${key}`);
    if (cached) {
      logger.debug('Cache hit', { key });
      return JSON.parse(cached) as T;
    }
    logger.debug('Cache miss', { key });
    return null;
  } catch (error) {
    logger.warn('Cache get failed', { key, error: (error as Error).message });
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttl: number = DEFAULT_TTL): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.setEx(`${KEY_PREFIX}${key}`, ttl, JSON.stringify(value));
    logger.debug('Cache set', { key, ttl });
  } catch (error) {
    logger.warn('Cache set failed', { key, error: (error as Error).message });
  }
}

export async function cacheDel(pattern: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    const keys = await redis.keys(`${KEY_PREFIX}${pattern}*`);
    if (keys.length > 0) {
      await redis.del(keys);
      logger.debug('Cache invalidated', { pattern, count: keys.length });
    }
  } catch (error) {
    logger.warn('Cache delete failed', { pattern, error: (error as Error).message });
  }
}

export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit();
    logger.info('Redis client disconnected');
  }
}
