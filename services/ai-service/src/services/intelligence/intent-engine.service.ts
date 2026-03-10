import OpenAI from 'openai';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type IntentType =
  | 'analyze'
  | 'build_dashboard'
  | 'generate_report'
  | 'compare'
  | 'clean_data'
  | 'import'
  | 'export'
  | 'translate'
  | 'present'
  | 'query'
  | 'forecast'
  | 'summarize'
  | 'extract'
  | 'merge'
  | 'visualize'
  | 'govern'
  | 'match'
  | 'convert'
  | 'unknown';

export type Dialect = 'msa' | 'saudi' | 'egyptian' | 'levantine' | 'gulf';

export interface ExtractedEntity {
  type: 'file' | 'date_range' | 'column' | 'metric' | 'format' | 'number' | 'percentage' | 'organization' | 'person' | 'filter' | 'aggregation' | 'language';
  value: string;
  normalizedValue: string;
  confidence: number;
  position: { start: number; end: number };
}

export interface IntentResult {
  id: string;
  originalText: string;
  detectedLanguage: 'ar' | 'en' | 'mixed';
  dialect: Dialect;
  intent: IntentType;
  subIntent: string | null;
  confidence: number;
  entities: ExtractedEntity[];
  alternativeIntents: Array<{ intent: IntentType; confidence: number }>;
  isAmbiguous: boolean;
  disambiguationOptions: string[];
  targetEngines: string[];
  normalizedCommand: string;
}

// ─── Arabic Pattern Dictionaries ─────────────────────────────────────────────

const INTENT_PATTERNS: Record<IntentType, { ar: string[]; en: string[] }> = {
  analyze: {
    ar: ['حلل', 'تحليل', 'ادرس', 'دراسة', 'افحص', 'فحص', 'حلّل', 'شوف', 'وريني', 'اعطني تحليل'],
    en: ['analyze', 'analysis', 'examine', 'inspect', 'study', 'investigate', 'look at', 'check'],
  },
  build_dashboard: {
    ar: ['لوحة', 'داشبورد', 'لوحة معلومات', 'لوحة مؤشرات', 'لوحة بيانات', 'اعمل لوحة', 'ابني لوحة', 'سوي لوحة', 'انشئ لوحة'],
    en: ['dashboard', 'build dashboard', 'create dashboard', 'make dashboard', 'design dashboard'],
  },
  generate_report: {
    ar: ['تقرير', 'قرير', 'اعمل تقرير', 'انشئ تقرير', 'سوي تقرير', 'اكتب تقرير', 'جهز تقرير', 'حضر تقرير'],
    en: ['report', 'generate report', 'create report', 'make report', 'prepare report', 'write report'],
  },
  compare: {
    ar: ['قارن', 'مقارنة', 'قارن بين', 'الفرق بين', 'اختلاف', 'تباين', 'وش الفرق'],
    en: ['compare', 'comparison', 'difference', 'versus', 'vs', 'contrast', 'diff'],
  },
  clean_data: {
    ar: ['نظف', 'تنظيف', 'نقي', 'ازل التكرار', 'صحح', 'اصلح', 'نظّف البيانات'],
    en: ['clean', 'cleanse', 'deduplicate', 'fix', 'repair', 'sanitize', 'normalize'],
  },
  import: {
    ar: ['استورد', 'استيراد', 'حمل', 'تحميل', 'ارفع', 'رفع', 'ادخل', 'نقل الى'],
    en: ['import', 'upload', 'load', 'ingest', 'bring in', 'add file'],
  },
  export: {
    ar: ['صدر', 'تصدير', 'نزل', 'حمل', 'استخرج', 'انزل', 'طلع لي'],
    en: ['export', 'download', 'extract', 'save as', 'output', 'get file'],
  },
  translate: {
    ar: ['ترجم', 'ترجمة', 'عرب', 'تعريب', 'حول للعربي', 'حول للانجليزي'],
    en: ['translate', 'localize', 'arabize', 'convert language', 'change language'],
  },
  present: {
    ar: ['عرض', 'عرض تقديمي', 'بريزنتيشن', 'شرائح', 'سلايدات', 'انفوجرافيك', 'اعمل عرض'],
    en: ['present', 'presentation', 'slides', 'infographic', 'slideshow', 'pitch deck'],
  },
  query: {
    ar: ['استعلم', 'استعلام', 'ابحث', 'بحث', 'اسأل', 'سؤال', 'وش', 'كم', 'كيف', 'ليش', 'متى', 'وين', 'مين'],
    en: ['query', 'search', 'find', 'ask', 'what', 'how many', 'which', 'where', 'who', 'when', 'why', 'look up'],
  },
  forecast: {
    ar: ['تنبؤ', 'توقع', 'تنبأ', 'توقعات', 'مستقبل', 'اتجاه', 'ترند', 'وش بيصير'],
    en: ['forecast', 'predict', 'prediction', 'trend', 'project', 'future', 'estimate'],
  },
  summarize: {
    ar: ['لخص', 'ملخص', 'تلخيص', 'اختصر', 'اختصار', 'اعطني فكرة', 'باختصار'],
    en: ['summarize', 'summary', 'brief', 'tldr', 'overview', 'digest', 'condense'],
  },
  extract: {
    ar: ['استخرج', 'استخراج', 'اطلع', 'اسحب', 'جيب لي', 'هات'],
    en: ['extract', 'pull', 'get', 'retrieve', 'fetch', 'obtain', 'grab'],
  },
  merge: {
    ar: ['ادمج', 'دمج', 'اجمع', 'وحد', 'ضم', 'لم'],
    en: ['merge', 'combine', 'join', 'unite', 'consolidate', 'aggregate'],
  },
  visualize: {
    ar: ['ارسم', 'رسم', 'شارت', 'رسم بياني', 'مخطط', 'جراف', 'ابي رسمة'],
    en: ['visualize', 'chart', 'graph', 'plot', 'draw', 'diagram', 'map'],
  },
  govern: {
    ar: ['حوكمة', 'صلاحيات', 'تحكم', 'ادارة', 'اذونات', 'مراجعة'],
    en: ['govern', 'governance', 'permissions', 'access', 'audit', 'compliance', 'control'],
  },
  match: {
    ar: ['طابق', 'مطابقة', 'قابل', 'مقابلة', 'تطابق'],
    en: ['match', 'literal match', 'exact match', 'pattern match', 'find match'],
  },
  convert: {
    ar: ['حول', 'تحويل', 'غير الصيغة', 'صيغة', 'فورمات'],
    en: ['convert', 'transform', 'change format', 'reformat', 'format'],
  },
  unknown: {
    ar: [],
    en: [],
  },
};

const DIALECT_MARKERS: Record<Dialect, string[]> = {
  msa: ['إن', 'الذي', 'التي', 'يجب', 'ينبغي', 'فيما يخص', 'بالنسبة إلى'],
  saudi: ['وش', 'ابي', 'ابغى', 'سوي', 'سو', 'ذحين', 'الحين', 'كذا', 'زي كذا', 'طيب', 'يالله', 'هلا', 'مدري'],
  egyptian: ['عايز', 'ايه', 'ازاي', 'كده', 'دلوقتي', 'اللي', 'بتاع', 'يعني', 'خلاص'],
  levantine: ['بدي', 'هيك', 'شو', 'كتير', 'هلق', 'يلا', 'منيح'],
  gulf: ['اريد', 'شلون', 'هالحين', 'جذي', 'يالس', 'خوش', 'زين'],
};

const ENGINE_MAP: Record<IntentType, string[]> = {
  analyze: ['data_files', 'ai_intelligence'],
  build_dashboard: ['dashboards'],
  generate_report: ['reports'],
  compare: ['data_files', 'literal_match'],
  clean_data: ['data_files', 'excel'],
  import: ['data_files'],
  export: ['conversion', 'data_files'],
  translate: ['localization'],
  present: ['presentations'],
  query: ['ai_intelligence', 'data_files'],
  forecast: ['ai_intelligence', 'dashboards'],
  summarize: ['ai_intelligence'],
  extract: ['data_files', 'ai_intelligence'],
  merge: ['data_files', 'excel'],
  visualize: ['dashboards', 'presentations'],
  govern: ['governance'],
  match: ['literal_match'],
  convert: ['conversion'],
  unknown: [],
};

// ─── Service ─────────────────────────────────────────────────────────────────

export class IntentEngineService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder' || '' });
    logger.info('IntentEngineService initialized');
  }

  async parseIntent(text: string): Promise<IntentResult> {
    const id = randomUUID();
    const trimmed = text.trim();

    if (trimmed.length === 0) {
      return this.buildEmptyResult(id, trimmed);
    }

    const detectedLanguage = this.detectLanguage(trimmed);
    const dialect = this.detectDialect(trimmed);

    // Rule-based intent detection
    const ruleBasedResult = this.detectIntentByRules(trimmed);

    // Entity extraction via rules
    const ruleEntities = this.extractEntitiesByRules(trimmed);

    // AI-enhanced parsing for complex/ambiguous requests
    let aiResult: {
      intent: IntentType;
      subIntent: string | null;
      confidence: number;
      entities: ExtractedEntity[];
      alternativeIntents: Array<{ intent: IntentType; confidence: number }>;
      normalizedCommand: string;
    } | null = null;

    const needsAI = ruleBasedResult.confidence < 0.7 || ruleBasedResult.alternatives.length > 1;

    if (needsAI) {
      aiResult = await this.parseWithAI(trimmed, detectedLanguage);
    }

    const finalIntent = aiResult && aiResult.confidence > ruleBasedResult.confidence
      ? aiResult.intent
      : ruleBasedResult.intent;

    const finalConfidence = aiResult && aiResult.confidence > ruleBasedResult.confidence
      ? aiResult.confidence
      : ruleBasedResult.confidence;

    const finalSubIntent = aiResult?.subIntent || null;

    const allEntities = this.mergeEntities(ruleEntities, aiResult?.entities || []);

    const alternativeIntents = this.buildAlternatives(
      ruleBasedResult.alternatives,
      aiResult?.alternativeIntents || [],
      finalIntent,
    );

    const isAmbiguous = finalConfidence < 0.6 || alternativeIntents.filter((a) => a.confidence > 0.4).length > 1;

    const disambiguationOptions = isAmbiguous
      ? this.generateDisambiguationOptions(trimmed, alternativeIntents, detectedLanguage)
      : [];

    const normalizedCommand = aiResult?.normalizedCommand || this.normalizeCommand(trimmed, finalIntent);
    const targetEngines = ENGINE_MAP[finalIntent] || [];

    const result: IntentResult = {
      id,
      originalText: trimmed,
      detectedLanguage,
      dialect,
      intent: finalIntent,
      subIntent: finalSubIntent,
      confidence: Math.round(finalConfidence * 100) / 100,
      entities: allEntities,
      alternativeIntents,
      isAmbiguous,
      disambiguationOptions,
      targetEngines,
      normalizedCommand,
    };

    logger.info('Intent parsed', {
      id,
      intent: result.intent,
      confidence: result.confidence,
      language: detectedLanguage,
      dialect,
      entityCount: allEntities.length,
      isAmbiguous,
    });

    return result;
  }

  // ─── Language Detection ────────────────────────────────────────────────

  private detectLanguage(text: string): 'ar' | 'en' | 'mixed' {
    const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
    const latinPattern = /[a-zA-Z]/;

    let arabicCount = 0;
    let latinCount = 0;

    for (const char of text) {
      if (arabicPattern.test(char)) arabicCount++;
      else if (latinPattern.test(char)) latinCount++;
    }

    const total = arabicCount + latinCount;
    if (total === 0) return 'en';

    const arabicRatio = arabicCount / total;
    if (arabicRatio > 0.7) return 'ar';
    if (arabicRatio < 0.3) return 'en';
    return 'mixed';
  }

  // ─── Dialect Detection ─────────────────────────────────────────────────

  private detectDialect(text: string): Dialect {
    const textLower = text.toLowerCase();
    const scores: Record<Dialect, number> = { msa: 0, saudi: 0, egyptian: 0, levantine: 0, gulf: 0 };

    for (const [dialect, markers] of Object.entries(DIALECT_MARKERS)) {
      for (const marker of markers) {
        if (textLower.includes(marker)) {
          scores[dialect as Dialect] += 1;
        }
      }
    }

    let bestDialect: Dialect = 'msa';
    let bestScore = 0;

    for (const [dialect, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestDialect = dialect as Dialect;
      }
    }

    return bestDialect;
  }

  // ─── Rule-Based Intent Detection ───────────────────────────────────────

  private detectIntentByRules(text: string): {
    intent: IntentType;
    confidence: number;
    alternatives: Array<{ intent: IntentType; confidence: number }>;
  } {
    const textLower = text.toLowerCase();
    const scores: Array<{ intent: IntentType; score: number }> = [];

    for (const [intentKey, patterns] of Object.entries(INTENT_PATTERNS)) {
      if (intentKey === 'unknown') continue;

      let maxScore = 0;
      const allPatterns = [...patterns.ar, ...patterns.en];

      for (const pattern of allPatterns) {
        const patternLower = pattern.toLowerCase();
        if (textLower.includes(patternLower)) {
          // Longer pattern matches are more specific and score higher
          const lengthBonus = patternLower.length / textLower.length;
          const score = 0.5 + lengthBonus * 0.5;
          maxScore = Math.max(maxScore, score);
        }
      }

      if (maxScore > 0) {
        scores.push({ intent: intentKey as IntentType, score: maxScore });
      }
    }

    if (scores.length === 0) {
      return {
        intent: 'unknown',
        confidence: 0.1,
        alternatives: [],
      };
    }

    scores.sort((a, b) => b.score - a.score);

    return {
      intent: scores[0].intent,
      confidence: Math.min(0.95, scores[0].score),
      alternatives: scores.slice(1, 4).map((s) => ({
        intent: s.intent,
        confidence: Math.min(0.9, s.score),
      })),
    };
  }

  // ─── Entity Extraction ─────────────────────────────────────────────────

  private extractEntitiesByRules(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    // File name patterns
    const filePattern = /[\w\u0600-\u06FF-]+\.(xlsx?|csv|pdf|docx?|pptx?|json|xml|txt|parquet)/gi;
    let match: RegExpExecArray | null;
    while ((match = filePattern.exec(text)) !== null) {
      entities.push({
        type: 'file',
        value: match[0],
        normalizedValue: match[0].toLowerCase(),
        confidence: 0.95,
        position: { start: match.index, end: match.index + match[0].length },
      });
    }

    // Date ranges (English)
    const datePatternEn = /(\d{1,4}[-\/\.]\d{1,2}[-\/\.]\d{1,4})/g;
    while ((match = datePatternEn.exec(text)) !== null) {
      entities.push({
        type: 'date_range',
        value: match[0],
        normalizedValue: this.normalizeDate(match[0]),
        confidence: 0.85,
        position: { start: match.index, end: match.index + match[0].length },
      });
    }

    // Arabic date keywords
    const arabicDatePatterns = [
      { pattern: /(?:من|خلال)\s+(يناير|فبراير|مارس|ابريل|مايو|يونيو|يوليو|اغسطس|سبتمبر|اكتوبر|نوفمبر|ديسمبر)/g, type: 'date_range' as const },
      { pattern: /(?:آخر|اخر|خلال)\s+(\d+)\s+(?:يوم|شهر|سنة|اسبوع|أسبوع)/g, type: 'date_range' as const },
    ];
    for (const { pattern, type } of arabicDatePatterns) {
      while ((match = pattern.exec(text)) !== null) {
        entities.push({
          type,
          value: match[0],
          normalizedValue: match[0],
          confidence: 0.8,
          position: { start: match.index, end: match.index + match[0].length },
        });
      }
    }

    // Percentage values
    const percentPattern = /(\d+(?:\.\d+)?)\s*[%٪]/g;
    while ((match = percentPattern.exec(text)) !== null) {
      entities.push({
        type: 'percentage',
        value: match[0],
        normalizedValue: match[1],
        confidence: 0.9,
        position: { start: match.index, end: match.index + match[0].length },
      });
    }

    // Number values
    const numberPattern = /\b(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\b/g;
    while ((match = numberPattern.exec(text)) !== null) {
      const alreadyCaptured = entities.some(
        (e) => match!.index >= e.position.start && match!.index < e.position.end,
      );
      if (!alreadyCaptured) {
        entities.push({
          type: 'number',
          value: match[0],
          normalizedValue: match[0].replace(/,/g, ''),
          confidence: 0.75,
          position: { start: match.index, end: match.index + match[0].length },
        });
      }
    }

    // Aggregation keywords
    const aggPatterns = [
      { pattern: /\b(sum|total|average|avg|count|min|max|median|mean)\b/gi, normalized: '' },
      { pattern: /(مجموع|المجموع|متوسط|المتوسط|عدد|العدد|اقل|اكثر|الحد الادنى|الحد الاقصى)/g, normalized: '' },
    ];
    for (const { pattern: aggPattern } of aggPatterns) {
      while ((match = aggPattern.exec(text)) !== null) {
        const normalizedAgg = this.normalizeAggregation(match[0]);
        entities.push({
          type: 'aggregation',
          value: match[0],
          normalizedValue: normalizedAgg,
          confidence: 0.85,
          position: { start: match.index, end: match.index + match[0].length },
        });
      }
    }

    // Format type
    const formatPatterns = /\b(pdf|excel|csv|json|xml|word|powerpoint|pptx|docx|xlsx|html|markdown)\b/gi;
    while ((match = formatPatterns.exec(text)) !== null) {
      const alreadyCaptured = entities.some(
        (e) => e.type === 'file' && match!.index >= e.position.start && match!.index < e.position.end,
      );
      if (!alreadyCaptured) {
        entities.push({
          type: 'format',
          value: match[0],
          normalizedValue: match[0].toLowerCase(),
          confidence: 0.9,
          position: { start: match.index, end: match.index + match[0].length },
        });
      }
    }

    // Language entities
    const langPatterns = /(عربي|انجليزي|فرنسي|arabic|english|french|spanish|german|chinese)/gi;
    while ((match = langPatterns.exec(text)) !== null) {
      entities.push({
        type: 'language',
        value: match[0],
        normalizedValue: this.normalizeLanguage(match[0]),
        confidence: 0.9,
        position: { start: match.index, end: match.index + match[0].length },
      });
    }

    return entities;
  }

  // ─── AI-Enhanced Parsing ───────────────────────────────────────────────

  private async parseWithAI(
    text: string,
    language: 'ar' | 'en' | 'mixed',
  ): Promise<{
    intent: IntentType;
    subIntent: string | null;
    confidence: number;
    entities: ExtractedEntity[];
    alternativeIntents: Array<{ intent: IntentType; confidence: number }>;
    normalizedCommand: string;
  }> {
    const validIntents = Object.keys(INTENT_PATTERNS).join(', ');

    const systemPrompt = `You are an intent parser for a document and data management platform called Rasid (راصد).
The platform supports Arabic (all dialects) and English.

Valid intent types: ${validIntents}

Analyze the user command and return a JSON object with:
- intent: one of the valid intent types
- subIntent: more specific sub-action or null
- confidence: 0.0 to 1.0
- entities: array of {type, value, normalizedValue, confidence, position: {start, end}}
  Entity types: file, date_range, column, metric, format, number, percentage, organization, person, filter, aggregation, language
- alternativeIntents: up to 3 alternative intents with confidence
- normalizedCommand: the command normalized to English imperative form

Respond ONLY with valid JSON, no markdown.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.1,
        max_tokens: 1000,
      });

      const rawContent = response.choices[0]?.message?.content || '{}';
      let parsed: Record<string, unknown>;
      try {
        const cleaned = rawContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        logger.warn('AI intent parsing returned non-JSON', { rawContent: rawContent.substring(0, 200) });
        return {
          intent: 'unknown',
          subIntent: null,
          confidence: 0.3,
          entities: [],
          alternativeIntents: [],
          normalizedCommand: text,
        };
      }

      const intentStr = String(parsed.intent || 'unknown');
      const validIntentSet = new Set(Object.keys(INTENT_PATTERNS));
      const intent: IntentType = validIntentSet.has(intentStr) ? intentStr as IntentType : 'unknown';

      const entities: ExtractedEntity[] = Array.isArray(parsed.entities)
        ? (parsed.entities as Array<Record<string, unknown>>).map((e) => ({
            type: String(e.type || 'filter') as ExtractedEntity['type'],
            value: String(e.value || ''),
            normalizedValue: String(e.normalizedValue || e.value || ''),
            confidence: Number(e.confidence) || 0.5,
            position: {
              start: Number((e.position as Record<string, unknown>)?.start) || 0,
              end: Number((e.position as Record<string, unknown>)?.end) || 0,
            },
          }))
        : [];

      const alternativeIntents = Array.isArray(parsed.alternativeIntents)
        ? (parsed.alternativeIntents as Array<Record<string, unknown>>)
            .filter((a) => validIntentSet.has(String(a.intent)))
            .map((a) => ({
              intent: String(a.intent) as IntentType,
              confidence: Number(a.confidence) || 0.3,
            }))
        : [];

      return {
        intent,
        subIntent: parsed.subIntent ? String(parsed.subIntent) : null,
        confidence: Number(parsed.confidence) || 0.5,
        entities,
        alternativeIntents,
        normalizedCommand: String(parsed.normalizedCommand || text),
      };
    } catch (err) {
      logger.error('AI intent parsing failed', { error: err });
      return {
        intent: 'unknown',
        subIntent: null,
        confidence: 0.2,
        entities: [],
        alternativeIntents: [],
        normalizedCommand: text,
      };
    }
  }

  // ─── Disambiguation ────────────────────────────────────────────────────

  private generateDisambiguationOptions(
    text: string,
    alternatives: Array<{ intent: IntentType; confidence: number }>,
    language: 'ar' | 'en' | 'mixed',
  ): string[] {
    const intentLabels: Record<IntentType, { ar: string; en: string }> = {
      analyze: { ar: 'تحليل البيانات', en: 'Analyze data' },
      build_dashboard: { ar: 'بناء لوحة معلومات', en: 'Build a dashboard' },
      generate_report: { ar: 'إنشاء تقرير', en: 'Generate a report' },
      compare: { ar: 'مقارنة البيانات', en: 'Compare data' },
      clean_data: { ar: 'تنظيف البيانات', en: 'Clean data' },
      import: { ar: 'استيراد ملف', en: 'Import file' },
      export: { ar: 'تصدير بيانات', en: 'Export data' },
      translate: { ar: 'ترجمة المحتوى', en: 'Translate content' },
      present: { ar: 'إنشاء عرض تقديمي', en: 'Create presentation' },
      query: { ar: 'الاستعلام عن البيانات', en: 'Query data' },
      forecast: { ar: 'التنبؤ بالاتجاهات', en: 'Forecast trends' },
      summarize: { ar: 'تلخيص المحتوى', en: 'Summarize content' },
      extract: { ar: 'استخراج المعلومات', en: 'Extract information' },
      merge: { ar: 'دمج البيانات', en: 'Merge data' },
      visualize: { ar: 'تصوير البيانات بيانياً', en: 'Visualize data' },
      govern: { ar: 'إدارة الحوكمة والصلاحيات', en: 'Manage governance' },
      match: { ar: 'المطابقة الحرفية', en: 'Literal matching' },
      convert: { ar: 'تحويل الصيغة', en: 'Convert format' },
      unknown: { ar: 'غير محدد', en: 'Unknown' },
    };

    const useArabic = language === 'ar';
    const options: string[] = [];

    for (const alt of alternatives.slice(0, 4)) {
      const label = intentLabels[alt.intent];
      if (label) {
        options.push(useArabic ? label.ar : label.en);
      }
    }

    if (options.length === 0) {
      options.push(
        useArabic ? 'يرجى توضيح طلبك بشكل أدق' : 'Please clarify your request',
      );
    }

    return options;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private mergeEntities(
    ruleEntities: ExtractedEntity[],
    aiEntities: ExtractedEntity[],
  ): ExtractedEntity[] {
    const merged: ExtractedEntity[] = [...ruleEntities];

    for (const aiEntity of aiEntities) {
      const overlapping = merged.some(
        (existing) =>
          existing.type === aiEntity.type &&
          existing.value.toLowerCase() === aiEntity.value.toLowerCase(),
      );

      if (!overlapping) {
        merged.push(aiEntity);
      }
    }

    return merged.sort((a, b) => a.position.start - b.position.start);
  }

  private buildAlternatives(
    ruleAlts: Array<{ intent: IntentType; confidence: number }>,
    aiAlts: Array<{ intent: IntentType; confidence: number }>,
    primaryIntent: IntentType,
  ): Array<{ intent: IntentType; confidence: number }> {
    const combined = new Map<IntentType, number>();

    for (const alt of ruleAlts) {
      if (alt.intent !== primaryIntent) {
        combined.set(alt.intent, alt.confidence);
      }
    }

    for (const alt of aiAlts) {
      if (alt.intent !== primaryIntent) {
        const existing = combined.get(alt.intent) || 0;
        combined.set(alt.intent, Math.max(existing, alt.confidence));
      }
    }

    return Array.from(combined.entries())
      .map(([intent, confidence]) => ({ intent, confidence }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);
  }

  private normalizeCommand(text: string, intent: IntentType): string {
    return `[${intent}] ${text}`;
  }

  private normalizeDate(dateStr: string): string {
    const parts = dateStr.split(/[-\/.]/);
    if (parts.length !== 3) return dateStr;

    let year: string, month: string, day: string;

    if (parts[0].length === 4) {
      [year, month, day] = parts;
    } else if (parts[2].length === 4) {
      [day, month, year] = parts;
    } else {
      [month, day, year] = parts;
    }

    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  private normalizeAggregation(value: string): string {
    const lower = value.toLowerCase();
    const map: Record<string, string> = {
      sum: 'SUM', total: 'SUM', مجموع: 'SUM', المجموع: 'SUM',
      average: 'AVG', avg: 'AVG', mean: 'AVG', متوسط: 'AVG', المتوسط: 'AVG',
      count: 'COUNT', عدد: 'COUNT', العدد: 'COUNT',
      min: 'MIN', اقل: 'MIN', 'الحد الادنى': 'MIN',
      max: 'MAX', اكثر: 'MAX', 'الحد الاقصى': 'MAX',
      median: 'MEDIAN',
    };
    return map[lower] || value.toUpperCase();
  }

  private normalizeLanguage(value: string): string {
    const lower = value.toLowerCase();
    const map: Record<string, string> = {
      عربي: 'ar', arabic: 'ar',
      انجليزي: 'en', english: 'en',
      فرنسي: 'fr', french: 'fr',
      spanish: 'es', german: 'de', chinese: 'zh',
    };
    return map[lower] || lower;
  }

  private buildEmptyResult(id: string, text: string): IntentResult {
    return {
      id,
      originalText: text,
      detectedLanguage: 'en',
      dialect: 'msa',
      intent: 'unknown',
      subIntent: null,
      confidence: 0,
      entities: [],
      alternativeIntents: [],
      isAmbiguous: true,
      disambiguationOptions: ['Please provide a command to process'],
      targetEngines: [],
      normalizedCommand: '',
    };
  }
}
