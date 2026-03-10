import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import winston from 'winston';
import * as slideBuilder from './slide-builder.service.js';

const prisma = new PrismaClient();
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'ai-slide-generator' },
  transports: [new winston.transports.Console()],
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

function getStructuredOutputModel(): string {
  return process.env.OPENAI_JSON_MODEL || 'gpt-4o';
}

function parseJsonPayload(responseText: string): Record<string, unknown> {
  const trimmed = responseText.trim();

  if (!trimmed) {
    return {};
  }

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1]) as Record<string, unknown>;
    }

    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    }

    throw new Error('AI response did not contain valid JSON');
  }
}

export async function generateFromText(
  text: string,
  options: { slideCount?: number; style?: string; language?: string },
  tenantId: string,
  userId: string
): Promise<Record<string, unknown>> {
  const slideCount = options.slideCount || 5;
  const style = options.style || 'professional';
  const language = options.language || 'en';

  const systemPrompt = `You are a presentation design expert. Generate structured JSON for a presentation.
Return ONLY valid JSON with this structure:
{
  "title": "Presentation Title",
  "theme": {
    "primaryColor": "#hex",
    "secondaryColor": "#hex",
    "fontFamily": "font name",
    "backgroundColor": "#hex"
  },
  "slides": [
    {
      "layout": "title|content|two-column",
      "title": "Slide Title",
      "body": "Body text or bullet points separated by newlines",
      "subtitle": "For title slides",
      "leftContent": "For two-column",
      "rightContent": "For two-column",
      "notes": "Speaker notes for this slide"
    }
  ]
}`;

  const userPrompt = `Create a ${slideCount}-slide ${style} presentation in ${language} based on this text:

${text}

Requirements:
- First slide should be a "title" layout with title and subtitle
- Use "content" layout for main points with title and body
- Use "two-column" layout for comparisons
- Last slide should summarize or conclude
- Include speaker notes for each slide
- Ensure content is concise and presentation-ready
- Return exactly ${slideCount} slides`;

  logger.info('Calling OpenAI for text-to-presentation', { slideCount, style, language });

  const completion = await openai.chat.completions.create({
    model: getStructuredOutputModel(),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 4000,
  });

  const responseText = completion.choices[0]?.message?.content || '{}';
  const parsed = parseJsonPayload(responseText);

  if (!parsed.slides || !Array.isArray(parsed.slides)) {
    throw new Error('OpenAI response did not contain valid slides array');
  }

  const presentationTitle = (parsed.title as string) || 'AI Generated Presentation';
  const theme = (parsed.theme as any) || {
    primaryColor: '#1a73e8',
    secondaryColor: '#ffffff',
    fontFamily: 'Arial',
    backgroundColor: '#ffffff',
  };

  const presentation = await slideBuilder.createPresentation(
    presentationTitle,
    theme,
    undefined,
    tenantId,
    userId
  );

  const createdSlides: Record<string, unknown>[] = [];
  for (const slideData of (parsed.slides as any[])) {
    const layout = slideData.layout || 'content';
    const content: Record<string, unknown> = {
      title: slideData.title || '',
      body: slideData.body || '',
      subtitle: slideData.subtitle || '',
      leftContent: slideData.leftContent || '',
      rightContent: slideData.rightContent || '',
      notes: slideData.notes || '',
    };

    const addedSlide = await slideBuilder.addSlide(presentation.id, layout, content);
    createdSlides.push(addedSlide);
  }

  logger.info('Presentation generated from text', {
    presId: presentation.id,
    slides: createdSlides.length,
    tokensUsed: completion.usage?.total_tokens || 0,
  });

  return {
    presentationId: presentation.id,
    name: presentationTitle,
    theme,
    slideCount: createdSlides.length,
    slides: createdSlides,
    tokensUsed: completion.usage?.total_tokens || 0,
  };
}

export async function generateFromData(
  datasetId: string,
  options: { style?: string; slideCount?: number },
  tenantId: string,
  userId: string
): Promise<Record<string, unknown>> {
  const datasetRows = await prisma.$queryRaw<
    Array<{
      id: string;
      name: string;
      description: string | null;
      format: string | null;
      row_count: bigint | null;
      column_count: number | null;
      schema_json: unknown;
    }>
  >`SELECT id, name, description, format, row_count, column_count, schema_json FROM datasets WHERE id = ${datasetId}::uuid LIMIT 1`;
  const dataset = datasetRows[0];

  let dataDescription = '';
  if (dataset) {
    const schemaSummary =
      Array.isArray(dataset.schema_json) || (dataset.schema_json && typeof dataset.schema_json === 'object')
        ? JSON.stringify(dataset.schema_json)
        : 'unknown';
    dataDescription = `Dataset: ${dataset.name || datasetId}
Format: ${dataset.format || 'unknown'}
Records: ${dataset.row_count ? Number(dataset.row_count) : 'unknown'}
Columns: ${dataset.column_count ?? 'unknown'}
Schema: ${schemaSummary}
Summary: ${dataset.description || 'No summary available'}`;
  } else {
    dataDescription = `Dataset ID: ${datasetId}. Provide a general data-driven presentation template.`;
  }

  const systemPrompt = `You are a data visualization expert. Generate a presentation structure in JSON that effectively presents data insights.
Return ONLY valid JSON with this structure:
{
  "title": "Presentation Title",
  "theme": { "primaryColor": "#hex", "secondaryColor": "#hex", "fontFamily": "font", "backgroundColor": "#hex" },
  "slides": [
    {
      "layout": "title|content|two-column",
      "title": "Slide Title",
      "body": "Text content",
      "chartType": "bar|line|pie|null",
      "chartData": { "labels": [], "series": [{"name": "", "values": []}] },
      "notes": "Speaker notes"
    }
  ]
}`;

  const userPrompt = `Create a data-driven presentation based on this dataset information:

${dataDescription}

Style: ${options?.style || 'analytical'}
Slide count: ${options?.slideCount || 6}

Requirements:
- Include a title slide
- Include slides with charts where appropriate (chartType and chartData fields)
- Include key insights and takeaways
- Include a summary/conclusion slide
- Use appropriate chart types for different data aspects`;

  const completion = await openai.chat.completions.create({
    model: getStructuredOutputModel(),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 4000,
  });

  const responseText = completion.choices[0]?.message?.content || '{}';
  const parsed = parseJsonPayload(responseText);
  const presTitle = (parsed.title as string) || 'Data Analysis Presentation';
  const theme = (parsed.theme as any) || { primaryColor: '#0d47a1', secondaryColor: '#e3f2fd', fontFamily: 'Arial', backgroundColor: '#ffffff' };

  const presentation = await slideBuilder.createPresentation(presTitle, theme, undefined, tenantId, userId);

  const createdSlides: Record<string, unknown>[] = [];
  for (const slideData of ((parsed.slides || []) as any[])) {
    const addedSlide = await slideBuilder.addSlide(presentation.id, slideData.layout || 'content', {
      title: slideData.title || '',
      body: slideData.body || '',
      notes: slideData.notes || '',
    });

    if (slideData.chartType && slideData.chartData) {
      await slideBuilder.addChart(
        presentation.id,
        addedSlide.slideIndex as number,
        slideData.chartType,
        slideData.chartData,
        { x: 0.5, y: 2.0, w: 8.0, h: 4.0 }
      );
    }

    createdSlides.push(addedSlide);
  }

  logger.info('Presentation generated from data', {
    presId: presentation.id,
    datasetId,
    slides: createdSlides.length,
  });

  return {
    presentationId: presentation.id,
    name: presTitle,
    slideCount: createdSlides.length,
    slides: createdSlides,
    datasetId,
  };
}

export async function generateFromOutline(
  outline: string[],
  options: { style?: string; language?: string },
  tenantId: string,
  userId: string
): Promise<Record<string, unknown>> {
  const style = options?.style || 'professional';
  const language = options?.language || 'en';

  const outlineText = outline.map((item, idx) => `${idx + 1}. ${item}`).join('\n');

  const systemPrompt = `You are a presentation expert. Expand an outline into detailed slide content.
Return ONLY valid JSON:
{
  "title": "Presentation Title",
  "theme": { "primaryColor": "#hex", "secondaryColor": "#hex", "fontFamily": "font", "backgroundColor": "#hex" },
  "slides": [
    {
      "layout": "title|content|two-column",
      "title": "Slide Title",
      "body": "Detailed content",
      "subtitle": "For title slides",
      "leftContent": "For two-column",
      "rightContent": "For two-column",
      "notes": "Speaker notes"
    }
  ]
}`;

  const userPrompt = `Expand this outline into a ${style} presentation in ${language}:

${outlineText}

Requirements:
- Create a title slide first
- Expand each outline point into one or more detailed slides
- Include bullet points, explanations, and examples
- Add speaker notes for each slide
- End with a summary slide`;

  const completion = await openai.chat.completions.create({
    model: getStructuredOutputModel(),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 4000,
  });

  const responseText = completion.choices[0]?.message?.content || '{}';
  const parsed = parseJsonPayload(responseText);
  const presTitle = (parsed.title as string) || 'Outline Presentation';
  const theme = (parsed.theme as any) || { primaryColor: '#1a73e8', secondaryColor: '#ffffff', fontFamily: 'Arial', backgroundColor: '#ffffff' };

  const presentation = await slideBuilder.createPresentation(presTitle, theme, undefined, tenantId, userId);

  const createdSlides: Record<string, unknown>[] = [];
  for (const slideData of ((parsed.slides || []) as any[])) {
    const addedSlide = await slideBuilder.addSlide(presentation.id, slideData.layout || 'content', {
      title: slideData.title || '',
      body: slideData.body || '',
      subtitle: slideData.subtitle || '',
      leftContent: slideData.leftContent || '',
      rightContent: slideData.rightContent || '',
      notes: slideData.notes || '',
    });
    createdSlides.push(addedSlide);
  }

  logger.info('Presentation generated from outline', {
    presId: presentation.id,
    outlineItems: outline.length,
    slides: createdSlides.length,
  });

  return {
    presentationId: presentation.id,
    name: presTitle,
    slideCount: createdSlides.length,
    slides: createdSlides,
    outlineItems: outline.length,
  };
}

export async function suggestLayout(content: string): Promise<Record<string, unknown>> {
  const systemPrompt = `You are a presentation layout advisor. Analyze content and suggest the best slide layout.
Return ONLY valid JSON:
{
  "suggestedLayout": "title|content|two-column|blank",
  "reasoning": "Why this layout works best",
  "alternativeLayout": "Second best option",
  "elementSuggestions": [
    { "type": "text|image|chart|table", "description": "What to place", "position": "suggestion" }
  ],
  "designTips": ["tip1", "tip2"]
}`;

  const userPrompt = `Analyze this content and suggest the best slide layout:

${content}

Consider:
- Amount of text
- Whether data/numbers are present (suggest charts)
- Whether comparisons exist (suggest two-column)
- Whether it's an introduction (suggest title layout)`;

  const completion = await openai.chat.completions.create({
    model: getStructuredOutputModel(),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.5,
    max_tokens: 1000,
  });

  const responseText = completion.choices[0]?.message?.content || '{}';
  const parsed = parseJsonPayload(responseText);

  logger.info('Layout suggestion generated', {
    suggestedLayout: parsed.suggestedLayout,
    contentLength: content.length,
  });

  return {
    suggestedLayout: parsed.suggestedLayout || 'content',
    reasoning: parsed.reasoning || 'Default content layout',
    alternativeLayout: parsed.alternativeLayout || 'two-column',
    elementSuggestions: parsed.elementSuggestions || [],
    designTips: parsed.designTips || [],
  };
}

export async function generateSpeakerNotes(presId: string): Promise<Record<string, unknown>> {
  const presentation = await prisma.presentation.findUnique({
    where: { id: presId },
  });
  if (!presentation) {
    throw new Error(`Presentation ${presId} not found`);
  }

  const slides = await prisma.slide.findMany({
    where: { presentationId: presId },
    orderBy: { slideIndex: 'asc' },
  });

  if (slides.length === 0) {
    throw new Error(`Presentation ${presId} has no slides`);
  }

  const slidesSummary = slides.map((s, idx) => {
    const content = JSON.parse(s.content as string);
    const textElements = (content.elements || [])
      .filter((el: Record<string, unknown>) => el.type === 'text')
      .map((el: Record<string, unknown>) => el.text)
      .join(' | ');
    return `Slide ${idx + 1} (${s.layout}): ${textElements}`;
  }).join('\n');

  const systemPrompt = `You are a presentation coach. Generate speaker notes for each slide.
Return ONLY valid JSON:
{
  "notes": [
    {
      "slideIndex": 0,
      "notes": "Detailed speaker notes for this slide. Include talking points, transitions, and timing suggestions."
    }
  ]
}`;

  const userPrompt = `Generate detailed speaker notes for this ${slides.length}-slide presentation titled "${presentation.name}":

${slidesSummary}

Requirements:
- 3-5 sentences per slide
- Include transition phrases between slides
- Include key talking points
- Suggest timing (e.g., "spend 2 minutes on this slide")`;

  const completion = await openai.chat.completions.create({
    model: getStructuredOutputModel(),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 3000,
  });

  const responseText = completion.choices[0]?.message?.content || '{}';
  const parsed = parseJsonPayload(responseText);
  const notesArray = (parsed.notes || []) as any[];

  const updatedSlides: Record<string, unknown>[] = [];
  for (const noteItem of notesArray) {
    const slideIdx = noteItem.slideIndex;
    const notesText = noteItem.notes || '';
    const slide = slides[slideIdx];
    if (slide) {
      await prisma.slide.update({
        where: { id: slide.id },
        data: { notes: notesText, updatedAt: new Date() },
      });
      updatedSlides.push({ slideIndex: slideIdx, notes: notesText });
    }
  }

  logger.info('Speaker notes generated', { presId, updatedSlides: updatedSlides.length });
  return {
    presentationId: presId,
    notesGenerated: updatedSlides.length,
    slides: updatedSlides,
  };
}

export async function translatePresentation(
  presId: string,
  targetLanguage: string
): Promise<Record<string, unknown>> {
  const presentation = await prisma.presentation.findUnique({
    where: { id: presId },
  });
  if (!presentation) {
    throw new Error(`Presentation ${presId} not found`);
  }

  const slides = await prisma.slide.findMany({
    where: { presentationId: presId },
    orderBy: { slideIndex: 'asc' },
  });

  if (slides.length === 0) {
    throw new Error(`Presentation ${presId} has no slides`);
  }

  const textsToTranslate: Array<{ slideId: string; elementIndex: number; text: string }> = [];
  for (const slide of slides) {
    const content = JSON.parse(slide.content as string);
    const elements = content.elements || [];
    for (let i = 0; i < elements.length; i++) {
      if (elements[i].type === 'text' && elements[i].text) {
        textsToTranslate.push({
          slideId: slide.id,
          elementIndex: i,
          text: elements[i].text,
        });
      }
    }
  }

  const allTexts = textsToTranslate.map((t, idx) => `[${idx}] ${t.text}`).join('\n');

  const systemPrompt = `You are a professional translator. Translate all provided texts to ${targetLanguage}.
Return ONLY valid JSON:
{
  "translations": [
    { "index": 0, "translated": "Translated text here" }
  ]
}
Preserve formatting, bullet points, and line breaks. Maintain the same tone and style.`;

  const userPrompt = `Translate the following presentation texts to ${targetLanguage}:

${allTexts}`;

  const completion = await openai.chat.completions.create({
    model: getStructuredOutputModel(),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 4000,
  });

  const responseText = completion.choices[0]?.message?.content || '{}';
  const parsed = parseJsonPayload(responseText);
  const translations = (parsed.translations || []) as any[];

  const translationMap = new Map<number, string>();
  for (const t of translations) {
    translationMap.set(t.index, t.translated);
  }

  let translatedCount = 0;
  for (const slide of slides) {
    const content = JSON.parse(slide.content as string);
    const elements = content.elements || [];
    let modified = false;

    for (let i = 0; i < elements.length; i++) {
      if (elements[i].type === 'text' && elements[i].text) {
        const matchEntry = textsToTranslate.find(
          (t) => t.slideId === slide.id && t.elementIndex === i
        );
        if (matchEntry) {
          const globalIdx = textsToTranslate.indexOf(matchEntry);
          const translated = translationMap.get(globalIdx);
          if (translated) {
            elements[i].text = translated;
            if (targetLanguage === 'ar' || targetLanguage === 'he' || targetLanguage === 'fa') {
              elements[i].options = elements[i].options || {};
              elements[i].options.rtlMode = true;
              elements[i].options.align = 'right';
            }
            modified = true;
            translatedCount++;
          }
        }
      }
    }

    if (modified) {
      await prisma.slide.update({
        where: { id: slide.id },
        data: { content: JSON.stringify(content), updatedAt: new Date() },
      });
    }
  }

  const titleTranslation = translationMap.get(0);
  if (titleTranslation) {
    await prisma.presentation.update({
      where: { id: presId },
      data: { name: titleTranslation, updatedAt: new Date() },
    });
  }

  logger.info('Presentation translated', { presId, targetLanguage, translatedCount });
  return {
    presentationId: presId,
    targetLanguage,
    translatedTexts: translatedCount,
    totalTexts: textsToTranslate.length,
  };
}
