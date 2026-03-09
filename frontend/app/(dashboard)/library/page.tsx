"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  Files,
  FolderOpen,
  LibraryBig,
  Loader2,
  Palette,
  PlayCircle,
  Presentation,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Waypoints,
} from "lucide-react";
import {
  deleteAsset,
  fetchAsset,
  fetchAssets,
  fetchFolders,
  type LibraryAsset,
  type LibraryFolder,
  uploadAsset,
} from "@/lib/api/library";
import { getAuthPayload } from "@/lib/api/client";
import {
  buildReportFromDataset,
  createPresentationThemeRecord,
  downloadLibraryAssetFile,
  createWorkflowDefinition,
  generatePresentationFromLibraryAsset,
  importDatasetFromLibraryAsset,
  readSavedRecipeAsset,
  saveReusableRecipeAsset,
  type SavedDataImportActionRecipe,
  type SavedPresentationActionRecipe,
  type SavedReusableRecipe,
  type SavedThemeRecipe,
  type SavedWorkflowRecipe,
} from "@/lib/api/library-reuse";
import EmbeddedRasidAssistant, {
  type EmbeddedAssistantAction,
} from "@/components/assistant/EmbeddedRasidAssistant";
import CompactSurfaceHeader from "@/components/layout/CompactSurfaceHeader";
import FileUploader from "@/components/ui/FileUploader";

type LastExecution =
  | { kind: "dataset" | "presentation" | "report" | "workflow"; title: string; summary: string; route: string; routeLabel: string };

function formatBytes(size: number): string {
  if (!size) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[idx]}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function buildSafeFileStem(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u0600-\u06ff_-]/g, "")
    .replace(/-+/g, "-");
}

function hasTag(asset: LibraryAsset, tag: string): boolean {
  return asset.tags.some((item) => item.toLowerCase() === tag.toLowerCase());
}

function isThemeAsset(asset: LibraryAsset): boolean {
  return hasTag(asset, "library-theme");
}

function isReusableActionAsset(asset: LibraryAsset): boolean {
  return hasTag(asset, "library-action") || hasTag(asset, "library-workflow");
}

function isDataImportCapable(asset: LibraryAsset): boolean {
  const extension = asset.extension?.toLowerCase();
  return ["csv", "xlsx", "xls", "json", "jsonl", "ndjson"].includes(extension);
}

function isPresentationCapable(asset: LibraryAsset): boolean {
  const extension = asset.extension?.toLowerCase();
  return [
    "pdf",
    "doc",
    "docx",
    "txt",
    "json",
    "csv",
    "md",
    "html",
    "htm",
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "pptx",
  ].includes(extension);
}

function decodeTenantId(): string {
  if (typeof window === "undefined") return "default";
  const payload = getAuthPayload();
  return String(payload?.tenantId || payload?.organizationId || "default");
}

function parseWorkflowSteps(input: string) {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [name, approverRole] = line.split("|").map((part) => part.trim());
      if (!name || !approverRole) {
        throw new Error("كل سطر في سير العمل يجب أن يكون بالشكل: اسم الخطوة|الدور");
      }
      return { name, approverRole, order: index };
    });
}

function FolderTree({
  folders,
  selectedFolderId,
  onSelect,
}: {
  folders: LibraryFolder[];
  selectedFolderId: string | null;
  onSelect: (folderId: string | null) => void;
}) {
  if (folders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
        لا توجد مجلدات محفوظة في خدمة المكتبة حتى الآن.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {folders.map((folder) => {
        const isActive = selectedFolderId === folder.id;
        return (
          <div key={folder.id} className="space-y-2">
            <button
              type="button"
              onClick={() => onSelect(isActive ? null : folder.id)}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-right text-sm transition ${
                isActive
                  ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
                  : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700/40 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
              data-testid={`library-folder-${folder.id}`}
            >
              <span className="inline-flex min-w-0 items-center gap-2">
                <FolderOpen className="h-4 w-4 shrink-0" />
                <span className="truncate">{folder.name}</span>
              </span>
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold dark:bg-gray-800">
                {folder.assetCount}
              </span>
            </button>
            {folder.children.length > 0 && (
              <div className="border-r border-gray-200 pr-3 dark:border-gray-700">
                <FolderTree
                  folders={folder.children}
                  selectedFolderId={selectedFolderId}
                  onSelect={onSelect}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function LibraryWorkspacePage() {
  const router = useRouter();
  const assetLoadRef = useRef<{ key: string; promise: Promise<LibraryAsset[] | void> | null; completedAt: number }>({
    key: "",
    promise: null,
    completedAt: 0,
  });
  const folderLoadRef = useRef<{ promise: Promise<LibraryFolder[] | void> | null; completedAt: number }>({
    promise: null,
    completedAt: 0,
  });
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<LibraryAsset | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [viewingAssetId, setViewingAssetId] = useState<string | null>(null);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [importingAssetId, setImportingAssetId] = useState<string | null>(null);
  const [generatingAssetId, setGeneratingAssetId] = useState<string | null>(null);
  const [runningRecipeAssetId, setRunningRecipeAssetId] = useState<string | null>(null);
  const [readingThemeAssetId, setReadingThemeAssetId] = useState<string | null>(null);
  const [creatingTheme, setCreatingTheme] = useState(false);
  const [creatingWorkflow, setCreatingWorkflow] = useState(false);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastExecution, setLastExecution] = useState<LastExecution | null>(null);
  const [lastSuccessfulRecipe, setLastSuccessfulRecipe] = useState<SavedReusableRecipe | null>(null);
  const [selectedThemeRecipe, setSelectedThemeRecipe] = useState<SavedThemeRecipe | null>(null);
  const [themeName, setThemeName] = useState("");
  const [themePrimaryColor, setThemePrimaryColor] = useState("#8b5cf6");
  const [themeSecondaryColor, setThemeSecondaryColor] = useState("#f8fafc");
  const [themeAccentColor, setThemeAccentColor] = useState("#f59e0b");
  const [themeBackgroundColor, setThemeBackgroundColor] = useState("#ffffff");
  const [themePrimaryFont, setThemePrimaryFont] = useState("Cairo");
  const [themeSecondaryFont, setThemeSecondaryFont] = useState("IBM Plex Sans Arabic");
  const [workflowName, setWorkflowName] = useState("اعتماد أصل مكتبي");
  const [workflowStepsText, setWorkflowStepsText] = useState("مراجعة أولية|manager\nاعتماد نهائي|admin");
  const [tenantId, setTenantId] = useState("default");

  const totalFolderCount = useMemo(() => {
    const stack = [...folders];
    let count = 0;
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;
      count += 1;
      stack.push(...current.children);
    }
    return count;
  }, [folders]);

  const normalAssets = useMemo(
    () => assets.filter((asset) => !isThemeAsset(asset) && !isReusableActionAsset(asset)),
    [assets]
  );
  const themeAssets = useMemo(() => assets.filter(isThemeAsset), [assets]);
  const reusableActionAssets = useMemo(() => assets.filter(isReusableActionAsset), [assets]);
  const latestAsset = normalAssets[0] ?? null;

  const loadFolders = useCallback(async (force = false) => {
    if (!force) {
      if (folderLoadRef.current.promise) {
        return folderLoadRef.current.promise;
      }
      if (Date.now() - folderLoadRef.current.completedAt < 1200) {
        return;
      }
    }

    const request = (async () => {
      setLoadingFolders(true);
      try {
        const nextFolders = await fetchFolders();
        setFolders(nextFolders);
        return nextFolders;
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "تعذر قراءة مجلدات المكتبة.");
        return [] as LibraryFolder[];
      } finally {
        setLoadingFolders(false);
        folderLoadRef.current.completedAt = Date.now();
      }
    })();

    folderLoadRef.current.promise = request;
    try {
      await request;
    } finally {
      if (folderLoadRef.current.promise === request) {
        folderLoadRef.current.promise = null;
      }
    }
  }, []);

  const loadAssets = useCallback(async (force = false) => {
    const requestKey = JSON.stringify({
      search: searchQuery || null,
      folderId: selectedFolderId || null,
    });

    if (!force) {
      if (assetLoadRef.current.promise && assetLoadRef.current.key === requestKey) {
        return assetLoadRef.current.promise;
      }
      if (
        assetLoadRef.current.key === requestKey &&
        Date.now() - assetLoadRef.current.completedAt < 1200
      ) {
        return;
      }
    }

    const request = (async () => {
      setLoadingAssets(true);
      try {
        const result = await fetchAssets({
          page: 1,
          limit: 100,
          search: searchQuery || undefined,
          folderId: selectedFolderId || undefined,
        });
        setAssets(result.data);
        setSelectedAsset((current) => {
          if (!current) return current;
          return result.data.find((asset) => asset.id === current.id) ?? null;
        });
        return result.data;
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "تعذر قراءة أصول المكتبة.");
        return [] as LibraryAsset[];
      } finally {
        setLoadingAssets(false);
        assetLoadRef.current.completedAt = Date.now();
      }
    })();

    assetLoadRef.current.key = requestKey;
    assetLoadRef.current.promise = request;
    try {
      await request;
    } finally {
      if (assetLoadRef.current.promise === request) {
        assetLoadRef.current.promise = null;
      }
    }
  }, [searchQuery, selectedFolderId]);

  useEffect(() => {
    setTenantId(decodeTenantId());
  }, []);

  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  const refreshAll = useCallback(async () => {
    setErrorMessage(null);
    const [nextAssets, nextFolders] = await Promise.all([loadAssets(true), loadFolders(true)]);
    return {
      assets: nextAssets,
      folders: nextFolders,
    };
  }, [loadAssets, loadFolders]);

  const handleUpload = useCallback(async (files: File[]) => {
    setUploading(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      for (const file of files) {
        await uploadAsset({ file });
      }
      await Promise.all([loadAssets(true), loadFolders(true)]);
      setStatusMessage(`تم حفظ ${files.length} ملف داخل خدمة المكتبة مع إمكانية إعادة استخدامه من هذه الصفحة.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "فشل رفع الملفات إلى خدمة المكتبة.";
      setErrorMessage(message);
      throw error;
    } finally {
      setUploading(false);
    }
  }, [loadAssets, loadFolders]);

  const handleInspectAsset = useCallback(async (assetId: string) => {
    setViewingAssetId(assetId);
    setErrorMessage(null);
    try {
      setSelectedAsset(await fetchAsset(assetId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "تعذر قراءة تفاصيل الأصل.");
    } finally {
      setViewingAssetId(null);
    }
  }, []);

  const handleOpenSelectedAsset = useCallback(async () => {
    if (!selectedAsset) return;
    setViewingAssetId(selectedAsset.id);
    setErrorMessage(null);
    try {
      const { asset, file } = await downloadLibraryAssetFile(selectedAsset.id);
      setSelectedAsset(asset);
      const objectUrl = URL.createObjectURL(file);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "تعذر فتح رابط الأصل.");
    } finally {
      setViewingAssetId(null);
    }
  }, [selectedAsset]);

  const handleDeleteAsset = useCallback(async (assetId: string) => {
    setDeletingAssetId(assetId);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await deleteAsset(assetId);
      if (selectedAsset?.id === assetId) {
        setSelectedAsset(null);
      }
      await Promise.all([loadAssets(true), loadFolders(true)]);
      setStatusMessage("تم حذف الأصل من خدمة المكتبة.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "تعذر حذف الأصل.");
    } finally {
      setDeletingAssetId(null);
    }
  }, [loadAssets, loadFolders, selectedAsset]);

  const handleSearchSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchQuery(searchInput.trim());
  }, [searchInput]);

  const handleImportSelectedAsset = useCallback(async () => {
    if (!selectedAsset) throw new Error("اختر أصلًا أولًا قبل الاستيراد إلى البيانات.");
    if (!isDataImportCapable(selectedAsset)) throw new Error("هذا النوع غير مدعوم لمسار استيراد البيانات.");

    setImportingAssetId(selectedAsset.id);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const result = await importDatasetFromLibraryAsset(selectedAsset.id);
      const recipe: SavedDataImportActionRecipe = {
        kind: "import-dataset-from-asset",
        version: 1,
        nameAr: `إعادة استيراد ${selectedAsset.name} إلى البيانات`,
        assetId: selectedAsset.id,
        assetName: selectedAsset.name,
        format: selectedAsset.extension || selectedAsset.mimeType,
        createdAt: new Date().toISOString(),
      };
      setLastSuccessfulRecipe(recipe);
      setLastExecution({
        kind: "dataset",
        title: "تم إنشاء مجموعة بيانات فعلية",
        summary: `تم استيراد الأصل ${selectedAsset.name} إلى data-service وإنشاء مجموعة البيانات ${result.name}.`,
        route: "/data",
        routeLabel: "افتح سطح البيانات",
      });
      setStatusMessage(`تم استيراد ${selectedAsset.name} إلى البيانات وإنشاء مجموعة بيانات فعلية.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر استيراد الأصل إلى البيانات.";
      setErrorMessage(message);
      throw error;
    } finally {
      setImportingAssetId(null);
    }
  }, [selectedAsset]);

  const handleGeneratePresentationFromSelectedAsset = useCallback(async () => {
    if (!selectedAsset) throw new Error("اختر أصلًا أولًا قبل إنشاء العرض.");
    if (!isPresentationCapable(selectedAsset)) throw new Error("هذا النوع غير مدعوم لمسار إنشاء العرض.");

    setGeneratingAssetId(selectedAsset.id);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const presentation = await generatePresentationFromLibraryAsset(
        selectedAsset.id,
        {
          slideCount: 8,
          style: "executive-arabic",
          language: "ar",
          targetAudience: "فرق الإدارة والتنفيذ",
          detailLevel: "standard",
        },
        selectedThemeRecipe?.theme
          ? {
              primaryColor: selectedThemeRecipe.theme.primaryColor,
              secondaryColor: selectedThemeRecipe.theme.secondaryColor,
              backgroundColor: selectedThemeRecipe.theme.backgroundColor,
              fontFamily: selectedThemeRecipe.theme.fontFamily,
            }
          : undefined
      );
      const recipe: SavedPresentationActionRecipe = {
        kind: "generate-presentation-from-asset",
        version: 1,
        nameAr: `إعادة توليد عرض من ${selectedAsset.name}`,
        assetId: selectedAsset.id,
        assetName: selectedAsset.name,
        options: {
          slideCount: 8,
          style: "executive-arabic",
          language: "ar",
          targetAudience: "فرق الإدارة والتنفيذ",
          detailLevel: "standard",
        },
        themeAssetId: selectedThemeRecipe?.presentationThemeId,
        theme: selectedThemeRecipe?.theme,
        createdAt: new Date().toISOString(),
      };
      setLastSuccessfulRecipe(recipe);
      setLastExecution({
        kind: "presentation",
        title: "تم إنشاء عرض فعلي",
        summary: `تم إنشاء العرض ${presentation.name} من الأصل ${selectedAsset.name} داخل presentation-service.`,
        route: "/presentations",
        routeLabel: "افتح سطح العروض",
      });
      setStatusMessage(
        selectedThemeRecipe
          ? `تم إنشاء عرض من ${selectedAsset.name} ثم تطبيق الثيم ${selectedThemeRecipe.nameAr}.`
          : `تم إنشاء عرض من ${selectedAsset.name} عبر presentation-service.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر إنشاء العرض من الأصل.";
      setErrorMessage(message);
      throw error;
    } finally {
      setGeneratingAssetId(null);
    }
  }, [selectedAsset, selectedThemeRecipe]);

  const handleSaveLastRecipe = useCallback(async () => {
    if (!lastSuccessfulRecipe) throw new Error("لا يوجد إجراء ناجح محفوظ حاليًا.");

    setSavingRecipe(true);
    setErrorMessage(null);
    try {
      const baseName =
        lastSuccessfulRecipe.kind === "governance-workflow-definition"
          ? lastSuccessfulRecipe.workflow.name
          : lastSuccessfulRecipe.nameAr;
      await saveReusableRecipeAsset(
        `${buildSafeFileStem(baseName) || "saved-action"}-${Date.now()}.json`,
        lastSuccessfulRecipe,
        {
          description: "وصفة تشغيل محفوظة من نجاح حقيقي داخل سطح المكتبة.",
          tags:
            lastSuccessfulRecipe.kind === "governance-workflow-definition"
              ? ["library-workflow", "library-action", "reusable"]
              : ["library-action", "reusable"],
        }
      );
      await loadAssets(true);
      setStatusMessage("تم حفظ الإجراء الناجح كأصل JSON فعلي داخل المكتبة.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر حفظ الإجراء الناجح.";
      setErrorMessage(message);
      throw error;
    } finally {
      setSavingRecipe(false);
    }
  }, [lastSuccessfulRecipe, loadAssets]);

  const handleCreateTheme = useCallback(async () => {
    const name = themeName.trim();
    if (!name) throw new Error("اسم الثيم مطلوب.");

    setCreatingTheme(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const themeRecord = await createPresentationThemeRecord({
        name,
        colors: [themePrimaryColor, themeSecondaryColor, themeAccentColor],
        fonts: [themePrimaryFont, themeSecondaryFont].filter(Boolean),
        backgrounds: [themeBackgroundColor],
      });
      const recipe: SavedThemeRecipe = {
        kind: "library-theme",
        version: 1,
        nameAr: name,
        presentationThemeId: themeRecord.id,
        theme: {
          primaryColor: themePrimaryColor,
          secondaryColor: themeSecondaryColor,
          backgroundColor: themeBackgroundColor,
          fontFamily: themePrimaryFont,
          accentColor: themeAccentColor,
        },
        createdAt: new Date().toISOString(),
      };
      await saveReusableRecipeAsset(
        `${buildSafeFileStem(name) || "theme"}-${Date.now()}.json`,
        recipe,
        {
          description: "ثيم عربي محفوظ في presentation-service ومفهرس داخل المكتبة.",
          tags: ["library-theme", "reusable", "presentation-theme"],
        }
      );
      await loadAssets(true);
      setSelectedThemeRecipe(recipe);
      setThemeName("");
      setStatusMessage(`تم حفظ الثيم ${name} في presentation-service ثم فهرسته داخل المكتبة.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر حفظ الثيم.";
      setErrorMessage(message);
      throw error;
    } finally {
      setCreatingTheme(false);
    }
  }, [
    loadAssets,
    themeAccentColor,
    themeBackgroundColor,
    themeName,
    themePrimaryColor,
    themePrimaryFont,
    themeSecondaryColor,
    themeSecondaryFont,
  ]);

  const handleSelectThemeAsset = useCallback(async (assetId: string) => {
    setReadingThemeAssetId(assetId);
    setErrorMessage(null);
    try {
      const { recipe } = await readSavedRecipeAsset<SavedThemeRecipe>(assetId);
      if (recipe.kind !== "library-theme") {
        throw new Error("الأصل المحدد لا يمثل ثيمًا صالحًا.");
      }
      setSelectedThemeRecipe(recipe);
      setStatusMessage(`تم تحميل الثيم ${recipe.nameAr} من أصل محفوظ فعليًا داخل المكتبة.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "تعذر قراءة الثيم المحفوظ.");
    } finally {
      setReadingThemeAssetId(null);
    }
  }, []);

  const handleCreateWorkflow = useCallback(async () => {
    const name = workflowName.trim();
    if (!name) throw new Error("اسم سير العمل مطلوب.");

    setCreatingWorkflow(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const steps = parseWorkflowSteps(workflowStepsText);
      const workflow = await createWorkflowDefinition({ name, tenantId, steps });
      const recipe: SavedWorkflowRecipe = {
        kind: "governance-workflow-definition",
        version: 1,
        nameAr: `إعادة إنشاء سير العمل ${name}`,
        workflow: { name, tenantId, steps },
        createdAt: new Date().toISOString(),
      };
      await saveReusableRecipeAsset(
        `${buildSafeFileStem(name) || "workflow"}-${Date.now()}.json`,
        recipe,
        {
          description: "سير عمل محفوظ في governance-service ومفهرس داخل المكتبة.",
          tags: ["library-workflow", "library-action", "reusable"],
        }
      );
      await loadAssets(true);
      setLastSuccessfulRecipe(recipe);
      setLastExecution({
        kind: "workflow",
        title: "تم إنشاء سير عمل حقيقي",
        summary: `تم تسجيل سير العمل ${workflow.name} داخل governance-service ثم حفظ وصفته في المكتبة.`,
        route: "/settings",
        routeLabel: "افتح سطح الإعدادات",
      });
      setStatusMessage(`تم إنشاء سير العمل ${workflow.name} ثم حفظ وصفته داخل المكتبة.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر إنشاء سير العمل.";
      setErrorMessage(message);
      throw error;
    } finally {
      setCreatingWorkflow(false);
    }
  }, [loadAssets, tenantId, workflowName, workflowStepsText]);

  const handleRunSavedRecipe = useCallback(async (assetId: string) => {
    setRunningRecipeAssetId(assetId);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const { recipe } = await readSavedRecipeAsset<SavedReusableRecipe>(assetId);
      if (recipe.kind === "import-dataset-from-asset") {
        const result = await importDatasetFromLibraryAsset(recipe.assetId);
        setLastExecution({
          kind: "dataset",
          title: "تم تشغيل وصفة استيراد محفوظة",
          summary: `أعادت المكتبة استيراد الأصل ${recipe.assetName} وإنشاء مجموعة البيانات ${result.name}.`,
          route: "/data",
          routeLabel: "افتح سطح البيانات",
        });
        setStatusMessage(`تم تشغيل الوصفة المحفوظة واستيراد ${recipe.assetName} إلى البيانات.`);
      } else if (recipe.kind === "generate-presentation-from-asset") {
        const presentation = await generatePresentationFromLibraryAsset(
          recipe.assetId,
          recipe.options,
          recipe.theme
            ? {
                primaryColor: recipe.theme.primaryColor,
                secondaryColor: recipe.theme.secondaryColor,
                backgroundColor: recipe.theme.backgroundColor,
                fontFamily: recipe.theme.fontFamily,
              }
            : undefined
        );
        setLastExecution({
          kind: "presentation",
          title: "تم تشغيل وصفة عرض محفوظة",
          summary: `أعادت المكتبة إنشاء العرض ${presentation.name} من الأصل ${recipe.assetName}.`,
          route: "/presentations",
          routeLabel: "افتح Surface العروض",
        });
        setStatusMessage(`تم تشغيل الوصفة المحفوظة وإنشاء عرض جديد من ${recipe.assetName}.`);
      } else if (recipe.kind === "generate-report-from-dataset") {
        const result = await buildReportFromDataset(
          recipe.datasetId,
          `${recipe.datasetName} - تقرير محفوظ`
        );
        setLastExecution({
          kind: "report",
          title: "تم تشغيل وصفة تقرير محفوظة",
          summary: `أعادت المكتبة إنشاء التقرير ${result.report.name} من المجموعة ${recipe.datasetName}.`,
          route: "/reports",
          routeLabel: "افتح Surface التقارير",
        });
        setStatusMessage(`تم تشغيل الوصفة المحفوظة وبناء تقرير جديد من ${recipe.datasetName}.`);
      } else if (recipe.kind === "governance-workflow-definition") {
        const workflow = await createWorkflowDefinition(recipe.workflow);
        setLastExecution({
          kind: "workflow",
          title: "تم تشغيل وصفة سير العمل",
          summary: `أعادت المكتبة إنشاء سير العمل ${workflow.name} عبر governance-service.`,
          route: "/settings",
          routeLabel: "افتح Surface الإعدادات",
        });
        setStatusMessage(`تم تشغيل وصفة سير العمل ${workflow.name} بنجاح.`);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "تعذر تشغيل الوصفة المحفوظة.");
    } finally {
      setRunningRecipeAssetId(null);
    }
  }, []);

  const assistantActions = useMemo<EmbeddedAssistantAction[]>(
    () => [
      {
        id: "refresh-library",
        label: "تحديث المكتبة",
        description: "يعيد قراءة الأصول والثيمات والوصفات من الخدمة.",
        keywords: ["حدث المكتبة", "تحديث المكتبه", "اعد تحميل المكتبه"],
        run: async () => {
          const snapshot = await refreshAll();
          const refreshedAssets = snapshot.assets ?? [];
          const nextNormalAssets = refreshedAssets.filter(
            (asset) => !isThemeAsset(asset) && !isReusableActionAsset(asset)
          );
          const nextThemeAssets = refreshedAssets.filter(isThemeAsset);
          const nextReusableAssets = refreshedAssets.filter(isReusableActionAsset);
          return {
            message: `تم تحديث Surface المكتبة. يوجد الآن ${nextNormalAssets.length} أصل تشغيل و${nextThemeAssets.length} ثيم و${nextReusableAssets.length} وصفة.`,
            chips: [`الأصول ${nextNormalAssets.length}`, `الثيمات ${nextThemeAssets.length}`, `الوصفات ${nextReusableAssets.length}`],
          };
        },
      },
      {
        id: "inspect-latest-asset",
        label: "اعرض أحدث أصل",
        description: "يقرأ تفاصيل أحدث أصل من الخدمة.",
        keywords: ["احدث اصل", "اعرض الاصل", "تفاصيل الاصل"],
        run: async () => {
          if (!latestAsset) throw new Error("لا يوجد أصل متاح لقراءته.");
          await handleInspectAsset(latestAsset.id);
          return {
            message: `تم تحميل تفاصيل الأصل ${latestAsset.name}.`,
            chips: [latestAsset.type, latestAsset.extension || latestAsset.mimeType],
          };
        },
      },
      {
        id: "import-selected-asset",
        label: "استورد الأصل المحدد إلى البيانات",
        description: "يشغل data-service على الأصل المحدد.",
        keywords: ["استورد الى البيانات", "حول الى البيانات"],
        run: async () => {
          await handleImportSelectedAsset();
          return { message: "تم تشغيل الاستيراد الحقيقي إلى البيانات." };
        },
      },
      {
        id: "generate-from-selected-asset",
        label: "أنشئ عرضًا من الأصل المحدد",
        description: "يشغل presentation-service على الأصل المحدد.",
        keywords: ["انشئ عرض", "عرض من الاصل", "بوربوينت من الاصل"],
        run: async () => {
          await handleGeneratePresentationFromSelectedAsset();
          return {
            message: selectedThemeRecipe
              ? `تم إنشاء عرض فعلي مع تطبيق الثيم ${selectedThemeRecipe.nameAr}.`
              : "تم إنشاء عرض فعلي من الأصل المحدد.",
          };
        },
      },
      {
        id: "save-last-action",
        label: "احفظ آخر إجراء ناجح",
        description: "يحفظ آخر نجاح كأصل JSON فعلي داخل المكتبة.",
        keywords: ["احفظ الاجراء", "احفظ الوصفه", "احفظ اخر نجاح"],
        run: async () => {
          await handleSaveLastRecipe();
          return { message: "تم حفظ آخر إجراء ناجح كأصل قابل لإعادة التشغيل." };
        },
      },
    ],
    [
      handleGeneratePresentationFromSelectedAsset,
      handleImportSelectedAsset,
      handleInspectAsset,
      handleSaveLastRecipe,
      latestAsset,
      normalAssets.length,
      refreshAll,
      reusableActionAssets.length,
      selectedThemeRecipe,
      themeAssets.length,
    ]
  );

  return (
    <div className="rased-surface-page" dir="rtl">
      <CompactSurfaceHeader
        badge="المكتبة"
        title="ابحث ثم أعد الاستخدام"
        description="الأصل الحالي هو محور العمل هنا. الثيمات والوصفات والمشهد التشغيلي تبقى ثانوية حتى تحتاجها."
        accentClassName="border-amber-200 bg-amber-50 text-amber-800"
        metrics={[
          { label: "الأصول", value: loadingAssets ? "..." : String(normalAssets.length) },
          { label: "الثيمات", value: loadingAssets ? "..." : String(themeAssets.length) },
          { label: "الوصفات", value: loadingAssets ? "..." : String(reusableActionAssets.length) },
          { label: "المجلدات", value: loadingFolders ? "..." : String(totalFolderCount) },
        ]}
      />
      <EmbeddedRasidAssistant
        surfaceId="library"
        surfaceName="المكتبة الذكية"
        route="/library"
        intro="أقرأ حالة الأصول والوصفات والثيمات الحالية وأشغّل فقط مسارات حقيقية متصلة بالمكتبة والبيانات والعروض والحوكمة."
        contextSummary={
          latestAsset
            ? `أحدث أصل تشغيلي هو ${latestAsset.name}، ويوجد ${themeAssets.length} ثيم محفوظ و${reusableActionAssets.length} وصفة قابلة لإعادة التشغيل.`
            : "لا توجد أصول تشغيل ظاهرة الآن."
        }
        contextItems={[
          { label: "الأصول", value: String(normalAssets.length) },
          { label: "الثيمات", value: String(themeAssets.length) },
          { label: "الوصفات", value: String(reusableActionAssets.length) },
          { label: "الأصل المحدد", value: selectedAsset?.name ?? "غير محدد" },
          { label: "الثيم النشط", value: selectedThemeRecipe?.nameAr ?? "بدون ثيم" },
        ]}
        actions={assistantActions}
        suggestedPrompts={["حدّث المكتبة", "اعرض أحدث أصل", "استورد الأصل المحدد إلى البيانات", "أنشئ عرضًا من الأصل المحدد"]}
      />

      <section className="rased-panel rased-motion-stagger-1" data-testid="library-upload-panel">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">رفع أصول جديدة</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              كل ملف يُرفع من هنا يُحفظ مباشرة في `library-service` وMinIO ثم يصبح قابلًا لإعادة الاستخدام الحقيقي.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshAll()}
            className="rased-action-secondary"
            data-testid="library-refresh-button"
          >
            {loadingAssets || loadingFolders || uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span>تحديث</span>
          </button>
        </div>
        <FileUploader
          maxFiles={10}
          maxSize={500 * 1024 * 1024}
          labelAr="ارفع ملفات إلى المحور القابل لإعادة الاستخدام"
          descriptionAr="اسحب الملفات هنا أو اخترها، ثم أعد استخدامها لاحقًا من نفس الصفحة في مسارات تشغيل حقيقية."
          onUpload={handleUpload}
        />
        {statusMessage && <div className="rased-status-success mt-4">{statusMessage}</div>}
        {errorMessage && <div className="rased-status-error mt-4">{errorMessage}</div>}
      </section>

      {lastExecution && (
        <section className="rased-panel-soft p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black text-emerald-800 dark:text-emerald-200">{lastExecution.title}</p>
              <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">{lastExecution.summary}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => router.push(lastExecution.route)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-800" data-testid="library-last-execution-route">
                <ArrowLeft className="h-4 w-4" />
                <span>{lastExecution.routeLabel}</span>
              </button>
              <button type="button" onClick={() => void handleSaveLastRecipe()} disabled={!lastSuccessfulRecipe || savingRecipe} className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 px-4 py-2 text-sm font-bold text-emerald-800 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-950/30" data-testid="library-save-last-recipe">
                {savingRecipe ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                <span>احفظ هذا النجاح كإجراء قابل لإعادة الاستخدام</span>
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <div className="rased-panel">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">الأصول المخزنة</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">القائمة أدناه مسترجعة من `GET /api/v1/library/assets` وتستثني ملفات الوصفات والثيمات المحفوظة.</p>
              </div>
              <form onSubmit={handleSearchSubmit} className="flex gap-2" data-testid="library-search-form">
                <div className="relative">
                  <Search className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="ابحث باسم الأصل أو وصفه" className="w-72 rounded-lg border border-gray-200 py-2 pl-3 pr-10 text-sm text-gray-700 outline-none transition focus:border-amber-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200" data-testid="library-search-input" />
                </div>
                <button type="submit" className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-700" data-testid="library-search-button">تطبيق</button>
              </form>
            </div>
            {loadingAssets ? (
              <div className="flex items-center justify-center rounded-xl border border-dashed border-gray-300 px-4 py-12 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400"><Loader2 className="ml-2 h-4 w-4 animate-spin" /><span>جار تحميل الأصول من الخدمة...</span></div>
            ) : normalAssets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 px-4 py-12 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">لا توجد أصول تشغيل تطابق المرشحات الحالية.</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {normalAssets.map((asset) => {
                  const isSelected = selectedAsset?.id === asset.id;
                  return (
                    <div key={asset.id} className={`rounded-2xl border px-4 py-3 transition ${isSelected ? "border-amber-300 bg-amber-50/70 dark:border-amber-700 dark:bg-amber-900/20" : "border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-700/40"}`} data-testid={`library-asset-${asset.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{asset.name}</p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{asset.type} • {formatBytes(asset.size)}</p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatDate(asset.createdAt)}</p>
                        </div>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700 dark:bg-gray-800 dark:text-amber-300">{asset.extension || asset.type}</span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button type="button" onClick={() => void handleInspectAsset(asset.id)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-white dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800" data-testid={`library-view-${asset.id}`}>
                          {viewingAssetId === asset.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                          <span>تفاصيل</span>
                        </button>
                        <button type="button" onClick={() => void handleDeleteAsset(asset.id)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-900/20" data-testid={`library-delete-${asset.id}`}>
                          {deletingAssetId === asset.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          <span>حذف</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rased-panel">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck className="h-4.5 w-4.5 text-indigo-600 dark:text-indigo-300" />
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">تفاصيل الأصل المحدد وإعادة استخدامه</h3>
            </div>
            {!selectedAsset ? (
              <div className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">اختر أصلًا من القائمة لقراءة التفاصيل الفعلية وتشغيله في البيانات أو العروض.</div>
            ) : (
              <div className="space-y-4" data-testid="library-selected-asset">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-700/40">
                  <p className="text-base font-bold text-gray-900 dark:text-white">{selectedAsset.name}</p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{selectedAsset.mimeType} • {formatBytes(selectedAsset.size)}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">أضيف في {formatDate(selectedAsset.createdAt)}</p>
                  {selectedAsset.description && <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">{selectedAsset.description}</p>}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-600"><p className="text-xs font-semibold text-gray-500 dark:text-gray-400">المجلد</p><p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{selectedAsset.folderId ?? "بدون مجلد"}</p></div>
                  <div className="rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-600"><p className="text-xs font-semibold text-gray-500 dark:text-gray-400">البصمة الرقمية</p><p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-white">{selectedAsset.checksum ?? "غير متاح"}</p></div>
                </div>
                {selectedAsset.thumbnailUrl && <img src={selectedAsset.thumbnailUrl} alt={selectedAsset.name} className="h-48 w-full rounded-2xl border border-gray-200 object-cover dark:border-gray-600" />}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void handleOpenSelectedAsset()} className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-amber-700" data-testid="library-open-selected-asset">
                    {viewingAssetId === selectedAsset.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                    <span>فتح الرابط الموقّع</span>
                  </button>
                  {isDataImportCapable(selectedAsset) && <button type="button" onClick={() => void handleImportSelectedAsset()} className="inline-flex items-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-bold text-sky-800 transition hover:bg-sky-100 dark:border-sky-900/50 dark:bg-sky-950/20 dark:text-sky-200" data-testid="library-import-selected-asset">{importingAssetId === selectedAsset.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Files className="h-4 w-4" />}<span>استيراد إلى البيانات</span></button>}
                  {isPresentationCapable(selectedAsset) && <button type="button" onClick={() => void handleGeneratePresentationFromSelectedAsset()} className="inline-flex items-center gap-2 rounded-xl border border-fuchsia-300 bg-fuchsia-50 px-4 py-2 text-sm font-bold text-fuchsia-800 transition hover:bg-fuchsia-100 dark:border-fuchsia-900/50 dark:bg-fuchsia-950/20 dark:text-fuchsia-200" data-testid="library-generate-presentation-from-asset">{generatingAssetId === selectedAsset.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Presentation className="h-4 w-4" />}<span>{selectedThemeRecipe ? `إنشاء عرض بالثيم ${selectedThemeRecipe.nameAr}` : "إنشاء عرض من الأصل"}</span></button>}
                </div>
                <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/70 p-4 dark:border-gray-600 dark:bg-gray-900/30">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">الوضع الحالي لإعادة الاستخدام</p>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{selectedThemeRecipe ? `الثيم النشط الآن هو ${selectedThemeRecipe.nameAr}.` : "لا يوجد ثيم نشط. يمكنك اختيار ثيم محفوظ من قسم الثيمات."}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-gray-700 dark:bg-gray-800 dark:text-gray-200">{isDataImportCapable(selectedAsset) ? "قابل للاستيراد إلى البيانات" : "ليس مسار بيانات"}</span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-gray-700 dark:bg-gray-800 dark:text-gray-200">{isPresentationCapable(selectedAsset) ? "قابل لتوليد عرض" : "ليس مسار عروض"}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <details className="rased-details" data-testid="library-theme-section">
              <summary className="rased-summary mb-4"><div className="flex items-center gap-2"><Palette className="h-4.5 w-4.5 text-fuchsia-600 dark:text-fuchsia-300" /><h3 className="text-sm font-bold text-gray-900 dark:text-white">الثيمات المحفوظة</h3></div><span className="rased-chip">{themeAssets.length}</span></summary>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1"><span className="text-xs font-semibold text-gray-500 dark:text-gray-400">اسم الثيم</span><input value={themeName} onChange={(event) => setThemeName(event.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-fuchsia-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" placeholder="ثيم العرض التنفيذي العربي" data-testid="library-theme-name" /></label>
                <label className="space-y-1"><span className="text-xs font-semibold text-gray-500 dark:text-gray-400">الخط الأساسي</span><input value={themePrimaryFont} onChange={(event) => setThemePrimaryFont(event.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-fuchsia-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" data-testid="library-theme-font" /></label>
                <label className="space-y-1"><span className="text-xs font-semibold text-gray-500 dark:text-gray-400">اللون الأساسي</span><input type="color" value={themePrimaryColor} onChange={(event) => setThemePrimaryColor(event.target.value)} className="h-11 w-full rounded-xl border border-gray-200 bg-white px-2 py-2 dark:border-gray-600 dark:bg-gray-900" data-testid="library-theme-primary-color" /></label>
                <label className="space-y-1"><span className="text-xs font-semibold text-gray-500 dark:text-gray-400">اللون الثانوي</span><input type="color" value={themeSecondaryColor} onChange={(event) => setThemeSecondaryColor(event.target.value)} className="h-11 w-full rounded-xl border border-gray-200 bg-white px-2 py-2 dark:border-gray-600 dark:bg-gray-900" data-testid="library-theme-secondary-color" /></label>
                <label className="space-y-1"><span className="text-xs font-semibold text-gray-500 dark:text-gray-400">لون التمييز</span><input type="color" value={themeAccentColor} onChange={(event) => setThemeAccentColor(event.target.value)} className="h-11 w-full rounded-xl border border-gray-200 bg-white px-2 py-2 dark:border-gray-600 dark:bg-gray-900" /></label>
                <label className="space-y-1"><span className="text-xs font-semibold text-gray-500 dark:text-gray-400">لون الخلفية</span><input type="color" value={themeBackgroundColor} onChange={(event) => setThemeBackgroundColor(event.target.value)} className="h-11 w-full rounded-xl border border-gray-200 bg-white px-2 py-2 dark:border-gray-600 dark:bg-gray-900" /></label>
              </div>
              <label className="mt-3 block space-y-1"><span className="text-xs font-semibold text-gray-500 dark:text-gray-400">الخط الثانوي</span><input value={themeSecondaryFont} onChange={(event) => setThemeSecondaryFont(event.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-fuchsia-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" /></label>
              <button type="button" onClick={() => void handleCreateTheme()} disabled={creatingTheme} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-fuchsia-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-fuchsia-800 disabled:cursor-not-allowed disabled:opacity-70" data-testid="library-create-theme">{creatingTheme ? <Loader2 className="h-4 w-4 animate-spin" /> : <Palette className="h-4 w-4" />}<span>حفظ ثيم فعلي قابل لإعادة الاستخدام</span></button>
              <div className="mt-5 space-y-3">
                {themeAssets.length === 0 ? <div className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">لا توجد ثيمات محفوظة داخل المكتبة حتى الآن.</div> : themeAssets.map((asset) => (
                  <div key={asset.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-700/40" data-testid={`library-theme-asset-${asset.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="text-sm font-bold text-gray-900 dark:text-white">{asset.name}</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatDate(asset.createdAt)}</p></div>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-fuchsia-700 dark:bg-gray-800 dark:text-fuchsia-300">ثيم</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => void handleSelectThemeAsset(asset.id)} className="inline-flex items-center gap-2 rounded-lg border border-fuchsia-200 px-3 py-2 text-xs font-semibold text-fuchsia-700 transition hover:bg-white dark:border-fuchsia-900/40 dark:text-fuchsia-200 dark:hover:bg-gray-800" data-testid={`library-load-theme-${asset.id}`}>{readingThemeAssetId === asset.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}<span>تفعيل هذا الثيم</span></button>
                    </div>
                  </div>
                ))}
              </div>
            </details>

            <details className="rased-details" data-testid="library-workflow-section">
              <summary className="rased-summary mb-4"><div className="flex items-center gap-2"><Waypoints className="h-4.5 w-4.5 text-sky-600 dark:text-sky-300" /><h3 className="text-sm font-bold text-gray-900 dark:text-white">الإجراءات وسير العمل المحفوظ</h3></div><span className="rased-chip">{reusableActionAssets.length}</span></summary>
              <label className="space-y-1"><span className="text-xs font-semibold text-gray-500 dark:text-gray-400">اسم سير العمل</span><input value={workflowName} onChange={(event) => setWorkflowName(event.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sky-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" data-testid="library-workflow-name" /></label>
              <label className="mt-3 block space-y-1"><span className="text-xs font-semibold text-gray-500 dark:text-gray-400">خطوات سير العمل</span><textarea value={workflowStepsText} onChange={(event) => setWorkflowStepsText(event.target.value)} className="min-h-32 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sky-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" data-testid="library-workflow-steps" /><span className="block text-[11px] text-gray-500 dark:text-gray-400">اكتب كل خطوة بالشكل: اسم الخطوة|الدور</span></label>
              <button type="button" onClick={() => void handleCreateWorkflow()} disabled={creatingWorkflow} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-70" data-testid="library-create-workflow">{creatingWorkflow ? <Loader2 className="h-4 w-4 animate-spin" /> : <Waypoints className="h-4 w-4" />}<span>إنشاء وحفظ سير عمل فعلي</span></button>
              <div className="mt-5 space-y-3">
                {reusableActionAssets.length === 0 ? <div className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">لا توجد وصفات محفوظة بعد. أي نجاح حقيقي يمكنك حفظه وإعادة تشغيله من هنا.</div> : reusableActionAssets.map((asset) => (
                  <div key={asset.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-700/40" data-testid={`library-action-asset-${asset.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="text-sm font-bold text-gray-900 dark:text-white">{asset.name}</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatDate(asset.createdAt)}</p></div>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-gray-800 dark:text-sky-300">{hasTag(asset, "library-workflow") ? "سير عمل" : "إجراء"}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => void handleRunSavedRecipe(asset.id)} className="inline-flex items-center gap-2 rounded-lg border border-sky-200 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-white dark:border-sky-900/40 dark:text-sky-200 dark:hover:bg-gray-800" data-testid={`library-run-recipe-${asset.id}`}>{runningRecipeAssetId === asset.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}<span>تشغيل الآن</span></button>
                      <button type="button" onClick={() => void handleInspectAsset(asset.id)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-white dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"><ExternalLink className="h-3.5 w-3.5" /><span>تفاصيل الأصل</span></button>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </div>
        </div>

        <aside className="space-y-4 lg:col-span-2">
          <details className="rased-details">
            <summary className="rased-summary mb-4"><h3 className="text-sm font-bold text-gray-900 dark:text-white">مجلدات المكتبة</h3>{selectedFolderId && <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">التصفية مفعلة</span>}</summary>
            <div className="mb-4 flex items-center justify-between">
              {selectedFolderId && <button type="button" onClick={() => setSelectedFolderId(null)} className="text-xs font-semibold text-amber-700 dark:text-amber-300">إلغاء التصفية</button>}
            </div>
            {loadingFolders ? <div className="flex items-center justify-center rounded-xl border border-dashed border-gray-300 px-4 py-10 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400"><Loader2 className="ml-2 h-4 w-4 animate-spin" /><span>جار تحميل المجلدات...</span></div> : <FolderTree folders={folders} selectedFolderId={selectedFolderId} onSelect={setSelectedFolderId} />}
          </details>

          <details className="rased-details">
            <summary className="mb-3 cursor-pointer list-none text-sm font-bold text-gray-900 dark:text-white">المشهد التشغيلي الحالي</summary>
            <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-600 dark:bg-gray-700/40"><p className="font-bold text-gray-900 dark:text-white">المستأجر النشط</p><p className="mt-1 text-xs">{tenantId}</p></div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-600 dark:bg-gray-700/40"><p className="font-bold text-gray-900 dark:text-white">الثيم المفعل</p><p className="mt-1 text-xs">{selectedThemeRecipe?.nameAr ?? "لم يتم اختيار ثيم بعد"}</p></div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-600 dark:bg-gray-700/40"><p className="font-bold text-gray-900 dark:text-white">آخر نجاح قابل للحفظ</p><p className="mt-1 text-xs">{lastSuccessfulRecipe ? lastSuccessfulRecipe.kind === "governance-workflow-definition" ? lastSuccessfulRecipe.workflow.name : lastSuccessfulRecipe.nameAr : "لا يوجد بعد"}</p></div>
            </div>
          </details>

          <details className="rased-details">
            <summary className="mb-3 cursor-pointer list-none text-sm font-bold text-gray-900 dark:text-white">فتح الأسطح المرتبطة</summary>
            <div className="space-y-2">
              <button type="button" onClick={() => router.push("/data")} className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"><span className="inline-flex items-center gap-2"><FolderOpen className="h-4 w-4" />سطح البيانات</span><ArrowLeft className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => router.push("/presentations")} className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"><span className="inline-flex items-center gap-2"><Presentation className="h-4 w-4" />سطح العروض</span><ArrowLeft className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => router.push("/settings")} className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"><span className="inline-flex items-center gap-2"><Waypoints className="h-4 w-4" />سطح الإعدادات</span><ArrowLeft className="h-3.5 w-3.5" /></button>
            </div>
          </details>
        </aside>
      </section>
    </div>
  );
}
