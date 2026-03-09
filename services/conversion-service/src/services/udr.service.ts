import pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import Anthropic from '@anthropic-ai/sdk';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';

const CACHE_PREFIX = 'conversion-udr';
const CACHE_TTL = 300;

export interface UdrLayer {
  structureTree: StructureNode;
  semanticGraph: SemanticGraph;
  visualConstraints: VisualConstraints;
  dataBindingMap: DataBindingMap;
  interactionMap: InteractionMap;
  metadata: UdrMetadata;
  platformState: PlatformState;
}

export interface StructureNode {
  id: string;
  type: 'document' | 'section' | 'heading' | 'paragraph' | 'table' | 'list' | 'image' | 'link';
  content: string;
  level?: number;
  children: StructureNode[];
  attributes: Record<string, string>;
}

export interface SemanticGraph {
  entities: Array<{ id: string; name: string; type: string; mentions: number }>;
  relationships: Array<{ source: string; target: string; type: string; weight: number }>;
  topics: string[];
}

export interface VisualConstraints {
  pageLayout: { width: number; height: number; orientation: 'portrait' | 'landscape' };
  margins: { top: number; right: number; bottom: number; left: number };
  fonts: string[];
  colorPalette: string[];
  direction: 'ltr' | 'rtl';
}

export interface DataBindingMap {
  references: Array<{ id: string; source: string; target: string; type: 'cell' | 'range' | 'field' | 'variable' }>;
  formulas: Array<{ id: string; expression: string; dependsOn: string[] }>;
  dynamicFields: Array<{ id: string; name: string; path: string }>;
}

export interface InteractionMap {
  links: Array<{ id: string; href: string; text: string; type: 'internal' | 'external' }>;
  anchors: Array<{ id: string; name: string; target: string }>;
  formFields: Array<{ id: string; name: string; type: string; value: string }>;
}

export interface UdrMetadata {
  documentId: string;
  sourceFormat: string;
  sourceChecksum: string;
  title: string;
  author: string;
  language: string;
  pageCount: number;
  wordCount: number;
  createdAt: string;
  convertedAt: string;
  version: string;
}

export interface PlatformState {
  conversionJobId: string;
  tenantId: string;
  status: 'converted' | 'enriched' | 'validated';
  enrichments: string[];
  validationErrors: string[];
}

export interface RawContent {
  text: string;
  html: string;
  pageCount: number;
  sheets: Array<{ name: string; csv: string; json: Record<string, unknown>[] }>;
  tables: Array<{ headers: string[]; rows: string[][] }>;
  links: Array<{ href: string; text: string }>;
  rawMetadata: Record<string, unknown>;
}

export interface ListUdrParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  search?: string;
  tenantId?: string;
  sourceFormat?: string;
}

export class UdrService {
  private anthropic: Anthropic;
  private prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || new PrismaClient();
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    });
  }

  async convertToUDR(jobId: string): Promise<Readonly<UdrLayer>> {
    const job = await this.prisma.conversionJob.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new Error(`Conversion job not found: ${jobId}`);
    }

    await this.prisma.conversionJob.update({
      where: { id: jobId },
      data: { status: 'PROCESSING' },
    });

    logger.info('Starting UDR conversion', { jobId, format: job.sourceFormat, path: job.sourcePath });

    try {
      const filePath = job.sourcePath || '';
      if (!filePath || !fs.existsSync(filePath)) {
        throw new Error(`Source file not found: ${filePath}`);
      }

      const rawContent = await this.extractRawContent(filePath, job.sourceFormat);

      const fileBuffer = fs.readFileSync(filePath);
      const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      const structureTree = this.buildStructureTree(rawContent);
      const semanticGraph = await this.buildSemanticGraph(rawContent.text);
      const visualConstraints = this.extractVisualConstraints(rawContent);
      const dataBindingMap = this.buildDataBindingMap(rawContent);
      const language = this.detectLanguage(rawContent.text);

      const interactionMap: InteractionMap = {
        links: rawContent.links.map((link, idx) => ({
          id: crypto.createHash('md5').update(`link-${idx}-${link.href}`).digest('hex').slice(0, 12),
          href: link.href,
          text: link.text,
          type: (link.href.startsWith('#') || link.href.startsWith('./')) ? 'internal' as const : 'external' as const,
        })),
        anchors: [],
        formFields: [],
      };

      const wordCount = rawContent.text.split(/\s+/).filter((w: string) => w.length > 0).length;

      const metadata: UdrMetadata = {
        documentId: jobId,
        sourceFormat: job.sourceFormat,
        sourceChecksum: checksum,
        title: this.extractTitle(rawContent.text),
        author: String(rawContent.rawMetadata.author || 'unknown'),
        language,
        pageCount: rawContent.pageCount,
        wordCount,
        createdAt: new Date().toISOString(),
        convertedAt: new Date().toISOString(),
        version: '2.0.0',
      };

      const platformState: PlatformState = {
        conversionJobId: jobId,
        tenantId: job.tenantId || '',
        status: 'converted',
        enrichments: semanticGraph.entities.length > 0 ? ['semantic-analysis'] : [],
        validationErrors: [],
      };

      const udr: UdrLayer = {
        structureTree,
        semanticGraph,
        visualConstraints,
        dataBindingMap,
        interactionMap,
        metadata,
        platformState,
      };

      const frozenUdr = this.deepFreeze(udr);

      const outputPath = (job.sourcePath || '').replace(/\.[^.]+$/, '.udr.json');
      fs.writeFileSync(outputPath, JSON.stringify(udr, null, 2), 'utf-8');

      await this.prisma.conversionJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          outputPath: outputPath,
        },
      });

      await cacheDel(`${CACHE_PREFIX}:*`);
      logger.info('UDR conversion completed', { jobId, outputPath, layers: 7, wordCount });

      return frozenUdr;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.prisma.conversionJob.update({
        where: { id: jobId },
        data: { status: 'FAILED' },
      });
      logger.error('UDR conversion failed', { jobId, error: errorMessage });
      throw error;
    }
  }

  async extractRawContent(filePath: string, format: string): Promise<RawContent> {
    const fileBuffer = fs.readFileSync(filePath);

    const result: RawContent = {
      text: '',
      html: '',
      pageCount: 1,
      sheets: [],
      tables: [],
      links: [],
      rawMetadata: {},
    };

    switch (format.toLowerCase()) {
      case 'pdf': {
        const pdfData = await pdfParse(fileBuffer);
        result.text = pdfData.text;
        result.pageCount = pdfData.numpages;
        result.rawMetadata = pdfData.info || {};
        result.tables = this.detectTablesInText(pdfData.text);
        logger.info('PDF extracted', { pages: pdfData.numpages, textLength: pdfData.text.length });
        break;
      }

      case 'docx': {
        const [textResult, htmlResult] = await Promise.all([
          mammoth.extractRawText({ buffer: fileBuffer }),
          mammoth.convertToHtml({ buffer: fileBuffer }),
        ]);
        result.text = textResult.value;
        result.html = htmlResult.value;
        result.tables = this.extractTablesFromHtml(htmlResult.value);
        result.links = this.extractLinksFromHtml(htmlResult.value);
        result.rawMetadata = {
          warnings: [...textResult.messages, ...htmlResult.messages].map(m => m.message),
        };
        logger.info('DOCX extracted', { textLength: textResult.value.length, htmlLength: htmlResult.value.length });
        break;
      }

      case 'xlsx':
      case 'xls': {
        const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true, cellFormula: true });
        const allText: string[] = [];

        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(sheet);
          const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
          allText.push(csv);

          result.sheets.push({ name: sheetName, csv, json });

          if (json.length > 0) {
            const headers = Object.keys(json[0]);
            const rows = json.map(row => headers.map(h => String(row[h] ?? '')));
            result.tables.push({ headers, rows });
          }
        }

        result.text = allText.join('\n\n');
        result.pageCount = workbook.SheetNames.length;
        result.rawMetadata = {
          sheetNames: workbook.SheetNames,
          sheetCount: workbook.SheetNames.length,
          props: workbook.Props || {},
        };
        logger.info('XLSX extracted', { sheets: workbook.SheetNames.length, totalRows: result.sheets.reduce((s, sh) => s + sh.json.length, 0) });
        break;
      }

      default:
        throw new Error(`Unsupported format for UDR conversion: ${format}`);
    }

    return result;
  }

  buildStructureTree(rawContent: RawContent): StructureNode {
    const rootNode: StructureNode = {
      id: crypto.createHash('md5').update('root').digest('hex').slice(0, 12),
      type: 'document',
      content: '',
      children: [],
      attributes: {},
    };

    const sections = this.detectSections(rawContent.text);

    for (const section of sections) {
      const sectionNode: StructureNode = {
        id: crypto.createHash('md5').update(section.heading).digest('hex').slice(0, 12),
        type: 'section',
        content: '',
        level: section.level,
        children: [],
        attributes: {},
      };

      const headingNode: StructureNode = {
        id: crypto.createHash('md5').update(`h-${section.heading}`).digest('hex').slice(0, 12),
        type: 'heading',
        content: section.heading,
        level: section.level,
        children: [],
        attributes: { level: String(section.level) },
      };
      sectionNode.children.push(headingNode);

      const paragraphs = section.body.split(/\n\n+/).filter((p: string) => p.trim().length > 0);
      for (const para of paragraphs) {
        const trimmed = para.trim();
        const paraNode: StructureNode = {
          id: crypto.createHash('md5').update(trimmed.slice(0, 100)).digest('hex').slice(0, 12),
          type: 'paragraph',
          content: trimmed,
          children: [],
          attributes: {},
        };
        sectionNode.children.push(paraNode);
      }

      rootNode.children.push(sectionNode);
    }

    for (const table of rawContent.tables) {
      const tableNode: StructureNode = {
        id: crypto.createHash('md5').update(table.headers.join('|')).digest('hex').slice(0, 12),
        type: 'table',
        content: '',
        children: [],
        attributes: {
          columns: String(table.headers.length),
          rows: String(table.rows.length),
          headers: table.headers.join(','),
        },
      };
      rootNode.children.push(tableNode);
    }

    for (const link of rawContent.links) {
      const linkNode: StructureNode = {
        id: crypto.createHash('md5').update(link.href).digest('hex').slice(0, 12),
        type: 'link',
        content: link.text,
        children: [],
        attributes: { href: link.href },
      };
      rootNode.children.push(linkNode);
    }

    return rootNode;
  }

  async buildSemanticGraph(text: string): Promise<SemanticGraph> {
    const truncatedText = text.slice(0, 8000);

    if (truncatedText.trim().length < 20) {
      return { entities: [], relationships: [], topics: [] };
    }

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: `Analyze the following document text and extract a semantic graph. Return ONLY valid JSON with this exact structure:
{
  "entities": [{"name": "string", "type": "person|organization|location|concept|date|number", "mentions": number}],
  "relationships": [{"source": "entity name", "target": "entity name", "type": "string", "weight": number between 0 and 1}],
  "topics": ["string"]
}

Document text:
${truncatedText}`,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return { entities: [], relationships: [], topics: [] };
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { entities: [], relationships: [], topics: [] };
      }

      const parsed = JSON.parse(jsonMatch[0]);

      const entities = (parsed.entities || []).map((e: Record<string, unknown>, idx: number) => ({
        id: crypto.createHash('md5').update(`entity-${idx}-${String(e.name)}`).digest('hex').slice(0, 12),
        name: String(e.name || ''),
        type: String(e.type || 'concept'),
        mentions: Number(e.mentions) || 1,
      }));

      const entityNames = new Set(entities.map((e: { name: string }) => e.name));
      const relationships = (parsed.relationships || [])
        .filter((r: Record<string, unknown>) => entityNames.has(String(r.source)) && entityNames.has(String(r.target)))
        .map((r: Record<string, unknown>) => ({
          source: String(r.source),
          target: String(r.target),
          type: String(r.type || 'related'),
          weight: Math.max(0, Math.min(1, Number(r.weight) || 0.5)),
        }));

      const topics = (parsed.topics || []).map((t: unknown) => String(t));

      logger.info('Semantic graph built', { entities: entities.length, relationships: relationships.length, topics: topics.length });
      return { entities, relationships, topics };
    } catch (error) {
      logger.warn('Semantic graph extraction failed, returning empty graph', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { entities: [], relationships: [], topics: [] };
    }
  }

  extractVisualConstraints(rawContent: RawContent): VisualConstraints {
    const language = this.detectLanguage(rawContent.text);
    const direction = language === 'ar' ? 'rtl' as const : 'ltr' as const;

    const fonts: Set<string> = new Set();
    const colors: Set<string> = new Set();

    const fontMatches = rawContent.html.match(/font-family:\s*([^;"]+)/gi);
    if (fontMatches) {
      for (const match of fontMatches) {
        const fontName = match.replace(/font-family:\s*/i, '').trim().replace(/['"]/g, '');
        fonts.add(fontName);
      }
    }

    const colorMatches = rawContent.html.match(/#[0-9a-fA-F]{3,8}\b/g);
    if (colorMatches) {
      for (const color of colorMatches) {
        colors.add(color.toLowerCase());
      }
    }

    const rgbMatches = rawContent.html.match(/rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/gi);
    if (rgbMatches) {
      for (const rgb of rgbMatches) {
        colors.add(rgb.toLowerCase());
      }
    }

    if (fonts.size === 0) {
      fonts.add(language === 'ar' ? 'Arial' : 'Times New Roman');
    }

    const hasLandscapeIndicators = rawContent.sheets.length > 0 ||
      rawContent.tables.some(t => t.headers.length > 6);

    return {
      pageLayout: {
        width: hasLandscapeIndicators ? 297 : 210,
        height: hasLandscapeIndicators ? 210 : 297,
        orientation: hasLandscapeIndicators ? 'landscape' : 'portrait',
      },
      margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
      fonts: Array.from(fonts),
      colorPalette: Array.from(colors).slice(0, 20),
      direction,
    };
  }

  buildDataBindingMap(rawContent: RawContent): DataBindingMap {
    const references: DataBindingMap['references'] = [];
    const formulas: DataBindingMap['formulas'] = [];
    const dynamicFields: DataBindingMap['dynamicFields'] = [];

    for (const sheet of rawContent.sheets) {
      for (let rowIdx = 0; rowIdx < sheet.json.length; rowIdx++) {
        const row = sheet.json[rowIdx];
        for (const [colKey, cellValue] of Object.entries(row)) {
          const cellStr = String(cellValue);

          if (cellStr.startsWith('=')) {
            const formulaId = crypto.createHash('md5').update(`${sheet.name}-${rowIdx}-${colKey}`).digest('hex').slice(0, 12);
            const cellRefPattern = /[A-Z]+\d+/g;
            const deps = cellStr.match(cellRefPattern) || [];

            formulas.push({
              id: formulaId,
              expression: cellStr,
              dependsOn: deps,
            });
          }

          const refId = crypto.createHash('md5').update(`ref-${sheet.name}-${rowIdx}-${colKey}`).digest('hex').slice(0, 12);
          references.push({
            id: refId,
            source: `${sheet.name}!${colKey}${rowIdx + 1}`,
            target: cellStr,
            type: 'cell',
          });
        }
      }
    }

    const templateVarPattern = /\{\{([^}]+)\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = templateVarPattern.exec(rawContent.text)) !== null) {
      const varName = match[1].trim();
      dynamicFields.push({
        id: crypto.createHash('md5').update(`var-${varName}`).digest('hex').slice(0, 12),
        name: varName,
        path: `$.${varName}`,
      });
    }

    return { references: references.slice(0, 500), formulas, dynamicFields };
  }

  detectLanguage(text: string): 'ar' | 'en' {
    const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
    const arabicMatches = text.match(arabicPattern);
    const arabicCount = arabicMatches ? arabicMatches.length : 0;
    const totalChars = text.replace(/\s/g, '').length;

    if (totalChars === 0) return 'en';

    const arabicRatio = arabicCount / totalChars;
    return arabicRatio > 0.3 ? 'ar' : 'en';
  }

  detectSections(text: string): Array<{ heading: string; level: number; body: string }> {
    const lines = text.split('\n');
    const sections: Array<{ heading: string; level: number; body: string }> = [];

    const headingPatterns = [
      { pattern: /^#{1,6}\s+(.+)$/, levelFn: (line: string) => (line.match(/^(#+)/) || [''])[0].length },
      { pattern: /^(?:Chapter|Section|Part)\s+[\dIVXLCDM]+[.:]\s*(.+)$/i, levelFn: () => 1 },
      { pattern: /^\d+\.\s+(.+)$/, levelFn: () => 2 },
      { pattern: /^\d+\.\d+\s+(.+)$/, levelFn: () => 3 },
      { pattern: /^[A-Z][A-Z\s]{4,}$/, levelFn: () => 1 },
    ];

    let currentHeading = 'Introduction';
    let currentLevel = 1;
    let currentBody: string[] = [];

    for (const line of lines) {
      let isHeading = false;

      for (const { pattern, levelFn } of headingPatterns) {
        const headingMatch = line.match(pattern);
        if (headingMatch) {
          if (currentBody.length > 0 || sections.length === 0) {
            sections.push({
              heading: currentHeading,
              level: currentLevel,
              body: currentBody.join('\n'),
            });
          }

          currentHeading = headingMatch[1] || line.trim();
          currentLevel = levelFn(line);
          currentBody = [];
          isHeading = true;
          break;
        }
      }

      if (!isHeading) {
        currentBody.push(line);
      }
    }

    if (currentBody.length > 0) {
      sections.push({
        heading: currentHeading,
        level: currentLevel,
        body: currentBody.join('\n'),
      });
    }

    if (sections.length === 0) {
      sections.push({
        heading: 'Document',
        level: 1,
        body: text,
      });
    }

    return sections;
  }

  detectTablesInText(text: string): Array<{ headers: string[]; rows: string[][] }> {
    const tables: Array<{ headers: string[]; rows: string[][] }> = [];
    const lines = text.split('\n');
    let tableLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const tabCount = (line.match(/\t/g) || []).length;
      const pipeCount = (line.match(/\|/g) || []).length;

      const isTableLine = tabCount >= 2 || pipeCount >= 2;

      if (isTableLine) {
        tableLines.push(line);
      } else {
        if (tableLines.length >= 2) {
          const delimiter = tableLines[0].includes('|') ? '|' : '\t';
          const parsedRows = tableLines.map(tl =>
            tl.split(delimiter).map(cell => cell.trim()).filter(cell => cell.length > 0)
          );

          if (parsedRows.length > 0 && parsedRows[0].length > 0) {
            const headerRow = parsedRows[0];
            const isSeparatorRow = (row: string[]) => row.every(cell => /^[-:=]+$/.test(cell));
            const dataStartIdx = parsedRows.length > 1 && isSeparatorRow(parsedRows[1]) ? 2 : 1;

            tables.push({
              headers: headerRow,
              rows: parsedRows.slice(dataStartIdx),
            });
          }
        }
        tableLines = [];
      }
    }

    if (tableLines.length >= 2) {
      const delimiter = tableLines[0].includes('|') ? '|' : '\t';
      const parsedRows = tableLines.map(tl =>
        tl.split(delimiter).map(cell => cell.trim()).filter(cell => cell.length > 0)
      );
      if (parsedRows.length > 0 && parsedRows[0].length > 0) {
        tables.push({
          headers: parsedRows[0],
          rows: parsedRows.slice(1),
        });
      }
    }

    return tables;
  }

  extractTablesFromHtml(html: string): Array<{ headers: string[]; rows: string[][] }> {
    const tables: Array<{ headers: string[]; rows: string[][] }> = [];
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tableMatch: RegExpExecArray | null;

    while ((tableMatch = tableRegex.exec(html)) !== null) {
      const tableHtml = tableMatch[1];

      const headerCells: string[] = [];
      const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
      let thMatch: RegExpExecArray | null;
      while ((thMatch = thRegex.exec(tableHtml)) !== null) {
        headerCells.push(this.stripHtmlTags(thMatch[1]).trim());
      }

      const rows: string[][] = [];
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let trMatch: RegExpExecArray | null;
      let trIndex = 0;

      while ((trMatch = trRegex.exec(tableHtml)) !== null) {
        const rowHtml = trMatch[1];

        if (trIndex === 0 && headerCells.length > 0) {
          trIndex++;
          continue;
        }

        const cells: string[] = [];
        const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        let tdMatch: RegExpExecArray | null;
        while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
          cells.push(this.stripHtmlTags(tdMatch[1]).trim());
        }

        if (cells.length > 0) {
          rows.push(cells);
        }

        if (headerCells.length === 0 && trIndex === 0 && cells.length > 0) {
          headerCells.push(...cells);
        } else if (cells.length > 0) {
          // already pushed
        }

        trIndex++;
      }

      if (headerCells.length > 0) {
        tables.push({ headers: headerCells, rows });
      }
    }

    return tables;
  }

  extractLinksFromHtml(html: string): Array<{ href: string; text: string }> {
    const links: Array<{ href: string; text: string }> = [];
    const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let linkMatch: RegExpExecArray | null;

    while ((linkMatch = linkRegex.exec(html)) !== null) {
      links.push({
        href: linkMatch[1],
        text: this.stripHtmlTags(linkMatch[2]).trim(),
      });
    }

    return links;
  }

  async list(params: ListUdrParams) {
    const { page, limit, sortBy = 'createdAt', sortOrder, search, tenantId, sourceFormat } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { sourcePath: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (tenantId) where.tenantId = tenantId;
    if (sourceFormat) where.sourceFormat = sourceFormat;
    where.targetFormat = 'UDR';

    const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
    const cached = await cacheGet<{ data: unknown[]; total: number }>(cacheKey);
    if (cached) return cached;

    const [data, total] = await Promise.all([
      this.prisma.conversionJob.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.conversionJob.count({ where }),
    ]);

    const result = { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    await cacheSet(cacheKey, result, CACHE_TTL);
    return result;
  }

  async getById(id: string) {
    const cacheKey = `${CACHE_PREFIX}:${id}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const job = await this.prisma.conversionJob.findUnique({ where: { id } });
    if (!job) {
      throw new Error(`UDR document not found: ${id}`);
    }

    await cacheSet(cacheKey, job, CACHE_TTL);
    return job;
  }

  async create(data: {
    tenant_id?: string;
    source_format?: string;
    source_path?: string;
    output_path?: string;
  }) {
    const job = await this.prisma.conversionJob.create({
      data: {
        tenantId: data.tenant_id || null,
        sourceFormat: (data.source_format?.toUpperCase() || 'UDR') as 'UDR',
        targetFormat: 'UDR',
        sourcePath: data.source_path || null,
        outputPath: data.output_path || null,
        status: 'PENDING',
      },
    });
    await cacheDel(`${CACHE_PREFIX}:list:*`);
    return job;
  }

  async update(id: string, data: {
    source_format?: string;
    source_path?: string;
    output_path?: string;
    status?: string;
  }) {
    await this.getById(id);
    const updateData: Record<string, unknown> = {};
    if (data.source_format) updateData.sourceFormat = data.source_format.toUpperCase();
    if (data.source_path) updateData.sourcePath = data.source_path;
    if (data.output_path) updateData.outputPath = data.output_path;
    if (data.status) updateData.status = data.status.toUpperCase();
    const updated = await this.prisma.conversionJob.update({ where: { id }, data: updateData });
    await cacheDel(`${CACHE_PREFIX}:${id}`);
    await cacheDel(`${CACHE_PREFIX}:list:*`);
    return updated;
  }

  async delete(id: string) {
    await this.getById(id);
    await this.prisma.conversionJob.delete({ where: { id } });
    await cacheDel(`${CACHE_PREFIX}:${id}`);
    await cacheDel(`${CACHE_PREFIX}:list:*`);
    return { deleted: true };
  }

  async convertToUdr(sourcePath: string, sourceFormat: string, tenantId: string) {
    const job = await this.prisma.conversionJob.create({
      data: {
        tenantId,
        sourceFormat: (sourceFormat.toUpperCase()) as 'UDR',
        targetFormat: 'UDR',
        sourcePath,
        status: 'PENDING',
      },
    });
    const udr = await this.convertToUDR(job.id);
    return { job, udr };
  }

  async convertFromUdr(udrPath: string, targetFormat: string, tenantId: string) {
    const job = await this.prisma.conversionJob.create({
      data: {
        tenantId,
        sourceFormat: 'UDR',
        targetFormat: (targetFormat.toUpperCase()) as 'UDR',
        sourcePath: udrPath,
        status: 'PENDING',
      },
    });
    return { job };
  }

  async getUdrSchema() {
    return {
      version: '2.0.0',
      layers: ['structureTree', 'semanticGraph', 'visualConstraints', 'dataBindingMap', 'interactionMap', 'metadata', 'platformState'],
      description: 'Universal Document Representation schema',
    };
  }

  private extractTitle(text: string): string {
    const firstLine = text.split('\n').find((line: string) => line.trim().length > 0);
    if (!firstLine) return 'Untitled Document';

    const cleaned = firstLine.trim().replace(/^#+\s*/, '');
    return cleaned.length > 120 ? cleaned.slice(0, 117) + '...' : cleaned;
  }

  private stripHtmlTags(html: string): string {
    return html.replace(/<[^>]*>/g, '');
  }

  private deepFreeze<T extends object>(obj: T): Readonly<T> {
    Object.freeze(obj);
    const propNames = Object.getOwnPropertyNames(obj) as Array<keyof T>;
    for (const name of propNames) {
      const value = obj[name];
      if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
        this.deepFreeze(value as object);
      }
    }
    return obj;
  }
}

export const udrService = new UdrService();
