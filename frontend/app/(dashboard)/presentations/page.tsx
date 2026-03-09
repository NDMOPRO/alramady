"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Clock3,
  FilePlus2,
  Loader2,
  Presentation,
  Sparkles,
  Wand2,
} from "lucide-react";
import EmbeddedRasidAssistant, {
  type EmbeddedAssistantAction,
} from "@/components/assistant/EmbeddedRasidAssistant";
import CompactSurfaceHeader from "@/components/layout/CompactSurfaceHeader";
import {
  createPresentation,
  fetchPresentations,
  generatePresentationFromAi,
  generatePresentationFromSource,
  type AiGeneratePayload,
  type Presentation as PresentationRecord,
  type SourcePresentationPayload,
} from "@/lib/api/presentation";

type GenerationMode = "source" | "ai";

const statusLabels: Record<PresentationRecord["status"], string> = {
  draft: "مسودة",
  published: "منشور",
  archived: "مؤرشف",
};

const styleOptions = [
  { value: "professional", label: "احترافي" },
  { value: "executive", label: "تنفيذي" },
  { value: "minimal", label: "مبسّط" },
  { value: "analytical", label: "تحليلي" },
] as const;

export default function PresentationsWorkspacePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [generationMode, setGenerationMode] = React.useState<GenerationMode>("source");
  const [brief, setBrief] = React.useState("");
  const [slideCount, setSlideCount] = React.useState("5");
  const [style, setStyle] = React.useState("professional");
  const [language, setLanguage] = React.useState("ar");
  const [targetAudience, setTargetAudience] = React.useState("");
  const [blankTitle, setBlankTitle] = React.useState("");
  const [submissionError, setSubmissionError] = React.useState("");
  const [latestResult, setLatestResult] = React.useState<PresentationRecord | null>(null);

  const presentationsQuery = useQuery({
    queryKey: ["presentations", "workspace"],
    queryFn: () => fetchPresentations({ page: 1, limit: 20 }),
  });

  const generationMutation = useMutation({
    mutationFn: async () => {
      const normalizedSlideCount = Number.parseInt(slideCount, 10);

      if (!brief.trim()) {
        throw new Error("محتوى التوليد مطلوب.");
      }

      if (!Number.isFinite(normalizedSlideCount) || normalizedSlideCount < 1) {
        throw new Error("عدد الشرائح غير صالح.");
      }

      const commonPayload = {
        slideCount: normalizedSlideCount,
        style,
        language,
      };

      if (generationMode === "source") {
        const payload: SourcePresentationPayload = {
          content: brief.trim(),
          targetAudience: targetAudience.trim() || undefined,
          ...commonPayload,
        };

        return generatePresentationFromSource(payload);
      }

      const payload: AiGeneratePayload = {
        text: brief.trim(),
        ...commonPayload,
      };

      return generatePresentationFromAi(payload);
    },
    onSuccess: async (presentation) => {
      setLatestResult(presentation);
      setSubmissionError("");
      await queryClient.invalidateQueries({ queryKey: ["presentations", "workspace"] });
      router.push(`/presentations/${presentation.id}`);
    },
    onError: (error) => {
      setSubmissionError(error instanceof Error ? error.message : "فشل إنشاء العرض.");
    },
  });

  const blankCreationMutation = useMutation({
    mutationFn: async () => {
      if (!blankTitle.trim()) {
        throw new Error("اسم العرض مطلوب.");
      }

      return createPresentation({ name: blankTitle.trim() });
    },
    onSuccess: async (presentation) => {
      setLatestResult(presentation);
      setSubmissionError("");
      setBlankTitle("");
      await queryClient.invalidateQueries({ queryKey: ["presentations", "workspace"] });
      router.push(`/presentations/${presentation.id}`);
    },
    onError: (error) => {
      setSubmissionError(error instanceof Error ? error.message : "فشل إنشاء العرض الفارغ.");
    },
  });

  const presentations = presentationsQuery.data?.data || [];
  const totalSlides = presentations.reduce((sum, item) => sum + item.slideCount, 0);
  const latestUpdated = presentations[0]?.updatedAt;
  const assistantActions = React.useMemo<EmbeddedAssistantAction[]>(
    () => [
      {
        id: "refresh-presentations",
        label: "تحديث العروض",
        description: "يعيد قراءة قائمة العروض الحية من presentation-service.",
        keywords: ["تحديث العروض", "حدث العروض", "اعد تحميل العروض", "جدد العروض"],
        run: async () => {
          const result = await presentationsQuery.refetch();
          const items = result.data?.data ?? [];
          const slides = items.reduce((sum, item) => sum + item.slideCount, 0);
          return {
            message: `تم تحديث قائمة العروض. يوجد الآن ${items.length} عرض بإجمالي ${slides} شريحة.`,
            chips: [`العروض ${items.length}`, `الشرائح ${slides}`],
          };
        },
      },
      {
        id: "generate-current-presentation",
        label: "ولّد العرض الحالي",
        description: "يشغل نمط التوليد الحالي عبر المسار الحقيقي المختار في الصفحة.",
        keywords: ["ولد العرض", "انشئ العرض", "توليد العرض", "شغل التوليد"],
        run: async () => {
          await generationMutation.mutateAsync();
          return {
            message: `تم تمرير طلب توليد العرض عبر نمط ${generationMode === "source" ? "المصدر" : "الذكاء الاصطناعي"}.`,
            chips: [generationMode === "source" ? "من المصدر" : "من الذكاء الاصطناعي", `${slideCount} شريحة`],
          };
        },
      },
      {
        id: "create-blank-presentation",
        label: "أنشئ عرضًا فارغًا",
        description: "ينشئ عرضًا حقيقيًا جديدًا عبر presentation-service.",
        keywords: ["عرض فارغ", "انشئ عرض فارغ", "عرض جديد"],
        run: async () => {
          await blankCreationMutation.mutateAsync();
          return {
            message: "تم تمرير طلب إنشاء عرض فارغ إلى presentation-service.",
            chips: [blankTitle.trim() || "عنوان العرض الحالي"],
          };
        },
      },
      {
        id: "open-latest-presentation",
        label: "افتح أحدث عرض",
        description: "ينقلك إلى أحدث عرض ظاهر في السطح الحالي.",
        keywords: ["افتح احدث عرض", "احدث عرض", "افتح العرض الاخير"],
        run: async () => {
          const latestPresentation = latestResult ?? presentations[0] ?? null;
          if (!latestPresentation) {
            throw new Error("لا يوجد عرض متاح للفتح.");
          }

          router.push(`/presentations/${latestPresentation.id}`);
          return {
            message: `يتم فتح العرض ${latestPresentation.name}.`,
            chips: [`${latestPresentation.slideCount} شريحة`],
          };
        },
      },
    ],
    [
      blankCreationMutation,
      blankTitle,
      generationMode,
      generationMutation,
      latestResult,
      presentations,
      presentationsQuery,
      router,
      slideCount,
      totalSlides,
    ]
  );

  return (
    <div className="rased-surface-page" dir="rtl">
      <CompactSurfaceHeader
        badge="العروض"
        title="أنشئ العرض ثم افتحه"
        description="اختر مسار إنشاء واحد، واحتفظ بالقائمة الحالية كمرجع ثانوي فقط."
        accentClassName="border-sky-200 bg-sky-50 text-sky-800"
        metrics={[
          { label: "العروض", value: String(presentations.length) },
          { label: "الشرائح", value: String(totalSlides) },
          { label: "آخر تحديث", value: latestUpdated ? new Date(latestUpdated).toLocaleDateString("ar-SA") : "لا يوجد" },
        ]}
      />

      <EmbeddedRasidAssistant
        surfaceId="presentations"
        surfaceName="العروض التقديمية"
        route="/presentations"
        intro="أتعرف على نمط التوليد الحالي والعرض الأحدث، وأشغّل الإنشاء أو التوليد الفعلي من نفس السطح."
        contextSummary={
          presentations.length > 0
            ? `يوجد ${presentations.length} عرض، وآخر نتيجة معروفة هي ${latestResult?.name ?? presentations[0]?.name ?? "غير متاحة"}.`
            : "لا توجد عروض حالية بعد، ويمكنني تشغيل التوليد الحالي أو إنشاء عرض فارغ."
        }
        contextItems={[
          { label: "العروض", value: String(presentations.length) },
          { label: "الشرائح", value: String(totalSlides) },
          { label: "النمط الحالي", value: generationMode === "source" ? "من المصدر" : "ذكاء اصطناعي" },
          { label: "آخر عرض", value: (latestResult ?? presentations[0])?.name ?? "لا يوجد" },
        ]}
        actions={assistantActions}
        suggestedPrompts={[
          "ماذا يمكنك أن تفعل هنا؟",
          "ولّد العرض الحالي",
          "أنشئ عرضًا فارغًا",
          "افتح أحدث عرض",
        ]}
      />

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.9fr]">
        <div className="rased-panel rased-motion-stagger-1">
          <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 dark:border-gray-700">
            <div className="flex items-center gap-2 text-gray-900 dark:text-white">
              <Sparkles className="h-5 w-5 text-sky-600" />
              <h2 className="text-lg font-black">توليد عرض حقيقي</h2>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              اختر بين التوليد من المصدر أو التوليد الذكي. كلا الخيارين ينشئ عرضًا حقيقيًا في Postgres.
            </p>
          </div>

          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setGenerationMode("source")}
                className={`rounded-2xl border px-4 py-3 text-right transition ${
                  generationMode === "source"
                    ? "border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-400 dark:bg-sky-500/10 dark:text-sky-200"
                    : "border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300"
                }`}
                data-testid="presentations-source-mode"
              >
                <div className="flex items-center gap-2 font-bold">
                  <Wand2 className="h-4 w-4" />
                  <span>توليد من المصدر</span>
                </div>
                <p className="mt-2 text-xs">`POST /api/v1/presentation/source/from-text`</p>
              </button>

              <button
                type="button"
                onClick={() => setGenerationMode("ai")}
                className={`rounded-2xl border px-4 py-3 text-right transition ${
                  generationMode === "ai"
                    ? "border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-400 dark:bg-sky-500/10 dark:text-sky-200"
                    : "border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300"
                }`}
                data-testid="presentations-ai-mode"
              >
                <div className="flex items-center gap-2 font-bold">
                  <Bot className="h-4 w-4" />
                  <span>توليد ذكي</span>
                </div>
                <p className="mt-2 text-xs">`POST /api/v1/presentation/ai/generate-from-text`</p>
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">النص أو الموجز</label>
              <textarea
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                rows={8}
                placeholder="أدخل المحتوى المطلوب تحويله إلى عرض تقديمي..."
                className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 focus:border-sky-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                data-testid="presentations-brief"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">عدد الشرائح</label>
                <input
                  value={slideCount}
                  onChange={(event) => setSlideCount(event.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  inputMode="numeric"
                  data-testid="presentations-slide-count"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">النمط</label>
                <select
                  value={style}
                  onChange={(event) => setStyle(event.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  data-testid="presentations-style"
                >
                  {styleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">اللغة</label>
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  data-testid="presentations-language"
                >
                  <option value="ar">ar</option>
                  <option value="en">en</option>
                </select>
              </div>
            </div>

            {generationMode === "source" && (
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">الجمهور المستهدف</label>
                <input
                  value={targetAudience}
                  onChange={(event) => setTargetAudience(event.target.value)}
                  placeholder="مثال: الإدارة التنفيذية"
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  data-testid="presentations-target-audience"
                />
              </div>
            )}

            {submissionError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
                {submissionError}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => generationMutation.mutate()}
                disabled={generationMutation.isPending}
                className="rased-action-accent"
                data-testid="presentations-generate-submit"
              >
                {generationMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                <span>{generationMode === "source" ? "إنشاء من المصدر" : "إنشاء عبر AI"}</span>
              </button>

              {latestResult && (
                <button
                  type="button"
                  onClick={() => router.push(`/presentations/${latestResult.id}`)}
                  className="rased-action-secondary"
                  data-testid="presentations-open-latest"
                >
                  <Presentation className="h-4 w-4" />
                  <span>فتح آخر عرض</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <section className="rased-panel rased-motion-stagger-2">
            <div className="flex items-center gap-2 text-gray-900 dark:text-white">
              <FilePlus2 className="h-5 w-5 text-sky-600" />
              <h2 className="text-lg font-black">إنشاء عرض فارغ</h2>
            </div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              `POST /api/v1/presentation/presentations`
            </p>

            <div className="mt-4 space-y-3">
              <input
                value={blankTitle}
                onChange={(event) => setBlankTitle(event.target.value)}
                placeholder="اسم العرض"
                className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-sky-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                data-testid="presentations-blank-title"
              />
              <button
                type="button"
                onClick={() => blankCreationMutation.mutate()}
                disabled={blankCreationMutation.isPending}
                className="rased-action-secondary w-full"
                data-testid="presentations-create-blank"
              >
                {blankCreationMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
                <span>إنشاء عرض فارغ</span>
              </button>
            </div>
          </section>

          <details className="rased-details">
            <summary className="rased-summary">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-gray-900 dark:text-white">العروض الحالية</h2>
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{presentations.length} عنصر</span>
            </div>
            </summary>

            {presentationsQuery.isLoading && (
              <div className="mt-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>جاري تحميل العروض...</span>
              </div>
            )}

            {presentationsQuery.isError && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
                تعذر تحميل بيانات العروض من الـ API.
              </div>
            )}

            {!presentationsQuery.isLoading && presentations.length === 0 && (
              <div className="mt-4 rounded-2xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                لا توجد عروض حالية بعد.
              </div>
            )}

            <div className="mt-4 space-y-3" data-testid="presentations-list">
              {presentations.map((presentation) => (
                <button
                  key={presentation.id}
                  type="button"
                  onClick={() => router.push(`/presentations/${presentation.id}`)}
                  className="flex w-full items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-right transition hover:border-sky-300 hover:bg-sky-50/70 dark:border-gray-700 dark:bg-gray-900/40 dark:hover:border-sky-700 dark:hover:bg-sky-950/20"
                  data-testid={`presentation-item-${presentation.id}`}
                >
                  <div className="space-y-1">
                    <p className="font-bold text-gray-900 dark:text-white">{presentation.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {presentation.slideCount} شرائح
                    </p>
                    <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <Clock3 className="h-3 w-3" />
                      <span>{new Date(presentation.updatedAt).toLocaleString("ar-SA")}</span>
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-sky-700 shadow-sm dark:bg-gray-800 dark:text-sky-200">
                    {statusLabels[presentation.status]}
                  </span>
                </button>
              ))}
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}
