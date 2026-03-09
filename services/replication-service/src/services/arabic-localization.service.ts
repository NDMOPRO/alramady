import OpenAI from 'openai';
import winston from 'winston';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Inline canonical-IR types
// ---------------------------------------------------------------------------

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

type ContentKind = 'text' | 'image' | 'shape' | 'table' | 'chart' | 'empty';

interface FontToken {
  family: string;
  size: number;
  weight: number;
  style: 'normal' | 'italic';
  color: string;
}

interface NodeStyle {
  font: FontToken;
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  opacity: number;
  direction: 'ltr' | 'rtl';
  alignment: 'left' | 'center' | 'right' | 'justify';
}

interface Position {
  x: number;
  y: number;
  z: number;
}

interface LayoutNode {
  id: string;
  kind: ContentKind;
  content: string;
  bbox: BoundingBox;
  style: NodeStyle;
  position: Position;
  children: LayoutNode[];
  parentId: string | null;
  metadata: Record<string, string>;
}

interface PageNode {
  id: string;
  width: number;
  height: number;
  nodes: LayoutNode[];
  background: string;
  pageNumber: number;
}

interface CanonicalLayoutGraph {
  id: string;
  version: string;
  pages: PageNode[];
  metadata: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Service interfaces
// ---------------------------------------------------------------------------

interface LocalizationOptions {
  preserveLayout: boolean;
  useTerminologyDB: boolean;
  useTranslationMemory: boolean;
  validateSemantics: boolean;
  kashidaJustification: boolean;
  adaptiveFontScaling: boolean;
}

interface ArabicLocalizationRequest {
  layoutGraph: CanonicalLayoutGraph;
  sourceLanguage: string;
  options?: LocalizationOptions;
}

interface TranslationEntry {
  nodeId: string;
  sourceText: string;
  translatedText: string;
  confidence: number;
  method: 'ai' | 'memory' | 'terminology';
}

interface TerminologyMatch {
  term: string;
  translation: string;
  context: string;
  source: string;
}

interface LayoutAdjustment {
  nodeId: string;
  property: string;
  originalValue: unknown;
  adjustedValue: unknown;
  reason: string;
}

interface LocalizationIssue {
  type:
    | 'overflow'
    | 'truncation'
    | 'font_fallback'
    | 'alignment_shift'
    | 'terminology_inconsistency';
  severity: 'critical' | 'warning' | 'info';
  nodeId: string;
  description: string;
  suggestion: string;
}

interface LocalizationQualityReport {
  overallScore: number;
  textQuality: number;
  layoutPreservation: number;
  typographyScore: number;
  issues: LocalizationIssue[];
}

interface LocalizationResult {
  translatedGraph: CanonicalLayoutGraph;
  translations: TranslationEntry[];
  terminologyMatches: TerminologyMatch[];
  layoutAdjustments: LayoutAdjustment[];
  qualityReport: LocalizationQualityReport;
}

// ---------------------------------------------------------------------------
// Terminology database – 60+ business / tech terms (KSA-flavored Arabic)
// ---------------------------------------------------------------------------

const BUSINESS_TERMINOLOGY: Record<string, string> = {
  'Revenue': 'الإيرادات',
  'Sales': 'المبيعات',
  'Growth': 'النمو',
  'Profit': 'الأرباح',
  'Total': 'الإجمالي',
  'Average': 'المتوسط',
  'Dashboard': 'لوحة المؤشرات',
  'Report': 'تقرير',
  'Chart': 'رسم بياني',
  'Table': 'جدول',
  'Monthly': 'شهري',
  'Quarterly': 'ربع سنوي',
  'Annual': 'سنوي',
  'Performance': 'الأداء',
  'Budget': 'الميزانية',
  'Forecast': 'التوقعات',
  'Target': 'الهدف',
  'Actual': 'الفعلي',
  'Variance': 'الانحراف',
  'Department': 'القسم',
  'Employee': 'الموظف',
  'Customer': 'العميل',
  'Product': 'المنتج',
  'Category': 'الفئة',
  'Region': 'المنطقة',
  'Date': 'التاريخ',
  'Amount': 'المبلغ',
  'Percentage': 'النسبة المئوية',
  'Status': 'الحالة',
  'Priority': 'الأولوية',
  'Description': 'الوصف',
  'Name': 'الاسم',
  'Email': 'البريد الإلكتروني',
  'Phone': 'الهاتف',
  'Address': 'العنوان',
  'City': 'المدينة',
  'Country': 'الدولة',
  'Settings': 'الإعدادات',
  'Profile': 'الملف الشخصي',
  'Logout': 'تسجيل الخروج',
  'Search': 'بحث',
  'Filter': 'تصفية',
  'Sort': 'ترتيب',
  'Export': 'تصدير',
  'Import': 'استيراد',
  'Download': 'تحميل',
  'Upload': 'رفع',
  'Submit': 'إرسال',
  'Cancel': 'إلغاء',
  'Confirm': 'تأكيد',
  'Delete': 'حذف',
  'Edit': 'تعديل',
  'View': 'عرض',
  'Add': 'إضافة',
  'Remove': 'إزالة',
  // KSA-specific terms
  'VAT': 'ضريبة القيمة المضافة',
  'ZATCA': 'هيئة الزكاة والضريبة والجمارك',
  'Zakat': 'الزكاة',
  'Saudi Riyal': 'ريال سعودي',
  'SAR': 'ر.س',
  'National ID': 'الهوية الوطنية',
  'Iqama': 'الإقامة',
  'Nitaqat': 'نطاقات',
  'Saudization': 'التوطين',
  'Vision 2030': 'رؤية 2030',
  'Ministry': 'وزارة',
  'Regulation': 'لائحة',
  'Compliance': 'الامتثال',
  'Audit': 'المراجعة',
  'Invoice': 'فاتورة',
  'Tax': 'الضريبة',
  'Fiscal Year': 'السنة المالية',
  'KPI': 'مؤشر أداء رئيسي',
  'Workflow': 'سير العمل',
  'Approval': 'الموافقة',
  'Pending': 'قيد الانتظار',
  'Completed': 'مكتمل',
  'In Progress': 'قيد التنفيذ',
  'Overdue': 'متأخر',
  'Summary': 'ملخص',
  'Details': 'التفاصيل',
  'Notifications': 'الإشعارات',
  'Calendar': 'التقويم',
  'Attachment': 'مرفق',
  'Comment': 'تعليق',
  'User': 'مستخدم',
  'Admin': 'مسؤول النظام',
  'Manager': 'مدير',
  'Organization': 'منظمة',
  'Branch': 'فرع',
  'Headquarters': 'المقر الرئيسي',
  'Contract': 'عقد',
  'Payment': 'دفعة',
  'Balance': 'الرصيد',
  'Inventory': 'المخزون',
  'Supplier': 'المورد',
  'Procurement': 'المشتريات',
};

// ---------------------------------------------------------------------------
// Arabic font scaling ratios (Arabic text expansion relative to Latin)
// ---------------------------------------------------------------------------

const ARABIC_FONT_SCALING: Record<string, number> = {
  'Arial': 1.15,
  'Helvetica': 1.15,
  'Roboto': 1.12,
  'Inter': 1.1,
  'Cairo': 1.0,
  'Tajawal': 1.05,
  'Noto Sans Arabic': 1.08,
  'Noto Kufi Arabic': 1.1,
  'Amiri': 1.12,
  'Scheherazade': 1.14,
  'IBM Plex Sans Arabic': 1.06,
  'Almarai': 1.04,
};

// Arabic connecting letters eligible for Kashida insertion
const KASHIDA_ELIGIBLE_CHARS = new Set([
  '\u0628', // ba
  '\u062A', // ta
  '\u062B', // tha
  '\u062C', // jim
  '\u062D', // ha
  '\u062E', // kha
  '\u0633', // sin
  '\u0634', // shin
  '\u0635', // sad
  '\u0636', // dad
  '\u0637', // ta
  '\u0638', // za
  '\u0639', // ain
  '\u063A', // ghain
  '\u0641', // fa
  '\u0642', // qaf
  '\u0643', // kaf
  '\u0644', // lam
  '\u0645', // mim
  '\u0646', // nun
  '\u0647', // ha
  '\u064A', // ya
]);

const KASHIDA_CHAR = '\u0640';

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  defaultMeta: { service: 'arabic-localization' },
  transports: [new winston.transports.Console()],
});

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ArabicLocalizationService {
  private readonly openai: OpenAI;

  constructor(openaiApiKey?: string) {
    const key = openaiApiKey ?? process.env['OPENAI_API_KEY'] ?? '';
    if (!key) {
      logger.warn('No OpenAI API key provided; AI translation will fail at runtime');
    }
    this.openai = new OpenAI({ apiKey: key });
  }

  // -----------------------------------------------------------------------
  // Main entry point
  // -----------------------------------------------------------------------

  async localizeLayout(
    request: ArabicLocalizationRequest,
  ): Promise<LocalizationResult> {
    const startTime = Date.now();
    const options: LocalizationOptions = {
      preserveLayout: true,
      useTerminologyDB: true,
      useTranslationMemory: true,
      validateSemantics: true,
      kashidaJustification: true,
      adaptiveFontScaling: true,
      ...request.options,
    };

    logger.info('Starting Arabic localization', {
      graphId: request.layoutGraph.id,
      sourceLanguage: request.sourceLanguage,
      pageCount: request.layoutGraph.pages.length,
    });

    try {
      // 1. Extract text nodes
      const textEntries = this.extractTextNodes(request.layoutGraph);
      logger.info(`Extracted ${textEntries.length} text nodes`);

      const translations: TranslationEntry[] = [];
      const terminologyMatches: TerminologyMatch[] = [];
      const translationMemory = new Map<string, string>();
      const remaining: { nodeId: string; text: string; context: string }[] = [];

      // 2. Apply terminology DB first
      for (const entry of textEntries) {
        if (options.useTerminologyDB) {
          const { translated, matches } = this.applyTerminologyDB(entry.text);
          if (matches.length > 0 && translated !== entry.text) {
            translations.push({
              nodeId: entry.nodeId,
              sourceText: entry.text,
              translatedText: translated,
              confidence: 0.95,
              method: 'terminology',
            });
            terminologyMatches.push(...matches);
            translationMemory.set(entry.text, translated);
            continue;
          }
        }

        // 3. Check translation memory
        if (options.useTranslationMemory) {
          const memoryHit = this.checkTranslationMemory(
            entry.text,
            translationMemory,
          );
          if (memoryHit !== null) {
            translations.push({
              nodeId: entry.nodeId,
              sourceText: entry.text,
              translatedText: memoryHit,
              confidence: 0.9,
              method: 'memory',
            });
            continue;
          }
        }

        remaining.push({
          nodeId: entry.nodeId,
          text: entry.text,
          context: entry.context,
        });
      }

      // 4. Batch AI translation for remaining texts
      if (remaining.length > 0) {
        const aiTranslations = await this.translateTexts(remaining);
        for (const t of aiTranslations) {
          translations.push(t);
          translationMemory.set(t.sourceText, t.translatedText);
        }
      }

      // 5. Build translated graph with layout adjustments
      const { graph: adjustedGraph, adjustments } =
        this.adjustLayoutForArabic(request.layoutGraph, translations);

      // 6. Apply Kashida justification where appropriate
      let finalGraph = adjustedGraph;
      if (options.kashidaJustification) {
        finalGraph = this.applyKashidaToGraph(finalGraph, translations);
      }

      // 7. Collect issues
      const issues = this.collectIssues(finalGraph, translations, adjustments);

      // 8. Generate quality report
      const qualityReport = this.generateQualityReport(
        translations,
        adjustments,
        issues,
      );

      const elapsed = Date.now() - startTime;
      logger.info('Localization complete', {
        graphId: request.layoutGraph.id,
        translationCount: translations.length,
        adjustmentCount: adjustments.length,
        issueCount: issues.length,
        overallScore: qualityReport.overallScore,
        elapsedMs: elapsed,
      });

      return {
        translatedGraph: finalGraph,
        translations,
        terminologyMatches,
        layoutAdjustments: adjustments,
        qualityReport,
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown localization error';
      logger.error('Localization failed', { error: message });
      throw new Error(`Arabic localization failed: ${message}`);
    }
  }

  // -----------------------------------------------------------------------
  // AI Translation
  // -----------------------------------------------------------------------

  async translateTexts(
    texts: { nodeId: string; text: string; context: string }[],
  ): Promise<TranslationEntry[]> {
    const results: TranslationEntry[] = [];
    const batchSize = 20;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      logger.info(`Translating batch ${Math.floor(i / batchSize) + 1}`, {
        size: batch.length,
      });

      try {
        const payload = batch.map((item, idx) => ({
          index: idx,
          text: item.text,
          context: item.context,
        }));

        const completion = await this.openai.chat.completions.create({
          model: 'gpt-4o',
          temperature: 0.1,
          messages: [
            {
              role: 'system',
              content: [
                'You are a professional Arabic translator specializing in Saudi Arabian business and technical content.',
                'Rules:',
                '1. Use formal Saudi Arabic (fusha with Saudi conventions), NOT Egyptian or Levantine dialect.',
                '2. Use formal business register appropriate for corporate reports and dashboards.',
                '3. Preserve all numbers, special characters, units, and formatting tokens exactly as they appear.',
                '4. Maintain sentence structure suitable for fixed-dimension layout containers.',
                '5. Keep proper nouns, brand names, and acronyms in their original form.',
                '6. Use the Hijri calendar context where date references are ambiguous.',
                '7. Currency references should default to SAR (ريال سعودي) when unspecified.',
                '',
                'Respond with a JSON array of objects: [{"index": <number>, "translation": "<arabic text>", "confidence": <0-1>}]',
                'Return ONLY the JSON array, no other text.',
              ].join('\n'),
            },
            {
              role: 'user',
              content: JSON.stringify(payload),
            },
          ],
        });

        const raw = completion.choices[0]?.message?.content ?? '[]';
        const parsed = this.parseTranslationResponse(raw);

        for (const item of parsed) {
          const source = batch[item.index];
          if (source) {
            results.push({
              nodeId: source.nodeId,
              sourceText: source.text,
              translatedText: item.translation,
              confidence: item.confidence,
              method: 'ai',
            });
          }
        }
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unknown translation error';
        logger.error('Batch translation failed', { batchStart: i, error: message });

        // Fallback: mark untranslated items with low confidence
        for (const item of batch) {
          results.push({
            nodeId: item.nodeId,
            sourceText: item.text,
            translatedText: item.text,
            confidence: 0,
            method: 'ai',
          });
        }
      }
    }

    return results;
  }

  // -----------------------------------------------------------------------
  // Terminology DB
  // -----------------------------------------------------------------------

  applyTerminologyDB(
    text: string,
  ): { translated: string; matches: TerminologyMatch[] } {
    let translated = text;
    const matches: TerminologyMatch[] = [];

    // Sort terms by length descending so longer phrases match first
    const sortedTerms = Object.entries(BUSINESS_TERMINOLOGY).sort(
      (a, b) => b[0].length - a[0].length,
    );

    for (const [term, arabicTranslation] of sortedTerms) {
      const regex = new RegExp(`\\b${this.escapeRegex(term)}\\b`, 'gi');
      if (regex.test(translated)) {
        translated = translated.replace(regex, arabicTranslation);
        matches.push({
          term,
          translation: arabicTranslation,
          context: text,
          source: 'BUSINESS_TERMINOLOGY',
        });
      }
    }

    return { translated, matches };
  }

  // -----------------------------------------------------------------------
  // Translation Memory
  // -----------------------------------------------------------------------

  checkTranslationMemory(
    text: string,
    memory: Map<string, string>,
  ): string | null {
    // Exact match
    const exact = memory.get(text);
    if (exact !== undefined) {
      return exact;
    }

    // Normalized match (case-insensitive, trimmed)
    const normalized = text.trim().toLowerCase();
    for (const [key, value] of memory.entries()) {
      if (key.trim().toLowerCase() === normalized) {
        return value;
      }
    }

    // Fuzzy match: if text differs from a memory key by at most 10% of characters
    for (const [key, value] of memory.entries()) {
      const distance = this.levenshteinDistance(
        normalized,
        key.trim().toLowerCase(),
      );
      const maxLen = Math.max(normalized.length, key.length);
      if (maxLen > 0 && distance / maxLen <= 0.1) {
        return value;
      }
    }

    return null;
  }

  // -----------------------------------------------------------------------
  // Layout Adjustment for Arabic / RTL
  // -----------------------------------------------------------------------

  adjustLayoutForArabic(
    graph: CanonicalLayoutGraph,
    translations: TranslationEntry[],
  ): { graph: CanonicalLayoutGraph; adjustments: LayoutAdjustment[] } {
    const adjustments: LayoutAdjustment[] = [];
    const translationMap = new Map<string, TranslationEntry>();
    for (const t of translations) {
      translationMap.set(t.nodeId, t);
    }

    const adjustedPages: PageNode[] = graph.pages.map((page) => {
      const adjustedNodes = page.nodes.map((node) =>
        this.adjustNode(node, translationMap, page.width, adjustments),
      );
      return { ...page, nodes: adjustedNodes };
    });

    return {
      graph: { ...graph, pages: adjustedPages },
      adjustments,
    };
  }

  // -----------------------------------------------------------------------
  // Kashida Justification
  // -----------------------------------------------------------------------

  applyKashidaJustification(
    text: string,
    targetWidth: number,
    fontSize: number,
  ): string {
    const currentWidth = this.estimateTextWidth(text, fontSize, true);
    if (currentWidth >= targetWidth) {
      return text;
    }

    const gap = targetWidth - currentWidth;
    const charWidth = fontSize * 0.5;
    const kashidasNeeded = Math.ceil(gap / charWidth);

    // Find eligible insertion points
    const insertionPoints: number[] = [];
    for (let i = 0; i < text.length - 1; i++) {
      if (KASHIDA_ELIGIBLE_CHARS.has(text[i]!) && this.isArabicChar(text[i + 1]!)) {
        insertionPoints.push(i);
      }
    }

    if (insertionPoints.length === 0) {
      return text;
    }

    // Distribute Kashidas evenly across insertion points
    const kashidasPerPoint = Math.max(
      1,
      Math.floor(kashidasNeeded / insertionPoints.length),
    );
    const remainder = kashidasNeeded - kashidasPerPoint * insertionPoints.length;

    let result = '';
    let lastIdx = 0;
    let distributed = 0;

    for (let p = 0; p < insertionPoints.length && distributed < kashidasNeeded; p++) {
      const idx = insertionPoints[p]!;
      result += text.slice(lastIdx, idx + 1);
      const extra = p < remainder ? 1 : 0;
      const count = Math.min(
        kashidasPerPoint + extra,
        kashidasNeeded - distributed,
      );
      result += KASHIDA_CHAR.repeat(count);
      distributed += count;
      lastIdx = idx + 1;
    }

    result += text.slice(lastIdx);
    return result;
  }

  // -----------------------------------------------------------------------
  // Overflow Detection
  // -----------------------------------------------------------------------

  detectOverflow(
    node: LayoutNode,
    translatedText: string,
    fontSize: number,
  ): boolean {
    const textWidth = this.estimateTextWidth(translatedText, fontSize, true);
    return textWidth > node.bbox.width;
  }

  // -----------------------------------------------------------------------
  // Quality Report
  // -----------------------------------------------------------------------

  generateQualityReport(
    translations: TranslationEntry[],
    adjustments: LayoutAdjustment[],
    issues: LocalizationIssue[],
  ): LocalizationQualityReport {
    // Text quality: average confidence
    const textQuality =
      translations.length > 0
        ? translations.reduce((sum, t) => sum + t.confidence, 0) /
          translations.length
        : 1;

    // Layout preservation: fewer adjustments is better
    const totalNodes = Math.max(translations.length, 1);
    const layoutPreservation = Math.max(
      0,
      1 - adjustments.length / totalNodes,
    );

    // Typography: penalise font fallbacks and scaling issues
    const fontIssues = issues.filter(
      (i) => i.type === 'font_fallback' || i.type === 'overflow',
    );
    const typographyScore = Math.max(
      0,
      1 - fontIssues.length / Math.max(totalNodes, 1),
    );

    // Weighted overall score
    const overallScore =
      textQuality * 0.4 +
      layoutPreservation * 0.35 +
      typographyScore * 0.25;

    return {
      overallScore: parseFloat(overallScore.toFixed(3)),
      textQuality: parseFloat(textQuality.toFixed(3)),
      layoutPreservation: parseFloat(layoutPreservation.toFixed(3)),
      typographyScore: parseFloat(typographyScore.toFixed(3)),
      issues,
    };
  }

  // -----------------------------------------------------------------------
  // Private utilities
  // -----------------------------------------------------------------------

  private isArabicChar(char: string): boolean {
    const code = char.charCodeAt(0);
    // Arabic block U+0600–U+06FF, Arabic Supplement U+0750–U+077F,
    // Arabic Extended-A U+08A0–U+08FF, Arabic Presentation Forms-A/B
    return (
      (code >= 0x0600 && code <= 0x06ff) ||
      (code >= 0x0750 && code <= 0x077f) ||
      (code >= 0x08a0 && code <= 0x08ff) ||
      (code >= 0xfb50 && code <= 0xfdff) ||
      (code >= 0xfe70 && code <= 0xfeff)
    );
  }

  private estimateTextWidth(
    text: string,
    fontSize: number,
    isArabic: boolean,
  ): number {
    // Approximate: each character occupies ~0.5em for Latin, ~0.55em for Arabic
    const charRatio = isArabic ? 0.55 : 0.5;
    return text.length * fontSize * charRatio;
  }

  private flipAlignment(alignment: string): string {
    if (alignment === 'left') return 'right';
    if (alignment === 'right') return 'left';
    return alignment; // center and justify stay
  }

  private getArabicFontExpansionRatio(fontFamily: string): number {
    // Check exact match first, then try to find a partial match
    const exact = ARABIC_FONT_SCALING[fontFamily];
    if (exact !== undefined) return exact;

    for (const [font, ratio] of Object.entries(ARABIC_FONT_SCALING)) {
      if (fontFamily.toLowerCase().includes(font.toLowerCase())) {
        return ratio;
      }
    }

    // Default expansion ratio for unknown fonts
    return 1.15;
  }

  private detectLanguage(text: string): 'ar' | 'en' | 'mixed' {
    let arabicCount = 0;
    let latinCount = 0;

    for (const char of text) {
      if (this.isArabicChar(char)) {
        arabicCount++;
      } else if (/[a-zA-Z]/.test(char)) {
        latinCount++;
      }
    }

    const total = arabicCount + latinCount;
    if (total === 0) return 'en';
    if (arabicCount / total > 0.7) return 'ar';
    if (latinCount / total > 0.7) return 'en';
    return 'mixed';
  }

  private normalizeArabicText(text: string): string {
    // NFC normalization
    let normalized = text.normalize('NFC');

    // Normalize various Alef forms to plain Alef
    normalized = normalized.replace(/[\u0622\u0623\u0625]/g, '\u0627');

    // Normalize Teh Marbuta to Heh (optional, depends on context — kept as-is for accuracy)
    // normalized = normalized.replace(/\u0629/g, '\u0647');

    // Remove Tatweel (Kashida) for normalization purposes
    normalized = normalized.replace(/\u0640/g, '');

    // Remove diacritics (Tashkeel) for matching purposes
    normalized = normalized.replace(/[\u064B-\u065F\u0670]/g, '');

    return normalized;
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private extractTextNodes(
    graph: CanonicalLayoutGraph,
  ): { nodeId: string; text: string; context: string }[] {
    const entries: { nodeId: string; text: string; context: string }[] = [];

    for (const page of graph.pages) {
      for (const node of page.nodes) {
        this.collectTextEntries(node, entries, `page:${page.pageNumber}`);
      }
    }

    return entries;
  }

  private collectTextEntries(
    node: LayoutNode,
    entries: { nodeId: string; text: string; context: string }[],
    contextPrefix: string,
  ): void {
    if (node.kind === 'text' && node.content.trim().length > 0) {
      const lang = this.detectLanguage(node.content);
      if (lang !== 'ar') {
        entries.push({
          nodeId: node.id,
          text: node.content,
          context: `${contextPrefix}|kind:${node.kind}|id:${node.id}`,
        });
      }
    }

    for (const child of node.children) {
      this.collectTextEntries(child, entries, contextPrefix);
    }
  }

  private adjustNode(
    node: LayoutNode,
    translationMap: Map<string, TranslationEntry>,
    parentWidth: number,
    adjustments: LayoutAdjustment[],
  ): LayoutNode {
    const translation = translationMap.get(node.id);
    let adjustedNode = { ...node, style: { ...node.style }, bbox: { ...node.bbox }, position: { ...node.position } };

    if (translation) {
      // Update content
      adjustedNode.content = translation.translatedText;

      // Set RTL direction
      if (adjustedNode.style.direction !== 'rtl') {
        adjustments.push({
          nodeId: node.id,
          property: 'direction',
          originalValue: adjustedNode.style.direction,
          adjustedValue: 'rtl',
          reason: 'Arabic text requires RTL direction',
        });
        adjustedNode.style.direction = 'rtl';
      }

      // Flip alignment
      const flipped = this.flipAlignment(adjustedNode.style.alignment);
      if (flipped !== adjustedNode.style.alignment) {
        adjustments.push({
          nodeId: node.id,
          property: 'alignment',
          originalValue: adjustedNode.style.alignment,
          adjustedValue: flipped,
          reason: 'RTL layout requires mirrored alignment',
        });
        adjustedNode.style.alignment = flipped as NodeStyle['alignment'];
      }

      // Mirror horizontal position for RTL
      const mirroredX =
        parentWidth - adjustedNode.position.x - adjustedNode.bbox.width;
      if (mirroredX !== adjustedNode.position.x) {
        adjustments.push({
          nodeId: node.id,
          property: 'position.x',
          originalValue: adjustedNode.position.x,
          adjustedValue: mirroredX,
          reason: 'Horizontal mirroring for RTL layout',
        });
        adjustedNode.position.x = mirroredX;
      }

      // Adaptive font scaling
      const expansionRatio = this.getArabicFontExpansionRatio(
        adjustedNode.style.font.family,
      );
      const originalFontSize = adjustedNode.style.font.size;
      const estimatedExpandedWidth =
        this.estimateTextWidth(
          translation.sourceText,
          originalFontSize,
          false,
        ) * expansionRatio;

      // Detect overflow and adjust font size
      if (estimatedExpandedWidth > adjustedNode.bbox.width) {
        const scaleFactor = adjustedNode.bbox.width / estimatedExpandedWidth;
        // Reduce by up to 15%
        const clampedScale = Math.max(0.85, scaleFactor);
        const newFontSize = parseFloat(
          (originalFontSize * clampedScale).toFixed(1),
        );

        if (newFontSize !== originalFontSize) {
          adjustments.push({
            nodeId: node.id,
            property: 'font.size',
            originalValue: originalFontSize,
            adjustedValue: newFontSize,
            reason: `Font scaled down to prevent overflow (expansion ratio: ${expansionRatio})`,
          });
          adjustedNode.style.font = {
            ...adjustedNode.style.font,
            size: newFontSize,
          };
        }
      }
    }

    // Recursively adjust children
    const adjustedChildren = adjustedNode.children.map((child) =>
      this.adjustNode(child, translationMap, adjustedNode.bbox.width, adjustments),
    );

    return { ...adjustedNode, children: adjustedChildren };
  }

  private applyKashidaToGraph(
    graph: CanonicalLayoutGraph,
    translations: TranslationEntry[],
  ): CanonicalLayoutGraph {
    const translationMap = new Map<string, TranslationEntry>();
    for (const t of translations) {
      translationMap.set(t.nodeId, t);
    }

    const pages = graph.pages.map((page) => ({
      ...page,
      nodes: page.nodes.map((node) =>
        this.applyKashidaToNode(node, translationMap),
      ),
    }));

    return { ...graph, pages };
  }

  private applyKashidaToNode(
    node: LayoutNode,
    translationMap: Map<string, TranslationEntry>,
  ): LayoutNode {
    let content = node.content;
    const translation = translationMap.get(node.id);

    if (
      translation &&
      node.style.alignment === 'justify' &&
      this.detectLanguage(content) === 'ar'
    ) {
      content = this.applyKashidaJustification(
        content,
        node.bbox.width,
        node.style.font.size,
      );
    }

    const children = node.children.map((child) =>
      this.applyKashidaToNode(child, translationMap),
    );

    return { ...node, content, children };
  }

  private collectIssues(
    graph: CanonicalLayoutGraph,
    translations: TranslationEntry[],
    adjustments: LayoutAdjustment[],
  ): LocalizationIssue[] {
    const issues: LocalizationIssue[] = [];
    const translationMap = new Map<string, TranslationEntry>();
    for (const t of translations) {
      translationMap.set(t.nodeId, t);
    }

    for (const page of graph.pages) {
      for (const node of page.nodes) {
        this.collectNodeIssues(node, translationMap, issues);
      }
    }

    // Check for font fallbacks in adjustments
    const fontSizeAdjustments = adjustments.filter(
      (a) => a.property === 'font.size',
    );
    for (const adj of fontSizeAdjustments) {
      if (
        typeof adj.originalValue === 'number' &&
        typeof adj.adjustedValue === 'number' &&
        adj.adjustedValue < adj.originalValue * 0.9
      ) {
        issues.push({
          type: 'truncation',
          severity: 'warning',
          nodeId: adj.nodeId,
          description: `Font size reduced significantly from ${adj.originalValue} to ${adj.adjustedValue}`,
          suggestion:
            'Consider increasing container width or using a more compact Arabic font like Cairo or Almarai',
        });
      }
    }

    // Check terminology consistency
    const termUsage = new Map<string, Set<string>>();
    for (const t of translations) {
      for (const [term, arabic] of Object.entries(BUSINESS_TERMINOLOGY)) {
        if (t.sourceText.toLowerCase().includes(term.toLowerCase())) {
          if (!termUsage.has(term)) {
            termUsage.set(term, new Set());
          }
          // Check if the Arabic translation contains the expected term
          if (!t.translatedText.includes(arabic)) {
            const usages = termUsage.get(term)!;
            usages.add(t.nodeId);
          }
        }
      }
    }

    for (const [term, nodeIds] of termUsage.entries()) {
      if (nodeIds.size > 0) {
        issues.push({
          type: 'terminology_inconsistency',
          severity: 'info',
          nodeId: Array.from(nodeIds)[0]!,
          description: `Term "${term}" may not be consistently translated as "${BUSINESS_TERMINOLOGY[term]}"`,
          suggestion: `Ensure "${term}" is always translated as "${BUSINESS_TERMINOLOGY[term]}" per the terminology database`,
        });
      }
    }

    return issues;
  }

  private collectNodeIssues(
    node: LayoutNode,
    translationMap: Map<string, TranslationEntry>,
    issues: LocalizationIssue[],
  ): void {
    const translation = translationMap.get(node.id);

    if (translation) {
      // Check overflow
      if (
        this.detectOverflow(
          node,
          translation.translatedText,
          node.style.font.size,
        )
      ) {
        issues.push({
          type: 'overflow',
          severity: 'critical',
          nodeId: node.id,
          description: `Translated text overflows container (${node.bbox.width}px wide)`,
          suggestion:
            'Reduce font size, increase container width, or shorten translation',
        });
      }

      // Check font availability
      const knownFont =
        ARABIC_FONT_SCALING[node.style.font.family] !== undefined;
      if (!knownFont) {
        issues.push({
          type: 'font_fallback',
          severity: 'warning',
          nodeId: node.id,
          description: `Font "${node.style.font.family}" has no known Arabic variant; fallback scaling used`,
          suggestion:
            'Use an Arabic-optimized font such as Cairo, Tajawal, or Noto Sans Arabic',
        });
      }

      // Check alignment shift
      if (node.style.direction === 'rtl' && node.style.alignment === 'left') {
        issues.push({
          type: 'alignment_shift',
          severity: 'info',
          nodeId: node.id,
          description:
            'RTL node still uses left alignment, which may cause visual misalignment',
          suggestion: 'Switch alignment to right for RTL content',
        });
      }
    }

    for (const child of node.children) {
      this.collectNodeIssues(child, translationMap, issues);
    }
  }

  private parseTranslationResponse(
    raw: string,
  ): { index: number; translation: string; confidence: number }[] {
    try {
      // Strip markdown code fences if present
      let cleaned = raw.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const parsed: unknown = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) {
        logger.warn('Translation response is not an array');
        return [];
      }

      const results: { index: number; translation: string; confidence: number }[] = [];
      for (const item of parsed) {
        if (
          typeof item === 'object' &&
          item !== null &&
          'index' in item &&
          'translation' in item
        ) {
          const record = item as Record<string, unknown>;
          results.push({
            index: typeof record['index'] === 'number' ? record['index'] : 0,
            translation:
              typeof record['translation'] === 'string'
                ? record['translation']
                : '',
            confidence:
              typeof record['confidence'] === 'number'
                ? record['confidence']
                : 0.5,
          });
        }
      }

      return results;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Parse error';
      logger.error('Failed to parse translation response', {
        error: message,
        rawLength: raw.length,
      });
      return [];
    }
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;

    if (m === 0) return n;
    if (n === 0) return m;

    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      Array.from({ length: n + 1 }, () => 0),
    );

    for (let i = 0; i <= m; i++) dp[i]![0] = i;
    for (let j = 0; j <= n; j++) dp[0]![j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i]![j] = Math.min(
          dp[i - 1]![j]! + 1,
          dp[i]![j - 1]! + 1,
          dp[i - 1]![j - 1]! + cost,
        );
      }
    }

    return dp[m]![n]!;
  }
}

export {
  ArabicLocalizationRequest,
  ArabicLocalizationService as default,
  LocalizationOptions,
  LocalizationResult,
  TranslationEntry,
  TerminologyMatch,
  LayoutAdjustment,
  LocalizationQualityReport,
  LocalizationIssue,
  CanonicalLayoutGraph,
  PageNode,
  LayoutNode,
  NodeStyle,
  FontToken,
  BoundingBox,
  Position,
  ContentKind,
};
