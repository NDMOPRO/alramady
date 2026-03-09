type MockModel = {
  findMany: jest.Mock;
  findUnique: jest.Mock;
  findUniqueOrThrow: jest.Mock;
  findFirst: jest.Mock;
  count: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  deleteMany: jest.Mock;
  upsert: jest.Mock;
};

function createMockModel(): MockModel {
  return {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findUniqueOrThrow: jest.fn().mockRejectedValue(new Error('Not found')),
    findFirst: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
      return Promise.resolve({ id: 'mock-id-1', ...args.data, createdAt: new Date(), updatedAt: new Date() });
    }),
    update: jest.fn().mockImplementation((args: { data: Record<string, unknown>, where: Record<string, unknown> }) => {
      return Promise.resolve({ id: args.where.id, ...args.data, updatedAt: new Date() });
    }),
    delete: jest.fn().mockResolvedValue({ id: 'mock-id-1' }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    upsert: jest.fn().mockImplementation((args: { create: Record<string, unknown> }) => {
      return Promise.resolve({ id: 'mock-id-1', ...args.create });
    }),
  };
}

export const mockPrisma = {
  // Section models
  dashboardEasyMode: createMockModel(),
  dashboardAdvancedMode: createMockModel(),
  dashboardDragElement: createMockModel(),
  dashboardFullEditor: createMockModel(),
  dashboardPostEdit: createMockModel(),
  dashboardTemplate: createMockModel(),
  dashboardExternalSimulation: createMockModel(),
  dashboardPerformance: createMockModel(),

  // Engine models
  widget: createMockModel(),
  widgetTemplate: createMockModel(),
  widgetInteraction: createMockModel(),
  widgetDataFetch: createMockModel(),
  dashboardLayoutHistory: createMockModel(),
  dashboardTheme: createMockModel(),
  themeVariant: createMockModel(),
  dashboard: createMockModel(),
  dataset: createMockModel(),
  datasetRow: createMockModel(),
  exportHistory: createMockModel(),
  dataStream: createMockModel(),
  connectionLog: createMockModel(),

  // Raw query support
  $queryRawUnsafe: jest.fn().mockResolvedValue([]),
  $transaction: jest.fn().mockImplementation((queries: Promise<unknown>[]) => Promise.all(queries)),
  $connect: jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined),
};

export type MockPrisma = typeof mockPrisma;

export function resetPrismaMocks(): void {
  for (const [key, value] of Object.entries(mockPrisma)) {
    if (typeof value === 'function') {
      (value as jest.Mock).mockClear();
    } else if (typeof value === 'object' && value !== null) {
      for (const fn of Object.values(value as Record<string, jest.Mock>)) {
        if (typeof fn === 'function' && 'mockClear' in fn) {
          fn.mockClear();
        }
      }
    }
  }
}
