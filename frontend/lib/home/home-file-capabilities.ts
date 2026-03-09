export type HomeFileKind =
  | "dataset"
  | "markdown"
  | "text"
  | "html"
  | "pdf"
  | "word"
  | "excel"
  | "image"
  | "json"
  | "unsupported";

export type HomeBundleKind =
  | "single-file"
  | "image-compare"
  | "multi-image"
  | "unsupported";

export type HomeActionId =
  | "import-dataset"
  | "analyze-dataset"
  | "build-report"
  | "generate-data-presentation"
  | "generate-file-presentation"
  | "generate-ai-presentation"
  | "extract-exact"
  | "extract-steps"
  | "translate-arabic"
  | "apply-rtl"
  | "convert-markdown-html"
  | "convert-pdf-word"
  | "convert-word-pdf"
  | "convert-excel-pdf"
  | "convert-csv-excel"
  | "convert-excel-csv"
  | "analyze-visual"
  | "reconstruct-dashboard"
  | "compare-visuals";

export interface DetectedHomeFile {
  file: File;
  extension: string;
  mimeType: string;
  sizeLabel: string;
  kind: HomeFileKind;
}

export interface HomeCapabilityAction {
  id: HomeActionId;
  title: string;
  description: string;
  outputLabel: string;
  serviceLabel: string;
  brainLabel: string;
}

export interface HomeFileBundle {
  kind: HomeBundleKind;
  files: DetectedHomeFile[];
  title: string;
  summary: string;
  actions: HomeCapabilityAction[];
  brainSteps: string[];
  orchestrationNote: string;
}

const DATASET_EXTENSIONS = new Set(["csv", "xls", "xlsx"]);
const TEXT_EXTENSIONS = new Set(["txt", "text"]);
const MARKDOWN_EXTENSIONS = new Set(["md", "markdown"]);
const HTML_EXTENSIONS = new Set(["html", "htm"]);
const WORD_EXTENSIONS = new Set(["doc", "docx"]);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "bmp", "gif", "tiff"]);

const ACTIONS: Record<HomeActionId, HomeCapabilityAction> = {
  "import-dataset": {
    id: "import-dataset",
    title: "هل تريد إضافته إلى البيانات؟",
    description: "يتم رفع الملف إلى خدمة البيانات وإنشاء مجموعة بيانات حقيقية قابلة للاستخدام.",
    outputLabel: "مجموعة بيانات",
    serviceLabel: "خدمة البيانات",
    brainLabel: "استيعاب وحفظ",
  },
  "analyze-dataset": {
    id: "analyze-dataset",
    title: "هل تريد تحليلًا فوريًا؟",
    description: "يتم استيراد الملف ثم تشغيل خدمة التحليل لإخراج مؤشرات ورسوم وتوصيات فعلية.",
    outputLabel: "تحليل",
    serviceLabel: "خدمة التحليل",
    brainLabel: "تحليل فوري",
  },
  "build-report": {
    id: "build-report",
    title: "هل تريد تقريرًا؟",
    description: "يتم استيراد الملف ثم إنشاء تقرير فعلي وبناؤه وتصديره عبر خدمة التقارير.",
    outputLabel: "تقرير PDF",
    serviceLabel: "خدمة التقارير",
    brainLabel: "توليد تقرير",
  },
  "generate-data-presentation": {
    id: "generate-data-presentation",
    title: "هل تريد عرض باوربوينت؟",
    description: "يتم استيراد الملف ثم إنشاء عرض تقديمي من مجموعة بيانات حقيقية عبر خدمة العروض.",
    outputLabel: "عرض تقديمي",
    serviceLabel: "خدمة العروض",
    brainLabel: "عرض من البيانات",
  },
  "generate-file-presentation": {
    id: "generate-file-presentation",
    title: "هل تريد عرضًا من الملف؟",
    description: "يتم إرسال الملف مباشرة إلى خدمة العروض لمعالجته وإنشاء عرض فعلي من محتواه.",
    outputLabel: "عرض تقديمي",
    serviceLabel: "خدمة العروض",
    brainLabel: "عرض من الملف",
  },
  "generate-ai-presentation": {
    id: "generate-ai-presentation",
    title: "هل تريد عرضًا ذكيًا من النص؟",
    description: "يتم تحويل النص إلى عرض تقديمي عبر التوليد الذكي الحقيقي داخل خدمة العروض.",
    outputLabel: "عرض تقديمي",
    serviceLabel: "خدمة العروض",
    brainLabel: "توليد ذكي",
  },
  "extract-exact": {
    id: "extract-exact",
    title: "هل تريد استخراج النص بدقة؟",
    description: "يتم تشغيل محرك الفهم والاستخراج لإرجاع النص الفعلي واللغة والمحرك المستخدم.",
    outputLabel: "نص مستخرج",
    serviceLabel: "محرك الفهم والاستخراج",
    brainLabel: "استخراج دقيق",
  },
  "extract-steps": {
    id: "extract-steps",
    title: "هل تريد استخراج الخطوات؟",
    description: "يحوّل راصد المحتوى الإجرائي إلى خطوات مرتبة مدعومة بالشواهد عندما يكون ذلك ممكنًا.",
    outputLabel: "خطوات منظمة",
    serviceLabel: "محرك الفهم والاستخراج",
    brainLabel: "استخراج خطوات",
  },
  "translate-arabic": {
    id: "translate-arabic",
    title: "هل تريد تعريب الملف؟",
    description: "يتم إرسال النص إلى خدمة التوطين لترجمته إلى العربية وإعادته فورًا داخل المحادثة.",
    outputLabel: "نص عربي",
    serviceLabel: "خدمة التوطين",
    brainLabel: "تعريب احترافي",
  },
  "apply-rtl": {
    id: "apply-rtl",
    title: "هل تريد تنسيق RTL؟",
    description: "يتم تشغيل محرك RTL على النص المستخرج ليعود بتنسيق عربي مناسب للعرض.",
    outputLabel: "نص مهيأ عربيًا",
    serviceLabel: "خدمة التوطين",
    brainLabel: "تشكيل RTL",
  },
  "convert-markdown-html": {
    id: "convert-markdown-html",
    title: "هل تريد تحويله إلى HTML؟",
    description: "يتم تشغيل خدمة التحويل لتحويل ملف ماركداون إلى صفحة HTML حقيقية.",
    outputLabel: "ملف HTML",
    serviceLabel: "خدمة التحويل",
    brainLabel: "تحويل منسق",
  },
  "convert-pdf-word": {
    id: "convert-pdf-word",
    title: "هل تريد تحويله إلى وورد؟",
    description: "يتم تحويل ملف PDF عبر خدمة التحويل إلى ملف وورد بصيغة DOCX.",
    outputLabel: "ملف وورد",
    serviceLabel: "خدمة التحويل",
    brainLabel: "تحويل تنسيقي",
  },
  "convert-word-pdf": {
    id: "convert-word-pdf",
    title: "هل تريد تحويله إلى PDF؟",
    description: "يتم تحويل ملف وورد عبر خدمة التحويل إلى ملف PDF قابل للتنزيل.",
    outputLabel: "ملف PDF",
    serviceLabel: "خدمة التحويل",
    brainLabel: "تحويل تنسيقي",
  },
  "convert-excel-pdf": {
    id: "convert-excel-pdf",
    title: "هل تريد تحويل الجدول إلى PDF؟",
    description: "يتم تحويل ملف إكسل عبر خدمة التحويل إلى ملف PDF.",
    outputLabel: "ملف PDF",
    serviceLabel: "خدمة التحويل",
    brainLabel: "تحويل تنسيقي",
  },
  "convert-csv-excel": {
    id: "convert-csv-excel",
    title: "إلى ماذا تريد تحويله؟ إلى إكسل",
    description: "يتم تحويل ملف CSV إلى ملف إكسل بصيغة XLSX عبر خدمة التحويل.",
    outputLabel: "ملف إكسل",
    serviceLabel: "خدمة التحويل",
    brainLabel: "تحويل تنسيقي",
  },
  "convert-excel-csv": {
    id: "convert-excel-csv",
    title: "إلى ماذا تريد تحويله؟ إلى CSV",
    description: "يتم تحويل ملف إكسل إلى ملف CSV عبر خدمة التحويل.",
    outputLabel: "ملف CSV",
    serviceLabel: "خدمة التحويل",
    brainLabel: "تحويل تنسيقي",
  },
  "analyze-visual": {
    id: "analyze-visual",
    title: "هل تريد مطابقته بصريًا؟",
    description: "يتم تشغيل التحليل البصري الحقيقي على الصورة عبر خدمة المطابقة البصرية.",
    outputLabel: "تحليل بصري",
    serviceLabel: "خدمة المطابقة البصرية",
    brainLabel: "فهم بصري",
  },
  "reconstruct-dashboard": {
    id: "reconstruct-dashboard",
    title: "هل تريد لوحة مؤشرات؟",
    description: "يتم إنشاء لوحة مؤشرات حقيقية من الصورة عبر خدمة المطابقة البصرية.",
    outputLabel: "لوحة مؤشرات",
    serviceLabel: "خدمة المطابقة البصرية",
    brainLabel: "إعادة بناء",
  },
  "compare-visuals": {
    id: "compare-visuals",
    title: "هل تريد مطابقته بصريًا بشكل صارم؟",
    description: "تتم مقارنة صورتين على مستوى بصري صارم وإرجاع صورة الفروقات الحقيقية.",
    outputLabel: "تقرير فروقات بصري",
    serviceLabel: "خدمة المطابقة البصرية",
    brainLabel: "تحقق صارم",
  },
};

function buildBrainSteps(primary: DetectedHomeFile | undefined, bundleKind: HomeBundleKind): string[] {
  if (!primary) return ["استقبال الملف", "تحديد السياق", "تنفيذ الإجراء"];
  if (bundleKind === "image-compare") {
    return ["تحليل بصري", "مقارنة صارمة", "إخراج تقرير فروقات"];
  }
  if (bundleKind === "multi-image") {
    return ["فهم بصري", "استخراج العناصر", "تلخيص بصري"];
  }

  switch (primary.kind) {
    case "dataset":
    case "excel":
      return ["استيعاب الملف", "تحليل أو توليد", "حفظ النتيجة"];
    case "markdown":
    case "text":
    case "html":
    case "json":
      return ["فهم المحتوى", "تعريب أو استخراج", "توليد المخرج"];
    case "pdf":
    case "word":
      return ["استخراج المحتوى", "تحويل أو توليد", "إخراج قابل للاستخدام"];
    case "image":
      return ["OCR وفهم بصري", "استخراج أو إعادة بناء", "إخراج تشغيلي"];
    default:
      return ["استقبال الملف", "تحديد السياق", "تنفيذ الإجراء"];
  }
}

function buildOrchestrationNote(primary: DetectedHomeFile | undefined, bundleKind: HomeBundleKind): string {
  if (!primary) return "راصد يحدد السياق أولًا ثم يمرر الطلب إلى المحرك الأنسب فقط.";
  if (bundleKind === "image-compare") return "ستعمل المقارنة الصارمة داخل مسار التحقق البصري فقط، من دون كشف محركات إضافية غير لازمة.";

  switch (primary.kind) {
    case "dataset":
    case "excel":
      return "يمر الملف عبر الاستيعاب ثم يتجه فقط إلى التحليل أو التقارير أو العروض بحسب اختيارك.";
    case "markdown":
    case "text":
    case "html":
    case "json":
      return "يفهم راصد المحتوى أولًا، ثم يكشف التعريب أو الاستخراج أو التوليد إذا كان المسار مناسبًا.";
    case "pdf":
    case "word":
      return "يبدأ المسار من الفهم والاستخراج، ثم ينتقل فقط إلى التحويل أو العرض أو الخطوات المنظمة.";
    case "image":
      return "الصورة تُفهم بصريًا أولًا، ثم تُكشف المطابقة أو الاستخراج أو إعادة البناء بحسب الملف نفسه.";
    default:
      return "راصد يحدد السياق أولًا ثم يمرر الطلب إلى المحرك الأنسب فقط.";
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} جيجابايت`;
}

function getExtension(fileName: string): string {
  const ext = fileName.split(".").pop();
  return ext ? ext.toLowerCase() : "";
}

function detectFileKind(file: File): HomeFileKind {
  const extension = getExtension(file.name);
  const mimeType = file.type.toLowerCase();

  if (DATASET_EXTENSIONS.has(extension)) return "dataset";
  if (MARKDOWN_EXTENSIONS.has(extension)) return "markdown";
  if (TEXT_EXTENSIONS.has(extension)) return "text";
  if (HTML_EXTENSIONS.has(extension)) return "html";
  if (extension === "json") return "json";
  if (extension === "pdf" || mimeType.includes("pdf")) return "pdf";
  if (WORD_EXTENSIONS.has(extension)) return "word";
  if (extension === "xls" || extension === "xlsx") return "excel";
  if (IMAGE_EXTENSIONS.has(extension) || mimeType.startsWith("image/")) return "image";
  return "unsupported";
}

function detectActions(files: DetectedHomeFile[], bundleKind: HomeBundleKind): HomeCapabilityAction[] {
  if (bundleKind === "image-compare") {
    return [ACTIONS["compare-visuals"], ACTIONS["analyze-visual"]];
  }

  if (bundleKind === "multi-image") {
    return [ACTIONS["analyze-visual"]];
  }

  const primary = files[0];
  if (!primary) return [];

  switch (primary.kind) {
    case "dataset":
      if (primary.extension === "csv") {
        return [
          ACTIONS["analyze-dataset"],
          ACTIONS["build-report"],
          ACTIONS["generate-data-presentation"],
          ACTIONS["convert-csv-excel"],
          ACTIONS["import-dataset"],
        ];
      }
      if (primary.extension === "xls" || primary.extension === "xlsx") {
        return [
          ACTIONS["analyze-dataset"],
          ACTIONS["build-report"],
          ACTIONS["generate-data-presentation"],
          ACTIONS["convert-excel-pdf"],
          ACTIONS["convert-excel-csv"],
          ACTIONS["import-dataset"],
        ];
      }
      return [
        ACTIONS["analyze-dataset"],
        ACTIONS["build-report"],
        ACTIONS["generate-data-presentation"],
        ACTIONS["import-dataset"],
      ];
    case "markdown":
      return [
        ACTIONS["extract-steps"],
        ACTIONS["convert-markdown-html"],
        ACTIONS["translate-arabic"],
        ACTIONS["apply-rtl"],
        ACTIONS["generate-file-presentation"],
        ACTIONS["generate-ai-presentation"],
      ];
    case "text":
    case "html":
    case "json":
      return [
        ACTIONS["extract-exact"],
        ACTIONS["extract-steps"],
        ACTIONS["translate-arabic"],
        ACTIONS["apply-rtl"],
        ACTIONS["generate-file-presentation"],
        ACTIONS["generate-ai-presentation"],
      ];
    case "pdf":
      return [
        ACTIONS["extract-exact"],
        ACTIONS["extract-steps"],
        ACTIONS["convert-pdf-word"],
        ACTIONS["generate-file-presentation"],
      ];
    case "word":
      return [
        ACTIONS["extract-exact"],
        ACTIONS["extract-steps"],
        ACTIONS["convert-word-pdf"],
        ACTIONS["generate-file-presentation"],
      ];
    case "excel":
      return [
        ACTIONS["analyze-dataset"],
        ACTIONS["build-report"],
        ACTIONS["generate-data-presentation"],
        ACTIONS["convert-excel-pdf"],
        ACTIONS["convert-excel-csv"],
        ACTIONS["import-dataset"],
      ];
    case "image":
      return [
        ACTIONS["extract-exact"],
        ACTIONS["analyze-visual"],
        ACTIONS["reconstruct-dashboard"],
        ACTIONS["generate-file-presentation"],
      ];
    default:
      return [];
  }
}

export function buildHomeFileBundle(files: File[]): HomeFileBundle {
  const detectedFiles = files.map((file) => {
    const extension = getExtension(file.name);
    return {
      file,
      extension,
      mimeType: file.type,
      sizeLabel: formatFileSize(file.size),
      kind: detectFileKind(file),
    } satisfies DetectedHomeFile;
  });

  const allImages = detectedFiles.length > 0 && detectedFiles.every((file) => file.kind === "image");
  const anyUnsupported = detectedFiles.some((file) => file.kind === "unsupported");

  let kind: HomeBundleKind = "single-file";
  if (anyUnsupported) {
    kind = "unsupported";
  } else if (detectedFiles.length === 2 && allImages) {
    kind = "image-compare";
  } else if (detectedFiles.length > 1 && allImages) {
    kind = "multi-image";
  } else if (detectedFiles.length !== 1) {
    kind = "unsupported";
  }

  const primary = detectedFiles[0];
  if (!primary) {
    return {
      kind: "unsupported",
      files: [],
      title: "لا توجد ملفات",
      summary: "اسحب ملفًا واحدًا، أو صورتين للمطابقة البصرية الصارمة.",
      actions: [],
      brainSteps: ["استقبال الملف", "تحديد السياق", "تنفيذ الإجراء"],
      orchestrationNote: "راصد يحدد السياق أولًا ثم يمرر الطلب إلى المحرك الأنسب فقط.",
    };
  }

  const actions = detectActions(detectedFiles, kind);
  const brainSteps = buildBrainSteps(primary, kind);
  const orchestrationNote = buildOrchestrationNote(primary, kind);

  if (kind === "image-compare") {
    return {
      kind,
      files: detectedFiles,
      title: "مطابقة بصرية بين صورتين",
      summary: "تم اكتشاف صورتين. يمكنك الآن اختيار المطابقة البصرية الصارمة أو التحليل البصري الفعلي.",
      actions,
      brainSteps,
      orchestrationNote,
    };
  }

  if (kind === "multi-image") {
    return {
      kind,
      files: detectedFiles,
      title: "مجموعة صور",
      summary: "تم اكتشاف مجموعة صور. الإجراء المتاح من الصفحة الرئيسية حاليًا هو التحليل البصري الفعلي.",
      actions,
      brainSteps,
      orchestrationNote,
    };
  }

  if (kind === "unsupported") {
    return {
      kind,
      files: detectedFiles,
      title: "نوع ملف غير مدعوم من الصفحة الرئيسية",
      summary: "هذا النوع لا يملك مسار تنفيذ حقيقيًا مثبتًا من الصفحة الرئيسية حاليًا.",
      actions: [],
      brainSteps,
      orchestrationNote,
    };
  }

  return {
    kind,
    files: detectedFiles,
    title: `تم اكتشاف ${primary.kind === "dataset" ? "ملف بيانات" : primary.kind === "image" ? "ملف بصري" : "ملف نصي/مستندي"}`,
    summary: `تم فحص الملف ${primary.file.name} بنجاح. النوع المكتشف هو ${primary.extension || primary.mimeType || primary.kind} وتم توليد إجراءات عربية مرتبطة بخدمات المنصة الحقيقية فقط.`,
    actions,
    brainSteps,
    orchestrationNote,
  };
}
