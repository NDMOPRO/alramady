import { aiApi } from "./client";

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export interface RasidKnowledgeBaseRecord {
  id: string;
  name: string;
  description: string;
  indexName: string;
  documentCount: number;
  chunkCount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface RasidPromptTemplateRecord {
  id: string;
  name: string;
  category: string;
  version: number;
  usageCount: number;
  isActive: boolean;
  createdAt: string;
}

export interface RasidPromptTestResult {
  renderedPrompt: string;
  response: string;
  tokensUsed: number;
  latencyMs: number;
}

export interface RasidKnowledgeQueryResult {
  answer: string;
  sources: Array<{
    content: string;
    filename: string;
    score: number;
  }>;
  queryId: string;
}

export async function listKnowledgeBases(): Promise<RasidKnowledgeBaseRecord[]> {
  const response = await aiApi.get<ApiEnvelope<RasidKnowledgeBaseRecord[]>>(
    "/rag/knowledge-bases"
  );
  return Array.isArray(response.data.data) ? response.data.data : [];
}

export async function createKnowledgeBase(payload: {
  name: string;
  description: string;
}): Promise<RasidKnowledgeBaseRecord> {
  const response = await aiApi.post<ApiEnvelope<RasidKnowledgeBaseRecord>>(
    "/rag/knowledge-bases",
    payload
  );
  return response.data.data;
}

export async function ingestKnowledgeBaseDocument(
  knowledgeBaseId: string,
  file: File
): Promise<{ documentId: string; chunkCount: number; indexedCount: number }> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await aiApi.post<
    ApiEnvelope<{ documentId: string; chunkCount: number; indexedCount: number }>
  >(`/rag/knowledge-bases/${knowledgeBaseId}/ingest`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data.data;
}

export async function queryKnowledgeBase(payload: {
  knowledgeBaseId: string;
  question: string;
  topK?: number;
}): Promise<RasidKnowledgeQueryResult> {
  const response = await aiApi.post<ApiEnvelope<RasidKnowledgeQueryResult>>(
    `/rag/knowledge-bases/${payload.knowledgeBaseId}/query`,
    { question: payload.question, topK: payload.topK ?? 4 }
  );
  return response.data.data;
}

export async function listPromptTemplates(
  category?: string
): Promise<RasidPromptTemplateRecord[]> {
  const response = await aiApi.get<
    ApiEnvelope<{ prompts: RasidPromptTemplateRecord[]; total: number }>
  >("/prompts", {
    params: category ? { category } : undefined,
  });
  return Array.isArray(response.data.data?.prompts)
    ? response.data.data.prompts
    : [];
}

export async function createPromptTemplate(payload: {
  name: string;
  template: string;
  variables: string[];
  category: string;
}): Promise<{ id: string; name: string; version: number }> {
  const response = await aiApi.post<
    ApiEnvelope<{ id: string; name: string; version: number }>
  >("/prompts", payload);
  return response.data.data;
}

export async function versionPromptTemplate(
  promptId: string,
  description: string
): Promise<{ promptId: string; version: number; versionId: string }> {
  const response = await aiApi.post<
    ApiEnvelope<{ promptId: string; version: number; versionId: string }>
  >(`/prompts/${promptId}/version`, { description });
  return response.data.data;
}

export async function testPromptTemplate(
  promptId: string,
  variables: Record<string, string>
): Promise<RasidPromptTestResult> {
  const response = await aiApi.post<ApiEnvelope<RasidPromptTestResult>>(
    `/prompts/${promptId}/test`,
    { variables }
  );
  return response.data.data;
}
