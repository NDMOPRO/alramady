import { templateApi } from "./client";

export interface Template {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  type: "presentation" | "infographic" | "report" | "dashboard";
  category: string;
  categoryAr: string;
  thumbnailUrl: string;
  previewUrl: string;
  rating: number;
  usageCount: number;
  isPremium: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface CreateTemplatePayload {
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  type: Template["type"];
  category: string;
  categoryAr: string;
  tags: string[];
}

export async function fetchTemplates(params?: {
  page?: number;
  limit?: number;
  search?: string;
  type?: string;
  category?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}): Promise<{ data: Template[]; total: number }> {
  const response = await templateApi.get("/templates", { params });
  return response.data;
}

export async function fetchTemplate(id: string): Promise<Template> {
  const response = await templateApi.get(`/templates/${id}`);
  return response.data;
}

export async function createTemplate(
  payload: CreateTemplatePayload
): Promise<Template> {
  const response = await templateApi.post("/templates", payload);
  return response.data;
}

export async function updateTemplate(
  id: string,
  payload: Partial<CreateTemplatePayload>
): Promise<Template> {
  const response = await templateApi.patch(`/templates/${id}`, payload);
  return response.data;
}

export async function deleteTemplate(id: string): Promise<void> {
  await templateApi.delete(`/templates/${id}`);
}

export async function fetchTemplateCategories(): Promise<
  Array<{ id: string; name: string; nameAr: string; count: number }>
> {
  const response = await templateApi.get("/templates/categories");
  return response.data;
}

export async function rateTemplate(
  id: string,
  rating: number
): Promise<{ averageRating: number }> {
  const response = await templateApi.post(`/templates/${id}/rate`, { rating });
  return response.data;
}
