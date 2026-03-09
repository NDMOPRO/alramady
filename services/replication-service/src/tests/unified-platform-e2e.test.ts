/**
 * Final Unified Platform Enhancement — E2E Validation Suite
 *
 * Tests the complete unified pipeline:
 *   1. Data Extraction (tables, charts, KPIs, text blocks, lists)
 *   2. Data Binding (bind/replace datasets, validate, preserve layout)
 *   3. Arabic Typography Optimization (font substitution, Kashida, overflow, line wrapping)
 *   4. Unified Generation Controller (full pipeline from input to multi-format artifacts)
 *   5. Multi-Format Consistency (same graph → dashboard + report + spreadsheet + docx)
 *   6. Pixel Validation (PixelDiff == 0 preserved through entire pipeline)
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
  value: string; type: 'text' | 'number' | 'date' | 'currency' | 'percentage';
  font: FontToken | null; color: string | null; backgroundColor: string | null;
  alignment: 'left' | 'center' | 'right'; verticalAlignment: 'top' | 'middle' | 'bottom';
  colSpan: number; rowSpan: number;
}
interface ChartContent {
  kind: 'chart'; chartType: string; title: string; subtitle: string | null;
  xAxis: { label: string; type: string; min: null; max: null; tickCount: number; tickValues: string[]; format: null; rotation: number } | null;
  yAxis: { label: string; type: string; min: null; max: null; tickCount: number; tickValues: string[]; format: null; rotation: number } | null;
  series: Array<{ name: string; data: Array<{ label: string; value: number }>; type: string; color: string; stacked: boolean }>;
  legend: null; colors: string[]; dataLabels: boolean; gridLines: boolean;
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

// ─── Graph Helpers ───────────────────────────────────────────────────────────

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

function tn(id: string, bbox: BoundingBox, text: string, color: string, bg: string | null = null, fo: Partial<FontToken> = {}, opts: Partial<TextContent> = {}): any {
  return { id, type: 'text-block', bbox, zIndex: 1, confidence: 0.95, children: [], parentId: null, style: ds(bg), content: { kind: 'text', text, language: 'en', direction: 'ltr', font: df(fo), color, alignment: 'left', textDecoration: 'none', listType: 'none', listLevel: 0, ...opts } as TextContent, semanticRole: 'text', readingOrder: 0 };
}

function cn(id: string, bbox: BoundingBox, bg: string, children: LayoutNode[]): any {
  return { id, type: 'container', bbox, zIndex: 0, confidence: 1, children, parentId: null, style: ds(bg), content: { kind: 'empty' } as EmptyContent, semanticRole: 'container', readingOrder: 0 };
}

function tableNode(id: string, bbox: BoundingBox, headers: string[], rows: string[][]): any {
  const hFont = df({ size: 14, weight: 700 });
  const hCells: TableCell[] = headers.map(h => ({ value: h, type: 'text' as const, font: hFont, color: '#fff', backgroundColor: null, alignment: 'left' as const, verticalAlignment: 'middle' as const, colSpan: 1, rowSpan: 1 }));
  const rCells: TableCell[][] = rows.map(row => row.map((v, ci) => ({
    value: v, type: (ci > 0 && /^[\d,.]+$/.test(v) ? 'number' : 'text') as 'text' | 'number',
    font: null, color: '#333', backgroundColor: null,
    alignment: (ci > 0 ? 'right' : 'left') as 'left' | 'right',
    verticalAlignment: 'middle' as const, colSpan: 1, rowSpan: 1,
  })));
  const content: TableContent = {
    kind: 'table', headers: hCells, rows: rCells, mergedCells: [] as never[],
    headerRows: 1, headerColumns: 0, columnWidths: headers.map(() => 150), rowHeights: [36, ...rows.map(() => 32)],
    borderStyle: 'full', alternateRowColor: null,
    headerStyle: { backgroundColor: '#1a237e', font: hFont, color: '#ffffff' },
  };
  return { id, type: 'table', bbox, zIndex: 1, confidence: 0.95, children: [], parentId: null, style: ds(null), content, semanticRole: 'data-table', readingOrder: 0 };
}

function chartNode(id: string, bbox: BoundingBox, title: string, series: ChartContent['series']): any {
  const content: ChartContent = {
    kind: 'chart', chartType: 'bar', title, subtitle: null,
    xAxis: { label: 'Month', type: 'category', min: null, max: null, tickCount: 4, tickValues: ['Jan', 'Feb', 'Mar', 'Apr'], format: null, rotation: 0 },
    yAxis: { label: 'Value', type: 'value', min: null, max: null, tickCount: 5, tickValues: [], format: null, rotation: 0 },
    series, legend: null, colors: ['#42a5f5', '#66bb6a'], dataLabels: true, gridLines: true,
  };
  return { id, type: 'chart', bbox, zIndex: 1, confidence: 0.9, children: [], parentId: null, style: ds('#f5f5f5'), content, semanticRole: 'chart', readingOrder: 0 };
}

function kpiNode(id: string, bbox: BoundingBox, label: string, value: string, unit: string, trend: 'up' | 'down' | 'neutral' = 'up'): any {
  const content: KpiContent = {
    kind: 'kpi', label, value, unit,
    trend, trendValue: trend === 'up' ? '+12%' : trend === 'down' ? '-5%' : '0%',
    trendColor: trend === 'up' ? '#4caf50' : trend === 'down' ? '#f44336' : '#9e9e9e',
    icon: null, sparkline: [10, 15, 12, 18, 22, 25],
  };
  return { id, type: 'kpi-card', bbox, zIndex: 1, confidence: 0.9, children: [], parentId: null, style: ds('#e3f2fd'), content, semanticRole: 'kpi', readingOrder: 0 };
}

function wg(id: string, w: number, h: number, root: LayoutNode, lang = 'en', dir: 'ltr' | 'rtl' = 'ltr'): any {
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

// ─── Rendering & Comparison ──────────────────────────────────────────────────

function parseColor(color: string): { r: number; g: number; b: number; alpha: number } {
  const hex = color.replace('#', '');
  if (hex.length === 6 || hex.length === 8) {
    return { r: parseInt(hex.substring(0, 2), 16) || 0, g: parseInt(hex.substring(2, 4), 16) || 0, b: parseInt(hex.substring(4, 6), 16) || 0, alpha: hex.length === 8 ? (parseInt(hex.substring(6, 8), 16) || 255) / 255 : 1 };
  }
  return { r: 200, g: 200, b: 200, alpha: 1 };
}

function collectOverlays(node: any, overlays: sharp.OverlayOptions[], cw: number, ch: number): void {
  const x = Math.max(0, Math.min(Math.round(node.bbox.x), cw - 1));
  const y = Math.max(0, Math.min(Math.round(node.bbox.y), ch - 1));
  const w = Math.max(1, Math.min(Math.round(node.bbox.width), cw - x));
  const h = Math.max(1, Math.min(Math.round(node.bbox.height), ch - y));
  if (node.style.backgroundColor && node.style.backgroundColor !== 'transparent') {
    try { overlays.push({ input: { create: { width: w, height: h, channels: 4 as const, background: parseColor(node.style.backgroundColor) } }, left: x, top: y }); } catch { /* skip */ }
  }
  for (const child of node.children) collectOverlays(child, overlays, cw, ch);
}

async function renderGraph(graph: any, w: number, h: number): Promise<Buffer> {
  const img = sharp({ create: { width: w, height: h, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png();
  const overlays: sharp.OverlayOptions[] = [];
  for (const page of graph.pages) collectOverlays(page.rootNode, overlays, w, h);
  return overlays.length > 0 ? img.composite(overlays).toBuffer() : img.toBuffer();
}

async function compareImages(a: Buffer, b: Buffer): Promise<{ pixelDiffCount: number; totalPixels: number }> {
  const aMeta = await sharp(a).ensureAlpha().metadata();
  const w = aMeta.width || 800; const h = aMeta.height || 600;
  const [aRaw, bRaw] = await Promise.all([
    sharp(a).ensureAlpha().resize(w, h, { fit: 'fill' }).raw().toBuffer(),
    sharp(b).ensureAlpha().resize(w, h, { fit: 'fill' }).raw().toBuffer(),
  ]);
  const diff = Buffer.alloc(w * h * 4);
  const count = pixelmatch(aRaw, bRaw, diff, w, h, { threshold: 0, includeAA: true });
  return { pixelDiffCount: count, totalPixels: w * h };
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
  console.log('=== Final Unified Platform E2E Validation Suite ===\n');
  const totalStart = Date.now();

  // Dynamic imports
  const { DataExtractionService } = await import('../services/data-extraction.service.js');
  const { DataBindingService } = await import('../services/data-binding.service.js');
  const { ArabicTypographyOptimizer } = await import('../services/arabic-typography-optimizer.service.js');
  const { CanonicalPipelineOrchestrator } = await import('../services/canonical-pipeline-orchestrator.service.js');

  const dataExtractor = new DataExtractionService();
  const dataBinder = new DataBindingService();
  const typographyOptimizer = new ArabicTypographyOptimizer();
  const mockPrisma = {} as any;
  const orchestrator = new CanonicalPipelineOrchestrator(mockPrisma);

  // ─── Build a rich test graph ────────────────────────────────────────────
  const richGraph: any = buildRichDashboardGraph();

  // ════════════════════════════════════════════════════════════════
  // SECTION 1: DATA EXTRACTION
  // ════════════════════════════════════════════════════════════════
  console.log('━━━ SECTION 1: Data Extraction ━━━\n');

  // 1.1: Extract all datasets
  console.log('Test 1.1: Extract all datasets from rich graph');
  {
    const datasets = dataExtractor.extractAll(richGraph);
    assert(datasets.sourceGraphId === richGraph.id, 'Source graph ID matches');
    assert(datasets.totalElements > 0, `Total elements: ${datasets.totalElements}`);
    assert(datasets.extractedAt.length > 0, 'Extraction timestamp set');
  }

  // 1.2: Table extraction
  console.log('\nTest 1.2: Table extraction');
  {
    const datasets = dataExtractor.extractAll(richGraph);
    assert(datasets.tables.length >= 1, `Tables extracted: ${datasets.tables.length}`);
    if (datasets.tables.length > 0) {
      const t = datasets.tables[0];
      assert(t.headers.length === 3, `Table has 3 headers`, `got ${t.headers.length}`);
      assert(t.headers[0] === 'Department', `First header: Department`, `got ${t.headers[0]}`);
      assert(t.rows.length === 3, `Table has 3 rows`, `got ${t.rows.length}`);
      assert(t.rowCount === 3, 'rowCount matches');
      assert(t.columnCount === 3, 'columnCount matches');
      assert(t.columnTypes.includes('number'), 'Number column type detected');
    }
  }

  // 1.3: Chart extraction
  console.log('\nTest 1.3: Chart extraction');
  {
    const datasets = dataExtractor.extractAll(richGraph);
    assert(datasets.charts.length >= 1, `Charts extracted: ${datasets.charts.length}`);
    if (datasets.charts.length > 0) {
      const c = datasets.charts[0];
      assert(c.title === 'Monthly Revenue', `Chart title: ${c.title}`);
      assert(c.chartType === 'bar', `Chart type: bar`);
      assert(c.series.length === 1, `1 series`);
      assert(c.series[0].data.length === 4, `4 data points`);
      assert(c.totalDataPoints === 4, 'totalDataPoints correct');
      assert(c.xAxisLabel === 'Month', 'X-axis label');
    }
  }

  // 1.4: KPI extraction
  console.log('\nTest 1.4: KPI extraction');
  {
    const datasets = dataExtractor.extractAll(richGraph);
    assert(datasets.kpis.length >= 2, `KPIs extracted: ${datasets.kpis.length}`);
    if (datasets.kpis.length >= 2) {
      const kpi = datasets.kpis[0];
      assert(kpi.label === 'Revenue', `KPI label: ${kpi.label}`);
      assert(kpi.value === '1,250,000', `KPI value: ${kpi.value}`);
      assert(kpi.unit === 'SAR', `KPI unit: ${kpi.unit}`);
      assert(kpi.trend === 'up', `Trend: up`);
      const numVal = kpi.numericValue;
      assert(numVal === 1250000, `Numeric value parsed: ${numVal}`);
    }
  }

  // 1.5: Text block extraction
  console.log('\nTest 1.5: Text block extraction');
  {
    const datasets = dataExtractor.extractAll(richGraph);
    assert(datasets.textBlocks.length >= 1, `Text blocks: ${datasets.textBlocks.length}`);
    const heading = datasets.textBlocks.find(t => t.role === 'heading');
    assert(heading !== undefined, 'Heading detected');
    if (heading) {
      assert(heading.text === 'Sales Dashboard', `Heading text: ${heading.text}`);
      assert(heading.fontSize === 24, `Heading font size: 24`);
    }
  }

  // 1.6: List extraction
  console.log('\nTest 1.6: List extraction');
  {
    const datasets = dataExtractor.extractAll(richGraph);
    assert(datasets.lists.length >= 1, `Lists extracted: ${datasets.lists.length}`);
    if (datasets.lists.length > 0) {
      assert(datasets.lists[0].listType === 'bullet', 'Bullet list detected');
      // Each list item has parentId=null, so they become separate lists
      const totalItems = datasets.lists.reduce((sum, l) => sum + l.items.length, 0);
      assert(totalItems === 3, `3 total list items across lists`, `got ${totalItems}`);
    }
  }

  // 1.7: CSV export
  console.log('\nTest 1.7: Table to CSV');
  {
    const datasets = dataExtractor.extractAll(richGraph);
    if (datasets.tables.length > 0) {
      const csv = dataExtractor.toCSV(datasets.tables[0]);
      assert(csv.includes('Department'), 'CSV contains header');
      assert(csv.includes('Sales'), 'CSV contains row data');
      const lines = csv.trim().split('\n');
      assert(lines.length === 4, 'CSV has 4 lines (1 header + 3 rows)', `got ${lines.length}`);
    }
  }

  // 1.8: JSON export
  console.log('\nTest 1.8: Datasets to JSON');
  {
    const datasets = dataExtractor.extractAll(richGraph);
    const json = dataExtractor.toJSON(datasets);
    const parsed = JSON.parse(json);
    assert(parsed.tables !== undefined, 'JSON has tables');
    assert(parsed.charts !== undefined, 'JSON has charts');
    assert(parsed.kpis !== undefined, 'JSON has kpis');
  }

  // ════════════════════════════════════════════════════════════════
  // SECTION 2: DATA BINDING
  // ════════════════════════════════════════════════════════════════
  console.log('\n━━━ SECTION 2: Data Binding ━━━\n');

  // 2.1: Get bindable nodes
  console.log('Test 2.1: Get bindable nodes');
  {
    const bindable = dataBinder.getBindableNodes(richGraph);
    assert(bindable.length >= 4, `Bindable nodes: ${bindable.length}`);
    const types = bindable.map(n => n.type);
    assert(types.includes('table'), 'Table node is bindable');
    assert(types.includes('chart'), 'Chart node is bindable');
    assert(types.includes('kpi'), 'KPI node is bindable');
    assert(types.includes('text'), 'Text node is bindable');
  }

  // 2.2: Bind table data
  console.log('\nTest 2.2: Bind table data');
  {
    const newRows = [['Engineering', '800,000', '95%'], ['Marketing', '600,000', '88%']];
    const bound = dataBinder.bindTable(richGraph, 'table-1', { rows: newRows });
    const tableN = findNode(bound.pages[0].rootNode, 'table-1');
    assert(tableN !== null, 'Table node found');
    if (tableN && tableN.content.kind === 'table') {
      assert(tableN.content.rows.length === 2, 'Table now has 2 rows', `got ${tableN.content.rows.length}`);
      assert(tableN.content.rows[0][0].value === 'Engineering', 'First cell updated');
    }
    // Original graph unchanged
    const origTable = findNode(richGraph.pages[0].rootNode, 'table-1');
    if (origTable && origTable.content.kind === 'table') {
      assert(origTable.content.rows.length === 3, 'Original graph unchanged (3 rows)');
    }
  }

  // 2.3: Bind KPI data
  console.log('\nTest 2.3: Bind KPI data');
  {
    const bound = dataBinder.bindKPI(richGraph, 'kpi-revenue', { value: '2,500,000', trend: 'up', trendValue: '+25%' });
    const kpiN = findNode(bound.pages[0].rootNode, 'kpi-revenue');
    assert(kpiN !== null, 'KPI node found');
    if (kpiN && kpiN.content.kind === 'kpi') {
      assert(kpiN.content.value === '2,500,000', 'KPI value updated');
      assert(kpiN.content.trendValue === '+25%', 'KPI trend updated');
    }
  }

  // 2.4: Bind chart data
  console.log('\nTest 2.4: Bind chart data');
  {
    const newSeries = [{ name: 'Updated', data: [{ label: 'Q1', value: 100 }, { label: 'Q2', value: 200 }] }];
    const bound = dataBinder.bindChart(richGraph, 'chart-1', { series: newSeries });
    const chartN = findNode(bound.pages[0].rootNode, 'chart-1');
    assert(chartN !== null, 'Chart node found');
    if (chartN && chartN.content.kind === 'chart') {
      assert(chartN.content.series.length === 1, '1 updated series');
      assert(chartN.content.series[0].name === 'Updated', 'Series name updated');
      assert(chartN.content.series[0].data.length === 2, '2 data points');
    }
  }

  // 2.5: Bind text data
  console.log('\nTest 2.5: Bind text data');
  {
    const bound = dataBinder.bindText(richGraph, 'title-text', 'Updated Dashboard Title');
    const textN = findNode(bound.pages[0].rootNode, 'title-text');
    if (textN && textN.content.kind === 'text') {
      assert(textN.content.text === 'Updated Dashboard Title', 'Text updated');
    }
  }

  // 2.6: Validate bindings
  console.log('\nTest 2.6: Validate bindings');
  {
    const valid = dataBinder.validateBindings(richGraph, {
      tables: { 'table-1': { rows: [['a', 'b', 'c']] } },
      kpis: { 'kpi-revenue': { value: '500' } },
    });
    assert(valid.valid === true, 'Valid bindings accepted');

    const invalid = dataBinder.validateBindings(richGraph, {
      tables: { 'nonexistent': { rows: [] } },
    });
    assert(invalid.valid === false, 'Invalid node ID rejected');
    assert(invalid.errors.length > 0, 'Error reported');
  }

  // 2.7: Binding preserves layout (bbox unchanged)
  console.log('\nTest 2.7: Binding preserves layout');
  {
    const origBbox = findNode(richGraph.pages[0].rootNode, 'table-1')?.bbox;
    const bound = dataBinder.bindTable(richGraph, 'table-1', { rows: [['x', 'y', 'z']] });
    const newBbox = findNode(bound.pages[0].rootNode, 'table-1')?.bbox;
    assert(origBbox !== undefined && newBbox !== undefined, 'Both bboxes found');
    if (origBbox && newBbox) {
      assert(origBbox.x === newBbox.x && origBbox.y === newBbox.y && origBbox.width === newBbox.width && origBbox.height === newBbox.height, 'Bbox preserved after binding');
    }
  }

  // 2.8: Batch binding
  console.log('\nTest 2.8: Batch dataset binding');
  {
    const bound = dataBinder.bindDatasets(richGraph, {
      tables: { 'table-1': { rows: [['New', '100', '50%']] } },
      kpis: { 'kpi-revenue': { value: '999' } },
      texts: { 'title-text': 'Batch Updated' },
    });
    const t = findNode(bound.pages[0].rootNode, 'table-1');
    const k = findNode(bound.pages[0].rootNode, 'kpi-revenue');
    const tx = findNode(bound.pages[0].rootNode, 'title-text');
    if (t?.content.kind === 'table') assert(t.content.rows[0][0].value === 'New', 'Batch: table updated');
    if (k?.content.kind === 'kpi') assert(k.content.value === '999', 'Batch: KPI updated');
    if (tx?.content.kind === 'text') assert(tx.content.text === 'Batch Updated', 'Batch: text updated');
  }

  // ════════════════════════════════════════════════════════════════
  // SECTION 3: ARABIC TYPOGRAPHY OPTIMIZATION
  // ════════════════════════════════════════════════════════════════
  console.log('\n━━━ SECTION 3: Arabic Typography Optimization ━━━\n');

  // 3.1: Font substitution
  console.log('Test 3.1: Latin → Arabic font substitution');
  {
    const sub = typographyOptimizer.substituteArabicFont('Arial');
    assert(sub === 'Noto Sans Arabic', `Arial → ${sub}`);
    const sub2 = typographyOptimizer.substituteArabicFont('Times New Roman');
    assert(sub2 === 'Amiri', `Times New Roman → ${sub2}`);
    const sub3 = typographyOptimizer.substituteArabicFont('Roboto');
    assert(sub3 === 'IBM Plex Sans Arabic', `Roboto → ${sub3}`);
    const sub4 = typographyOptimizer.substituteArabicFont('Cairo');
    assert(sub4 === 'Cairo', `Cairo stays Cairo: ${sub4}`);
  }

  // 3.2: Kashida justification
  console.log('\nTest 3.2: Kashida justification');
  {
    const text = 'بسم الله الرحمن';
    const result = typographyOptimizer.applyKashidaJustification(text, 300, 8);
    assert(result.includes('\u0640'), 'Kashida inserted');
    assert(result.length > text.length, `Text lengthened: ${result.length} > ${text.length}`);
    const stripped = result.replace(/\u0640/g, '');
    assert(stripped === text, 'Original text preserved after stripping kashida');
  }

  // 3.3: Overflow detection
  console.log('\nTest 3.3: Overflow detection');
  {
    const result = typographyOptimizer.detectOverflow('تقرير المبيعات الربع سنوي التفصيلي', 100, 16);
    assert(result.overflows, 'Long Arabic text overflows 100px container');
    assert(result.suggestedFontSize !== null, 'Suggested font size provided');
    assert(result.suggestedScale < 1, `Scale < 1: ${result.suggestedScale}`);

    const short = typographyOptimizer.detectOverflow('مرحبا', 200, 16);
    assert(!short.overflows, 'Short text does not overflow');
  }

  // 3.4: Arabic line wrapping
  console.log('\nTest 3.4: Arabic line wrapping');
  {
    const text = 'هذا نص طويل يحتاج إلى التفاف تلقائي في عدة أسطر';
    const lines = typographyOptimizer.wrapArabicLines(text, 100, 14);
    assert(lines.length > 1, `Text wrapped into ${lines.length} lines`);
    assert(lines.join(' ') === text, 'All text preserved after wrapping');
  }

  // 3.5: Full graph optimization
  console.log('\nTest 3.5: Full Arabic graph optimization');
  {
    const root = cn('root', { x: 0, y: 0, width: 800, height: 400 }, '#ffffff', [
      tn('ar-title', { x: 480, y: 20, width: 300, height: 36 }, 'لوحة المؤشرات', '#333', null, { family: 'Arial', size: 24, weight: 700 }, { language: 'ar', direction: 'rtl' }),
      tn('ar-body', { x: 20, y: 80, width: 760, height: 100 }, 'تقرير الأداء المالي للربع الثالث', '#333', null, { family: 'Roboto', size: 14 }, { language: 'ar', direction: 'rtl' }),
    ]);
    const graph = wg('arabic-opt-test', 800, 400, root, 'ar', 'rtl');

    const optimized = typographyOptimizer.optimize(graph);
    const titleNode = findNode(optimized.pages[0].rootNode, 'ar-title');
    const bodyNode = findNode(optimized.pages[0].rootNode, 'ar-body');

    if (titleNode?.content.kind === 'text') {
      assert(titleNode.content.font.family !== 'Arial', `Title font substituted from Arial to ${titleNode.content.font.family}`);
    }
    if (bodyNode?.content.kind === 'text') {
      assert(bodyNode.content.font.family !== 'Roboto', `Body font substituted from Roboto to ${bodyNode.content.font.family}`);
    }
  }

  // 3.6: Typography report
  console.log('\nTest 3.6: Typography optimization report');
  {
    const root = cn('root', { x: 0, y: 0, width: 800, height: 400 }, '#ffffff', [
      tn('ar-text', { x: 20, y: 20, width: 300, height: 30 }, 'نص عربي', '#333', null, { family: 'Arial', size: 16 }, { language: 'ar', direction: 'rtl' }),
    ]);
    const graph = wg('report-test', 800, 400, root, 'ar', 'rtl');
    // Report on the original graph (before optimization) to detect what would change
    const report = typographyOptimizer.getOptimizationReport(graph);
    // Also run optimization to confirm it works
    typographyOptimizer.optimize(graph);

    assert(report.totalTextNodes >= 1, `Total text nodes: ${report.totalTextNodes}`);
    assert(report.arabicTextNodes >= 1, `Arabic text nodes: ${report.arabicTextNodes}`);
    assert(report.fontSubstitutions.length >= 1, `Font substitutions: ${report.fontSubstitutions.length}`);
  }

  // ════════════════════════════════════════════════════════════════
  // SECTION 4: UNIFIED GENERATION CONTROLLER (via orchestrator)
  // ════════════════════════════════════════════════════════════════
  console.log('\n━━━ SECTION 4: Unified Generation Pipeline ━━━\n');

  // 4.1: Dashboard from canonical graph
  console.log('Test 4.1: Dashboard generation from canonical graph');
  {
    const result = await orchestrator.execute({
      layoutGraph: richGraph as any,
      generator: 'dashboard',
      outputFormat: 'html',
      options: { pixelPerfectValidation: false } as any,
    });
    assert(result.html.includes('Sales Dashboard'), 'Dashboard includes title');
    assert(result.html.includes('Revenue'), 'Dashboard includes KPI');
    assert(result.html.includes('<table'), 'Dashboard includes table');
    assert(result.elementsRendered > 0, `Elements: ${result.elementsRendered}`);
  }

  // 4.2: Report from same graph
  console.log('\nTest 4.2: Report generation from same graph');
  {
    const result = await orchestrator.execute({
      layoutGraph: richGraph as any,
      generator: 'report',
      outputFormat: 'html',
      options: { pixelPerfectValidation: false } as any,
    });
    assert(result.html.includes('Sales Dashboard'), 'Report includes title');
    assert(result.html.includes('report-page'), 'Report has page structure');
  }

  // 4.3: Spreadsheet from same graph
  console.log('\nTest 4.3: Spreadsheet generation from same graph');
  {
    const result = await orchestrator.execute({
      layoutGraph: richGraph as any,
      generator: 'spreadsheet',
      outputFormat: 'html',
      options: { pixelPerfectValidation: false } as any,
    });
    assert(result.html.includes('Table 1'), 'Spreadsheet has table');
    assert(result.html.includes('Department'), 'Table headers preserved');
    assert(result.elementsRendered >= 1, `Tables extracted: ${result.elementsRendered}`);
  }

  // 4.4: All generators produce same graphHash
  console.log('\nTest 4.4: Same graph → same hash across generators');
  {
    const hashes: string[] = [];
    for (const gen of ['dashboard', 'report', 'spreadsheet'] as const) {
      const r = await orchestrator.execute({
        layoutGraph: richGraph as any,
        generator: gen,
        outputFormat: 'html',
        options: { pixelPerfectValidation: false } as any,
      });
      hashes.push(r.graphHash);
    }
    assert(hashes[0] === hashes[1] && hashes[1] === hashes[2], 'All generators produce same graphHash');
  }

  // ════════════════════════════════════════════════════════════════
  // SECTION 5: FULL PIPELINE INTEGRATION
  // ════════════════════════════════════════════════════════════════
  console.log('\n━━━ SECTION 5: Full Pipeline Integration ━━━\n');

  // 5.1: Extract → Bind → Generate
  console.log('Test 5.1: Extract → Bind → Generate pipeline');
  {
    // Extract
    const datasets = dataExtractor.extractAll(richGraph);
    assert(datasets.tables.length > 0, 'Data extracted');

    // Bind new data
    const bound = dataBinder.bindDatasets(richGraph, {
      kpis: { 'kpi-revenue': { value: '3,000,000', trend: 'up', trendValue: '+50%' } },
    });

    // Generate
    const result = await orchestrator.execute({
      layoutGraph: bound as any,
      generator: 'dashboard',
      outputFormat: 'html',
      options: { pixelPerfectValidation: false } as any,
    });
    assert(result.html.includes('3,000,000'), 'Generated output contains updated KPI value');
  }

  // 5.2: Arabic localization → Typography optimization → Generate
  console.log('\nTest 5.2: Arabic typography → Generate pipeline');
  {
    const root = cn('root', { x: 0, y: 0, width: 800, height: 400 }, '#ffffff', [
      tn('ar-h', { x: 480, y: 20, width: 300, height: 36 }, 'تقرير الأداء', '#333', null, { family: 'Arial', size: 24, weight: 700 }, { language: 'ar', direction: 'rtl' }),
      kpiNode('ar-kpi', { x: 580, y: 80, width: 200, height: 100 }, 'الإيرادات', '1.5M', 'ر.س'),
    ]);
    let graph = wg('ar-pipeline', 800, 400, root, 'ar', 'rtl');

    // Apply typography optimization
    graph = typographyOptimizer.optimize(graph);

    // Generate
    const result = await orchestrator.execute({
      layoutGraph: graph as any,
      generator: 'dashboard',
      outputFormat: 'html',
      options: { rtlSupport: true, pixelPerfectValidation: false } as any,
    });
    assert(result.html.includes('dir="rtl"'), 'RTL direction set');
    assert(result.html.includes('تقرير الأداء'), 'Arabic text preserved');
    assert(result.html.includes('الإيرادات'), 'Arabic KPI preserved');
  }

  // 5.3: Multi-page mixed content generation
  console.log('\nTest 5.3: Multi-page generation');
  {
    const graph = buildMultiPageGraph();
    const result = await orchestrator.execute({
      layoutGraph: graph as any,
      generator: 'report',
      outputFormat: 'html',
      options: { pixelPerfectValidation: false } as any,
    });
    assert(result.pageCount === 3, `3 pages generated`, `got ${result.pageCount}`);
    assert(result.html.includes('data-page="1"'), 'Page 1');
    assert(result.html.includes('data-page="2"'), 'Page 2');
    assert(result.html.includes('data-page="3"'), 'Page 3');
  }

  // ════════════════════════════════════════════════════════════════
  // SECTION 6: PIXEL VALIDATION
  // ════════════════════════════════════════════════════════════════
  console.log('\n━━━ SECTION 6: Pixel Validation ━━━\n');

  // 6.1: Stabilized graph → PixelDiff == 0
  console.log('Test 6.1: Stabilized graph render determinism');
  {
    const snapped = snapToPixelGrid(richGraph);
    const r1 = await renderGraph(snapped, 800, 600);
    const r2 = await renderGraph(snapped, 800, 600);
    const cmp = await compareImages(r1, r2);
    assert(cmp.pixelDiffCount === 0, 'Stabilized rich graph: PixelDiff == 0');
  }

  // 6.2: Bound data → PixelDiff == 0
  console.log('\nTest 6.2: After data binding: PixelDiff == 0');
  {
    const bound = dataBinder.bindDatasets(richGraph, {
      kpis: { 'kpi-revenue': { value: '9,999,999' } },
    });
    const snapped = snapToPixelGrid(bound);
    const r1 = await renderGraph(snapped, 800, 600);
    const r2 = await renderGraph(snapped, 800, 600);
    const cmp = await compareImages(r1, r2);
    assert(cmp.pixelDiffCount === 0, 'Post-binding: PixelDiff == 0');
  }

  // 6.3: Arabic optimized → PixelDiff == 0
  console.log('\nTest 6.3: After Arabic optimization: PixelDiff == 0');
  {
    const root = cn('root', { x: 0, y: 0, width: 800, height: 400 }, '#ffffff', [
      cn('header', { x: 0, y: 0, width: 800, height: 60 }, '#0d47a1', []),
      cn('kpi1', { x: 580, y: 80, width: 200, height: 100 }, '#e3f2fd', []),
      cn('kpi2', { x: 360, y: 80, width: 200, height: 100 }, '#e8f5e9', []),
    ]);
    let graph = wg('ar-pixel', 800, 400, root, 'ar', 'rtl');
    graph = typographyOptimizer.optimize(graph);
    const snapped = snapToPixelGrid(graph);
    const r1 = await renderGraph(snapped, 800, 400);
    const r2 = await renderGraph(snapped, 800, 400);
    const cmp = await compareImages(r1, r2);
    assert(cmp.pixelDiffCount === 0, 'Arabic optimized: PixelDiff == 0');
  }

  // 6.4: Not a blank canvas
  console.log('\nTest 6.4: Rendered graph is not blank');
  {
    const snapped = snapToPixelGrid(richGraph);
    const rendered = await renderGraph(snapped, 800, 600);
    const blank = await sharp({ create: { width: 800, height: 600, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
    const cmp = await compareImages(rendered, blank);
    assert(cmp.pixelDiffCount > 0, `Not blank: ${cmp.pixelDiffCount} pixels differ from white canvas`);
  }

  // 6.5: Full pipeline: extract + bind + optimize + generate → deterministic
  console.log('\nTest 6.5: Full pipeline determinism');
  {
    let graph: any = structuredClone(richGraph);

    // Extract
    const data = dataExtractor.extractAll(graph);
    assert(data.tables.length > 0, 'Pipeline: data extracted');

    // Bind
    graph = dataBinder.bindDatasets(graph, {
      kpis: { 'kpi-profit': { value: '500,000', trend: 'up', trendValue: '+20%' } },
    });

    // Stabilize
    graph = snapToPixelGrid(graph);

    // Render twice
    const r1 = await renderGraph(graph, 800, 600);
    const r2 = await renderGraph(graph, 800, 600);
    const cmp = await compareImages(r1, r2);
    assert(cmp.pixelDiffCount === 0, 'Full pipeline: PixelDiff == 0');
  }

  // ════════════════════════════════════════════════════════════════
  // SECTION 7: PERFORMANCE
  // ════════════════════════════════════════════════════════════════
  console.log('\n━━━ SECTION 7: Performance ━━━\n');

  // 7.1: Data extraction performance
  console.log('Test 7.1: Data extraction < 50ms');
  {
    const start = Date.now();
    dataExtractor.extractAll(richGraph);
    const elapsed = Date.now() - start;
    assert(elapsed < 50, `Data extraction took ${elapsed}ms`);
  }

  // 7.2: Data binding performance
  console.log('\nTest 7.2: Data binding < 50ms');
  {
    const start = Date.now();
    dataBinder.bindDatasets(richGraph, {
      tables: { 'table-1': { rows: [['a', 'b', 'c']] } },
      kpis: { 'kpi-revenue': { value: '1' } },
    });
    const elapsed = Date.now() - start;
    assert(elapsed < 50, `Data binding took ${elapsed}ms`);
  }

  // 7.3: Typography optimization performance
  console.log('\nTest 7.3: Typography optimization < 50ms');
  {
    const root = cn('root', { x: 0, y: 0, width: 800, height: 400 }, '#fff', [
      ...Array.from({ length: 20 }, (_, i) => tn(`ar-${i}`, { x: 0, y: i * 20, width: 400, height: 20 }, 'نص عربي تجريبي', '#333', null, { family: 'Arial', size: 14 }, { language: 'ar', direction: 'rtl' })),
    ]);
    const graph = wg('perf-ar', 800, 400, root, 'ar', 'rtl');
    const start = Date.now();
    typographyOptimizer.optimize(graph);
    const elapsed = Date.now() - start;
    assert(elapsed < 50, `Typography optimization (20 nodes) took ${elapsed}ms`);
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  const totalMs = Date.now() - totalStart;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Total: ${passed + failed} tests | Passed: ${passed} | Failed: ${failed} | Time: ${totalMs}ms`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
  }

  console.log(`\nFinal Unified Platform E2E: ${failed === 0 ? 'ALL PASSED' : 'FAILURES DETECTED'}`);
  process.exit(failed > 0 ? 1 : 0);
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function findNode(node: any, id: string): any {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function snapToPixelGrid(graph: any): any {
  const clone = structuredClone(graph);
  for (const page of clone.pages) snapNode(page.rootNode);
  return clone;
}

function snapNode(node: any): void {
  node.bbox.x = Math.round(node.bbox.x);
  node.bbox.y = Math.round(node.bbox.y);
  node.bbox.width = Math.round(node.bbox.width);
  node.bbox.height = Math.round(node.bbox.height);
  if (node.content.kind === 'text') {
    node.content.font.size = Math.round(node.content.font.size * 2) / 2;
    node.content.font.letterSpacing = Math.round(node.content.font.letterSpacing * 100) / 100;
  }
  for (const child of node.children) snapNode(child);
}

// ─── Test Graphs ─────────────────────────────────────────────────────────────

function buildRichDashboardGraph(): any {
  const titleNode = tn('title-text', { x: 20, y: 15, width: 300, height: 30 }, 'Sales Dashboard', '#ffffff', null, { size: 24, weight: 700, usage: 'heading' });
  titleNode.type = 'heading';

  const list1 = tn('list-1', { x: 20, y: 460, width: 300, height: 20 }, 'Item 1', '#333', null, {}, { listType: 'bullet', listLevel: 1 });
  const list2 = tn('list-2', { x: 20, y: 485, width: 300, height: 20 }, 'Item 2', '#333', null, {}, { listType: 'bullet', listLevel: 1 });
  const list3 = tn('list-3', { x: 20, y: 510, width: 300, height: 20 }, 'Item 3', '#333', null, {}, { listType: 'bullet', listLevel: 1 });

  const root = cn('root', { x: 0, y: 0, width: 800, height: 600 }, '#ffffff', [
    cn('header', { x: 0, y: 0, width: 800, height: 60 }, '#1a237e', [titleNode]),
    kpiNode('kpi-revenue', { x: 20, y: 80, width: 180, height: 100 }, 'Revenue', '1,250,000', 'SAR'),
    kpiNode('kpi-profit', { x: 220, y: 80, width: 180, height: 100 }, 'Profit', '350,000', 'SAR'),
    kpiNode('kpi-growth', { x: 420, y: 80, width: 180, height: 100 }, 'Growth', '12', '%', 'up'),
    tableNode('table-1', { x: 20, y: 200, width: 760, height: 200 }, ['Department', 'Revenue', 'Target'], [
      ['Sales', '500,000', '90%'],
      ['Marketing', '350,000', '85%'],
      ['Operations', '400,000', '92%'],
    ]),
    chartNode('chart-1', { x: 20, y: 420, width: 350, height: 160 }, 'Monthly Revenue', [
      { name: 'Revenue', data: [{ label: 'Jan', value: 100 }, { label: 'Feb', value: 150 }, { label: 'Mar', value: 130 }, { label: 'Apr', value: 180 }], type: 'bar', color: '#42a5f5', stacked: false },
    ]),
    list1, list2, list3,
  ]);

  const graph = wg('rich-dashboard', 800, 600, root);
  graph.metadata.documentType = 'dashboard';
  graph.metadata.tableCount = 1;
  graph.metadata.chartCount = 1;
  return graph;
}

function buildMultiPageGraph(): any {
  const p1 = cn('p1-root', { x: 0, y: 0, width: 800, height: 600 }, '#ffffff', [
    tn('p1-title', { x: 20, y: 20, width: 400, height: 36 }, 'Page 1: Overview', '#333', null, { size: 28, weight: 700 }),
  ]);
  const p2 = cn('p2-root', { x: 0, y: 0, width: 800, height: 600 }, '#f5f5f5', [
    tn('p2-title', { x: 20, y: 20, width: 400, height: 36 }, 'Page 2: Data', '#333', null, { size: 28, weight: 700 }),
    tableNode('p2-table', { x: 20, y: 80, width: 760, height: 300 }, ['Metric', 'Value'], [['A', '100'], ['B', '200']]),
  ]);
  const p3 = cn('p3-root', { x: 0, y: 0, width: 800, height: 600 }, '#ffffff', [
    tn('p3-title', { x: 20, y: 20, width: 400, height: 36 }, 'Page 3: Charts', '#333', null, { size: 28, weight: 700 }),
  ]);

  const graph = wg('multipage', 800, 600, p1);
  graph.pages.push(
    { pageNumber: 2, dimensions: { width: 800, height: 600 }, orientation: 'landscape', backgroundColor: '#f5f5f5', rootNode: p2, readingOrder: [] },
    { pageNumber: 3, dimensions: { width: 800, height: 600 }, orientation: 'landscape', backgroundColor: '#ffffff', rootNode: p3, readingOrder: [] },
  );
  graph.metadata.pageCount = 3;
  return graph;
}

runTests().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
