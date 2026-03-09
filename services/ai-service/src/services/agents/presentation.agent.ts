import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const prisma = new PrismaClient();

export interface AgentResult {
  agentType: string;
  taskType: string;
  suggestions: Array<{ action: string; description: string; confidence: number }>;
  interpretation: string;
  requiresApproval: boolean;
  executedAt: Date;
}

export interface PresentationTask {
  type: 'generate_slides' | 'presenter_notes' | 'qa_generation' | 'generate_appendix';
  presentationId: string;
  topic?: string;
  data?: Array<Record<string, number | string | null>>;
  dataSummary?: Record<string, unknown>;
  slides?: Array<{
    slideNumber: number;
    title: string;
    content: string;
    chartType?: string;
    chartData?: Record<string, unknown>;
  }>;
  audienceLevel?: 'executive' | 'manager' | 'analyst' | 'technical';
  slideCount?: number;
  language?: 'ar' | 'en';
  context?: string;
}

export class PresentationAgent {
  private readonly agentType = 'presentation';

  async execute(task: PresentationTask): Promise<AgentResult> {
    switch (task.type) {
      case 'generate_slides':
        return this.generateSlides(task);
      case 'presenter_notes':
        return this.presenterNotes(task);
      case 'qa_generation':
        return this.qaGeneration(task);
      case 'generate_appendix':
        return this.generateAppendix(task);
      default: {
        const exhaustive: never = task.type;
        throw new Error(`Unsupported task type: ${exhaustive}`);
      }
    }
  }

  private async generateSlides(task: PresentationTask): Promise<AgentResult> {
    const slideCount = task.slideCount ?? 10;
    const audience = task.audienceLevel ?? 'manager';
    const language = task.language ?? 'ar';

    const prompt = `You are a presentation design strategist for a Saudi analytics platform.
Generate a slide deck outline with content for each slide.

Presentation ID: "${task.presentationId}"
Topic: "${task.topic ?? 'Data Analysis Results'}"
Number of slides: ${slideCount}
Audience: ${audience}
Language: ${language === 'ar' ? 'Arabic (formal MSA)' : 'English'}

${task.dataSummary ? `Data to present:\n${JSON.stringify(task.dataSummary, null, 2)}` : ''}
${task.context ? `Context: ${task.context}` : ''}

Respond in JSON:
{
  "suggestions": [
    {
      "action": "slide",
      "description": "JSON object with slideNumber, title, bulletPoints (array), suggestedChart (type or null), layoutType (title_slide|content|chart|comparison|closing)",
      "confidence": 0.9
    }
  ],
  "interpretation": "presentation flow summary and design rationale"
}

Requirements:
- Start with title slide, end with closing/next-steps slide
- Each slide: max 5 bullet points, max 10 words per bullet
- Suggest appropriate chart types where data visualization helps
- Follow Saudi presentation conventions (formal, data-driven)
- For Arabic: use RTL-friendly layouts, formal MSA
- Include data highlights and key metrics on relevant slides
- confidence must be between 0 and 1`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for generate_slides task');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    await prisma.auditLog.create({
      data: {
        action: 'presentation_generate_slides',
        entityType: 'presentation',
        entityId: task.presentationId,
        details: JSON.stringify({ slideCount, audience, language }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions: parsed.suggestions,
      interpretation: parsed.interpretation,
      requiresApproval: true,
      executedAt: new Date(),
    };
  }

  private async presenterNotes(task: PresentationTask): Promise<AgentResult> {
    const slides = task.slides ?? [];
    if (slides.length === 0) {
      throw new Error('slides array is required for presenter_notes task');
    }

    const audience = task.audienceLevel ?? 'manager';
    const language = task.language ?? 'ar';

    const prompt = `You are a presentation coaching expert for Saudi business presenters.
Generate presenter notes for each slide in the deck.

Presentation ID: "${task.presentationId}"
Audience: ${audience}
Language: ${language === 'ar' ? 'Arabic (formal MSA)' : 'English'}

Slides:
${slides.map((s) => `Slide ${s.slideNumber}: "${s.title}"\nContent: ${s.content}\n${s.chartType ? `Chart: ${s.chartType}` : ''}`).join('\n\n')}

${task.context ? `Presentation context: ${task.context}` : ''}

Respond in JSON:
{
  "suggestions": [
    {
      "action": "presenter_note",
      "description": "JSON with slideNumber and note text including talking points, timing suggestion, and transition phrase to next slide",
      "confidence": 0.88
    }
  ],
  "interpretation": "overall presentation flow guidance and timing breakdown"
}

Requirements:
- 2-3 talking points per slide
- Include suggested timing (in seconds) per slide
- Add transition phrases between slides
- Note where to pause for audience engagement
- For data slides: explain how to walk through the chart
- For Arabic: natural spoken Arabic (slightly less formal than slide text)
- confidence must be between 0 and 1`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for presenter_notes task');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    await prisma.auditLog.create({
      data: {
        action: 'presentation_presenter_notes',
        entityType: 'presentation',
        entityId: task.presentationId,
        details: JSON.stringify({ slidesProcessed: slides.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions: parsed.suggestions,
      interpretation: parsed.interpretation,
      requiresApproval: false,
      executedAt: new Date(),
    };
  }

  private async qaGeneration(task: PresentationTask): Promise<AgentResult> {
    const slides = task.slides ?? [];
    const audience = task.audienceLevel ?? 'executive';
    const language = task.language ?? 'ar';

    const prompt = `You are a presentation preparation coach specializing in Saudi executive presentations.
Anticipate questions that the audience might ask and prepare answers.

Presentation ID: "${task.presentationId}"
Topic: "${task.topic ?? 'Data Analysis'}"
Audience: ${audience}

${slides.length > 0 ? `Slide content:\n${slides.map((s) => `Slide ${s.slideNumber}: "${s.title}" - ${s.content}`).join('\n')}` : ''}

${task.dataSummary ? `Underlying data:\n${JSON.stringify(task.dataSummary, null, 2)}` : ''}
${task.context ? `Context: ${task.context}` : ''}

Respond in JSON:
{
  "suggestions": [
    {
      "action": "qa_pair",
      "description": "JSON with question (in ${language === 'ar' ? 'Arabic' : 'English'}), answer, difficulty (easy|medium|hard), likelyAskedBy (role)",
      "confidence": 0.85
    }
  ],
  "interpretation": "summary of the toughest questions and preparation strategy"
}

Requirements:
- Generate 8-12 anticipated questions
- Cover: methodology, data sources, implications, next steps, budget, timeline
- For executive audience: focus on ROI, strategic impact, risk
- For technical audience: focus on methodology, accuracy, limitations
- Provide thorough answers with supporting data points
- In ${language === 'ar' ? 'formal Arabic' : 'English'}
- confidence must be between 0 and 1`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for qa_generation task');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    await prisma.auditLog.create({
      data: {
        action: 'presentation_qa_generation',
        entityType: 'presentation',
        entityId: task.presentationId,
        details: JSON.stringify({ questionsGenerated: parsed.suggestions.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions: parsed.suggestions,
      interpretation: parsed.interpretation,
      requiresApproval: false,
      executedAt: new Date(),
    };
  }

  private async generateAppendix(task: PresentationTask): Promise<AgentResult> {
    const language = task.language ?? 'ar';

    const prompt = `You are a data documentation specialist for Saudi business presentations.
Generate appendix slides with supporting details, methodology notes, and data sources.

Presentation ID: "${task.presentationId}"
Topic: "${task.topic ?? 'Data Analysis'}"
Language: ${language === 'ar' ? 'Arabic' : 'English'}

${task.dataSummary ? `Data overview:\n${JSON.stringify(task.dataSummary, null, 2)}` : ''}

${task.slides ? `Main slides:\n${task.slides.map((s) => `Slide ${s.slideNumber}: "${s.title}"`).join('\n')}` : ''}

${task.context ? `Context: ${task.context}` : ''}

Respond in JSON:
{
  "suggestions": [
    {
      "action": "appendix_slide",
      "description": "JSON with slideType (methodology|data_sources|definitions|detailed_tables|references), title, content",
      "confidence": 0.88
    }
  ],
  "interpretation": "appendix structure summary and what supporting information was included"
}

Requirements:
- Methodology slide: describe analytical approach used
- Data sources slide: list all data sources with dates and reliability
- Definitions slide: glossary of technical terms used
- Detailed tables: backup data for key charts in main deck
- References: cite standards, benchmarks, or regulations mentioned
- In ${language === 'ar' ? 'formal Arabic' : 'English'}
- confidence must be between 0 and 1`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for generate_appendix task');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    await prisma.auditLog.create({
      data: {
        action: 'presentation_generate_appendix',
        entityType: 'presentation',
        entityId: task.presentationId,
        details: JSON.stringify({ appendixSlides: parsed.suggestions.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions: parsed.suggestions,
      interpretation: parsed.interpretation,
      requiresApproval: false,
      executedAt: new Date(),
    };
  }
}
