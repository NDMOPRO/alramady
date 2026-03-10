import OpenAI from 'openai';
import winston from 'winston';
import crypto from 'crypto';
import * as slideBuilder from './slide-builder.service.js';

// Dynamic Prisma import to support mocking
interface PrismaDelegate {
  presentation: { update(args: Record<string, unknown>): Promise<unknown> };
}

let prisma: PrismaDelegate;
try {
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient() as unknown as PrismaDelegate;
} catch {
  prisma = {} as unknown as PrismaDelegate;
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'source-processor' },
  transports: [new winston.transports.Console()],
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder' || '' });

// ─── Source Type Registry ────────────────────────────────────
export type SourceType =
  | 'text' | 'pdf' | 'word' | 'url' | 'email' | 'youtube'
  | 'image' | 'json' | 'csv' | 'excel' | 'html' | 'markdown' | 'pptx';

export interface SourceInput {
  type: SourceType;
  content?: string;
  filePath?: string;
  fileBuffer?: Buffer;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface ProcessedSource {
  sourceType: SourceType;
  extractedText: string;
  title: string;
  sections: { heading: string; content: string }[];
  metadata: Record<string, unknown>;
  mediaAssets: { type: string; data: string; description: string }[];
}

export interface PresentationOptions {
  slideCount?: number;
  style?: string;
  language?: string;
  templateId?: string;
  includeCharts?: boolean;
  includeSpeakerNotes?: boolean;
  targetAudience?: string;
  detailLevel?: 'brief' | 'standard' | 'detailed';
}

// ─── Main Entry Point ────────────────────────────────────────
export async function createPresentationFromSource(
  source: SourceInput,
  options: PresentationOptions,
  tenantId: string,
  userId: string
): Promise<Record<string, unknown>> {
  logger.info('Processing source for presentation', { type: source.type, tenantId, userId });

  const processed = await processSource(source);
  const presentation = await generatePresentation(processed, options, tenantId, userId);

  await prisma.presentation.update({
    where: { id: presentation.presentationId },
    data: {
      settings: {
        sourceProcessing: {
          sourceType: source.type,
          processedAt: new Date().toISOString(),
          extractedSections: processed.sections.length,
          mediaAssets: processed.mediaAssets.length,
        },
      } as Record<string, unknown>,
    },
  });

  logger.info('Presentation created from source', {
    presId: presentation.presentationId,
    sourceType: source.type,
    slides: presentation.slideCount,
  });

  return presentation;
}

// ─── Source Processing ───────────────────────────────────────
export async function processSource(source: SourceInput): Promise<ProcessedSource> {
  switch (source.type) {
    case 'text':
      return processTextSource(source);
    case 'pdf':
      return processPdfSource(source);
    case 'word':
      return processWordSource(source);
    case 'url':
      return processUrlSource(source);
    case 'email':
      return processEmailSource(source);
    case 'youtube':
      return processYoutubeSource(source);
    case 'image':
      return processImageSource(source);
    case 'json':
      return processJsonSource(source);
    case 'excel':
      return processExcelSource(source);
    case 'csv':
      return processCsvSource(source);
    case 'markdown':
      return processMarkdownSource(source);
    case 'html':
      return processHtmlSource(source);
    case 'pptx':
      return processPptxSource(source);
    default:
      throw new Error(`Unsupported source type: ${source.type}`);
  }
}

// ─── Text Source ─────────────────────────────────────────────
async function processTextSource(source: SourceInput): Promise<ProcessedSource> {
  const text = source.content || '';
  if (!text.trim()) throw new Error('Text content is empty');

  const sections = splitIntoSections(text);
  const title = await extractTitle(text);

  return {
    sourceType: 'text',
    extractedText: text,
    title,
    sections,
    metadata: { charCount: text.length, wordCount: text.split(/\s+/).length },
    mediaAssets: [],
  };
}

// ─── PDF Source ──────────────────────────────────────────────
async function processPdfSource(source: SourceInput): Promise<ProcessedSource> {
  const buffer = source.fileBuffer;
  if (!buffer) throw new Error('PDF file buffer is required');

  // Use pdf-parse for text extraction
  let pdfParse: (buffer: Buffer) => Promise<{ text: string; numpages: number; info: Record<string, unknown> }>;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    pdfParse = require('pdf-parse');
  } catch {
    // Fallback: use OpenAI vision to extract text from PDF pages
    return await processPdfWithVision(buffer);
  }

  const pdfData = await pdfParse(buffer);
  const text = pdfData.text || '';
  const sections = splitIntoSections(text);
  const title = await extractTitle(text);

  return {
    sourceType: 'pdf',
    extractedText: text,
    title,
    sections,
    metadata: {
      pageCount: pdfData.numpages || 0,
      charCount: text.length,
      info: pdfData.info || {},
    },
    mediaAssets: [],
  };
}

async function processPdfWithVision(buffer: Buffer): Promise<ProcessedSource> {
  const base64 = buffer.toString('base64');

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Extract all text content from this PDF document. Return JSON:
{
  "title": "Document title",
  "sections": [{"heading": "section heading", "content": "section text"}],
  "fullText": "complete extracted text"
}`,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract all text and structure from this PDF document.' },
          { type: 'image_url', image_url: { url: `data:application/pdf;base64,${base64}`, detail: 'high' } },
        ],
      },
    ],
    max_tokens: 4000,
    temperature: 0.2,
    response_format: { type: 'json_object' },
  });

  const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
  return {
    sourceType: 'pdf',
    extractedText: response.fullText || '',
    title: response.title || 'PDF Document',
    sections: response.sections || [],
    metadata: { extractionMethod: 'vision' },
    mediaAssets: [],
  };
}

// ─── Word Source ─────────────────────────────────────────────
async function processWordSource(source: SourceInput): Promise<ProcessedSource> {
  const buffer = source.fileBuffer;
  if (!buffer) throw new Error('Word file buffer is required');

  let mammoth: { convertToHtml(input: { buffer: Buffer }): Promise<{ value: string; messages: unknown[] }> };
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mammoth = require('mammoth');
  } catch {
    // Fallback: extract raw text with basic parsing
    return processWordFallback(buffer);
  }

  const result = await mammoth.convertToHtml({ buffer });
  const html = result.value || '';
  const text = htmlToText(html);
  const sections = extractSectionsFromHtml(html);
  const title = await extractTitle(text);

  return {
    sourceType: 'word',
    extractedText: text,
    title,
    sections,
    metadata: {
      warnings: result.messages?.length || 0,
      charCount: text.length,
    },
    mediaAssets: [],
  };
}

async function processWordFallback(buffer: Buffer): Promise<ProcessedSource> {
  // Extract readable text segments from the buffer
  const rawText = buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t\u0600-\u06FF\u0750-\u077F]/g, ' ');
  const cleanedText = rawText.replace(/\s{3,}/g, '\n\n').trim();
  const sections = splitIntoSections(cleanedText);
  const title = await extractTitle(cleanedText);

  return {
    sourceType: 'word',
    extractedText: cleanedText,
    title,
    sections,
    metadata: { extractionMethod: 'fallback', charCount: cleanedText.length },
    mediaAssets: [],
  };
}

// ─── URL Source ──────────────────────────────────────────────
async function processUrlSource(source: SourceInput): Promise<ProcessedSource> {
  const url = source.url || source.content;
  if (!url) throw new Error('URL is required');

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'RASID-Bot/1.0 (Presentation Generator)',
      'Accept': 'text/html,application/xhtml+xml,text/plain',
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);

  const contentType = response.headers.get('content-type') || '';
  const rawHtml = await response.text();
  const text = htmlToText(rawHtml);
  const sections = extractSectionsFromHtml(rawHtml);
  const title = extractTitleFromHtml(rawHtml) || await extractTitle(text);

  return {
    sourceType: 'url',
    extractedText: text,
    title,
    sections,
    metadata: {
      url,
      contentType,
      fetchedAt: new Date().toISOString(),
      charCount: text.length,
    },
    mediaAssets: [],
  };
}

// ─── Email Source ────────────────────────────────────────────
async function processEmailSource(source: SourceInput): Promise<ProcessedSource> {
  const emailContent = source.content || '';
  if (!emailContent.trim()) throw new Error('Email content is empty');

  // Parse email headers and body
  const headers = parseEmailHeaders(emailContent);
  const body = extractEmailBody(emailContent);
  const sections = splitIntoSections(body);

  return {
    sourceType: 'email',
    extractedText: body,
    title: headers.subject || 'Email Presentation',
    sections: [
      { heading: 'Email Details', content: `From: ${headers.from}\nTo: ${headers.to}\nDate: ${headers.date}` },
      ...sections,
    ],
    metadata: {
      from: headers.from,
      to: headers.to,
      subject: headers.subject,
      date: headers.date,
    },
    mediaAssets: [],
  };
}

// ─── YouTube Source ──────────────────────────────────────────
async function processYoutubeSource(source: SourceInput): Promise<ProcessedSource> {
  const url = source.url || source.content;
  if (!url) throw new Error('YouTube URL is required');

  const videoId = extractYoutubeVideoId(url);
  if (!videoId) throw new Error('Invalid YouTube URL');

  // Use OpenAI to generate presentation content from video context
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a research assistant. Given a YouTube video URL/ID, provide structured content for a presentation.
Return JSON:
{
  "title": "Video title/topic",
  "sections": [{"heading": "topic heading", "content": "detailed content"}],
  "summary": "video summary",
  "keyPoints": ["point1", "point2"]
}`,
      },
      {
        role: 'user',
        content: `Create presentation content based on this YouTube video: ${url} (Video ID: ${videoId}). Generate informative content sections that would make a good presentation.`,
      },
    ],
    max_tokens: 4000,
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const response = JSON.parse(completion.choices[0]?.message?.content || '{}');

  return {
    sourceType: 'youtube',
    extractedText: response.summary || '',
    title: response.title || 'YouTube Video Presentation',
    sections: response.sections || [],
    metadata: {
      videoId,
      url,
      keyPoints: response.keyPoints || [],
    },
    mediaAssets: [],
  };
}

// ─── Image Source ────────────────────────────────────────────
async function processImageSource(source: SourceInput): Promise<ProcessedSource> {
  const buffer = source.fileBuffer;
  if (!buffer) throw new Error('Image buffer is required');

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sharp = require('sharp');
  const resized = await sharp(buffer)
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();

  const base64 = resized.toString('base64');

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Analyze this image and extract content for a presentation. Return JSON:
{
  "title": "Image topic/title",
  "description": "Detailed description",
  "sections": [{"heading": "aspect", "content": "details"}],
  "keyInsights": ["insight1", "insight2"]
}`,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analyze this image and create presentation content from it.' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}`, detail: 'high' } },
        ],
      },
    ],
    max_tokens: 3000,
    temperature: 0.5,
    response_format: { type: 'json_object' },
  });

  const response = JSON.parse(completion.choices[0]?.message?.content || '{}');

  return {
    sourceType: 'image',
    extractedText: response.description || '',
    title: response.title || 'Image Presentation',
    sections: response.sections || [],
    metadata: { keyInsights: response.keyInsights || [] },
    mediaAssets: [{ type: 'image', data: `data:image/png;base64,${base64}`, description: response.description || '' }],
  };
}

// ─── JSON Source ─────────────────────────────────────────────
async function processJsonSource(source: SourceInput): Promise<ProcessedSource> {
  const content = source.content || (source.fileBuffer ? source.fileBuffer.toString('utf-8') : '');
  if (!content.trim()) throw new Error('JSON content is empty');

  const data = JSON.parse(content);
  const summary = JSON.stringify(data, null, 2).substring(0, 5000);

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Analyze JSON data and structure it for a presentation. Return JSON:
{
  "title": "Data title",
  "sections": [{"heading": "section", "content": "analysis"}],
  "dataInsights": ["insight1"],
  "chartSuggestions": [{"type": "bar|line|pie", "dataKey": "field", "description": "what to chart"}]
}`,
      },
      {
        role: 'user',
        content: `Analyze this JSON data and create presentation content:\n\n${summary}`,
      },
    ],
    max_tokens: 3000,
    temperature: 0.5,
    response_format: { type: 'json_object' },
  });

  const response = JSON.parse(completion.choices[0]?.message?.content || '{}');

  return {
    sourceType: 'json',
    extractedText: summary,
    title: response.title || 'Data Presentation',
    sections: response.sections || [],
    metadata: {
      dataInsights: response.dataInsights || [],
      chartSuggestions: response.chartSuggestions || [],
      recordCount: Array.isArray(data) ? data.length : Object.keys(data).length,
    },
    mediaAssets: [],
  };
}

// ─── CSV Source ──────────────────────────────────────────────
async function processCsvSource(source: SourceInput): Promise<ProcessedSource> {
  const content = source.content || (source.fileBuffer ? source.fileBuffer.toString('utf-8') : '');
  if (!content.trim()) throw new Error('CSV content is empty');

  const lines = content.split('\n').filter(l => l.trim());
  const headers = lines[0]?.split(',').map(h => h.trim().replace(/^"|"$/g, '')) || [];
  const rowCount = lines.length - 1;
  const preview = lines.slice(0, 11).join('\n');

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Analyze CSV data for a presentation. Return JSON:
{
  "title": "Data Analysis",
  "sections": [{"heading": "section", "content": "analysis"}],
  "dataInsights": ["insight1"],
  "chartSuggestions": [{"type": "bar|line|pie", "columns": ["col1"], "description": "what to chart"}]
}`,
      },
      {
        role: 'user',
        content: `Analyze this CSV data (${rowCount} rows, columns: ${headers.join(', ')}):\n\n${preview}`,
      },
    ],
    max_tokens: 3000,
    temperature: 0.5,
    response_format: { type: 'json_object' },
  });

  const response = JSON.parse(completion.choices[0]?.message?.content || '{}');

  return {
    sourceType: 'csv',
    extractedText: preview,
    title: response.title || 'CSV Data Analysis',
    sections: response.sections || [],
    metadata: {
      headers,
      rowCount,
      dataInsights: response.dataInsights || [],
      chartSuggestions: response.chartSuggestions || [],
    },
    mediaAssets: [],
  };
}

// ─── Excel Source ────────────────────────────────────────────
async function processExcelSource(source: SourceInput): Promise<ProcessedSource> {
  const buffer = source.fileBuffer;
  if (!buffer) throw new Error('Excel file buffer is required');

  let ExcelJS: { Workbook: new () => { xlsx: { load(buffer: Buffer): Promise<void> }; eachSheet(callback: (worksheet: Record<string, unknown>) => void): void } };
  try {
    ExcelJS = require('exceljs');
  } catch {
    // Fallback: try xlsx package
    return processExcelFallback(buffer);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheets: { name: string; headers: string[]; rows: string[][]; rowCount: number }[] = [];
  const allText: string[] = [];

  workbook.eachSheet((worksheet: Record<string, unknown>) => {
    const sheetName = (worksheet.name as string) || 'Sheet';
    const headers: string[] = [];
    const rows: string[][] = [];
    let rowIdx = 0;

    const eachRow = worksheet.eachRow as (callback: (row: Record<string, unknown>, rowNumber: number) => void) => void;
    eachRow((row: Record<string, unknown>, rowNumber: number) => {
      const cellValues = row.values as unknown[];
      // row.values is 1-indexed, skip index 0
      const cleaned = (cellValues || []).slice(1).map((v: unknown) => {
        if (v === null || v === undefined) return '';
        if (typeof v === 'object' && v !== null && 'result' in v) return String((v as Record<string, unknown>).result);
        if (typeof v === 'object' && v !== null && 'text' in v) return String((v as Record<string, unknown>).text);
        return String(v);
      });

      if (rowIdx === 0) {
        headers.push(...cleaned);
      } else {
        rows.push(cleaned);
      }
      rowIdx++;
    });

    sheets.push({ name: sheetName, headers, rows, rowCount: rows.length });
    allText.push(`Sheet: ${sheetName}`);
    if (headers.length > 0) allText.push(`Columns: ${headers.join(', ')}`);
    // Include preview of first 10 rows
    const previewRows = rows.slice(0, 10);
    for (const row of previewRows) {
      allText.push(row.join(' | '));
    }
    if (rows.length > 10) {
      allText.push(`... and ${rows.length - 10} more rows`);
    }
  });

  const fullText = allText.join('\n');
  const previewText = fullText.substring(0, 5000);

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Analyze Excel spreadsheet data and structure it for a presentation. Return JSON:
{
  "title": "Data Analysis Title",
  "sections": [{"heading": "section heading", "content": "analysis and insights"}],
  "dataInsights": ["insight1", "insight2"],
  "chartSuggestions": [{"type": "bar|line|pie|doughnut|area", "columns": ["col1"], "description": "what to chart", "sheetName": "sheet"}]
}`,
      },
      {
        role: 'user',
        content: `Analyze this Excel data with ${sheets.length} sheet(s) and create presentation content:\n\n${previewText}`,
      },
    ],
    max_tokens: 3000,
    temperature: 0.5,
    response_format: { type: 'json_object' },
  });

  const response = JSON.parse(completion.choices[0]?.message?.content || '{}');

  logger.info('Excel source processed', {
    sheets: sheets.length,
    totalRows: sheets.reduce((acc, s) => acc + s.rowCount, 0),
  });

  return {
    sourceType: 'excel',
    extractedText: fullText,
    title: response.title || 'Excel Data Presentation',
    sections: response.sections || [],
    metadata: {
      sheets: sheets.map(s => ({ name: s.name, columns: s.headers, rowCount: s.rowCount })),
      totalSheets: sheets.length,
      totalRows: sheets.reduce((acc, s) => acc + s.rowCount, 0),
      dataInsights: response.dataInsights || [],
      chartSuggestions: response.chartSuggestions || [],
    },
    mediaAssets: [],
  };
}

async function processExcelFallback(buffer: Buffer): Promise<ProcessedSource> {
  let XLSX: { read(data: Buffer, opts: Record<string, unknown>): { SheetNames: string[]; Sheets: Record<string, unknown> }; utils: { sheet_to_json(sheet: unknown, opts: Record<string, unknown>): unknown[][] } };
  try {
    XLSX = require('xlsx');
  } catch {
    throw new Error('Neither exceljs nor xlsx packages are available for Excel processing');
  }

  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheets: { name: string; headers: string[]; data: string[][] }[] = [];
  const allText: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const jsonData: string[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as string[][];

    const headers = (jsonData[0] || []).map((h: unknown) => String(h));
    const rows = jsonData.slice(1).map((row: unknown[]) => row.map((c: unknown) => String(c)));

    sheets.push({ name: sheetName, headers, data: rows });
    allText.push(`Sheet: ${sheetName}`);
    allText.push(`Columns: ${headers.join(', ')}`);
    const preview = rows.slice(0, 10);
    for (const row of preview) {
      allText.push(row.join(' | '));
    }
    if (rows.length > 10) {
      allText.push(`... and ${rows.length - 10} more rows`);
    }
  }

  const fullText = allText.join('\n');
  const sections = sheets.map(s => ({
    heading: s.name,
    content: `Columns: ${s.headers.join(', ')}\nRows: ${s.data.length}\nPreview:\n${s.data.slice(0, 5).map(r => r.join(' | ')).join('\n')}`,
  }));

  const title = await extractTitle(fullText);

  return {
    sourceType: 'excel',
    extractedText: fullText,
    title,
    sections,
    metadata: {
      sheets: sheets.map(s => ({ name: s.name, columns: s.headers, rowCount: s.data.length })),
      totalSheets: sheets.length,
      totalRows: sheets.reduce((acc, s) => acc + s.data.length, 0),
      extractionMethod: 'xlsx-fallback',
    },
    mediaAssets: [],
  };
}

// ─── PPTX Source (Existing PowerPoint) ──────────────────────
async function processPptxSource(source: SourceInput): Promise<ProcessedSource> {
  const buffer = source.fileBuffer;
  if (!buffer) throw new Error('PowerPoint file buffer is required');

  let JSZip: { loadAsync(data: Buffer): Promise<{ forEach(callback: (relativePath: string) => void): void; file(path: string): { async(type: string): Promise<string> } | null }> };
  try {
    JSZip = require('jszip');
  } catch {
    return processPptxWithVision(buffer);
  }

  const zip = await JSZip.loadAsync(buffer);
  const slides: { index: number; title: string; content: string }[] = [];
  const slideFiles: string[] = [];

  // Find all slide XML files in the PPTX (which is a ZIP archive)
  zip.forEach((relativePath: string) => {
    if (relativePath.match(/^ppt\/slides\/slide\d+\.xml$/)) {
      slideFiles.push(relativePath);
    }
  });

  // Sort slide files numerically
  slideFiles.sort((a: string, b: string) => {
    const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0', 10);
    const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0', 10);
    return numA - numB;
  });

  for (let i = 0; i < slideFiles.length; i++) {
    const slideXml = await zip.file(slideFiles[i])?.async('string');
    if (!slideXml) continue;

    // Extract text content from XML by removing tags
    const textSegments: string[] = [];
    const textMatches = slideXml.match(/<a:t>([\s\S]*?)<\/a:t>/g);
    if (textMatches) {
      for (const match of textMatches) {
        const text = match.replace(/<\/?a:t>/g, '').trim();
        if (text) textSegments.push(text);
      }
    }

    const fullText = textSegments.join(' ');
    const slideTitle = textSegments[0] || `Slide ${i + 1}`;
    const slideContent = textSegments.slice(1).join('\n') || fullText;

    slides.push({
      index: i,
      title: slideTitle,
      content: slideContent,
    });
  }

  // Extract presentation title from core properties if available
  let presentationTitle = 'PowerPoint Presentation';
  try {
    const coreXml = await zip.file('docProps/core.xml')?.async('string');
    if (coreXml) {
      const titleMatch = coreXml.match(/<dc:title>([\s\S]*?)<\/dc:title>/);
      if (titleMatch && titleMatch[1].trim()) {
        presentationTitle = titleMatch[1].trim();
      }
    }
  } catch {
    // Ignore core.xml extraction errors
  }

  const sections = slides.map(s => ({
    heading: s.title,
    content: s.content,
  }));

  const extractedText = slides.map(s => `${s.title}\n${s.content}`).join('\n\n');

  logger.info('PPTX source processed', { slideCount: slides.length });

  return {
    sourceType: 'pptx',
    extractedText,
    title: presentationTitle,
    sections,
    metadata: {
      originalSlideCount: slides.length,
      extractionMethod: 'xml-parse',
    },
    mediaAssets: [],
  };
}

async function processPptxWithVision(buffer: Buffer): Promise<ProcessedSource> {
  // Fallback: use OpenAI to analyze the PPTX content description
  const base64 = buffer.toString('base64');
  const fileSizeKB = Math.round(buffer.length / 1024);

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a presentation analysis expert. A user has uploaded a PowerPoint file (${fileSizeKB} KB).
Since we cannot parse the binary directly, generate a structured presentation framework based on the user's request.
Return JSON:
{
  "title": "Presentation Title",
  "sections": [{"heading": "section heading", "content": "placeholder content to be filled"}],
  "suggestion": "Advice for the user about this presentation"
}`,
      },
      {
        role: 'user',
        content: `A PowerPoint file of ${fileSizeKB} KB was uploaded. Please create a structured framework for reimporting this presentation. Generate sections that would be typical for a presentation of this size (estimated ${Math.max(Math.round(fileSizeKB / 50), 3)} slides).`,
      },
    ],
    max_tokens: 3000,
    temperature: 0.5,
    response_format: { type: 'json_object' },
  });

  const response = JSON.parse(completion.choices[0]?.message?.content || '{}');

  return {
    sourceType: 'pptx',
    extractedText: response.suggestion || '',
    title: response.title || 'Imported PowerPoint',
    sections: response.sections || [],
    metadata: {
      fileSizeKB,
      extractionMethod: 'ai-estimation',
      suggestion: response.suggestion || '',
    },
    mediaAssets: [],
  };
}

// ─── Markdown Source ─────────────────────────────────────────
async function processMarkdownSource(source: SourceInput): Promise<ProcessedSource> {
  const content = source.content || (source.fileBuffer ? source.fileBuffer.toString('utf-8') : '');
  if (!content.trim()) throw new Error('Markdown content is empty');

  const sections: { heading: string; content: string }[] = [];
  const lines = content.split('\n');
  let currentHeading = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      if (currentHeading || currentContent.length > 0) {
        sections.push({ heading: currentHeading, content: currentContent.join('\n').trim() });
      }
      currentHeading = headingMatch[1];
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  if (currentHeading || currentContent.length > 0) {
    sections.push({ heading: currentHeading, content: currentContent.join('\n').trim() });
  }

  const title = sections[0]?.heading || 'Markdown Presentation';

  return {
    sourceType: 'markdown',
    extractedText: content,
    title,
    sections,
    metadata: { sectionCount: sections.length, charCount: content.length },
    mediaAssets: [],
  };
}

// ─── HTML Source ─────────────────────────────────────────────
async function processHtmlSource(source: SourceInput): Promise<ProcessedSource> {
  const content = source.content || (source.fileBuffer ? source.fileBuffer.toString('utf-8') : '');
  if (!content.trim()) throw new Error('HTML content is empty');

  const text = htmlToText(content);
  const sections = extractSectionsFromHtml(content);
  const title = extractTitleFromHtml(content) || await extractTitle(text);

  return {
    sourceType: 'html',
    extractedText: text,
    title,
    sections,
    metadata: { charCount: text.length },
    mediaAssets: [],
  };
}

// ─── Presentation Generation from Processed Source ───────────
async function generatePresentation(
  processed: ProcessedSource,
  options: PresentationOptions,
  tenantId: string,
  userId: string
): Promise<Record<string, unknown>> {
  const slideCount = options.slideCount || Math.min(Math.max(processed.sections.length + 2, 5), 20);
  const style = options.style || 'professional';
  const language = options.language || 'ar';
  const detailLevel = options.detailLevel || 'standard';

  const sectionsText = processed.sections
    .map((s, i) => `${i + 1}. ${s.heading}\n${s.content}`)
    .join('\n\n');

  const systemPrompt = `You are a world-class presentation designer. Create a structured presentation from the provided content.
Return ONLY valid JSON:
{
  "title": "Presentation Title",
  "theme": {
    "primaryColor": "#hex",
    "secondaryColor": "#hex",
    "fontFamily": "font",
    "backgroundColor": "#hex"
  },
  "slides": [
    {
      "layout": "title|content|two-column",
      "title": "Slide Title",
      "body": "Slide content with bullet points",
      "subtitle": "For title slides",
      "leftContent": "For two-column",
      "rightContent": "For two-column",
      "notes": "Speaker notes",
      "chartType": "bar|line|pie|null",
      "chartData": {"labels": [], "series": [{"name": "", "values": []}]}
    }
  ]
}`;

  const userPrompt = `Create a ${slideCount}-slide ${style} presentation in ${language}.
Detail level: ${detailLevel}
${options.targetAudience ? `Target audience: ${options.targetAudience}` : ''}

Source: ${processed.title}
Type: ${processed.sourceType}

Content:
${sectionsText.substring(0, 6000)}

Requirements:
- First slide: title layout with title and subtitle
- Use content layout for main points
- Use two-column for comparisons
- Include charts where data is present
- ${options.includeSpeakerNotes !== false ? 'Include detailed speaker notes' : 'No speaker notes needed'}
- Last slide: summary/conclusion
- Return exactly ${slideCount} slides`;

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 6000,
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
  if (!parsed.slides || !Array.isArray(parsed.slides)) {
    throw new Error('AI did not return valid slides');
  }

  const presTitle = parsed.title || processed.title;
  const theme = parsed.theme || {
    primaryColor: '#1a73e8',
    secondaryColor: '#ffffff',
    fontFamily: 'Arial',
    backgroundColor: '#ffffff',
  };

  const presentation = await slideBuilder.createPresentation(presTitle, theme, undefined, tenantId, userId);
  const createdSlides: Record<string, unknown>[] = [];

  for (const slideData of parsed.slides) {
    const layout = slideData.layout || 'content';
    const addedSlide = await slideBuilder.addSlide(presentation.id, layout, {
      title: slideData.title || '',
      body: slideData.body || '',
      subtitle: slideData.subtitle || '',
      leftContent: slideData.leftContent || '',
      rightContent: slideData.rightContent || '',
      notes: slideData.notes || '',
    });

    if (slideData.chartType && slideData.chartData) {
      await slideBuilder.addChart(
        presentation.id,
        addedSlide.slideIndex as number,
        slideData.chartType as any,
        slideData.chartData as any,
        { x: 0.5, y: 2.0, w: 8.0, h: 4.0 }
      );
    }

    createdSlides.push(addedSlide);
  }

  // Add media assets from source (e.g., images)
  for (const asset of processed.mediaAssets) {
    if (asset.type === 'image' && createdSlides.length > 1) {
      const targetSlide = createdSlides[1]; // Add to first content slide
      const imgBuffer = Buffer.from(asset.data.split(',')[1] || '', 'base64');
      await slideBuilder.addImage(
        presentation.id,
        targetSlide.slideIndex as number,
        imgBuffer,
        { x: 6.5, y: 1.5, w: 3.0, h: 3.5 }
      );
    }
  }

  return {
    presentationId: presentation.id,
    name: presTitle,
    theme,
    slideCount: createdSlides.length,
    slides: createdSlides,
    sourceType: processed.sourceType,
    tokensUsed: completion.usage?.total_tokens || 0,
  };
}

// ─── Batch Source Processing ─────────────────────────────────
export async function createPresentationFromMultipleSources(
  sources: SourceInput[],
  options: PresentationOptions,
  tenantId: string,
  userId: string
): Promise<Record<string, unknown>> {
  if (!sources.length) throw new Error('No sources provided');

  const processedSources: ProcessedSource[] = [];
  for (const source of sources) {
    const processed = await processSource(source);
    processedSources.push(processed);
  }

  // Merge all processed sources into a single ProcessedSource
  const mergedSections = processedSources.flatMap(p => p.sections);
  const mergedMediaAssets = processedSources.flatMap(p => p.mediaAssets);
  const mergedTitle = processedSources[0]?.title || 'Multi-Source Presentation';

  const merged: ProcessedSource = {
    sourceType: 'text',
    extractedText: processedSources.map(p => p.extractedText).join('\n\n---\n\n'),
    title: mergedTitle,
    sections: mergedSections,
    metadata: {
      sourceCount: sources.length,
      sourceTypes: sources.map(s => s.type),
    },
    mediaAssets: mergedMediaAssets,
  };

  return generatePresentation(merged, options, tenantId, userId);
}

// ─── Report to Presentation ─────────────────────────────────
export async function convertReportToPresentation(
  reportContent: string,
  reportType: 'operational' | 'executive' | 'technical' | 'financial',
  options: PresentationOptions,
  tenantId: string,
  userId: string
): Promise<Record<string, unknown>> {
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a report-to-presentation specialist. Convert a ${reportType} report into structured presentation content.
Return JSON:
{
  "title": "Report Title",
  "sections": [{"heading": "section", "content": "key points"}],
  "keyMetrics": [{"name": "metric", "value": "value", "trend": "up|down|stable"}],
  "chartSuggestions": [{"type": "bar|line|pie", "title": "chart title", "data": {"labels": [], "series": [{"name": "", "values": []}]}}]
}`,
      },
      {
        role: 'user',
        content: `Convert this ${reportType} report to a presentation:\n\n${reportContent.substring(0, 6000)}`,
      },
    ],
    max_tokens: 4000,
    temperature: 0.5,
    response_format: { type: 'json_object' },
  });

  const response = JSON.parse(completion.choices[0]?.message?.content || '{}');

  const processed: ProcessedSource = {
    sourceType: 'text',
    extractedText: reportContent,
    title: response.title || 'Report Presentation',
    sections: response.sections || [],
    metadata: {
      reportType,
      keyMetrics: response.keyMetrics || [],
      chartSuggestions: response.chartSuggestions || [],
    },
    mediaAssets: [],
  };

  return generatePresentation(processed, options, tenantId, userId);
}

// ─── Auto-Suggest Engine ────────────────────────────────────
export async function suggestPresentationStructure(
  topic: string,
  context?: string
): Promise<Record<string, unknown>> {
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a presentation planning expert. Suggest a complete presentation structure.
Return JSON:
{
  "suggestedTitle": "title",
  "suggestedSlideCount": 10,
  "suggestedStyle": "professional|creative|minimal|academic",
  "suggestedSources": ["source1", "source2"],
  "suggestedKPIs": ["kpi1", "kpi2"],
  "outline": [{"slideNumber": 1, "title": "slide", "layout": "title|content|two-column", "contentSuggestion": "what to include"}],
  "designRecommendations": {"colors": ["#hex"], "fontSuggestion": "font", "imageryStyle": "style"}
}`,
      },
      {
        role: 'user',
        content: `Suggest a presentation structure for: ${topic}\n${context ? `Context: ${context}` : ''}`,
      },
    ],
    max_tokens: 3000,
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  return JSON.parse(completion.choices[0]?.message?.content || '{}');
}

// ─── Helper Functions ────────────────────────────────────────
function splitIntoSections(text: string): { heading: string; content: string }[] {
  const sections: { heading: string; content: string }[] = [];
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());

  if (paragraphs.length <= 3) {
    return paragraphs.map((p, i) => ({
      heading: i === 0 ? 'Introduction' : `Section ${i}`,
      content: p.trim(),
    }));
  }

  let currentSection = { heading: 'Introduction', content: '' };
  for (const para of paragraphs) {
    const lines = para.trim().split('\n');
    const firstLine = lines[0]?.trim() || '';

    // Detect if first line looks like a heading
    if (firstLine.length < 80 && !firstLine.endsWith('.') && lines.length > 1) {
      if (currentSection.content.trim()) {
        sections.push({ ...currentSection });
      }
      currentSection = {
        heading: firstLine,
        content: lines.slice(1).join('\n').trim(),
      };
    } else {
      currentSection.content += (currentSection.content ? '\n\n' : '') + para.trim();
    }
  }

  if (currentSection.content.trim() || currentSection.heading) {
    sections.push(currentSection);
  }

  return sections;
}

async function extractTitle(text: string): Promise<string> {
  const firstLine = text.split('\n')[0]?.trim() || '';
  if (firstLine.length > 5 && firstLine.length < 100) {
    return firstLine;
  }

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'Generate a concise presentation title (max 10 words) for this content. Return JSON: {"title": "..."}',
      },
      { role: 'user', content: text.substring(0, 1000) },
    ],
    max_tokens: 100,
    temperature: 0.5,
    response_format: { type: 'json_object' },
  });

  const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
  return response.title || 'Untitled Presentation';
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractSectionsFromHtml(html: string): { heading: string; content: string }[] {
  const sections: { heading: string; content: string }[] = [];
  const headingPattern = /<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi;
  let match;
  let lastIndex = 0;

  while ((match = headingPattern.exec(html)) !== null) {
    if (lastIndex > 0) {
      const contentBetween = html.substring(lastIndex, match.index);
      const textContent = htmlToText(contentBetween);
      if (textContent.trim() && sections.length > 0) {
        sections[sections.length - 1].content = textContent.trim();
      }
    }
    sections.push({
      heading: htmlToText(match[1]),
      content: '',
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex > 0 && lastIndex < html.length && sections.length > 0) {
    const remaining = htmlToText(html.substring(lastIndex));
    sections[sections.length - 1].content = remaining.trim();
  }

  if (sections.length === 0) {
    const text = htmlToText(html);
    return splitIntoSections(text);
  }

  return sections.filter(s => s.heading || s.content);
}

function extractTitleFromHtml(html: string): string | null {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  if (titleMatch) return htmlToText(titleMatch[1]).trim() || null;

  const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
  if (h1Match) return htmlToText(h1Match[1]).trim() || null;

  return null;
}

function parseEmailHeaders(email: string): { from: string; to: string; subject: string; date: string } {
  const getHeader = (name: string): string => {
    const match = email.match(new RegExp(`^${name}:\\s*(.+)$`, 'mi'));
    return match ? match[1].trim() : '';
  };

  return {
    from: getHeader('From'),
    to: getHeader('To'),
    subject: getHeader('Subject'),
    date: getHeader('Date'),
  };
}

function extractEmailBody(email: string): string {
  const parts = email.split(/\n\s*\n/);
  return parts.length > 1 ? parts.slice(1).join('\n\n').trim() : email;
}

function extractYoutubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}
