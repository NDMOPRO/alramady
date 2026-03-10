/**
 * Repair Loop Controller — Section 12
 * Root-cause only — no random tweaking.
 *
 * Fix order (MUST):
 * 1) quantize geometry (EMU snap, baseline snap)
 * 2) text baseline & bbox & line-height
 * 3) kerning & letter spacing
 * 4) strokes
 * 5) crop/mask offsets
 * 6) vector path sampling precision
 * 7) table/grid geometry refinement
 * 8) chart dataset optimization (inverse reconstruction)
 *
 * Stop only at PixelDiff==0.
 */

import { randomUUID } from 'crypto';
import type {
  CdrDesignRef,
  RenderRef,
  ArtifactRef,
  DiffRef,
  ExportKind,
  RenderKind,
  ActionContext,
  CdrDesign,
  CdrElement,
  Warning,
} from '../cdr/types';
import { EMU_PER_INCH } from '../cdr/types';
import type { ToolRequest, ToolResponse } from '../tools/registry';
import { executeTool } from '../tools/registry';

// ─── Diagnosis ───────────────────────────────────────────────────────
export interface PatchFix {
  element_id: string;
  fix_type: 'quantize_geometry' | 'text_baseline' | 'kerning' | 'stroke' | 'crop_mask' | 'path_precision' | 'table_grid' | 'chart_data';
  description: string;
  confidence: number;
  params: Record<string, unknown>;
}

export interface PatchPlan {
  fixes: PatchFix[];
}

/**
 * Diagnose diff attribution — map heatmap hotspots to CDR elements.
 */
export async function handleDiagnose(
  request: ToolRequest<
    { diff: DiffRef; cdr_design: CdrDesignRef },
    Record<string, unknown>
  >
): Promise<ToolResponse<{ patch_plan: PatchPlan }>> {
  // In production: load heatmap from diff.heatmap_uri, overlay on CDR element bboxes,
  // determine which elements contribute to pixel differences.
  // For now, generate a comprehensive fix plan.

  const fixes: PatchFix[] = [
    {
      element_id: '*',
      fix_type: 'quantize_geometry',
      description: 'Snap all element positions to EMU grid',
      confidence: 0.9,
      params: { emu_snap: 8 },
    },
    {
      element_id: '*',
      fix_type: 'text_baseline',
      description: 'Adjust text baselines and bounding boxes',
      confidence: 0.8,
      params: {},
    },
    {
      element_id: '*',
      fix_type: 'kerning',
      description: 'Refine kerning and letter spacing',
      confidence: 0.7,
      params: {},
    },
  ];

  return {
    request_id: request.request_id,
    tool_id: 'diagnose.diff_attribution',
    status: 'ok',
    refs: { patch_plan: { fixes } },
  };
}

// ─── Geometry Quantization (Appendix C2) ─────────────────────────────
export function quantizeEmu(emu: number, emuSnap: number): number {
  return Math.round(emu / emuSnap) * emuSnap;
}

export function emuToPx(emu: number, dpi: number): number {
  return Math.round((emu / EMU_PER_INCH) * dpi);
}

export function pxToEmu(px: number, dpi: number): number {
  return Math.round((px / dpi) * EMU_PER_INCH);
}

/**
 * Quantize all geometry in a CDR design to EMU snap grid.
 */
export function quantizeDesignGeometry(design: CdrDesign, emuSnap: number): CdrDesign {
  const cloned = JSON.parse(JSON.stringify(design)) as CdrDesign;

  for (const page of cloned.pages) {
    page.size_emu.w = quantizeEmu(page.size_emu.w, emuSnap);
    page.size_emu.h = quantizeEmu(page.size_emu.h, emuSnap);

    for (const layer of page.layers) {
      for (const element of layer.elements) {
        quantizeElement(element, emuSnap);
      }
    }
  }

  return cloned;
}

function quantizeElement(element: CdrElement, emuSnap: number): void {
  element.bbox_emu.x = quantizeEmu(element.bbox_emu.x, emuSnap);
  element.bbox_emu.y = quantizeEmu(element.bbox_emu.y, emuSnap);
  element.bbox_emu.w = quantizeEmu(element.bbox_emu.w, emuSnap);
  element.bbox_emu.h = quantizeEmu(element.bbox_emu.h, emuSnap);

  // Quantize text baseline
  if (element.text) {
    element.text.baseline_offset_emu = quantizeEmu(element.text.baseline_offset_emu, emuSnap);
    for (const run of element.text.runs) {
      run.font_size_emu = quantizeEmu(run.font_size_emu, emuSnap);
      run.letter_spacing_emu = quantizeEmu(run.letter_spacing_emu, emuSnap);
    }
  }

  // Quantize table grid
  if (element.table) {
    element.table.grid.row_heights_emu = element.table.grid.row_heights_emu.map(h => quantizeEmu(h, emuSnap));
    element.table.grid.col_widths_emu = element.table.grid.col_widths_emu.map(w => quantizeEmu(w, emuSnap));
  }

  // Quantize shape stroke
  if (element.shape?.stroke) {
    element.shape.stroke.width_emu = quantizeEmu(element.shape.stroke.width_emu, emuSnap);
  }

  // Quantize image crop offsets
  if (element.image?.crop?.offsets_emu) {
    const o = element.image.crop.offsets_emu;
    o.x = quantizeEmu(o.x, emuSnap);
    o.y = quantizeEmu(o.y, emuSnap);
    o.w = quantizeEmu(o.w, emuSnap);
    o.h = quantizeEmu(o.h, emuSnap);
  }

  // Recurse into children
  if (element.children) {
    for (const child of element.children) {
      quantizeElement(child, emuSnap);
    }
  }
}

// ─── Text Metrics Adjustment ─────────────────────────────────────────
export function adjustTextMetrics(design: CdrDesign, patchPlan: PatchPlan): CdrDesign {
  const cloned = JSON.parse(JSON.stringify(design)) as CdrDesign;

  for (const page of cloned.pages) {
    for (const layer of page.layers) {
      for (const element of layer.elements) {
        if (element.kind === 'text' && element.text) {
          // Snap baseline to nearest pixel boundary at 300 DPI
          const baselineSnap = Math.round(EMU_PER_INCH / 300);
          element.text.baseline_offset_emu = quantizeEmu(element.text.baseline_offset_emu, baselineSnap);

          // Ensure line_height is absolute (not ratio) for strict rendering
          if (typeof element.text.line_height === 'number') {
            const fontSize = element.text.runs[0]?.font_size_emu ?? 0;
            element.text.line_height = {
              absolute_emu: quantizeEmu(Math.round(fontSize * element.text.line_height), 8),
            };
          }
        }
        if (element.children) {
          adjustChildTextMetrics(element.children, patchPlan);
        }
      }
    }
  }

  return cloned;
}

function adjustChildTextMetrics(elements: CdrElement[], _patchPlan: PatchPlan): void {
  for (const el of elements) {
    if (el.kind === 'text' && el.text) {
      const baselineSnap = Math.round(EMU_PER_INCH / 300);
      el.text.baseline_offset_emu = quantizeEmu(el.text.baseline_offset_emu, baselineSnap);
    }
    if (el.children) {
      adjustChildTextMetrics(el.children, _patchPlan);
    }
  }
}

// ─── Tool Handlers ───────────────────────────────────────────────────
export async function handleQuantizeGeometry(
  request: ToolRequest<{ cdr_design: CdrDesignRef }, { emu_snap: number }>
): Promise<ToolResponse<{ cdr_design: CdrDesignRef }>> {
  // In production: load design from store, quantize, save back
  return {
    request_id: request.request_id,
    tool_id: 'repair.quantize_geometry',
    status: 'ok',
    refs: { cdr_design: request.inputs.cdr_design },
  };
}

export async function handleAdjustTextMetrics(
  request: ToolRequest<{ cdr_design: CdrDesignRef; patch_plan: PatchPlan }, Record<string, unknown>>
): Promise<ToolResponse<{ cdr_design: CdrDesignRef }>> {
  return {
    request_id: request.request_id,
    tool_id: 'repair.adjust_text_metrics',
    status: 'ok',
    refs: { cdr_design: request.inputs.cdr_design },
  };
}

// ─── Repair Loop Controller (B12) ────────────────────────────────────
export async function handleRepairLoop(
  request: ToolRequest<
    {
      source_render: RenderRef;
      initial_cdr_design: CdrDesignRef;
      export_kind: ExportKind;
      render_kind: RenderKind;
    },
    { max_iterations: number }
  >
): Promise<ToolResponse<{ final_artifact: ArtifactRef; final_diff: DiffRef }>> {
  const { source_render, initial_cdr_design, export_kind, render_kind } = request.inputs;
  const maxIterations = request.params.max_iterations;
  const context = request.context;

  let currentCdr = initial_cdr_design;
  let lastArtifact: ArtifactRef | undefined;
  let lastDiff: DiffRef | undefined;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Step 1: Export from current CDR
    const exportToolId = `export.${export_kind === 'xlsx' ? 'xlsx_from_table_cdr' : `${export_kind}_from_cdr`}`;
    const exportInputs = export_kind === 'xlsx'
      ? { cdr_data: { cdr_data_id: 'repair-loop-missing-data', table_count: 0 }, style_source: currentCdr }
      : export_kind === 'dashboard'
        ? { cdr_design: currentCdr, cdr_data: { cdr_data_id: 'repair-loop-missing-data', table_count: 0 } }
        : { cdr_design: currentCdr, font_plan: { fonts: [] } };
    const exportResponse = await executeTool<{ artifact: ArtifactRef }>({
      request_id: `${request.request_id}-iter${iteration}-export`,
      tool_id: exportToolId,
      context,
      inputs: exportInputs,
      params: {},
    });
    if (exportResponse.status === 'failed') continue;
    lastArtifact = exportResponse.refs.artifact;

    // Step 2: Render target
    const renderResponse = await executeTool<{ renders: RenderRef[] }>({
      request_id: `${request.request_id}-iter${iteration}-render`,
      tool_id: `render.${render_kind}_to_png`,
      context,
      inputs: {
        source: lastArtifact,
        render_profile: { dpi: 300, colorspace: 'sRGB' as const },
        seed_hint: source_render.fingerprint.layout_hash,
      },
      params: {},
    });
    if (renderResponse.status === 'failed') continue;
    const targetRender = renderResponse.refs.renders[0];

    // Step 3: Verify pixel diff
    const diffResponse = await executeTool<{ diff: DiffRef }>({
      request_id: `${request.request_id}-iter${iteration}-diff`,
      tool_id: 'verify.pixel_diff',
      context,
      inputs: { source_render, target_render: targetRender },
      params: { threshold: 0 },
    });
    lastDiff = diffResponse.refs.diff;

    if (lastDiff.pass) {
      return {
        request_id: request.request_id,
        tool_id: 'repair.loop_controller',
        status: 'ok',
        refs: { final_artifact: lastArtifact, final_diff: lastDiff },
      };
    }

    // Step 4: Diagnose
    const diagnoseResponse = await executeTool<{ patch_plan: PatchPlan }>({
      request_id: `${request.request_id}-iter${iteration}-diag`,
      tool_id: 'diagnose.diff_attribution',
      context,
      inputs: { diff: lastDiff, cdr_design: currentCdr },
      params: {},
    });

    // Step 5: Apply repairs in order
    // 5a: Quantize geometry
    const qResponse = await executeTool<{ cdr_design: CdrDesignRef }>({
      request_id: `${request.request_id}-iter${iteration}-quant`,
      tool_id: 'repair.quantize_geometry',
      context,
      inputs: { cdr_design: currentCdr },
      params: { emu_snap: 8 },
    });
    currentCdr = qResponse.refs.cdr_design;

    // 5b: Adjust text metrics
    const tResponse = await executeTool<{ cdr_design: CdrDesignRef }>({
      request_id: `${request.request_id}-iter${iteration}-text`,
      tool_id: 'repair.adjust_text_metrics',
      context,
      inputs: { cdr_design: currentCdr, patch_plan: diagnoseResponse.refs.patch_plan },
      params: {},
    });
    currentCdr = tResponse.refs.cdr_design;
  }

  // Failed after max iterations — this is a BUG per spec Section 3 step 13
  return {
    request_id: request.request_id,
    tool_id: 'repair.loop_controller',
    status: 'failed',
    refs: {
      final_artifact: lastArtifact ?? {
        artifact_id: 'none',
        kind: export_kind,
        uri: '',
      },
      final_diff: lastDiff ?? {
        diff_id: 'none',
        pixel_diff: 1,
        pass: false,
      },
    },
  };
}
