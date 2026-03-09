/**
 * Arabic BI Terminology Registry
 * Static registry of 200+ Business Intelligence terms with Arabic translations.
 * Context-aware: same English term may have different Arabic translations
 * depending on context (finance, HR, marketing, etc.)
 */

import { logger } from '../../utils/logger.js';

/** Translation context for disambiguation */
export type TranslationContext =
  | 'general'
  | 'finance'
  | 'hr'
  | 'marketing'
  | 'sales'
  | 'operations'
  | 'it'
  | 'governance'
  | 'logistics'
  | 'healthcare';

/** A terminology entry with context-aware translations */
export interface TermEntry {
  english: string;
  defaultArabic: string;
  contextual: Partial<Record<TranslationContext, string>>;
  abbreviation?: string;
  abbreviationAr?: string;
}

/** Translation result */
export interface TranslationResult {
  english: string;
  arabic: string;
  context: TranslationContext;
  confidence: number;
  alternatives: Array<{ context: TranslationContext; arabic: string }>;
}

/**
 * The core terminology registry - 200+ BI terms.
 */
const TERMINOLOGY: TermEntry[] = [
  // === Core KPIs & Metrics ===
  { english: 'KPI', defaultArabic: 'مؤشر أداء رئيسي', contextual: {}, abbreviation: 'KPI', abbreviationAr: 'م.أ.ر' },
  { english: 'Key Performance Indicator', defaultArabic: 'مؤشر أداء رئيسي', contextual: {} },
  { english: 'Revenue', defaultArabic: 'الإيرادات', contextual: { finance: 'الإيرادات', sales: 'المبيعات', marketing: 'العائدات' } },
  { english: 'Profit', defaultArabic: 'الربح', contextual: { finance: 'صافي الربح' } },
  { english: 'Gross Profit', defaultArabic: 'الربح الإجمالي', contextual: {} },
  { english: 'Net Profit', defaultArabic: 'صافي الربح', contextual: {} },
  { english: 'Margin', defaultArabic: 'الهامش', contextual: { finance: 'هامش الربح', sales: 'هامش المبيعات' } },
  { english: 'Growth', defaultArabic: 'النمو', contextual: { finance: 'معدل النمو', hr: 'النمو الوظيفي' } },
  { english: 'Growth Rate', defaultArabic: 'معدل النمو', contextual: {} },
  { english: 'Target', defaultArabic: 'المستهدف', contextual: { sales: 'الهدف البيعي', marketing: 'الجمهور المستهدف' } },
  { english: 'Actual', defaultArabic: 'الفعلي', contextual: {} },
  { english: 'Variance', defaultArabic: 'الانحراف', contextual: { finance: 'الفرق', operations: 'التباين' } },
  { english: 'Budget', defaultArabic: 'الميزانية', contextual: {} },
  { english: 'Forecast', defaultArabic: 'التوقعات', contextual: { finance: 'التنبؤ المالي', sales: 'توقعات المبيعات' } },
  { english: 'Benchmark', defaultArabic: 'المعيار المرجعي', contextual: {} },
  { english: 'Baseline', defaultArabic: 'خط الأساس', contextual: {} },
  { english: 'Threshold', defaultArabic: 'الحد الأدنى', contextual: { it: 'العتبة' } },

  // === Financial Terms ===
  { english: 'ROI', defaultArabic: 'العائد على الاستثمار', contextual: {}, abbreviation: 'ROI', abbreviationAr: 'ع.ا' },
  { english: 'Return on Investment', defaultArabic: 'العائد على الاستثمار', contextual: {} },
  { english: 'EBITDA', defaultArabic: 'الأرباح قبل الفوائد والضرائب والإهلاك والاستهلاك', contextual: {} },
  { english: 'Cash Flow', defaultArabic: 'التدفق النقدي', contextual: {} },
  { english: 'Operating Expenses', defaultArabic: 'المصاريف التشغيلية', contextual: {} },
  { english: 'Capital Expenditure', defaultArabic: 'النفقات الرأسمالية', contextual: {} },
  { english: 'Cost of Goods Sold', defaultArabic: 'تكلفة البضاعة المباعة', contextual: {} },
  { english: 'Accounts Receivable', defaultArabic: 'الذمم المدينة', contextual: {} },
  { english: 'Accounts Payable', defaultArabic: 'الذمم الدائنة', contextual: {} },
  { english: 'Balance Sheet', defaultArabic: 'الميزانية العمومية', contextual: {} },
  { english: 'Income Statement', defaultArabic: 'قائمة الدخل', contextual: {} },
  { english: 'Depreciation', defaultArabic: 'الإهلاك', contextual: {} },
  { english: 'Amortization', defaultArabic: 'الاستهلاك', contextual: {} },
  { english: 'Liquidity', defaultArabic: 'السيولة', contextual: {} },
  { english: 'Asset', defaultArabic: 'الأصول', contextual: { it: 'المورد', hr: 'الموظف القيم' } },
  { english: 'Liability', defaultArabic: 'الالتزامات', contextual: {} },
  { english: 'Equity', defaultArabic: 'حقوق الملكية', contextual: { hr: 'العدالة' } },
  { english: 'Dividend', defaultArabic: 'الأرباح الموزعة', contextual: {} },
  { english: 'Fiscal Year', defaultArabic: 'السنة المالية', contextual: {} },
  { english: 'Quarter', defaultArabic: 'الربع', contextual: {} },

  // === Sales & Marketing ===
  { english: 'Conversion Rate', defaultArabic: 'معدل التحويل', contextual: {} },
  { english: 'Churn Rate', defaultArabic: 'معدل فقدان العملاء', contextual: {} },
  { english: 'Customer Acquisition Cost', defaultArabic: 'تكلفة اكتساب العميل', contextual: {} },
  { english: 'Customer Lifetime Value', defaultArabic: 'القيمة الدائمة للعميل', contextual: {} },
  { english: 'Market Share', defaultArabic: 'الحصة السوقية', contextual: {} },
  { english: 'Lead', defaultArabic: 'عميل محتمل', contextual: { sales: 'فرصة بيعية' } },
  { english: 'Pipeline', defaultArabic: 'مسار المبيعات', contextual: { it: 'خط أنابيب', operations: 'خط الإنتاج' } },
  { english: 'Funnel', defaultArabic: 'قمع المبيعات', contextual: {} },
  { english: 'Engagement', defaultArabic: 'التفاعل', contextual: { hr: 'الارتباط الوظيفي' } },
  { english: 'Impressions', defaultArabic: 'مرات الظهور', contextual: {} },
  { english: 'Click-Through Rate', defaultArabic: 'معدل النقر', contextual: {} },
  { english: 'Bounce Rate', defaultArabic: 'معدل الارتداد', contextual: {} },
  { english: 'Retention Rate', defaultArabic: 'معدل الاحتفاظ', contextual: { hr: 'معدل استبقاء الموظفين' } },
  { english: 'Net Promoter Score', defaultArabic: 'مؤشر صافي الترويج', contextual: {} },
  { english: 'Campaign', defaultArabic: 'حملة', contextual: { marketing: 'حملة تسويقية' } },
  { english: 'Segment', defaultArabic: 'شريحة', contextual: { marketing: 'شريحة سوقية' } },
  { english: 'Channel', defaultArabic: 'قناة', contextual: { marketing: 'قناة تسويقية', sales: 'قناة بيعية' } },
  { english: 'Brand Awareness', defaultArabic: 'الوعي بالعلامة التجارية', contextual: {} },

  // === HR Terms ===
  { english: 'Headcount', defaultArabic: 'عدد الموظفين', contextual: {} },
  { english: 'Turnover', defaultArabic: 'معدل دوران الموظفين', contextual: { finance: 'حجم المبيعات' } },
  { english: 'Attrition', defaultArabic: 'الاستنزاف', contextual: {} },
  { english: 'Absenteeism', defaultArabic: 'التغيب', contextual: {} },
  { english: 'Overtime', defaultArabic: 'العمل الإضافي', contextual: {} },
  { english: 'Payroll', defaultArabic: 'الرواتب', contextual: {} },
  { english: 'Benefits', defaultArabic: 'المزايا', contextual: {} },
  { english: 'Performance Review', defaultArabic: 'تقييم الأداء', contextual: {} },
  { english: 'Training', defaultArabic: 'التدريب', contextual: {} },
  { english: 'Competency', defaultArabic: 'الكفاءة', contextual: {} },
  { english: 'Recruitment', defaultArabic: 'التوظيف', contextual: {} },
  { english: 'Onboarding', defaultArabic: 'التهيئة الوظيفية', contextual: {} },

  // === Operations ===
  { english: 'Throughput', defaultArabic: 'معدل الإنتاجية', contextual: { it: 'سعة النقل' } },
  { english: 'Utilization', defaultArabic: 'معدل الاستخدام', contextual: {} },
  { english: 'Efficiency', defaultArabic: 'الكفاءة', contextual: {} },
  { english: 'Downtime', defaultArabic: 'وقت التوقف', contextual: {} },
  { english: 'Uptime', defaultArabic: 'وقت التشغيل', contextual: {} },
  { english: 'Capacity', defaultArabic: 'السعة', contextual: {} },
  { english: 'Inventory', defaultArabic: 'المخزون', contextual: {} },
  { english: 'Supply Chain', defaultArabic: 'سلسلة الإمداد', contextual: {} },
  { english: 'Lead Time', defaultArabic: 'وقت التسليم', contextual: { logistics: 'المهلة الزمنية' } },
  { english: 'Cycle Time', defaultArabic: 'وقت الدورة', contextual: {} },
  { english: 'Quality', defaultArabic: 'الجودة', contextual: {} },
  { english: 'Defect Rate', defaultArabic: 'معدل العيوب', contextual: {} },
  { english: 'Yield', defaultArabic: 'العائد', contextual: { finance: 'العائد المالي', operations: 'معدل الإنتاج' } },
  { english: 'Waste', defaultArabic: 'الهدر', contextual: {} },
  { english: 'Backlog', defaultArabic: 'الأعمال المتراكمة', contextual: { it: 'قائمة المهام المعلقة' } },

  // === IT & Technology ===
  { english: 'SLA', defaultArabic: 'اتفاقية مستوى الخدمة', contextual: {}, abbreviation: 'SLA' },
  { english: 'Latency', defaultArabic: 'زمن الاستجابة', contextual: {} },
  { english: 'Bandwidth', defaultArabic: 'عرض النطاق', contextual: {} },
  { english: 'Availability', defaultArabic: 'التوفر', contextual: {} },
  { english: 'Incident', defaultArabic: 'حادثة', contextual: { governance: 'واقعة' } },
  { english: 'Response Time', defaultArabic: 'وقت الاستجابة', contextual: {} },
  { english: 'Resolution Time', defaultArabic: 'وقت الحل', contextual: {} },
  { english: 'Deployment', defaultArabic: 'النشر', contextual: {} },
  { english: 'Scalability', defaultArabic: 'قابلية التوسع', contextual: {} },
  { english: 'Integration', defaultArabic: 'التكامل', contextual: {} },

  // === Dashboard & Visualization ===
  { english: 'Dashboard', defaultArabic: 'لوحة المؤشرات', contextual: {} },
  { english: 'Widget', defaultArabic: 'عنصر واجهة', contextual: {} },
  { english: 'Chart', defaultArabic: 'رسم بياني', contextual: {} },
  { english: 'Bar Chart', defaultArabic: 'رسم بياني شريطي', contextual: {} },
  { english: 'Line Chart', defaultArabic: 'رسم بياني خطي', contextual: {} },
  { english: 'Pie Chart', defaultArabic: 'رسم بياني دائري', contextual: {} },
  { english: 'Scatter Plot', defaultArabic: 'رسم بياني نقطي', contextual: {} },
  { english: 'Heatmap', defaultArabic: 'خريطة حرارية', contextual: {} },
  { english: 'Treemap', defaultArabic: 'خريطة شجرية', contextual: {} },
  { english: 'Gauge', defaultArabic: 'مقياس', contextual: {} },
  { english: 'Axis', defaultArabic: 'محور', contextual: {} },
  { english: 'X-Axis', defaultArabic: 'المحور الأفقي', contextual: {} },
  { english: 'Y-Axis', defaultArabic: 'المحور الرأسي', contextual: {} },
  { english: 'Legend', defaultArabic: 'دليل الألوان', contextual: {} },
  { english: 'Tooltip', defaultArabic: 'تلميح', contextual: {} },
  { english: 'Gridline', defaultArabic: 'خط شبكي', contextual: {} },
  { english: 'Data Point', defaultArabic: 'نقطة بيانات', contextual: {} },
  { english: 'Series', defaultArabic: 'سلسلة بيانات', contextual: {} },
  { english: 'Trend', defaultArabic: 'الاتجاه', contextual: {} },
  { english: 'Trendline', defaultArabic: 'خط الاتجاه', contextual: {} },
  { english: 'Sparkline', defaultArabic: 'رسم مصغر', contextual: {} },

  // === Data & Analytics ===
  { english: 'Data Source', defaultArabic: 'مصدر البيانات', contextual: {} },
  { english: 'Dataset', defaultArabic: 'مجموعة بيانات', contextual: {} },
  { english: 'Dimension', defaultArabic: 'البُعد', contextual: {} },
  { english: 'Measure', defaultArabic: 'المقياس', contextual: {} },
  { english: 'Aggregation', defaultArabic: 'التجميع', contextual: {} },
  { english: 'Filter', defaultArabic: 'مرشح', contextual: {} },
  { english: 'Sort', defaultArabic: 'ترتيب', contextual: {} },
  { english: 'Group By', defaultArabic: 'تجميع حسب', contextual: {} },
  { english: 'Drill Down', defaultArabic: 'التنقيب التفصيلي', contextual: {} },
  { english: 'Drill Up', defaultArabic: 'التنقيب التجميعي', contextual: {} },
  { english: 'Slice', defaultArabic: 'شريحة', contextual: {} },
  { english: 'Pivot', defaultArabic: 'جدول محوري', contextual: {} },
  { english: 'Cross-Tab', defaultArabic: 'جدول تقاطعي', contextual: {} },
  { english: 'Query', defaultArabic: 'استعلام', contextual: {} },
  { english: 'Report', defaultArabic: 'تقرير', contextual: {} },
  { english: 'Insight', defaultArabic: 'رؤية تحليلية', contextual: {} },
  { english: 'Analytics', defaultArabic: 'التحليلات', contextual: {} },
  { english: 'Predictive Analytics', defaultArabic: 'التحليلات التنبؤية', contextual: {} },
  { english: 'Descriptive Analytics', defaultArabic: 'التحليلات الوصفية', contextual: {} },
  { english: 'Prescriptive Analytics', defaultArabic: 'التحليلات التوجيهية', contextual: {} },

  // === Time Periods ===
  { english: 'Year-to-Date', defaultArabic: 'منذ بداية السنة', contextual: {}, abbreviation: 'YTD' },
  { english: 'Month-to-Date', defaultArabic: 'منذ بداية الشهر', contextual: {}, abbreviation: 'MTD' },
  { english: 'Quarter-to-Date', defaultArabic: 'منذ بداية الربع', contextual: {}, abbreviation: 'QTD' },
  { english: 'Year-over-Year', defaultArabic: 'مقارنة سنوية', contextual: {}, abbreviation: 'YoY' },
  { english: 'Month-over-Month', defaultArabic: 'مقارنة شهرية', contextual: {}, abbreviation: 'MoM' },
  { english: 'Week-over-Week', defaultArabic: 'مقارنة أسبوعية', contextual: {}, abbreviation: 'WoW' },
  { english: 'Rolling Average', defaultArabic: 'المتوسط المتحرك', contextual: {} },
  { english: 'Moving Average', defaultArabic: 'المتوسط المتحرك', contextual: {} },
  { english: 'Cumulative', defaultArabic: 'تراكمي', contextual: {} },
  { english: 'Period', defaultArabic: 'الفترة', contextual: {} },

  // === Governance & Compliance ===
  { english: 'Compliance', defaultArabic: 'الامتثال', contextual: {} },
  { english: 'Audit', defaultArabic: 'التدقيق', contextual: {} },
  { english: 'Risk', defaultArabic: 'المخاطر', contextual: {} },
  { english: 'Risk Score', defaultArabic: 'درجة المخاطرة', contextual: {} },
  { english: 'Policy', defaultArabic: 'السياسة', contextual: {} },
  { english: 'Regulation', defaultArabic: 'اللائحة التنظيمية', contextual: {} },
  { english: 'Control', defaultArabic: 'الرقابة', contextual: {} },
  { english: 'Permission', defaultArabic: 'الصلاحية', contextual: {} },
  { english: 'Role', defaultArabic: 'الدور', contextual: { hr: 'المنصب' } },
  { english: 'Access', defaultArabic: 'الوصول', contextual: {} },
  { english: 'Authorization', defaultArabic: 'التفويض', contextual: {} },
  { english: 'Authentication', defaultArabic: 'المصادقة', contextual: {} },

  // === Statistical Terms ===
  { english: 'Average', defaultArabic: 'المتوسط', contextual: {} },
  { english: 'Mean', defaultArabic: 'الوسط الحسابي', contextual: {} },
  { english: 'Median', defaultArabic: 'الوسيط', contextual: {} },
  { english: 'Mode', defaultArabic: 'المنوال', contextual: {} },
  { english: 'Standard Deviation', defaultArabic: 'الانحراف المعياري', contextual: {} },
  { english: 'Percentile', defaultArabic: 'الشريحة المئوية', contextual: {} },
  { english: 'Correlation', defaultArabic: 'الارتباط', contextual: {} },
  { english: 'Regression', defaultArabic: 'الانحدار', contextual: {} },
  { english: 'Outlier', defaultArabic: 'القيمة الشاذة', contextual: {} },
  { english: 'Distribution', defaultArabic: 'التوزيع', contextual: {} },
  { english: 'Histogram', defaultArabic: 'المدرج التكراري', contextual: {} },
  { english: 'Frequency', defaultArabic: 'التكرار', contextual: {} },
  { english: 'Probability', defaultArabic: 'الاحتمال', contextual: {} },
  { english: 'Confidence Interval', defaultArabic: 'فترة الثقة', contextual: {} },
  { english: 'Sample Size', defaultArabic: 'حجم العينة', contextual: {} },
  { english: 'Population', defaultArabic: 'المجتمع الإحصائي', contextual: { hr: 'عدد السكان' } },

  // === Logistics & Supply Chain ===
  { english: 'Shipment', defaultArabic: 'الشحنة', contextual: {} },
  { english: 'Delivery', defaultArabic: 'التوصيل', contextual: {} },
  { english: 'Fulfillment', defaultArabic: 'التنفيذ', contextual: { logistics: 'تنفيذ الطلبات' } },
  { english: 'Order', defaultArabic: 'الطلب', contextual: {} },
  { english: 'Procurement', defaultArabic: 'المشتريات', contextual: {} },
  { english: 'Vendor', defaultArabic: 'المورد', contextual: {} },
  { english: 'Warehouse', defaultArabic: 'المستودع', contextual: {} },
  { english: 'Stock', defaultArabic: 'المخزون', contextual: { finance: 'السهم' } },

  // === General Business ===
  { english: 'Stakeholder', defaultArabic: 'أصحاب المصلحة', contextual: {} },
  { english: 'Objective', defaultArabic: 'الهدف', contextual: {} },
  { english: 'Strategy', defaultArabic: 'الاستراتيجية', contextual: {} },
  { english: 'Initiative', defaultArabic: 'المبادرة', contextual: {} },
  { english: 'Project', defaultArabic: 'المشروع', contextual: {} },
  { english: 'Milestone', defaultArabic: 'معلم رئيسي', contextual: {} },
  { english: 'Deadline', defaultArabic: 'الموعد النهائي', contextual: {} },
  { english: 'Status', defaultArabic: 'الحالة', contextual: {} },
  { english: 'Priority', defaultArabic: 'الأولوية', contextual: {} },
  { english: 'Category', defaultArabic: 'الفئة', contextual: {} },
  { english: 'Tag', defaultArabic: 'الوسم', contextual: {} },
  { english: 'Label', defaultArabic: 'التسمية', contextual: {} },
  { english: 'Total', defaultArabic: 'الإجمالي', contextual: {} },
  { english: 'Subtotal', defaultArabic: 'المجموع الفرعي', contextual: {} },
  { english: 'Count', defaultArabic: 'العدد', contextual: {} },
  { english: 'Sum', defaultArabic: 'المجموع', contextual: {} },
  { english: 'Minimum', defaultArabic: 'الحد الأدنى', contextual: {} },
  { english: 'Maximum', defaultArabic: 'الحد الأقصى', contextual: {} },
  { english: 'Range', defaultArabic: 'المدى', contextual: {} },
  { english: 'Ratio', defaultArabic: 'النسبة', contextual: {} },
  { english: 'Rate', defaultArabic: 'المعدل', contextual: {} },
  { english: 'Index', defaultArabic: 'المؤشر', contextual: {} },
  { english: 'Score', defaultArabic: 'الدرجة', contextual: {} },
  { english: 'Rank', defaultArabic: 'الترتيب', contextual: {} },
  { english: 'Comparison', defaultArabic: 'المقارنة', contextual: {} },
  { english: 'Summary', defaultArabic: 'الملخص', contextual: {} },
  { english: 'Detail', defaultArabic: 'التفاصيل', contextual: {} },
  { english: 'Overview', defaultArabic: 'نظرة عامة', contextual: {} },
  { english: 'Breakdown', defaultArabic: 'التفصيل', contextual: {} },

  // === Healthcare (bonus context) ===
  { english: 'Patient', defaultArabic: 'المريض', contextual: {} },
  { english: 'Bed Occupancy', defaultArabic: 'نسبة إشغال الأسرة', contextual: {} },
  { english: 'Wait Time', defaultArabic: 'وقت الانتظار', contextual: {} },
  { english: 'Readmission Rate', defaultArabic: 'معدل إعادة الدخول', contextual: {} },
  { english: 'Mortality Rate', defaultArabic: 'معدل الوفيات', contextual: {} },
];

/** Indexed maps for fast lookup */
const termByEnglish = new Map<string, TermEntry>();
const termByLowerCase = new Map<string, TermEntry>();

for (const entry of TERMINOLOGY) {
  termByEnglish.set(entry.english, entry);
  termByLowerCase.set(entry.english.toLowerCase(), entry);
  if (entry.abbreviation) {
    termByEnglish.set(entry.abbreviation, entry);
    termByLowerCase.set(entry.abbreviation.toLowerCase(), entry);
  }
}

/**
 * Translates a BI term to Arabic with optional context awareness.
 * Returns the best matching translation with confidence score
 * and any alternative context-specific translations.
 */
export function translate(term: string, context?: TranslationContext): TranslationResult {
  const entry = termByEnglish.get(term) ?? termByLowerCase.get(term.toLowerCase());

  if (!entry) {
    logger.debug('Term not found in registry, returning as-is', { term });
    return {
      english: term,
      arabic: term,
      context: context ?? 'general',
      confidence: 0,
      alternatives: [],
    };
  }

  const effectiveContext = context ?? 'general';
  const contextualTranslation = effectiveContext !== 'general'
    ? entry.contextual[effectiveContext]
    : undefined;

  const arabic = contextualTranslation ?? entry.defaultArabic;
  const confidence = contextualTranslation ? 1.0 : (context && context !== 'general' ? 0.85 : 0.95);

  const alternatives: Array<{ context: TranslationContext; arabic: string }> = [];
  for (const [ctx, translation] of Object.entries(entry.contextual)) {
    if (ctx !== effectiveContext && translation !== arabic) {
      alternatives.push({ context: ctx as TranslationContext, arabic: translation });
    }
  }
  if (contextualTranslation && entry.defaultArabic !== contextualTranslation) {
    alternatives.push({ context: 'general', arabic: entry.defaultArabic });
  }

  return {
    english: entry.english,
    arabic,
    context: effectiveContext,
    confidence,
    alternatives,
  };
}

/**
 * Returns the total number of terms in the registry.
 */
export function getRegistrySize(): number {
  return TERMINOLOGY.length;
}

/**
 * Searches for terms matching a partial English string.
 */
export function searchTerms(query: string, maxResults: number = 10): TranslationResult[] {
  const lowerQuery = query.toLowerCase();
  const matches: TermEntry[] = [];

  for (const entry of TERMINOLOGY) {
    if (entry.english.toLowerCase().includes(lowerQuery)) {
      matches.push(entry);
      if (matches.length >= maxResults) break;
    }
  }

  return matches.map(entry => ({
    english: entry.english,
    arabic: entry.defaultArabic,
    context: 'general' as TranslationContext,
    confidence: 0.95,
    alternatives: Object.entries(entry.contextual).map(([ctx, ar]) => ({
      context: ctx as TranslationContext,
      arabic: ar,
    })),
  }));
}

/**
 * Batch translates multiple terms at once.
 */
export function batchTranslate(
  terms: string[],
  context?: TranslationContext
): TranslationResult[] {
  logger.info('Batch translating BI terms', { count: terms.length, context });
  return terms.map(term => translate(term, context));
}
