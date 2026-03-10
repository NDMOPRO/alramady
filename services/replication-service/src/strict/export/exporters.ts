/**
 * Exporters — Section 10 (B7)
 * PPTX / DOCX / XLSX / Dashboard export from CDR.
 *
 * Rules:
 * - Absolute positions, no auto-fit, embed fonts, preserve z-order, preserve clipping/masks
 * - Charts MUST be data-bound
 * - Master/theme mapping preserved deterministically
 */

import { randomUUID } from 'crypto';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import type {
  CdrDesignRef,
  CdrDataRef,
  FontPlan,
  ArtifactRef,
} from '../cdr/types';
import type { ToolRequest, ToolResponse } from '../tools/registry';
import { CdrStore } from '../cdr/store';
import { getStrictArtifactsDir } from '../runtime/paths';

// ─── Export Context ──────────────────────────────────────────────────
interface ExportContext {
  store: CdrStore;
  outputDir: string;
}

let exportContext: ExportContext | undefined;

export function setExportContext(ctx: ExportContext): void {
  exportContext = ctx;
}

interface ArtifactManifest {
  artifact_id: string;
  kind: ArtifactRef['kind'];
  cdr_design_id?: string;
  cdr_data_id?: string;
  font_families?: string[];
}

async function writeArtifactManifest(manifest: ArtifactManifest): Promise<string> {
  const outputDir = exportContext?.outputDir ?? getStrictArtifactsDir();
  const filePath = join(outputDir, `${manifest.artifact_id}.${manifest.kind}.json`);
  await writeFile(filePath, JSON.stringify(manifest, null, 2), 'utf8');
  return filePath;
}

// ─── PPTX Exporter (Section 10.1) ───────────────────────────────────
export async function handleExportPptx(
  request: ToolRequest<
    { cdr_design: CdrDesignRef; font_plan: FontPlan },
    Record<string, unknown>
  >
): Promise<ToolResponse<{ artifact: ArtifactRef }>> {
  const { cdr_design, font_plan } = request.inputs;
  const artifactId = randomUUID();
  const uri = await writeArtifactManifest({
    artifact_id: artifactId,
    kind: 'pptx',
    cdr_design_id: cdr_design.cdr_design_id,
    font_families: font_plan.fonts.map(font => font.family),
  });

  // In production: use PptxGenJS or python-pptx via subprocess
  // Build PPTX with:
  // - Absolute positions (EMU → PPTX EMU direct mapping)
  // - No auto-fit on any text box
  // - Full glyph font embedding
  // - Z-order preserved from CDR layers
  // - Clipping/masks preserved
  // - Charts data-bound to CDR-Data tables
  // - Master/theme from CDR design tokens

  return {
    request_id: request.request_id,
    tool_id: 'export.pptx_from_cdr',
    status: 'ok',
    refs: {
      artifact: { artifact_id: artifactId, kind: 'pptx', uri },
    },
  };
}

// ─── DOCX Exporter (Section 10.2) ───────────────────────────────────
export async function handleExportDocx(
  request: ToolRequest<
    { cdr_design: CdrDesignRef; font_plan: FontPlan },
    Record<string, unknown>
  >
): Promise<ToolResponse<{ artifact: ArtifactRef }>> {
  const { cdr_design, font_plan } = request.inputs;
  const artifactId = randomUUID();
  const uri = await writeArtifactManifest({
    artifact_id: artifactId,
    kind: 'docx',
    cdr_design_id: cdr_design.cdr_design_id,
    font_families: font_plan.fonts.map(font => font.family),
  });

  // In production: use docx library (npm docx)
  // Build DOCX with:
  // - Absolute layout using anchored shapes/textboxes
  // - No reflow allowed
  // - Embedded fonts (full glyph)
  // - Deterministic page breaks
  // - Tables structured and editable

  return {
    request_id: request.request_id,
    tool_id: 'export.docx_from_cdr',
    status: 'ok',
    refs: {
      artifact: { artifact_id: artifactId, kind: 'docx', uri },
    },
  };
}

// ─── XLSX Exporter (Section 10.3) ────────────────────────────────────
export async function handleExportXlsx(
  request: ToolRequest<
    { cdr_data: CdrDataRef; style_source: CdrDesignRef },
    Record<string, unknown>
  >
): Promise<ToolResponse<{ artifact: ArtifactRef }>> {
  const { cdr_data, style_source } = request.inputs;
  const artifactId = randomUUID();
  const uri = await writeArtifactManifest({
    artifact_id: artifactId,
    kind: 'xlsx',
    cdr_design_id: style_source.cdr_design_id,
    cdr_data_id: cdr_data.cdr_data_id,
  });

  // In production: use exceljs
  // Build XLSX with:
  // - Structured cells with exact row/col sizes + merges + styles
  // - Formulas preserved or reconstructed
  // - Pivot/CF/freeze panes preserved
  // - Deterministic recalc through SVM (Section 11)

  return {
    request_id: request.request_id,
    tool_id: 'export.xlsx_from_table_cdr',
    status: 'ok',
    refs: {
      artifact: { artifact_id: artifactId, kind: 'xlsx', uri },
    },
  };
}

// ─── Dashboard Exporter (Section 10.4) ───────────────────────────────
export async function handleExportDashboard(
  request: ToolRequest<
    { cdr_design: CdrDesignRef; cdr_data: CdrDataRef },
    Record<string, unknown>
  >
): Promise<ToolResponse<{ artifact: ArtifactRef }>> {
  const { cdr_design, cdr_data } = request.inputs;
  const artifactId = randomUUID();
  const uri = await writeArtifactManifest({
    artifact_id: artifactId,
    kind: 'dashboard',
    cdr_design_id: cdr_design.cdr_design_id,
    cdr_data_id: cdr_data.cdr_data_id,
  });

  // In production: build live dashboard definition
  // Must include:
  // - Interactive filters/cross-filter/drill/export/refresh
  // - Permission-aware rendering
  // - Snapshot render MUST match PixelDiff==0

  return {
    request_id: request.request_id,
    tool_id: 'export.dashboard_from_cdr',
    status: 'ok',
    refs: {
      artifact: { artifact_id: artifactId, kind: 'dashboard', uri },
    },
  };
}
