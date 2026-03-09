/**
 * RASID Platform - Engine Type Definitions
 *
 * Core engine enum, config interface, and the full ENGINE_REGISTRY
 * for all 13 RASID platform engines.
 */

// ---------------------------------------------------------------------------
// Engine enum
// ---------------------------------------------------------------------------

export enum Engine {
  DATA = 'data',
  EXCEL = 'excel',
  DASHBOARD = 'dashboard',
  REPORTING = 'reporting',
  PRESENTATION = 'presentation',
  INFOGRAPHIC = 'infographic',
  REPLICATION = 'replication',
  LOCALIZATION = 'localization',
  AI = 'ai',
  GOVERNANCE = 'governance',
  LIBRARY = 'library',
  TEMPLATE = 'template',
  CONVERSION = 'conversion',
}

// ---------------------------------------------------------------------------
// Engine configuration
// ---------------------------------------------------------------------------

export interface EngineConfig {
  id: Engine;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  service: string;
  port: number;
  basePath: string;
  featureCount: number;
  moduleCount: number;
  modules: string[];
  healthEndpoint: string;
  docsEndpoint: string;
}

// ---------------------------------------------------------------------------
// Engine registry
// ---------------------------------------------------------------------------

export const ENGINE_REGISTRY: Record<Engine, EngineConfig> = {
  [Engine.DATA]: {
    id: Engine.DATA,
    name: 'Data Engine',
    nameAr: 'محرك البيانات',
    description: 'Handles data ingestion, parsing, cleansing, transformation, merging, export, visualization, search, and versioning',
    descriptionAr: 'يتولى استيعاب البيانات وتحليلها وتنظيفها وتحويلها ودمجها وتصديرها وتصورها والبحث فيها وإدارة إصداراتها',
    service: 'rasid-data-service',
    port: 8001,
    basePath: '/api/v1/data',
    featureCount: 1259,
    moduleCount: 9,
    modules: ['FileIngestion', 'DataParsing', 'DataCleansing', 'DataTransformation', 'DataMerging', 'DataExport', 'DataVisualization', 'DataSearch', 'DataVersioning'],
    healthEndpoint: '/api/v1/data/health',
    docsEndpoint: '/api/v1/data/docs',
  },
  [Engine.EXCEL]: {
    id: Engine.EXCEL,
    name: 'Excel Engine',
    nameAr: 'محرك الإكسل',
    description: 'Full spreadsheet capabilities including formulas, pivot tables, and export',
    descriptionAr: 'قدرات جداول البيانات الكاملة بما في ذلك الصيغ والجداول المحورية والتصدير',
    service: 'rasid-excel-service',
    port: 8002,
    basePath: '/api/v1/excel',
    featureCount: 333,
    moduleCount: 4,
    modules: ['SpreadsheetCore', 'FormulaEngine', 'PivotTable', 'ExcelExport'],
    healthEndpoint: '/api/v1/excel/health',
    docsEndpoint: '/api/v1/excel/docs',
  },
  [Engine.DASHBOARD]: {
    id: Engine.DASHBOARD,
    name: 'Dashboard Engine',
    nameAr: 'محرك لوحات المؤشرات',
    description: 'Interactive dashboard builder with widgets, charts, filters, live updates, and AI-powered image-to-dashboard',
    descriptionAr: 'منشئ لوحات المعلومات التفاعلية مع الأدوات والرسوم البيانية والمرشحات والتحديثات المباشرة',
    service: 'rasid-dashboard-service',
    port: 8003,
    basePath: '/api/v1/dashboard',
    featureCount: 445,
    moduleCount: 8,
    modules: ['DashboardBuilder', 'WidgetManager', 'ChartEngine', 'FilterEngine', 'LiveUpdate', 'ImageToDashboard', 'DashboardExport', 'DashboardSharing'],
    healthEndpoint: '/api/v1/dashboard/health',
    docsEndpoint: '/api/v1/dashboard/docs',
  },
  [Engine.REPORTING]: {
    id: Engine.REPORTING,
    name: 'Reporting Engine',
    nameAr: 'محرك التقارير',
    description: 'Report generation, scheduling, templating, export, and distribution',
    descriptionAr: 'إنشاء التقارير وجدولتها واستخدام القوالب والتصدير والتوزيع',
    service: 'rasid-reporting-service',
    port: 8004,
    basePath: '/api/v1/reporting',
    featureCount: 491,
    moduleCount: 6,
    modules: ['ReportBuilder', 'ReportScheduler', 'ReportTemplates', 'ReportExport', 'PeriodicReports', 'ReportDistribution'],
    healthEndpoint: '/api/v1/reporting/health',
    docsEndpoint: '/api/v1/reporting/docs',
  },
  [Engine.PRESENTATION]: {
    id: Engine.PRESENTATION,
    name: 'Presentation Engine',
    nameAr: 'محرك العروض التقديمية',
    description: 'Slide editing, templates, animations, AI generation, media management, themes, transitions, and export',
    descriptionAr: 'تحرير الشرائح والقوالب والرسوم المتحركة والتوليد بالذكاء الاصطناعي وإدارة الوسائط والسمات والانتقالات والتصدير',
    service: 'rasid-presentation-service',
    port: 8005,
    basePath: '/api/v1/presentation',
    featureCount: 1025,
    moduleCount: 8,
    modules: ['SlideEditor', 'SlideTemplates', 'Animations', 'AIGeneration', 'MediaManager', 'ThemeEngine', 'PresentationExport', 'SlideTransitions'],
    healthEndpoint: '/api/v1/presentation/health',
    docsEndpoint: '/api/v1/presentation/docs',
  },
  [Engine.INFOGRAPHIC]: {
    id: Engine.INFOGRAPHIC,
    name: 'Infographic Engine',
    nameAr: 'محرك الإنفوجرافيك',
    description: 'Visual infographic builder with hierarchy and data-driven elements',
    descriptionAr: 'منشئ الإنفوجرافيك المرئي مع التسلسل الهرمي والعناصر المبنية على البيانات',
    service: 'rasid-infographic-service',
    port: 8006,
    basePath: '/api/v1/infographic',
    featureCount: 154,
    moduleCount: 2,
    modules: ['InfographicBuilder', 'VisualHierarchy'],
    healthEndpoint: '/api/v1/infographic/health',
    docsEndpoint: '/api/v1/infographic/docs',
  },
  [Engine.REPLICATION]: {
    id: Engine.REPLICATION,
    name: 'Replication Engine',
    nameAr: 'محرك المطابقة',
    description: 'Pixel-perfect replication of designs with structural analysis, layout comparison, and fingerprinting',
    descriptionAr: 'نسخ التصاميم بدقة البكسل مع التحليل الهيكلي ومقارنة التخطيط وبصمة التصميم',
    service: 'rasid-replication-service',
    port: 8007,
    basePath: '/api/v1/replication',
    featureCount: 137,
    moduleCount: 8,
    modules: ['PixelMatcher', 'StructuralAnalyzer', 'LayoutComparator', 'FontMatcher', 'ColorMatcher', 'SpacingAnalyzer', 'FingerprintGenerator', 'ReplicationVerifier'],
    healthEndpoint: '/api/v1/replication/health',
    docsEndpoint: '/api/v1/replication/docs',
  },
  [Engine.LOCALIZATION]: {
    id: Engine.LOCALIZATION,
    name: 'Localization Engine',
    nameAr: 'محرك التعريب',
    description: 'RTL transformation, Arabic typography, cultural formatting, translation, bidirectional layout, and font management',
    descriptionAr: 'تحويل الاتجاه من اليمين لليسار والطباعة العربية والتنسيق الثقافي والترجمة والتخطيط ثنائي الاتجاه وإدارة الخطوط',
    service: 'rasid-localization-service',
    port: 8008,
    basePath: '/api/v1/localization',
    featureCount: 237,
    moduleCount: 6,
    modules: ['RTLTransformer', 'ArabicTypography', 'CulturalFormatting', 'TranslationEngine', 'BiDirectionalLayout', 'FontManager'],
    healthEndpoint: '/api/v1/localization/health',
    docsEndpoint: '/api/v1/localization/docs',
  },
  [Engine.AI]: {
    id: Engine.AI,
    name: 'AI Engine',
    nameAr: 'محرك الذكاء الاصطناعي',
    description: 'Free interrogation, AI analysis, recommendations, NLP processing, orchestration, and AI agents',
    descriptionAr: 'الاستجواب الحر والتحليل بالذكاء الاصطناعي والتوصيات ومعالجة اللغة الطبيعية والتنسيق ووكلاء الذكاء الاصطناعي',
    service: 'rasid-ai-service',
    port: 8009,
    basePath: '/api/v1/ai',
    featureCount: 548,
    moduleCount: 6,
    modules: ['FreeInterrogation', 'AIAnalysis', 'AIRecommendations', 'NLPEngine', 'AIOrchestrator', 'AIAgents'],
    healthEndpoint: '/api/v1/ai/health',
    docsEndpoint: '/api/v1/ai/docs',
  },
  [Engine.GOVERNANCE]: {
    id: Engine.GOVERNANCE,
    name: 'Governance Engine',
    nameAr: 'محرك الحوكمة',
    description: 'User, role, permission management, audit trail, teams, workflows, notifications, integrations, policies, and compliance',
    descriptionAr: 'إدارة المستخدمين والأدوار والصلاحيات ومسار التدقيق والفرق وسير العمل والإشعارات والتكاملات والسياسات والامتثال',
    service: 'rasid-governance-service',
    port: 8010,
    basePath: '/api/v1/governance',
    featureCount: 588,
    moduleCount: 18,
    modules: [
      'UserManagement', 'RoleManagement', 'PermissionEngine', 'AuditTrail',
      'TeamManagement', 'WorkflowEngine', 'NotificationEngine', 'IntegrationHub',
      'PolicyEngine', 'ComplianceMonitor', 'SessionManager', 'APIKeyManager',
      'WebhookManager', 'FeatureFlagManager', 'TenantManager', 'BillingManager',
      'SecurityMonitor', 'SystemSettings',
    ],
    healthEndpoint: '/api/v1/governance/health',
    docsEndpoint: '/api/v1/governance/docs',
  },
  [Engine.LIBRARY]: {
    id: Engine.LIBRARY,
    name: 'Library Engine',
    nameAr: 'محرك المكتبة',
    description: 'Centralized asset management for images, icons, fonts, templates, and media',
    descriptionAr: 'إدارة الأصول المركزية للصور والأيقونات والخطوط والقوالب والوسائط',
    service: 'rasid-library-service',
    port: 8011,
    basePath: '/api/v1/library',
    featureCount: 53,
    moduleCount: 1,
    modules: ['AssetManager'],
    healthEndpoint: '/api/v1/library/health',
    docsEndpoint: '/api/v1/library/docs',
  },
  [Engine.TEMPLATE]: {
    id: Engine.TEMPLATE,
    name: 'Template Engine',
    nameAr: 'محرك القوالب',
    description: 'Template management, categorization, instantiation, and marketplace',
    descriptionAr: 'إدارة القوالب والتصنيف والإنشاء والسوق',
    service: 'rasid-template-service',
    port: 8012,
    basePath: '/api/v1/template',
    featureCount: 100,
    moduleCount: 1,
    modules: ['TemplateManager'],
    healthEndpoint: '/api/v1/template/health',
    docsEndpoint: '/api/v1/template/docs',
  },
  [Engine.CONVERSION]: {
    id: Engine.CONVERSION,
    name: 'Conversion Engine',
    nameAr: 'محرك التحويل',
    description: 'Format detection, document/image/data conversion between supported formats',
    descriptionAr: 'اكتشاف التنسيق وتحويل المستندات والصور والبيانات بين التنسيقات المدعومة',
    service: 'rasid-conversion-service',
    port: 8013,
    basePath: '/api/v1/conversion',
    featureCount: 42,
    moduleCount: 4,
    modules: ['FormatDetector', 'DocumentConverter', 'ImageConverter', 'DataConverter'],
    healthEndpoint: '/api/v1/conversion/health',
    docsEndpoint: '/api/v1/conversion/docs',
  },
};

// ---------------------------------------------------------------------------
// Aggregate constants
// ---------------------------------------------------------------------------

export const TOTAL_FEATURES = 5412;
export const TOTAL_ENGINES = 13;
export const TOTAL_MODULES = 83;
export const TOTAL_API_ENDPOINTS = 83;
export const TOTAL_DB_TABLES = 29;
export const TOTAL_PIPELINES = 20;

// ---------------------------------------------------------------------------
// Engine-specific detail types
// ---------------------------------------------------------------------------

export interface DataEngineConfig {
  maxFileSize: number;
  supportedFormats: string[];
  maxRowsPerDataset: number;
  maxColumnsPerDataset: number;
  enabledParsers: string[];
  cleansingRules: string[];
  pipelineConcurrency: number;
}

export interface ExcelEngineConfig {
  maxCellCount: number;
  maxSheets: number;
  formulaTimeout: number;
  supportedFunctions: string[];
  pivotTableLimit: number;
}

export interface DashboardEngineConfig {
  maxWidgets: number;
  refreshIntervalMin: number;
  maxConcurrentConnections: number;
  supportedChartTypes: string[];
  enableLiveUpdates: boolean;
}

export interface ReportingEngineConfig {
  maxSections: number;
  schedulerEnabled: boolean;
  maxRecipientsPerSchedule: number;
  supportedExportFormats: string[];
  templateCacheTTL: number;
}

export interface PresentationEngineConfig {
  maxSlides: number;
  maxElementsPerSlide: number;
  supportedTransitions: string[];
  aiGenerationEnabled: boolean;
  maxMediaSize: number;
}

export interface InfographicEngineConfig {
  maxElements: number;
  canvasMaxWidth: number;
  canvasMaxHeight: number;
  supportedExportFormats: string[];
}

export interface ReplicationEngineConfig {
  maxSourceFileSize: number;
  fidelityLevels: string[];
  comparisonModes: string[];
  fingerprintAlgorithm: string;
}

export interface LocalizationEngineConfig {
  supportedLocales: string[];
  defaultLocale: string;
  translationProvider: string;
  glossaryEnabled: boolean;
  rtlAutoDetect: boolean;
}

export interface AIEngineConfig {
  defaultModel: string;
  maxTokensPerRequest: number;
  streamingEnabled: boolean;
  agentTypes: string[];
  rateLimitPerMinute: number;
  embeddingDimensions: number;
}

export interface GovernanceEngineConfig {
  maxUsersPerTenant: number;
  maxRoles: number;
  sessionTimeout: number;
  mfaEnabled: boolean;
  passwordPolicy: {
    minLength: number;
    requireUppercase: boolean;
    requireNumbers: boolean;
    requireSpecial: boolean;
    maxAge: number;
  };
  auditRetentionDays: number;
}

export interface LibraryEngineConfig {
  maxAssetSize: number;
  supportedMimeTypes: string[];
  thumbnailSizes: number[];
  storagePath: string;
}

export interface TemplateEngineConfig {
  maxTemplatesPerUser: number;
  templateTypes: string[];
  cacheEnabled: boolean;
  ratingEnabled: boolean;
}

export interface ConversionEngineConfig {
  maxFileSize: number;
  supportedConversions: Record<string, string[]>;
  ocrEnabled: boolean;
  maxConcurrentConversions: number;
  timeoutMs: number;
}
