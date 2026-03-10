import sharp from 'sharp';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

export interface VisualAnalysis {
  layout: LayoutDescription;
  colors: string[];
  fonts: string[];
  textContent: TextBlock[];
  charts: ChartDetection[];
  dataTables: DataTable[];
  dimensions: { width: number; height: number };
  timestamp: string;
}

export interface TextBlock {
  text: string;
  position: { x: number; y: number; width: number; height: number };
  fontSize: string;
  fontWeight: string;
  alignment: string;
}

export interface LayoutDescription {
  gridStructure: string;
  columns: number;
  rows: number;
  elements: LayoutElement[];
  spacing: string;
  alignment: string;
}

export interface LayoutElement {
  type: string;
  position: { x: number; y: number; width: number; height: number };
  description: string;
  zIndex: number;
}

export interface ChartDetection {
  type: string;
  title: string;
  dataPoints: Array<{ label: string; value: number }>;
  position: { x: number; y: number; width: number; height: number };
  colors: string[];
}

export interface DataTable {
  headers: string[];
  rows: string[][];
  position: { x: number; y: number; width: number; height: number };
}

export interface ImageComparison {
  similarityScore: number;
  pixelDiffCount: number;
  totalPixels: number;
  diffImageBuffer: Buffer;
  dimensions: { width: number; height: number };
  matchPercentage: number;
}

export async function analyzeImage(image: Buffer): Promise<VisualAnalysis> {
  const metadata = await sharp(image).metadata();
  const imageWidth = metadata.width || 800;
  const imageHeight = metadata.height || 600;

  const resizedBuffer = await sharp(image)
    .resize({ width: Math.min(imageWidth, 2048), fit: 'inside' })
    .png()
    .toBuffer();

  const base64Image = resizedBuffer.toString('base64');
  const dataUri = `data:image/png;base64,${base64Image}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze this image in detail. Return a JSON object with exactly these fields:
{
  "layout": { "gridStructure": "description of grid/layout system", "columns": number, "rows": number, "elements": [{ "type": "text|image|chart|table|button|header|footer|sidebar", "position": { "x": percent_from_left, "y": percent_from_top, "width": percent_width, "height": percent_height }, "description": "what this element contains", "zIndex": layer_number }], "spacing": "tight|normal|loose", "alignment": "left|center|right|mixed" },
  "colors": ["#hex1", "#hex2", ...],
  "fonts": ["font names detected or estimated"],
  "textContent": [{ "text": "actual text", "position": { "x": 0, "y": 0, "width": 100, "height": 10 }, "fontSize": "small|medium|large|xlarge", "fontWeight": "normal|bold", "alignment": "left|center|right" }],
  "charts": [{ "type": "bar|line|pie|scatter|area|donut", "title": "chart title", "dataPoints": [{ "label": "name", "value": number }], "position": { "x": 0, "y": 0, "width": 50, "height": 50 }, "colors": ["#hex"] }],
  "dataTables": [{ "headers": ["col1", "col2"], "rows": [["val1", "val2"]], "position": { "x": 0, "y": 0, "width": 100, "height": 30 } }]
}
Return ONLY valid JSON, no markdown.`,
          },
          {
            type: 'image_url',
            image_url: { url: dataUri, detail: 'high' },
          },
        ],
      },
    ],
    max_tokens: 4096,
    temperature: 0.1,
  });

  const rawContent = response.choices[0]?.message?.content || '{}';
  const cleanedContent = rawContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(cleanedContent);
  } catch (parseError) {
    const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  }

  const analysis: VisualAnalysis = {
    layout: (parsed.layout || {
      gridStructure: 'single-column',
      columns: 1,
      rows: 1,
      elements: [],
      spacing: 'normal',
      alignment: 'left',
    }) as LayoutDescription,
    colors: Array.isArray(parsed.colors) ? parsed.colors : [],
    fonts: Array.isArray(parsed.fonts) ? parsed.fonts : [],
    textContent: Array.isArray(parsed.textContent) ? parsed.textContent : [],
    charts: Array.isArray(parsed.charts) ? parsed.charts : [],
    dataTables: Array.isArray(parsed.dataTables) ? parsed.dataTables : [],
    dimensions: { width: imageWidth, height: imageHeight },
    timestamp: new Date().toISOString(),
  };

  return analysis;
}

export async function extractColorPalette(image: Buffer): Promise<string[]> {
  const resizedBuffer = await sharp(image)
    .resize(100, 100, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer();

  const pixelCount = resizedBuffer.length / 3;
  const pixels: Array<[number, number, number]> = [];
  for (let i = 0; i < resizedBuffer.length; i += 3) {
    pixels.push([resizedBuffer[i], resizedBuffer[i + 1], resizedBuffer[i + 2]]);
  }

  const k = 5;
  const centroids: Array<[number, number, number]> = [];
  const step = Math.floor(pixelCount / k);
  for (let i = 0; i < k; i++) {
    const idx = Math.min(i * step, pixelCount - 1);
    centroids.push([...pixels[idx]]);
  }

  const maxIterations = 20;
  for (let iter = 0; iter < maxIterations; iter++) {
    const clusters: Array<Array<[number, number, number]>> = Array.from({ length: k }, () => []);

    for (const pixel of pixels) {
      let minDist = Infinity;
      let closestCluster = 0;
      for (let c = 0; c < k; c++) {
        const dr = pixel[0] - centroids[c][0];
        const dg = pixel[1] - centroids[c][1];
        const db = pixel[2] - centroids[c][2];
        const dist = dr * dr + dg * dg + db * db;
        if (dist < minDist) {
          minDist = dist;
          closestCluster = c;
        }
      }
      clusters[closestCluster].push(pixel);
    }

    let converged = true;
    for (let c = 0; c < k; c++) {
      if (clusters[c].length === 0) {
        continue;
      }
      const sumR = clusters[c].reduce((s, p) => s + p[0], 0);
      const sumG = clusters[c].reduce((s, p) => s + p[1], 0);
      const sumB = clusters[c].reduce((s, p) => s + p[2], 0);
      const count = clusters[c].length;
      const newR = Math.round(sumR / count);
      const newG = Math.round(sumG / count);
      const newB = Math.round(sumB / count);

      if (newR !== centroids[c][0] || newG !== centroids[c][1] || newB !== centroids[c][2]) {
        converged = false;
      }
      centroids[c] = [newR, newG, newB];
    }

    if (converged) {
      break;
    }
  }

  const hexColors = centroids.map(([r, g, b]) => {
    const toHex = (v: number) => v.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  });

  const uniqueColors = [...new Set(hexColors)];

  const sortedColors = uniqueColors.sort((a, b) => {
    const lumA = parseInt(a.slice(1, 3), 16) * 0.299 + parseInt(a.slice(3, 5), 16) * 0.587 + parseInt(a.slice(5, 7), 16) * 0.114;
    const lumB = parseInt(b.slice(1, 3), 16) * 0.299 + parseInt(b.slice(3, 5), 16) * 0.587 + parseInt(b.slice(5, 7), 16) * 0.114;
    return lumB - lumA;
  });

  return sortedColors;
}

export async function extractText(image: Buffer): Promise<TextBlock[]> {
  const resizedBuffer = await sharp(image)
    .resize({ width: 2048, fit: 'inside' })
    .png()
    .toBuffer();

  const base64Image = resizedBuffer.toString('base64');
  const dataUri = `data:image/png;base64,${base64Image}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Extract all text from this image, preserving layout and position. Return a JSON array of text blocks:
[{
  "text": "the actual text content",
  "position": { "x": percent_from_left, "y": percent_from_top, "width": percent_width, "height": percent_height },
  "fontSize": "small|medium|large|xlarge",
  "fontWeight": "normal|bold",
  "alignment": "left|center|right"
}]
Include every piece of text visible in the image. Return ONLY valid JSON array, no markdown.`,
          },
          {
            type: 'image_url',
            image_url: { url: dataUri, detail: 'high' },
          },
        ],
      },
    ],
    max_tokens: 4096,
    temperature: 0.1,
  });

  const rawContent = response.choices[0]?.message?.content || '[]';
  const cleanedContent = rawContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  let parsed: Array<Record<string, unknown>>;

  try {
    parsed = JSON.parse(cleanedContent);
  } catch {
    const arrayMatch = cleanedContent.match(/\[[\s\S]*\]/);
    parsed = arrayMatch ? JSON.parse(arrayMatch[0]) : [];
  }

  const textBlocks: TextBlock[] = parsed.map((block: Record<string, unknown>) => ({
    text: String(block.text || ''),
    position: {
      x: Number((block.position as Record<string, unknown>)?.x) || 0,
      y: Number((block.position as Record<string, unknown>)?.y) || 0,
      width: Number((block.position as Record<string, unknown>)?.width) || 100,
      height: Number((block.position as Record<string, unknown>)?.height) || 10,
    },
    fontSize: String(block.fontSize || 'medium'),
    fontWeight: String(block.fontWeight || 'normal'),
    alignment: String(block.alignment || 'left'),
  })) as TextBlock[];

  return textBlocks;
}

export async function extractLayout(image: Buffer): Promise<LayoutDescription> {
  const resizedBuffer = await sharp(image)
    .resize({ width: 2048, fit: 'inside' })
    .png()
    .toBuffer();

  const base64Image = resizedBuffer.toString('base64');
  const dataUri = `data:image/png;base64,${base64Image}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze the layout structure of this image. Detect grid structure, element positions, and bounding boxes. Return JSON:
{
  "gridStructure": "description of the layout system (e.g., 2-column grid, single column, dashboard grid)",
  "columns": number_of_columns,
  "rows": number_of_rows,
  "elements": [{ "type": "header|sidebar|content|footer|card|chart|table|image|text|button|nav", "position": { "x": percent, "y": percent, "width": percent, "height": percent }, "description": "what this element is", "zIndex": layer_number }],
  "spacing": "tight|normal|loose",
  "alignment": "left|center|right|mixed"
}
Return ONLY valid JSON, no markdown.`,
          },
          {
            type: 'image_url',
            image_url: { url: dataUri, detail: 'high' },
          },
        ],
      },
    ],
    max_tokens: 4096,
    temperature: 0.1,
  });

  const rawContent = response.choices[0]?.message?.content || '{}';
  const cleanedContent = rawContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(cleanedContent);
  } catch {
    const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  }

  const layout: LayoutDescription = {
    gridStructure: String(parsed.gridStructure || 'unknown'),
    columns: Number(parsed.columns) || 1,
    rows: Number(parsed.rows) || 1,
    elements: Array.isArray(parsed.elements)
      ? (parsed.elements as Array<Record<string, unknown>>).map((el: Record<string, unknown>) => ({
          type: String(el.type || 'unknown'),
          position: {
            x: Number((el.position as Record<string, unknown>)?.x) || 0,
            y: Number((el.position as Record<string, unknown>)?.y) || 0,
            width: Number((el.position as Record<string, unknown>)?.width) || 100,
            height: Number((el.position as Record<string, unknown>)?.height) || 100,
          },
          description: String(el.description || ''),
          zIndex: Number(el.zIndex) || 0,
        })) as LayoutElement[]
      : [],
    spacing: String(parsed.spacing || 'normal'),
    alignment: String(parsed.alignment || 'left'),
  };

  return layout;
}

export async function extractCharts(image: Buffer): Promise<ChartDetection[]> {
  const resizedBuffer = await sharp(image)
    .resize({ width: 2048, fit: 'inside' })
    .png()
    .toBuffer();

  const base64Image = resizedBuffer.toString('base64');
  const dataUri = `data:image/png;base64,${base64Image}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Detect all charts and graphs in this image. For each chart, identify its type and approximate data values. Return JSON array:
[{
  "type": "bar|line|pie|scatter|area|donut|histogram|heatmap",
  "title": "chart title if visible",
  "dataPoints": [{ "label": "category or x-value", "value": approximate_numeric_value }],
  "position": { "x": percent, "y": percent, "width": percent, "height": percent },
  "colors": ["#hex colors used in the chart"]
}]
If no charts are found, return an empty array []. Return ONLY valid JSON, no markdown.`,
          },
          {
            type: 'image_url',
            image_url: { url: dataUri, detail: 'high' },
          },
        ],
      },
    ],
    max_tokens: 4096,
    temperature: 0.1,
  });

  const rawContent = response.choices[0]?.message?.content || '[]';
  const cleanedContent = rawContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  let parsed: Array<Record<string, unknown>>;

  try {
    parsed = JSON.parse(cleanedContent);
  } catch {
    const arrayMatch = cleanedContent.match(/\[[\s\S]*\]/);
    parsed = arrayMatch ? JSON.parse(arrayMatch[0]) : [];
  }

  const charts: ChartDetection[] = parsed.map((chart: Record<string, unknown>) => ({
    type: String(chart.type || 'unknown'),
    title: String(chart.title || 'Untitled Chart'),
    dataPoints: Array.isArray(chart.dataPoints)
      ? (chart.dataPoints as Array<Record<string, unknown>>).map((dp: Record<string, unknown>) => ({
          label: String(dp.label || ''),
          value: Number(dp.value) || 0,
        }))
      : [],
    position: {
      x: Number((chart.position as Record<string, unknown>)?.x) || 0,
      y: Number((chart.position as Record<string, unknown>)?.y) || 0,
      width: Number((chart.position as Record<string, unknown>)?.width) || 50,
      height: Number((chart.position as Record<string, unknown>)?.height) || 50,
    },
    colors: Array.isArray(chart.colors) ? chart.colors as string[] : [],
  })) as ChartDetection[];

  return charts;
}

export async function compareImages(original: Buffer, replica: Buffer): Promise<ImageComparison> {
  const originalMeta = await sharp(original).metadata();
  const replicaMeta = await sharp(replica).metadata();

  const targetWidth = Math.max(originalMeta.width || 800, replicaMeta.width || 800);
  const targetHeight = Math.max(originalMeta.height || 600, replicaMeta.height || 600);

  const normalizedWidth = Math.min(targetWidth, 2048);
  const normalizedHeight = Math.min(targetHeight, 2048);

  const originalResized = await sharp(original)
    .resize(normalizedWidth, normalizedHeight, { fit: 'fill' })
    .png()
    .toBuffer();

  const replicaResized = await sharp(replica)
    .resize(normalizedWidth, normalizedHeight, { fit: 'fill' })
    .png()
    .toBuffer();

  const originalPng = PNG.sync.read(originalResized);
  const replicaPng = PNG.sync.read(replicaResized);

  const width = originalPng.width;
  const height = originalPng.height;

  const diffPng = new PNG({ width, height });

  const mismatchedPixels = pixelmatch(
    originalPng.data,
    replicaPng.data,
    diffPng.data,
    width,
    height,
    {
      threshold: 0.1,
      includeAA: true,
      alpha: 0.1,
      diffColor: [255, 0, 0],
      diffColorAlt: [0, 255, 0],
      aaColor: [255, 255, 0],
    }
  );

  const totalPixels = width * height;
  const matchedPixels = totalPixels - mismatchedPixels;
  const matchPercentage = (matchedPixels / totalPixels) * 100;

  const diffBuffer = PNG.sync.write(diffPng);

  const diffImageCompressed = await sharp(diffBuffer)
    .png({ compressionLevel: 9 })
    .toBuffer();

  const comparison: ImageComparison = {
    similarityScore: Math.round(matchPercentage * 100) / 100,
    pixelDiffCount: mismatchedPixels,
    totalPixels,
    diffImageBuffer: diffImageCompressed,
    dimensions: { width, height },
    matchPercentage: Math.round(matchPercentage * 100) / 100,
  };

  return comparison;
}

export async function calculateSSIM(original: Buffer, replica: Buffer): Promise<number> {
  const targetSize = 256;

  const originalResized = await sharp(original)
    .resize(targetSize, targetSize, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer();

  const replicaResized = await sharp(replica)
    .resize(targetSize, targetSize, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer();

  const n = targetSize * targetSize;

  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;

  for (let i = 0; i < n; i++) {
    const x = originalResized[i];
    const y = replicaResized[i];
    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumYY += y * y;
    sumXY += x * y;
  }

  const meanX = sumX / n;
  const meanY = sumY / n;

  const varianceX = (sumXX / n) - (meanX * meanX);
  const varianceY = (sumYY / n) - (meanY * meanY);
  const covariance = (sumXY / n) - (meanX * meanY);

  const sigmaX = Math.sqrt(Math.max(varianceX, 0));
  const sigmaY = Math.sqrt(Math.max(varianceY, 0));

  const L = 255;
  const k1 = 0.01;
  const k2 = 0.03;
  const c1 = (k1 * L) * (k1 * L);
  const c2 = (k2 * L) * (k2 * L);
  const c3 = c2 / 2;

  const luminance = (2 * meanX * meanY + c1) / (meanX * meanX + meanY * meanY + c1);
  const contrast = (2 * sigmaX * sigmaY + c2) / (varianceX + varianceY + c2);
  const structure = (covariance + c3) / (sigmaX * sigmaY + c3);

  const ssimValue = luminance * contrast * structure;
  const clampedSSIM = Math.max(0, Math.min(1, ssimValue));

  const roundedSSIM = Math.round(clampedSSIM * 10000) / 10000;

  return roundedSSIM;
}
