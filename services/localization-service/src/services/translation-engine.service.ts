import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import winston from 'winston';
import { createHash, randomUUID } from 'crypto';

const prisma = new PrismaClient();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || 'a0000000-0000-0000-0000-000000000001';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'translation-engine' },
  transports: [new winston.transports.Console()],
});

export const SUPPORTED_LANGUAGES = [
  'ar', 'en', 'fr', 'de', 'es', 'it', 'pt', 'ru', 'zh', 'ja', 'ko', 'tr',
  'nl', 'pl', 'sv', 'da', 'no', 'fi', 'he', 'id', 'ms', 'th', 'vi', 'uk',
  'cs', 'sk', 'ro', 'hu', 'bg', 'hr', 'lt', 'lv', 'et', 'sl', 'sr', 'fa',
  'ur', 'hi', 'bn', 'ta', 'te', 'ml', 'kn', 'gu', 'mr', 'pa', 'ne', 'si',
  'km', 'lo', 'my', 'ka', 'am', 'sw', 'zu', 'yo', 'ig', 'ha',
] as const;

const LANGUAGE_INFO: Record<string, { name: string; nativeName: string; rtl: boolean; direction: 'ltr' | 'rtl' }> = {
  ar: { name: 'Arabic', nativeName: 'العربية', rtl: true, direction: 'rtl' },
  en: { name: 'English', nativeName: 'English', rtl: false, direction: 'ltr' },
  fr: { name: 'French', nativeName: 'Français', rtl: false, direction: 'ltr' },
  de: { name: 'German', nativeName: 'Deutsch', rtl: false, direction: 'ltr' },
  es: { name: 'Spanish', nativeName: 'Español', rtl: false, direction: 'ltr' },
  it: { name: 'Italian', nativeName: 'Italiano', rtl: false, direction: 'ltr' },
  pt: { name: 'Portuguese', nativeName: 'Português', rtl: false, direction: 'ltr' },
  ru: { name: 'Russian', nativeName: 'Русский', rtl: false, direction: 'ltr' },
  zh: { name: 'Chinese', nativeName: '中文', rtl: false, direction: 'ltr' },
  ja: { name: 'Japanese', nativeName: '日本語', rtl: false, direction: 'ltr' },
  ko: { name: 'Korean', nativeName: '한국어', rtl: false, direction: 'ltr' },
  tr: { name: 'Turkish', nativeName: 'Türkçe', rtl: false, direction: 'ltr' },
  nl: { name: 'Dutch', nativeName: 'Nederlands', rtl: false, direction: 'ltr' },
  pl: { name: 'Polish', nativeName: 'Polski', rtl: false, direction: 'ltr' },
  sv: { name: 'Swedish', nativeName: 'Svenska', rtl: false, direction: 'ltr' },
  da: { name: 'Danish', nativeName: 'Dansk', rtl: false, direction: 'ltr' },
  no: { name: 'Norwegian', nativeName: 'Norsk', rtl: false, direction: 'ltr' },
  fi: { name: 'Finnish', nativeName: 'Suomi', rtl: false, direction: 'ltr' },
  he: { name: 'Hebrew', nativeName: 'עברית', rtl: true, direction: 'rtl' },
  id: { name: 'Indonesian', nativeName: 'Bahasa Indonesia', rtl: false, direction: 'ltr' },
  ms: { name: 'Malay', nativeName: 'Bahasa Melayu', rtl: false, direction: 'ltr' },
  th: { name: 'Thai', nativeName: 'ไทย', rtl: false, direction: 'ltr' },
  vi: { name: 'Vietnamese', nativeName: 'Tiếng Việt', rtl: false, direction: 'ltr' },
  uk: { name: 'Ukrainian', nativeName: 'Українська', rtl: false, direction: 'ltr' },
  cs: { name: 'Czech', nativeName: 'Čeština', rtl: false, direction: 'ltr' },
  sk: { name: 'Slovak', nativeName: 'Slovenčina', rtl: false, direction: 'ltr' },
  ro: { name: 'Romanian', nativeName: 'Română', rtl: false, direction: 'ltr' },
  hu: { name: 'Hungarian', nativeName: 'Magyar', rtl: false, direction: 'ltr' },
  bg: { name: 'Bulgarian', nativeName: 'Български', rtl: false, direction: 'ltr' },
  hr: { name: 'Croatian', nativeName: 'Hrvatski', rtl: false, direction: 'ltr' },
  lt: { name: 'Lithuanian', nativeName: 'Lietuvių', rtl: false, direction: 'ltr' },
  lv: { name: 'Latvian', nativeName: 'Latviešu', rtl: false, direction: 'ltr' },
  et: { name: 'Estonian', nativeName: 'Eesti', rtl: false, direction: 'ltr' },
  sl: { name: 'Slovenian', nativeName: 'Slovenščina', rtl: false, direction: 'ltr' },
  sr: { name: 'Serbian', nativeName: 'Српски', rtl: false, direction: 'ltr' },
  fa: { name: 'Persian', nativeName: 'فارسی', rtl: true, direction: 'rtl' },
  ur: { name: 'Urdu', nativeName: 'اردو', rtl: true, direction: 'rtl' },
  hi: { name: 'Hindi', nativeName: 'हिन्दी', rtl: false, direction: 'ltr' },
  bn: { name: 'Bengali', nativeName: 'বাংলা', rtl: false, direction: 'ltr' },
  ta: { name: 'Tamil', nativeName: 'தமிழ்', rtl: false, direction: 'ltr' },
  te: { name: 'Telugu', nativeName: 'తెలుగు', rtl: false, direction: 'ltr' },
  ml: { name: 'Malayalam', nativeName: 'മലയാളം', rtl: false, direction: 'ltr' },
  kn: { name: 'Kannada', nativeName: 'ಕನ್ನಡ', rtl: false, direction: 'ltr' },
  gu: { name: 'Gujarati', nativeName: 'ગુજરાતી', rtl: false, direction: 'ltr' },
  mr: { name: 'Marathi', nativeName: 'मराठी', rtl: false, direction: 'ltr' },
  pa: { name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', rtl: false, direction: 'ltr' },
  ne: { name: 'Nepali', nativeName: 'नेपाली', rtl: false, direction: 'ltr' },
  si: { name: 'Sinhala', nativeName: 'සිංහල', rtl: false, direction: 'ltr' },
  km: { name: 'Khmer', nativeName: 'ខ្មែរ', rtl: false, direction: 'ltr' },
  lo: { name: 'Lao', nativeName: 'ລາວ', rtl: false, direction: 'ltr' },
  my: { name: 'Burmese', nativeName: 'မြန်မာ', rtl: false, direction: 'ltr' },
  ka: { name: 'Georgian', nativeName: 'ქართული', rtl: false, direction: 'ltr' },
  am: { name: 'Amharic', nativeName: 'አማርኛ', rtl: false, direction: 'ltr' },
  sw: { name: 'Swahili', nativeName: 'Kiswahili', rtl: false, direction: 'ltr' },
  zu: { name: 'Zulu', nativeName: 'isiZulu', rtl: false, direction: 'ltr' },
  yo: { name: 'Yoruba', nativeName: 'Yorùbá', rtl: false, direction: 'ltr' },
  ig: { name: 'Igbo', nativeName: 'Igbo', rtl: false, direction: 'ltr' },
  ha: { name: 'Hausa', nativeName: 'Hausa', rtl: false, direction: 'ltr' },
};

function toLanguageEnum(langCode: string): string {
  return langCode.trim().slice(0, 2).toUpperCase();
}

function hashSourceText(text: string): string {
  return createHash('sha256').update(text.trim()).digest('hex');
}

async function loadGlossaryTerms(glossaryId: string): Promise<Array<{ term: string; targetText: string; context: string | null }>> {
  const rows = await prisma.$queryRawUnsafe<Array<{
    term: string;
    translations: unknown;
    context: string | null;
  }>>(
    `
      SELECT
        term,
        translations,
        context
      FROM glossary_terms
      WHERE glossary_id = $1::uuid
      ORDER BY length(term) DESC
    `,
    glossaryId
  );

  return rows
    .map((row) => {
      const translations = row.translations && typeof row.translations === 'object'
        ? row.translations as Record<string, string>
        : {};
      const targetText = translations.default || Object.values(translations)[0] || '';
      return {
        term: row.term,
        targetText,
        context: row.context,
      };
    })
    .filter((row) => row.targetText.length > 0);
}

async function requestTranslation(
  text: string,
  sourceLang: string,
  targetLang: string,
  systemPrompt: string
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ],
    temperature: 0.2,
    max_tokens: Math.max(text.length * 3, 1024),
  });

  const translatedText = response.choices[0]?.message?.content?.trim() || '';
  if (translatedText.length === 0) {
    logger.error('OpenAI returned empty translation');
    throw new Error('Translation failed: empty response from OpenAI');
  }

  return translatedText;
}

export function getLanguageInfo(langCode: string): { code: string; name: string; nativeName: string; rtl: boolean; direction: 'ltr' | 'rtl' } {
  const info = LANGUAGE_INFO[langCode];
  if (!info) {
    throw new Error(`Unsupported language code: ${langCode}. Supported: ${SUPPORTED_LANGUAGES.join(', ')}`);
  }
  return { code: langCode, ...info };
}

export function isLanguageSupported(langCode: string): boolean {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(langCode);
}

export async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string,
  glossaryId?: string
): Promise<{ translatedText: string; sourceLang: string; targetLang: string; glossaryApplied: boolean }> {
  logger.info('translateText called', { sourceLang, targetLang, glossaryId, textLength: text.length });

  const existingMemory = await getTranslationMemory(sourceLang, targetLang, text);
  if (existingMemory.length > 0) {
    logger.info('Translation memory hit, returning cached translation');
    return {
      translatedText: existingMemory[0].targetText,
      sourceLang,
      targetLang,
      glossaryApplied: false,
    };
  }

  const glossaryTerms = glossaryId ? await loadGlossaryTerms(glossaryId) : [];
  const glossaryApplied = glossaryTerms.length > 0;
  const glossaryInstructions = glossaryApplied
    ? `\n\nUse these approved terms exactly when relevant:\n${glossaryTerms.map((term) => `"${term.term}" -> "${term.targetText}"${term.context ? ` (${term.context})` : ''}`).join('\n')}`
    : '';

  const translatedText = await requestTranslation(
    text,
    sourceLang,
    targetLang,
    `You are a professional translator specializing in ${sourceLang} to ${targetLang} translation.
Translate accurately while preserving structure, business meaning, numbers, terminology, and tone.
Prefer professional Modern Standard Arabic when the target language is Arabic.
Output only the translated text.${glossaryInstructions}`
  );

  await addToTranslationMemory(text, translatedText, sourceLang, targetLang);

  logger.info('Translation completed', {
    sourceLang,
    targetLang,
    inputLength: text.length,
    outputLength: translatedText.length,
    glossaryApplied,
  });

  return {
    translatedText,
    sourceLang,
    targetLang,
    glossaryApplied,
  };
}

export async function translateTextWithContext(
  text: string,
  sourceLang: string,
  targetLang: string,
  options?: {
    glossaryId?: string;
    domain?: string;
    toneLevel?: 'formal' | 'executive' | 'governmental' | 'technical' | 'neutral';
    styleGuide?: string;
    preserveLayout?: boolean;
  }
): Promise<{
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  glossaryApplied: boolean;
  contextApplied: boolean;
}> {
  const existingMemory = await getTranslationMemory(sourceLang, targetLang, text);
  if (existingMemory.length > 0) {
    return {
      translatedText: existingMemory[0].targetText,
      sourceLang,
      targetLang,
      glossaryApplied: false,
      contextApplied: true,
    };
  }

  const glossaryTerms = options?.glossaryId ? await loadGlossaryTerms(options.glossaryId) : [];
  const glossaryInstructions = glossaryTerms.length > 0
    ? `\nApproved terminology:\n${glossaryTerms.map((term) => `"${term.term}" -> "${term.targetText}"`).join('\n')}`
    : '';
  const translatedText = await requestTranslation(
    text,
    sourceLang,
    targetLang,
    `You are an Arabic-first localization engine.
Translate from ${sourceLang} to ${targetLang} with domain awareness and visual preservation.
Domain: ${options?.domain || 'general'}
Tone: ${options?.toneLevel || 'formal'}
Preserve layout hints: ${options?.preserveLayout === false ? 'no' : 'yes'}
Style guide: ${options?.styleGuide || 'Use professional, natural wording with consistent terminology.'}
If target language is Arabic, use premium Modern Standard Arabic suitable for product UI and executive documents.
Preserve line breaks, bullet structure, hierarchy, numbers, dates, named entities, and meaning.${glossaryInstructions}
Return only the translated content.`
  );

  await addToTranslationMemory(text, translatedText, sourceLang, targetLang);

  return {
    translatedText,
    sourceLang,
    targetLang,
    glossaryApplied: glossaryTerms.length > 0,
    contextApplied: true,
  };
}

export async function translateDocument(
  documentId: string,
  targetLang: string,
  _tenantId: string,
  _userId: string
): Promise<{ jobId: string; status: string; translatedSegments: number; totalSegments: number }> {
  logger.info('translateDocument called', { documentId, targetLang });

  const extractionRows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    fullText: string | null;
    languages: string[] | null;
  }>>(
    `
      SELECT
        id::text AS id,
        full_text AS "fullText",
        languages
      FROM document_extractions
      WHERE id = $1::uuid OR file_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    documentId
  );

  const extraction = extractionRows[0];
  if (!extraction || !extraction.fullText) {
    throw new Error(`Document extraction with id '${documentId}' not found`);
  }

  const sourceLang = extraction.languages?.[0] || 'en';
  const segments = extraction.fullText
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  const translatedSegments: string[] = [];
  for (const segment of segments) {
    const translated = await translateText(segment, sourceLang, targetLang);
    translatedSegments.push(translated.translatedText);
  }

  return {
    jobId: randomUUID(),
    status: 'completed',
    translatedSegments: translatedSegments.length,
    totalSegments: segments.length,
  };
}

export async function translateBatch(
  texts: string[],
  sourceLang: string,
  targetLang: string
): Promise<{ translations: Array<{ index: number; original: string; translated: string }> }> {
  logger.info('translateBatch called', { count: texts.length, sourceLang, targetLang });

  if (texts.length === 0) {
    throw new Error('Batch translation requires at least one text');
  }

  const numberedItems = texts.map((text, idx) => `[${idx + 1}] ${text}`).join('\n');

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a professional translator.
Translate each numbered item from ${sourceLang} to ${targetLang}.
Keep the same [N] numbering and output only the translated numbered items.`,
      },
      { role: 'user', content: numberedItems },
    ],
    temperature: 0.2,
    max_tokens: Math.max(numberedItems.length * 3, 2048),
  });

  const responseText = response.choices[0]?.message?.content?.trim() || '';
  if (responseText.length === 0) {
    throw new Error('Batch translation failed: empty response from OpenAI');
  }

  const translationMap = new Map<number, string>();
  const linePattern = /\[(\d+)\]\s*(.*)/g;
  let match: RegExpExecArray | null;

  while ((match = linePattern.exec(responseText)) !== null) {
    translationMap.set(parseInt(match[1], 10), match[2].trim());
  }

  const translations = texts.map((original, idx) => ({
    index: idx,
    original,
    translated: translationMap.get(idx + 1) || original,
  }));

  for (const translation of translations) {
    await addToTranslationMemory(translation.original, translation.translated, sourceLang, targetLang);
  }

  logger.info('Batch translation completed', {
    inputCount: texts.length,
    outputCount: translations.length,
  });

  return { translations };
}

export async function detectLanguage(
  text: string
): Promise<{ language: string; confidence: number; script: string }> {
  logger.info('detectLanguage called', { textLength: text.length });

  if (text.trim().length === 0) {
    throw new Error('Cannot detect language of empty text');
  }

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Detect the language of the text and return JSON only:
{"language":"<ISO code>","confidence":0.0,"script":"<script>"}`,
      },
      { role: 'user', content: text.slice(0, 1000) },
    ],
    temperature: 0,
    max_tokens: 128,
  });

  const rawOutput = response.choices[0]?.message?.content?.trim() || '';
  let parsed: { language: string; confidence: number; script: string };

  try {
    parsed = JSON.parse(rawOutput);
  } catch {
    logger.error('Failed to parse language detection response', { rawOutput });
    throw new Error('Language detection failed: could not parse OpenAI response');
  }

  return {
    language: String(parsed.language || 'unknown'),
    confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
    script: String(parsed.script || 'Unknown'),
  };
}

export async function getTranslationMemory(
  sourceLang: string,
  targetLang: string,
  text: string
): Promise<Array<{ sourceText: string; targetText: string; similarity: number; createdAt: Date }>> {
  logger.info('getTranslationMemory called', { sourceLang, targetLang, textLength: text.length });

  const sourceLanguage = toLanguageEnum(sourceLang);
  const targetLanguage = toLanguageEnum(targetLang);
  const trimmed = text.trim();

  const exactMatches = await prisma.$queryRawUnsafe<Array<{
    sourceText: string;
    targetText: string;
    createdAt: Date;
  }>>(
    `
      SELECT
        source_text AS "sourceText",
        translated_text AS "targetText",
        created_at AS "createdAt"
      FROM translation_memory
      WHERE upper(source_lang) = $1
        AND upper(target_lang) = $2
        AND source_text = $3
      ORDER BY usage_count DESC, created_at DESC
      LIMIT 5
    `,
    sourceLanguage,
    targetLanguage,
    trimmed
  );

  if (exactMatches.length > 0) {
    return exactMatches.map((match) => ({
      sourceText: match.sourceText,
      targetText: match.targetText,
      similarity: 1,
      createdAt: match.createdAt,
    }));
  }

  const words = trimmed.toLowerCase().split(/\s+/).filter((word) => word.length > 3).slice(0, 5);
  if (words.length === 0) {
    return [];
  }

  const fuzzyMatches = await prisma.$queryRawUnsafe<Array<{
    sourceText: string;
    targetText: string;
    createdAt: Date;
  }>>(
    `
      SELECT
        source_text AS "sourceText",
        translated_text AS "targetText",
        created_at AS "createdAt"
      FROM translation_memory
      WHERE upper(source_lang) = $1
        AND upper(target_lang) = $2
        AND (${words.map((_word, index) => `source_text ILIKE $${index + 3}`).join(' OR ')})
      ORDER BY usage_count DESC, created_at DESC
      LIMIT 10
    `,
    sourceLanguage,
    targetLanguage,
    ...words.map((word) => `%${word}%`)
  );

  const inputWords = new Set(trimmed.toLowerCase().split(/\s+/));

  return fuzzyMatches
    .map((match) => {
      const sourceWords = new Set(match.sourceText.toLowerCase().split(/\s+/));
      const intersection = [...sourceWords].filter((word) => inputWords.has(word));
      const union = new Set([...sourceWords, ...inputWords]);
      const similarity = union.size > 0 ? intersection.length / union.size : 0;

      return {
        sourceText: match.sourceText,
        targetText: match.targetText,
        similarity: Math.round(similarity * 100) / 100,
        createdAt: match.createdAt,
      };
    })
    .filter((match) => match.similarity >= 0.3)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, 5);
}

export async function addToTranslationMemory(
  source: string,
  target: string,
  sourceLang: string,
  targetLang: string
): Promise<{ id: string; sourceText: string; targetText: string; sourceLang: string; targetLang: string }> {
  logger.info('addToTranslationMemory called', { sourceLang, targetLang });

  const trimmedSource = source.trim();
  const trimmedTarget = target.trim();
  if (trimmedSource.length === 0 || trimmedTarget.length === 0) {
    throw new Error('Source and target text must not be empty');
  }

  const sourceLanguage = toLanguageEnum(sourceLang);
  const targetLanguage = toLanguageEnum(targetLang);

  const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `
      SELECT id::text AS id
      FROM translation_memory
      WHERE source_text = $1
        AND translated_text = $2
        AND upper(source_lang) = $3
        AND upper(target_lang) = $4
      LIMIT 1
    `,
    trimmedSource,
    trimmedTarget,
    sourceLanguage,
    targetLanguage
  );

  if (existing.length > 0) {
    await prisma.$executeRawUnsafe(
      `
        UPDATE translation_memory
        SET usage_count = COALESCE(usage_count, 0) + 1,
            updated_at = NOW()
        WHERE id = $1::uuid
      `,
      existing[0].id
    );

    return {
      id: existing[0].id,
      sourceText: trimmedSource,
      targetText: trimmedTarget,
      sourceLang,
      targetLang,
    };
  }

  const inserted = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `
      INSERT INTO translation_memory (
        id,
        source_text,
        translated_text,
        source_lang,
        target_lang,
        domain,
        quality_score,
        usage_count,
        tenant_id,
        created_at,
        updated_at
      )
      VALUES (
        $1::uuid,
        $2,
        $3,
        lower($4),
        lower($5),
        'general',
        0.95,
        1,
        $6::uuid,
        NOW(),
        NOW()
      )
      RETURNING id::text AS id
    `,
    randomUUID(),
    trimmedSource,
    trimmedTarget,
    sourceLanguage,
    targetLanguage,
    DEFAULT_TENANT_ID
  );

  return {
    id: inserted[0].id,
    sourceText: trimmedSource,
    targetText: trimmedTarget,
    sourceLang,
    targetLang,
  };
}
