import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCanvasStore } from '@/stores/canvas-store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Upload,
  MousePointerClick,
  Eye,
  Download,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';

// GP-0195: Tutorials inside Canvas (guided overlays)
// GP-0196: Ready examples
// GP-0197: Sandbox datasets
// GP-0198: Prompt academy + Recipes

interface TutorialStep {
  icon: typeof Upload;
  title: string;
  description: string;
  example?: string;
}

const tutorialSteps: TutorialStep[] = [
  {
    icon: Upload,
    title: 'ارفع ملفاً',
    description: 'اسحب أي ملف (PDF, Excel, Word, صورة, فيديو) إلى الكانفس أو اضغط على زر الإرفاق.',
    example: 'مثال: اسحب ملف PDF يحتوي على جدول',
  },
  {
    icon: MousePointerClick,
    title: 'اختر إجراءً',
    description: 'راصد يقترح إجراءات ذكية حسب نوع الملف: تحويل، استخراج، تحليل، تعريب.',
    example: 'مثال: "حوّل إلى PowerPoint 1:1" للتحويل المطابق pixel-perfect',
  },
  {
    icon: Eye,
    title: 'شاهد المعاينة',
    description: 'يتم عرض معاينة فورية للنتيجة مع مراحل التنفيذ: تحليل → بناء → تحقق → تصدير.',
    example: 'مثال: معاينة صورة جدول تم استخراجه إلى Excel',
  },
  {
    icon: Download,
    title: 'صدّر واستلم',
    description: 'بعد اجتياز بوابات التحقق (Pixel + Structural)، يمكنك تحميل المخرج النهائي.',
    example: 'مثال: PPTX editable مطابق بصرياً 100%',
  },
  {
    icon: Sparkles,
    title: 'جرّب الأوامر النصية',
    description: 'اكتب أمراً طبيعياً في شريط الإدخال أو استخدم ⌘K للبحث السريع.',
    example: 'أمثلة جاهزة:\n• "حوّل هذا PDF إلى Word 1:1"\n• "استخرج الجداول إلى Excel"\n• "أنشئ لوحة مؤشرات"\n• "عرّب الملف (PRO)"',
  },
];

export function TutorialOverlay() {
  const showTutorial = useCanvasStore((s) => s.showTutorial);
  const setShowTutorial = useCanvasStore((s) => s.setShowTutorial);
  const [currentStep, setCurrentStep] = useState(0);

  if (!showTutorial) return null;

  const step = tutorialSteps[currentStep];
  const isLast = currentStep === tutorialSteps.length - 1;
  const isFirst = currentStep === 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.24, ease: [0.33, 1, 0.68, 1] }}
          className="w-full max-w-md mx-4 bg-card border border-border/50 rounded-2xl shadow-xl overflow-hidden"
        >
          {/* Close button */}
          <div className="flex items-center justify-between p-4 border-b border-border/30">
            <span className="text-xs text-muted-foreground">
              {currentStep + 1} / {tutorialSteps.length}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowTutorial(false)}
              aria-label="تخطي الدليل"
            >
              <X className="size-4" />
            </Button>
          </div>

          {/* Step content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="p-6 space-y-4"
            >
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <step.icon className="w-7 h-7 text-primary" />
              </div>

              <div className="text-center space-y-2">
                <h3 className="text-lg font-bold text-foreground">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
              </div>

              {step.example && (
                <div className="bg-muted/50 border border-border/30 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
                    {step.example}
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex items-center justify-between p-4 border-t border-border/30">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentStep((s) => s - 1)}
              disabled={isFirst}
              className="gap-1"
            >
              <ChevronRight className="size-4" />
              السابق
            </Button>

            {/* Step dots */}
            <div className="flex items-center gap-1.5">
              {tutorialSteps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentStep(i)}
                  className={cn(
                    'w-2 h-2 rounded-full transition-all duration-200',
                    i === currentStep ? 'bg-primary w-4' : 'bg-muted-foreground/30'
                  )}
                />
              ))}
            </div>

            {isLast ? (
              <Button
                size="sm"
                onClick={() => setShowTutorial(false)}
                className="gap-1"
              >
                ابدأ الآن
                <Sparkles className="size-3.5" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentStep((s) => s + 1)}
                className="gap-1"
              >
                التالي
                <ChevronLeft className="size-4" />
              </Button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
