// Jest mock for Redis cache utilities

export const cacheGet = jest.fn().mockResolvedValue(null);
export const cacheSet = jest.fn().mockResolvedValue(undefined);
export const cacheDel = jest.fn().mockResolvedValue(undefined);
export const getRedisClient = jest.fn().mockReturnValue({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  keys: jest.fn().mockResolvedValue([]),
  ping: jest.fn().mockResolvedValue('PONG'),
  connect: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
});
export const connectRedis = jest.fn().mockResolvedValue(undefined);
export const disconnectRedis = jest.fn().mockResolvedValue(undefined);

jest.mock('../../utils/redis', () => ({
  cacheGet,
  cacheSet,
  cacheDel,
  getRedisClient,
  connectRedis,
  disconnectRedis,
}));
