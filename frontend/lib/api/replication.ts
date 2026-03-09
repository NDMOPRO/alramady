import { replicationApi } from "./client";

export interface ReplicationJob {
  id: string;
  originalImageUrl: string;
  replicaImageUrl: string | null;
  status: "pending" | "analyzing" | "replicating" | "completed" | "failed";
  progress: number;
  fidelityScore: number | null;
  analysisResults: AnalysisResult | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface AnalysisResult {
  colorPalette: string[];
  dominantColors: Array<{ hex: string; percentage: number }>;
  dimensions: { width: number; height: number };
  format: string;
  style: string;
  complexity: "low" | "medium" | "high";
  elements: Array<{
    type: string;
    description: string;
    boundingBox: { x: number; y: number; w: number; h: number };
  }>;
}

export type ReplicationMode =
  | "STRICT_REPLICATION"
  | "PROFESSIONAL_CREATION"
  | "HYBRID";

export interface ReplicatePayload {
  file: File;
  mode?: ReplicationMode;
  options?: {
    targetWidth?: number;
    targetHeight?: number;
    style?: string;
    fidelityTarget?: number;
  };
}

export interface EnhanceResult {
  enhancedUrl: string;
  improvements: string[];
}

export interface ExtractResult {
  text: string;
  tables: Array<{
    headers: string[];
    rows: string[][];
  }>;
  images: Array<{
    url: string;
    description: string;
  }>;
}

export async function replicateImage(
  payload: ReplicatePayload
): Promise<ReplicationJob> {
  const formData = new FormData();
  formData.append("file", payload.file);
  if (payload.mode) {
    formData.append("mode", payload.mode);
  }
  if (payload.options) {
    formData.append("options", JSON.stringify(payload.options));
  }
  const response = await replicationApi.post("/replicate", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function fetchReplicationJob(id: string): Promise<ReplicationJob> {
  const response = await replicationApi.get(`/replicate/${id}`);
  return response.data;
}

export async function fetchReplicationHistory(params?: {
  page?: number;
  limit?: number;
}): Promise<{ data: ReplicationJob[]; total: number }> {
  const response = await replicationApi.get("/replicate/history", { params });
  return response.data;
}

export async function deleteReplicationJob(id: string): Promise<void> {
  await replicationApi.delete(`/replicate/${id}`);
}

export async function downloadReplica(id: string): Promise<Blob> {
  const response = await replicationApi.get(`/replicate/${id}/download`, {
    responseType: "blob",
  });
  return response.data;
}

export async function enhanceImage(
  file: File
): Promise<EnhanceResult> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await replicationApi.post("/enhance", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function extractDocument(
  file: File,
  options?: { language?: string }
): Promise<ExtractResult> {
  const formData = new FormData();
  formData.append("file", file);
  if (options?.language) formData.append("language", options.language);
  const response = await replicationApi.post("/extract", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

interface ReplicationEnvelope<T> {
  success?: boolean;
  data: T;
}

export interface VisualAnalysisResult {
  analysis: Record<string, unknown>;
  elements: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
}

export async function analyzeVisualImage(
  file: File,
  sourceType:
    | "dashboard"
    | "report"
    | "presentation"
    | "pdf"
    | "screenshot"
    | "infographic"
    | "slide" = "screenshot"
): Promise<VisualAnalysisResult> {
  const formData = new FormData();
  formData.append("image", file);
  const response = await replicationApi.post<ReplicationEnvelope<VisualAnalysisResult>>(
    "/visual-replication/analyze",
    formData,
    {
      params: { sourceType },
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120000,
    }
  );
  return response.data.data;
}

export async function reconstructDashboardFromImage(
  file: File
): Promise<{
  dashboardId: string;
  metadata?: Record<string, unknown>;
}> {
  const formData = new FormData();
  formData.append("image", file);
  const response = await replicationApi.post<ReplicationEnvelope<{
    dashboardId: string;
    metadata?: Record<string, unknown>;
  }>>("/visual-replication/reconstruct/dashboard", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000,
  });
  return response.data.data;
}

export async function compareVisualReplication(
  original: File,
  reconstructed: File
): Promise<{
  pixelDiff: number;
  structuralFingerprint: number;
  ssim: number;
  passed: boolean;
  diffImage: string;
  dimensions: Record<string, unknown>;
  totalPixels: number;
  mismatchedPixels: number;
}> {
  const formData = new FormData();
  formData.append("original", original);
  formData.append("reconstructed", reconstructed);
  const response = await replicationApi.post<ReplicationEnvelope<{
    pixelDiff: number;
    structuralFingerprint: number;
    ssim: number;
    passed: boolean;
    diffImage: string;
    dimensions: Record<string, unknown>;
    totalPixels: number;
    mismatchedPixels: number;
  }>>("/visual-replication/compare", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000,
  });
  return response.data.data;
}
