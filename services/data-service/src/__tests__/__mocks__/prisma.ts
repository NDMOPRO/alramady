// Jest mock for Prisma client — used in unit tests
// Each model exposes findMany, findUnique, create, update, delete, count

function createModelMock() {
  return {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'test-uuid', ...data, createdAt: new Date(), updatedAt: new Date() })),
    update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'test-uuid', ...data, updatedAt: new Date() })),
    delete: jest.fn().mockResolvedValue({ id: 'test-uuid' }),
    count: jest.fn().mockResolvedValue(0),
    upsert: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    aggregate: jest.fn().mockResolvedValue({}),
    groupBy: jest.fn().mockResolvedValue([]),
  };
}

export const prisma = {
  storageQuota: createModelMock(),
  fileClassification: createModelMock(),
  readingSession: createModelMock(),
  datasetColumn: createModelMock(),
  tableView: createModelMock(),
  visualProcessing: createModelMock(),
  mixedFileEntry: createModelMock(),
  dataset: createModelMock(),
  dataRow: createModelMock(),
  ingestionJob: createModelMock(),
  dataQualityCheck: createModelMock(),
  $connect: jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined),
  $queryRaw: jest.fn().mockResolvedValue([]),
  $on: jest.fn(),
};

// Auto-mock the prisma utility module
jest.mock('../../utils/prisma', () => ({
  prisma,
  connectDatabase: jest.fn().mockResolvedValue(undefined),
  disconnectDatabase: jest.fn().mockResolvedValue(undefined),
}));
