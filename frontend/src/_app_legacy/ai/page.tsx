"use client";

import {
  Brain,
  MessageSquare,
  TrendingUp,
  Search,
  AlertTriangle,
  Sparkles,
  FileText,
  Cpu,
  Network,
} from "lucide-react";

const modules = [
  {
    title: "NLP Engine",
    titleAr: "محرك معالجة اللغة الطبيعية",
    description: "Natural language processing with Arabic and English support for text analysis, entity extraction, and sentiment analysis.",
    descriptionAr: "معالجة اللغة الطبيعية مع دعم العربية والإنجليزية لتحليل النصوص واستخراج الكيانات وتحليل المشاعر.",
    icon: MessageSquare,
    status: "planned",
  },
  {
    title: "Predictive Analytics",
    titleAr: "التحليلات التنبؤية",
    description: "Machine learning models for forecasting, trend analysis, regression, classification, and time series prediction.",
    descriptionAr: "نماذج تعلم الآلة للتنبؤ وتحليل الاتجاهات والانحدار والتصنيف والتنبؤ بالسلاسل الزمنية.",
    icon: TrendingUp,
    status: "planned",
  },
  {
    title: "Anomaly Detection",
    titleAr: "كشف الحالات الشاذة",
    description: "Statistical and ML-based anomaly detection with configurable thresholds, alerting, and root cause analysis.",
    descriptionAr: "كشف الحالات الشاذة الإحصائي والقائم على تعلم الآلة مع عتبات قابلة للتكوين والتنبيه وتحليل السبب الجذري.",
    icon: AlertTriangle,
    status: "planned",
  },
  {
    title: "Smart Search",
    titleAr: "البحث الذكي",
    description: "Semantic search across all platform data with fuzzy matching, faceted filtering, and relevance scoring.",
    descriptionAr: "بحث دلالي عبر جميع بيانات المنصة مع المطابقة الضبابية والتصفية متعددة الأوجه وتسجيل الصلة.",
    icon: Search,
    status: "planned",
  },
  {
    title: "Data Summarization",
    titleAr: "تلخيص البيانات",
    description: "AI-powered data summarization with executive summaries, key insights extraction, and natural language generation.",
    descriptionAr: "تلخيص البيانات المدعوم بالذكاء الاصطناعي مع الملخصات التنفيذية واستخراج الرؤى الرئيسية وتوليد اللغة الطبيعية.",
    icon: FileText,
    status: "planned",
  },
  {
    title: "Auto-Classification",
    titleAr: "التصنيف التلقائي",
    description: "Automatic document and data classification with trainable models, category hierarchies, and confidence scoring.",
    descriptionAr: "تصنيف المستندات والبيانات التلقائي مع نماذج قابلة للتدريب وتسلسلات هرمية للفئات وتسجيل الثقة.",
    icon: Sparkles,
    status: "planned",
  },
  {
    title: "Model Management",
    titleAr: "إدارة النماذج",
    description: "ML model lifecycle management with training pipelines, versioning, A/B testing, and performance monitoring.",
    descriptionAr: "إدارة دورة حياة نماذج تعلم الآلة مع خطوط أنابيب التدريب والإصدارات واختبار A/B ومراقبة الأداء.",
    icon: Cpu,
    status: "planned",
  },
  {
    title: "Integration Hub",
    titleAr: "مركز التكامل",
    description: "Connect to external AI services including OpenAI, Azure AI, AWS SageMaker, and custom model endpoints.",
    descriptionAr: "الاتصال بخدمات الذكاء الاصطناعي الخارجية بما في ذلك OpenAI وAzure AI وAWS SageMaker ونقاط نهاية النماذج المخصصة.",
    icon: Network,
    status: "planned",
  },
];

export default function AIEnginePage() {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="page-header">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-violet-50">
            <Brain className="h-7 w-7 text-violet-600" />
          </div>
          <div>
            <h1 className="page-title">محرك الذكاء الاصطناعي</h1>
            <p className="text-lg font-medium text-violet-600">AI Engine</p>
          </div>
        </div>
        <p className="page-description mt-4">
          تحليلات مدعومة بالذكاء الاصطناعي مع معالجة اللغة الطبيعية والنمذجة التنبؤية وكشف الحالات الشاذة
          والتلخيص الذكي للبيانات. يدعم التكامل مع خدمات الذكاء الاصطناعي الخارجية وإدارة النماذج.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="section-card text-center">
          <p className="text-3xl font-bold text-violet-600">0</p>
          <p className="text-sm text-gray-500">نماذج نشطة</p>
        </div>
        <div className="section-card text-center">
          <p className="text-3xl font-bold text-violet-600">0</p>
          <p className="text-sm text-gray-500">تنبؤات اليوم</p>
        </div>
        <div className="section-card text-center">
          <p className="text-3xl font-bold text-violet-600">0</p>
          <p className="text-sm text-gray-500">حالات شاذة مكتشفة</p>
        </div>
        <div className="section-card text-center">
          <p className="text-3xl font-bold text-violet-600">--</p>
          <p className="text-sm text-gray-500">دقة النموذج</p>
        </div>
      </div>

      <h2 className="section-title mb-6 text-2xl">الوحدات - Modules</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => {
          const Icon = mod.icon;
          return (
            <div key={mod.title} className="section-card">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50">
                  <Icon className="h-5 w-5 text-violet-600" />
                </div>
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                  {mod.status === "planned" ? "مخطط" : "نشط"}
                </span>
              </div>
              <h3 className="mb-1 font-semibold text-gray-900">{mod.titleAr}</h3>
              <p className="mb-2 text-sm font-medium text-gray-400">{mod.title}</p>
              <p className="text-sm leading-relaxed text-gray-600">{mod.descriptionAr}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
