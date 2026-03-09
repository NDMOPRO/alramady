export const mockCacheGet = jest.fn().mockResolvedValue(null);
export const mockCacheSet = jest.fn().mockResolvedValue(undefined);
export const mockCacheDel = jest.fn().mockResolvedValue(undefined);

jest.mock('../../utils/redis', () => ({
  cacheGet: mockCacheGet,
  cacheSet: mockCacheSet,
  cacheDel: mockCacheDel,
}));
