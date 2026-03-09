import { infographicApi } from "./client";

export interface InfographicElement {
  id: string;
  type: "text" | "image" | "icon" | "chart" | "shape" | "divider";
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  style: Record<string, string>;
}

export interface Infographic {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  thumbnailUrl: string;
  previewUrl: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  status: "draft" | "published" | "archived";
  tags: string[];
  elements: InfographicElement[];
}

export interface CreateInfographicPayload {
  name: string;
  description: string;
  width: number;
  height: number;
  templateId?: string;
}

export interface AiGenerateInfographicPayload {
  topic: string;
  style: string;
  language: string;
  dataPoints: string[];
}

export async function fetchInfographics(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}): Promise<{ data: Infographic[]; total: number }> {
  const response = await infographicApi.get("/infographics", { params });
  return response.data;
}

export async function fetchInfographic(id: string): Promise<Infographic> {
  const response = await infographicApi.get(`/infographics/${id}`);
  return response.data;
}

export async function createInfographic(
  payload: CreateInfographicPayload
): Promise<Infographic> {
  const response = await infographicApi.post("/infographics", payload);
  return response.data;
}

export async function aiGenerateInfographic(
  payload: AiGenerateInfographicPayload
): Promise<Infographic> {
  const response = await infographicApi.post("/infographics/ai-generate", payload);
  return response.data;
}

export async function updateInfographic(
  id: string,
  payload: Partial<Infographic>
): Promise<Infographic> {
  const response = await infographicApi.patch(`/infographics/${id}`, payload);
  return response.data;
}

export async function deleteInfographic(id: string): Promise<void> {
  await infographicApi.delete(`/infographics/${id}`);
}

export async function exportInfographic(
  id: string,
  format: "png" | "svg" | "pdf"
): Promise<Blob> {
  const response = await infographicApi.get(
    `/infographics/${id}/export?format=${format}`,
    { responseType: "blob" }
  );
  return response.data;
}
