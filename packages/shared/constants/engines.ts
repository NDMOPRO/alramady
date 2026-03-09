/**
 * RASID Platform - Engine Constants
 *
 * Quick-access constants for engine names, ports, descriptions, and route maps.
 */

import { Engine, ENGINE_REGISTRY, EngineConfig } from '../types/engine-types';

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Retrieve the full configuration for a given engine.
 */
export function getEngine(id: Engine): EngineConfig {
  const config = ENGINE_REGISTRY[id];
  if (!config) {
    throw new Error(`Unknown engine: ${id}. Valid engines: ${Object.values(Engine).join(', ')}`);
  }
  return config;
}

/**
 * Return an array of all 13 engine configurations.
 */
export function getAllEngines(): EngineConfig[] {
  return Object.values(ENGINE_REGISTRY);
}

/**
 * Find an engine by its port number. Returns undefined if no match.
 */
export function getEngineByPort(port: number): EngineConfig | undefined {
  const engines = getAllEngines();
  for (const engine of engines) {
    if (engine.port === port) {
      return engine;
    }
  }
  return undefined;
}

/**
 * Find an engine by its Docker service name. Returns undefined if no match.
 */
export function getEngineByService(service: string): EngineConfig | undefined {
  const engines = getAllEngines();
  const normalizedService = service.toLowerCase().trim();
  for (const engine of engines) {
    if (engine.service === normalizedService) {
      return engine;
    }
  }
  return undefined;
}

/**
 * Return an engine config by matching a partial name or slug.
 * Useful for CLI or dynamic routing.
 */
export function findEngineBySlug(slug: string): EngineConfig | undefined {
  const normalized = slug.toLowerCase().trim();
  const engines = getAllEngines();
  for (const engine of engines) {
    if (
      engine.id === normalized ||
      engine.name.toLowerCase().includes(normalized) ||
      engine.service.includes(normalized)
    ) {
      return engine;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Service name -> port map
// ---------------------------------------------------------------------------

export const SERVICE_PORTS: Record<string, number> = {
  'rasid-data-service': 8001,
  'rasid-excel-service': 8002,
  'rasid-dashboard-service': 8003,
  'rasid-reporting-service': 8004,
  'rasid-presentation-service': 8005,
  'rasid-infographic-service': 8006,
  'rasid-replication-service': 8007,
  'rasid-localization-service': 8008,
  'rasid-ai-service': 8009,
  'rasid-governance-service': 8010,
  'rasid-library-service': 8011,
  'rasid-template-service': 8012,
  'rasid-conversion-service': 8013,
};

// ---------------------------------------------------------------------------
// Engine -> API route prefix map
// ---------------------------------------------------------------------------

export const ENGINE_ROUTES: Record<Engine, string> = {
  [Engine.DATA]: '/api/v1/data',
  [Engine.EXCEL]: '/api/v1/excel',
  [Engine.DASHBOARD]: '/api/v1/dashboard',
  [Engine.REPORTING]: '/api/v1/reporting',
  [Engine.PRESENTATION]: '/api/v1/presentation',
  [Engine.INFOGRAPHIC]: '/api/v1/infographic',
  [Engine.REPLICATION]: '/api/v1/replication',
  [Engine.LOCALIZATION]: '/api/v1/localization',
  [Engine.AI]: '/api/v1/ai',
  [Engine.GOVERNANCE]: '/api/v1/governance',
  [Engine.LIBRARY]: '/api/v1/library',
  [Engine.TEMPLATE]: '/api/v1/template',
  [Engine.CONVERSION]: '/api/v1/conversion',
};

// ---------------------------------------------------------------------------
// Engine descriptions (English)
// ---------------------------------------------------------------------------

export const ENGINE_DESCRIPTIONS: Record<Engine, string> = {
  [Engine.DATA]: 'Data ingestion, parsing, cleansing, transformation, merging, export, visualization, search, and versioning',
  [Engine.EXCEL]: 'Full spreadsheet capabilities with formulas, pivot tables, and multi-format export',
  [Engine.DASHBOARD]: 'Interactive dashboard builder with widgets, charts, filters, live updates, and image-to-dashboard AI',
  [Engine.REPORTING]: 'Report generation with scheduling, templating, periodic reports, and distribution',
  [Engine.PRESENTATION]: 'Slide editor with templates, animations, AI generation, media, themes, and transitions',
  [Engine.INFOGRAPHIC]: 'Visual infographic builder with hierarchical layouts and data-driven elements',
  [Engine.REPLICATION]: 'Pixel-perfect design replication with structural analysis, comparison, and fingerprinting',
  [Engine.LOCALIZATION]: 'RTL transformation, Arabic typography, cultural formatting, translation, and bidi layout',
  [Engine.AI]: 'Free interrogation, AI analysis, recommendations, NLP, orchestration, and intelligent agents',
  [Engine.GOVERNANCE]: 'Users, roles, permissions, audit, workflows, notifications, policies, and compliance',
  [Engine.LIBRARY]: 'Centralized asset management for images, icons, fonts, templates, and media',
  [Engine.TEMPLATE]: 'Template management, categorization, instantiation, and marketplace',
  [Engine.CONVERSION]: 'Format detection and document, image, and data conversion between formats',
};

// ---------------------------------------------------------------------------
// Engine descriptions (Arabic)
// ---------------------------------------------------------------------------

export const ENGINE_DESCRIPTIONS_AR: Record<Engine, string> = {
  [Engine.DATA]: 'استيعاب البيانات وتحليلها وتنظيفها وتحويلها ودمجها وتصديرها وتصورها والبحث فيها وإدارة إصداراتها',
  [Engine.EXCEL]: 'قدرات جداول البيانات الكاملة مع الصيغ والجداول المحورية والتصدير متعدد التنسيقات',
  [Engine.DASHBOARD]: 'منشئ لوحات المعلومات التفاعلية مع الأدوات والرسوم البيانية والمرشحات والتحديثات المباشرة',
  [Engine.REPORTING]: 'إنشاء التقارير مع الجدولة والقوالب والتقارير الدورية والتوزيع',
  [Engine.PRESENTATION]: 'محرر الشرائح مع القوالب والرسوم المتحركة والتوليد بالذكاء الاصطناعي والوسائط والسمات',
  [Engine.INFOGRAPHIC]: 'منشئ الإنفوجرافيك المرئي مع التخطيطات الهرمية والعناصر المبنية على البيانات',
  [Engine.REPLICATION]: 'نسخ التصاميم بدقة البكسل مع التحليل الهيكلي والمقارنة وبصمة التصميم',
  [Engine.LOCALIZATION]: 'تحويل RTL والطباعة العربية والتنسيق الثقافي والترجمة والتخطيط ثنائي الاتجاه',
  [Engine.AI]: 'الاستجواب الحر والتحليل بالذكاء الاصطناعي والتوصيات ومعالجة اللغة الطبيعية والتنسيق والوكلاء',
  [Engine.GOVERNANCE]: 'المستخدمون والأدوار والصلاحيات والتدقيق وسير العمل والإشعارات والسياسات والامتثال',
  [Engine.LIBRARY]: 'إدارة الأصول المركزية للصور والأيقونات والخطوط والقوالب والوسائط',
  [Engine.TEMPLATE]: 'إدارة القوالب والتصنيف والإنشاء والسوق',
  [Engine.CONVERSION]: 'اكتشاف التنسيق وتحويل المستندات والصور والبيانات بين التنسيقات',
};

// ---------------------------------------------------------------------------
// Port range check
// ---------------------------------------------------------------------------

export const ENGINE_PORT_MIN = 8001;
export const ENGINE_PORT_MAX = 8013;

/**
 * Check if a given port belongs to a RASID engine service.
 */
export function isEnginePort(port: number): boolean {
  return port >= ENGINE_PORT_MIN && port <= ENGINE_PORT_MAX;
}

/**
 * Get an array of all engine ports.
 */
export function getAllEnginePorts(): number[] {
  return getAllEngines().map((engine) => engine.port);
}

/**
 * Build the full internal URL for a given engine (Docker networking).
 */
export function getEngineInternalUrl(engine: Engine): string {
  const config = getEngine(engine);
  return `http://${config.service}:${config.port}${config.basePath}`;
}
