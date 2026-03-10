import OpenAI from 'openai';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import winston from 'winston';
import * as slideBuilder from './slide-builder.service.js';

interface SlideAnalysis {
  layout?: string;
  backgroundColor?: string;
  textElements?: SlideTextElement[];
  imageElements?: SlideImageElement[];
  shapeElements?: SlideShapeElement[];
  chartElements?: SlideChartElement[];
  theme?: { primaryColor?: string; secondaryColor?: string; fontFamily?: string };
  sourceImageSize?: { width: number; height: number; format: string };
  overallDescription?: string;
}

interface SlideTextElement {
  text?: string;
  role?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  fontSize?: number;
  bold?: boolean;
  color?: string;
  align?: string;
}

interface SlideImageElement {
  description?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

interface SlideShapeElement {
  type?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  color?: string;
}

interface SlideChartElement {
  chartType?: string;
  description?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

interface ExtractedElement {
  id?: string;
  type?: string;
  content?: string;
  position?: { x: number; y: number; w: number; h: number };
  style?: Record<string, unknown>;
  zOrder?: number;
  confidence?: number;
}

interface BatchSlideResult {
  imageIndex: number;
  status: string;
  slideIndex?: number;
  elements?: Record<string, unknown>;
  error?: string;
}

const prisma = new PrismaClient();
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'image-to-ppt' },
  transports: [new winston.transports.Console()],
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder' || '',
});

export async function analyzeSlideImage(image: Buffer): Promise<SlideAnalysis> {
  const resizedImage = await sharp(image)
    .resize(1024, 768, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();

  const base64Image = resizedImage.toString('base64');
  const metadata = await sharp(image).metadata();

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a slide analysis expert. Analyze the slide image and return detailed JSON describing its layout, content, and design.
Return ONLY valid JSON:
{
  "layout": "title|content|two-column|blank|custom",
  "backgroundColor": "#hex",
  "textElements": [
    { "text": "detected text", "role": "title|subtitle|body|caption|header", "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0, "fontSize": 18, "bold": false, "color": "#hex", "align": "left|center|right" }
  ],
  "imageElements": [
    { "description": "what the image shows", "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 }
  ],
  "shapeElements": [
    { "type": "rect|circle|arrow|line", "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0, "color": "#hex" }
  ],
  "chartElements": [
    { "chartType": "bar|line|pie", "description": "what the chart shows", "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 }
  ],
  "theme": { "primaryColor": "#hex", "secondaryColor": "#hex", "fontFamily": "detected font" },
  "overallDescription": "Brief description of the slide"
}
Positions should be in inches (10 inch wide, 7.5 inch tall slide).`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Analyze this slide image in detail. Identify all text, images, shapes, charts, colors, and layout.',
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${base64Image}`,
              detail: 'high',
            },
          },
        ],
      },
    ],
    max_tokens: 3000,
    temperature: 0.3,
  });

  const responseText = completion.choices[0]?.message?.content || '{}';
  const cleanedResponse = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const analysis = JSON.parse(cleanedResponse);

  analysis.sourceImageSize = {
    width: metadata.width || 0,
    height: metadata.height || 0,
    format: metadata.format || 'unknown',
  };

  logger.info('Slide image analyzed', {
    textElements: analysis.textElements?.length || 0,
    imageElements: analysis.imageElements?.length || 0,
    shapeElements: analysis.shapeElements?.length || 0,
    chartElements: analysis.chartElements?.length || 0,
    layout: analysis.layout,
  });

  return analysis;
}

export async function extractElements(image: Buffer): Promise<{ elements: ExtractedElement[]; slideWidth: number; slideHeight: number; elementCount: number }> {
  const resizedImage = await sharp(image)
    .resize(1024, 768, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();

  const base64Image = resizedImage.toString('base64');

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are an element extraction specialist. Extract all individual elements from the slide image.
Return ONLY valid JSON:
{
  "elements": [
    {
      "id": "elem_1",
      "type": "text|image|shape|chart|table",
      "content": "text content or description",
      "position": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 },
      "style": {
        "fontSize": 18,
        "bold": false,
        "italic": false,
        "color": "#hex",
        "backgroundColor": "#hex",
        "fontFamily": "font name",
        "align": "left|center|right"
      },
      "zOrder": 0,
      "confidence": 0.95
    }
  ],
  "slideWidth": 10,
  "slideHeight": 7.5
}
Position in inches. Elements ordered by z-order (background first).`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract every element from this slide image. Be precise about positions and styles.',
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${base64Image}`,
              detail: 'high',
            },
          },
        ],
      },
    ],
    max_tokens: 3000,
    temperature: 0.2,
  });

  const responseText = completion.choices[0]?.message?.content || '{}';
  const cleanedResponse = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const extracted = JSON.parse(cleanedResponse);

  const elements = extracted.elements || [];
  elements.sort((a: ExtractedElement, b: ExtractedElement) => (a.zOrder || 0) - (b.zOrder || 0));

  logger.info('Elements extracted', {
    totalElements: elements.length,
    textCount: elements.filter((e: ExtractedElement) => e.type === 'text').length,
    imageCount: elements.filter((e: ExtractedElement) => e.type === 'image').length,
    shapeCount: elements.filter((e: ExtractedElement) => e.type === 'shape').length,
  });

  return {
    elements,
    slideWidth: extracted.slideWidth || 10,
    slideHeight: extracted.slideHeight || 7.5,
    elementCount: elements.length,
  };
}

export async function reconstructSlide(analysis: SlideAnalysis, presId: string): Promise<Record<string, unknown>> {
  const presentation = await prisma.presentation.findUnique({
    where: { id: presId },
  });
  if (!presentation) {
    throw new Error(`Presentation ${presId} not found`);
  }

  const layout = analysis.layout || 'blank';
  const validLayout = ['title', 'content', 'two-column', 'blank'].includes(layout)
    ? layout
    : 'blank';

  const titleElement = (analysis.textElements || []).find(
    (el: SlideTextElement) => el.role === 'title' || el.role === 'header'
  );
  const subtitleElement = (analysis.textElements || []).find(
    (el: SlideTextElement) => el.role === 'subtitle'
  );
  const bodyElements = (analysis.textElements || []).filter(
    (el: SlideTextElement) => el.role === 'body' || el.role === 'caption'
  );

  const slideContent: Record<string, unknown> = {
    title: titleElement?.text || 'Reconstructed Slide',
    subtitle: subtitleElement?.text || '',
    body: bodyElements.map((el: SlideTextElement) => el.text).join('\n') || '',
  };

  const addedSlide = await slideBuilder.addSlide(presId, validLayout as 'title' | 'content' | 'two-column' | 'blank', slideContent);
  const slideIndex = addedSlide.slideIndex as number;

  const customTextElements = (analysis.textElements || []).filter(
    (el: SlideTextElement) => el.role !== 'title' && el.role !== 'subtitle' && el.role !== 'body'
  );

  for (const textEl of customTextElements) {
    await slideBuilder.addTextBox(
      presId,
      slideIndex,
      textEl.text || '',
      {
        x: textEl.x || 0.5,
        y: textEl.y || 0.5,
        w: textEl.w || 4,
        h: textEl.h || 1,
      },
      {
        fontSize: textEl.fontSize || 18,
        bold: textEl.bold || false,
        color: textEl.color || '#333333',
      }
    );
  }

  for (const shapeEl of (analysis.shapeElements || [])) {
    const shapeType = shapeEl.type || 'rect';
    const validShape = ['rect', 'circle', 'arrow', 'line'].includes(shapeType)
      ? shapeType
      : 'rect';
    await slideBuilder.addShape(
      presId,
      slideIndex,
      validShape as 'rect' | 'circle' | 'arrow' | 'line',
      { x: shapeEl.x || 1, y: shapeEl.y || 1, w: shapeEl.w || 2, h: shapeEl.h || 2 },
      { fillColor: shapeEl.color || '#4285f4' }
    );
  }

  for (const chartEl of (analysis.chartElements || [])) {
    await slideBuilder.addChart(
      presId,
      slideIndex,
      chartEl.chartType || 'bar',
      {
        labels: ['A', 'B', 'C', 'D'],
        series: [{ name: chartEl.description || 'Data', values: [10, 20, 30, 40] }],
        title: chartEl.description || '',
      },
      { x: chartEl.x || 0.5, y: chartEl.y || 1.5, w: chartEl.w || 8, h: chartEl.h || 4 }
    );
  }

  if (analysis.theme) {
    await slideBuilder.applyTheme(presId, {
      primaryColor: analysis.theme.primaryColor || '#1a73e8',
      secondaryColor: analysis.theme.secondaryColor || '#ffffff',
      fontFamily: analysis.theme.fontFamily || 'Arial',
      backgroundColor: analysis.backgroundColor || '#ffffff',
    });
  }

  logger.info('Slide reconstructed', {
    presId,
    slideIndex,
    layout: validLayout,
    textElements: (analysis.textElements || []).length,
    shapeElements: (analysis.shapeElements || []).length,
    chartElements: (analysis.chartElements || []).length,
  });

  return {
    presentationId: presId,
    slideIndex,
    layout: validLayout,
    reconstructedElements: {
      text: (analysis.textElements || []).length,
      shapes: (analysis.shapeElements || []).length,
      charts: (analysis.chartElements || []).length,
      images: (analysis.imageElements || []).length,
    },
  };
}

export async function batchReconstruct(
  images: Buffer[],
  tenantId: string,
  userId: string
): Promise<Record<string, unknown>> {
  if (!images || images.length === 0) {
    throw new Error('No images provided for batch reconstruction');
  }

  const presentation = await slideBuilder.createPresentation(
    `Reconstructed Presentation (${images.length} slides)`,
    {
      primaryColor: '#1a73e8',
      secondaryColor: '#ffffff',
      fontFamily: 'Arial',
      backgroundColor: '#ffffff',
    },
    undefined,
    tenantId,
    userId
  );

  const results: BatchSlideResult[] = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < images.length; i++) {
    try {
      logger.info('Processing image', { index: i, total: images.length });

      const analysis = await analyzeSlideImage(images[i]);
      const result = await reconstructSlide(analysis, presentation.id);
      results.push({
        imageIndex: i,
        status: 'success',
        slideIndex: result.slideIndex as number,
        elements: result.reconstructedElements as Record<string, unknown>,
      });
      successCount++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to reconstruct slide from image', {
        index: i,
        error: message,
      });
      results.push({
        imageIndex: i,
        status: 'failed',
        error: message,
      });
      failCount++;
    }
  }

  logger.info('Batch reconstruction complete', {
    presId: presentation.id,
    total: images.length,
    success: successCount,
    failed: failCount,
  });

  return {
    presentationId: presentation.id,
    name: presentation.name,
    totalImages: images.length,
    successCount,
    failCount,
    slides: results,
  };
}
