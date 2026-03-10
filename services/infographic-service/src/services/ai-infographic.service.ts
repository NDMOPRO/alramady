import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import {
  createInfographic,
  addSection,
  addStatistic,
  addTimeline,
  addComparison,
  addFlowchart,
} from './infographic-builder.service.js';

const prisma = new PrismaClient();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

interface InfographicLayout {
  title: string;
  dimensions: { width: number; height: number };
  template: string;
  sections: Array<{
    type: 'header' | 'stats' | 'timeline' | 'comparison' | 'flowchart' | 'text';
    content: Record<string, unknown>;
    position: { x: number; y: number; w: number; h: number };
  }>;
  statistics?: Array<{
    value: string;
    label: string;
    icon: string;
    position: { x: number; y: number; w: number; h: number };
  }>;
  timeline?: {
    events: Array<{ date: string; title: string; description: string }>;
    position: { x: number; y: number; w: number; h: number };
  };
  comparison?: {
    items: Array<{ name: string; values: Record<string, unknown> }>;
    position: { x: number; y: number; w: number; h: number };
  };
  flowchart?: {
    steps: Array<{ title: string; description: string }>;
    position: { x: number; y: number; w: number; h: number };
  };
}

export async function generateFromData(
  datasetId: string,
  style: string,
  tenantId: string,
  userId: string
): Promise<Record<string, unknown>> {
  const prismaExt = prisma as unknown as Record<string, Record<string, (...args: any[]) => Promise<any>>>;
  const dataset = await prismaExt.datasets.findUnique({
    where: { id: datasetId },
  }) as Record<string, any> | null;

  if (!dataset) {
    throw new Error(`Dataset with id ${datasetId} not found`);
  }

  const dataStats = typeof dataset.stats === 'string'
    ? JSON.parse(dataset.stats)
    : dataset.stats || {};

  const dataSummary = typeof dataset.summary === 'string'
    ? dataset.summary
    : JSON.stringify(dataset.summary || {});

  const dataColumns = Array.isArray(dataset.columns)
    ? dataset.columns
    : typeof dataset.columns === 'string'
      ? JSON.parse(dataset.columns)
      : [];

  const columnInfo = dataColumns.map((col: unknown) => {
    if (typeof col === 'string') return col;
    const colObj = col as Record<string, unknown>;
    return `${colObj.name} (${colObj.type || 'unknown'})`;
  }).join(', ');

  const prompt = `You are an infographic design AI. Given the following dataset information, generate a structured JSON layout for an infographic in style "${style}".

Dataset name: ${dataset.name || 'Unknown'}
Summary: ${dataSummary}
Columns: ${columnInfo}
Statistics: ${JSON.stringify(dataStats)}
Row count: ${dataset.row_count || 'unknown'}

Generate a JSON object with this exact structure:
{
  "title": "Infographic title",
  "dimensions": {"width": 1200, "height": 1600},
  "template": "${style}",
  "sections": [
    {"type": "header", "content": {"text": "Title text", "fontSize": 36}, "position": {"x": 0, "y": 0, "w": 1200, "h": 100}}
  ],
  "statistics": [
    {"value": "42K", "label": "Total Records", "icon": "chart", "position": {"x": 50, "y": 120, "w": 250, "h": 120}}
  ],
  "timeline": null,
  "comparison": null,
  "flowchart": null
}

Include relevant statistics from the data. Use appropriate section types. Position elements to avoid overlap. Only return valid JSON, no markdown.`;

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are an expert infographic designer. Return only valid JSON.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 3000,
    response_format: { type: 'json_object' },
  });

  const responseText = completion.choices[0]?.message?.content || '{}';
  const layout: InfographicLayout = JSON.parse(responseText);

  const infographic = await createInfographic(
    layout.title || `${dataset.name || 'Data'} Infographic`,
    layout.template || style,
    layout.dimensions || { width: 1200, height: 1600 },
    tenantId,
    userId
  );

  const infographicId = infographic.id as string;
  const results: Record<string, unknown>[] = [];

  if (layout.sections && Array.isArray(layout.sections)) {
    for (const section of layout.sections) {
      const result = await addSection(infographicId, section.type, section.content, section.position);
      results.push({ type: 'section', ...result });
    }
  }

  if (layout.statistics && Array.isArray(layout.statistics)) {
    for (const stat of layout.statistics) {
      const result = await addStatistic(infographicId, stat.value, stat.label, stat.icon, stat.position);
      results.push({ type: 'statistic', ...result });
    }
  }

  if (layout.timeline && layout.timeline.events) {
    const result = await addTimeline(infographicId, layout.timeline.events, layout.timeline.position);
    results.push({ type: 'timeline', ...result });
  }

  if (layout.comparison && layout.comparison.items) {
    const result = await addComparison(infographicId, layout.comparison.items, layout.comparison.position);
    results.push({ type: 'comparison', ...result });
  }

  if (layout.flowchart && layout.flowchart.steps) {
    const result = await addFlowchart(infographicId, layout.flowchart.steps, layout.flowchart.position);
    results.push({ type: 'flowchart', ...result });
  }

  return {
    infographic,
    elementsAdded: results.length,
    elements: results,
    aiModel: process.env.OPENAI_MODEL || 'gpt-4o',
    tokensUsed: completion.usage?.total_tokens || 0,
    sourceDataset: { id: datasetId, name: dataset.name },
  };
}

export async function generateFromText(
  text: string,
  style: string,
  tenantId: string,
  userId: string
): Promise<Record<string, unknown>> {
  if (!text || text.trim().length === 0) {
    throw new Error('Text content is required to generate an infographic');
  }

  const truncatedText = text.substring(0, 5000);

  const prompt = `You are an infographic design AI. Convert the following text into a structured infographic layout in style "${style}".

Text content:
${truncatedText}

Generate a JSON object with this exact structure:
{
  "title": "Infographic title derived from text",
  "dimensions": {"width": 1200, "height": 1800},
  "template": "${style}",
  "sections": [
    {"type": "header", "content": {"text": "Title", "fontSize": 36}, "position": {"x": 0, "y": 0, "w": 1200, "h": 100}},
    {"type": "text", "content": {"text": "Key point from text", "fontSize": 16}, "position": {"x": 50, "y": 120, "w": 1100, "h": 80}}
  ],
  "statistics": [
    {"value": "85%", "label": "Key Metric", "icon": "chart", "position": {"x": 50, "y": 220, "w": 250, "h": 120}}
  ],
  "timeline": {
    "events": [{"date": "2024", "title": "Event", "description": "What happened"}],
    "position": {"x": 50, "y": 360, "w": 1100, "h": 400}
  },
  "comparison": null,
  "flowchart": null
}

Extract key facts, numbers, dates, and create appropriate sections. Return only valid JSON.`;

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are an expert infographic designer. Extract key information from text and structure it visually. Return only valid JSON.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 3000,
    response_format: { type: 'json_object' },
  });

  const responseText = completion.choices[0]?.message?.content || '{}';
  const layout: InfographicLayout = JSON.parse(responseText);

  const infographic = await createInfographic(
    layout.title || 'Text Infographic',
    layout.template || style,
    layout.dimensions || { width: 1200, height: 1800 },
    tenantId,
    userId
  );

  const infographicId = infographic.id as string;
  const results: Record<string, unknown>[] = [];

  if (layout.sections && Array.isArray(layout.sections)) {
    for (const section of layout.sections) {
      const result = await addSection(infographicId, section.type, section.content, section.position);
      results.push({ type: 'section', ...result });
    }
  }

  if (layout.statistics && Array.isArray(layout.statistics)) {
    for (const stat of layout.statistics) {
      const result = await addStatistic(infographicId, stat.value, stat.label, stat.icon, stat.position);
      results.push({ type: 'statistic', ...result });
    }
  }

  if (layout.timeline && layout.timeline.events) {
    const result = await addTimeline(infographicId, layout.timeline.events, layout.timeline.position);
    results.push({ type: 'timeline', ...result });
  }

  if (layout.comparison && layout.comparison.items) {
    const result = await addComparison(infographicId, layout.comparison.items, layout.comparison.position);
    results.push({ type: 'comparison', ...result });
  }

  if (layout.flowchart && layout.flowchart.steps) {
    const result = await addFlowchart(infographicId, layout.flowchart.steps, layout.flowchart.position);
    results.push({ type: 'flowchart', ...result });
  }

  return {
    infographic,
    elementsAdded: results.length,
    elements: results,
    aiModel: process.env.OPENAI_MODEL || 'gpt-4o',
    tokensUsed: completion.usage?.total_tokens || 0,
    inputTextLength: truncatedText.length,
  };
}

export async function suggestStyle(content: string): Promise<Record<string, unknown>> {
  if (!content || content.trim().length === 0) {
    throw new Error('Content is required to suggest a style');
  }

  const truncatedContent = content.substring(0, 3000);

  const prompt = `Analyze the following content and suggest the best infographic style/template for it. Consider the tone, subject matter, and data types present.

Content:
${truncatedContent}

Return a JSON object with:
{
  "recommended_style": "modern|corporate|creative|minimal|dark",
  "reasoning": "Explanation of why this style fits",
  "color_palette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
  "suggested_sections": ["header", "stats", "timeline", "comparison", "flowchart", "text"],
  "estimated_dimensions": {"width": 1200, "height": 1600},
  "font_recommendations": {"heading": "Font name", "body": "Font name"},
  "layout_tips": ["tip1", "tip2", "tip3"],
  "alternative_styles": [
    {"style": "another_style", "reasoning": "Why this could also work"}
  ]
}

Only return valid JSON.`;

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are an expert graphic designer specializing in infographic design. Analyze content and recommend optimal visual styles. Return only valid JSON.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.6,
    max_tokens: 1500,
    response_format: { type: 'json_object' },
  });

  const responseText = completion.choices[0]?.message?.content || '{}';
  const suggestion = JSON.parse(responseText);

  return {
    style: suggestion.recommended_style || 'modern',
    reasoning: suggestion.reasoning || 'Default modern style recommended',
    colorPalette: suggestion.color_palette || ['#2563EB', '#7C3AED', '#F59E0B', '#10B981', '#EF4444'],
    suggestedSections: suggestion.suggested_sections || ['header', 'text'],
    estimatedDimensions: suggestion.estimated_dimensions || { width: 1200, height: 1600 },
    fontRecommendations: suggestion.font_recommendations || { heading: 'Arial', body: 'Arial' },
    layoutTips: suggestion.layout_tips || [],
    alternativeStyles: suggestion.alternative_styles || [],
    aiModel: process.env.OPENAI_MODEL || 'gpt-4o',
    tokensUsed: completion.usage?.total_tokens || 0,
  };
}
