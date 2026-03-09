/**
 * RASID Platform - Dashboard Features Type System
 *
 * Categorization of 444 features across 8 dashboard sections.
 */

// ─── Section Enum ─────────────────────────────────────────────────────
export enum DashboardSection {
  EASY_MODE = 'easy_mode',
  ADVANCED_MODE = 'advanced_mode',
  DRAG_ELEMENTS = 'drag_elements',
  FULL_EDITOR = 'full_editor',
  POST_EDIT = 'post_edit',
  TEMPLATE_LIBRARY = 'template_library',
  EXTERNAL_SIMULATION = 'external_simulation',
  PERFORMANCE = 'performance',
}

// ─── Feature Category ─────────────────────────────────────────────────
export enum FeatureCategory {
  CRUD = 'crud',
  VISUALIZATION = 'visualization',
  DATA_BINDING = 'data_binding',
  LAYOUT = 'layout',
  INTERACTION = 'interaction',
  EXPORT = 'export',
  REALTIME = 'realtime',
  FILTER = 'filter',
  KPI = 'kpi',
  THEME = 'theme',
  TEMPLATE = 'template',
  SIMULATION = 'simulation',
  ANALYTICS = 'analytics',
  COLLABORATION = 'collaboration',
  ACCESSIBILITY = 'accessibility',
  LOCALIZATION = 'localization',
}

// ─── Feature Interface ────────────────────────────────────────────────
export interface DashboardFeature {
  id: string;
  name: string;
  nameAr: string;
  section: DashboardSection;
  category: FeatureCategory;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  implemented: boolean;
  dependencies?: string[];
  engineRequired?: string[];
}

// ─── Feature Status ───────────────────────────────────────────────────
export interface FeatureStatus {
  featureId: string;
  implemented: boolean;
  implementedAt?: string;
  testedAt?: string;
  coverage?: number;
}

// ─── Section Stats ────────────────────────────────────────────────────
export interface SectionStats {
  section: DashboardSection;
  totalFeatures: number;
  implemented: number;
  pending: number;
  percentComplete: number;
  byCategory: Record<FeatureCategory, { total: number; implemented: number }>;
}

// ─── Section Feature Counts ───────────────────────────────────────────
export const SECTION_FEATURE_COUNTS: Record<DashboardSection, number> = {
  [DashboardSection.EASY_MODE]: 95,
  [DashboardSection.ADVANCED_MODE]: 75,
  [DashboardSection.DRAG_ELEMENTS]: 60,
  [DashboardSection.FULL_EDITOR]: 55,
  [DashboardSection.POST_EDIT]: 40,
  [DashboardSection.TEMPLATE_LIBRARY]: 49,
  [DashboardSection.EXTERNAL_SIMULATION]: 35,
  [DashboardSection.PERFORMANCE]: 35,
};

export const TOTAL_FEATURES = Object.values(SECTION_FEATURE_COUNTS).reduce((sum, count) => sum + count, 0);

// ─── Section Metadata ─────────────────────────────────────────────────
export interface SectionMetadata {
  section: DashboardSection;
  name: string;
  nameAr: string;
  description: string;
  featureCount: number;
  prismaModel: string;
  cachePrefix: string;
  engines: string[];
}

export const SECTION_METADATA: Record<DashboardSection, SectionMetadata> = {
  [DashboardSection.EASY_MODE]: {
    section: DashboardSection.EASY_MODE,
    name: 'Easy Mode',
    nameAr: 'الوضع السهل',
    description: 'Simplified dashboard creation wizard',
    featureCount: 95,
    prismaModel: 'dashboardEasyMode',
    cachePrefix: 'dashboard:easy-mode',
    engines: ['chart', 'widget', 'theme', 'export'],
  },
  [DashboardSection.ADVANCED_MODE]: {
    section: DashboardSection.ADVANCED_MODE,
    name: 'Advanced Mode',
    nameAr: 'الوضع المتقدم',
    description: 'Advanced query-driven dashboard builder',
    featureCount: 75,
    prismaModel: 'dashboardAdvancedMode',
    cachePrefix: 'dashboard:advanced-mode',
    engines: ['chart', 'widget', 'filter', 'kpi', 'realtime'],
  },
  [DashboardSection.DRAG_ELEMENTS]: {
    section: DashboardSection.DRAG_ELEMENTS,
    name: 'Drag Elements',
    nameAr: 'عناصر السحب',
    description: 'Drag-and-drop element management',
    featureCount: 60,
    prismaModel: 'dashboardDragElement',
    cachePrefix: 'dashboard:drag-elements',
    engines: ['widget', 'chart'],
  },
  [DashboardSection.FULL_EDITOR]: {
    section: DashboardSection.FULL_EDITOR,
    name: 'Full Editor',
    nameAr: 'المحرر الكامل',
    description: 'Complete visual editor with undo/redo',
    featureCount: 55,
    prismaModel: 'dashboardFullEditor',
    cachePrefix: 'dashboard:full-editor',
    engines: ['widget', 'chart', 'theme', 'filter'],
  },
  [DashboardSection.POST_EDIT]: {
    section: DashboardSection.POST_EDIT,
    name: 'Post Edit',
    nameAr: 'ما بعد التحرير',
    description: 'Post-editing annotations and versioning',
    featureCount: 40,
    prismaModel: 'dashboardPostEdit',
    cachePrefix: 'dashboard:post-edit',
    engines: ['export'],
  },
  [DashboardSection.TEMPLATE_LIBRARY]: {
    section: DashboardSection.TEMPLATE_LIBRARY,
    name: 'Template Library',
    nameAr: 'مكتبة القوالب',
    description: 'Dashboard template management',
    featureCount: 49,
    prismaModel: 'dashboardTemplate',
    cachePrefix: 'dashboard:template-library',
    engines: ['chart', 'widget', 'theme'],
  },
  [DashboardSection.EXTERNAL_SIMULATION]: {
    section: DashboardSection.EXTERNAL_SIMULATION,
    name: 'External Simulation',
    nameAr: 'المحاكاة الخارجية',
    description: 'External data simulation engine',
    featureCount: 35,
    prismaModel: 'dashboardExternalSimulation',
    cachePrefix: 'dashboard:external-simulation',
    engines: ['chart', 'kpi'],
  },
  [DashboardSection.PERFORMANCE]: {
    section: DashboardSection.PERFORMANCE,
    name: 'Performance',
    nameAr: 'الأداء',
    description: 'Dashboard performance monitoring',
    featureCount: 35,
    prismaModel: 'dashboardPerformance',
    cachePrefix: 'dashboard:performance',
    engines: ['kpi', 'realtime'],
  },
};
