import { useState, useCallback, useRef, type DragEvent, type ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCanvasStore } from '@/stores/canvas-store';
import { cn } from '@/lib/utils';
import { durations, easings } from '@/lib/motion';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Upload,
  FileText,
  FileSpreadsheet,
  Presentation,
  LayoutDashboard,
  FileIcon,
  Check,
  Loader2,
  Sparkles,
  Clock,
  Shield,
  Zap,
} from 'lucide-react';
import { STRICT_PIPELINE_STEPS } from '@/types/canvas';
import { Button } from '@/components/ui/button';

// ─── Types ────────────────────────────────────────────────────────────────────

type TargetFormat = 'pptx' | 'docx' | 'xlsx' | 'dashboard' | 'pdf';
type ArabicMode = 'BASIC' | 'PROFESSIONAL' | 'ELITE';
type QualityLevel = 'fast' | 'balanced' | 'high';
type FontPolicy = 'embed' | 'substitute' | 'outline';

interface StepConfig {
  targetFormat: TargetFormat | null;
  uploadedFile: File | null;
  arabicMode: ArabicMode;
  qualityLevel: QualityLevel;
  fontPolicy: FontPolicy;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TARGET_OPTIONS: {
  id: TargetFormat;
  label: string;
  labelEn: string;
  icon: typeof FileText;
  color: string;
  desc: string;
}[] = [
  {
    id: 'pptx',
    label: 'عرض تقديمي',
    labelEn: 'PowerPoint',
    icon: Presentation,
    color: 'oklch(0.6 0.18 27)',
    desc: 'PPTX مطابق pixel-perfect',
  },
  {
    id: 'docx',
    label: 'مستند Word',
    labelEn: 'Word',
    icon: FileText,
    color: 'oklch(0.55 0.15 240)',
    desc: 'مستند قابل للتعديل',
  },
  {
    id: 'xlsx',
    label: 'جدول بيانات',
    labelEn: 'Excel',
    icon: FileSpreadsheet,
    color: 'oklch(0.55 0.18 155)',
    desc: 'استخراج الجداول بدقة',
  },
  {
    id: 'dashboard',
    label: 'لوحة مؤشرات',
    labelEn: 'Dashboard',
    icon: LayoutDashboard,
    color: 'oklch(0.6 0.2 290)',
    desc: 'لوحة تفاعلية بالبيانات',
  },
  {
    id: 'pdf',
    label: 'ملف PDF',
    labelEn: 'PDF',
    icon: FileIcon,
    color: 'oklch(0.55 0.17 15)',
    desc: 'تصدير PDF نهائي',
  },
];

const ARABIC_MODES: { id: ArabicMode; label: string; desc: string; badge: string }[] = [
  {
    id: 'BASIC',
    label: 'أساسي',
    desc: 'معالجة نص عربي بسيطة',
    badge: 'سريع',
  },
  {
    id: 'PROFESSIONAL',
    label: 'احترافي',
    desc: 'RTL كامل + خطوط مخصصة',
    badge: 'مُوصى به',
  },
  {
    id: 'ELITE',
    label: 'متميز',
    desc: 'أعلى دقة + مراجعة يدوية',
    badge: 'ELITE',
  },
];

const QUALITY_OPTIONS: { id: QualityLevel; label: string; desc: string; icon: typeof Zap }[] = [
  { id: 'fast', label: 'سريع', desc: '30 ثانية', icon: Zap },
  { id: 'balanced', label: 'متوازن', desc: '2-3 دقائق', icon: Clock },
  { id: 'high', label: 'عالي الدقة', desc: '5-10 دقائق', icon: Shield },
];

const FONT_POLICIES: { id: FontPolicy; label: string; desc: string }[] = [
  { id: 'embed', label: 'تضمين الخطوط', desc: 'حجم أكبر، جودة مضمونة' },
  { id: 'substitute', label: 'استبدال الخطوط', desc: 'بدائل قياسية، حجم أصغر' },
  { id: 'outline', label: 'تحويل إلى مسارات', desc: 'pixel-perfect، غير قابل للتعديل' },
];

const ESTIMATED_TIMES: Record<QualityLevel, Record<TargetFormat, string>> = {
  fast: { pptx: '25 ث', docx: '15 ث', xlsx: '20 ث', dashboard: '35 ث', pdf: '10 ث' },
  balanced: { pptx: '2 د', docx: '1.5 د', xlsx: '2 د', dashboard: '3 د', pdf: '1 د' },
  high: { pptx: '7 د', docx: '5 د', xlsx: '6 د', dashboard: '10 د', pdf: '3 د' },
};

// ─── SmartStepsPanel ──────────────────────────────────────────────────────────

interface SmartStepsPanelProps {
  onClose: () => void;
}

export function SmartStepsPanel({ onClose }: SmartStepsPanelProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [config, setConfig] = useState<StepConfig>({
    targetFormat: null,
    uploadedFile: null,
    arabicMode: 'PROFESSIONAL',
    qualityLevel: 'balanced',
    fontPolicy: 'embed',
  });
  const [isDragOver, setIsDragOver] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executingStepIndex, setExecutingStepIndex] = useState(-1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startPipeline = useCanvasStore((s) => s.startPipeline);
  const updatePipelineStep = useCanvasStore((s) => s.updatePipelineStep);
  const handleFilesDrop = useCanvasStore((s) => s.handleFilesDrop);

  const STEP_LABELS = ['الهدف', 'الملف', 'الخيارات', 'مراجعة', 'تنفيذ'];
  const TOTAL_STEPS = 5;

  // Detect uploaded file category
  function detectFileFormat(file: File): string {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = {
      pdf: 'PDF',
      pptx: 'PowerPoint',
      docx: 'Word',
      xlsx: 'Excel',
      csv: 'CSV',
      png: 'PNG',
      jpg: 'JPEG',
      jpeg: 'JPEG',
    };
    return map[ext] ?? ext.toUpperCase();
  }

  const handleFileDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        setConfig((c) => ({ ...c, uploadedFile: files[0] }));
      }
    },
    []
  );

  const handleFileInput = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setConfig((c) => ({ ...c, uploadedFile: files[0] }));
    }
  }, []);

  const canGoNext = useCallback(() => {
    if (currentStep === 0) return config.targetFormat !== null;
    if (currentStep === 1) return config.uploadedFile !== null;
    return true;
  }, [currentStep, config]);

  const handleExecute = useCallback(async () => {
    if (!config.uploadedFile || !config.targetFormat) return;
    setIsExecuting(true);
    setExecutingStepIndex(0);
    setCompletedSteps(new Set());

    const runId = `run_${Date.now()}`;
    startPipeline(runId, config.uploadedFile.name, config.targetFormat);

    // Push file through main drop handler
    handleFilesDrop([config.uploadedFile]);

    // Simulate 13 STRICT steps sequentially
    for (let i = 0; i < STRICT_PIPELINE_STEPS.length; i++) {
      setExecutingStepIndex(i);
      updatePipelineStep(i, { status: 'running', startedAt: new Date() });
      await new Promise<void>((resolve) => setTimeout(resolve, 350 + Math.random() * 250));
      updatePipelineStep(i, {
        status: 'done',
        completedAt: new Date(),
        durationMs: Math.round(350 + Math.random() * 250),
      });
      setCompletedSteps((prev) => new Set([...prev, i]));
    }

    setIsExecuting(false);
    setExecutingStepIndex(-1);
    // Close panel after short delay
    setTimeout(onClose, 800);
  }, [config, startPipeline, updatePipelineStep, handleFilesDrop, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: durations.base, ease: easings.default as unknown as number[] }}
      className="absolute inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
    >
      <div
        className="relative w-full max-w-xl bg-card border border-border/60 rounded-2xl shadow-2xl overflow-hidden"
        dir="rtl"
      >
        {/* Top gradient bar */}
        <div className="h-1 bg-gradient-to-l from-primary/0 via-primary to-primary/0" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-foreground">معالج التحويل الذكي</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-1.5 px-5 py-3 border-b border-border/30">
          {STEP_LABELS.map((label, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <div className="flex flex-col items-center gap-0.5">
                <div
                  className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-200',
                    idx < currentStep
                      ? 'bg-primary text-primary-foreground'
                      : idx === currentStep
                      ? 'bg-primary/20 text-primary ring-2 ring-primary/40'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {idx < currentStep ? <Check className="w-3 h-3" /> : idx + 1}
                </div>
                <span
                  className={cn(
                    'text-[9px] font-medium whitespace-nowrap',
                    idx === currentStep ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {label}
                </span>
              </div>
              {idx < TOTAL_STEPS - 1 && (
                <div
                  className={cn(
                    'w-6 h-0.5 rounded-full mb-3 transition-all duration-300',
                    idx < currentStep ? 'bg-primary' : 'bg-border/50'
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-[320px] max-h-[420px] overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: durations.short, ease: easings.default as unknown as number[] }}
              className="p-5"
            >
              {/* Step 0: Target format */}
              {currentStep === 0 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-foreground mb-1">ماذا تريد؟</h3>
                    <p className="text-xs text-muted-foreground">اختر صيغة الملف الهدف</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {TARGET_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const isSelected = config.targetFormat === opt.id;
                      return (
                        <button
                          key={opt.id}
                          onClick={() => setConfig((c) => ({ ...c, targetFormat: opt.id }))}
                          className={cn(
                            'flex items-center gap-3 p-3 rounded-xl border-2 text-right transition-all duration-150',
                            isSelected
                              ? 'border-primary bg-primary/8 shadow-sm'
                              : 'border-border/40 hover:border-primary/40 hover:bg-muted/40'
                          )}
                        >
                          <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: opt.color + '20' }}
                          >
                            <Icon className="w-5 h-5" style={{ color: opt.color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold text-foreground">{opt.label}</span>
                              <span className="text-[10px] text-muted-foreground">{opt.labelEn}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">{opt.desc}</p>
                          </div>
                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                              <Check className="w-3 h-3 text-primary-foreground" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Step 1: Upload file */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-foreground mb-1">ارفع الملف</h3>
                    <p className="text-xs text-muted-foreground">
                      اسحب الملف أو اضغط للاختيار · PDF, PPTX, DOCX, XLSX, صور
                    </p>
                  </div>

                  {/* Drop zone */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleFileDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      'flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200',
                      isDragOver
                        ? 'border-primary bg-primary/10 scale-[1.01]'
                        : config.uploadedFile
                        ? 'border-success/50 bg-success/5'
                        : 'border-border/50 hover:border-primary/50 hover:bg-muted/30'
                    )}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.pptx,.docx,.xlsx,.csv,.png,.jpg,.jpeg"
                      onChange={handleFileInput}
                    />

                    {config.uploadedFile ? (
                      <>
                        <div className="w-12 h-12 rounded-xl bg-success/15 flex items-center justify-center">
                          <Check className="w-6 h-6 text-success" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-bold text-foreground">{config.uploadedFile.name}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {detectFileFormat(config.uploadedFile)} ·{' '}
                            {(config.uploadedFile.size / 1024).toFixed(0)} ك.ب
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfig((c) => ({ ...c, uploadedFile: null }));
                          }}
                          className="text-[11px] text-muted-foreground underline hover:text-foreground"
                        >
                          تغيير الملف
                        </button>
                      </>
                    ) : (
                      <>
                        <motion.div
                          animate={{ y: isDragOver ? -4 : 0 }}
                          transition={{ duration: 0.2 }}
                          className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center"
                        >
                          <Upload className="w-6 h-6 text-muted-foreground" />
                        </motion.div>
                        <div className="text-center">
                          <p className="text-sm font-medium text-foreground">
                            {isDragOver ? 'أفلت الملف هنا' : 'اسحب الملف أو اضغط للاختيار'}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            PDF · PPTX · DOCX · XLSX · صور
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Detected source format */}
                  {config.uploadedFile && config.targetFormat && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                      <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                        <FileText className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <span className="text-xs text-muted-foreground flex-1">
                        <span className="font-semibold text-foreground">
                          {detectFileFormat(config.uploadedFile)}
                        </span>{' '}
                        →{' '}
                        <span className="font-semibold text-foreground">
                          {TARGET_OPTIONS.find((o) => o.id === config.targetFormat)?.labelEn}
                        </span>
                      </span>
                      <span className="text-[10px] bg-success/15 text-success px-1.5 py-0.5 rounded-md font-medium">
                        مدعوم
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Conversion options */}
              {currentStep === 2 && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-base font-bold text-foreground mb-1">خيارات التحويل</h3>
                    <p className="text-xs text-muted-foreground">اضبط إعدادات التحويل للحصول على أفضل نتيجة</p>
                  </div>

                  {/* Arabic Mode */}
                  <div>
                    <label className="text-xs font-semibold text-foreground mb-2 block">وضع اللغة العربية</label>
                    <div className="grid grid-cols-3 gap-2">
                      {ARABIC_MODES.map((mode) => (
                        <button
                          key={mode.id}
                          onClick={() => setConfig((c) => ({ ...c, arabicMode: mode.id }))}
                          className={cn(
                            'flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all duration-150 text-center',
                            config.arabicMode === mode.id
                              ? 'border-primary bg-primary/8'
                              : 'border-border/40 hover:border-primary/30 hover:bg-muted/30'
                          )}
                        >
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
                            {mode.badge}
                          </span>
                          <span className="text-xs font-semibold text-foreground">{mode.label}</span>
                          <span className="text-[10px] text-muted-foreground leading-snug">{mode.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quality level */}
                  <div>
                    <label className="text-xs font-semibold text-foreground mb-2 block">مستوى الجودة</label>
                    <div className="grid grid-cols-3 gap-2">
                      {QUALITY_OPTIONS.map((q) => {
                        const Icon = q.icon;
                        return (
                          <button
                            key={q.id}
                            onClick={() => setConfig((c) => ({ ...c, qualityLevel: q.id }))}
                            className={cn(
                              'flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all duration-150',
                              config.qualityLevel === q.id
                                ? 'border-primary bg-primary/8'
                                : 'border-border/40 hover:border-primary/30 hover:bg-muted/30'
                            )}
                          >
                            <Icon
                              className={cn(
                                'w-4 h-4',
                                config.qualityLevel === q.id ? 'text-primary' : 'text-muted-foreground'
                              )}
                            />
                            <span className="text-xs font-semibold text-foreground">{q.label}</span>
                            <span className="text-[10px] text-muted-foreground">{q.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Font policy */}
                  <div>
                    <label className="text-xs font-semibold text-foreground mb-2 block">سياسة الخطوط</label>
                    <div className="space-y-1.5">
                      {FONT_POLICIES.map((fp) => (
                        <button
                          key={fp.id}
                          onClick={() => setConfig((c) => ({ ...c, fontPolicy: fp.id }))}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border-2 transition-all duration-150 text-right',
                            config.fontPolicy === fp.id
                              ? 'border-primary bg-primary/8'
                              : 'border-border/40 hover:border-primary/30 hover:bg-muted/30'
                          )}
                        >
                          <div
                            className={cn(
                              'w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                              config.fontPolicy === fp.id
                                ? 'border-primary bg-primary'
                                : 'border-muted-foreground/40'
                            )}
                          >
                            {config.fontPolicy === fp.id && (
                              <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-semibold text-foreground">{fp.label}</span>
                            <p className="text-[10px] text-muted-foreground">{fp.desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Review */}
              {currentStep === 3 && config.uploadedFile && config.targetFormat && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-foreground mb-1">مراجعة الإعدادات</h3>
                    <p className="text-xs text-muted-foreground">تحقق من الإعدادات قبل بدء التحويل</p>
                  </div>

                  {/* Summary card */}
                  <div className="rounded-xl border border-border/50 bg-muted/30 p-4 space-y-3">
                    {/* Source → Target */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 p-2.5 rounded-lg bg-background border border-border/40 text-center">
                        <p className="text-[10px] text-muted-foreground mb-0.5">المصدر</p>
                        <p className="text-sm font-bold text-foreground">
                          {detectFileFormat(config.uploadedFile)}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5 max-w-[100px] mx-auto">
                          {config.uploadedFile.name}
                        </p>
                      </div>
                      <div className="flex flex-col items-center gap-0.5 text-muted-foreground">
                        <ChevronLeft className="w-4 h-4" />
                        <span className="text-[9px]">تحويل</span>
                      </div>
                      <div className="flex-1 p-2.5 rounded-lg bg-primary/8 border border-primary/30 text-center">
                        <p className="text-[10px] text-primary/70 mb-0.5">الهدف</p>
                        <p className="text-sm font-bold text-primary">
                          {TARGET_OPTIONS.find((o) => o.id === config.targetFormat)?.labelEn}
                        </p>
                        <p className="text-[10px] text-primary/60 mt-0.5">
                          {TARGET_OPTIONS.find((o) => o.id === config.targetFormat)?.label}
                        </p>
                      </div>
                    </div>

                    {/* Settings list */}
                    <div className="space-y-2 pt-2 border-t border-border/30">
                      {[
                        {
                          label: 'وضع اللغة العربية',
                          value: ARABIC_MODES.find((m) => m.id === config.arabicMode)?.label ?? '',
                        },
                        {
                          label: 'مستوى الجودة',
                          value: QUALITY_OPTIONS.find((q) => q.id === config.qualityLevel)?.label ?? '',
                        },
                        {
                          label: 'سياسة الخطوط',
                          value: FONT_POLICIES.find((f) => f.id === config.fontPolicy)?.label ?? '',
                        },
                        {
                          label: 'حجم الملف',
                          value: `${(config.uploadedFile.size / 1024).toFixed(0)} ك.ب`,
                        },
                      ].map((item) => (
                        <div key={item.label} className="flex justify-between items-center">
                          <span className="text-[11px] text-muted-foreground">{item.label}</span>
                          <span className="text-[11px] font-semibold text-foreground">{item.value}</span>
                        </div>
                      ))}
                    </div>

                    {/* Estimated time */}
                    <div className="flex items-center gap-2 pt-2 border-t border-border/30">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground">الوقت المقدّر:</span>
                      <span className="text-[11px] font-bold text-foreground">
                        {ESTIMATED_TIMES[config.qualityLevel][config.targetFormat]}
                      </span>
                    </div>
                  </div>

                  {/* Pipeline info */}
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/20">
                    <Shield className="w-4 h-4 text-primary flex-shrink-0" />
                    <p className="text-[11px] text-primary">
                      سيتم تنفيذ 13 خطوة عبر محرك STRICT 1:1 مع حزمة أدلة كاملة
                    </p>
                  </div>
                </div>
              )}

              {/* Step 4: Execute */}
              {currentStep === 4 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-foreground mb-1">تنفيذ التحويل</h3>
                    <p className="text-xs text-muted-foreground">
                      {isExecuting ? 'جارٍ تنفيذ خطوات محرك STRICT 1:1…' : 'اضغط تنفيذ لبدء عملية التحويل'}
                    </p>
                  </div>

                  {/* Pipeline steps grid */}
                  <div className="space-y-1.5">
                    {STRICT_PIPELINE_STEPS.map((step) => {
                      const isDone = completedSteps.has(step.index);
                      const isRunning = executingStepIndex === step.index;
                      const isPending = !isDone && !isRunning;

                      return (
                        <div
                          key={step.index}
                          className={cn(
                            'flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all duration-200',
                            isDone
                              ? 'border-success/30 bg-success/5'
                              : isRunning
                              ? 'border-primary/40 bg-primary/8 shadow-sm'
                              : 'border-border/30 bg-transparent'
                          )}
                        >
                          {/* Status icon */}
                          <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                            {isDone ? (
                              <Check className="w-3.5 h-3.5 text-success" />
                            ) : isRunning ? (
                              <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                            ) : (
                              <div className="w-2 h-2 rounded-full bg-border" />
                            )}
                          </div>

                          {/* Step number */}
                          <span
                            className={cn(
                              'text-[10px] font-mono w-4 flex-shrink-0',
                              isDone
                                ? 'text-success'
                                : isRunning
                                ? 'text-primary'
                                : 'text-muted-foreground/40'
                            )}
                          >
                            {String(step.index + 1).padStart(2, '0')}
                          </span>

                          {/* Step name */}
                          <span
                            className={cn(
                              'text-xs flex-1',
                              isDone
                                ? 'text-success font-medium'
                                : isRunning
                                ? 'text-foreground font-semibold'
                                : isPending
                                ? 'text-muted-foreground'
                                : 'text-foreground'
                            )}
                          >
                            {step.name}
                          </span>

                          {/* En key */}
                          <span className="text-[9px] text-muted-foreground/40 font-mono hidden sm:block">
                            {step.nameEn}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Progress bar */}
                  {isExecuting && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>التقدم</span>
                        <span>
                          {completedSteps.size} / {STRICT_PIPELINE_STEPS.length}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <motion.div
                          className="h-full bg-primary rounded-full"
                          animate={{
                            width: `${(completedSteps.size / STRICT_PIPELINE_STEPS.length) * 100}%`,
                          }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Done message */}
                  {!isExecuting && completedSteps.size === STRICT_PIPELINE_STEPS.length && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2 p-3 rounded-xl bg-success/10 border border-success/30"
                    >
                      <Check className="w-4 h-4 text-success" />
                      <p className="text-sm font-bold text-success">اكتمل التحويل بنجاح!</p>
                    </motion.div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer navigation */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border/40 bg-muted/20">
          {/* Back */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
            disabled={currentStep === 0 || isExecuting}
            className="gap-1.5"
          >
            <ChevronRight className="w-4 h-4" />
            السابق
          </Button>

          {/* Step label */}
          <span className="text-[11px] text-muted-foreground">
            {currentStep + 1} / {TOTAL_STEPS}
          </span>

          {/* Next / Execute */}
          {currentStep < TOTAL_STEPS - 1 ? (
            <Button
              size="sm"
              onClick={() => setCurrentStep((s) => Math.min(TOTAL_STEPS - 1, s + 1))}
              disabled={!canGoNext()}
              className="gap-1.5"
            >
              التالي
              <ChevronLeft className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleExecute}
              disabled={
                isExecuting ||
                completedSteps.size === STRICT_PIPELINE_STEPS.length ||
                !config.uploadedFile ||
                !config.targetFormat
              }
              className={cn(
                'gap-1.5',
                isExecuting && 'opacity-80'
              )}
            >
              {isExecuting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  جارٍ التنفيذ…
                </>
              ) : completedSteps.size === STRICT_PIPELINE_STEPS.length ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  اكتمل
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  تنفيذ
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
