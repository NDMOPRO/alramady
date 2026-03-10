import { aiApi, getAuthPayload } from "./client";

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

export interface RasedActionContext {
  workspace_id: string;
  user_id: string;
  mode: "AUTO" | "CONTROLLED" | "TUTOR" | "EXECUTOR";
  arabic_mode: "BASIC" | "PROFESSIONAL" | "ELITE";
  locale: string;
}

export interface RasedAssetRef {
  asset_id: string;
  uri: string;
  mime: string;
  sha256: string;
}

export interface RasedArtifactRef {
  artifact_id: string;
  kind: "pptx" | "docx" | "xlsx" | "dashboard" | "pdf" | "html" | "png" | "json" | "srt" | "vtt" | "link";
  uri: string;
}

export interface RasedToolEnvelope<TRefs> {
  request_id: string;
  tool_id: string;
  status: "ok" | "failed";
  refs: TRefs;
  warnings?: Array<{
    code: string;
    message: string;
    severity: "info" | "warning" | "error";
  }>;
  failure?: {
    code: string;
    message: string;
  };
}

function buildRasedContext(mode: RasedActionContext["mode"] = "AUTO"): RasedActionContext {
  const payload = getAuthPayload();
  const workspaceId = String(payload?.organizationId ?? payload?.tenantId ?? payload?.workspace_id ?? payload?.userId ?? payload?.id ?? "workspace-local");
  const userId = String(payload?.userId ?? payload?.id ?? "user-local");
  const locale =
    typeof navigator !== "undefined" && navigator.language
      ? navigator.language
      : "ar-SA";

  return {
    workspace_id: workspaceId,
    user_id: userId,
    mode,
    arabic_mode: "ELITE",
    locale,
  };
}

async function callRasedTool<TRefs>(
  toolId: string,
  payload: {
    inputs: Record<string, unknown>;
    params?: Record<string, unknown>;
    context?: Partial<RasedActionContext>;
  }
): Promise<RasedToolEnvelope<TRefs>> {
  const requestId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? `req_${crypto.randomUUID()}`
      : `req_${Date.now()}`;

  const response = await aiApi.post<ApiEnvelope<RasedToolEnvelope<TRefs>>>(
    `/rased/tools/${toolId}`,
    {
      request_id: requestId,
      tool_id: toolId,
      context: {
        ...buildRasedContext(payload.context?.mode),
        ...(payload.context ?? {}),
      },
      inputs: payload.inputs,
      params: payload.params ?? {},
    }
  );

  return response.data.data;
}

export interface RasedIntentManifest {
  goal: string;
  engine_targets: string[];
  exports: string[];
  controls: Record<string, unknown>;
  risk_level: "low" | "medium" | "high";
  [key: string]: unknown;
}

export interface RasedActionGraph {
  graph_id: string;
  goal?: string;
  steps: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface RasedUiStateSnapshot {
  selection: Record<string, unknown>;
  open_panels: string[];
  focus_stage: Record<string, unknown>;
  running_jobs: Array<Record<string, unknown>>;
  artifacts?: Array<Record<string, unknown>>;
  permissions_context?: Record<string, unknown>;
  active_template?: string | null;
  active_brand?: string | null;
}

export interface RasedTourStep {
  step_id: string;
  target_rased_id: string;
  title: string;
  body: string;
  action?: {
    type:
      | "open_sidebar"
      | "close_sidebar"
      | "open_focus"
      | "close_focus"
      | "select"
      | "set_control"
      | "scroll_to"
      | "highlight";
    value?: unknown;
  };
}

export async function rasedIntentParse(payload: {
  prompt: string;
  assets?: RasedAssetRef[];
  mode?: RasedActionContext["mode"];
  defaultStrictClaim?: string;
  defaultExports?: string[];
}) {
  return callRasedTool<{ intent_manifest: RasedIntentManifest }>("rased.intent_parse", {
    context: { mode: payload.mode ?? "AUTO" },
    inputs: {
      prompt: payload.prompt,
      assets: payload.assets ?? [],
    },
    params: {
      default_strict_claim: payload.defaultStrictClaim,
      default_exports: payload.defaultExports,
    },
  });
}

export async function rasedPlanActionGraph(intentManifest: RasedIntentManifest, mode: RasedActionContext["mode"] = "AUTO") {
  return callRasedTool<{ action_graph: RasedActionGraph }>("rased.plan_action_graph", {
    context: { mode },
    inputs: { intent_manifest: intentManifest },
    params: { deterministic: true },
  });
}

export async function rasedExecuteActionGraph(actionGraph: RasedActionGraph, mode: RasedActionContext["mode"] = "AUTO") {
  return callRasedTool<{
    action_ids: string[];
    artifacts: RasedArtifactRef[];
    evidence_id: string;
  }>("rased.execute_action_graph", {
    context: { mode },
    inputs: { action_graph: actionGraph },
    params: { must_produce_evidence: true },
  });
}

export async function rasedObserveUiState(mode: RasedActionContext["mode"] = "AUTO") {
  return callRasedTool<{ ui_state: RasedUiStateSnapshot }>("rased.observe_ui_state", {
    context: { mode },
    inputs: {},
    params: {},
  });
}

export async function rasedDispatchUiActions(payload: {
  actions: Array<{
    type: "open_sidebar" | "close_sidebar" | "open_focus" | "close_focus" | "select" | "set_control" | "scroll_to" | "highlight";
    target_rased_id?: string;
    value?: unknown;
  }>;
  mode?: RasedActionContext["mode"];
}) {
  return callRasedTool<{ applied: number; dispatch_id?: string }>("rased.ui_action.dispatch", {
    context: { mode: payload.mode ?? "EXECUTOR" },
    inputs: { actions: payload.actions },
    params: {},
  });
}

export async function rasedTourStart(payload: {
  name: string;
  mode: "explain" | "coach" | "executor";
  steps: RasedTourStep[];
}) {
  return callRasedTool<{ tour_session_id: string }>("rased.ui_tour.start", {
    context: { mode: payload.mode === "executor" ? "EXECUTOR" : payload.mode === "coach" ? "TUTOR" : "AUTO" },
    inputs: {
      tour: payload,
    },
    params: {},
  });
}

export async function rasedTourStep(payload: {
  tour_session_id: string;
  step_index: number;
  target_rased_id?: string;
  status: "viewed" | "completed" | "auto_applied" | "failed";
}) {
  return callRasedTool<{ acknowledged: boolean; progress: number }>("rased.ui_tour.step", {
    context: { mode: "TUTOR" },
    inputs: payload,
    params: {},
  });
}

export async function rasedTourEnd(payload: {
  tour_session_id: string;
  outcome: "completed" | "cancelled" | "failed";
  feedback?: string;
}) {
  return callRasedTool<{ ended: boolean; completion_rate: number }>("rased.ui_tour.end", {
    context: { mode: "TUTOR" },
    inputs: payload,
    params: {},
  });
}

export async function rasedPreferenceGet(scope: "user" | "workspace" = "workspace") {
  return callRasedTool<{ preferences: Record<string, unknown> }>("rased.preference.get", {
    context: { mode: "AUTO" },
    inputs: {},
    params: { scope },
  });
}

export async function rasedPreferenceSet(values: Record<string, unknown>, scope: "user" | "workspace" = "workspace") {
  return callRasedTool<{ preferences: Record<string, unknown> }>("rased.preference.set", {
    context: { mode: "AUTO" },
    inputs: { values },
    params: { scope },
  });
}

export async function rasedPolicyCheck(payload: {
  operation: string;
  target?: string;
  command_text?: string;
  classification?: "public" | "internal" | "confidential" | "restricted";
  explicit_command_token?: string;
}) {
  return callRasedTool<{
    allow: boolean;
    deny: boolean;
    required_token?: string;
    reason: string;
  }>("rased.policy.check", {
    context: { mode: "AUTO" },
    inputs: {
      operation: payload.operation,
      target: payload.target,
      command_text: payload.command_text,
      classification: payload.classification,
    },
    params: {
      explicit_command_token: payload.explicit_command_token,
    },
  });
}

export async function rasedEvidencePack(payload: {
  action_graph?: Record<string, unknown>;
  action_ids?: string[];
  artifacts?: RasedArtifactRef[];
  reports?: Record<string, unknown>;
  ui_audit?: Record<string, unknown>;
}) {
  return callRasedTool<{ evidence_id: string; artifact?: RasedArtifactRef }>("rased.evidence.pack", {
    context: { mode: "AUTO" },
    inputs: payload,
    params: {},
  });
}

export async function rasedSyncUiState(snapshot: RasedUiStateSnapshot) {
  const response = await aiApi.post<ApiEnvelope<RasedUiStateSnapshot>>("/rased/ui-state", snapshot);
  return response.data.data;
}
