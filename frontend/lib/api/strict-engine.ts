/**
 * strict-engine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * API layer for STRICT 1:1 PixelPerfect Engine (/api/v1/strict/)
 * Connected to replication-service:8007
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createApiClient } from "./client";
import type { AxiosResponse } from "axios";

const strictApi = createApiClient("/api/v1/strict");

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type ArabicMode = "BASIC" | "PROFESSIONAL" | "ELITE";
export type FontPolicy = "PROVIDED" | "ALLOW_UPLOAD" | "FALLBACK_ALLOWED";
export type ExportKind = "pptx" | "docx" | "xlsx" | "dashboard";
export type ArtifactKind = "pptx" | "docx" | "xlsx" | "dashboard" | "pdf" | "png" | "json";
export type ToolStatus = "ok" | "failed";
export type Severity = "info" | "warning" | "error";

export interface ActionContext {
  workspace_id: string;
  user_id: string;
  locale: string;
  strict_visual: boolean;
  arabic_mode: ArabicMode;
  mode: "AUTO" | "GUIDED";
  font_policy: FontPolicy;
}

export interface AssetRef {
  asset_id: string;
  uri: string;
  mime: string;
  sha256: string;
  size_bytes: number;
  page_count?: number;
}

export interface ArtifactRef {
  artifact_id: string;
  kind: ArtifactKind;
  uri: string;
}

export interface Warning {
  code: string;
  message: string;
  severity: Severity;
}

export interface HashBundle {
  layout_hash: string;
  structural_hash: string;
  typography_hash: string;
  pixel_hash: string;
  perceptual_hash?: string;
}

export interface RenderRef {
  render_id: string;
  uri: string;
  dpi: number;
  colorspace: "sRGB";
  engine_fingerprint: string;
  fingerprint: HashBundle;
}

export interface DiffRef {
  diff_id: string;
  pixel_diff: number;
  pass: boolean;
  heatmap_uri?: string;
}

export interface FontPlanEntry {
  family: string;
  status: "available" | "embedded" | "synthesized" | "missing";
  font_program_uri?: string;
  embed_all_glyphs: boolean;
}

export interface FontPlan {
  fonts: FontPlanEntry[];
}

export interface DeterminismCheck {
  anti_aliasing_policy: "locked";
  gpu_cpu_parity: "validated" | "forced_single_path";
  float_norm_policy: "locked";
  random_seed_locked: boolean;
}

export interface EvidencePack {
  run_id: string;
  timestamp: string;
  source_renders: RenderRef[];
  target_renders: RenderRef[];
  pixel_diff_reports: DiffRef[];
  structural_hashes: HashBundle[];
  determinism_report: {
    same_input_rerun_equals: boolean;
    checks: DeterminismCheck;
  };
  functional_tests_report: Record<string, boolean | undefined>;
  tool_versions: Record<string, string>;
  farm_image_id: string;
  font_snapshot_id: string;
}

export interface ToolDefinition {
  tool_id: string;
  version: string;
  determinism_level: "HARD" | "SOFT";
  fidelity_target: "PIXEL_0";
  editable_guarantee: boolean;
  required_permissions: string[];
  input_schema_ref: string;
  output_schema_ref: string;
}

// ─── Pipeline ────────────────────────────────────────────────────────

export interface StrictConvertRequest {
  context: ActionContext;
  source_asset: AssetRef;
  target_format?: ExportKind;
  config?: {
    max_repair_iterations?: number;
    render_dpi?: number;
    farm_image_id?: string;
    font_snapshot_id?: string;
  };
}

export interface StrictConvertResponse {
  success: boolean;
  artifact?: ArtifactRef;
  evidence_pack?: EvidencePack;
  warnings: Warning[];
  error?: string;
}

export interface ToolExecuteRequest {
  request_id: string;
  tool_id: string;
  context: ActionContext;
  inputs: Record<string, unknown>;
  params: Record<string, unknown>;
}

export interface ToolExecuteResponse {
  request_id: string;
  tool_id: string;
  status: ToolStatus;
  refs: Record<string, unknown>;
  warnings?: Warning[];
}

export interface StrictHealthResponse {
  status: string;
  engine: string;
  version: string;
  registered_tools: number;
  tool_ids: string[];
}

export interface EvidenceValidationResult {
  valid: boolean;
  errors: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// API FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function unwrap<T>(res: AxiosResponse<T>): T {
  return res.data;
}

/** Health check — GET /api/v1/strict/health */
export async function strictHealth(): Promise<StrictHealthResponse> {
  const res = await strictApi.get<StrictHealthResponse>("/health");
  return unwrap(res);
}

/** List all registered tools — GET /api/v1/strict/tools */
export async function strictListTools(): Promise<{ tools: ToolDefinition[] }> {
  const res = await strictApi.get<{ tools: ToolDefinition[] }>("/tools");
  return unwrap(res);
}

/**
 * Run STRICT 1:1 conversion pipeline — POST /api/v1/strict/convert
 * Input: source asset + context + optional target format
 * Output: artifact + evidence pack (PixelDiff==0 guaranteed)
 */
export async function strictConvert(
  request: StrictConvertRequest
): Promise<StrictConvertResponse> {
  const res = await strictApi.post<StrictConvertResponse>("/convert", request);
  return unwrap(res);
}

/**
 * Execute a single STRICT tool — POST /api/v1/strict/tool/execute
 * Directly invoke any of the 22 registered tools.
 */
export async function strictExecuteTool(
  request: ToolExecuteRequest
): Promise<ToolExecuteResponse> {
  const res = await strictApi.post<ToolExecuteResponse>("/tool/execute", request);
  return unwrap(res);
}

/** Validate an evidence pack — POST /api/v1/strict/evidence/validate */
export async function strictValidateEvidence(
  pack: EvidencePack
): Promise<EvidenceValidationResult> {
  const res = await strictApi.post<EvidenceValidationResult>("/evidence/validate", pack);
  return unwrap(res);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE / SHORTCUT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/** Build default ActionContext from localStorage auth data */
export function buildDefaultContext(overrides?: Partial<ActionContext>): ActionContext {
  let workspaceId = "default";
  let userId = "anonymous";

  if (typeof window !== "undefined") {
    try {
      const token = localStorage.getItem("rasid_token");
      if (token) {
        const payload = JSON.parse(atob(token.split(".")[1]));
        workspaceId = payload.tenantId || "default";
        userId = payload.userId || payload.id || "anonymous";
      }
    } catch {
      // ignore
    }
  }

  return {
    workspace_id: workspaceId,
    user_id: userId,
    locale: "ar-SA",
    strict_visual: true,
    arabic_mode: "ELITE",
    mode: "AUTO",
    font_policy: "PROVIDED",
    ...overrides,
  };
}

/** Quick convert: file → STRICT artifact */
export async function strictConvertFile(
  file: File,
  targetFormat?: ExportKind,
  arabicMode: ArabicMode = "ELITE"
): Promise<StrictConvertResponse> {
  const context = buildDefaultContext({ arabic_mode: arabicMode });

  // Build asset ref from file
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const sha256 = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  const sourceAsset: AssetRef = {
    asset_id: crypto.randomUUID(),
    uri: URL.createObjectURL(file),
    mime: file.type,
    sha256,
    size_bytes: file.size,
  };

  return strictConvert({
    context,
    source_asset: sourceAsset,
    target_format: targetFormat,
  });
}

/** Quick tool execution shortcut */
export async function strictRunTool(
  toolId: string,
  inputs: Record<string, unknown>,
  params: Record<string, unknown> = {}
): Promise<ToolExecuteResponse> {
  const context = buildDefaultContext();
  return strictExecuteTool({
    request_id: crypto.randomUUID(),
    tool_id: toolId,
    context,
    inputs,
    params,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// INDIVIDUAL TOOL SHORTCUTS
// ═══════════════════════════════════════════════════════════════════════════════

export async function strictExtractPdfDom(pdfAsset: AssetRef) {
  return strictRunTool("extract.pdf_dom", { pdf_asset: pdfAsset });
}

export async function strictExtractImageSegments(imageAsset: AssetRef) {
  return strictRunTool("extract.image_segments", { image_asset: imageAsset });
}

export async function strictBuildCdrFromPdf(pdfDomId: string) {
  return strictRunTool("cdr.build_design_from_pdf", { pdf_dom: { pdf_dom_id: pdfDomId } });
}

export async function strictBuildCdrFromImage(imageSegments: Record<string, unknown>) {
  return strictRunTool("cdr.build_design_from_image", { image_segments: imageSegments });
}

export async function strictEmbedFonts(fontPlan: FontPlan) {
  return strictRunTool("fonts.embed_full_glyph", { font_plan: fontPlan }, { embed_all_glyphs: true });
}

export async function strictExportPptx(cdrDesignId: string, pageCount: number, fontPlan: FontPlan) {
  return strictRunTool("export.pptx_from_cdr", {
    cdr_design: { cdr_design_id: cdrDesignId, page_count: pageCount },
    font_plan: fontPlan,
  });
}

export async function strictExportDocx(cdrDesignId: string, pageCount: number, fontPlan: FontPlan) {
  return strictRunTool("export.docx_from_cdr", {
    cdr_design: { cdr_design_id: cdrDesignId, page_count: pageCount },
    font_plan: fontPlan,
  });
}

export async function strictVerifyPixelDiff(sourceRender: RenderRef, targetRender: RenderRef) {
  return strictRunTool("verify.pixel_diff", {
    source_render: sourceRender,
    target_render: targetRender,
  }, { threshold: 0 });
}

export async function strictDiagnose(diff: DiffRef, cdrDesignId: string, pageCount: number) {
  return strictRunTool("diagnose.diff_attribution", {
    diff,
    cdr_design: { cdr_design_id: cdrDesignId, page_count: pageCount },
  });
}

export { strictApi };
