import { v4 as uuidv4 } from 'uuid';

let counter = 0;

function nextId(): string {
  counter++;
  return `test-id-${counter}`;
}

export function resetFactoryCounter(): void {
  counter = 0;
}

// ─── Dashboard Easy Mode ──────────────────────────────────────────────
export function buildEasyMode(overrides: Record<string, unknown> = {}) {
  return {
    id: nextId(),
    name: `Test Dashboard ${counter}`,
    description: 'Test description',
    dashboardType: 'standard',
    isPublic: false,
    autoRefresh: false,
    tags: [],
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

// ─── Dashboard Advanced Mode ──────────────────────────────────────────
export function buildAdvancedMode(overrides: Record<string, unknown> = {}) {
  return {
    id: nextId(),
    name: `Advanced Dashboard ${counter}`,
    description: 'Advanced test description',
    queryConfig: { sql: 'SELECT * FROM data' },
    cacheStrategy: 'standard',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

// ─── Drag Element ─────────────────────────────────────────────────────
export function buildDragElement(overrides: Record<string, unknown> = {}) {
  return {
    id: nextId(),
    dashboardId: 'dashboard-1',
    elementType: 'chart',
    label: `Element ${counter}`,
    positionX: 0,
    positionY: 0,
    width: 4,
    height: 3,
    zIndex: 0,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

// ─── Full Editor ──────────────────────────────────────────────────────
export function buildFullEditor(overrides: Record<string, unknown> = {}) {
  return {
    id: nextId(),
    dashboardId: 'dashboard-1',
    editorMode: 'visual',
    undoHistory: [],
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

// ─── Post Edit ────────────────────────────────────────────────────────
export function buildPostEdit(overrides: Record<string, unknown> = {}) {
  return {
    id: nextId(),
    dashboardId: 'dashboard-1',
    editType: 'annotation',
    annotation: 'Test annotation',
    isPublished: false,
    version: 1,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

// ─── Template ─────────────────────────────────────────────────────────
export function buildTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: nextId(),
    name: `Template ${counter}`,
    description: 'Test template',
    category: 'analytics',
    templateConfig: { layout: 'grid' },
    isPremium: false,
    isPublic: true,
    tags: ['test'],
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

// ─── External Simulation ──────────────────────────────────────────────
export function buildExternalSimulation(overrides: Record<string, unknown> = {}) {
  return {
    id: nextId(),
    dashboardId: 'dashboard-1',
    simulationType: 'monte_carlo',
    name: `Simulation ${counter}`,
    status: 'pending',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

// ─── Performance Metric ───────────────────────────────────────────────
export function buildPerformanceMetric(overrides: Record<string, unknown> = {}) {
  return {
    id: nextId(),
    dashboardId: 'dashboard-1',
    metricType: 'load_time',
    metricName: `Metric ${counter}`,
    currentValue: 150,
    targetValue: 200,
    status: 'healthy',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

// ─── Widget ───────────────────────────────────────────────────────────
export function buildWidget(overrides: Record<string, unknown> = {}) {
  return {
    id: nextId(),
    dashboardId: 'dashboard-1',
    type: 'chart',
    title: `Widget ${counter}`,
    config: JSON.stringify({ chartType: 'bar' }),
    dataSource: JSON.stringify({ type: 'static', staticData: [] }),
    layout: JSON.stringify({ x: 0, y: 0, width: 4, height: 3 }),
    refreshInterval: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

// ─── List params builder ──────────────────────────────────────────────
export function buildListParams(overrides: Record<string, unknown> = {}) {
  return {
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc' as const,
    ...overrides,
  };
}
