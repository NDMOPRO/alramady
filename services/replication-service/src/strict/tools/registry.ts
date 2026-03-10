/**
 * STRICT Tool Registry — Section 15
 * Every tool MUST be registered here with its schema, permissions, and fidelity target.
 * Tools without registration are NOT executable.
 */

import {
  type ActionContext,
  type ToolStatus,
  type DeterminismLevel,
  type FidelityTarget,
  type Warning,
} from '../cdr/types';
import { validateToolContract } from './contracts';

// ─── Tool Definition ─────────────────────────────────────────────────
export interface ToolDefinition {
  tool_id: string;
  version: string;
  determinism_level: DeterminismLevel;
  fidelity_target: FidelityTarget;
  editable_guarantee: boolean;
  required_permissions: string[];
  input_schema_ref: string;
  output_schema_ref: string;
}

export interface ToolRequest<TInputs = unknown, TParams = unknown> {
  request_id: string;
  tool_id: string;
  context: ActionContext;
  inputs: TInputs;
  params: TParams;
}

export interface ToolResponse<TRefs = unknown> {
  request_id: string;
  tool_id: string;
  status: ToolStatus;
  refs: TRefs;
  warnings?: Warning[];
}

// ─── Tool Handler Interface ──────────────────────────────────────────
export type ToolHandler<TIn = unknown, TParams = unknown, TRefs = unknown> = (
  request: ToolRequest<TIn, TParams>
) => Promise<ToolResponse<TRefs>>;

// ─── Registry ────────────────────────────────────────────────────────
const registeredTools = new Map<string, ToolDefinition>();
const toolHandlers = new Map<string, ToolHandler>();

export function registerTool(
  definition: ToolDefinition,
  handler: ToolHandler
): void {
  if (registeredTools.has(definition.tool_id)) {
    throw new Error(`Tool already registered: ${definition.tool_id}`);
  }
  registeredTools.set(definition.tool_id, definition);
  toolHandlers.set(definition.tool_id, handler);
}

export function getTool(toolId: string): ToolDefinition | undefined {
  return registeredTools.get(toolId);
}

export function getToolHandler(toolId: string): ToolHandler | undefined {
  return toolHandlers.get(toolId);
}

export async function executeTool<TRefs = unknown>(
  request: ToolRequest
): Promise<ToolResponse<TRefs>> {
  const definition = registeredTools.get(request.tool_id);
  if (!definition) {
    throw new Error(`Tool not registered: ${request.tool_id}. All tools MUST be registered in Tool Registry.`);
  }

  // Validate strict_visual flag for PIXEL_0 tools
  if (definition.fidelity_target === 'PIXEL_0' && !request.context.strict_visual) {
    throw new Error(`Tool ${request.tool_id} requires strict_visual=true in ActionContext`);
  }

  validateToolContract(request.tool_id, 'request', request);

  const handler = toolHandlers.get(request.tool_id);
  if (!handler) {
    throw new Error(`No handler registered for tool: ${request.tool_id}`);
  }

  const response = await handler(request);

  // Verify response matches tool_id
  if (response.tool_id !== request.tool_id) {
    throw new Error(`Tool handler returned mismatched tool_id: expected ${request.tool_id}, got ${response.tool_id}`);
  }

  validateToolContract(request.tool_id, 'response', response);

  return response as ToolResponse<TRefs>;
}

export function listTools(): ToolDefinition[] {
  return Array.from(registeredTools.values());
}

export function clearRegistry(): void {
  registeredTools.clear();
  toolHandlers.clear();
}

// ─── Built-in Tool Definitions (Section 15.1) ───────────────────────
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    tool_id: 'extract.pdf_dom',
    version: '1.0.0',
    determinism_level: 'HARD',
    fidelity_target: 'PIXEL_0',
    editable_guarantee: true,
    required_permissions: ['read:assets'],
    input_schema_ref: 'https://strict.local/schemas/extract.pdf_dom.input.json',
    output_schema_ref: 'https://strict.local/schemas/extract.pdf_dom.output.json',
  },
  {
    tool_id: 'extract.image_segments',
    version: '1.0.0',
    determinism_level: 'HARD',
    fidelity_target: 'PIXEL_0',
    editable_guarantee: true,
    required_permissions: ['read:assets'],
    input_schema_ref: 'https://strict.local/schemas/extract.image_segments.input.json',
    output_schema_ref: 'https://strict.local/schemas/extract.image_segments.output.json',
  },
  {
    tool_id: 'cdr.build_design_from_pdf',
    version: '1.0.0',
    determinism_level: 'HARD',
    fidelity_target: 'PIXEL_0',
    editable_guarantee: true,
    required_permissions: ['read:assets', 'write:cdr'],
    input_schema_ref: 'https://strict.local/schemas/cdr.build_design_from_pdf.input.json',
    output_schema_ref: 'https://strict.local/schemas/cdr.build_design_from_pdf.output.json',
  },
  {
    tool_id: 'cdr.build_design_from_image',
    version: '1.0.0',
    determinism_level: 'HARD',
    fidelity_target: 'PIXEL_0',
    editable_guarantee: true,
    required_permissions: ['read:assets', 'write:cdr'],
    input_schema_ref: 'https://strict.local/schemas/cdr.build_design_from_image.input.json',
    output_schema_ref: 'https://strict.local/schemas/cdr.build_design_from_image.output.json',
  },
  {
    tool_id: 'cdr.build_table_from_image',
    version: '1.0.0',
    determinism_level: 'HARD',
    fidelity_target: 'PIXEL_0',
    editable_guarantee: true,
    required_permissions: ['read:assets', 'write:cdr'],
    input_schema_ref: 'https://strict.local/schemas/cdr.build_table_from_image.input.json',
    output_schema_ref: 'https://strict.local/schemas/cdr.build_table_from_image.output.json',
  },
  {
    tool_id: 'fonts.embed_full_glyph',
    version: '1.0.0',
    determinism_level: 'HARD',
    fidelity_target: 'PIXEL_0',
    editable_guarantee: true,
    required_permissions: ['read:fonts', 'write:fonts'],
    input_schema_ref: 'https://strict.local/schemas/fonts.embed_full_glyph.input.json',
    output_schema_ref: 'https://strict.local/schemas/fonts.embed_full_glyph.output.json',
  },
  {
    tool_id: 'export.pptx_from_cdr',
    version: '1.0.0',
    determinism_level: 'HARD',
    fidelity_target: 'PIXEL_0',
    editable_guarantee: true,
    required_permissions: ['read:cdr', 'write:artifacts'],
    input_schema_ref: 'https://strict.local/schemas/export.pptx_from_cdr.input.json',
    output_schema_ref: 'https://strict.local/schemas/export.pptx_from_cdr.output.json',
  },
  {
    tool_id: 'export.docx_from_cdr',
    version: '1.0.0',
    determinism_level: 'HARD',
    fidelity_target: 'PIXEL_0',
    editable_guarantee: true,
    required_permissions: ['read:cdr', 'write:artifacts'],
    input_schema_ref: 'https://strict.local/schemas/export.docx_from_cdr.input.json',
    output_schema_ref: 'https://strict.local/schemas/export.docx_from_cdr.output.json',
  },
  {
    tool_id: 'export.xlsx_from_table_cdr',
    version: '1.0.0',
    determinism_level: 'HARD',
    fidelity_target: 'PIXEL_0',
    editable_guarantee: true,
    required_permissions: ['read:cdr', 'write:artifacts'],
    input_schema_ref: 'https://strict.local/schemas/export.xlsx_from_table_cdr.input.json',
    output_schema_ref: 'https://strict.local/schemas/export.xlsx_from_table_cdr.output.json',
  },
  {
    tool_id: 'export.dashboard_from_cdr',
    version: '1.0.0',
    determinism_level: 'HARD',
    fidelity_target: 'PIXEL_0',
    editable_guarantee: true,
    required_permissions: ['read:cdr', 'write:artifacts'],
    input_schema_ref: 'https://strict.local/schemas/export.dashboard_from_cdr.input.json',
    output_schema_ref: 'https://strict.local/schemas/export.dashboard_from_cdr.output.json',
  },
  {
    tool_id: 'render.pdf_to_png',
    version: '1.0.0',
    determinism_level: 'HARD',
    fidelity_target: 'PIXEL_0',
    editable_guarantee: false,
    required_permissions: ['read:assets', 'write:renders'],
    input_schema_ref: 'https://strict.local/schemas/render.any_to_png.input.json',
    output_schema_ref: 'https://strict.local/schemas/render.any_to_png.output.json',
  },
  {
    tool_id: 'render.pptx_to_png',
    version: '1.0.0',
    determinism_level: 'HARD',
    fidelity_target: 'PIXEL_0',
    editable_guarantee: false,
    required_permissions: ['read:artifacts', 'write:renders'],
    input_schema_ref: 'https://strict.local/schemas/render.any_to_png.input.json',
    output_schema_ref: 'https://strict.local/schemas/render.any_to_png.output.json',
  },
  {
    tool_id: 'render.docx_to_png',
    version: '1.0.0',
    determinism_level: 'HARD',
    fidelity_target: 'PIXEL_0',
    editable_guarantee: false,
    required_permissions: ['read:artifacts', 'write:renders'],
    input_schema_ref: 'https://strict.local/schemas/render.any_to_png.input.json',
    output_schema_ref: 'https://strict.local/schemas/render.any_to_png.output.json',
  },
  {
    tool_id: 'render.xlsx_to_png',
    version: '1.0.0',
    determinism_level: 'HARD',
    fidelity_target: 'PIXEL_0',
    editable_guarantee: false,
    required_permissions: ['read:artifacts', 'write:renders'],
    input_schema_ref: 'https://strict.local/schemas/render.any_to_png.input.json',
    output_schema_ref: 'https://strict.local/schemas/render.any_to_png.output.json',
  },
  {
    tool_id: 'render.dashboard_to_png',
    version: '1.0.0',
    determinism_level: 'HARD',
    fidelity_target: 'PIXEL_0',
    editable_guarantee: false,
    required_permissions: ['read:artifacts', 'write:renders'],
    input_schema_ref: 'https://strict.local/schemas/render.any_to_png.input.json',
    output_schema_ref: 'https://strict.local/schemas/render.any_to_png.output.json',
  },
  {
    tool_id: 'verify.pixel_diff',
    version: '1.0.0',
    determinism_level: 'HARD',
    fidelity_target: 'PIXEL_0',
    editable_guarantee: false,
    required_permissions: ['read:renders'],
    input_schema_ref: 'https://strict.local/schemas/verify.pixel_diff.input.json',
    output_schema_ref: 'https://strict.local/schemas/verify.pixel_diff.output.json',
  },
  {
    tool_id: 'verify.structural_equivalence',
    version: '1.0.0',
    determinism_level: 'HARD',
    fidelity_target: 'PIXEL_0',
    editable_guarantee: true,
    required_permissions: ['read:artifacts', 'read:cdr'],
    input_schema_ref: 'https://strict.local/schemas/verify.structural_equivalence.input.json',
    output_schema_ref: 'https://strict.local/schemas/verify.structural_equivalence.output.json',
  },
  {
    tool_id: 'render.validate_determinism',
    version: '1.0.0',
    determinism_level: 'HARD',
    fidelity_target: 'PIXEL_0',
    editable_guarantee: false,
    required_permissions: ['read:renders'],
    input_schema_ref: 'https://strict.local/schemas/render.validate_determinism.input.json',
    output_schema_ref: 'https://strict.local/schemas/render.validate_determinism.output.json',
  },
  {
    tool_id: 'diagnose.diff_attribution',
    version: '1.0.0',
    determinism_level: 'HARD',
    fidelity_target: 'PIXEL_0',
    editable_guarantee: false,
    required_permissions: ['read:renders', 'read:cdr'],
    input_schema_ref: 'https://strict.local/schemas/diagnose.diff_attribution.input.json',
    output_schema_ref: 'https://strict.local/schemas/diagnose.diff_attribution.output.json',
  },
  {
    tool_id: 'repair.quantize_geometry',
    version: '1.0.0',
    determinism_level: 'HARD',
    fidelity_target: 'PIXEL_0',
    editable_guarantee: true,
    required_permissions: ['read:cdr', 'write:cdr'],
    input_schema_ref: 'https://strict.local/schemas/repair.quantize_geometry.input.json',
    output_schema_ref: 'https://strict.local/schemas/repair.quantize_geometry.output.json',
  },
  {
    tool_id: 'repair.adjust_text_metrics',
    version: '1.0.0',
    determinism_level: 'HARD',
    fidelity_target: 'PIXEL_0',
    editable_guarantee: true,
    required_permissions: ['read:cdr', 'write:cdr'],
    input_schema_ref: 'https://strict.local/schemas/repair.adjust_text_metrics.input.json',
    output_schema_ref: 'https://strict.local/schemas/repair.adjust_text_metrics.output.json',
  },
  {
    tool_id: 'repair.loop_controller',
    version: '1.0.0',
    determinism_level: 'HARD',
    fidelity_target: 'PIXEL_0',
    editable_guarantee: true,
    required_permissions: ['read:cdr', 'write:cdr', 'read:renders', 'write:renders', 'write:artifacts'],
    input_schema_ref: 'https://strict.local/schemas/repair.loop_controller.input.json',
    output_schema_ref: 'https://strict.local/schemas/repair.loop_controller.output.json',
  },
];

/**
 * Initialize the registry with all built-in tool definitions.
 * Handlers must be registered separately via registerToolHandler().
 */
export function initializeRegistry(): void {
  for (const def of TOOL_DEFINITIONS) {
    if (!registeredTools.has(def.tool_id)) {
      registeredTools.set(def.tool_id, def);
    }
  }
}

export function registerToolHandler(toolId: string, handler: ToolHandler): void {
  if (!registeredTools.has(toolId)) {
    throw new Error(`Cannot register handler for unregistered tool: ${toolId}`);
  }
  toolHandlers.set(toolId, handler);
}
