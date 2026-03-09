import { governanceApi, libraryApi, presentationApi } from "./client";
import {
  downloadAssetBlob,
  fetchAsset,
  type LibraryAsset,
  type UploadAssetPayload,
  uploadAsset,
} from "./library";
import {
  generatePresentationFromFile,
  type Presentation,
  type PresentationTheme,
} from "./presentation";
import {
  getDatasetById,
  getDatasetRows,
  importDataset,
  type ImportResult,
} from "./data";
import {
  addReportSection,
  buildReport,
  createReport,
  type Report,
  type ReportBuildResult,
} from "./reporting";

export interface SavedThemeRecipe {
  kind: "library-theme";
  version: 1;
  nameAr: string;
  theme: PresentationTheme & {
    accentColor?: string;
  };
  presentationThemeId?: string;
  createdAt: string;
}

export interface SavedPresentationActionRecipe {
  kind: "generate-presentation-from-asset";
  version: 1;
  nameAr: string;
  assetId: string;
  assetName: string;
  options: {
    slideCount?: number;
    style?: string;
    language?: string;
    targetAudience?: string;
    detailLevel?: "brief" | "standard" | "detailed";
  };
  themeAssetId?: string;
  theme?: SavedThemeRecipe["theme"];
  createdAt: string;
}

export interface SavedDataImportActionRecipe {
  kind: "import-dataset-from-asset";
  version: 1;
  nameAr: string;
  assetId: string;
  assetName: string;
  format: string;
  createdAt: string;
}

export interface SavedWorkflowRecipe {
  kind: "governance-workflow-definition";
  version: 1;
  nameAr: string;
  workflow: {
    name: string;
    tenantId: string;
    steps: Array<{
      name: string;
      approverRole: string;
      order: number;
    }>;
  };
  createdAt: string;
}

export interface SavedReportActionRecipe {
  kind: "generate-report-from-dataset";
  version: 1;
  nameAr: string;
  datasetId: string;
  datasetName: string;
  createdAt: string;
}

export type SavedReusableRecipe =
  | SavedThemeRecipe
  | SavedPresentationActionRecipe
  | SavedDataImportActionRecipe
  | SavedWorkflowRecipe
  | SavedReportActionRecipe;

interface ApiEnvelope<T> {
  success?: boolean;
  data: T;
}

export interface WorkflowDefinitionResponse {
  id: string;
  name: string;
  tenantId: string;
  steps: Array<{
    id?: string;
    name: string;
    approverRole: string;
    order: number;
  }>;
  createdAt?: string;
}

function unwrapData<T>(response: ApiEnvelope<T> | T): T {
  if (response && typeof response === "object" && "data" in response) {
    return (response as ApiEnvelope<T>).data;
  }

  return response as T;
}

function inferMimeTypeFromName(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "json":
      return "application/json";
    case "csv":
      return "text/csv";
    case "txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

async function fetchSignedAsset(assetId: string): Promise<LibraryAsset> {
  try {
    return await fetchAsset(assetId);
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status;
    if (status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 750));
      return fetchAsset(assetId);
    }

    throw error;
  }
}

export async function downloadLibraryAssetFile(assetId: string): Promise<{
  asset: LibraryAsset;
  file: File;
}> {
  const asset = await fetchSignedAsset(assetId);
  const blob = await downloadAssetBlob(assetId);
  const file = new File([blob], asset.name, {
    type: asset.mimeType || inferMimeTypeFromName(asset.name),
  });

  return { asset, file };
}

export async function readSavedRecipeAsset<T extends SavedReusableRecipe>(assetId: string): Promise<{
  asset: LibraryAsset;
  recipe: T;
}> {
  const asset = await fetchSignedAsset(assetId);

  const response = await libraryApi.get<Blob>(`/assets/${assetId}/download`, {
    responseType: "blob",
  });
  const text = await response.data.text();
  const recipe = JSON.parse(text) as T;
  return { asset, recipe };
}

export async function saveReusableRecipeAsset(
  fileName: string,
  recipe: SavedReusableRecipe,
  options?: Pick<UploadAssetPayload, "description" | "tags">
): Promise<LibraryAsset> {
  const file = new File([JSON.stringify(recipe, null, 2)], fileName, {
    type: "application/json",
  });

  return uploadAsset({
    file,
    description: options?.description,
    tags: options?.tags,
  });
}

export async function createPresentationThemeRecord(payload: {
  name: string;
  colors: string[];
  fonts: string[];
  backgrounds: string[];
}): Promise<{ id: string; name: string; theme: Record<string, unknown> }> {
  const response = await presentationApi.post<ApiEnvelope<{ id: string; name: string; theme: Record<string, unknown> }>>(
    "/themes",
    payload
  );
  return unwrapData(response.data);
}

export async function applyThemeToPresentationRecord(
  presentationId: string,
  theme: PresentationTheme
): Promise<{ presId: string; theme: PresentationTheme; updatedSlides: number }> {
  const response = await presentationApi.put<
    ApiEnvelope<{ presId: string; theme: PresentationTheme; updatedSlides: number }>
  >(`/presentations/${presentationId}/theme`, theme);
  return unwrapData(response.data);
}

export async function createWorkflowDefinition(payload: {
  name: string;
  tenantId: string;
  steps: Array<{
    name: string;
    approverRole: string;
    order: number;
  }>;
}): Promise<WorkflowDefinitionResponse> {
  const response = await governanceApi.post<ApiEnvelope<WorkflowDefinitionResponse>>("/workflows", payload);
  return unwrapData(response.data);
}

export async function importDatasetFromLibraryAsset(assetId: string): Promise<ImportResult> {
  const { file } = await downloadLibraryAssetFile(assetId);
  return importDataset(file.name.split(".").pop() || "file", file);
}

export async function generatePresentationFromLibraryAsset(
  assetId: string,
  options?: {
    slideCount?: number;
    style?: string;
    language?: string;
    targetAudience?: string;
    detailLevel?: "brief" | "standard" | "detailed";
  },
  theme?: PresentationTheme
): Promise<Presentation> {
  const { file } = await downloadLibraryAssetFile(assetId);
  const presentation = await generatePresentationFromFile(file, options);

  if (theme) {
    await applyThemeToPresentationRecord(presentation.id, theme);
    return {
      ...presentation,
      theme,
    };
  }

  return presentation;
}

export async function buildReportFromDataset(
  datasetId: string,
  reportName?: string
): Promise<{
  report: Report;
  build: ReportBuildResult;
  datasetName: string;
}> {
  const [datasetDetail, datasetRows] = await Promise.all([
    getDatasetById(datasetId),
    getDatasetRows(datasetId, { page: 1, pageSize: 20 }),
  ]);

  const report = await createReport({
    name: reportName?.trim() || `${datasetDetail.name} - تقرير`,
    templateId: null,
    dataSources: [{ datasetId }],
  });

  const columns = datasetDetail.columns.map((column) => column.name);
  const previewRows = datasetRows.data.map((row) =>
    columns.map((columnName) => {
      const value = row[columnName];
      if (value === null || value === undefined) return "";
      return String(value);
    })
  );

  await addReportSection(report.id, {
    type: "text",
    position: 0,
    content: {
      title: "ملخص المصدر",
      text: `تم ربط التقرير بالمجموعة ${datasetDetail.name} بعدد ${datasetDetail.rowCount} صف و${datasetDetail.columnCount} عمود.`,
    },
  });

  if (columns.length > 0) {
    await addReportSection(report.id, {
      type: "table",
      position: 1,
      content: {
        title: "معاينة البيانات",
        datasetId,
        columns,
        rows: previewRows,
      },
    });
  }

  const build = await buildReport(report.id);
  return {
    report,
    build,
    datasetName: datasetDetail.name,
  };
}
