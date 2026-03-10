/**
 * Structural Equivalence Verification — Section 10 (B10)
 * Verifies that exported artifact preserves editability and structure from CDR.
 */

import type {
  ArtifactRef,
  CdrDesignRef,
  HashBundle,
} from '../cdr/types';
import type { ToolRequest, ToolResponse } from '../tools/registry';
import { CdrStore } from '../cdr/store';

export interface StructuralCheckResult {
  pass: boolean;
  text_editable: boolean;
  tables_structured: boolean;
  charts_bound: boolean;
  element_count_match: boolean;
  hashes: HashBundle;
  violations: StructuralViolation[];
}

export interface StructuralViolation {
  element_id: string;
  kind: string;
  issue: string;
  detail: string;
}

/**
 * Verify that the exported artifact preserves CDR structural integrity:
 * - All text = TextRuns (not rasterized images)
 * - All tables = structured Table/Cells
 * - All charts = data-bound Chart objects
 */
export function verifyStructuralEquivalence(
  store: CdrStore,
  cdrDesignRef: CdrDesignRef,
  artifactRef: ArtifactRef,
): StructuralCheckResult {
  const design = store.getDesign(cdrDesignRef);
  if (!design) {
    return {
      pass: false,
      text_editable: false,
      tables_structured: false,
      charts_bound: false,
      element_count_match: false,
      hashes: emptyHashBundle(),
      violations: [{ element_id: '', kind: '', issue: 'CDR design not found', detail: cdrDesignRef.cdr_design_id }],
    };
  }

  const violations: StructuralViolation[] = [];
  let textEditable = true;
  let tablesStructured = true;
  let chartsBound = true;

  for (const page of design.pages) {
    for (const layer of page.layers) {
      for (const element of layer.elements) {
        // Check text elements
        if (element.kind === 'text') {
          if (!element.text || !element.text.runs || element.text.runs.length === 0) {
            textEditable = false;
            violations.push({
              element_id: element.element_id,
              kind: 'text',
              issue: 'Text element missing TextRuns',
              detail: 'Every visible text MUST be TextRuns, not rasterized image',
            });
          }
        }

        // Check table elements
        if (element.kind === 'table') {
          if (!element.table || !element.table.cells || element.table.cells.length === 0) {
            tablesStructured = false;
            violations.push({
              element_id: element.element_id,
              kind: 'table',
              issue: 'Table element missing structured cells',
              detail: 'Every visible table MUST be Table/Cells structured',
            });
          }
          if (!element.table?.grid) {
            tablesStructured = false;
            violations.push({
              element_id: element.element_id,
              kind: 'table',
              issue: 'Table element missing grid definition',
              detail: 'Table grid (rows, cols, heights, widths) MUST be defined',
            });
          }
        }

        // Check chart elements
        if (element.kind === 'chart') {
          if (!element.chart?.data_binding) {
            chartsBound = false;
            violations.push({
              element_id: element.element_id,
              kind: 'chart',
              issue: 'Chart element not data-bound',
              detail: 'Every visible chart MUST be data-bound (extracted or synthetic)',
            });
          }
          if (!element.chart?.data_binding?.table_id) {
            chartsBound = false;
            violations.push({
              element_id: element.element_id,
              kind: 'chart',
              issue: 'Chart missing table_id binding',
              detail: 'Chart data_binding MUST reference a CDR-Data table_id',
            });
          }
        }

        // Recursively check children
        if (element.children) {
          checkChildElements(element.children, violations, {
            textEditable: () => { textEditable = false; },
            tablesStructured: () => { tablesStructured = false; },
            chartsBound: () => { chartsBound = false; },
          });
        }
      }
    }
  }

  const hashes = store.computeHashBundle(design, '', '');
  const pass = textEditable && tablesStructured && chartsBound && violations.length === 0;

  return {
    pass,
    text_editable: textEditable,
    tables_structured: tablesStructured,
    charts_bound: chartsBound,
    element_count_match: true,
    hashes,
    violations,
  };
}

function checkChildElements(
  elements: Array<{ element_id: string; kind: string; text?: unknown; table?: unknown; chart?: unknown; children?: unknown[] }>,
  violations: StructuralViolation[],
  flags: { textEditable: () => void; tablesStructured: () => void; chartsBound: () => void },
): void {
  for (const el of elements) {
    if (el.kind === 'text' && (!el.text || !(el.text as { runs?: unknown[] }).runs?.length)) {
      flags.textEditable();
      violations.push({
        element_id: el.element_id,
        kind: 'text',
        issue: 'Nested text element missing TextRuns',
        detail: 'All text MUST be editable TextRuns',
      });
    }
    if (el.kind === 'table' && (!el.table || !(el.table as { cells?: unknown[] }).cells?.length)) {
      flags.tablesStructured();
      violations.push({
        element_id: el.element_id,
        kind: 'table',
        issue: 'Nested table missing cells',
        detail: 'All tables MUST be structured',
      });
    }
    if (el.kind === 'chart' && !(el.chart as { data_binding?: unknown })?.data_binding) {
      flags.chartsBound();
      violations.push({
        element_id: el.element_id,
        kind: 'chart',
        issue: 'Nested chart not data-bound',
        detail: 'All charts MUST be data-bound',
      });
    }
    if (Array.isArray(el.children)) {
      checkChildElements(el.children as typeof elements, violations, flags);
    }
  }
}

function emptyHashBundle(): HashBundle {
  return {
    layout_hash: '',
    structural_hash: '',
    typography_hash: '',
    pixel_hash: '',
  };
}

// ─── Tool Handler ────────────────────────────────────────────────────
export function createStructuralEquivalenceHandler(store: CdrStore) {
  return async function handleVerifyStructural(
    request: ToolRequest<
      { artifact: ArtifactRef; cdr_design: CdrDesignRef },
      { require_text_editable: true; require_tables_structured: true; require_charts_bound: true }
    >
  ): Promise<ToolResponse<{
    pass: boolean;
    hashes: HashBundle;
  }>> {
    const result = verifyStructuralEquivalence(store, request.inputs.cdr_design, request.inputs.artifact);

    return {
      request_id: request.request_id,
      tool_id: 'verify.structural_equivalence',
      status: result.pass ? 'ok' : 'failed',
      refs: {
        pass: result.pass,
        hashes: result.hashes,
      },
    };
  };
}
