"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  Loader2,
  PlusSquare,
  RefreshCcw,
  Table2,
  Upload,
} from "lucide-react";
import FileUploader from "@/components/ui/FileUploader";
import {
  createSpreadsheetWorkbook,
  downloadSpreadsheetWorkbook,
  listSpreadsheetWorkbooks,
  openSpreadsheetWorkbook,
  type SpreadsheetWorkbookSummary,
} from "@/lib/api/excel";
import { convertCsvToExcel } from "@/lib/api/conversion";

function baseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "");
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function toWorkbookFile(file: File, blob: Blob) {
  return new File([blob], `${baseName(file.name)}.xlsx`, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    lastModified: Date.now(),
  });
}

type Notice = {
  tone: "neutral" | "success" | "error";
  title: string;
  body: string;
};

const defaultNotice: Notice = {
  tone: "neutral",
  title: "استوديو Excel الحقيقي",
  body: "ارفع ملف XLSX/XLS مباشرة، أو ملف CSV وسيحوّله راصد إلى XLSX ثم يفتحه داخل excel-service.",
};

export default function ExcelWorkspacePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [blankTitle, setBlankTitle] = React.useState("");
  const [notice, setNotice] = React.useState<Notice>(defaultNotice);
  const [busyWorkbookId, setBusyWorkbookId] = React.useState<string | null>(null);

  const workbooksQuery = useQuery({
    queryKey: ["excel-workspace", "workbooks"],
    queryFn: () => listSpreadsheetWorkbooks({ page: 1, limit: 20 }),
  });

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const created: Array<{ id: string; name: string; sheets: number }> = [];

      for (const file of files) {
        const lower = file.name.toLowerCase();
        const workbookFile =
          lower.endsWith(".csv") ? toWorkbookFile(file, await convertCsvToExcel(file)) : file;
        const opened = await openSpreadsheetWorkbook(workbookFile);
        created.push({
          id: opened.id,
          name: opened.name,
          sheets: opened.sheets.length,
        });
      }

      return created;
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["excel-workspace", "workbooks"] });
      const last = created[created.length - 1];
      setNotice({
        tone: "success",
        title: "تم فتح المصنف فعليًا",
        body: `تم إنشاء ${created.length} مصنف داخل excel-service. آخر مصنف هو ${last.name} ويحتوي على ${last.sheets} ورقة.`,
      });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "تعذر فتح الملف داخل excel-service.";
      setNotice({
        tone: "error",
        title: "فشل تشغيل Excel",
        body: message,
      });
    },
  });

  const createBlankMutation = useMutation({
    mutationFn: async () => {
      const name = blankTitle.trim();
      if (!name) {
        throw new Error("اسم المصنف مطلوب.");
      }

      return createSpreadsheetWorkbook({
        name,
        sheets: [{ name: "الورقة 1", data: [] }],
      });
    },
    onSuccess: async (result) => {
      setBlankTitle("");
      await queryClient.invalidateQueries({ queryKey: ["excel-workspace", "workbooks"] });
      setNotice({
        tone: "success",
        title: "تم إنشاء مصنف جديد",
        body: `أُنشئ المصنف ${result.name} داخل excel-service ويمكن تنزيله الآن أو متابعته من مسارات المنصة.`,
      });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "تعذر إنشاء مصنف جديد.";
      setNotice({
        tone: "error",
        title: "فشل إنشاء المصنف",
        body: message,
      });
    },
  });

  const handleDownload = async (workbook: SpreadsheetWorkbookSummary) => {
    try {
      setBusyWorkbookId(workbook.id);
      const blob = await downloadSpreadsheetWorkbook(workbook.id);
      triggerBlobDownload(blob, `${workbook.name}.xlsx`);
      setNotice({
        tone: "success",
        title: "تم تنزيل المصنف",
        body: `تم تصدير المصنف ${workbook.name} من excel-service بصيغة XLSX.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر تنزيل المصنف.";
      setNotice({
        tone: "error",
        title: "فشل التنزيل",
        body: message,
      });
    } finally {
      setBusyWorkbookId(null);
    }
  };

  const workbooks = workbooksQuery.data?.data ?? [];
  const workbookCount = workbooks.length;
  const totalSheets = workbooks.reduce((sum, workbook) => sum + workbook.sheets.length, 0);

  return (
    <div className="space-y-6" dir="rtl">
      <section className="rased-hero-shell overflow-hidden px-6 py-8 lg:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold text-white/90">
              <FileSpreadsheet className="h-4 w-4" />
              <span>توليد وإدارة مصنفات Excel</span>
            </div>
            <h1 className="mt-4 text-3xl font-black text-white lg:text-4xl">استوديو Excel</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/80">
              هذا المسار يعمل الآن على excel-service الحقيقي. رفع XLSX/XLS يفتح المصنف مباشرة، ورفع CSV يحوله راصد أولًا إلى XLSX ثم يرسله إلى المحرك نفسه.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-white">
              <p className="text-2xl font-black">{workbookCount}</p>
              <p className="text-xs text-white/70">مصنفات فعلية</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-white">
              <p className="text-2xl font-black">{totalSheets}</p>
              <p className="text-xs text-white/70">إجمالي الأوراق</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <div className="rased-panel">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-700">
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">رفع مصنف حقيقي</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  يدعم XLSX وXLS مباشرة، وCSV عبر تحويل حقيقي إلى XLSX.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void workbooksQuery.refetch()}
                className="rased-chip"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                <span>تحديث</span>
              </button>
            </div>

            <div className="mt-5">
              <FileUploader
                maxFiles={10}
                maxSize={100 * 1024 * 1024}
                labelAr="أضف مصنفات أو ملفات CSV"
                descriptionAr="اسحب الملف أو اختره، وسيُفتح داخل excel-service الحقيقي."
                onUpload={async (files) => {
                  await uploadMutation.mutateAsync(files);
                }}
              />
            </div>
          </div>

          <div className="rased-panel">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white">
              <PlusSquare className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-black">إنشاء مصنف جديد</h2>
            </div>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              ينشئ مصنفًا جديدًا داخل excel-service من دون أي تخزين محلي بديل.
            </p>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                value={blankTitle}
                onChange={(event) => setBlankTitle(event.target.value)}
                placeholder="اسم المصنف"
                className="rased-field flex-1"
              />
              <button
                type="button"
                onClick={() => createBlankMutation.mutate()}
                disabled={createBlankMutation.isPending}
                className="rased-action-primary min-w-[180px]"
              >
                {createBlankMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusSquare className="h-4 w-4" />}
                <span>إنشاء مصنف</span>
              </button>
            </div>
          </div>

          <div className="rased-panel">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white">
              <Table2 className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-black">المصنفات الحالية</h2>
            </div>

            {workbooksQuery.isLoading ? (
              <div className="mt-5 flex items-center justify-center rounded-3xl border border-dashed border-slate-200 px-4 py-14 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : workbookCount === 0 ? (
              <div className="mt-5 rounded-3xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm leading-7 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                لا توجد مصنفات بعد. ارفع ملف Excel أو CSV وسيتحول إلى مصنف فعلي هنا.
              </div>
            ) : (
              <div className="mt-5 grid gap-3">
                {workbooks.map((workbook) => (
                  <article
                    key={workbook.id}
                    className="rounded-[26px] border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-900/40"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <h3 className="text-sm font-black text-slate-900 dark:text-white">{workbook.name}</h3>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {workbook.sheets.length} ورقة · {formatDate(workbook.createdAt)}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {workbook.sheets.slice(0, 4).map((sheet) => (
                            <span key={`${workbook.id}-${sheet.name}`} className="rased-chip">
                              {sheet.name}
                              {typeof sheet.rowCount === "number" ? ` · ${sheet.rowCount} صف` : ""}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleDownload(workbook)}
                          disabled={busyWorkbookId === workbook.id}
                          className="rased-action-secondary"
                        >
                          {busyWorkbookId === workbook.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                          <span>تنزيل XLSX</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => router.push("/home")}
                          className="rased-chip"
                        >
                          <ArrowLeft className="h-3.5 w-3.5" />
                          <span>متابعة من الرئيسية</span>
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-6">
          <section className="rased-panel">
            <div
              className={`rounded-[28px] border px-4 py-4 ${
                notice.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200"
                  : notice.tone === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200"
                    : "border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100"
              }`}
            >
              <p className="text-sm font-black">{notice.title}</p>
              <p className="mt-2 text-sm leading-7">{notice.body}</p>
            </div>
          </section>

          <section className="rased-panel">
            <h2 className="text-base font-black text-slate-900 dark:text-white">ما الذي يمكنك فعله بعد ذلك؟</h2>
            <div className="mt-4 grid gap-3">
              <button type="button" onClick={() => router.push("/home")} className="rased-action-secondary justify-between">
                <span>ابدأ من راصد الذكي</span>
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => router.push("/data")} className="rased-action-secondary justify-between">
                <span>افتح البيانات</span>
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => router.push("/analysis")} className="rased-action-secondary justify-between">
                <span>انتقل إلى التحليل</span>
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => router.push("/reports")} className="rased-action-secondary justify-between">
                <span>انتقل إلى التقارير</span>
                <ArrowLeft className="h-4 w-4" />
              </button>
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
