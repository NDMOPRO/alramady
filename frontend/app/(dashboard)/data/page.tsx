"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Cloud,
  Database,
  ExternalLink,
  FileText,
  Loader2,
  Presentation,
  RefreshCw,
  Sparkles,
  Upload,
} from "lucide-react";
import FileUploader from "@/components/ui/FileUploader";
import CompactSurfaceHeader from "@/components/layout/CompactSurfaceHeader";
import EmbeddedRasidAssistant, {
  type EmbeddedAssistantAction,
} from "@/components/assistant/EmbeddedRasidAssistant";
import {
  getConnectorAuthUrl,
  getConnectorConnections,
  getConnectorTypes,
  getDatasets,
  importDataset,
  type ConnectorConnection,
  type ConnectorTypeInfo,
  type Dataset,
} from "@/lib/api/data";

function formatBytes(size: number): string {
  if (!size) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const val = size / Math.pow(1024, idx);
  return `${val.toFixed(val >= 10 ? 0 : 1)} ${units[idx]}`;
}

export default function DataWorkspacePage() {
  const router = useRouter();

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [datasetsTotal, setDatasetsTotal] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadFeedback, setUploadFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [connectorTypes, setConnectorTypes] = useState<ConnectorTypeInfo[]>([]);
  const [connectorConnections, setConnectorConnections] = useState<ConnectorConnection[]>([]);
  const [connectorLoading, setConnectorLoading] = useState(true);
  const [connectingType, setConnectingType] = useState<string | null>(null);
  const [connectorFeedback, setConnectorFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    void loadDatasets();
    void loadConnectors();
  }, []);

  async function loadDatasets() {
    setLoading(true);
    try {
      const result = await getDatasets({ page: 1, pageSize: 10 });
      setDatasets(result.data);
      setDatasetsTotal(result.total);
      setLoadError(null);
      return {
        total: result.total,
        visible: result.data.length,
        latestDataset: result.data[0] ?? null,
      };
    } catch {
      setDatasets([]);
      setDatasetsTotal(0);
      setLoadError("تعذر تحميل مجموعات البيانات من خدمة البيانات.");
      return {
        total: 0,
        visible: 0,
        latestDataset: null,
      };
    } finally {
      setLoading(false);
    }
  }

  async function loadConnectors() {
    setConnectorLoading(true);
    const [typesResult, connectionsResult] = await Promise.allSettled([
      getConnectorTypes(),
      getConnectorConnections(),
    ]);

    if (typesResult.status === "fulfilled") {
      setConnectorTypes(typesResult.value);
    } else {
      setConnectorTypes([]);
    }

    if (connectionsResult.status === "fulfilled") {
      setConnectorConnections(connectionsResult.value);
    } else {
      setConnectorConnections([]);
    }

    if (typesResult.status === "rejected") {
      setConnectorFeedback({
        tone: "error",
        message:
          (typesResult.reason as Error)?.message ||
          "تعذر قراءة الموصلات السحابية من خدمة البيانات.",
      });
    } else {
      setConnectorFeedback(null);
    }

    setConnectorLoading(false);
    return {
      typeCount: typesResult.status === "fulfilled" ? typesResult.value.length : 0,
      connectionCount: connectionsResult.status === "fulfilled" ? connectionsResult.value.length : 0,
    };
  }

  async function handleConnectorAuth(type: string, name: string) {
    setConnectingType(type);
    setConnectorFeedback(null);
    try {
      const authUrl = await getConnectorAuthUrl(type);
      if (!authUrl) {
        throw new Error(`لم تُعد خدمة البيانات رابط ربط صالحًا لـ ${name}.`);
      }
      window.location.assign(authUrl);
    } catch (error) {
      setConnectorFeedback({
        tone: "error",
        message:
          (error as Error)?.message ||
          `تعذر بدء الربط الحقيقي مع ${name}.`,
      });
    } finally {
      setConnectingType(null);
    }
  }

  const totalDatasets = datasetsTotal;
  const visibleDatasets = datasets.length;
  const availableFormats = new Set(datasets.map((dataset) => dataset.format.toUpperCase())).size;
  const latestDatasets = datasets.slice(0, 8);
  const latestDataset = latestDatasets[0] ?? null;
  const priorityConnectorTypes = connectorTypes.filter((connector) =>
    ["google_drive", "onedrive", "dropbox"].includes(connector.type)
  );

  const assistantActions = useMemo<EmbeddedAssistantAction[]>(
    () => [
      {
        id: "refresh-datasets",
        label: "تحديث مجموعات البيانات",
        description: "يعيد قراءة القائمة الحية من خدمة البيانات.",
        keywords: ["تحديث", "حدث البيانات", "اعد التحميل", "جدد القائمة"],
        run: async () => {
          const snapshot = await loadDatasets();
          return {
            message: `تم تحديث قائمة البيانات. المجموع الحالي ${snapshot.total} مجموعة، والمعروض الآن ${snapshot.visible}.`,
            chips: [`الإجمالي ${snapshot.total}`, `المعروض ${snapshot.visible}`],
          };
        },
      },
      {
        id: "refresh-connectors",
        label: "تحديث الموصلات السحابية",
        description: "يعيد قراءة الموصلات والاتصالات الفعلية من خدمة البيانات.",
        keywords: ["الموصلات", "المصادر السحابيه", "حدث الموصلات", "ربط سحابي"],
        run: async () => {
          const snapshot = await loadConnectors();
          return {
            message: `تم تحديث الموصلات السحابية. يوجد الآن ${snapshot.typeCount} نوع و${snapshot.connectionCount} اتصال حي.`,
            chips: [`الأنواع ${snapshot.typeCount}`, `الاتصالات ${snapshot.connectionCount}`],
          };
        },
      },
      {
        id: "open-latest-dataset",
        label: "افتح أحدث مجموعة",
        description: "ينقلك إلى أحدث مجموعة بيانات ظاهرة في السطح الحالي.",
        keywords: ["احدث مجموعه", "افتح احدث", "افتح البيانات الاخيره", "اذهب لاحدث مجموعه"],
        run: async () => {
          if (!latestDataset) {
            throw new Error("لا توجد مجموعة بيانات جاهزة للفتح.");
          }

          router.push(`/data/${latestDataset.id}`);
          return {
            message: `يتم فتح المجموعة ${latestDataset.name} من المسار الحالي.`,
            chips: [latestDataset.format.toUpperCase(), `${latestDataset.rowCount} صف`],
          };
        },
      },
      {
        id: "open-library",
        label: "افتح المكتبة",
        description: "يفتح المكتبة لالتقاط أصل محفوظ ثم العودة للعمل على البيانات.",
        keywords: ["المكتبه", "افتح المكتبة", "اذهب الى المكتبه"],
        run: async () => {
          router.push("/library");
          return {
            message: "تم فتح Surface المكتبة من داخل Surface البيانات.",
          };
        },
      },
    ],
    [
      connectorConnections.length,
      connectorTypes.length,
      datasets.length,
      datasetsTotal,
      latestDataset,
      router,
    ]
  );

  return (
    <div className="rased-surface-page" dir="rtl">
      <CompactSurfaceHeader
        badge="البيانات"
        title="المصدر الحالي أولًا"
        description="ابدأ برفع الملف أو افتح أحدث مجموعة. بقية المسارات تظهر بعد اختيار المصدر نفسه."
        accentClassName="border-cyan-200 bg-cyan-50 text-cyan-800"
        metrics={[
          { label: "المجموعات", value: String(totalDatasets) },
          { label: "المعروض", value: String(visibleDatasets) },
          { label: "التنسيقات", value: String(availableFormats) },
        ]}
      />

      <EmbeddedRasidAssistant
        surfaceId="data"
        surfaceName="مساحة البيانات"
        route="/data"
        intro="أتعرف على سياق البيانات الحالي وأشغّل فقط ما هو متاح فعليًا في هذا السطح."
        contextSummary={
          latestDataset
            ? `توجد ${totalDatasets} مجموعة بيانات، وأحدث مجموعة هي ${latestDataset.name}، كما توجد ${connectorConnections.length} وصلة سحابية حيّة.`
            : `لا توجد مجموعات بيانات حالية، ويمكنني تحديث القائمة أو الموصلات أو فتح المكتبة.`
        }
        contextItems={[
          { label: "الإجمالي", value: String(totalDatasets) },
          { label: "المعروض", value: String(visibleDatasets) },
          { label: "الموصلات", value: String(connectorConnections.length) },
          { label: "آخر مجموعة", value: latestDataset?.name ?? "لا يوجد" },
        ]}
        actions={assistantActions}
        suggestedPrompts={[
          "ماذا يمكنك أن تفعل هنا؟",
          "حدّث البيانات",
          "حدّث الموصلات السحابية",
          "افتح أحدث مجموعة",
        ]}
      />

      <section className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <div className="rased-panel rased-motion-stagger-1">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">رفع واستقبال البيانات</h2>
              <button
                type="button"
                onClick={() => router.push("/data/import")}
                className="rased-action-accent text-xs"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>وضع الاستيراد المتقدم</span>
              </button>
            </div>
            <FileUploader
              maxFiles={30}
              maxSize={1024 * 1024 * 1024}
              labelAr="أضف ملفات إلى المكتبة المصدرية"
              descriptionAr="كل ملف جديد يُرسل مباشرة إلى خدمة البيانات ويصبح متاحًا فورًا عبر المنصة"
              onUpload={async (files) => {
                setUploading(true);
                setUploadFeedback(null);
                const successes: string[] = [];
                const failures: string[] = [];
                for (const file of files) {
                  try {
                    const ext = file.name.split(".").pop()?.toLowerCase() ?? "csv";
                    const format = ["xlsx", "xls"].includes(ext) ? "excel" : ext;
                    const result = await importDataset(format, file);
                    successes.push(`${file.name}: ${result.rowCount} صف، ${result.columnCount} عمود`);
                  } catch (error) {
                    const message =
                      (error as { response?: { data?: { error?: string; message?: string } } })
                        ?.response?.data?.error ||
                      (error as { response?: { data?: { error?: string; message?: string } } })
                        ?.response?.data?.message ||
                      "فشل رفع الملف إلى خدمة البيانات";
                    failures.push(`${file.name}: ${message}`);
                  }
                }
                setUploading(false);
                if (successes.length > 0) {
                  await loadDatasets();
                }
                setUploadFeedback({
                  tone: failures.length > 0 ? "error" : "success",
                  message: [...successes, ...failures].join(" | "),
                });
              }}
            />
            {uploading && (
              <div className="mt-2 flex items-center gap-2 text-xs text-cyan-600">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>جاري رفع الملفات إلى الخادم...</span>
              </div>
            )}
            {uploadFeedback && (
              <div className={`mt-2 text-xs ${
                uploadFeedback.tone === "success"
                  ? "rased-status-success"
                  : "rased-status-error"
              }`}>
                {uploadFeedback.message}
              </div>
            )}
            {loadError && (
              <div className="rased-status-error mt-2 text-xs">
                {loadError}
              </div>
            )}
          </div>

          <details className="rased-details rased-motion-stagger-2">
            <summary className="rased-summary">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">الخدمات السياقية المرتبطة بالمصدر</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  تظهر هنا فقط كمرجع سريع، بينما التنفيذ الفعلي يبدأ من المجموعة المحددة.
                </p>
              </div>
              {latestDataset && (
                <span className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>افتح أحدث مجموعة</span>
                </span>
              )}
            </summary>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => latestDataset && router.push(`/data/${latestDataset.id}`)}
                disabled={!latestDataset}
                className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-right transition hover:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700/40"
              >
                <div className="mb-2 inline-flex rounded-lg bg-cyan-100 p-2 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">
                  <Database className="h-4 w-4" />
                </div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">تحليل المصدر المحدد</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  من صفحة التفاصيل يظهر زر التحليل ويرسل `datasetId` إلى المحرك مباشرة.
                </p>
              </button>

              <button
                type="button"
                onClick={() => latestDataset && router.push(`/data/${latestDataset.id}`)}
                disabled={!latestDataset}
                className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-right transition hover:border-amber-300 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700/40"
              >
                <div className="mb-2 inline-flex rounded-lg bg-amber-100 p-2 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  <FileText className="h-4 w-4" />
                </div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">بناء تقرير فعلي</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  إنشاء أقسام التقرير وبناؤه يتم من صفحة نفس المجموعة وليس من بطاقة عامة.
                </p>
              </button>

              <button
                type="button"
                onClick={() => latestDataset && router.push(`/data/${latestDataset.id}`)}
                disabled={!latestDataset}
                className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-right transition hover:border-fuchsia-300 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700/40"
              >
                <div className="mb-2 inline-flex rounded-lg bg-fuchsia-100 p-2 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300">
                  <Presentation className="h-4 w-4" />
                </div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">توليد عرض وحفظ الوصفة</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  العرض والوصفة القابلة لإعادة الاستخدام يظهران بعد اختيار المجموعة نفسها.
                </p>
              </button>
            </div>
          </details>

          {!loading && datasets.length > 0 && (
          <div className="rased-panel">
              <h2 className="mb-3 text-base font-bold text-gray-900 dark:text-white">مجموعات البيانات</h2>
              <div className="space-y-2">
                {datasets.map((ds) => (
                  <button
                    key={ds.id}
                    type="button"
                    onClick={() => router.push(`/data/${ds.id}`)}
                    className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-right transition hover:border-cyan-300 dark:border-gray-600 dark:bg-gray-700/40"
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{ds.name}</p>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {ds.format} • {ds.rowCount} صف • {ds.columnCount} عمود • {formatBytes(ds.fileSize)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        ds.status === "active"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                          : ds.status === "processing"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                      }`}>
                        {ds.status === "active" ? "نشط" : ds.status === "processing" ? "قيد المعالجة" : ds.status}
                      </span>
                      <ExternalLink className="h-3.5 w-3.5 text-gray-400" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <details className="rased-details lg:col-span-2">
          <summary className="rased-summary">
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">الموصلات السحابية ومصادر التوسعة</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">معلومة ثانوية حتى تحتاج ربطًا فعليًا.</p>
            </div>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-bold text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
              {connectorConnections.length} ارتباط
            </span>
          </summary>
          <div className="mt-4">
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => void loadConnectors()}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>تحديث</span>
            </button>
          </div>

          {connectorLoading ? (
            <div className="flex items-center justify-center rounded-xl border border-dashed border-gray-300 px-4 py-10 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              <span>جار تحميل الموصلات من خدمة البيانات...</span>
            </div>
          ) : priorityConnectorTypes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
              لا توجد موصلات مفعلة في خدمة البيانات حاليًا.
            </div>
          ) : (
            <div className="space-y-2">
              {priorityConnectorTypes.map((connector) => {
                const activeConnection = connectorConnections.find(
                  (connection) => connection.connectorType === connector.type
                );
                return (
                  <div
                    key={connector.type}
                    className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-600 dark:bg-gray-700/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{connector.name}</p>
                        <p className="mt-1 text-xs leading-6 text-gray-500 dark:text-gray-400">
                          {connector.description}
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        activeConnection
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                      }`}>
                        {activeConnection ? "مرتبط" : "غير مرتبط"}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        <Cloud className="h-3.5 w-3.5" />
                        <span>{connector.authType}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleConnectorAuth(connector.type, connector.name)}
                        disabled={connectingType !== null}
                        className="inline-flex items-center gap-2 rounded-lg border border-cyan-200 px-3 py-2 text-xs font-bold text-cyan-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-900/50 dark:text-cyan-200 dark:hover:bg-gray-800"
                      >
                        {connectingType === connector.type ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ArrowLeft className="h-3.5 w-3.5" />
                        )}
                        <span>{activeConnection ? "إعادة فتح الربط" : "بدء الربط"}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {connectorFeedback && (
            <div className={`mt-4 rounded-xl px-3 py-2 text-xs ${
              connectorFeedback.tone === "success"
                ? "border border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-900/20 dark:text-green-300"
                : "border border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300"
            }`}>
              {connectorFeedback.message}
            </div>
          )}

          <button
            type="button"
            onClick={() => router.push("/library")}
            className="mt-4 inline-flex w-full items-center justify-center gap-1 rounded-xl border border-gray-300 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <span>فتح المكتبة الكاملة</span>
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          </div>
        </details>
      </section>
    </div>
  );
}
