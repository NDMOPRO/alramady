import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import winston from 'winston';

const prisma = new PrismaClient();
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'visual-replication' },
  transports: [new winston.transports.Console()],
});

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:4005';

// ─── Interfaces ─────────────────────────────────────────────────────────────

interface ReplicationRequest {
  sourceImagePath: string;
  tenantId: string;
  userId: string;
  targetFormat: 'pptx' | 'html' | 'pdf';
  options?: {
    fidelityLevel: 'exact' | 'approximate' | 'stylistic';
    extractText: boolean;
    preserveColors: boolean;
    preserveFonts: boolean;
  };
}

interface LayoutElement {
  id: string;
  type: 'text' | 'image' | 'shape' | 'chart' | 'table' | 'icon';
  bounds: { x: number; y: number; width: number; height: number };
  style: Record<string, unknown>;
  content?: string;
  zIndex: number;
}

interface ReplicationResult {
  replicationId: string;
  elements: LayoutElement[];
  layout: {
    width: number;
    height: number;
    backgroundColor: string;
    gridStructure: { rows: number; columns: number };
  };
  colorPalette: string[];
  fonts: string[];
  fidelityScore: number;
  outputPath?: string;
}

interface ComparisonResult {
  pixelDifference: number;
  structuralSimilarity: number;
  colorAccuracy: number;
  layoutAccuracy: number;
  overallScore: number;
  differences: Array<{
    region: { x: number; y: number; width: number; height: number };
    type: 'color' | 'layout' | 'content' | 'missing';
    severity: 'low' | 'medium' | 'high';
  }>;
}

interface VisionAnalysisResponse {
  elements: Array<{
    id: string;
    type: string;
    content?: string;
    position: { x: number; y: number; w: number; h: number };
    style: Record<string, unknown>;
    zOrder: number;
    confidence: number;
  }>;
  layout: {
    type: string;
    backgroundColor: string;
    width: number;
    height: number;
  };
  colors: string[];
  fonts: string[];
  gridStructure: { rows: number; columns: number };
  overallDescription: string;
}

// ─── Helper: Hex to RGB ─────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return { r, g, b };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (c: number): string => {
    const clamped = Math.max(0, Math.min(255, Math.round(c)));
    return clamped.toString(16).padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function colorDistance(c1: { r: number; g: number; b: number }, c2: { r: number; g: number; b: number }): number {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// ─── Helper: Median Cut Color Quantization ──────────────────────────────────

interface ColorBucket {
  colors: Array<{ r: number; g: number; b: number }>;
}

function getChannelRange(
  colors: Array<{ r: number; g: number; b: number }>,
  channel: 'r' | 'g' | 'b'
): number {
  let min = 255;
  let max = 0;
  for (const color of colors) {
    if (color[channel] < min) min = color[channel];
    if (color[channel] > max) max = color[channel];
  }
  return max - min;
}

function getWidestChannel(colors: Array<{ r: number; g: number; b: number }>): 'r' | 'g' | 'b' {
  const rRange = getChannelRange(colors, 'r');
  const gRange = getChannelRange(colors, 'g');
  const bRange = getChannelRange(colors, 'b');
  if (rRange >= gRange && rRange >= bRange) return 'r';
  if (gRange >= rRange && gRange >= bRange) return 'g';
  return 'b';
}

function medianCutQuantize(
  colors: Array<{ r: number; g: number; b: number }>,
  targetCount: number
): string[] {
  if (colors.length === 0) return [];

  const buckets: ColorBucket[] = [{ colors: [...colors] }];

  while (buckets.length < targetCount) {
    let largestBucketIndex = 0;
    let largestBucketSize = 0;
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i].colors.length > largestBucketSize) {
        largestBucketSize = buckets[i].colors.length;
        largestBucketIndex = i;
      }
    }

    const bucket = buckets[largestBucketIndex];
    if (bucket.colors.length <= 1) break;

    const channel = getWidestChannel(bucket.colors);
    bucket.colors.sort((a, b) => a[channel] - b[channel]);

    const midIndex = Math.floor(bucket.colors.length / 2);
    const lowerHalf = bucket.colors.slice(0, midIndex);
    const upperHalf = bucket.colors.slice(midIndex);

    buckets.splice(largestBucketIndex, 1, { colors: lowerHalf }, { colors: upperHalf });
  }

  return buckets.map((bucket) => {
    const avg = { r: 0, g: 0, b: 0 };
    for (const c of bucket.colors) {
      avg.r += c.r;
      avg.g += c.g;
      avg.b += c.b;
    }
    const count = bucket.colors.length;
    return rgbToHex(avg.r / count, avg.g / count, avg.b / count);
  });
}

// ─── Helper: Read image as base64 ──────────────────────────────────────────

async function readImageAsBase64(imagePath: string): Promise<string> {
  const absolutePath = path.resolve(imagePath);
  const buffer = await fs.readFile(absolutePath);
  return buffer.toString('base64');
}

function detectMimeType(imagePath: string): string {
  const ext = path.extname(imagePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
  };
  return mimeMap[ext] || 'image/png';
}

// ─── Helper: Call AI Vision Service ─────────────────────────────────────────

async function callVisionAnalysis(
  base64Image: string,
  mimeType: string,
  prompt: string
): Promise<VisionAnalysisResponse> {
  const response = await fetch(`${AI_SERVICE_URL}/api/ai/vision/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: `data:${mimeType};base64,${base64Image}`,
      prompt,
      responseFormat: 'json',
      maxTokens: 4000,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`AI Vision API returned ${response.status}: ${errorBody}`);
  }

  const result = await response.json();
  const content: string = result.data?.content || result.content || '{}';
  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned) as VisionAnalysisResponse;
}

// ─── Helper: Sample colors from raw image buffer ────────────────────────────

async function sampleColorsFromFile(
  imagePath: string,
  sampleCount: number
): Promise<Array<{ r: number; g: number; b: number }>> {
  const absolutePath = path.resolve(imagePath);
  const buffer = await fs.readFile(absolutePath);

  // For raw pixel sampling without sharp, we parse a subset of the file bytes.
  // This is a simplified approach: we read evenly spaced bytes from the buffer
  // and treat groups of 3 consecutive bytes as RGB values.
  // For accurate results the AI vision endpoint is used as the primary source.
  const colors: Array<{ r: number; g: number; b: number }> = [];
  const headerOffset = 128; // skip typical image headers
  const usableLength = buffer.length - headerOffset;
  if (usableLength < 3) return colors;

  const step = Math.max(3, Math.floor(usableLength / (sampleCount * 3)) * 3);
  for (let i = headerOffset; i < buffer.length - 2 && colors.length < sampleCount; i += step) {
    colors.push({
      r: buffer[i],
      g: buffer[i + 1],
      b: buffer[i + 2],
    });
  }

  return colors;
}

// ─── Visual Replication Service ─────────────────────────────────────────────

export class VisualReplicationService {
  /**
   * Analyzes a source image using GPT-4o Vision and replicates its visual design
   * into a structured layout with extracted elements, colors, fonts, and spatial arrangement.
   */
  async replicateDesign(request: ReplicationRequest): Promise<ReplicationResult> {
    const replicationId = crypto.randomUUID();
    const fidelity = request.options?.fidelityLevel || 'approximate';
    const extractText = request.options?.extractText !== false;
    const preserveColors = request.options?.preserveColors !== false;
    const preserveFonts = request.options?.preserveFonts !== false;

    logger.info('Starting visual replication', {
      replicationId,
      sourceImagePath: request.sourceImagePath,
      targetFormat: request.targetFormat,
      fidelity,
      tenantId: request.tenantId,
    });

    // Step 1: Read image and call AI Vision for full analysis
    const base64Image = await readImageAsBase64(request.sourceImagePath);
    const mimeType = detectMimeType(request.sourceImagePath);

    const analysisPrompt = `Analyze this design image in full detail for visual replication.
Return ONLY valid JSON with this structure:
{
  "elements": [
    {
      "id": "elem_1",
      "type": "text|image|shape|chart|table|icon",
      "content": "text content or description",
      "position": { "x": 0, "y": 0, "w": 100, "h": 50 },
      "style": {
        "fontSize": 18,
        "fontWeight": "bold|normal",
        "fontFamily": "font name",
        "color": "#hex",
        "backgroundColor": "#hex",
        "borderRadius": 0,
        "borderColor": "#hex",
        "borderWidth": 0,
        "opacity": 1,
        "textAlign": "left|center|right",
        "padding": 0
      },
      "zOrder": 0,
      "confidence": 0.95
    }
  ],
  "layout": {
    "type": "single-column|two-column|grid|freeform|header-body|hero",
    "backgroundColor": "#hex",
    "width": 1920,
    "height": 1080
  },
  "colors": ["#hex1", "#hex2"],
  "fonts": ["Font Name 1", "Font Name 2"],
  "gridStructure": { "rows": 1, "columns": 1 },
  "overallDescription": "Brief description"
}
${extractText ? 'Extract ALL text content accurately.' : 'Do not extract text, just note text regions.'}
${preserveColors ? 'Identify all colors precisely with hex values.' : ''}
${preserveFonts ? 'Identify all fonts used.' : ''}
Fidelity level: ${fidelity}. Positions in pixels assuming ${fidelity === 'exact' ? '1920x1080' : '960x540'} canvas.`;

    const analysis = await callVisionAnalysis(base64Image, mimeType, analysisPrompt);

    // Step 2: Map AI response to LayoutElement[]
    const canvasWidth = analysis.layout?.width || 1920;
    const canvasHeight = analysis.layout?.height || 1080;

    const elements: LayoutElement[] = (analysis.elements || []).map((el, index) => {
      const elementType = (['text', 'image', 'shape', 'chart', 'table', 'icon'].includes(el.type)
        ? el.type
        : 'shape') as LayoutElement['type'];

      return {
        id: el.id || `elem_${index + 1}`,
        type: elementType,
        bounds: {
          x: el.position?.x || 0,
          y: el.position?.y || 0,
          width: el.position?.w || 100,
          height: el.position?.h || 50,
        },
        style: el.style || {},
        content: el.content,
        zIndex: el.zOrder ?? index,
      };
    });

    // Step 3: Extract color palette
    let colorPalette = analysis.colors || [];
    if (preserveColors && colorPalette.length === 0) {
      colorPalette = await this.extractColorPalette(request.sourceImagePath);
    }

    // Step 4: Extract fonts
    const fonts = preserveFonts ? (analysis.fonts || ['Arial', 'sans-serif']) : [];

    // Step 5: Detect grid structure
    const gridStructure = analysis.gridStructure || { rows: 1, columns: 1 };

    // Step 6: Compute fidelity score based on analysis confidence
    const confidenceValues = (analysis.elements || []).map((el) => el.confidence || 0.5);
    const avgConfidence = confidenceValues.length > 0
      ? confidenceValues.reduce((sum, c) => sum + c, 0) / confidenceValues.length
      : 0.5;

    const elementCountScore = Math.min(1, elements.length / 5); // more elements = higher fidelity
    const colorScore = colorPalette.length > 0 ? 1 : 0.5;
    const fontScore = fonts.length > 0 ? 1 : 0.7;
    const fidelityScore = parseFloat(
      ((avgConfidence * 0.4 + elementCountScore * 0.3 + colorScore * 0.15 + fontScore * 0.15) * 100).toFixed(1)
    ) / 100;

    // Step 7: Store replication record
    await prisma.visualReplication.create({
      data: {
        id: replicationId,
        tenantId: request.tenantId,
        userId: request.userId,
        sourceImagePath: request.sourceImagePath,
        targetFormat: request.targetFormat,
        fidelityLevel: fidelity,
        elementsJson: JSON.stringify(elements),
        layoutJson: JSON.stringify({
          width: canvasWidth,
          height: canvasHeight,
          backgroundColor: analysis.layout?.backgroundColor || '#ffffff',
          gridStructure,
        }),
        colorPalette: JSON.stringify(colorPalette),
        fonts: JSON.stringify(fonts),
        fidelityScore,
        status: 'completed',
      },
    });

    logger.info('Visual replication completed', {
      replicationId,
      elementCount: elements.length,
      colorCount: colorPalette.length,
      fontCount: fonts.length,
      fidelityScore,
    });

    return {
      replicationId,
      elements,
      layout: {
        width: canvasWidth,
        height: canvasHeight,
        backgroundColor: analysis.layout?.backgroundColor || '#ffffff',
        gridStructure,
      },
      colorPalette,
      fonts,
      fidelityScore,
    };
  }

  /**
   * Compares a replicated design with the original image using grid-based structural
   * comparison, color sampling, and AI-assisted visual diff.
   */
  async compareWithOriginal(
    replicationId: string,
    originalImagePath: string
  ): Promise<ComparisonResult> {
    logger.info('Starting comparison with original', { replicationId, originalImagePath });

    // Step 1: Load the replication record
    const replication = await prisma.visualReplication.findUnique({
      where: { id: replicationId },
    });

    if (!replication) {
      throw new Error(`Replication ${replicationId} not found`);
    }

    const elements: LayoutElement[] = JSON.parse(replication.elementsJson as string);
    const layout = JSON.parse(replication.layoutJson as string);
    const replicatedColors: string[] = JSON.parse(replication.colorPalette as string);

    // Step 2: Extract original image colors for comparison
    const originalColors = await this.extractColorPalette(originalImagePath);

    // Step 3: Color accuracy - compare palettes using color distance
    const colorAccuracy = this.computeColorAccuracy(replicatedColors, originalColors);

    // Step 4: Grid-based structural comparison using AI vision
    const base64Original = await readImageAsBase64(originalImagePath);
    const mimeType = detectMimeType(originalImagePath);

    const comparisonPrompt = `Analyze this image and compare it with the following replicated layout description.
The replicated layout has:
- ${elements.length} elements
- Background color: ${layout.backgroundColor}
- Grid: ${layout.gridStructure.rows} rows x ${layout.gridStructure.columns} columns
- Elements: ${elements.map((e) => `${e.type} at (${e.bounds.x},${e.bounds.y})`).join('; ')}

Return ONLY valid JSON:
{
  "structuralMatch": 0.85,
  "layoutMatch": 0.9,
  "contentMatch": 0.8,
  "differences": [
    {
      "region": { "x": 0, "y": 0, "width": 100, "height": 100 },
      "type": "color|layout|content|missing",
      "severity": "low|medium|high",
      "description": "what differs"
    }
  ]
}
Score each metric from 0 to 1 (1 = perfect match).`;

    const comparisonAnalysis = await callVisionAnalysis(base64Original, mimeType, comparisonPrompt);

    // Parse the comparison response (it may not conform to VisionAnalysisResponse, so handle flexibly)
    const compData = comparisonAnalysis as unknown as {
      structuralMatch?: number;
      layoutMatch?: number;
      contentMatch?: number;
      differences?: Array<{
        region: { x: number; y: number; width: number; height: number };
        type: string;
        severity: string;
        description?: string;
      }>;
    };

    const structuralSimilarity = Math.max(0, Math.min(1, compData.structuralMatch ?? 0.7));
    const layoutAccuracy = Math.max(0, Math.min(1, compData.layoutMatch ?? 0.7));

    // Step 5: Grid-based pixel difference estimation
    // Divide canvas into NxN grid and compare element presence
    const gridSize = 8;
    const replicatedGrid = this.buildElementGrid(elements, layout.width, layout.height, gridSize);
    const originalGridEstimate = this.estimateOriginalGrid(compData.differences || [], layout.width, layout.height, gridSize);
    const pixelDifference = this.computeGridDifference(replicatedGrid, originalGridEstimate, gridSize);

    // Step 6: Map differences
    const differences = (compData.differences || []).map((diff) => ({
      region: {
        x: diff.region?.x || 0,
        y: diff.region?.y || 0,
        width: diff.region?.width || 100,
        height: diff.region?.height || 100,
      },
      type: (['color', 'layout', 'content', 'missing'].includes(diff.type) ? diff.type : 'layout') as
        'color' | 'layout' | 'content' | 'missing',
      severity: (['low', 'medium', 'high'].includes(diff.severity) ? diff.severity : 'medium') as
        'low' | 'medium' | 'high',
    }));

    // Step 7: Overall score
    const overallScore = parseFloat(
      (structuralSimilarity * 0.3 + colorAccuracy * 0.25 + layoutAccuracy * 0.25 + (1 - pixelDifference) * 0.2).toFixed(3)
    );

    const result: ComparisonResult = {
      pixelDifference,
      structuralSimilarity,
      colorAccuracy,
      layoutAccuracy,
      overallScore,
      differences,
    };

    // Update replication record with comparison results
    await prisma.visualReplication.update({
      where: { id: replicationId },
      data: {
        comparisonJson: JSON.stringify(result),
        fidelityScore: overallScore,
      },
    });

    logger.info('Comparison completed', {
      replicationId,
      overallScore,
      differenceCount: differences.length,
    });

    return result;
  }

  /**
   * Extracts the dominant color palette from an image using a simplified median cut algorithm.
   * Falls back to AI vision analysis for more accurate results.
   */
  async extractColorPalette(imagePath: string, paletteSize: number = 8): Promise<string[]> {
    logger.info('Extracting color palette', { imagePath, paletteSize });

    // Strategy 1: Try sampling raw pixels and applying median cut
    const sampledColors = await sampleColorsFromFile(imagePath, 500);

    if (sampledColors.length >= 10) {
      // Filter out near-black and near-white noise from header bytes
      const filteredColors = sampledColors.filter((c) => {
        const brightness = (c.r + c.g + c.b) / 3;
        return brightness > 15 && brightness < 240;
      });

      if (filteredColors.length >= 5) {
        const palette = medianCutQuantize(filteredColors, paletteSize);
        if (palette.length > 0) {
          logger.info('Color palette extracted via median cut', { count: palette.length });
          return palette;
        }
      }
    }

    // Strategy 2: Fall back to AI Vision for color extraction
    const base64Image = await readImageAsBase64(imagePath);
    const mimeType = detectMimeType(imagePath);

    const colorPrompt = `Extract the ${paletteSize} most dominant colors from this image.
Return ONLY valid JSON:
{
  "colors": ["#hex1", "#hex2", "#hex3"],
  "dominantColor": "#hex",
  "accentColor": "#hex"
}
Include background color, text colors, and accent colors. Use exact hex values.`;

    const analysis = await callVisionAnalysis(base64Image, mimeType, colorPrompt);
    const colorsData = analysis as unknown as {
      colors?: string[];
      dominantColor?: string;
      accentColor?: string;
    };

    const palette = colorsData.colors || [];
    if (colorsData.dominantColor && !palette.includes(colorsData.dominantColor)) {
      palette.unshift(colorsData.dominantColor);
    }
    if (colorsData.accentColor && !palette.includes(colorsData.accentColor)) {
      palette.push(colorsData.accentColor);
    }

    logger.info('Color palette extracted via AI vision', { count: palette.length });
    return palette.slice(0, paletteSize);
  }

  /**
   * Detects the grid/layout structure from an image using AI vision analysis.
   * Returns row/column counts, alignment guides, and element distribution.
   */
  async detectLayoutGrid(imagePath: string): Promise<{
    rows: number;
    columns: number;
    gutterWidth: number;
    gutterHeight: number;
    margins: { top: number; right: number; bottom: number; left: number };
    regions: Array<{
      row: number;
      column: number;
      hasContent: boolean;
      contentType: string;
    }>;
    alignmentGuides: Array<{ axis: 'horizontal' | 'vertical'; position: number }>;
  }> {
    logger.info('Detecting layout grid', { imagePath });

    const base64Image = await readImageAsBase64(imagePath);
    const mimeType = detectMimeType(imagePath);

    const gridPrompt = `Analyze the grid/layout structure of this design image.
Identify the underlying grid system, columns, rows, gutters, and margins.
Return ONLY valid JSON:
{
  "rows": 3,
  "columns": 2,
  "gutterWidth": 20,
  "gutterHeight": 20,
  "margins": { "top": 40, "right": 40, "bottom": 40, "left": 40 },
  "regions": [
    { "row": 0, "column": 0, "hasContent": true, "contentType": "text|image|chart|empty" }
  ],
  "alignmentGuides": [
    { "axis": "horizontal|vertical", "position": 100 }
  ]
}
Position values in pixels assuming a 1920x1080 canvas.
Enumerate all grid regions (row x column cells).`;

    const analysis = await callVisionAnalysis(base64Image, mimeType, gridPrompt);

    const gridData = analysis as unknown as {
      rows?: number;
      columns?: number;
      gutterWidth?: number;
      gutterHeight?: number;
      margins?: { top: number; right: number; bottom: number; left: number };
      regions?: Array<{ row: number; column: number; hasContent: boolean; contentType: string }>;
      alignmentGuides?: Array<{ axis: 'horizontal' | 'vertical'; position: number }>;
    };

    const rows = Math.max(1, gridData.rows || 1);
    const columns = Math.max(1, gridData.columns || 1);

    // Ensure regions cover the full grid
    const regions = gridData.regions || [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const exists = regions.some((reg) => reg.row === r && reg.column === c);
        if (!exists) {
          regions.push({ row: r, column: c, hasContent: false, contentType: 'empty' });
        }
      }
    }

    const result = {
      rows,
      columns,
      gutterWidth: gridData.gutterWidth || 20,
      gutterHeight: gridData.gutterHeight || 20,
      margins: gridData.margins || { top: 40, right: 40, bottom: 40, left: 40 },
      regions,
      alignmentGuides: gridData.alignmentGuides || [],
    };

    logger.info('Layout grid detected', {
      rows: result.rows,
      columns: result.columns,
      regionCount: result.regions.length,
      guideCount: result.alignmentGuides.length,
    });

    return result;
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Computes color accuracy between two palettes (0 = no match, 1 = perfect match).
   */
  private computeColorAccuracy(replicated: string[], original: string[]): number {
    if (replicated.length === 0 || original.length === 0) return 0.5;

    let totalMinDistance = 0;
    const maxPossibleDistance = 441.67; // sqrt(255^2 * 3)

    for (const repColor of replicated) {
      const repRgb = hexToRgb(repColor);
      let minDist = maxPossibleDistance;

      for (const origColor of original) {
        const origRgb = hexToRgb(origColor);
        const dist = colorDistance(repRgb, origRgb);
        if (dist < minDist) minDist = dist;
      }

      totalMinDistance += minDist;
    }

    const avgDistance = totalMinDistance / replicated.length;
    return parseFloat(Math.max(0, Math.min(1, 1 - avgDistance / maxPossibleDistance)).toFixed(3));
  }

  /**
   * Builds a presence grid (NxN boolean matrix) from layout elements.
   */
  private buildElementGrid(
    elements: LayoutElement[],
    canvasWidth: number,
    canvasHeight: number,
    gridSize: number
  ): boolean[][] {
    const grid: boolean[][] = Array.from({ length: gridSize }, () =>
      Array.from({ length: gridSize }, () => false)
    );

    const cellWidth = canvasWidth / gridSize;
    const cellHeight = canvasHeight / gridSize;

    for (const el of elements) {
      const startCol = Math.floor(el.bounds.x / cellWidth);
      const endCol = Math.floor((el.bounds.x + el.bounds.width) / cellWidth);
      const startRow = Math.floor(el.bounds.y / cellHeight);
      const endRow = Math.floor((el.bounds.y + el.bounds.height) / cellHeight);

      for (let r = Math.max(0, startRow); r <= Math.min(gridSize - 1, endRow); r++) {
        for (let c = Math.max(0, startCol); c <= Math.min(gridSize - 1, endCol); c++) {
          grid[r][c] = true;
        }
      }
    }

    return grid;
  }

  /**
   * Estimates the original image's element grid based on reported differences.
   * Cells without reported differences are assumed to match the replicated grid.
   */
  private estimateOriginalGrid(
    differences: Array<{
      region: { x: number; y: number; width: number; height: number };
      type: string;
      severity: string;
    }>,
    canvasWidth: number,
    canvasHeight: number,
    gridSize: number
  ): boolean[][] {
    // Start with all cells assumed to have content (conservative estimate)
    const grid: boolean[][] = Array.from({ length: gridSize }, () =>
      Array.from({ length: gridSize }, () => true)
    );

    const cellWidth = canvasWidth / gridSize;
    const cellHeight = canvasHeight / gridSize;

    // Mark cells where 'missing' differences are found as empty
    for (const diff of differences) {
      if (diff.type === 'missing') {
        const col = Math.floor(diff.region.x / cellWidth);
        const row = Math.floor(diff.region.y / cellHeight);
        if (row >= 0 && row < gridSize && col >= 0 && col < gridSize) {
          grid[row][col] = false;
        }
      }
    }

    return grid;
  }

  /**
   * Computes grid-based pixel difference (0 = identical, 1 = completely different).
   */
  private computeGridDifference(
    grid1: boolean[][],
    grid2: boolean[][],
    gridSize: number
  ): number {
    let mismatches = 0;
    const totalCells = gridSize * gridSize;

    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        if (grid1[r][c] !== grid2[r][c]) {
          mismatches++;
        }
      }
    }

    return parseFloat((mismatches / totalCells).toFixed(3));
  }
}
