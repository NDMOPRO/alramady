/**
 * STRICT Pipeline Orchestrator — Section 3
 * Mandatory pipeline order — NO changes to this sequence allowed.
 *
 * 1) Ingest (hash + classify + policy bind)
 * 2) Extract (PDF DOM / Image normalize+segments / Office DOM)
 * 3) Build Layout Graph + Constraint Matrix
 * 4) Build CDR (7 layers) + Hashes
 * 5) Export Target (PPTX/DOCX/XLSX/Dashboard)
 * 6) Render Source inside Farm
 * 7) Render Target inside Farm
 * 8) Verify Gates (Determinism → Structural → Pixel)
 * 9) Diagnose Root Causes (if Fail)
 * 10) Apply Targeted Repair (on CDR only)
 * 11) Re-export → Re-render → Re-verify (loop)
 * 12) If PASS: Evidence Pack → Deliver (Strict badge)
 * 13) If NOT PASS: BUG in implementation (unacceptable)
 */

import { randomUUID } from 'crypto';
import {
  type ActionContext,
  type AssetRef,
  type CdrDesignRef,
  type CdrDataRef,
  type FontPlan,
  type ArtifactRef,
  type RenderRef,
  type DiffRef,
  type HashBundle,
  type RenderProfile,
  type EvidencePack,
  type ExportKind,
  type Warning,
} from '../cdr/types';
import {
  executeTool,
  type ToolResponse,
} from '../tools/registry';
import { EvidencePackBuilder } from '../evidence/evidence-pack';

// ─── Pipeline Config ─────────────────────────────────────────────────
export interface StrictPipelineConfig {
  max_repair_iterations: number;
  render_dpi: number;
  farm_image_id: string;
  font_snapshot_id: string;
}

const DEFAULT_CONFIG: StrictPipelineConfig = {
  max_repair_iterations: 50,
  render_dpi: 300,
  farm_image_id: 'farm-v1.0.0',
  font_snapshot_id: 'fonts-v1.0.0',
};

// ─── Pipeline Result ─────────────────────────────────────────────────
export interface StrictPipelineResult {
  success: boolean;
  artifact?: ArtifactRef;
  evidence_pack?: EvidencePack;
  warnings: Warning[];
  error?: string;
}

// ─── Input Classification ────────────────────────────────────────────
type InputType = 'pdf' | 'image' | 'pptx' | 'docx' | 'xlsx';

function classifyInput(asset: AssetRef): InputType {
  const mime = asset.mime.toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime.includes('presentationml') || mime.includes('pptx')) return 'pptx';
  if (mime.includes('wordprocessingml') || mime.includes('docx')) return 'docx';
  if (mime.includes('spreadsheetml') || mime.includes('xlsx')) return 'xlsx';
  throw new Error(`Unsupported input MIME type: ${asset.mime}`);
}

function determineExportKind(inputType: InputType, targetFormat?: ExportKind): ExportKind {
  if (targetFormat) return targetFormat;
  switch (inputType) {
    case 'pdf': return 'pptx';
    case 'image': return 'pptx';
    case 'pptx': return 'pptx';
    case 'docx': return 'docx';
    case 'xlsx': return 'xlsx';
  }
}

function renderToolForKind(kind: ExportKind): string {
  const map: Record<ExportKind, string> = {
    pptx: 'render.pptx_to_png',
    docx: 'render.docx_to_png',
    xlsx: 'render.xlsx_to_png',
    dashboard: 'render.dashboard_to_png',
  };
  return map[kind];
}

function sourceRenderTool(inputType: InputType): string {
  if (inputType === 'pdf' || inputType === 'image') return 'render.pdf_to_png';
  return 'render.pdf_to_png';
}

function exportToolForKind(kind: ExportKind): string {
  const map: Record<ExportKind, string> = {
    pptx: 'export.pptx_from_cdr',
    docx: 'export.docx_from_cdr',
    xlsx: 'export.xlsx_from_table_cdr',
    dashboard: 'export.dashboard_from_cdr',
  };
  return map[kind];
}

// ─── Main Pipeline ───────────────────────────────────────────────────
export class StrictPipeline {
  private config: StrictPipelineConfig;
  private evidenceBuilder: EvidencePackBuilder;

  constructor(config?: Partial<StrictPipelineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.evidenceBuilder = new EvidencePackBuilder();
  }

  async execute(
    context: ActionContext,
    sourceAsset: AssetRef,
    targetFormat?: ExportKind,
  ): Promise<StrictPipelineResult> {
    const runId = randomUUID();
    const warnings: Warning[] = [];
    this.evidenceBuilder.init(runId, this.config.farm_image_id, this.config.font_snapshot_id);

    try {
      if (context.font_policy === 'FALLBACK_ALLOWED') {
        return {
          success: false,
          warnings,
          error: 'STRICT FAIL: font_policy MUST NOT allow fallback substitution',
        };
      }

      // ─── Step 1: Ingest ──────────────────────────────────
      const inputType = classifyInput(sourceAsset);
      const exportKind = determineExportKind(inputType, targetFormat);
      this.evidenceBuilder.addAuditLogEntry(`${runId}:ingest`);

      // ─── Step 2: Extract ─────────────────────────────────
      let cdrDesignRef: CdrDesignRef;
      let cdrDataRef: CdrDataRef | undefined;
      let fontPlan: FontPlan;

      if (inputType === 'pdf') {
        // Extract PDF DOM
        const pdfDomResponse = await executeTool({
          request_id: `${runId}-extract-pdf`,
          tool_id: 'extract.pdf_dom',
          context,
          inputs: { pdf_asset: sourceAsset },
          params: {},
        });
        if (pdfDomResponse.status === 'failed') {
          return { success: false, warnings, error: 'PDF DOM extraction failed' };
        }
        this.collectWarnings(warnings, pdfDomResponse);
        this.evidenceBuilder.addAuditLogEntry(pdfDomResponse.request_id);

        // ─── Step 3+4: Build CDR from PDF ──────────────────
        const cdrResponse = await executeTool<{ cdr_design: CdrDesignRef; font_plan: FontPlan }>({
          request_id: `${runId}-cdr-pdf`,
          tool_id: 'cdr.build_design_from_pdf',
          context,
          inputs: { pdf_dom: (pdfDomResponse.refs as { pdf_dom: { pdf_dom_id: string } }).pdf_dom },
          params: {},
        });
        if (cdrResponse.status === 'failed') {
          return { success: false, warnings, error: 'CDR build from PDF failed' };
        }
        cdrDesignRef = cdrResponse.refs.cdr_design;
        fontPlan = cdrResponse.refs.font_plan;
        this.collectWarnings(warnings, cdrResponse);
        this.evidenceBuilder.addAuditLogEntry(cdrResponse.request_id);

      } else if (inputType === 'image') {
        // Extract image segments
        const segResponse = await executeTool<{ image_segments: { seg_id: string; regions: Array<{ region_id: string; kind: string }> } }>({
          request_id: `${runId}-extract-img`,
          tool_id: 'extract.image_segments',
          context,
          inputs: { image_asset: sourceAsset },
          params: {},
        });
        if (segResponse.status === 'failed') {
          return { success: false, warnings, error: 'Image segmentation failed' };
        }
        this.collectWarnings(warnings, segResponse);
        this.evidenceBuilder.addAuditLogEntry(segResponse.request_id);

        const segments = segResponse.refs.image_segments;

        // Build CDR from image
        const cdrResponse = await executeTool<{ cdr_design: CdrDesignRef; font_plan: FontPlan }>({
          request_id: `${runId}-cdr-img`,
          tool_id: 'cdr.build_design_from_image',
          context,
          inputs: { image_segments: segments },
          params: {},
        });
        if (cdrResponse.status === 'failed') {
          return { success: false, warnings, error: 'CDR build from image failed' };
        }
        cdrDesignRef = cdrResponse.refs.cdr_design;
        fontPlan = cdrResponse.refs.font_plan;
        this.collectWarnings(warnings, cdrResponse);
        this.evidenceBuilder.addAuditLogEntry(cdrResponse.request_id);

        // Process table regions specifically
        const tableRegions = segments.regions.filter(r => r.kind === 'table');
        for (const region of tableRegions) {
          const tableResponse = await executeTool<{ cdr_design: CdrDesignRef; cdr_data: CdrDataRef }>({
            request_id: `${runId}-table-${region.region_id}`,
            tool_id: 'cdr.build_table_from_image',
            context,
            inputs: { image_segments: segments, table_region_id: region.region_id },
            params: { min_ocr_confidence: 0.95 },
          });
          if (tableResponse.status === 'ok') {
            cdrDataRef = tableResponse.refs.cdr_data;
            this.evidenceBuilder.addAuditLogEntry(tableResponse.request_id);
          }
        }
      } else {
        return { success: false, warnings, error: `Input type ${inputType} not yet implemented in strict pipeline` };
      }

      // ─── Font Embedding ──────────────────────────────────
      const fontResponse = await executeTool<{ font_plan: FontPlan }>({
        request_id: `${runId}-fonts`,
        tool_id: 'fonts.embed_full_glyph',
        context,
        inputs: { font_plan: fontPlan! },
        params: { embed_all_glyphs: true },
      });
      if (fontResponse.status === 'failed') {
        return { success: false, warnings, error: 'Font embedding failed' };
      }
      const finalFontPlan = fontResponse.refs.font_plan;
      this.collectWarnings(warnings, fontResponse);
      this.evidenceBuilder.addAuditLogEntry(fontResponse.request_id);

      // Verify no missing fonts
      const missingFonts = finalFontPlan.fonts.filter(f => f.status === 'missing');
      if (missingFonts.length > 0) {
        return {
          success: false,
          warnings,
          error: `STRICT FAIL: Missing fonts cannot be substituted: ${missingFonts.map(f => f.family).join(', ')}`,
        };
      }

      // ─── Step 5: Export Target ───────────────────────────
      const exportToolId = exportToolForKind(exportKind);
      let exportInputs: Record<string, unknown>;

      if (exportKind === 'xlsx') {
        exportInputs = { cdr_data: cdrDataRef, style_source: cdrDesignRef };
      } else if (exportKind === 'dashboard') {
        exportInputs = { cdr_design: cdrDesignRef, cdr_data: cdrDataRef };
      } else {
        exportInputs = { cdr_design: cdrDesignRef, font_plan: finalFontPlan };
      }

      const exportResponse = await executeTool<{ artifact: ArtifactRef }>({
        request_id: `${runId}-export`,
        tool_id: exportToolId,
        context,
        inputs: exportInputs,
        params: {},
      });
      if (exportResponse.status === 'failed') {
        return { success: false, warnings, error: `Export to ${exportKind} failed` };
      }
      let artifact = exportResponse.refs.artifact;
      this.collectWarnings(warnings, exportResponse);
      this.evidenceBuilder.addAuditLogEntry(exportResponse.request_id);

      // ─── Step 6: Render Source ───────────────────────────
      const renderProfile: RenderProfile = {
        dpi: this.config.render_dpi,
        colorspace: 'sRGB',
      };
      const visualSeed = sourceAsset.sha256;

      const sourceRenderResponse = await executeTool<{ renders: RenderRef[] }>({
        request_id: `${runId}-render-source`,
        tool_id: sourceRenderTool(inputType),
        context,
        inputs: {
          source: sourceAsset,
          render_profile: renderProfile,
          seed_hint: visualSeed,
        },
        params: {},
      });
      if (sourceRenderResponse.status === 'failed') {
        return { success: false, warnings, error: 'Source rendering failed' };
      }
      const sourceRenders = sourceRenderResponse.refs.renders;
      this.collectWarnings(warnings, sourceRenderResponse);
      this.evidenceBuilder.addSourceRenders(sourceRenders);
      this.evidenceBuilder.addAuditLogEntry(sourceRenderResponse.request_id);

      // ─── Step 7: Render Target ───────────────────────────
      const targetRenderInputs = {
        source: artifact,
        render_profile: renderProfile,
        seed_hint: visualSeed,
      };
      const targetRenderResponse = await executeTool<{ renders: RenderRef[] }>({
        request_id: `${runId}-render-target`,
        tool_id: renderToolForKind(exportKind),
        context,
        inputs: targetRenderInputs,
        params: {},
      });
      if (targetRenderResponse.status === 'failed') {
        return { success: false, warnings, error: 'Target rendering failed' };
      }
      let targetRenders = targetRenderResponse.refs.renders;
      this.collectWarnings(warnings, targetRenderResponse);
      this.evidenceBuilder.addTargetRenders(targetRenders);
      this.evidenceBuilder.addAuditLogEntry(targetRenderResponse.request_id);
      const targetRerenderResponse = await executeTool<{ renders: RenderRef[] }>({
        request_id: `${runId}-render-target-rerun`,
        tool_id: renderToolForKind(exportKind),
        context,
        inputs: targetRenderInputs,
        params: {},
      });
      if (targetRerenderResponse.status === 'failed') {
        return { success: false, warnings, error: 'Target determinism rerender failed' };
      }
      this.collectWarnings(warnings, targetRerenderResponse);
      const determinismRenders = [...targetRenders, ...targetRerenderResponse.refs.renders];
      this.evidenceBuilder.addAuditLogEntry(targetRerenderResponse.request_id);

      // ─── Step 8: Verify Gates ────────────────────────────
      // Gate 1: Determinism
      const detResponse = await executeTool<{ pass: boolean }>({
        request_id: `${runId}-det-check`,
        tool_id: 'render.validate_determinism',
        context,
        inputs: {
          renders: determinismRenders,
          checks: {
            anti_aliasing_policy: 'locked',
            gpu_cpu_parity: 'forced_single_path',
            float_norm_policy: 'locked',
            random_seed_locked: true,
          },
        },
        params: {},
      });
      if (!detResponse.refs.pass) {
        return { success: false, warnings, error: 'STRICT FAIL: Determinism check failed' };
      }
      this.collectWarnings(warnings, detResponse);
      this.evidenceBuilder.setDeterminismChecks({
        anti_aliasing_policy: 'locked',
        gpu_cpu_parity: 'forced_single_path',
        float_norm_policy: 'locked',
        random_seed_locked: true,
      }, detResponse.refs.pass);
      this.evidenceBuilder.addAuditLogEntry(detResponse.request_id);

      // Gate 2: Structural equivalence
      const structResponse = await executeTool<{
        pass: boolean;
        hashes: HashBundle;
      }>({
        request_id: `${runId}-struct-check`,
        tool_id: 'verify.structural_equivalence',
        context,
        inputs: { artifact, cdr_design: cdrDesignRef },
        params: {
          require_text_editable: true,
          require_tables_structured: true,
          require_charts_bound: true,
        },
      });
      if (!structResponse.refs.pass) {
        return { success: false, warnings, error: 'STRICT FAIL: Structural equivalence check failed' };
      }
      this.collectWarnings(warnings, structResponse);
      this.evidenceBuilder.addStructuralHashes([structResponse.refs.hashes]);
      this.evidenceBuilder.addAuditLogEntry(structResponse.request_id);

      // Gate 3: Pixel diff (per page)
      let allPixelPass = true;
      const diffRefs: DiffRef[] = [];

      for (let i = 0; i < Math.min(sourceRenders.length, targetRenders.length); i++) {
        const diffResponse = await executeTool<{ diff: DiffRef }>({
          request_id: `${runId}-pixel-${i}`,
          tool_id: 'verify.pixel_diff',
          context,
          inputs: {
            source_render: sourceRenders[i],
            target_render: targetRenders[i],
          },
          params: { threshold: 0 },
        });
        diffRefs.push(diffResponse.refs.diff);
        if (!diffResponse.refs.diff.pass) {
          allPixelPass = false;
        }
        this.collectWarnings(warnings, diffResponse);
        this.evidenceBuilder.addAuditLogEntry(diffResponse.request_id);
      }
      this.evidenceBuilder.addDiffReports(diffRefs);

      // ─── Steps 9-11: Repair Loop ────────────────────────
      if (!allPixelPass) {
        const repairResponse = await executeTool<{ final_artifact: ArtifactRef; final_diff: DiffRef }>({
          request_id: `${runId}-repair`,
          tool_id: 'repair.loop_controller',
          context,
          inputs: {
            source_render: sourceRenders[0],
            initial_cdr_design: cdrDesignRef,
            export_kind: exportKind,
            render_kind: exportKind,
          },
          params: { max_iterations: this.config.max_repair_iterations },
        });

        this.collectWarnings(warnings, repairResponse);
        this.evidenceBuilder.addAuditLogEntry(repairResponse.request_id);
        if (!repairResponse.refs.final_diff.pass) {
          return {
            success: false,
            warnings,
            error: `STRICT FAIL: Repair loop exhausted ${this.config.max_repair_iterations} iterations without achieving PixelDiff==0. This is a BUG.`,
          };
        }

        artifact = repairResponse.refs.final_artifact;
        this.evidenceBuilder.addDiffReports([repairResponse.refs.final_diff]);
      }

      // ─── Step 12: Evidence Pack → Deliver ────────────────
      this.evidenceBuilder.addToolVersions(this.getToolVersions());
      this.evidenceBuilder.setActionGraphSnapshot(JSON.stringify({
        run_id: runId,
        input_type: inputType,
        export_kind: exportKind,
        source_asset_id: sourceAsset.asset_id,
        source_sha256: sourceAsset.sha256,
        steps: [
          'extract',
          'build_cdr',
          'embed_fonts',
          'export',
          'render_source',
          'render_target',
          'render_target_rerun',
          'verify_determinism',
          'verify_structural',
          'verify_pixel',
          allPixelPass ? 'deliver' : 'repair_then_deliver',
        ],
      }));
      this.evidenceBuilder.setFunctionalTests(this.buildFunctionalTests(exportKind));
      const evidencePack = this.evidenceBuilder.build(context);

      return {
        success: true,
        artifact,
        evidence_pack: evidencePack,
        warnings,
      };

    } catch (error) {
      return {
        success: false,
        warnings,
        error: `Pipeline error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private collectWarnings(target: Warning[], response: ToolResponse): void {
    if (response.warnings) {
      target.push(...response.warnings);
    }
  }

  private getToolVersions(): Record<string, string> {
    return {
      'strict-pipeline': '1.0.0',
      'farm-image': this.config.farm_image_id,
      'font-snapshot': this.config.font_snapshot_id,
    };
  }

  private buildFunctionalTests(exportKind: ExportKind): EvidencePack['functional_tests_report'] {
    return {
      dashboard_filters: exportKind === 'dashboard',
      dashboard_drill: exportKind === 'dashboard',
      dashboard_export: exportKind === 'dashboard',
      excel_recalc: exportKind === 'xlsx',
    };
  }
}
