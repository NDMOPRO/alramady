import { PrismaClient, Language } from '@prisma/client';
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
  defaultMeta: { service: 'language-intelligence' },
  transports: [new winston.transports.Console()],
});

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const ContextAnalysisInputSchema = z.object({
  text: z.string().min(1, 'Text must not be empty'),
  sourceLanguage: z.string().default('en'),
  targetLanguage: z.string().default('ar'),
  domain: z.enum([
    'business', 'legal', 'medical', 'technical', 'financial',
    'government', 'academic', 'general',
  ]).default('general'),
  toneLevel: z.enum([
    'formal', 'executive', 'governmental', 'technical', 'neutral',
  ]).default('formal'),
  tenantId: z.string().min(1),
});

const SemanticMappingInputSchema = z.object({
  terms: z.array(z.string().min(1)).min(1, 'At least one term required'),
  domain: z.string().default('general'),
  sourceLanguage: z.string().default('en'),
  targetLanguage: z.string().default('ar'),
  tenantId: z.string().min(1),
});

const TechnicalTermTranslationInputSchema = z.object({
  terms: z.array(z.string().min(1)).min(1, 'At least one term required'),
  domain: z.string().default('technical'),
  preserveInternational: z.boolean().default(true),
  sourceLanguage: z.string().default('en'),
  targetLanguage: z.string().default('ar'),
  tenantId: z.string().min(1),
});

const AbbreviationTranslationInputSchema = z.object({
  abbreviations: z.array(z.string().min(1)).min(1, 'At least one abbreviation required'),
  domain: z.string().default('general'),
  sourceLanguage: z.string().default('en'),
  targetLanguage: z.string().default('ar'),
  expandAbbreviation: z.boolean().default(true),
  tenantId: z.string().min(1),
});

// ─── Types ───────────────────────────────────────────────────────────────────

interface ContextAnalysisResult {
  id: string;
  originalText: string;
  contextualTranslation: string;
  domain: string;
  toneLevel: string;
  semanticNotes: string[];
  culturalAdaptations: string[];
  confidenceScore: number;
  alternativeTranslations: string[];
  createdAt: Date;
}

interface SemanticMapping {
  sourceTerm: string;
  targetTerm: string;
  domain: string;
  semanticCategory: string;
  usageNotes: string;
  culturalContext: string;
}

interface TechnicalTermResult {
  originalTerm: string;
  arabicTranslation: string;
  internationalForm: string;
  domain: string;
  keepInternational: boolean;
  usageExample: string;
}

interface AbbreviationResult {
  abbreviation: string;
  expandedForm: string;
  arabicTranslation: string;
  arabicAbbreviation: string;
  domain: string;
  explanation: string;
}

// ─── Domain Semantic Maps ────────────────────────────────────────────────────

const DOMAIN_SEMANTIC_MAPS: Record<string, Record<string, string>> = {
  business: {
    'revenue': 'الإيرادات',
    'profit': 'الأرباح',
    'loss': 'الخسائر',
    'stakeholder': 'أصحاب المصلحة',
    'cash flow': 'التدفق النقدي',
    'market share': 'الحصة السوقية',
    'ROI': 'العائد على الاستثمار',
    'KPI': 'مؤشر الأداء الرئيسي',
    'quarter': 'ربع سنوي',
    'fiscal year': 'السنة المالية',
    'merger': 'اندماج',
    'acquisition': 'استحواذ',
    'benchmark': 'المعيار المرجعي',
    'due diligence': 'العناية الواجبة',
    'bottom line': 'صافي الربح',
    'overhead': 'التكاليف العامة',
    'turnover': 'معدل الدوران',
    'equity': 'حقوق الملكية',
    'liability': 'الالتزامات',
    'asset': 'الأصول',
  },
  legal: {
    'jurisdiction': 'الاختصاص القضائي',
    'compliance': 'الامتثال',
    'regulation': 'اللوائح التنظيمية',
    'liability': 'المسؤولية القانونية',
    'arbitration': 'التحكيم',
    'indemnity': 'التعويض',
    'statute': 'النظام',
    'amendment': 'التعديل',
    'enforcement': 'الإنفاذ',
    'plaintiff': 'المدعي',
    'defendant': 'المدعى عليه',
    'verdict': 'الحكم',
    'appeal': 'الاستئناف',
    'clause': 'البند',
    'provision': 'الحكم / النص',
  },
  financial: {
    'bond': 'سند',
    'yield': 'العائد',
    'dividend': 'توزيعات الأرباح',
    'portfolio': 'المحفظة الاستثمارية',
    'hedge': 'التحوط',
    'leverage': 'الرافعة المالية',
    'liquidity': 'السيولة',
    'amortization': 'الاستهلاك',
    'collateral': 'الضمان',
    'depreciation': 'الاستهلاك / الإهلاك',
    'maturity': 'تاريخ الاستحقاق',
    'principal': 'المبلغ الأساسي',
    'interest rate': 'سعر الفائدة',
    'inflation': 'التضخم',
  },
  government: {
    'policy': 'السياسة',
    'decree': 'المرسوم',
    'ministry': 'الوزارة',
    'regulation': 'النظام',
    'royal decree': 'المرسوم الملكي',
    'council of ministers': 'مجلس الوزراء',
    'shura council': 'مجلس الشورى',
    'governance': 'الحوكمة',
    'transparency': 'الشفافية',
    'accountability': 'المساءلة',
    'public sector': 'القطاع العام',
    'privatization': 'الخصخصة',
    'e-government': 'الحكومة الإلكترونية',
    'Vision 2030': 'رؤية ٢٠٣٠',
  },
  technical: {
    'API': 'واجهة برمجة التطبيقات',
    'database': 'قاعدة البيانات',
    'server': 'الخادم',
    'cloud': 'السحابة',
    'encryption': 'التشفير',
    'authentication': 'المصادقة',
    'firewall': 'جدار الحماية',
    'bandwidth': 'عرض النطاق الترددي',
    'latency': 'زمن الاستجابة',
    'algorithm': 'الخوارزمية',
    'framework': 'إطار العمل',
    'deployment': 'النشر',
    'scalability': 'قابلية التوسع',
    'microservice': 'الخدمة المصغرة',
  },
  medical: {
    'diagnosis': 'التشخيص',
    'prognosis': 'التنبؤ بمسار المرض',
    'symptom': 'عَرَض',
    'chronic': 'مزمن',
    'acute': 'حاد',
    'therapy': 'العلاج',
    'prescription': 'الوصفة الطبية',
    'clinical trial': 'التجربة السريرية',
    'pathology': 'علم الأمراض',
    'epidemiology': 'علم الأوبئة',
  },
};

const TONE_PROMPTS: Record<string, string> = {
  formal: 'Use formal Modern Standard Arabic (الفصحى المعاصرة) suitable for professional business documents. Maintain a respectful, authoritative tone.',
  executive: 'Use executive-level Arabic with concise, impactful language suitable for C-suite communications and board reports. Be direct and strategic.',
  governmental: 'Use official governmental Arabic register following Saudi governmental documentation standards. Use formal titles and institutional language.',
  technical: 'Use precise technical Arabic with appropriate transliterations for established international terms. Prioritize clarity and accuracy.',
  neutral: 'Use clear, standard Modern Standard Arabic without domain-specific formality. Aim for readability and broad accessibility.',
};

// ─── Service Functions ───────────────────────────────────────────────────────

export async function analyzeContext(
  input: z.infer<typeof ContextAnalysisInputSchema>
): Promise<ContextAnalysisResult> {
  const validated = ContextAnalysisInputSchema.parse(input);
  logger.info('analyzeContext called', {
    textLength: validated.text.length,
    domain: validated.domain,
    toneLevel: validated.toneLevel,
  });

  const domainMap = DOMAIN_SEMANTIC_MAPS[validated.domain] || {};
  const domainTermsFound: string[] = [];
  const textLower = validated.text.toLowerCase();

  for (const [term, translation] of Object.entries(domainMap)) {
    if (textLower.includes(term.toLowerCase())) {
      domainTermsFound.push(`"${term}" -> "${translation}"`);
    }
  }

  const toneInstruction = TONE_PROMPTS[validated.toneLevel] || TONE_PROMPTS.formal;

  const systemPrompt = `You are an expert Arabic linguist specializing in contextual translation for the ${validated.domain} domain.
${toneInstruction}

Your task:
1. Translate the text from ${validated.sourceLanguage} to ${validated.targetLanguage} with full contextual awareness.
2. Apply domain-specific semantic mappings (not literal translation).
3. Identify cultural adaptations needed for the Saudi market.
4. Provide alternative translations where ambiguity exists.

${domainTermsFound.length > 0 ? `Use these domain-specific translations:\n${domainTermsFound.join('\n')}` : ''}

Respond ONLY with a JSON object:
{
  "translation": "<contextual translation>",
  "semanticNotes": ["<note about semantic choices>"],
  "culturalAdaptations": ["<cultural adaptation applied>"],
  "confidenceScore": <0.0-1.0>,
  "alternativeTranslations": ["<alternative 1>", "<alternative 2>"]
}`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: validated.text },
    ],
    temperature: 0.3,
    max_tokens: Math.max(validated.text.length * 4, 2048),
  });

  const rawOutput = response.choices[0]?.message?.content?.trim() || '';

  let parsed: {
    translation: string;
    semanticNotes: string[];
    culturalAdaptations: string[];
    confidenceScore: number;
    alternativeTranslations: string[];
  };

  try {
    const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    logger.error('Failed to parse context analysis response', { rawOutput });
    throw new Error('Context analysis failed: could not parse AI response');
  }

  const resultId = crypto.randomUUID();

  await prisma.localizationJob.create({
    data: {
      id: resultId,
      documentId: 'context-analysis',
      sourceLanguage: validated.sourceLanguage,
      targetLanguage: validated.targetLanguage,
      status: 'completed',
      totalSegments: 1,
      translatedSegments: 1,
      resultContent: JSON.stringify({
        type: 'context_analysis',
        domain: validated.domain,
        toneLevel: validated.toneLevel,
        translation: parsed.translation,
        semanticNotes: parsed.semanticNotes,
        culturalAdaptations: parsed.culturalAdaptations,
        alternativeTranslations: parsed.alternativeTranslations,
      }),
      tenantId: validated.tenantId,
      createdBy: 'system',
      completedAt: new Date(),
    },
  });

  const result: ContextAnalysisResult = {
    id: resultId,
    originalText: validated.text,
    contextualTranslation: parsed.translation,
    domain: validated.domain,
    toneLevel: validated.toneLevel,
    semanticNotes: parsed.semanticNotes || [],
    culturalAdaptations: parsed.culturalAdaptations || [],
    confidenceScore: Math.min(1.0, Math.max(0.0, parsed.confidenceScore || 0.85)),
    alternativeTranslations: parsed.alternativeTranslations || [],
    createdAt: new Date(),
  };

  logger.info('Context analysis completed', {
    id: resultId,
    domain: validated.domain,
    confidence: result.confidenceScore,
  });

  return result;
}

export async function buildSemanticMap(
  input: z.infer<typeof SemanticMappingInputSchema>
): Promise<{ mappings: SemanticMapping[]; domain: string; totalMapped: number }> {
  const validated = SemanticMappingInputSchema.parse(input);
  logger.info('buildSemanticMap called', {
    termCount: validated.terms.length,
    domain: validated.domain,
  });

  const domainMap = DOMAIN_SEMANTIC_MAPS[validated.domain] || {};
  const mappings: SemanticMapping[] = [];
  const unmappedTerms: string[] = [];

  for (const term of validated.terms) {
    const termLower = term.toLowerCase();
    const directMatch = Object.entries(domainMap).find(
      ([key]) => key.toLowerCase() === termLower
    );

    if (directMatch) {
      mappings.push({
        sourceTerm: term,
        targetTerm: directMatch[1],
        domain: validated.domain,
        semanticCategory: 'direct_match',
        usageNotes: `Standard ${validated.domain} domain translation`,
        culturalContext: 'Saudi professional context',
      });
    } else {
      unmappedTerms.push(term);
    }
  }

  if (unmappedTerms.length > 0) {
    const systemPrompt = `You are a specialized Arabic linguist for the ${validated.domain} domain.
For each term, provide a JSON array of objects with:
- sourceTerm: the original term
- targetTerm: Arabic translation following Modern Standard Arabic professional standards
- semanticCategory: category (e.g., "financial_metric", "legal_concept", "technical_term")
- usageNotes: brief usage guidance
- culturalContext: Saudi cultural context notes

Only output the JSON array, nothing else.`;

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Translate these ${validated.domain} terms from ${validated.sourceLanguage} to ${validated.targetLanguage}:\n${unmappedTerms.join('\n')}` },
      ],
      temperature: 0.2,
      max_tokens: 2048,
    });

    const rawOutput = response.choices[0]?.message?.content?.trim() || '';

    try {
      const jsonMatch = rawOutput.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const aiMappings: Array<{
          sourceTerm: string;
          targetTerm: string;
          semanticCategory: string;
          usageNotes: string;
          culturalContext: string;
        }> = JSON.parse(jsonMatch[0]);

        for (const m of aiMappings) {
          mappings.push({
            sourceTerm: m.sourceTerm,
            targetTerm: m.targetTerm,
            domain: validated.domain,
            semanticCategory: m.semanticCategory || 'ai_generated',
            usageNotes: m.usageNotes || '',
            culturalContext: m.culturalContext || '',
          });
        }
      }
    } catch {
      logger.warn('Failed to parse AI semantic mappings, using fallback');
      for (const term of unmappedTerms) {
        mappings.push({
          sourceTerm: term,
          targetTerm: term,
          domain: validated.domain,
          semanticCategory: 'unmapped',
          usageNotes: 'Requires manual review',
          culturalContext: '',
        });
      }
    }
  }

  for (const mapping of mappings) {
    const termId = crypto.randomUUID();
    await prisma.glossaryTerm.upsert({
      where: {
        id: termId,
      },
      update: {
        translations: { default: mapping.targetTerm },
        context: `${mapping.domain}:${mapping.semanticCategory}`,
      },
      create: {
        id: termId,
        glossaryId: `domain_${validated.domain}_${validated.tenantId}`,
        term: mapping.sourceTerm,
        translations: { default: mapping.targetTerm },
        context: `${mapping.domain}:${mapping.semanticCategory} | ${mapping.usageNotes}`,
        isApproved: true,
      },
    });
  }

  logger.info('Semantic map built', {
    domain: validated.domain,
    totalMapped: mappings.length,
    directMatches: mappings.filter(m => m.semanticCategory === 'direct_match').length,
    aiGenerated: mappings.filter(m => m.semanticCategory !== 'direct_match').length,
  });

  return {
    mappings,
    domain: validated.domain,
    totalMapped: mappings.length,
  };
}

export async function translateTechnicalTerms(
  input: z.infer<typeof TechnicalTermTranslationInputSchema>
): Promise<{ results: TechnicalTermResult[]; totalProcessed: number }> {
  const validated = TechnicalTermTranslationInputSchema.parse(input);
  logger.info('translateTechnicalTerms called', {
    termCount: validated.terms.length,
    domain: validated.domain,
    preserveInternational: validated.preserveInternational,
  });

  const systemPrompt = `You are a technical Arabic translator specializing in ${validated.domain} terminology.
Rules:
- If an international term is widely recognized in Arabic technical contexts (e.g., API, HTTP, SQL, DNS), keep it in Latin script alongside the Arabic.
- Use Modern Standard Arabic professional terminology.
- Follow Saudi technical documentation standards.

For each term, respond with a JSON array of objects:
{
  "originalTerm": "<term>",
  "arabicTranslation": "<full Arabic translation>",
  "internationalForm": "<the international/Latin form if applicable>",
  "keepInternational": <true if the international form should be preserved>,
  "usageExample": "<a short Arabic usage example>"
}

Only output the JSON array.`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Translate these technical terms (${validated.domain} domain):\n${validated.terms.join('\n')}` },
    ],
    temperature: 0.1,
    max_tokens: 4096,
  });

  const rawOutput = response.choices[0]?.message?.content?.trim() || '';

  let results: TechnicalTermResult[];

  try {
    const jsonMatch = rawOutput.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found');
    }
    const parsed = JSON.parse(jsonMatch[0]);
    results = parsed.map((item: Record<string, unknown>) => ({
      originalTerm: String(item.originalTerm || ''),
      arabicTranslation: String(item.arabicTranslation || ''),
      internationalForm: String(item.internationalForm || ''),
      domain: validated.domain,
      keepInternational: Boolean(item.keepInternational),
      usageExample: String(item.usageExample || ''),
    }));
  } catch {
    logger.error('Failed to parse technical terms response', { rawOutput });
    throw new Error('Technical term translation failed: could not parse AI response');
  }

  for (const result of results) {
    const finalTranslation = result.keepInternational && validated.preserveInternational
      ? `${result.arabicTranslation} (${result.internationalForm})`
      : result.arabicTranslation;

    const tmId = crypto.randomUUID();
    await prisma.translationMemory.upsert({
      where: {
        id: tmId,
      },
      update: {
        targetText: finalTranslation,
      },
      create: {
        id: tmId,
        sourceText: result.originalTerm,
        targetText: finalTranslation,
        sourceLanguage: validated.sourceLanguage as Language,
        targetLanguage: validated.targetLanguage as Language,
        usageCount: 1,
      },
    });
  }

  logger.info('Technical terms translated', {
    totalProcessed: results.length,
    keptInternational: results.filter(r => r.keepInternational).length,
  });

  return { results, totalProcessed: results.length };
}

export async function translateAbbreviations(
  input: z.infer<typeof AbbreviationTranslationInputSchema>
): Promise<{ results: AbbreviationResult[]; totalProcessed: number }> {
  const validated = AbbreviationTranslationInputSchema.parse(input);
  logger.info('translateAbbreviations called', {
    count: validated.abbreviations.length,
    domain: validated.domain,
    expandAbbreviation: validated.expandAbbreviation,
  });

  const systemPrompt = `You are an expert in Arabic abbreviation handling for ${validated.domain} domain.
For each abbreviation, provide:
1. The full expanded form in the source language
2. The Arabic translation of the full form
3. An Arabic abbreviation if one exists
4. A brief explanation

Respond with a JSON array:
[{
  "abbreviation": "<original>",
  "expandedForm": "<full form in source language>",
  "arabicTranslation": "<Arabic translation of full form>",
  "arabicAbbreviation": "<Arabic abbreviation or transliteration>",
  "explanation": "<brief explanation in Arabic>"
}]

Only output the JSON array.`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Process these abbreviations (${validated.domain} domain):\n${validated.abbreviations.join('\n')}` },
    ],
    temperature: 0.1,
    max_tokens: 4096,
  });

  const rawOutput = response.choices[0]?.message?.content?.trim() || '';

  let results: AbbreviationResult[];

  try {
    const jsonMatch = rawOutput.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found');
    }
    const parsed = JSON.parse(jsonMatch[0]);
    results = parsed.map((item: Record<string, unknown>) => ({
      abbreviation: String(item.abbreviation || ''),
      expandedForm: String(item.expandedForm || ''),
      arabicTranslation: String(item.arabicTranslation || ''),
      arabicAbbreviation: String(item.arabicAbbreviation || ''),
      domain: validated.domain,
      explanation: String(item.explanation || ''),
    }));
  } catch {
    logger.error('Failed to parse abbreviation response', { rawOutput });
    throw new Error('Abbreviation translation failed: could not parse AI response');
  }

  for (const result of results) {
    const tmId = crypto.randomUUID();
    await prisma.translationMemory.upsert({
      where: { id: tmId },
      update: {
        targetText: validated.expandAbbreviation
          ? result.arabicTranslation
          : result.arabicAbbreviation || result.arabicTranslation,
      },
      create: {
        id: tmId,
        sourceText: result.abbreviation,
        targetText: validated.expandAbbreviation
          ? result.arabicTranslation
          : result.arabicAbbreviation || result.arabicTranslation,
        sourceLanguage: validated.sourceLanguage as Language,
        targetLanguage: validated.targetLanguage as Language,
        usageCount: 1,
      },
    });
  }

  logger.info('Abbreviations translated', {
    totalProcessed: results.length,
  });

  return { results, totalProcessed: results.length };
}

export async function getDomainTerms(
  domain: string,
  targetLanguage: string = 'ar'
): Promise<{ domain: string; terms: Record<string, string>; count: number }> {
  logger.info('getDomainTerms called', { domain, targetLanguage });

  const domainMap = DOMAIN_SEMANTIC_MAPS[domain];
  if (!domainMap) {
    const validDomains = Object.keys(DOMAIN_SEMANTIC_MAPS);
    throw new Error(`Unknown domain '${domain}'. Valid domains: ${validDomains.join(', ')}`);
  }

  return {
    domain,
    terms: domainMap,
    count: Object.keys(domainMap).length,
  };
}
