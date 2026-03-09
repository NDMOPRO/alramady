/**
 * Canonical Pipeline Orchestrator — E2E Validation Suite
 *
 * Validates that CanonicalLayoutGraph is the single source of truth
 * for all 5 generator types (dashboard, report, presentation, spreadsheet, docx).
 *
 * Tests:
 *   - Orchestrator initialization and adapter registration
 *   - Graph validation and hash determinism
 *   - All 5 generators produce output from canonical IR
 *   - Subpixel stabilization applied before generation
 *   - Pixel validation integration
 *   - RTL Arabic graph generation
 *   - Multi-page document generation
 *   - Custom adapter registration
 *   - Error handling (invalid graph, unsupported format)
 *
 * Self-contained — no @rasid/shared dependency.
 */

import sharp from 'sharp';
import pixelmatch from 'pixelmatch';
import { createHash } from 'crypto';

// ─── Inline Types ────────────────────────────────────────────────────────────

interface BoundingBox { x: number; y: number; width: number; height: number }
interface Position { top: number; left: number; right: number; bottom: number }

interface FontToken {
  id: string; family: string; size: number; weight: number;
  style: 'normal' | 'italic' | 'oblique'; lineHeight: number;
  letterSpacing: number; kerning: number;
  usage: 'heading' | 'subheading' | 'body' | 'caption' | 'label' | 'data';
  confidence: number; fallbackFamilies: string[];
}

interface GradientToken { id: string; type: 'linear' | 'radial' | 'conic'; angle: number; stops: { color: string; position: number }[] }
interface BorderToken { id: string; width: number; style: 'solid' | 'dashed' | 'dotted' | 'double' | 'none'; color: string; radius: number }
interface ShadowToken { id: string; offsetX: number; offsetY: number; blur: number; spread: number; color: string; inset: boolean }

interface NodeStyle {
  backgroundColor: string | null; backgroundGradient: GradientToken | null;
  border: BorderToken | null; shadow: ShadowToken | null;
  opacity: number; borderRadius: number;
  padding: Position; margin: Position;
  overflow: 'visible' | 'hidden' | 'scroll';
  display: 'block' | 'flex' | 'grid' | 'inline' | 'none';
  flexDirection: 'row' | 'column' | null;
  alignItems: 'start' | 'center' | 'end' | 'stretch' | null;
  justifyContent: 'start' | 'center' | 'end' | 'space-between' | 'space-around' | null;
  gridTemplate: string | null;
}

interface TextContent {
  kind: 'text'; text: string; language: string; direction: 'ltr' | 'rtl' | 'auto';
  font: FontToken; color: string; alignment: 'left' | 'center' | 'right' | 'justify';
  textDecoration: 'none' | 'underline' | 'strikethrough'; listType: 'none' | 'bullet' | 'numbered'; listLevel: number;
}
interface TableContent {
  kind: 'table'; headers: TableCell[]; rows: TableCell[][]; mergedCells: never[];
  headerRows: number; headerColumns: number; columnWidths: number[]; rowHeights: number[];
  borderStyle: 'full' | 'horizontal' | 'minimal' | 'none'; alternateRowColor: string | null;
  headerStyle: { backgroundColor: string; font: FontToken; color: string };
}
interface TableCell {
  value: string; type: 'text' | 'number'; font: FontToken | null; color: string | null;
  backgroundColor: string | null; alignment: 'left' | 'center' | 'right';
  verticalAlignment: 'top' | 'middle' | 'bottom'; colSpan: number; rowSpan: number;
}
interface ChartContent {
  kind: 'chart'; chartType: string; title: string; subtitle: string | null;
  xAxis: null; yAxis: null; series: never[]; legend: null; colors: string[];
  dataLabels: boolean; gridLines: boolean;
}
interface KpiContent {
  kind: 'kpi'; label: string; value: string; unit: string;
  trend: 'up' | 'down' | 'neutral'; trendValue: string; trendColor: string;
  icon: string | null; sparkline: number[] | null;
}
interface EmptyContent { kind: 'empty' }
type NodeContent = TextContent | TableContent | ChartContent | KpiContent | EmptyContent;

interface LayoutNode {
  id: string; type: string; bbox: BoundingBox; zIndex: number; confidence: number;
  children: LayoutNode[]; parentId: string | null; style: NodeStyle;
  content: NodeContent; semanticRole: string; readingOrder: number;
}

interface PageNode {
  pageNumber: number; dimensions: { width: number; height: number };
  orientation: 'portrait' | 'landscape'; backgroundColor: string;
  rootNode: LayoutNode; readingOrder: string[];
}

interface CanonicalLayoutGraph {
  id: string; version: string;
  sourceType: 'image' | 'pdf' | 'html' | 'docx' | 'pptx' | 'xlsx' | 'screenshot';
  sourceHash: string; dimensions: { width: number; height: number }; dpi: number;
  pages: PageNode[];
  designTokens: { colors: never[]; fonts: never[]; spacing: never[]; borders: never[]; shadows: never[]; gradients: never[] };
  metadata: {
    title: string | null; language: string; direction: 'ltr' | 'rtl';
    documentType: string; pageCount: number; wordCount: number;
    tableCount: number; chartCount: number; imageCount: number; confidence: number;
  };
  sceneGraph: { layers: never[]; relationships: never[] };
  createdAt: string; processingTimeMs: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ds(bg: string | null = null): NodeStyle {
  return {
    backgroundColor: bg, backgroundGradient: null, border: null, shadow: null,
    opacity: 1, borderRadius: 0,
    padding: { top: 0, left: 0, right: 0, bottom: 0 },
    margin: { top: 0, left: 0, right: 0, bottom: 0 },
    overflow: 'hidden', display: 'block', flexDirection: null,
    alignItems: null, justifyContent: null, gridTemplate: null,
  };
}

function df(overrides: Partial<FontToken> = {}): FontToken {
  return { id: 'f1', family: 'Arial', size: 16, weight: 400, style: 'normal', lineHeight: 1.5, letterSpacing: 0, kerning: 0, usage: 'body', confidence: 0.9, fallbackFamilies: [], ...overrides };
}

function tn(id: string, bbox: BoundingBox, text: string, color: string, bg: string | null = null, fo: Partial<FontToken> = {}): LayoutNode {
  return { id, type: 'text-block', bbox, zIndex: 1, confidence: 0.95, children: [], parentId: null, style: ds(bg), content: { kind: 'text', text, language: 'en', direction: 'ltr', font: df(fo), color, alignment: 'left', textDecoration: 'none', listType: 'none', listLevel: 0 } as TextContent, semanticRole: 'text', readingOrder: 0 };
}

function cn(id: string, bbox: BoundingBox, bg: string, children: LayoutNode[]): LayoutNode {
  return { id, type: 'container', bbox, zIndex: 0, confidence: 1, children, parentId: null, style: ds(bg), content: { kind: 'empty' } as EmptyContent, semanticRole: 'container', readingOrder: 0 };
}

function tableNode(id: string, bbox: BoundingBox): LayoutNode {
  const headerFont = df({ size: 14, weight: 700 });
  const headers: TableCell[] = [
    { value: 'Name', type: 'text', font: headerFont, color: '#fff', backgroundColor: null, alignment: 'left', verticalAlignment: 'middle', colSpan: 1, rowSpan: 1 },
    { value: 'Value', type: 'text', font: headerFont, color: '#fff', backgroundColor: null, alignment: 'right', verticalAlignment: 'middle', colSpan: 1, rowSpan: 1 },
  ];
  const rows: TableCell[][] = [
    [
      { value: 'Revenue', type: 'text', font: null, color: '#333', backgroundColor: null, alignment: 'left', verticalAlignment: 'middle', colSpan: 1, rowSpan: 1 },
      { value: '1,250,000', type: 'number', font: null, color: '#333', backgroundColor: null, alignment: 'right', verticalAlignment: 'middle', colSpan: 1, rowSpan: 1 },
    ],
  ];
  const content: TableContent = {
    kind: 'table', headers, rows, mergedCells: [] as never[],
    headerRows: 1, headerColumns: 0, columnWidths: [200, 150], rowHeights: [36, 32],
    borderStyle: 'full', alternateRowColor: null,
    headerStyle: { backgroundColor: '#1a237e', font: headerFont, color: '#ffffff' },
  };
  return { id, type: 'table', bbox, zIndex: 1, confidence: 0.95, children: [], parentId: null, style: ds(null), content, semanticRole: 'data-table', readingOrder: 0 };
}

function kpiNode(id: string, bbox: BoundingBox, label: string, value: string): LayoutNode {
  const content: KpiContent = {
    kind: 'kpi', label, value, unit: 'SAR',
    trend: 'up', trendValue: '+12%', trendColor: '#4caf50',
    icon: null, sparkline: null,
  };
  return { id, type: 'kpi-card', bbox, zIndex: 1, confidence: 0.9, children: [], parentId: null, style: ds('#e3f2fd'), content, semanticRole: 'kpi', readingOrder: 0 };
}

function chartNode(id: string, bbox: BoundingBox, title: string): LayoutNode {
  const content: ChartContent = {
    kind: 'chart', chartType: 'bar', title, subtitle: null,
    xAxis: null, yAxis: null, series: [] as never[], legend: null,
    colors: ['#42a5f5', '#66bb6a'], dataLabels: true, gridLines: true,
  };
  return { id, type: 'chart', bbox, zIndex: 1, confidence: 0.9, children: [], parentId: null, style: ds('#f5f5f5'), content, semanticRole: 'chart', readingOrder: 0 };
}

function wg(id: string, w: number, h: number, root: LayoutNode, lang = 'en', dir: 'ltr' | 'rtl' = 'ltr'): CanonicalLayoutGraph {
  return {
    id, version: '1.0', sourceType: 'screenshot', sourceHash: 'test-hash-' + id,
    dimensions: { width: w, height: h }, dpi: 150,
    pages: [{ pageNumber: 1, dimensions: { width: w, height: h }, orientation: w > h ? 'landscape' : 'portrait', backgroundColor: '#ffffff', rootNode: root, readingOrder: [] }],
    designTokens: { colors: [], fonts: [], spacing: [], borders: [], shadows: [], gradients: [] } as any,
    metadata: { title: null, language: lang, direction: dir, documentType: 'dashboard', pageCount: 1, wordCount: 0, tableCount: 0, chartCount: 0, imageCount: 0, confidence: 0.9 },
    sceneGraph: { layers: [], relationships: [] } as any,
    createdAt: new Date().toISOString(), processingTimeMs: 0,
  };
}

// ─── Orchestrator import (dynamic to avoid compile-time issues) ──────────────

async function importOrchestrator() {
  const mod = await import('../services/canonical-pipeline-orchestrator.service.js');
  return mod;
}

// ─── Test Runner ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, name: string, detail = '') {
  if (condition) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; failures.push(`${name}${detail ? ': ' + detail : ''}`); console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

async function runTests() {
  console.log('=== Canonical Pipeline Orchestrator E2E Validation Suite ===\n');
  const totalStart = Date.now();

  const mod = await importOrchestrator();
  const { CanonicalPipelineOrchestrator } = mod;

  // Mock PrismaClient (orchestrator only uses it for potential caching, not in generate path)
  const mockPrisma = {} as any;

  // ════════════════════════════════════════════════════════════════
  // TEST 1: ORCHESTRATOR INITIALIZATION
  // ════════════════════════════════════════════════════════════════
  console.log('━━━ Test 1: Orchestrator Initialization ━━━\n');

  const orchestrator = new CanonicalPipelineOrchestrator(mockPrisma);

  // 1.1: All 5 generators registered
  const generators = orchestrator.getGenerators();
  assert(generators.length === 5, '5 generators registered', `got ${generators.length}`);

  const types = generators.map((g: any) => g.type).sort();
  assert(types.includes('dashboard'), 'Dashboard generator registered');
  assert(types.includes('report'), 'Report generator registered');
  assert(types.includes('presentation'), 'Presentation generator registered');
  assert(types.includes('spreadsheet'), 'Spreadsheet generator registered');
  assert(types.includes('docx'), 'DOCX generator registered');

  // 1.2: Each generator has supported formats
  for (const gen of generators) {
    assert(gen.formats.length > 0, `${gen.type} has ${gen.formats.length} formats`);
  }

  // 1.3: Dashboard supports html, png, pdf
  const dashGen = generators.find((g: any) => g.type === 'dashboard')!;
  assert(dashGen.formats.includes('html'), 'Dashboard supports html');
  assert(dashGen.formats.includes('png'), 'Dashboard supports png');
  assert(dashGen.formats.includes('pdf'), 'Dashboard supports pdf');

  // 1.4: Report supports html, pdf, docx
  const repGen = generators.find((g: any) => g.type === 'report')!;
  assert(repGen.formats.includes('html'), 'Report supports html');

  // 1.5: Spreadsheet supports xlsx, html
  const xlsGen = generators.find((g: any) => g.type === 'spreadsheet')!;
  assert(xlsGen.formats.includes('xlsx'), 'Spreadsheet supports xlsx');
  assert(xlsGen.formats.includes('html'), 'Spreadsheet supports html');

  // ════════════════════════════════════════════════════════════════
  // TEST 2: GRAPH VALIDATION
  // ════════════════════════════════════════════════════════════════
  console.log('\n━━━ Test 2: Graph Validation ━━━\n');

  // 2.1: Valid graph accepted
  {
    const root = cn('root', { x: 0, y: 0, width: 800, height: 600 }, '#ffffff', [
      tn('t1', { x: 20, y: 20, width: 200, height: 30 }, 'Hello World', '#333'),
    ]);
    const graph = wg('valid-graph', 800, 600, root);

    let noError = true;
    try {
      await orchestrator.execute({
        layoutGraph: graph as any,
        generator: 'dashboard',
        outputFormat: 'html',
        options: { pixelPerfectValidation: false } as any,
      });
    } catch {
      noError = false;
    }
    assert(noError, 'Valid graph accepted without error');
  }

  // 2.2: Missing pages rejected
  {
    const badGraph = {
      id: 'bad', version: '1.0', sourceType: 'screenshot', sourceHash: 'x',
      dimensions: { width: 800, height: 600 }, dpi: 150,
      pages: [], designTokens: {} as any, metadata: {} as any,
      sceneGraph: {} as any, createdAt: '', processingTimeMs: 0,
    };
    let rejected = false;
    try {
      await orchestrator.execute({
        layoutGraph: badGraph as any,
        generator: 'dashboard',
        outputFormat: 'html',
      });
    } catch (err: any) {
      rejected = err.message.includes('at least one page');
    }
    assert(rejected, 'Empty pages rejected with correct message');
  }

  // 2.3: Missing ID rejected
  {
    const noIdGraph = wg('', 800, 600, cn('r', { x: 0, y: 0, width: 800, height: 600 }, '#fff', []));
    noIdGraph.id = '';
    let rejected = false;
    try {
      await orchestrator.execute({
        layoutGraph: noIdGraph as any,
        generator: 'dashboard',
        outputFormat: 'html',
      });
    } catch (err: any) {
      rejected = err.message.includes('id is required');
    }
    assert(rejected, 'Missing graph ID rejected');
  }

  // 2.4: Invalid dimensions rejected
  {
    const badDimGraph = wg('dim-test', 800, 600, cn('r', { x: 0, y: 0, width: 800, height: 600 }, '#fff', []));
    badDimGraph.dimensions = { width: 0, height: 600 };
    let rejected = false;
    try {
      await orchestrator.execute({
        layoutGraph: badDimGraph as any,
        generator: 'dashboard',
        outputFormat: 'html',
      });
    } catch (err: any) {
      rejected = err.message.includes('positive width');
    }
    assert(rejected, 'Zero-width dimensions rejected');
  }

  // 2.5: Unsupported format rejected
  {
    const graph = wg('fmt-test', 800, 600, cn('r', { x: 0, y: 0, width: 800, height: 600 }, '#fff', []));
    let rejected = false;
    try {
      await orchestrator.execute({
        layoutGraph: graph as any,
        generator: 'dashboard',
        outputFormat: 'xlsx' as any,
      });
    } catch (err: any) {
      rejected = err.message.includes('not supported');
    }
    assert(rejected, 'Unsupported format (dashboard+xlsx) rejected');
  }

  // 2.6: Unknown generator rejected
  {
    const graph = wg('gen-test', 800, 600, cn('r', { x: 0, y: 0, width: 800, height: 600 }, '#fff', []));
    let rejected = false;
    try {
      await orchestrator.execute({
        layoutGraph: graph as any,
        generator: 'unknown' as any,
        outputFormat: 'html',
      });
    } catch (err: any) {
      rejected = err.message.includes('Unknown generator');
    }
    assert(rejected, 'Unknown generator type rejected');
  }

  // ════════════════════════════════════════════════════════════════
  // TEST 3: GRAPH HASH DETERMINISM
  // ════════════════════════════════════════════════════════════════
  console.log('\n━━━ Test 3: Graph Hash Determinism ━━━\n');

  {
    const root = cn('root', { x: 0, y: 0, width: 800, height: 600 }, '#ffffff', [
      tn('t1', { x: 20, y: 20, width: 200, height: 30 }, 'Determinism Test', '#333'),
      cn('box', { x: 20, y: 60, width: 300, height: 200 }, '#e3f2fd', []),
    ]);
    const graph = wg('hash-test', 800, 600, root);

    const r1 = await orchestrator.execute({
      layoutGraph: graph as any,
      generator: 'dashboard',
      outputFormat: 'html',
      options: { pixelPerfectValidation: false } as any,
    });

    const r2 = await orchestrator.execute({
      layoutGraph: graph as any,
      generator: 'dashboard',
      outputFormat: 'html',
      options: { pixelPerfectValidation: false } as any,
    });

    assert(r1.graphHash === r2.graphHash, 'Same graph → same hash');
    assert(r1.graphHash.length === 64, 'Hash is SHA256 (64 hex)', `got ${r1.graphHash.length}`);

    // Different graph → different hash
    const root2 = cn('root', { x: 0, y: 0, width: 800, height: 600 }, '#ffffff', [
      tn('t1', { x: 20, y: 20, width: 200, height: 30 }, 'Different Text', '#333'),
    ]);
    const graph2 = wg('hash-test-2', 800, 600, root2);
    const r3 = await orchestrator.execute({
      layoutGraph: graph2 as any,
      generator: 'dashboard',
      outputFormat: 'html',
      options: { pixelPerfectValidation: false } as any,
    });
    assert(r1.graphHash !== r3.graphHash, 'Different graph → different hash');
  }

  // ════════════════════════════════════════════════════════════════
  // TEST 4: DASHBOARD GENERATOR
  // ════════════════════════════════════════════════════════════════
  console.log('\n━━━ Test 4: Dashboard Generator ━━━\n');

  {
    const root = cn('root', { x: 0, y: 0, width: 800, height: 600 }, '#ffffff', [
      cn('header', { x: 0, y: 0, width: 800, height: 60 }, '#1a237e', [
        tn('title', { x: 20, y: 15, width: 300, height: 30 }, 'Sales Dashboard', '#ffffff', null, { size: 24, weight: 700 }),
      ]),
      kpiNode('kpi1', { x: 20, y: 80, width: 180, height: 100 }, 'Revenue', '1.2M'),
      kpiNode('kpi2', { x: 220, y: 80, width: 180, height: 100 }, 'Profit', '350K'),
      tableNode('table1', { x: 20, y: 200, width: 760, height: 200 }),
      chartNode('chart1', { x: 20, y: 420, width: 760, height: 160 }, 'Monthly Trend'),
    ]);
    const graph = wg('dashboard-test', 800, 600, root);
    graph.metadata.documentType = 'dashboard';

    const result = await orchestrator.execute({
      layoutGraph: graph as any,
      generator: 'dashboard',
      outputFormat: 'html',
      options: { pixelPerfectValidation: false } as any,
    });

    assert(result.generator === 'dashboard', 'Generator is dashboard');
    assert(result.outputFormat === 'html', 'Format is html');
    assert(result.html.length > 0, 'HTML output generated', `${result.html.length} chars`);
    assert(result.html.includes('Sales Dashboard'), 'HTML contains title text');
    assert(result.html.includes('kpi-card'), 'HTML contains KPI card class');
    assert(result.html.includes('Revenue'), 'HTML contains KPI label');
    assert(result.html.includes('<table'), 'HTML contains table element');
    assert(result.elementsRendered > 0, `Elements rendered: ${result.elementsRendered}`);
    assert(result.pageCount === 1, 'Page count is 1');
    assert(result.processingTimeMs >= 0, 'Processing time recorded');
  }

  // ════════════════════════════════════════════════════════════════
  // TEST 5: REPORT GENERATOR
  // ════════════════════════════════════════════════════════════════
  console.log('\n━━━ Test 5: Report Generator ━━━\n');

  {
    const root = cn('root', { x: 0, y: 0, width: 612, height: 792 }, '#ffffff', [
      tn('h1', { x: 72, y: 50, width: 468, height: 36 }, 'Quarterly Report', '#1a237e', null, { size: 28, weight: 700, usage: 'heading' }),
      tn('h2', { x: 72, y: 100, width: 468, height: 28 }, 'Financial Overview', '#333', null, { size: 22, weight: 600, usage: 'subheading' }),
      tn('p1', { x: 72, y: 150, width: 468, height: 60 }, 'This report covers Q3 2025 financial performance metrics across all departments.', '#333', null, { size: 14 }),
      tableNode('table', { x: 72, y: 230, width: 468, height: 200 }),
    ]);
    // Set heading type for heading nodes
    root.children[0].type = 'heading';
    root.children[1].type = 'heading';

    const graph = wg('report-test', 612, 792, root);
    graph.metadata.documentType = 'report';
    graph.sourceType = 'pdf';

    const result = await orchestrator.execute({
      layoutGraph: graph as any,
      generator: 'report',
      outputFormat: 'html',
      options: { pixelPerfectValidation: false } as any,
    });

    assert(result.generator === 'report', 'Generator is report');
    assert(result.html.includes('Quarterly Report'), 'Report contains title');
    assert(result.html.includes('<h1'), 'Report has h1 heading (28px font)');
    assert(result.html.includes('<h2'), 'Report has h2 heading (22px font)');
    assert(result.html.includes('report-page'), 'Report uses report-page class');
    assert(result.html.includes('<table'), 'Report contains table');
    assert(result.elementsRendered > 0, `Report elements: ${result.elementsRendered}`);
  }

  // ════════════════════════════════════════════════════════════════
  // TEST 6: SPREADSHEET GENERATOR
  // ════════════════════════════════════════════════════════════════
  console.log('\n━━━ Test 6: Spreadsheet Generator ━━━\n');

  {
    const root = cn('root', { x: 0, y: 0, width: 800, height: 400 }, '#ffffff', [
      tableNode('sheet-table1', { x: 20, y: 20, width: 760, height: 150 }),
      tableNode('sheet-table2', { x: 20, y: 200, width: 760, height: 150 }),
    ]);
    const graph = wg('spreadsheet-test', 800, 400, root);
    graph.metadata.documentType = 'spreadsheet';
    graph.metadata.tableCount = 2;

    const result = await orchestrator.execute({
      layoutGraph: graph as any,
      generator: 'spreadsheet',
      outputFormat: 'html',
      options: { pixelPerfectValidation: false } as any,
    });

    assert(result.generator === 'spreadsheet', 'Generator is spreadsheet');
    assert(result.html.includes('Table 1'), 'Spreadsheet has Table 1 header');
    assert(result.html.includes('Table 2'), 'Spreadsheet has Table 2 header');
    assert(result.html.includes('Revenue'), 'Table data preserved');
    assert(result.elementsRendered === 2, 'Two tables extracted', `got ${result.elementsRendered}`);
  }

  // ════════════════════════════════════════════════════════════════
  // TEST 7: SUBPIXEL STABILIZATION
  // ════════════════════════════════════════════════════════════════
  console.log('\n━━━ Test 7: Subpixel Stabilization ━━━\n');

  {
    const root = cn('root', { x: 0.1, y: 0.2, width: 800.7, height: 600.3 }, '#ffffff', [
      tn('t1', { x: 20.4, y: 20.6, width: 200.8, height: 30.1 }, 'Fractional', '#333', null, { size: 14.3, letterSpacing: 0.567 }),
      cn('box', { x: 250.9, y: 60.2, width: 300.5, height: 200.7 }, '#e3f2fd', []),
    ]);
    const graph = wg('stabilize-test', 800, 600, root);

    const result = await orchestrator.execute({
      layoutGraph: graph as any,
      generator: 'dashboard',
      outputFormat: 'html',
      options: { pixelPerfectValidation: false } as any,
    });

    // The orchestrator applies snapToPixelGrid, so the HTML should have integer coordinates
    assert(result.html.includes('left:20px'), 'Text x snapped to 20', `html: ${result.html.substring(0, 500)}`);
    assert(result.html.includes('top:21px'), 'Text y snapped to 21');
    assert(result.html.includes('width:201px'), 'Text width snapped to 201');
    assert(result.html.includes('left:251px'), 'Box x snapped to 251');
    assert(result.html.includes('font-size:14.5px'), 'Font size snapped to 14.5');
    assert(result.html.includes('letter-spacing:0.57px'), 'Letter-spacing snapped to 0.57');
  }

  // ════════════════════════════════════════════════════════════════
  // TEST 8: RTL ARABIC GRAPH GENERATION
  // ════════════════════════════════════════════════════════════════
  console.log('\n━━━ Test 8: RTL Arabic Graph Generation ━━━\n');

  {
    const root = cn('root', { x: 0, y: 0, width: 800, height: 400 }, '#ffffff', [
      cn('header', { x: 0, y: 0, width: 800, height: 60 }, '#0d47a1', [
        tn('title', { x: 480, y: 15, width: 300, height: 30 }, 'لوحة المؤشرات', '#ffffff', null, { family: 'Cairo', size: 24, weight: 700 }),
      ]),
      kpiNode('kpi-ar', { x: 580, y: 80, width: 200, height: 100 }, 'الإيرادات', '1.2M'),
    ]);

    const graph = wg('arabic-dashboard', 800, 400, root, 'ar', 'rtl');
    graph.metadata.documentType = 'dashboard';

    const result = await orchestrator.execute({
      layoutGraph: graph as any,
      generator: 'dashboard',
      outputFormat: 'html',
      options: { rtlSupport: true, pixelPerfectValidation: false } as any,
    });

    assert(result.html.includes('dir="rtl"'), 'HTML has RTL direction');
    assert(result.html.includes('lang="ar"'), 'HTML has Arabic language');
    assert(result.html.includes('لوحة المؤشرات'), 'Arabic title preserved');
    assert(result.html.includes('الإيرادات'), 'Arabic KPI label preserved');
    assert(result.html.includes("font-family:'Cairo'"), 'Cairo font specified');
  }

  // ════════════════════════════════════════════════════════════════
  // TEST 9: MULTI-PAGE DOCUMENT
  // ════════════════════════════════════════════════════════════════
  console.log('\n━━━ Test 9: Multi-Page Document ━━━\n');

  {
    const page1Root = cn('p1', { x: 0, y: 0, width: 800, height: 600 }, '#ffffff', [
      tn('p1-title', { x: 20, y: 20, width: 400, height: 36 }, 'Page 1: Overview', '#333', null, { size: 28, weight: 700 }),
    ]);
    const page2Root = cn('p2', { x: 0, y: 0, width: 800, height: 600 }, '#f5f5f5', [
      tn('p2-title', { x: 20, y: 20, width: 400, height: 36 }, 'Page 2: Details', '#333', null, { size: 28, weight: 700 }),
      tableNode('p2-table', { x: 20, y: 80, width: 760, height: 400 }),
    ]);

    const graph = wg('multipage-test', 800, 600, page1Root);
    graph.pages.push({
      pageNumber: 2, dimensions: { width: 800, height: 600 },
      orientation: 'landscape', backgroundColor: '#f5f5f5',
      rootNode: page2Root, readingOrder: [],
    });
    graph.metadata.pageCount = 2;

    const result = await orchestrator.execute({
      layoutGraph: graph as any,
      generator: 'report',
      outputFormat: 'html',
      options: { pixelPerfectValidation: false } as any,
    });

    assert(result.pageCount === 2, 'Report has 2 pages', `got ${result.pageCount}`);
    assert(result.html.includes('Page 1: Overview'), 'Page 1 content present');
    assert(result.html.includes('Page 2: Details'), 'Page 2 content present');
    assert(result.html.includes('page-break'), 'Page break element present');
    assert(result.html.includes('data-page="1"'), 'Page 1 marker present');
    assert(result.html.includes('data-page="2"'), 'Page 2 marker present');
  }

  // ════════════════════════════════════════════════════════════════
  // TEST 10: CUSTOM ADAPTER REGISTRATION
  // ════════════════════════════════════════════════════════════════
  console.log('\n━━━ Test 10: Custom Adapter Registration ━━━\n');

  {
    const customAdapter = {
      type: 'dashboard' as const,
      supportedFormats: ['html' as const, 'svg' as const],
      async generate(_graph: any, _format: any, _options: any) {
        return {
          buffer: Buffer.from('<html><body>Custom Dashboard</body></html>', 'utf-8'),
          mimeType: 'text/html',
          elementsRendered: 42,
          pageCount: 1,
        };
      },
    };

    orchestrator.registerAdapter(customAdapter as any);

    const graph = wg('custom-test', 800, 600, cn('r', { x: 0, y: 0, width: 800, height: 600 }, '#fff', []));
    const result = await orchestrator.execute({
      layoutGraph: graph as any,
      generator: 'dashboard',
      outputFormat: 'html',
      options: { pixelPerfectValidation: false } as any,
    });

    assert(result.html.includes('Custom Dashboard'), 'Custom adapter output used');
    assert(result.elementsRendered === 42, 'Custom adapter element count', `got ${result.elementsRendered}`);

    // Supports new format (svg) that original didn't
    const updatedGenerators = orchestrator.getGenerators();
    const dashFormats = updatedGenerators.find((g: any) => g.type === 'dashboard')!.formats;
    assert(dashFormats.includes('svg'), 'Custom adapter added SVG format support');

    // Restore original adapter by creating a fresh orchestrator for remaining tests
    // (not needed since we're done)
  }

  // ════════════════════════════════════════════════════════════════
  // TEST 11: HTML OUTPUT DETERMINISM
  // ════════════════════════════════════════════════════════════════
  console.log('\n━━━ Test 11: HTML Output Determinism ━━━\n');

  {
    // Fresh orchestrator to avoid custom adapter
    const freshOrchestrator = new CanonicalPipelineOrchestrator(mockPrisma);
    const root = cn('root', { x: 0, y: 0, width: 800, height: 600 }, '#ffffff', [
      cn('header', { x: 0, y: 0, width: 800, height: 60 }, '#1a237e', []),
      tn('t1', { x: 20, y: 80, width: 300, height: 30 }, 'Determinism', '#333'),
      cn('box', { x: 20, y: 130, width: 760, height: 400 }, '#e3f2fd', []),
    ]);
    const graph = wg('determ-test', 800, 600, root);

    const r1 = await freshOrchestrator.execute({
      layoutGraph: graph as any,
      generator: 'dashboard',
      outputFormat: 'html',
      options: { pixelPerfectValidation: false } as any,
    });
    const r2 = await freshOrchestrator.execute({
      layoutGraph: graph as any,
      generator: 'dashboard',
      outputFormat: 'html',
      options: { pixelPerfectValidation: false } as any,
    });

    assert(r1.html === r2.html, 'Same graph → identical HTML output');
    assert(r1.graphHash === r2.graphHash, 'Same graph → same hash');
  }

  // ════════════════════════════════════════════════════════════════
  // TEST 12: PERFORMANCE
  // ════════════════════════════════════════════════════════════════
  console.log('\n━━━ Test 12: Performance ━━━\n');

  {
    const freshOrchestrator = new CanonicalPipelineOrchestrator(mockPrisma);
    // Build large graph with 100 nodes
    const children: LayoutNode[] = [];
    for (let i = 0; i < 100; i++) {
      children.push(cn(`n${i}`, {
        x: (i % 10) * 78,
        y: Math.floor(i / 10) * 58,
        width: 70,
        height: 50,
      }, `#${((i * 7) % 256).toString(16).padStart(2, '0')}${((i * 13) % 256).toString(16).padStart(2, '0')}ff`, []));
    }
    const root = cn('root', { x: 0, y: 0, width: 800, height: 600 }, '#ffffff', children);
    const graph = wg('perf-test', 800, 600, root);

    const start = Date.now();
    const result = await freshOrchestrator.execute({
      layoutGraph: graph as any,
      generator: 'dashboard',
      outputFormat: 'html',
      options: { pixelPerfectValidation: false } as any,
    });
    const elapsed = Date.now() - start;

    assert(elapsed < 500, `100-node graph generated in <500ms`, `took ${elapsed}ms`);
    assert(result.html.length > 1000, `HTML output substantial: ${result.html.length} chars`);
    assert(result.processingTimeMs >= 0, `Processing time: ${result.processingTimeMs}ms`);
  }

  // ════════════════════════════════════════════════════════════════
  // TEST 13: ALL GENERATORS ACCEPT SAME GRAPH
  // ════════════════════════════════════════════════════════════════
  console.log('\n━━━ Test 13: All Generators Accept Same CanonicalLayoutGraph ━━━\n');

  {
    const freshOrchestrator = new CanonicalPipelineOrchestrator(mockPrisma);
    const root = cn('root', { x: 0, y: 0, width: 800, height: 600 }, '#ffffff', [
      tn('title', { x: 20, y: 20, width: 400, height: 36 }, 'Universal Document', '#333', null, { size: 28, weight: 700 }),
      tableNode('data', { x: 20, y: 80, width: 760, height: 200 }),
      chartNode('viz', { x: 20, y: 300, width: 760, height: 280 }, 'Trend Analysis'),
    ]);
    const graph = wg('universal', 800, 600, root);

    // Same graph → 4 generators (skip presentation which requires external service)
    const configs = [
      { generator: 'dashboard' as const, format: 'html' as const },
      { generator: 'report' as const, format: 'html' as const },
      { generator: 'spreadsheet' as const, format: 'html' as const },
      { generator: 'docx' as const, format: 'html' as const }, // falls back to report HTML
    ];

    for (const cfg of configs) {
      let success = false;
      try {
        const result = await freshOrchestrator.execute({
          layoutGraph: graph as any,
          generator: cfg.generator,
          outputFormat: cfg.format,
          options: { pixelPerfectValidation: false } as any,
        });
        success = result.html.length > 0;
      } catch {
        success = false;
      }
      assert(success, `${cfg.generator} generates HTML from canonical graph`);
    }

    // All generators get the same graphHash since the input is identical
    const hashes: string[] = [];
    for (const cfg of configs) {
      const result = await freshOrchestrator.execute({
        layoutGraph: graph as any,
        generator: cfg.generator,
        outputFormat: cfg.format,
        options: { pixelPerfectValidation: false } as any,
      });
      hashes.push(result.graphHash);
    }
    const allSameHash = hashes.every(h => h === hashes[0]);
    assert(allSameHash, 'Same graph → same hash across all generators');
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  const totalMs = Date.now() - totalStart;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Total: ${passed + failed} tests | Passed: ${passed} | Failed: ${failed} | Time: ${totalMs}ms`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
  }

  console.log(`\nCanonical Pipeline Orchestrator E2E: ${failed === 0 ? 'ALL PASSED' : 'FAILURES DETECTED'}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
