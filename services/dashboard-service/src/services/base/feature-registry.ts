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

const SECTION_FEATURE_COUNTS: Record<DashboardSection, number> = {
  [DashboardSection.EASY_MODE]: 95,
  [DashboardSection.ADVANCED_MODE]: 75,
  [DashboardSection.DRAG_ELEMENTS]: 60,
  [DashboardSection.FULL_EDITOR]: 55,
  [DashboardSection.POST_EDIT]: 40,
  [DashboardSection.TEMPLATE_LIBRARY]: 49,
  [DashboardSection.EXTERNAL_SIMULATION]: 35,
  [DashboardSection.PERFORMANCE]: 35,
};

const TOTAL_FEATURES = Object.values(SECTION_FEATURE_COUNTS).reduce((sum, count) => sum + count, 0);
import { logger } from '../../utils/logger';

export interface RegisteredFeature {
  id: string;
  name: string;
  section: DashboardSection;
  category: FeatureCategory;
  implemented: boolean;
  handler?: (...args: unknown[]) => Promise<unknown>;
}

export interface SectionProgress {
  section: DashboardSection;
  total: number;
  implemented: number;
  pending: number;
  percentComplete: number;
}

export interface RegistryStats {
  totalFeatures: number;
  totalImplemented: number;
  totalPending: number;
  overallPercent: number;
  sections: SectionProgress[];
}

/**
 * Feature Registry
 *
 * Central registry for tracking all 444 dashboard features.
 * Each section service registers its features and handlers.
 */
export class FeatureRegistry {
  private features: Map<string, RegisteredFeature> = new Map();

  /**
   * Register a feature with optional handler.
   */
  register(
    id: string,
    name: string,
    section: DashboardSection,
    category: FeatureCategory,
    handler?: (...args: unknown[]) => Promise<unknown>,
  ): void {
    this.features.set(id, {
      id,
      name,
      section,
      category,
      implemented: !!handler,
      handler,
    });
  }

  /**
   * Register multiple features at once.
   */
  registerBatch(
    section: DashboardSection,
    features: Array<{
      id: string;
      name: string;
      category: FeatureCategory;
      handler?: (...args: unknown[]) => Promise<unknown>;
    }>,
  ): void {
    for (const feature of features) {
      this.register(feature.id, feature.name, section, feature.category, feature.handler);
    }
    logger.info('Features registered', {
      section,
      count: features.length,
      implemented: features.filter(f => !!f.handler).length,
    });
  }

  /**
   * Check if a feature is implemented.
   */
  isImplemented(featureId: string): boolean {
    const feature = this.features.get(featureId);
    return feature?.implemented ?? false;
  }

  /**
   * Get a feature's handler.
   */
  getHandler(featureId: string): ((...args: unknown[]) => Promise<unknown>) | undefined {
    return this.features.get(featureId)?.handler;
  }

  /**
   * Execute a feature by ID.
   */
  async execute(featureId: string, ...args: unknown[]): Promise<unknown> {
    const feature = this.features.get(featureId);
    if (!feature) {
      throw new Error(`Feature '${featureId}' not found in registry`);
    }
    if (!feature.handler) {
      throw new Error(`Feature '${featureId}' is not yet implemented`);
    }
    return feature.handler(...args);
  }

  /**
   * Get all features for a section.
   */
  getBySection(section: DashboardSection): RegisteredFeature[] {
    return Array.from(this.features.values()).filter(f => f.section === section);
  }

  /**
   * Get all features for a category.
   */
  getByCategory(category: FeatureCategory): RegisteredFeature[] {
    return Array.from(this.features.values()).filter(f => f.category === category);
  }

  /**
   * Get progress stats per section.
   */
  getSectionProgress(section: DashboardSection): SectionProgress {
    const sectionFeatures = this.getBySection(section);
    const implemented = sectionFeatures.filter(f => f.implemented).length;
    const total = SECTION_FEATURE_COUNTS[section];

    return {
      section,
      total,
      implemented,
      pending: total - implemented,
      percentComplete: total > 0 ? Math.round((implemented / total) * 100) : 0,
    };
  }

  /**
   * Get overall registry statistics.
   */
  getStats(): RegistryStats {
    const sections = Object.values(DashboardSection).map(section =>
      this.getSectionProgress(section),
    );

    const totalImplemented = sections.reduce((sum, s) => sum + s.implemented, 0);

    return {
      totalFeatures: TOTAL_FEATURES,
      totalImplemented,
      totalPending: TOTAL_FEATURES - totalImplemented,
      overallPercent: Math.round((totalImplemented / TOTAL_FEATURES) * 100),
      sections,
    };
  }

  /**
   * Get all registered features.
   */
  getAll(): RegisteredFeature[] {
    return Array.from(this.features.values());
  }

  /**
   * Get count of registered features.
   */
  get size(): number {
    return this.features.size;
  }
}

export const featureRegistry = new FeatureRegistry();
