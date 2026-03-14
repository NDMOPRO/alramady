// ===== RASID LOGOS =====
// Light mode: Rased5 (gold outline) for header, Rased4 (dark) for alt
// Dark mode: Rased7 (cream) for header, Rased2b (royal blue+gold) for alt
export const LOGOS = {
  // Light mode
  light_header: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663296955420/b5T5Z8kS7DX4E4HECSfKdD/Rased(5)_transparent_227716bf.webp',
  light_alt: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663296955420/b5T5Z8kS7DX4E4HECSfKdD/Rased(4)_transparent_c226d6ad.webp',
  // Dark mode
  dark_header: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663296955420/b5T5Z8kS7DX4E4HECSfKdD/Rased(7)_transparent_9c9ab195.webp',
  dark_alt: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663296955420/b5T5Z8kS7DX4E4HECSfKdD/Rased(2)_transparent(1)_4a2c1428.webp',
  // Favicon / brand mark
  rased6: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663296955420/b5T5Z8kS7DX4E4HECSfKdD/Rased(6)_transparent_f3b51f08.webp',
} as const;

// ===== RASID CHARACTERS =====
export const CHARACTERS = {
  char1_waving: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663296955420/b5T5Z8kS7DX4E4HECSfKdD/Character_1_waving_transparent_8fbcbdd8.webp',
  char2_shmagh: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663296955420/b5T5Z8kS7DX4E4HECSfKdD/Character_2_shmagh_transparent_5d7ab2c3.webp',
  char3_dark: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663296955420/b5T5Z8kS7DX4E4HECSfKdD/Character_3_dark_bg_transparent_c2183ec6.webp',
  char3b_dark: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663296955420/b5T5Z8kS7DX4E4HECSfKdD/Character_3_dark_bg_transparent(1)_f8e43368.webp',
  char4_sunglasses: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663296955420/b5T5Z8kS7DX4E4HECSfKdD/Character_4_sunglasses_transparent_59c8b261.webp',
  char5_arms_crossed: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663296955420/b5T5Z8kS7DX4E4HECSfKdD/Character_5_arms_crossed_shmagh_transparent_587073f4.webp',
  char6_standing: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663296955420/b5T5Z8kS7DX4E4HECSfKdD/Character_6_standing_shmagh_transparent_322984d4.webp',
} as const;

// ===== STUDIO TOOLS =====
export const STUDIO_TOOLS = [
  { id: 'dashboard', label: 'لوحة مؤشرات', icon: 'dashboard', desc: 'لوحة مؤشرات تفاعلية', color: '#1e40af' },
  { id: 'report', label: 'تقرير', icon: 'description', desc: 'تقرير احترافي', color: '#059669' },
  { id: 'presentation', label: 'عرض', icon: 'slideshow', desc: 'عرض شرائح', color: '#d97706' },
  { id: 'matching', label: 'مطابقة', icon: 'compare', desc: 'مطابقة بصرية', color: '#7c3aed' },
  { id: 'arabization', label: 'تعريب', icon: 'g_translate', desc: 'تعريب المحتوى', color: '#0891b2' },
  { id: 'extraction', label: 'تفريغ', icon: 'text_snippet', desc: 'استخراج نصوص', color: '#dc2626' },
  { id: 'translation', label: 'ترجمة', icon: 'translate', desc: 'ترجمة متعددة', color: '#4f46e5' },
] as const;

// ===== DATA PANEL =====
export const DATA_TABS = [
  { id: 'all', label: 'الكل', icon: 'apps' },
  { id: 'files', label: 'الملفات', icon: 'description' },
  { id: 'tables', label: 'الجداول', icon: 'table_chart' },
  { id: 'groups', label: 'المجموعات', icon: 'folder' },
  { id: 'flows', label: 'التدفقات', icon: 'account_tree' },
] as const;

export const DATA_STATUSES = {
  ready: { label: 'جاهز', color: '#059669', bg: '#ecfdf5', darkBg: 'rgba(5,150,105,0.15)' },
  processing: { label: 'قيد المعالجة', color: '#d97706', bg: '#fffbeb', darkBg: 'rgba(217,119,6,0.15)' },
  review: { label: 'يحتاج مراجعة', color: '#2563eb', bg: '#eff6ff', darkBg: 'rgba(37,99,235,0.15)' },
  failed: { label: 'فشل', color: '#dc2626', bg: '#fef2f2', darkBg: 'rgba(220,38,38,0.15)' },
  merged: { label: 'مدمج', color: '#7c3aed', bg: '#f5f3ff', darkBg: 'rgba(124,58,237,0.15)' },
} as const;

// ===== QUICK ACTIONS =====
export const QUICK_ACTIONS = [
  { id: 'analyze', label: 'تحليل البيانات', icon: 'analytics', desc: 'تحليل شامل للبيانات المرفوعة' },
  { id: 'dashboard', label: 'إنشاء لوحة مؤشرات', icon: 'dashboard', desc: 'لوحة مؤشرات تفاعلية' },
  { id: 'report', label: 'إنشاء تقرير', icon: 'description', desc: 'تقرير احترافي جاهز' },
  { id: 'compare', label: 'مقارنة جهات', icon: 'compare', desc: 'مقارنة بين جهتين أو أكثر' },
  { id: 'clean', label: 'تنظيف البيانات', icon: 'cleaning_services', desc: 'تنظيف وتوحيد البيانات' },
  { id: 'merge', label: 'دمج الجداول', icon: 'merge_type', desc: 'دمج جداول متعددة' },
] as const;

// ===== CHAT OPTIONS =====
export const CHAT_OPTIONS: Array<{ id: string; label: string; icon: string; danger?: boolean }> = [
  { id: 'save', label: 'حفظ المحادثة', icon: 'save' },
  { id: 'rename', label: 'تغيير العنوان', icon: 'edit' },
  { id: 'favorite', label: 'تعيين كمفضلة', icon: 'star' },
  { id: 'export', label: 'تصدير المحادثة', icon: 'download' },
  { id: 'clear', label: 'مسح المحادثة', icon: 'delete', danger: true },
];

// ===== WORKSPACE VIEWS =====
export const WORKSPACE_VIEWS = [
  { id: 'chat', label: 'المحادثة', icon: 'chat_bubble_outline' },
  { id: 'data', label: 'بياناتي', icon: 'table_chart' },
  { id: 'presentations', label: 'عروضي', icon: 'slideshow' },
  { id: 'reports', label: 'تقاريري', icon: 'article' },
  { id: 'matching', label: 'مطابقة', icon: 'compare' },
  { id: 'library', label: 'مكتبتي', icon: 'folder_open' },
] as const;

// ===== SETUP PANEL COMMON OPTIONS =====
export const SETUP_COMMON = {
  advancedOptions: 'خيارات متقدمة',
  contentAdherence: 'الالتزام بالمحتوى',
  officialIdentity: 'الهوية الرسمية',
  contentSource: 'مصدر المحتوى',
  executionScope: 'نطاق التنفيذ',
} as const;

// ===== ANALYSIS TYPES =====
export const ANALYSIS_TYPES = [
  { id: 'compliance', label: 'تحليل الامتثال', icon: 'verified', desc: 'تحليل مستوى امتثال الجهات' },
  { id: 'classification', label: 'تحليل التصنيف', icon: 'category', desc: 'تحليل تصنيف البيانات' },
  { id: 'personal', label: 'البيانات الشخصية', icon: 'person_search', desc: 'تحليل البيانات الشخصية' },
  { id: 'quality', label: 'جودة البيانات', icon: 'fact_check', desc: 'تقييم جودة البيانات' },
  { id: 'gaps', label: 'تحليل الفجوات', icon: 'troubleshoot', desc: 'تحديد الفجوات والنواقص' },
  { id: 'comparison', label: 'مقارنة', icon: 'compare_arrows', desc: 'مقارنة بين فترات أو جهات' },
] as const;

// ===== REPORT SECTIONS =====
export const REPORT_SECTIONS = [
  { id: 'cover', label: 'الغلاف', icon: 'image' },
  { id: 'summary', label: 'الملخص التنفيذي', icon: 'summarize' },
  { id: 'methodology', label: 'المنهجية', icon: 'science' },
  { id: 'results', label: 'النتائج', icon: 'assessment' },
  { id: 'tables', label: 'الجداول', icon: 'table_chart' },
  { id: 'charts', label: 'الرسوم البيانية', icon: 'bar_chart' },
  { id: 'recommendations', label: 'التوصيات', icon: 'lightbulb' },
] as const;

// ===== OUTPUT ACTIONS =====
export const REPORT_ACTIONS = [
  { id: 'save', label: 'حفظ', icon: 'save' },
  { id: 'approve', label: 'اعتماد', icon: 'check_circle' },
  { id: 'export', label: 'تصدير', icon: 'download' },
  { id: 'share', label: 'مشاركة', icon: 'share' },
  { id: 'review', label: 'إرسال للمراجعة', icon: 'send' },
] as const;

export const PRESENTATION_ACTIONS = [
  { id: 'save', label: 'حفظ', icon: 'save' },
  { id: 'export', label: 'تصدير', icon: 'download' },
  { id: 'present', label: 'عرض', icon: 'play_arrow' },
  { id: 'share', label: 'مشاركة', icon: 'share' },
  { id: 'review', label: 'إرسال للمراجعة', icon: 'send' },
] as const;

export const DASHBOARD_ACTIONS = [
  { id: 'save', label: 'حفظ', icon: 'save' },
  { id: 'publish', label: 'نشر', icon: 'publish' },
  { id: 'share', label: 'مشاركة', icon: 'share' },
  { id: 'export', label: 'تصدير', icon: 'download' },
  { id: 'analyze', label: 'تحليل مباشر', icon: 'analytics' },
] as const;

// ===== DATA ITEM CONTEXT MENU =====
export const DATA_ITEM_MENU: Array<{ id: string; label: string; icon: string; danger?: boolean }> = [
  { id: 'rename', label: 'إعادة تسمية', icon: 'edit' },
  { id: 'sort', label: 'ترتيب', icon: 'sort' },
  { id: 'favorite', label: 'إضافة للمفضلة', icon: 'star' },
  { id: 'pin', label: 'تثبيت', icon: 'push_pin' },
  { id: 'workspace', label: 'عرض في مساحة العمل', icon: 'open_in_new' },
  { id: 'hide', label: 'إخفاء', icon: 'visibility_off' },
  { id: 'delete', label: 'حذف', icon: 'delete', danger: true },
];
