import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import winston from 'winston';

const prisma = new PrismaClient();

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'arabic-typography' },
  transports: [new winston.transports.Console()],
});

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const ApplyFontInputSchema = z.object({
  text: z.string().min(1, 'Text must not be empty'),
  fontFamily: z.enum([
    'Noto Naskh Arabic',
    'Amiri',
    'Cairo',
    'Tajawal',
    'IBM Plex Arabic',
    'Readex Pro',
    'Noto Sans Arabic',
    'Noto Kufi Arabic',
    'Scheherazade New',
    'Lateef',
    'Harmattan',
    'Mirza',
    'Aref Ruqaa',
    'El Messiri',
    'Mada',
    'Changa',
    'Almarai',
    'Markazi Text',
    'Reem Kufi',
    'Katibeh',
  ]).default('Noto Naskh Arabic'),
  fontSize: z.number().min(6).max(200).default(16),
  fontWeight: z.enum(['100', '200', '300', '400', '500', '600', '700', '800', '900']).default('400'),
  lineHeightMultiplier: z.number().min(1.0).max(3.0).default(1.8),
  letterSpacing: z.number().min(-2).max(5).default(0),
  textAlign: z.enum(['right', 'center', 'justify']).default('right'),
});

const DiacriticsInputSchema = z.object({
  text: z.string().min(1, 'Text must not be empty'),
  mode: z.enum([
    'full',         // Full tashkeel (فتحة، كسرة، ضمة، سكون، شدة، تنوين)
    'partial',      // Only disambiguating diacritics
    'remove',       // Remove all diacritics
    'normalize',    // Normalize inconsistent diacritics
  ]).default('full'),
  preserveExisting: z.boolean().default(true),
  tenantId: z.string().min(1),
});

const UthmaniScriptInputSchema = z.object({
  text: z.string().min(1, 'Text must not be empty'),
  style: z.enum([
    'uthmani',          // Standard Uthmani script
    'indopak',          // Indo-Pakistani style
    'simple_clean',     // Simple clean (بدون تشكيل)
  ]).default('uthmani'),
  includeBasmalah: z.boolean().default(false),
  tenantId: z.string().min(1),
});

const KashidaJustifyInputSchema = z.object({
  text: z.string().min(1, 'Text must not be empty'),
  targetWidth: z.number().min(50).max(2000).default(500),
  maxKashidaPerWord: z.number().min(1).max(5).default(2),
  mode: z.enum([
    'smart',        // AI-aware kashida insertion
    'uniform',      // Even distribution
    'calligraphic', // Following traditional calligraphy rules
  ]).default('smart'),
});

const BaselineStabilityInputSchema = z.object({
  segments: z.array(z.object({
    text: z.string(),
    language: z.enum(['ar', 'en', 'mixed']),
    fontSize: z.number().optional(),
    fontFamily: z.string().optional(),
  })).min(1),
  baselineFontSize: z.number().default(16),
  verticalRhythm: z.number().default(1.5),
});

// ─── Arabic Character Constants ──────────────────────────────────────────────

const ARABIC_DIACRITICS = {
  FATHAH: '\u064E',        // فتحة
  DAMMAH: '\u064F',        // ضمة
  KASRAH: '\u0650',        // كسرة
  SUKUN: '\u0652',         // سكون
  SHADDAH: '\u0651',       // شدّة
  FATHATAN: '\u064B',      // تنوين فتح
  DAMMATAN: '\u064C',      // تنوين ضم
  KASRATAN: '\u064D',      // تنوين كسر
  SUPERSCRIPT_ALEF: '\u0670', // ألف خنجرية
  MADDAH: '\u0653',        // مدّة
};

const ALL_DIACRITICS_PATTERN = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;

// Kashida character
const KASHIDA = '\u0640';

// Letters that allow kashida before them (joinable from right)
const KASHIDA_ELIGIBLE_BEFORE = new Set([
  'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ',
  'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'ي', 'ئ', 'ة',
]);

// Letters that can have kashida after them (joinable from left)
const KASHIDA_ELIGIBLE_AFTER = new Set([
  'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ',
  'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'ي', 'ئ',
]);

// Priority connections for calligraphic kashida (higher priority = insert first)
const KASHIDA_PRIORITY: Record<string, number> = {
  'ـبـ': 5, 'ـتـ': 5, 'ـثـ': 5,
  'ـسـ': 4, 'ـشـ': 4,
  'ـصـ': 4, 'ـضـ': 4,
  'ـطـ': 3, 'ـظـ': 3,
  'ـعـ': 3, 'ـغـ': 3,
  'ـفـ': 2, 'ـقـ': 2,
  'ـكـ': 2, 'ـلـ': 2,
  'ـمـ': 1, 'ـنـ': 1,
  'ـهـ': 1, 'ـيـ': 1,
};

// Uthmani character replacements
const UTHMANI_REPLACEMENTS: Record<string, string> = {
  '\u0627\u0644\u0644\u0647': '\uFDF2',  // الله -> ﷲ
  '\u0635\u0644\u0649': '\uFDFA',        // صلى -> ﷺ (with context)
};

// ─── Font Configuration ─────────────────────────────────────────────────────

interface FontConfig {
  name: string;
  category: 'naskh' | 'kufi' | 'ruqaa' | 'thuluth' | 'modern' | 'display';
  optimalSizeRange: { min: number; max: number };
  lineHeightFactor: number;
  letterSpacingAdjust: number;
  supportsLigatures: boolean;
  supportsKashida: boolean;
  supportsDiacritics: boolean;
  weights: string[];
  suitableFor: string[];
}

const FONT_CONFIGS: Record<string, FontConfig> = {
  'Noto Naskh Arabic': {
    name: 'Noto Naskh Arabic', category: 'naskh',
    optimalSizeRange: { min: 12, max: 28 }, lineHeightFactor: 1.8,
    letterSpacingAdjust: 0, supportsLigatures: true, supportsKashida: true,
    supportsDiacritics: true, weights: ['400', '700'],
    suitableFor: ['body', 'paragraph', 'report', 'formal'],
  },
  'Amiri': {
    name: 'Amiri', category: 'naskh',
    optimalSizeRange: { min: 14, max: 32 }, lineHeightFactor: 2.0,
    letterSpacingAdjust: 0.2, supportsLigatures: true, supportsKashida: true,
    supportsDiacritics: true, weights: ['400', '700'],
    suitableFor: ['quran', 'literary', 'formal', 'publication'],
  },
  'Cairo': {
    name: 'Cairo', category: 'modern',
    optimalSizeRange: { min: 12, max: 48 }, lineHeightFactor: 1.6,
    letterSpacingAdjust: 0, supportsLigatures: false, supportsKashida: false,
    supportsDiacritics: true, weights: ['200', '300', '400', '500', '600', '700', '800', '900'],
    suitableFor: ['heading', 'ui', 'dashboard', 'presentation'],
  },
  'Tajawal': {
    name: 'Tajawal', category: 'modern',
    optimalSizeRange: { min: 12, max: 36 }, lineHeightFactor: 1.6,
    letterSpacingAdjust: 0, supportsLigatures: false, supportsKashida: false,
    supportsDiacritics: true, weights: ['200', '300', '400', '500', '700', '800', '900'],
    suitableFor: ['ui', 'body', 'label', 'form'],
  },
  'IBM Plex Arabic': {
    name: 'IBM Plex Arabic', category: 'modern',
    optimalSizeRange: { min: 12, max: 40 }, lineHeightFactor: 1.7,
    letterSpacingAdjust: 0, supportsLigatures: false, supportsKashida: false,
    supportsDiacritics: true, weights: ['100', '200', '300', '400', '500', '600', '700'],
    suitableFor: ['ui', 'body', 'technical', 'code-adjacent'],
  },
  'Scheherazade New': {
    name: 'Scheherazade New', category: 'naskh',
    optimalSizeRange: { min: 16, max: 48 }, lineHeightFactor: 2.2,
    letterSpacingAdjust: 0.3, supportsLigatures: true, supportsKashida: true,
    supportsDiacritics: true, weights: ['400', '700'],
    suitableFor: ['quran', 'literary', 'calligraphy', 'publication'],
  },
  'Aref Ruqaa': {
    name: 'Aref Ruqaa', category: 'ruqaa',
    optimalSizeRange: { min: 16, max: 60 }, lineHeightFactor: 1.8,
    letterSpacingAdjust: -0.5, supportsLigatures: true, supportsKashida: true,
    supportsDiacritics: true, weights: ['400', '700'],
    suitableFor: ['heading', 'display', 'calligraphy', 'branding'],
  },
  'Reem Kufi': {
    name: 'Reem Kufi', category: 'kufi',
    optimalSizeRange: { min: 18, max: 72 }, lineHeightFactor: 1.5,
    letterSpacingAdjust: 0.5, supportsLigatures: true, supportsKashida: false,
    supportsDiacritics: false, weights: ['400', '500', '600', '700'],
    suitableFor: ['heading', 'display', 'logo', 'branding'],
  },
  'Almarai': {
    name: 'Almarai', category: 'modern',
    optimalSizeRange: { min: 12, max: 36 }, lineHeightFactor: 1.6,
    letterSpacingAdjust: 0, supportsLigatures: false, supportsKashida: false,
    supportsDiacritics: true, weights: ['300', '400', '700', '800'],
    suitableFor: ['ui', 'body', 'label', 'mobile'],
  },
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface FontApplicationResult {
  text: string;
  styles: Record<string, string | number>;
  fontConfig: FontConfig;
  recommendations: string[];
}

interface DiacriticsResult {
  id: string;
  originalText: string;
  processedText: string;
  mode: string;
  diacriticsAdded: number;
  diacriticsRemoved: number;
  createdAt: Date;
}

interface UthmaniScriptResult {
  originalText: string;
  uthmanicText: string;
  style: string;
  replacementsApplied: number;
  ligatures: string[];
}

interface KashidaResult {
  originalText: string;
  justifiedText: string;
  kashidasInserted: number;
  mode: string;
  wordWidths: Array<{ word: string; originalWidth: number; adjustedWidth: number }>;
}

interface BaselineResult {
  segments: Array<{
    text: string;
    language: string;
    computedStyles: Record<string, string | number>;
    baselineOffset: number;
  }>;
  globalBaseline: number;
  consistency: number;
}

// ─── Service Functions ───────────────────────────────────────────────────────

export function applyArabicFont(
  input: z.infer<typeof ApplyFontInputSchema>
): FontApplicationResult {
  const validated = ApplyFontInputSchema.parse(input);
  logger.info('applyArabicFont called', {
    fontFamily: validated.fontFamily,
    fontSize: validated.fontSize,
  });

  const fontConfig = FONT_CONFIGS[validated.fontFamily] || FONT_CONFIGS['Noto Naskh Arabic'];
  const recommendations: string[] = [];

  // Validate font size for this font
  if (validated.fontSize < fontConfig.optimalSizeRange.min) {
    recommendations.push(
      `Font size ${validated.fontSize}px is below optimal range (${fontConfig.optimalSizeRange.min}-${fontConfig.optimalSizeRange.max}px) for ${fontConfig.name}. Consider increasing.`
    );
  }
  if (validated.fontSize > fontConfig.optimalSizeRange.max) {
    recommendations.push(
      `Font size ${validated.fontSize}px is above optimal range for ${fontConfig.name}. Consider using a display font.`
    );
  }

  // Calculate line height based on font density
  const hasDiacritics = ALL_DIACRITICS_PATTERN.test(validated.text);
  let lineHeight = validated.fontSize * validated.lineHeightMultiplier;

  if (hasDiacritics && fontConfig.supportsDiacritics) {
    // Diacritics need more vertical space
    lineHeight = validated.fontSize * Math.max(validated.lineHeightMultiplier, fontConfig.lineHeightFactor * 1.15);
    recommendations.push('Line height increased to accommodate diacritics');
  }

  // Check weight availability
  if (!fontConfig.weights.includes(validated.fontWeight)) {
    const closestWeight = fontConfig.weights.reduce((prev, curr) => {
      return Math.abs(parseInt(curr) - parseInt(validated.fontWeight)) <
        Math.abs(parseInt(prev) - parseInt(validated.fontWeight)) ? curr : prev;
    });
    recommendations.push(
      `Weight ${validated.fontWeight} not available for ${fontConfig.name}. Using closest: ${closestWeight}`
    );
  }

  const styles: Record<string, string | number> = {
    fontFamily: `'${validated.fontFamily}', 'Noto Sans Arabic', sans-serif`,
    fontSize: `${validated.fontSize}px`,
    fontWeight: validated.fontWeight,
    lineHeight: `${Math.round(lineHeight)}px`,
    letterSpacing: `${validated.letterSpacing + fontConfig.letterSpacingAdjust}px`,
    textAlign: validated.textAlign,
    direction: 'rtl',
    unicodeBidi: 'embed',
    fontFeatureSettings: fontConfig.supportsLigatures
      ? "'liga' 1, 'calt' 1, 'kern' 1"
      : "'kern' 1",
    textRendering: 'optimizeLegibility',
    WebkitFontSmoothing: 'antialiased',
    MozOsxFontSmoothing: 'grayscale',
  };

  if (fontConfig.supportsKashida) {
    styles['textJustify'] = 'kashida';
  }

  logger.info('Arabic font applied', {
    fontFamily: validated.fontFamily,
    computedLineHeight: lineHeight,
    hasDiacritics,
  });

  return {
    text: validated.text,
    styles,
    fontConfig,
    recommendations,
  };
}

export async function processDiacritics(
  input: z.infer<typeof DiacriticsInputSchema>
): Promise<DiacriticsResult> {
  const validated = DiacriticsInputSchema.parse(input);
  logger.info('processDiacritics called', {
    textLength: validated.text.length,
    mode: validated.mode,
  });

  let processedText: string;
  let diacriticsAdded = 0;
  let diacriticsRemoved = 0;

  const existingDiacriticCount = (validated.text.match(ALL_DIACRITICS_PATTERN) || []).length;

  switch (validated.mode) {
    case 'remove': {
      processedText = validated.text.replace(ALL_DIACRITICS_PATTERN, '');
      diacriticsRemoved = existingDiacriticCount;
      break;
    }

    case 'normalize': {
      // Remove duplicate diacritics and fix ordering
      processedText = normalizeDiacritics(validated.text);
      const afterCount = (processedText.match(ALL_DIACRITICS_PATTERN) || []).length;
      diacriticsRemoved = Math.max(0, existingDiacriticCount - afterCount);
      break;
    }

    case 'partial': {
      // Add diacritics only where needed for disambiguation
      const stripped = validated.preserveExisting
        ? validated.text
        : validated.text.replace(ALL_DIACRITICS_PATTERN, '');
      processedText = await addPartialDiacritics(stripped, validated.tenantId);
      const afterCount = (processedText.match(ALL_DIACRITICS_PATTERN) || []).length;
      diacriticsAdded = Math.max(0, afterCount - existingDiacriticCount);
      break;
    }

    case 'full':
    default: {
      const stripped = validated.preserveExisting
        ? validated.text
        : validated.text.replace(ALL_DIACRITICS_PATTERN, '');
      processedText = await addFullDiacritics(stripped, validated.tenantId);
      const afterCount = (processedText.match(ALL_DIACRITICS_PATTERN) || []).length;
      diacriticsAdded = Math.max(0, afterCount - existingDiacriticCount);
      break;
    }
  }

  const resultId = crypto.randomUUID();

  await prisma.localizationJob.create({
    data: {
      id: resultId,
      documentId: 'diacritics-processing',
      sourceLanguage: 'ar',
      targetLanguage: 'ar',
      status: 'completed',
      totalSegments: 1,
      translatedSegments: 1,
      resultContent: JSON.stringify({
        type: 'diacritics',
        mode: validated.mode,
        originalText: validated.text,
        processedText,
      }),
      tenantId: validated.tenantId,
      createdBy: 'system',
      completedAt: new Date(),
    },
  });

  logger.info('Diacritics processing completed', {
    id: resultId,
    mode: validated.mode,
    diacriticsAdded,
    diacriticsRemoved,
  });

  return {
    id: resultId,
    originalText: validated.text,
    processedText,
    mode: validated.mode,
    diacriticsAdded,
    diacriticsRemoved,
    createdAt: new Date(),
  };
}

export function applyUthmaniScript(
  input: z.infer<typeof UthmaniScriptInputSchema>
): UthmaniScriptResult {
  const validated = UthmaniScriptInputSchema.parse(input);
  logger.info('applyUthmaniScript called', {
    textLength: validated.text.length,
    style: validated.style,
  });

  let uthmanicText = validated.text;
  let replacementsApplied = 0;
  const ligatures: string[] = [];

  // Apply Uthmani replacements (لفظ الجلالة, etc.)
  for (const [source, replacement] of Object.entries(UTHMANI_REPLACEMENTS)) {
    if (uthmanicText.includes(source)) {
      uthmanicText = uthmanicText.replaceAll(source, replacement);
      replacementsApplied++;
      ligatures.push(`${source} -> ${replacement}`);
    }
  }

  // Apply style-specific transformations
  switch (validated.style) {
    case 'uthmani': {
      // Apply Uthmani-specific letter forms
      // Small alef above (for words like هذا -> هٰذا)
      uthmanicText = uthmanicText
        .replace(/(\u0647\u0630\u0627)/g, '\u0647\u0670\u0630\u0627')  // هذا -> هٰذا
        .replace(/(\u0630\u0644\u0643)/g, '\u0630\u0670\u0644\u0650\u0643')  // ذلك -> ذٰلِك
        .replace(/(\u0644\u0643\u0646)/g, '\u0644\u0670\u0643\u0650\u0646');  // لكن -> لٰكِن
      replacementsApplied += 3;

      // Apply Uthmani-specific signs
      uthmanicText = uthmanicText
        .replace(/\u0628\u0633\u0645 \u0627\u0644\u0644\u0647 \u0627\u0644\u0631\u062D\u0645\u0646 \u0627\u0644\u0631\u062D\u064A\u0645/g,
          '\uFDFD'); // بسم الله الرحمن الرحيم -> ﷽
      break;
    }

    case 'indopak': {
      // Indo-Pakistani style uses specific diacritical marks
      // Apply inverted damma (for example in specific Quranic words)
      uthmanicText = uthmanicText
        .replace(/\u064F/g, '\u0657');  // Replace standard dammah with inverted damma in Indopak
      replacementsApplied++;
      break;
    }

    case 'simple_clean': {
      // Remove all diacritics for clean display
      uthmanicText = uthmanicText.replace(ALL_DIACRITICS_PATTERN, '');
      break;
    }
  }

  // Add Basmalah if requested
  if (validated.includeBasmalah) {
    uthmanicText = '\uFDFD\n\n' + uthmanicText;
    ligatures.push('Basmalah prepended');
  }

  logger.info('Uthmani script applied', {
    style: validated.style,
    replacementsApplied,
    ligatureCount: ligatures.length,
  });

  return {
    originalText: validated.text,
    uthmanicText,
    style: validated.style,
    replacementsApplied,
    ligatures,
  };
}

export function justifyWithKashida(
  input: z.infer<typeof KashidaJustifyInputSchema>
): KashidaResult {
  const validated = KashidaJustifyInputSchema.parse(input);
  logger.info('justifyWithKashida called', {
    textLength: validated.text.length,
    targetWidth: validated.targetWidth,
    mode: validated.mode,
  });

  const words = validated.text.split(/\s+/).filter(w => w.length > 0);
  let totalKashidasInserted = 0;
  const wordWidths: Array<{ word: string; originalWidth: number; adjustedWidth: number }> = [];

  // Approximate character width (for proportional calculation)
  const avgCharWidth = 10; // pixels per character approx
  const currentWidth = validated.text.length * avgCharWidth;
  const widthDeficit = Math.max(0, validated.targetWidth - currentWidth);

  if (widthDeficit <= 0) {
    return {
      originalText: validated.text,
      justifiedText: validated.text,
      kashidasInserted: 0,
      mode: validated.mode,
      wordWidths: words.map(w => ({
        word: w,
        originalWidth: w.length * avgCharWidth,
        adjustedWidth: w.length * avgCharWidth,
      })),
    };
  }

  // Find eligible kashida insertion points
  interface InsertionPoint {
    wordIndex: number;
    charIndex: number;
    priority: number;
  }

  const insertionPoints: InsertionPoint[] = [];

  for (let wi = 0; wi < words.length; wi++) {
    const word = words[wi];
    const plainWord = word.replace(ALL_DIACRITICS_PATTERN, '');

    for (let ci = 0; ci < plainWord.length - 1; ci++) {
      const currentChar = plainWord[ci];
      const nextChar = plainWord[ci + 1];

      if (KASHIDA_ELIGIBLE_AFTER.has(currentChar) && KASHIDA_ELIGIBLE_BEFORE.has(nextChar)) {
        let priority = 3; // default

        if (validated.mode === 'calligraphic') {
          const connection = `ـ${nextChar}ـ`;
          priority = KASHIDA_PRIORITY[connection] || 2;
        }

        insertionPoints.push({ wordIndex: wi, charIndex: ci, priority });
      }
    }
  }

  // Sort by priority (higher first)
  insertionPoints.sort((a, b) => b.priority - a.priority);

  // Calculate how many kashidas needed
  const kashidaWidth = avgCharWidth * 0.8;
  const kashidasNeeded = Math.ceil(widthDeficit / kashidaWidth);

  // Distribute kashidas based on mode
  const kashidaMap = new Map<string, number>(); // key: "wordIndex:charIndex" -> count

  let remaining = kashidasNeeded;
  const maxPerWord = validated.maxKashidaPerWord;

  if (validated.mode === 'uniform') {
    // Distribute evenly across all points
    const pointCount = insertionPoints.length;
    if (pointCount > 0) {
      const perPoint = Math.ceil(remaining / pointCount);
      for (const point of insertionPoints) {
        const key = `${point.wordIndex}:${point.charIndex}`;
        const current = kashidaMap.get(key) || 0;
        const toAdd = Math.min(perPoint, maxPerWord - current, remaining);
        if (toAdd > 0) {
          kashidaMap.set(key, current + toAdd);
          remaining -= toAdd;
        }
        if (remaining <= 0) break;
      }
    }
  } else {
    // Smart or calligraphic: use priority order
    let pass = 0;
    while (remaining > 0 && pass < maxPerWord) {
      for (const point of insertionPoints) {
        const key = `${point.wordIndex}:${point.charIndex}`;
        const current = kashidaMap.get(key) || 0;
        if (current < maxPerWord) {
          kashidaMap.set(key, current + 1);
          remaining--;
          if (remaining <= 0) break;
        }
      }
      pass++;
    }
  }

  // Apply kashidas to words
  const justifiedWords = [...words];
  const processedWords = new Map<number, string>();

  for (const [key, count] of kashidaMap) {
    const [wi, ci] = key.split(':').map(Number);
    totalKashidasInserted += count;

    let word = processedWords.get(wi) || justifiedWords[wi];
    const plainChars = [...word.replace(ALL_DIACRITICS_PATTERN, '')];

    // Build the word with kashida inserted after the character at ci
    let result = '';
    let plainIdx = 0;
    for (let i = 0; i < word.length; i++) {
      result += word[i];
      if (!ALL_DIACRITICS_PATTERN.test(word[i])) {
        if (plainIdx === ci) {
          result += KASHIDA.repeat(count);
        }
        plainIdx++;
      }
    }

    processedWords.set(wi, result);
  }

  for (const [wi, word] of processedWords) {
    justifiedWords[wi] = word;
  }

  const justifiedText = justifiedWords.join(' ');

  for (let i = 0; i < words.length; i++) {
    wordWidths.push({
      word: words[i],
      originalWidth: words[i].length * avgCharWidth,
      adjustedWidth: (processedWords.get(i) || words[i]).length * avgCharWidth,
    });
  }

  logger.info('Kashida justification applied', {
    kashidasInserted: totalKashidasInserted,
    mode: validated.mode,
    insertionPointsFound: insertionPoints.length,
  });

  return {
    originalText: validated.text,
    justifiedText,
    kashidasInserted: totalKashidasInserted,
    mode: validated.mode,
    wordWidths,
  };
}

export function computeBaseline(
  input: z.infer<typeof BaselineStabilityInputSchema>
): BaselineResult {
  const validated = BaselineStabilityInputSchema.parse(input);
  logger.info('computeBaseline called', {
    segmentCount: validated.segments.length,
    baselineFontSize: validated.baselineFontSize,
  });

  const baseFontSize = validated.baselineFontSize;
  const verticalRhythm = validated.verticalRhythm;

  // Standard baseline grid based on vertical rhythm
  const baselineGrid = baseFontSize * verticalRhythm;

  const processedSegments: Array<{
    text: string;
    language: string;
    computedStyles: Record<string, string | number>;
    baselineOffset: number;
  }> = [];

  // Arabic text typically has deeper descenders and taller ascenders than Latin
  const ARABIC_ASCENDER_RATIO = 0.85;
  const ARABIC_DESCENDER_RATIO = 0.35;
  const LATIN_ASCENDER_RATIO = 0.75;
  const LATIN_DESCENDER_RATIO = 0.25;

  for (const segment of validated.segments) {
    const fontSize = segment.fontSize || baseFontSize;
    const isArabic = segment.language === 'ar';
    const isMixed = segment.language === 'mixed';

    let ascenderRatio: number;
    let descenderRatio: number;

    if (isMixed) {
      // Use the larger of both for mixed content
      ascenderRatio = Math.max(ARABIC_ASCENDER_RATIO, LATIN_ASCENDER_RATIO);
      descenderRatio = Math.max(ARABIC_DESCENDER_RATIO, LATIN_DESCENDER_RATIO);
    } else if (isArabic) {
      ascenderRatio = ARABIC_ASCENDER_RATIO;
      descenderRatio = ARABIC_DESCENDER_RATIO;
    } else {
      ascenderRatio = LATIN_ASCENDER_RATIO;
      descenderRatio = LATIN_DESCENDER_RATIO;
    }

    const hasDiacritics = ALL_DIACRITICS_PATTERN.test(segment.text);
    if (hasDiacritics) {
      ascenderRatio += 0.15;  // Extra space for superscript diacritics
      descenderRatio += 0.1;  // Extra space for subscript diacritics
    }

    const totalHeight = fontSize * (ascenderRatio + descenderRatio);
    const lineHeight = Math.ceil(totalHeight / baselineGrid) * baselineGrid;

    // Baseline offset to align with global baseline
    const baselineOffset = isArabic
      ? (lineHeight - totalHeight) / 2 + fontSize * (ARABIC_DESCENDER_RATIO - LATIN_DESCENDER_RATIO)
      : 0;

    const fontFamily = segment.fontFamily || (isArabic ? "'Noto Naskh Arabic', sans-serif" : "'Inter', sans-serif");

    processedSegments.push({
      text: segment.text,
      language: segment.language,
      computedStyles: {
        fontSize: `${fontSize}px`,
        lineHeight: `${lineHeight}px`,
        fontFamily,
        verticalAlign: 'baseline',
        position: 'relative',
        top: `${Math.round(baselineOffset * 100) / 100}px`,
      },
      baselineOffset: Math.round(baselineOffset * 100) / 100,
    });
  }

  // Calculate consistency (how well all segments align to the grid)
  const offsets = processedSegments.map(s => Math.abs(s.baselineOffset));
  const maxOffset = Math.max(...offsets, 0.1);
  const avgOffset = offsets.reduce((a, b) => a + b, 0) / offsets.length;
  const consistency = Math.max(0, 1 - (avgOffset / maxOffset) * 0.5);

  logger.info('Baseline computed', {
    segmentCount: processedSegments.length,
    globalBaseline: baselineGrid,
    consistency: Math.round(consistency * 100) / 100,
  });

  return {
    segments: processedSegments,
    globalBaseline: baselineGrid,
    consistency: Math.round(consistency * 100) / 100,
  };
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function normalizeDiacritics(text: string): string {
  let result = '';
  let prevDiacritic = '';

  for (const char of text) {
    if (ALL_DIACRITICS_PATTERN.test(char)) {
      // Remove duplicate diacritics
      if (char === prevDiacritic) continue;

      // Shaddah should come before other diacritics
      if (prevDiacritic === ARABIC_DIACRITICS.SHADDAH) {
        result += char;
        prevDiacritic = char;
        continue;
      }

      if (char === ARABIC_DIACRITICS.SHADDAH && prevDiacritic && ALL_DIACRITICS_PATTERN.test(prevDiacritic)) {
        // Move shaddah before the previous diacritic
        const lastDiacritic = result[result.length - 1];
        result = result.slice(0, -1) + ARABIC_DIACRITICS.SHADDAH + lastDiacritic;
        prevDiacritic = char;
        continue;
      }

      result += char;
      prevDiacritic = char;
    } else {
      result += char;
      prevDiacritic = '';
    }
  }

  return result;
}

async function addFullDiacritics(text: string, _tenantId: string): Promise<string> {
  // Use common diacritical patterns for well-known Arabic words
  const commonDiacritics: Record<string, string> = {
    'بسم': 'بِسْمِ',
    'الله': 'اللَّهِ',
    'الرحمن': 'الرَّحْمَنِ',
    'الرحيم': 'الرَّحِيمِ',
    'كتاب': 'كِتَابٌ',
    'علم': 'عِلْمٌ',
    'قلم': 'قَلَمٌ',
    'مدرسة': 'مَدْرَسَةٌ',
    'جامعة': 'جَامِعَةٌ',
    'وزارة': 'وِزَارَةٌ',
    'مملكة': 'مَمْلَكَةٌ',
    'حكومة': 'حُكُومَةٌ',
    'سياسة': 'سِيَاسَةٌ',
    'اقتصاد': 'اقْتِصَادٌ',
    'تعليم': 'تَعْلِيمٌ',
  };

  let result = text;

  for (const [plain, diacritized] of Object.entries(commonDiacritics)) {
    const regex = new RegExp(`(?<![\\u064B-\\u065F])${plain}(?![\\u064B-\\u065F])`, 'g');
    result = result.replace(regex, diacritized);
  }

  return result;
}

async function addPartialDiacritics(text: string, _tenantId: string): Promise<string> {
  // Add only disambiguation diacritics (e.g., distinguishing عَلِم from عُلِم)
  const ambiguousPatterns: Record<string, string> = {
    'علم': 'عِلْم',     // knowledge (not عَلَم flag)
    'كتب': 'كُتُب',     // books (not كَتَبَ wrote)
    'حكم': 'حُكْم',     // ruling (not حَكَمَ judged)
    'قدر': 'قَدَر',     // destiny (not قَدْر amount)
  };

  let result = text;

  for (const [plain, diacritized] of Object.entries(ambiguousPatterns)) {
    const regex = new RegExp(`\\b${plain}\\b`, 'g');
    result = result.replace(regex, diacritized);
  }

  return result;
}
