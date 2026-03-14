import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCanvasStore } from '@/stores/canvas-store';
import { cn } from '@/lib/utils';
import { durations, easings } from '@/lib/motion';
import type { ArtifactResult, EvidenceData } from '@/types/canvas';
import {
  X,
  Download,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Shield,
  Hash,
  Clock,
  Layers,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Info,
  GitCompare,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PreviewWarning {
  id: string;
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  detail?: string;
}

interface ConversionMeta {
  conversionTimeMs: number;
  toolVersions: Record<string, string>;
  farmImageId: string;
  pipelineRunId: string;
  targetFormat: string;
  sourceFormat: string;
  degradePoliciesApplied: string[];
}

interface PreviewPanelProps {
  artifact: ArtifactResult;
  evidenceData?: EvidenceData;
  sourcePreviewUrl?: string;
  targetPreviewUrl?: string;
  warnings?: PreviewWarning[];
  meta?: ConversionMeta;
  onClose: () => void;
  onExport: (artifactId: string) => void;
  onRepair: (artifactId: string) => void;
}

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function buildDefaultMeta(artifact: ArtifactResult): ConversionMeta {
  return {
    conversionTimeMs: 4230,
    toolVersions: {
      'strict-engine': '2.1.4',
      'cdr-builder': '1.8.2',
      'pdf-parser': '3.0.1',
      'layout-rebuild': '2.0.7',
    },
    farmImageId: `farm-img-${artifact.id.slice(0, 8)}`,
    pipelineRunId: artifact.evidenceId ?? `run-${artifact.id.slice(0, 8)}`,
    targetFormat: artifact.type.toUpperCase(),
    sourceFormat: 'PDF',
    degradePoliciesApplied: [],
  };
}

function buildDefaultWarnings(evidenceData?: EvidenceData): PreviewWarning[] {
  if (!evidenceData || evidenceData.gatesPassed) return [];
  return [
    {
      id: 'w1',
      severity: 'warning',
      code: 'PIXEL_DIFF_THRESHOLD',
      message: 'فرق البكسل تجاوز العتبة المسموحة',
      detail: `فرق ${evidenceData.pixelDiff}٪ — العتبة 0.5٪`,
    },
  ];
}

// ─── Slider Preview ───────────────────────────────────────────────────────────

function SliderPreview({
  sourceUrl,
  targetUrl,
  showDiff,
}: {
  sourceUrl?: string;
  targetUrl?: string;
  showDiff: boolean;
}) {
  const [sliderPos, setSliderPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const updateSlider = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    // RTL: flip
    setSliderPos(100 - pct);
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isDragging.current) updateSlider(e.clientX);
    };
    const onMouseUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [updateSlider]);

  const renderPlaceholder = (label: string, sublabel: string, color: string) => (
    <div
      className="w-full h-full flex flex-col items-center justify-center gap-2"
      style={{ backgroundColor: `${color}10` }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: `${color}20` }}
      >
        <GitCompare className="w-6 h-6" style={{ color }} />
      </div>
      <span className="text-xs font-medium text-foreground">{label}</span>
      <span className="text-[10px] text-muted-foreground">{sublabel}</span>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full h-48 rounded-xl overflow-hidden border border-border/50 bg-muted select-none cursor-col-resize"
      onMouseDown={(e) => { isDragging.current = true; updateSlider(e.clientX); }}
    >
      {/* Source (left in RTL view = right panel) */}
      <div className="absolute inset-0">
        {sourceUrl ? (
          <img src={sourceUrl} alt="مصدر" className="w-full h-full object-contain" />
        ) : (
          renderPlaceholder('المصدر', 'الملف الأصلي', 'oklch(0.55 0.15 240)')
        )}
      </div>

      {/* Target (clipped) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${sliderPos}% 0 0)` }}
      >
        {targetUrl ? (
          <img src={targetUrl} alt="نتيجة" className="w-full h-full object-contain" />
        ) : (
          renderPlaceholder('النتيجة', 'الملف المحوّل', 'oklch(0.55 0.18 155)')
        )}

        {/* Diff overlay */}
        {showDiff && (
          <div className="absolute inset-0 bg-red-500/15 mix-blend-multiply pointer-events-none" />
        )}
      </div>

      {/* Slider handle */}
      <div
        className="absolute top-0 bottom-0 flex items-center"
        style={{ right: `${sliderPos}%`, transform: 'translateX(50%)' }}
      >
        <div className="w-0.5 h-full bg-white/70" />
        <div className="absolute w-7 h-7 rounded-full bg-white shadow-lg border-2 border-border/50 flex items-center justify-center">
          <div className="w-3 h-3 text-muted-foreground">
            <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 2L1 6L4 10M8 2L11 6L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-background/70 backdrop-blur-sm text-foreground">
        المصدر
      </div>
      <div className="absolute top-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-primary/20 backdrop-blur-sm text-primary">
        النتيجة
      </div>

      {showDiff && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] font-bold px-2 py-0.5 rounded-md bg-red-500/20 backdrop-blur-sm text-red-600">
          عرض الاختلافات فعّال
        </div>
      )}
    </div>
  );
}

// ─── Evidence Summary ─────────────────────────────────────────────────────────

function EvidenceSummary({
  evidenceData,
}: {
  evidenceData?: EvidenceData;
}) {
  if (!evidenceData) return null;

  const gates = [
    {
      label: 'فرق البكسل',
      value: `${evidenceData.pixelDiff}%`,
      passed: evidenceData.pixelDiff < 1,
      icon: Eye,
    },
    {
      label: 'التجزئة البنيوية',
      value: evidenceData.structuralHash.slice(0, 12) + '…',
      passed: true,
      icon: Hash,
    },
    {
      label: 'حتمية الناتج',
      value: evidenceData.gatesPassed ? 'مطابق' : 'متغير',
      passed: evidenceData.gatesPassed,
      icon: Shield,
    },
  ];

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
        <Shield className="w-3.5 h-3.5 text-primary" />
        ملخص الأدلة
      </h4>
      <div className="grid grid-cols-3 gap-2">
        {gates.map((gate) => {
          const Icon = gate.icon;
          return (
            <div
              key={gate.label}
              className={cn(
                'p-2.5 rounded-lg border text-center',
                gate.passed
                  ? 'border-success/30 bg-success/5'
                  : 'border-destructive/30 bg-destructive/5'
              )}
            >
              <Icon
                className={cn('w-3.5 h-3.5 mx-auto mb-1', gate.passed ? 'text-success' : 'text-destructive')}
              />
              <p className="text-[9px] text-muted-foreground">{gate.label}</p>
              <p
                className={cn(
                  'text-[10px] font-bold truncate mt-0.5',
                  gate.passed ? 'text-success' : 'text-destructive'
                )}
              >
                {gate.value}
              </p>
              {gate.passed ? (
                <CheckCircle2 className="w-3 h-3 text-success mx-auto mt-1" />
              ) : (
                <XCircle className="w-3 h-3 text-destructive mx-auto mt-1" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Warning List ─────────────────────────────────────────────────────────────

function WarningList({ warnings }: { warnings: PreviewWarning[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (warnings.length === 0) return null;

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const severityConfig: Record<PreviewWarning['severity'], { color: string; icon: typeof AlertTriangle; label: string }> = {
    error: { color: 'text-destructive', icon: XCircle, label: 'خطأ' },
    warning: { color: 'text-amber-600', icon: AlertTriangle, label: 'تحذير' },
    info: { color: 'text-blue-600', icon: Info, label: 'معلومة' },
  };

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
        التحذيرات ({warnings.length})
      </h4>
      <div className="space-y-1.5">
        {warnings.map((w) => {
          const cfg = severityConfig[w.severity];
          const Icon = cfg.icon;
          const isExpanded = expanded.has(w.id);

          return (
            <div
              key={w.id}
              className="rounded-lg border border-border/50 overflow-hidden"
            >
              <button
                onClick={() => toggle(w.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/40 transition-colors text-right"
              >
                <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', cfg.color)} />
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-semibold text-foreground">{w.message}</span>
                  <span className={cn('text-[9px] mr-2 font-mono', cfg.color)}>{w.code}</span>
                </div>
                {w.detail && (
                  isExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  )
                )}
              </button>
              <AnimatePresence>
                {isExpanded && w.detail && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 'auto' }}
                    exit={{ height: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-2.5 pt-0">
                      <p className="text-[10px] text-muted-foreground border-t border-border/30 pt-2">
                        {w.detail}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Metadata Block ───────────────────────────────────────────────────────────

function MetaBlock({ meta }: { meta: ConversionMeta }) {
  const [showTools, setShowTools] = useState(false);

  function fmtMs(ms: number): string {
    if (ms < 1000) return `${ms} مللي ثانية`;
    return `${(ms / 1000).toFixed(1)} ث`;
  }

  const items = [
    { icon: Clock, label: 'وقت التحويل', value: fmtMs(meta.conversionTimeMs) },
    { icon: Hash, label: 'معرف التشغيل', value: meta.pipelineRunId.slice(0, 16) + '…' },
    { icon: Layers, label: 'صورة المزرعة', value: meta.farmImageId },
    { icon: GitCompare, label: 'التحويل', value: `${meta.sourceFormat} → ${meta.targetFormat}` },
  ];

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
        <Info className="w-3.5 h-3.5 text-muted-foreground" />
        بيانات التحويل
      </h4>
      <div className="rounded-lg border border-border/40 divide-y divide-border/30">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="flex items-center gap-2.5 px-3 py-2">
              <Icon className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <span className="text-[10px] text-muted-foreground flex-1">{item.label}</span>
              <span className="text-[10px] font-mono text-foreground">{item.value}</span>
            </div>
          );
        })}
      </div>

      {/* Tool versions (collapsible) */}
      <button
        onClick={() => setShowTools((v) => !v)}
        className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {showTools ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        إصدارات الأدوات
      </button>
      <AnimatePresence>
        {showTools && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="rounded-lg border border-border/40 divide-y divide-border/30">
              {Object.entries(meta.toolVersions).map(([tool, version]) => (
                <div key={tool} className="flex justify-between items-center px-3 py-1.5">
                  <span className="text-[9px] font-mono text-muted-foreground">{tool}</span>
                  <span className="text-[9px] font-mono text-foreground">{version}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Degrade policies */}
      {meta.degradePoliciesApplied.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {meta.degradePoliciesApplied.map((policy) => (
            <span
              key={policy}
              className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 font-mono dark:bg-amber-900/30 dark:text-amber-400"
            >
              {policy}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PreviewPanel ─────────────────────────────────────────────────────────────

export function PreviewPanel({
  artifact,
  evidenceData,
  sourcePreviewUrl,
  targetPreviewUrl,
  warnings: propWarnings,
  meta: propMeta,
  onClose,
  onExport,
  onRepair,
}: PreviewPanelProps) {
  const [showDiff, setShowDiff] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [exportDone, setExportDone] = useState(false);

  const meta = propMeta ?? buildDefaultMeta(artifact);
  const warnings = propWarnings ?? buildDefaultWarnings(evidenceData);

  const hasWarnings = warnings.length > 0;
  const gatesPassed = evidenceData?.gatesPassed ?? artifact.gatesPassed ?? true;

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    await new Promise<void>((resolve) => setTimeout(resolve, 1200));
    // Trigger download if URL is available
    if (artifact.downloadUrl) {
      const a = document.createElement('a');
      a.href = artifact.downloadUrl;
      a.download = artifact.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    setIsExporting(false);
    setExportDone(true);
    onExport(artifact.id);
  }, [artifact, onExport]);

  const handleRepair = useCallback(async () => {
    setIsRepairing(true);
    await new Promise<void>((resolve) => setTimeout(resolve, 800));
    setIsRepairing(false);
    onRepair(artifact.id);
  }, [artifact.id, onRepair]);

  const handleDownloadWithWarnings = useCallback(() => {
    if (artifact.downloadUrl) {
      const a = document.createElement('a');
      a.href = artifact.downloadUrl;
      a.download = artifact.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    onExport(artifact.id);
  }, [artifact, onExport]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: durations.base, ease: easings.default as unknown as number[] }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-md p-4"
      dir="rtl"
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 16 }}
        transition={{ duration: durations.base, ease: easings.default as unknown as number[] }}
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-card border border-border/60 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Top status bar */}
        <div
          className={cn(
            'h-1',
            gatesPassed
              ? 'bg-gradient-to-l from-success/0 via-success to-success/0'
              : 'bg-gradient-to-l from-amber-400/0 via-amber-400 to-amber-400/0'
          )}
        />

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border/40 flex-shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {gatesPassed ? (
              <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground truncate">معاينة قبل التصدير</h2>
              <p className="text-[10px] text-muted-foreground truncate">{artifact.name}</p>
            </div>
          </div>

          {/* Diff toggle */}
          <button
            onClick={() => setShowDiff((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-medium transition-all',
              showDiff
                ? 'border-red-400/50 bg-red-500/10 text-red-600'
                : 'border-border/40 text-muted-foreground hover:border-primary/40 hover:text-foreground'
            )}
          >
            {showDiff ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            فرق البكسل
          </button>

          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex-shrink-0"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Side-by-side preview with slider */}
          <SliderPreview
            sourceUrl={sourcePreviewUrl}
            targetUrl={targetPreviewUrl}
            showDiff={showDiff}
          />

          {/* Slider hint */}
          <p className="text-[10px] text-muted-foreground/60 text-center -mt-3">
            اسحب المؤشر للمقارنة بين المصدر والنتيجة
          </p>

          {/* Evidence summary */}
          <EvidenceSummary evidenceData={evidenceData} />

          {/* Warnings */}
          <WarningList warnings={warnings} />

          {/* Metadata */}
          <MetaBlock meta={meta} />

          {/* Degrade policies notice */}
          {meta.degradePoliciesApplied.length > 0 && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-700/40">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  تطبيق سياسات تخفيض الجودة
                </p>
                <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-0.5">
                  بعض عناصر التصميم تم تبسيطها للحفاظ على توافق الصيغة المطلوبة.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Action footer */}
        <div className="flex-shrink-0 border-t border-border/40 bg-muted/20 px-5 py-4">
          <div className="flex flex-col gap-2.5">
            {/* Primary action: Accept & Export */}
            <Button
              onClick={handleExport}
              disabled={isExporting || isRepairing || exportDone}
              className={cn(
                'w-full gap-2 text-sm font-bold',
                exportDone && 'bg-success hover:bg-success/90'
              )}
              size="default"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  جارٍ التصدير…
                </>
              ) : exportDone ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  تم التصدير بنجاح
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  قبول وتصدير
                </>
              )}
            </Button>

            {/* Secondary actions */}
            <div className="flex gap-2">
              {/* Repair */}
              <Button
                variant="outline"
                onClick={handleRepair}
                disabled={isExporting || isRepairing || exportDone}
                className="flex-1 gap-1.5 text-xs"
                size="sm"
              >
                {isRepairing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    جارٍ الإصلاح…
                  </>
                ) : (
                  <>
                    <Wrench className="w-3.5 h-3.5" />
                    إصلاح
                  </>
                )}
              </Button>

              {/* Download with warnings */}
              {hasWarnings && (
                <Button
                  variant="outline"
                  onClick={handleDownloadWithWarnings}
                  disabled={isExporting || isRepairing || exportDone}
                  className="flex-1 gap-1.5 text-xs text-amber-600 border-amber-300/60 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700/40 dark:hover:bg-amber-900/20"
                  size="sm"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  تنزيل مع تحذيرات
                </Button>
              )}
            </div>
          </div>

          {/* Gates status summary */}
          <div className="flex items-center justify-center gap-1.5 mt-3">
            {gatesPassed ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                <span className="text-[10px] text-success font-medium">جميع بوابات التحقق اجتازت</span>
              </>
            ) : (
              <>
                <XCircle className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[10px] text-amber-600 font-medium">
                  {warnings.length} تحذير — راجع قبل التصدير
                </span>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── PreviewPanelController ───────────────────────────────────────────────────
// A controller hook/component to auto-wire PreviewPanel to the store

interface PreviewPanelControllerProps {
  artifactId: string;
  onClose: () => void;
}

export function PreviewPanelController({ artifactId, onClose }: PreviewPanelControllerProps) {
  const messages = useCanvasStore((s) => s.messages);

  // Find artifact and evidence from messages
  const { artifact, evidenceData } = (() => {
    let foundArtifact: ArtifactResult | undefined;
    let foundEvidence: EvidenceData | undefined;

    for (const msg of messages) {
      if (!msg.cards) continue;
      for (const card of msg.cards) {
        if (card.type === 'result' && card.artifact?.id === artifactId) {
          foundArtifact = card.artifact;
        }
        if (card.type === 'evidence' && card.evidenceData?.evidenceId === foundArtifact?.evidenceId) {
          foundEvidence = card.evidenceData;
        }
      }
    }
    return { artifact: foundArtifact, evidenceData: foundEvidence };
  })();

  if (!artifact) return null;

  return (
    <PreviewPanel
      artifact={artifact}
      evidenceData={evidenceData}
      onClose={onClose}
      onExport={(id) => {
        console.info('Export confirmed for artifact:', id);
        setTimeout(onClose, 1000);
      }}
      onRepair={(id) => {
        console.info('Repair requested for artifact:', id);
        onClose();
      }}
    />
  );
}
