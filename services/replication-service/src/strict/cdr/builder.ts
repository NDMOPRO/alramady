/**
 * CDR Builders — Section 6 + B3/B4/B5
 * Build CdrDesign from extracted PDF DOM or Image Segments.
 */

import { randomUUID } from 'crypto';
import type {
  CdrDesign,
  CdrDesignRef,
  CdrDataRef,
  CdrPage,
  CdrLayer,
  CdrElement,
  CdrAsset,
  FontPlan,
  FontPlanEntry,
  PdfDomRef,
  ImageSegRef,
  ImageSegRegion,
  TextElementData,
  TableElementData,
  ChartElementData,
  TransformMatrix,
  Warning,
} from './types';
import { EMU_PER_INCH } from './types';
import { CdrStore } from './store';
import { getPdfDom, type PdfDom, type PdfTextObject } from '../extract/pdf-dom';
import { getImageSegments } from '../extract/image-segments';
import { shapeText } from '../arabic/elite-shaping';
import type { ToolRequest, ToolResponse } from '../tools/registry';

const IDENTITY_TRANSFORM: TransformMatrix = [1, 0, 0, 1, 0, 0];

// ─── Shared store instance ───────────────────────────────────────────
let sharedStore: CdrStore | undefined;

export function setCdrStore(store: CdrStore): void {
  sharedStore = store;
}

function getStore(): CdrStore {
  if (!sharedStore) {
    sharedStore = new CdrStore();
  }
  return sharedStore;
}

// ─── Build CDR from PDF (B3) ─────────────────────────────────────────
export async function handleBuildDesignFromPdf(
  request: ToolRequest<{ pdf_dom: PdfDomRef }, { page_range?: { from: number; to: number } }>
): Promise<ToolResponse<{ cdr_design: CdrDesignRef; font_plan: FontPlan }>> {
  const { pdf_dom } = request.inputs;
  const pdfDom = getPdfDom(pdf_dom);

  if (!pdfDom) {
    return {
      request_id: request.request_id,
      tool_id: 'cdr.build_design_from_pdf',
      status: 'failed',
      refs: {
        cdr_design: { cdr_design_id: '', page_count: 0 },
        font_plan: { fonts: [] },
      },
      warnings: [{ code: 'PDF_DOM_NOT_FOUND', message: 'PDF DOM not found in store', severity: 'error' }],
    };
  }

  const store = getStore();
  const { design, fontPlan } = buildCdrFromPdfDom(pdfDom, request.context.arabic_mode);
  const ref = store.store(design);

  return {
    request_id: request.request_id,
    tool_id: 'cdr.build_design_from_pdf',
    status: 'ok',
    refs: { cdr_design: ref, font_plan: fontPlan },
  };
}

function buildCdrFromPdfDom(
  pdfDom: PdfDom,
  arabicMode: 'BASIC' | 'PROFESSIONAL' | 'ELITE',
): { design: CdrDesign; fontPlan: FontPlan } {
  const fontFamilies = new Set<string>();
  const pages: CdrPage[] = [];
  const assets: CdrAsset[] = [];

  for (const pageDom of pdfDom.pages) {
    const elements: CdrElement[] = [];

    // Convert text objects
    for (const textObj of pageDom.text_objects) {
      fontFamilies.add(textObj.font_name);

      const textElement = buildTextElement(textObj, arabicMode);
      elements.push(textElement);
    }

    // Convert vector paths
    for (const path of pageDom.vector_paths) {
      elements.push({
        element_id: randomUUID(),
        kind: 'shape',
        bbox_emu: {
          x: Math.round(path.transform[4] * EMU_PER_INCH / 72),
          y: Math.round(path.transform[5] * EMU_PER_INCH / 72),
          w: 0,
          h: 0,
        },
        transform_matrix: IDENTITY_TRANSFORM,
        opacity: 1,
        z_index: elements.length,
        constraints: { no_reflow: true },
        ratios: { padding_ratio: 0, margin_ratio: 0, whitespace_ratio: 0 },
        shape: {
          geometry: 'custom_path',
          path_data: path.path_data,
          stroke: path.stroke ? {
            width_emu: Math.round(path.stroke.width * EMU_PER_INCH / 72),
            color: path.stroke.color,
            join: 'miter',
            cap: 'butt',
            dash: path.stroke.dash,
          } : undefined,
          fill: path.fill ? {
            type: 'solid',
            color: path.fill.color,
          } : undefined,
          effects: [],
        },
      });
    }

    // Convert images
    for (const img of pageDom.images) {
      const assetId = randomUUID();
      assets.push({
        asset_id: assetId,
        uri: img.image_ref,
        mime: 'image/png',
        sha256: '',
        size_bytes: 0,
      });

      elements.push({
        element_id: randomUUID(),
        kind: 'image',
        bbox_emu: {
          x: Math.round(img.x * EMU_PER_INCH / 72),
          y: Math.round(img.y * EMU_PER_INCH / 72),
          w: Math.round(img.width * EMU_PER_INCH / 72),
          h: Math.round(img.height * EMU_PER_INCH / 72),
        },
        transform_matrix: IDENTITY_TRANSFORM,
        opacity: 1,
        z_index: elements.length,
        constraints: { no_reflow: true },
        ratios: { padding_ratio: 0, margin_ratio: 0, whitespace_ratio: 0 },
        image: {
          asset_ref: assetId,
          crop: { left: 0, top: 0, right: 0, bottom: 0 },
          mask: { type: 'none' },
          sampling: 'bilinear',
          color_profile: 'sRGB',
          alpha_mode: 'premultiplied',
          exif_orientation_applied: true,
        },
      });
    }

    const layer: CdrLayer = {
      layer_id: randomUUID(),
      z_index: 0,
      transform_matrix: IDENTITY_TRANSFORM,
      opacity: 1,
      blend_mode: 'normal',
      elements,
    };

    pages.push({
      page_id: randomUUID(),
      index: pageDom.page_number,
      size_emu: {
        w: Math.round(pageDom.width * EMU_PER_INCH / 72),
        h: Math.round(pageDom.height * EMU_PER_INCH / 72),
      },
      layers: [layer],
    });
  }

  // Build font plan from extracted fonts
  const fontPlanEntries: FontPlanEntry[] = [];
  for (const family of fontFamilies) {
    const embeddedFont = pdfDom.embedded_fonts.find(f => f.name === family);
    fontPlanEntries.push({
      family,
      status: embeddedFont ? 'embedded' : 'missing',
      font_program_uri: embeddedFont ? `/fonts/embedded/${embeddedFont.name}` : undefined,
      embed_all_glyphs: true,
    });
  }

  const design: CdrDesign = {
    version: '1.0',
    immutable_layout_lock_flag: true,
    conversion_policy_id: 'strict-emu-v1',
    dpi_reference: 300,
    pages,
    assets,
    layout_graph: JSON.stringify({ nodes: pages.length, edges: 0 }),
    constraint_matrix: JSON.stringify({ constraints: [] }),
    fingerprints: { layout_hash: '', structural_hash: '', typography_hash: '', render_intent_hash: '' },
  };

  return { design, fontPlan: { fonts: fontPlanEntries } };
}

function buildTextElement(
  textObj: PdfTextObject,
  arabicMode: 'BASIC' | 'PROFESSIONAL' | 'ELITE',
): CdrElement {
  const runs = [{
    range: { start: 0, end: textObj.text.length },
    font_family: textObj.font_name,
    font_weight: textObj.font_weight,
    font_style: 'normal' as const,
    font_size_emu: Math.round(textObj.font_size * EMU_PER_INCH / 72),
    letter_spacing_emu: 0,
    kerning_enabled: true,
    color: textObj.color,
    script: textObj.direction === 'RTL' ? 'arabic' as const : 'latin' as const,
  }];

  const shaping = shapeText(textObj.text, runs, arabicMode);

  const textData: TextElementData = {
    text: textObj.text,
    direction: textObj.direction === 'RTL' ? 'RTL' : 'LTR',
    alignment: 'start',
    baseline_offset_emu: 0,
    line_height: 1.2,
    wrap: 'none',
    auto_fit: false,
    runs,
    shaping,
    paint: {
      fill: { type: 'solid', color: textObj.color },
    },
  };

  return {
    element_id: randomUUID(),
    kind: 'text',
    bbox_emu: {
      x: Math.round(textObj.x * EMU_PER_INCH / 72),
      y: Math.round(textObj.y * EMU_PER_INCH / 72),
      w: Math.round(textObj.width * EMU_PER_INCH / 72),
      h: Math.round(textObj.height * EMU_PER_INCH / 72),
    },
    transform_matrix: IDENTITY_TRANSFORM,
    opacity: 1,
    z_index: 0,
    constraints: { no_reflow: true },
    ratios: { padding_ratio: 0, margin_ratio: 0, whitespace_ratio: 0 },
    text: textData,
  };
}

// ─── Build CDR from Image (B4) ───────────────────────────────────────
export async function handleBuildDesignFromImage(
  request: ToolRequest<{ image_segments: ImageSegRef }, Record<string, unknown>>
): Promise<ToolResponse<{ cdr_design: CdrDesignRef; font_plan: FontPlan }>> {
  const { image_segments } = request.inputs;
  const store = getStore();

  const elements: CdrElement[] = [];
  const fontFamilies = new Set<string>();

  for (const region of image_segments.regions) {
    const element = buildElementFromRegion(region, request.context.arabic_mode);
    if (element) {
      elements.push(element);
      // Collect font families from text elements
      if (element.text && element.text.text.trim().length > 0) {
        for (const run of element.text.runs) {
          fontFamilies.add(run.font_family);
        }
      }
    }
  }

  const layer: CdrLayer = {
    layer_id: randomUUID(),
    z_index: 0,
    transform_matrix: IDENTITY_TRANSFORM,
    opacity: 1,
    blend_mode: 'normal',
    elements,
  };

  const design: CdrDesign = {
    version: '1.0',
    immutable_layout_lock_flag: true,
    conversion_policy_id: 'strict-emu-v1',
    dpi_reference: 300,
    pages: [{
      page_id: randomUUID(),
      index: 1,
      size_emu: { w: 9144000, h: 6858000 }, // Default 10" x 7.5" (widescreen slide)
      layers: [layer],
    }],
    assets: [],
    layout_graph: JSON.stringify({ nodes: elements.length, edges: 0 }),
    constraint_matrix: JSON.stringify({ constraints: [] }),
    fingerprints: { layout_hash: '', structural_hash: '', typography_hash: '', render_intent_hash: '' },
  };

  const ref = store.store(design);

  const fontPlan: FontPlan = {
    fonts: Array.from(fontFamilies).map(f => ({
      family: f,
      status: 'missing' as const, // Image source — fonts need synthesis
      embed_all_glyphs: true,
    })),
  };

  return {
    request_id: request.request_id,
    tool_id: 'cdr.build_design_from_image',
    status: 'ok',
    refs: { cdr_design: ref, font_plan: fontPlan },
  };
}

function buildElementFromRegion(
  region: ImageSegRegion,
  arabicMode: 'BASIC' | 'PROFESSIONAL' | 'ELITE',
): CdrElement | null {
  const bboxEmu = {
    x: Math.round(region.bbox.x * EMU_PER_INCH / 96), // Assuming 96 DPI screen
    y: Math.round(region.bbox.y * EMU_PER_INCH / 96),
    w: Math.round(region.bbox.w * EMU_PER_INCH / 96),
    h: Math.round(region.bbox.h * EMU_PER_INCH / 96),
  };

  const baseElement: Omit<CdrElement, 'kind'> = {
    element_id: randomUUID(),
    bbox_emu: bboxEmu,
    transform_matrix: IDENTITY_TRANSFORM,
    opacity: 1,
    z_index: 0,
    constraints: { no_reflow: true },
    ratios: { padding_ratio: 0, margin_ratio: 0, whitespace_ratio: 0 },
  };

  switch (region.kind) {
    case 'text':
      return {
        ...baseElement,
        kind: 'text',
        text: {
          text: '', // OCR will fill this
          direction: 'AUTO',
          alignment: 'start',
          baseline_offset_emu: 0,
          line_height: 1.2,
          wrap: 'none',
          auto_fit: false,
          runs: [{
            range: { start: 0, end: 0 },
            font_family: 'Arial', // Will be resolved by FontSynth
            font_weight: 400,
            font_style: 'normal',
            font_size_emu: Math.round(12 * EMU_PER_INCH / 72),
            letter_spacing_emu: 0,
            kerning_enabled: true,
            color: { r: 0, g: 0, b: 0, a: 255 },
            script: 'mixed',
          }],
          shaping: shapeText('', [], arabicMode),
          paint: { fill: { type: 'solid', color: { r: 0, g: 0, b: 0, a: 255 } } },
        },
      };

    case 'table':
      return {
        ...baseElement,
        kind: 'table',
        table: {
          grid: { rows: 0, cols: 0, row_heights_emu: [], col_widths_emu: [] },
          cells: [],
          style: {},
          rtl: false,
        },
      };

    case 'chart':
      return {
        ...baseElement,
        kind: 'chart',
        chart: {
          chart_kind: 'unknown',
          encoding: {},
          style: { colors: [], fonts: {} },
          data_binding: {
            table_id: '',
            mappings: {},
            binding_kind: 'reconstructed_synthetic',
          },
          interaction: { tooltip_fields: [] },
          rtl_axis_inverted: false,
        },
      };

    case 'photo':
    case 'logo':
    case 'figure':
      return {
        ...baseElement,
        kind: 'image',
        image: {
          asset_ref: region.region_id,
          crop: { left: 0, top: 0, right: 0, bottom: 0 },
          mask: { type: 'none' },
          sampling: 'bilinear',
          color_profile: 'sRGB',
          alpha_mode: 'premultiplied',
          exif_orientation_applied: true,
        },
      };

    case 'ui_control':
      return {
        ...baseElement,
        kind: 'container',
        children: [],
      };

    case 'background':
      return {
        ...baseElement,
        kind: 'background_fragment',
      };

    default:
      return null;
  }
}

// ─── Build Table from Image (B5) ─────────────────────────────────────
export async function handleBuildTableFromImage(
  request: ToolRequest<
    { image_segments: ImageSegRef; table_region_id: string },
    { min_ocr_confidence?: number }
  >
): Promise<ToolResponse<{ cdr_design: CdrDesignRef; cdr_data: CdrDataRef }>> {
  const { image_segments, table_region_id } = request.inputs;
  const store = getStore();

  const region = image_segments.regions.find(r => r.region_id === table_region_id);
  if (!region || region.kind !== 'table') {
    return {
      request_id: request.request_id,
      tool_id: 'cdr.build_table_from_image',
      status: 'failed',
      refs: {
        cdr_design: { cdr_design_id: '', page_count: 0 },
        cdr_data: { cdr_data_id: '', table_count: 0 },
      },
    };
  }

  // Build table CDR (Section 8.3 algorithm)
  // In production: detect grid → build cells → OCR → verify → style extract
  const tableId = randomUUID();

  const design: CdrDesign = {
    version: '1.0',
    immutable_layout_lock_flag: true,
    conversion_policy_id: 'strict-emu-v1',
    dpi_reference: 300,
    pages: [{
      page_id: randomUUID(),
      index: 1,
      size_emu: {
        w: Math.round(region.bbox.w * EMU_PER_INCH / 96),
        h: Math.round(region.bbox.h * EMU_PER_INCH / 96),
      },
      layers: [{
        layer_id: randomUUID(),
        z_index: 0,
        transform_matrix: IDENTITY_TRANSFORM,
        opacity: 1,
        blend_mode: 'normal',
        elements: [{
          element_id: randomUUID(),
          kind: 'table',
          bbox_emu: {
            x: 0,
            y: 0,
            w: Math.round(region.bbox.w * EMU_PER_INCH / 96),
            h: Math.round(region.bbox.h * EMU_PER_INCH / 96),
          },
          transform_matrix: IDENTITY_TRANSFORM,
          opacity: 1,
          z_index: 0,
          constraints: { no_reflow: true },
          ratios: { padding_ratio: 0.02, margin_ratio: 0, whitespace_ratio: 0.1 },
          table: {
            grid: { rows: 0, cols: 0, row_heights_emu: [], col_widths_emu: [] },
            cells: [],
            style: {},
            rtl: false,
            binding: tableId,
          },
        }],
      }],
    }],
    assets: [],
    layout_graph: '{}',
    constraint_matrix: '{}',
    fingerprints: { layout_hash: '', structural_hash: '', typography_hash: '', render_intent_hash: '' },
  };

  const designRef = store.store(design);
  const dataRef = store.storeData({
    tables: [{
      table_id: tableId,
      columns: [],
      row_source_ref: '',
      rows: [],
    }],
    lineage_ref: randomUUID(),
  });

  return {
    request_id: request.request_id,
    tool_id: 'cdr.build_table_from_image',
    status: 'ok',
    refs: { cdr_design: designRef, cdr_data: dataRef },
  };
}
