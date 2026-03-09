import { aiApi } from "./client";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  metadata?: {
    model?: string;
    tokens?: number;
    sources?: string[];
  };
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessage: string;
}

export interface ChatRequest {
  message: string;
  sessionId?: string;
  knowledgeBaseId?: string;
  language?: string;
}

export interface ChatResponse {
  sessionId: string;
  reply: string;
  queryId: string;
  tokensUsed: number;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export interface SurfaceAssistantContextItem {
  label: string;
  value: string;
}

export interface SurfaceAssistantActionDescriptor {
  label: string;
  description: string;
}

export interface SurfaceAssistantRequest {
  surfaceName: string;
  route: string;
  contextSummary: string;
  contextItems: SurfaceAssistantContextItem[];
  actions: SurfaceAssistantActionDescriptor[];
  userMessage: string;
  sessionId?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface SurfaceAssistantResponse extends ChatResponse {
  suggestedChips: string[];
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  documentCount: number;
  totalSize: number;
  createdAt: string;
  updatedAt: string;
  status: "active" | "indexing" | "error";
  language: string;
}

export interface KBDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
  status: "processing" | "indexed" | "error";
  chunkCount: number;
}

export interface KBQueryRequest {
  query: string;
  knowledgeBaseId: string;
  topK?: number;
}

export interface KBQueryResult {
  answer: string;
  sources: Array<{
    documentId: string;
    documentName: string;
    chunk: string;
    score: number;
  }>;
}

export async function sendChatMessage(
  payload: ChatRequest
): Promise<ChatResponse> {
  const response = await aiApi.post<ApiEnvelope<ChatResponse>>("/generate/chat", {
    messages: [{ role: "user", content: payload.message }],
    sessionId: payload.sessionId,
    systemPrompt: "أجب بالعربية فقط وباختصار واضح داخل منصة راصد.",
  });
  return response.data.data;
}

export async function askSurfaceAssistant(
  payload: SurfaceAssistantRequest
): Promise<SurfaceAssistantResponse> {
  const actionsText =
    payload.actions.length > 0
      ? payload.actions
          .map(
            (action, index) =>
              `${index + 1}. ${action.label}: ${action.description}`
          )
          .join("\n")
      : "لا توجد إجراءات تنفيذية ظاهرة الآن.";

  const contextText =
    payload.contextItems.length > 0
      ? payload.contextItems
          .map((item) => `- ${item.label}: ${item.value}`)
          .join("\n")
      : "- لا يوجد سياق إضافي.";

  const userPrompt = [
    `السطح الحالي: ${payload.surfaceName}`,
    `المسار: ${payload.route}`,
    `ملخص السياق: ${payload.contextSummary}`,
    "عناصر السياق:",
    contextText,
    "الإجراءات الحقيقية المتاحة الآن:",
    actionsText,
    "رسالة المستخدم:",
    payload.userMessage,
    "أجب بالعربية فقط. إذا كان المطلوب إجراءً تنفيذيًا فاذكر اسم الإجراء الموجود فقط ولا تدّع التنفيذ ما لم يُنفذ من الواجهة.",
  ].join("\n\n");

  const response = await aiApi.post<ApiEnvelope<ChatResponse>>("/generate/chat", {
    messages: [
      ...(payload.history ?? []).map((message) => ({
        role: message.role,
        content: message.content,
      })),
      { role: "user", content: userPrompt },
    ],
    sessionId: payload.sessionId,
    temperature: 0.2,
    maxTokens: 500,
    systemPrompt:
      "أنت راصد، المساعد العربي الرسمي داخل المنصة. أجب باقتضاب شديد، وركّز على الخطوة التالية داخل السطح الحالي فقط.",
  });

  return {
    ...response.data.data,
    suggestedChips: payload.actions.slice(0, 4).map((action) => action.label),
  };
}

export async function fetchChatSessions(params?: {
  page?: number;
  limit?: number;
}): Promise<{ data: ChatSession[]; total: number }> {
  const response = await aiApi.get("/ai/chat/sessions", { params });
  return response.data;
}

export async function fetchChatHistory(
  sessionId: string
): Promise<ChatMessage[]> {
  const response = await aiApi.get(`/ai/chat/sessions/${sessionId}/messages`);
  return response.data;
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  await aiApi.delete(`/ai/chat/sessions/${sessionId}`);
}

export async function fetchKnowledgeBases(params?: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<{ data: KnowledgeBase[]; total: number }> {
  const response = await aiApi.get("/ai/knowledge-bases", { params });
  return response.data;
}

export async function fetchKnowledgeBase(id: string): Promise<KnowledgeBase> {
  const response = await aiApi.get(`/ai/knowledge-bases/${id}`);
  return response.data;
}

export async function createKnowledgeBase(payload: {
  name: string;
  description: string;
  language: string;
}): Promise<KnowledgeBase> {
  const response = await aiApi.post("/ai/knowledge-bases", payload);
  return response.data;
}

export async function deleteKnowledgeBase(id: string): Promise<void> {
  await aiApi.delete(`/ai/knowledge-bases/${id}`);
}

export async function uploadKBDocument(
  knowledgeBaseId: string,
  file: File
): Promise<KBDocument> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await aiApi.post(
    `/ai/knowledge-bases/${knowledgeBaseId}/documents`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return response.data;
}

export async function fetchKBDocuments(
  knowledgeBaseId: string
): Promise<KBDocument[]> {
  const response = await aiApi.get(
    `/ai/knowledge-bases/${knowledgeBaseId}/documents`
  );
  return response.data;
}

export async function deleteKBDocument(
  knowledgeBaseId: string,
  documentId: string
): Promise<void> {
  await aiApi.delete(
    `/ai/knowledge-bases/${knowledgeBaseId}/documents/${documentId}`
  );
}

export async function queryKnowledgeBase(
  payload: KBQueryRequest
): Promise<KBQueryResult> {
  const response = await aiApi.post("/ai/knowledge-bases/query", payload);
  return response.data;
}
