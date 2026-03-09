declare module '../../../../packages/shared/types/dashboard-features' {
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

  export interface FeatureStatus {
    featureId: string;
    implemented: boolean;
    implementedAt?: string;
    testedAt?: string;
    coverage?: number;
  }

  export interface SectionStats {
    section: DashboardSection;
    totalFeatures: number;
    implemented: number;
    pending: number;
    percentComplete: number;
    byCategory: Record<FeatureCategory, { total: number; implemented: number }>;
  }

  export const SECTION_FEATURE_COUNTS: Record<DashboardSection, number>;
  export const TOTAL_FEATURES: number;

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

  export const SECTION_METADATA: Record<DashboardSection, SectionMetadata>;
}
