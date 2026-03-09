import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { z } from 'zod';
import winston from 'winston';

const prisma = new PrismaClient();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'quality-gate' },
  transports: [new winston.transports.Console()],
});

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const QualityGateInputSchema = z.object({
  content: z.object({
    originalText: z.string().min(1),
    translatedText: z.string().min(1),
    sourceLanguage: z.string().default('en'),
    targetLanguage: z.string().default('ar'),
  }),
  layout: z.object({
    direction: z.enum(['ltr', 'rtl']).optional(),
    fontFamily: z.string().optional(),
    fontSize: z.number().optional(),
    styles: z.record(z.unknown()).optional(),
  }).optional(),
  thresholds: z.object({
    linguisticAccuracy: z.number().min(0).max(100).default(98),
    typographicSoundness: z.number().min(0).max(100).default(95),
    visualHierarchy: z.number().min(0).max(100).default(95),
    culturalFormatting: z.number().min(0).max(100).default(100),
  }).optional(),
  blockOnFailure: z.boolean().default(true),
  autoRegenerate: z.boolean().default(true),
  maxRegenerateAttempts: z.number().min(0).max(5).default(3),
  tenantId: z.string().min(1),
  jobId: z.string().optional(),
});

// ─── Types ───────────────────────────────────────────────────────────────────

interface QualityDimension {
  name: string;
  nameAr: string;
  score: number;
  threshold: number;
  passed: boolean;
  issues: QualityIssue[];
}

interface QualityIssue {
  severity: 'critical' | 'major' | 'minor' | 'info';
  category: string;
  description: string;
  descriptionAr: string;
  location: string;
  suggestion: string;
  suggestionAr: string;
}

interface QualityGateResult {
  id: string;
  passed: boolean;
  overallScore: number;
  dimensions: QualityDimension[];
  totalIssues: number;
  criticalIssues: number;
  regenerateTriggered: boolean;
  regenerateAttempt: number;
  createdAt: Date;
}

// ─── Arabic Linguistic Constants ─────────────────────────────────────────────

const ARABIC_PATTERN = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const DIACRITICS_PATTERN = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const KASHIDA = '\u0640';
const BIDI_CONTROLS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/;

// Common Arabic grammatical issues
const COMMON_ARABIC_ERRORS = [
  { pattern: /ال(\s)ال/g, description: 'Double definite article', descriptionAr: 'تعريف مزدوج' },
  { pattern: /[.!?][^\s]/g, description: 'Missing space after punctuation', descriptionAr: 'مسافة مفقودة بعد علامة الترقيم' },
  { pattern: /\s{2,}/g, description: 'Multiple consecutive spaces', descriptionAr: 'مسافات متعددة متتالية' },
];

// ─── Service Functions ───────────────────────────────────────────────────────

export async function runQualityGate(
  input: z.infer<typeof QualityGateInputSchema>
): Promise<QualityGateResult> {
  const validated = QualityGateInputSchema.parse(input);
  logger.info('runQualityGate called', {
    sourceLanguage: validated.content.sourceLanguage,
    targetLanguage: validated.content.targetLanguage,
    blockOnFailure: validated.blockOnFailure,
  });

  const thresholds = {
    linguisticAccuracy: validated.thresholds?.linguisticAccuracy ?? 98,
    typographicSoundness: validated.thresholds?.typographicSoundness ?? 95,
    visualHierarchy: validated.thresholds?.visualHierarchy ?? 95,
    culturalFormatting: validated.thresholds?.culturalFormatting ?? 100,
  };

  // Run all quality dimensions in parallel
  const [
    linguisticResult,
    typographicResult,
    hierarchyResult,
    culturalResult,
  ] = await Promise.all([
    checkLinguisticAccuracy(validated.content, thresholds.linguisticAccuracy),
    checkTypographicSoundness(validated.content.translatedText, validated.layout, thresholds.typographicSoundness),
    checkVisualHierarchy(validated.content, validated.layout, thresholds.visualHierarchy),
    checkCulturalFormatting(validated.content.translatedText, thresholds.culturalFormatting),
  ]);

  const dimensions: QualityDimension[] = [
    linguisticResult,
    typographicResult,
    hierarchyResult,
    culturalResult,
  ];

  const overallScore = dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length;
  const allPassed = dimensions.every(d => d.passed);
  const totalIssues = dimensions.reduce((sum, d) => sum + d.issues.length, 0);
  const criticalIssues = dimensions.reduce(
    (sum, d) => sum + d.issues.filter(i => i.severity === 'critical').length, 0
  );

  const resultId = crypto.randomUUID();
  let regenerateTriggered = false;
  let regenerateAttempt = 0;

  // Handle failure
  if (!allPassed && validated.blockOnFailure) {
    logger.warn('Quality gate FAILED', {
      overallScore: Math.round(overallScore * 100) / 100,
      failedDimensions: dimensions.filter(d => !d.passed).map(d => d.name),
      criticalIssues,
    });

    if (validated.autoRegenerate && regenerateAttempt < validated.maxRegenerateAttempts) {
      regenerateTriggered = true;
      regenerateAttempt++;
      logger.info('Auto-regeneration triggered', { attempt: regenerateAttempt });
    }
  }

  // Store result
  await prisma.localizationJob.create({
    data: {
      id: resultId,
      documentId: validated.jobId || 'quality-gate',
      sourceLanguage: validated.content.sourceLanguage,
      targetLanguage: validated.content.targetLanguage,
      status: allPassed ? 'completed' : 'failed',
      totalSegments: 4,
      translatedSegments: dimensions.filter(d => d.passed).length,
      resultContent: JSON.stringify({
        type: 'quality_gate',
        passed: allPassed,
        overallScore: Math.round(overallScore * 100) / 100,
        dimensions: dimensions.map(d => ({
          name: d.name,
          score: d.score,
          threshold: d.threshold,
          passed: d.passed,
          issueCount: d.issues.length,
        })),
        totalIssues,
        criticalIssues,
        regenerateTriggered,
        regenerateAttempt,
      }),
      tenantId: validated.tenantId,
      createdBy: 'system',
      completedAt: new Date(),
    },
  });

  const result: QualityGateResult = {
    id: resultId,
    passed: allPassed,
    overallScore: Math.round(overallScore * 100) / 100,
    dimensions,
    totalIssues,
    criticalIssues,
    regenerateTriggered,
    regenerateAttempt,
    createdAt: new Date(),
  };

  logger.info('Quality gate completed', {
    id: resultId,
    passed: allPassed,
    overallScore: result.overallScore,
    totalIssues,
    criticalIssues,
  });

  return result;
}

// ─── Dimension Checks ────────────────────────────────────────────────────────

async function checkLinguisticAccuracy(
  content: { originalText: string; translatedText: string; sourceLanguage: string; targetLanguage: string },
  threshold: number
): Promise<QualityDimension> {
  const issues: QualityIssue[] = [];
  let score = 100;

  // Check 1: Basic non-empty translation
  if (content.translatedText.trim().length === 0) {
    issues.push({
      severity: 'critical',
      category: 'completeness',
      description: 'Translation is empty',
      descriptionAr: 'الترجمة فارغة',
      location: 'entire_text',
      suggestion: 'Provide a complete translation',
      suggestionAr: 'قدم ترجمة كاملة',
    });
    score -= 50;
  }

  // Check 2: Language mismatch - translation should contain target language characters
  if (content.targetLanguage === 'ar' || content.targetLanguage.startsWith('ar')) {
    const arabicCharCount = (content.translatedText.match(/[\u0600-\u06FF]/g) || []).length;
    const totalCharCount = content.translatedText.replace(/\s/g, '').length;
    const arabicRatio = totalCharCount > 0 ? arabicCharCount / totalCharCount : 0;

    if (arabicRatio < 0.3 && totalCharCount > 10) {
      issues.push({
        severity: 'critical',
        category: 'language',
        description: `Translation has low Arabic content ratio (${Math.round(arabicRatio * 100)}%)`,
        descriptionAr: `نسبة المحتوى العربي منخفضة (${Math.round(arabicRatio * 100)}٪)`,
        location: 'entire_text',
        suggestion: 'Ensure translation is primarily in Arabic',
        suggestionAr: 'تأكد من أن الترجمة باللغة العربية بشكل أساسي',
      });
      score -= 30;
    }
  }

  // Check 3: Length ratio (Arabic is typically 0.8-1.3x of English)
  const sourcelen = content.originalText.length;
  const targetLen = content.translatedText.length;
  const ratio = sourcelen > 0 ? targetLen / sourcelen : 1;

  if (ratio < 0.3 || ratio > 3.0) {
    issues.push({
      severity: 'major',
      category: 'completeness',
      description: `Translation length ratio (${ratio.toFixed(2)}) is suspicious`,
      descriptionAr: `نسبة طول الترجمة (${ratio.toFixed(2)}) مشبوهة`,
      location: 'entire_text',
      suggestion: 'Review translation for missing or excessive content',
      suggestionAr: 'راجع الترجمة بحثاً عن محتوى مفقود أو زائد',
    });
    score -= 10;
  }

  // Check 4: Common Arabic grammatical errors
  for (const errorCheck of COMMON_ARABIC_ERRORS) {
    const matches = content.translatedText.match(errorCheck.pattern);
    if (matches && matches.length > 0) {
      issues.push({
        severity: 'minor',
        category: 'grammar',
        description: errorCheck.description,
        descriptionAr: errorCheck.descriptionAr,
        location: `${matches.length} occurrence(s)`,
        suggestion: 'Fix grammatical issues',
        suggestionAr: 'أصلح المشاكل النحوية',
      });
      score -= 2 * matches.length;
    }
  }

  // Check 5: AI-based linguistic review for significant content
  if (content.originalText.length > 50) {
    try {
      const aiResult = await performAILinguisticCheck(content);
      score = Math.min(score, aiResult.score);
      issues.push(...aiResult.issues);
    } catch (err) {
      logger.warn('AI linguistic check failed, using rule-based only', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  score = Math.max(0, Math.min(100, score));

  return {
    name: 'linguistic_accuracy',
    nameAr: 'الدقة اللغوية',
    score,
    threshold,
    passed: score >= threshold,
    issues,
  };
}

function checkTypographicSoundness(
  translatedText: string,
  layout: { direction?: string; fontFamily?: string; fontSize?: number; styles?: Record<string, unknown> } | undefined,
  threshold: number
): QualityDimension {
  const issues: QualityIssue[] = [];
  let score = 100;

  // Check 1: Font supports Arabic
  if (layout?.fontFamily) {
    const arabicFonts = [
      'noto', 'amiri', 'cairo', 'tajawal', 'plex arabic', 'scheherazade',
      'aref', 'reem', 'almarai', 'harmattan', 'lateef', 'markazi',
      'mada', 'changa', 'katibeh', 'mirza', 'el messiri', 'readex',
      'arial', 'tahoma', 'times new roman', 'sans-serif',
    ];
    const fontLower = layout.fontFamily.toLowerCase();
    const hasArabicFont = arabicFonts.some(f => fontLower.includes(f));

    if (!hasArabicFont) {
      issues.push({
        severity: 'major',
        category: 'font',
        description: `Font "${layout.fontFamily}" may not support Arabic characters`,
        descriptionAr: `الخط "${layout.fontFamily}" قد لا يدعم الحروف العربية`,
        location: 'font_family',
        suggestion: 'Use an Arabic-supporting font like Noto Naskh Arabic, Cairo, or Tajawal',
        suggestionAr: 'استخدم خطاً يدعم العربية مثل Noto Naskh Arabic أو Cairo أو Tajawal',
      });
      score -= 15;
    }
  }

  // Check 2: Diacritics integrity (no orphan diacritics)
  const diacriticMatches = translatedText.match(DIACRITICS_PATTERN);
  if (diacriticMatches) {
    for (let i = 0; i < translatedText.length; i++) {
      if (DIACRITICS_PATTERN.test(translatedText[i])) {
        if (i === 0 || !ARABIC_PATTERN.test(translatedText[i - 1])) {
          issues.push({
            severity: 'minor',
            category: 'diacritics',
            description: 'Orphan diacritic found (diacritic without preceding Arabic letter)',
            descriptionAr: 'علامة تشكيل يتيمة (بدون حرف عربي سابق)',
            location: `position ${i}`,
            suggestion: 'Remove or reattach the diacritic to its letter',
            suggestionAr: 'أزل التشكيل أو أعد ربطه بالحرف المناسب',
          });
          score -= 2;
          break; // Report only first occurrence
        }
      }
    }
  }

  // Check 3: Kashida usage
  const kashidaCount = (translatedText.match(new RegExp(KASHIDA, 'g')) || []).length;
  if (kashidaCount > translatedText.length * 0.1) {
    issues.push({
      severity: 'minor',
      category: 'kashida',
      description: 'Excessive kashida usage',
      descriptionAr: 'استخدام مفرط للكشيدة',
      location: `${kashidaCount} kashidas found`,
      suggestion: 'Reduce kashida usage to maintain readability',
      suggestionAr: 'قلل استخدام الكشيدة للحفاظ على سهولة القراءة',
    });
    score -= 5;
  }

  // Check 4: Line height / font size adequacy
  if (layout?.fontSize && layout.fontSize < 12) {
    issues.push({
      severity: 'major',
      category: 'readability',
      description: `Font size ${layout.fontSize}px is too small for Arabic text`,
      descriptionAr: `حجم الخط ${layout.fontSize} بكسل صغير جداً للنص العربي`,
      location: 'font_size',
      suggestion: 'Use minimum 14px for Arabic body text',
      suggestionAr: 'استخدم ١٤ بكسل كحد أدنى للنص العربي',
    });
    score -= 10;
  }

  // Check 5: Connected letter integrity
  const brokenConnectionPattern = /[\u0627\u062F\u0630\u0631\u0632\u0648][\u0640]{2,}/g;
  const brokenConnections = translatedText.match(brokenConnectionPattern);
  if (brokenConnections) {
    issues.push({
      severity: 'minor',
      category: 'ligature',
      description: 'Possible broken letter connections detected',
      descriptionAr: 'اتصالات حروف مكسورة محتملة',
      location: `${brokenConnections.length} occurrence(s)`,
      suggestion: 'Ensure proper Arabic ligature rendering',
      suggestionAr: 'تأكد من عرض الحروف المتصلة بشكل صحيح',
    });
    score -= 3;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    name: 'typographic_soundness',
    nameAr: 'السلامة الطباعية',
    score,
    threshold,
    passed: score >= threshold,
    issues,
  };
}

function checkVisualHierarchy(
  content: { originalText: string; translatedText: string },
  layout: { direction?: string; styles?: Record<string, unknown> } | undefined,
  threshold: number
): QualityDimension {
  const issues: QualityIssue[] = [];
  let score = 100;

  // Check 1: Direction attribute
  if (layout && layout.direction !== 'rtl' && ARABIC_PATTERN.test(content.translatedText)) {
    issues.push({
      severity: 'critical',
      category: 'direction',
      description: 'Arabic content without RTL direction attribute',
      descriptionAr: 'محتوى عربي بدون سمة اتجاه RTL',
      location: 'layout.direction',
      suggestion: 'Set direction to "rtl" for Arabic content',
      suggestionAr: 'اضبط الاتجاه على "rtl" للمحتوى العربي',
    });
    score -= 20;
  }

  // Check 2: Text alignment
  if (layout?.styles) {
    const textAlign = layout.styles['textAlign'] || layout.styles['text-align'];
    if (textAlign === 'left' && ARABIC_PATTERN.test(content.translatedText)) {
      issues.push({
        severity: 'major',
        category: 'alignment',
        description: 'Arabic text aligned to left instead of right',
        descriptionAr: 'نص عربي محاذي لليسار بدلاً من اليمين',
        location: 'text-align',
        suggestion: 'Change text alignment to "right" or "start"',
        suggestionAr: 'غيّر محاذاة النص إلى "right" أو "start"',
      });
      score -= 10;
    }
  }

  // Check 3: Structural element count parity (headings, paragraphs, etc.)
  const sourceStructure = analyzeTextStructure(content.originalText);
  const targetStructure = analyzeTextStructure(content.translatedText);

  if (sourceStructure.paragraphCount > 0 &&
      Math.abs(sourceStructure.paragraphCount - targetStructure.paragraphCount) > 2) {
    issues.push({
      severity: 'major',
      category: 'structure',
      description: `Paragraph count mismatch: source has ${sourceStructure.paragraphCount}, translation has ${targetStructure.paragraphCount}`,
      descriptionAr: `عدم تطابق الفقرات: المصدر ${sourceStructure.paragraphCount}، الترجمة ${targetStructure.paragraphCount}`,
      location: 'paragraph_structure',
      suggestion: 'Maintain the same number of paragraphs as the source',
      suggestionAr: 'حافظ على نفس عدد الفقرات كالمصدر',
    });
    score -= 10;
  }

  // Check 4: Bullet/list item parity
  if (sourceStructure.listItems > 0 &&
      sourceStructure.listItems !== targetStructure.listItems) {
    issues.push({
      severity: 'major',
      category: 'structure',
      description: `List item count mismatch: source has ${sourceStructure.listItems}, translation has ${targetStructure.listItems}`,
      descriptionAr: `عدم تطابق عناصر القائمة: المصدر ${sourceStructure.listItems}، الترجمة ${targetStructure.listItems}`,
      location: 'list_structure',
      suggestion: 'Translate all list items',
      suggestionAr: 'ترجم جميع عناصر القائمة',
    });
    score -= 5;
  }

  // Check 5: BiDi control characters presence for mixed content
  const hasMixedContent = ARABIC_PATTERN.test(content.translatedText) &&
    /[a-zA-Z]/.test(content.translatedText);

  if (hasMixedContent && !BIDI_CONTROLS.test(content.translatedText)) {
    issues.push({
      severity: 'info',
      category: 'bidi',
      description: 'Mixed Arabic/Latin text without BiDi control characters',
      descriptionAr: 'نص مختلط عربي/لاتيني بدون أحرف تحكم BiDi',
      location: 'entire_text',
      suggestion: 'Add Unicode BiDi control characters for proper mixed text rendering',
      suggestionAr: 'أضف أحرف تحكم BiDi للعرض الصحيح للنص المختلط',
    });
    score -= 3;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    name: 'visual_hierarchy',
    nameAr: 'التسلسل الهرمي البصري',
    score,
    threshold,
    passed: score >= threshold,
    issues,
  };
}

function checkCulturalFormatting(
  translatedText: string,
  threshold: number
): QualityDimension {
  const issues: QualityIssue[] = [];
  let score = 100;

  // Check 1: Date format (should not use MM/DD/YYYY in Arabic context)
  const americanDatePattern = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
  const americanDates = translatedText.match(americanDatePattern);
  if (americanDates) {
    for (const dateStr of americanDates) {
      const parts = dateStr.split('/');
      const month = parseInt(parts[0]);
      if (month > 12) continue; // Not a date
      issues.push({
        severity: 'major',
        category: 'date_format',
        description: `Date "${dateStr}" uses Western format instead of Arabic (DD/MM/YYYY or Hijri)`,
        descriptionAr: `التاريخ "${dateStr}" يستخدم التنسيق الغربي بدلاً من العربي`,
        location: dateStr,
        suggestion: 'Use DD/MM/YYYY or Hijri date format',
        suggestionAr: 'استخدم تنسيق يوم/شهر/سنة أو التاريخ الهجري',
      });
      score -= 5;
    }
  }

  // Check 2: Currency format
  const dollarFirst = /\$[\d,]+/g;
  if (dollarFirst.test(translatedText)) {
    issues.push({
      severity: 'minor',
      category: 'currency_format',
      description: 'Currency symbol before number (Western style)',
      descriptionAr: 'رمز العملة قبل الرقم (أسلوب غربي)',
      location: 'currency',
      suggestion: 'Place currency name/symbol after the number in Arabic',
      suggestionAr: 'ضع اسم/رمز العملة بعد الرقم في العربية',
    });
    score -= 3;
  }

  // Check 3: Numbers should be localized (check for Western numerals in heavily Arabic text)
  const arabicCharCount = (translatedText.match(/[\u0600-\u06FF]/g) || []).length;
  const totalLen = translatedText.replace(/\s/g, '').length;

  if (totalLen > 0 && arabicCharCount / totalLen > 0.7) {
    // Heavily Arabic text -- check if numbers are still Western
    const westernNumbers = translatedText.match(/\d{4,}/g); // long numbers
    if (westernNumbers && westernNumbers.length > 0) {
      issues.push({
        severity: 'minor',
        category: 'numeral_system',
        description: 'Western numerals found in predominantly Arabic text',
        descriptionAr: 'أرقام غربية في نص عربي بشكل أساسي',
        location: `${westernNumbers.length} numeric string(s)`,
        suggestion: 'Consider using Eastern Arabic numerals (٠١٢٣٤٥٦٧٨٩)',
        suggestionAr: 'فكر في استخدام الأرقام العربية الشرقية (٠١٢٣٤٥٦٧٨٩)',
      });
      score -= 2;
    }
  }

  // Check 4: Sensitive cultural references
  const sensitivePatterns = [
    { pattern: /\bChristmas\b/gi, suggestion: 'Use culturally appropriate reference', suggestionAr: 'استخدم مرجعاً ثقافياً مناسباً' },
    { pattern: /\bHappy New Year\b/gi, suggestion: 'Consider Hijri New Year context', suggestionAr: 'راع سياق رأس السنة الهجرية' },
  ];

  for (const check of sensitivePatterns) {
    if (check.pattern.test(translatedText)) {
      issues.push({
        severity: 'info',
        category: 'cultural_sensitivity',
        description: 'Cultural reference may need adaptation for Saudi context',
        descriptionAr: 'المرجع الثقافي قد يحتاج تكييفاً للسياق السعودي',
        location: 'cultural_reference',
        suggestion: check.suggestion,
        suggestionAr: check.suggestionAr,
      });
      score -= 1;
    }
  }

  // Check 5: Decimal separator (Arabic uses momayyez ٫ not dot)
  const decimalDot = /\d+\.\d+/g;
  if (decimalDot.test(translatedText) && arabicCharCount > totalLen * 0.5) {
    issues.push({
      severity: 'minor',
      category: 'decimal_format',
      description: 'Decimal dot used instead of Arabic decimal separator (momayyez ٫)',
      descriptionAr: 'نقطة عشرية بدلاً من الفاصلة العربية (مميّز ٫)',
      location: 'decimal_separator',
      suggestion: 'Use Arabic decimal separator (momayyez ٫) in Arabic context',
      suggestionAr: 'استخدم الفاصلة العربية (المميّز ٫) في السياق العربي',
    });
    score -= 2;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    name: 'cultural_formatting',
    nameAr: 'التنسيق الثقافي',
    score,
    threshold,
    passed: score >= threshold,
    issues,
  };
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function analyzeTextStructure(text: string): { paragraphCount: number; listItems: number; headings: number } {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const listItems = (text.match(/^[\s]*[-•*]\s/gm) || []).length +
    (text.match(/^[\s]*\d+[.)]\s/gm) || []).length;
  const headings = (text.match(/^#{1,6}\s/gm) || []).length;

  return { paragraphCount: paragraphs.length, listItems, headings };
}

async function performAILinguisticCheck(
  content: { originalText: string; translatedText: string; sourceLanguage: string; targetLanguage: string }
): Promise<{ score: number; issues: QualityIssue[] }> {
  const systemPrompt = `You are an Arabic language quality reviewer. Evaluate the translation quality.
Check for:
1. Semantic accuracy (meaning preservation)
2. Grammar and syntax correctness
3. Terminology consistency
4. Natural fluency in Arabic

Respond with JSON:
{
  "score": <0-100>,
  "issues": [
    {
      "severity": "<critical|major|minor|info>",
      "description": "<English description>",
      "descriptionAr": "<Arabic description>",
      "suggestion": "<English suggestion>",
      "suggestionAr": "<Arabic suggestion>"
    }
  ]
}

Only output JSON.`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Source (${content.sourceLanguage}):\n${content.originalText.substring(0, 2000)}\n\nTranslation (${content.targetLanguage}):\n${content.translatedText.substring(0, 2000)}` },
    ],
    temperature: 0.1,
    max_tokens: 1024,
  });

  const rawOutput = response.choices[0]?.message?.content?.trim() || '';

  try {
    const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { score: 90, issues: [] };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const issues: QualityIssue[] = (parsed.issues || []).map((issue: Record<string, string>) => ({
      severity: (issue.severity || 'minor') as QualityIssue['severity'],
      category: 'ai_review',
      description: issue.description || '',
      descriptionAr: issue.descriptionAr || '',
      location: 'ai_detected',
      suggestion: issue.suggestion || '',
      suggestionAr: issue.suggestionAr || '',
    }));

    return {
      score: Math.min(100, Math.max(0, parsed.score || 90)),
      issues,
    };
  } catch {
    return { score: 90, issues: [] };
  }
}
