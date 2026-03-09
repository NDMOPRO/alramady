import { createClient, RedisClientType } from 'redis';
import { logger } from './logger';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const DEFAULT_TTL = parseInt(process.env.CACHE_TTL || '3600', 10);
const KEY_PREFIX = 'ai-svc:';

let client: RedisClientType;

export async function getRedisClient(): Promise<RedisClientType> {
  if (!client) {
    client = createClient({ url: REDIS_URL }) as RedisClientType;
    client.on('error', (err) => logger.error('Redis client error', { error: err }));
    client.on('connect', () => logger.info('Redis connected'));
    await client.connect();
  }
  return client;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const redis = await getRedisClient();
    const data = await redis.get(`${KEY_PREFIX}${key}`);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch (err) {
    logger.warn('Cache get failed', { key, error: err });
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttl: number = DEFAULT_TTL): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.set(`${KEY_PREFIX}${key}`, JSON.stringify(value), { EX: ttl });
  } catch (err) {
    logger.warn('Cache set failed', { key, error: err });
  }
}

export async function cacheDel(pattern: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    const keys = await redis.keys(`${KEY_PREFIX}${pattern}`);
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch (err) {
    logger.warn('Cache delete failed', { pattern, error: err });
  }
}

export async function cacheDelByPrefix(prefix: string): Promise<void> {
  await cacheDel(`${prefix}*`);
}
