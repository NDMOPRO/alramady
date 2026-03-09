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

export interface DesignerTask {
  type: 'improve_layout' | 'check_contrast' | 'simplify' | 'rtl_check';
  resourceId: string;
  imageBase64?: string;
  imageUrl?: string;
  cssProperties?: Record<string, string>;
  componentTree?: Array<{
    id: string;
    type: string;
    children?: string[];
    styles?: Record<string, string>;
    textContent?: string;
  }>;
  context?: string;
}

export class DesignerAgent {
  private readonly agentType = 'designer';

  async execute(task: DesignerTask): Promise<AgentResult> {
    switch (task.type) {
      case 'improve_layout':
        return this.improveLayout(task);
      case 'check_contrast':
        return this.checkContrast(task);
      case 'simplify':
        return this.simplify(task);
      case 'rtl_check':
        return this.rtlCheck(task);
      default: {
        const exhaustive: never = task.type;
        throw new Error(`Unsupported task type: ${exhaustive}`);
      }
    }
  }

  private buildVisionMessages(
    task: DesignerTask,
    textPrompt: string
  ): Array<OpenAI.Chat.Completions.ChatCompletionMessageParam> {
    const content: Array<OpenAI.Chat.Completions.ChatCompletionContentPart> = [
      { type: 'text', text: textPrompt },
    ];

    if (task.imageBase64) {
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${task.imageBase64}`,
          detail: 'high',
        },
      });
    } else if (task.imageUrl) {
      content.push({
        type: 'image_url',
        image_url: {
          url: task.imageUrl,
          detail: 'high',
        },
      });
    }

    return [{ role: 'user', content }];
  }

  private async improveLayout(task: DesignerTask): Promise<AgentResult> {
    const prompt = `You are a UI/UX design expert specializing in Arabic-first RTL interfaces for the Saudi market.
Analyze this layout and suggest improvements.

Resource: "${task.resourceId}"
${task.componentTree ? `Component tree:\n${JSON.stringify(task.componentTree, null, 2)}` : ''}
${task.context ? `Context: ${task.context}` : ''}

If an image is provided, analyze its visual layout.

Respond in JSON:
{
  "suggestions": [
    { "action": "layout_improvement", "description": "specific layout change with rationale", "confidence": 0.9 }
  ],
  "interpretation": "overall layout assessment"
}

Focus on:
- Visual hierarchy and information flow (RTL reading order)
- Whitespace and breathing room
- Consistency in spacing and alignment
- Mobile responsiveness
- Saudi design conventions and cultural appropriateness
- confidence must be between 0 and 1`;

    const messages = this.buildVisionMessages(task, prompt);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for improve_layout task');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    await prisma.auditLog.create({
      data: {
        action: 'designer_improve_layout',
        entityType: 'resource',
        entityId: task.resourceId,
        details: JSON.stringify({ suggestionsCount: parsed.suggestions.length }),
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

  private async checkContrast(task: DesignerTask): Promise<AgentResult> {
    const cssInfo = task.cssProperties
      ? `CSS properties:\n${JSON.stringify(task.cssProperties, null, 2)}`
      : '';

    const prompt = `You are an accessibility and contrast specialist for Arabic-first interfaces.
Check color contrast ratios and accessibility compliance.

Resource: "${task.resourceId}"
${cssInfo}
${task.context ? `Context: ${task.context}` : ''}

If an image is provided, analyze the visual contrast of text against backgrounds.

Respond in JSON:
{
  "suggestions": [
    { "action": "fix_contrast", "description": "specific contrast issue with WCAG level and recommended fix", "confidence": 0.95 }
  ],
  "interpretation": "overall accessibility assessment with WCAG compliance level"
}

Check for:
- WCAG 2.1 AA minimum contrast ratios (4.5:1 normal text, 3:1 large text)
- Arabic text readability (diacritics visibility)
- Color blindness considerations
- Focus indicators visibility
- confidence must be between 0 and 1`;

    const messages = this.buildVisionMessages(task, prompt);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for check_contrast task');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions: parsed.suggestions,
      interpretation: parsed.interpretation,
      requiresApproval: true,
      executedAt: new Date(),
    };
  }

  private async simplify(task: DesignerTask): Promise<AgentResult> {
    const prompt = `You are a minimalist UI design expert for Arabic-first dashboards and data platforms.
Suggest ways to simplify and declutter this interface.

Resource: "${task.resourceId}"
${task.componentTree ? `Component tree:\n${JSON.stringify(task.componentTree, null, 2)}` : ''}
${task.context ? `Context: ${task.context}` : ''}

If an image is provided, analyze visual complexity.

Respond in JSON:
{
  "suggestions": [
    { "action": "simplify_element", "description": "specific simplification with before/after description", "confidence": 0.85 }
  ],
  "interpretation": "overall complexity assessment and simplification strategy"
}

Prioritize:
- Removing redundant visual elements
- Combining related controls
- Progressive disclosure for advanced features
- Reducing cognitive load
- Maintaining essential functionality
- confidence must be between 0 and 1`;

    const messages = this.buildVisionMessages(task, prompt);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for simplify task');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions: parsed.suggestions,
      interpretation: parsed.interpretation,
      requiresApproval: true,
      executedAt: new Date(),
    };
  }

  private async rtlCheck(task: DesignerTask): Promise<AgentResult> {
    const prompt = `You are an RTL (Right-to-Left) layout specialist for Arabic interfaces.
Audit this interface for RTL compliance issues.

Resource: "${task.resourceId}"
${task.componentTree ? `Component tree:\n${JSON.stringify(task.componentTree, null, 2)}` : ''}
${task.cssProperties ? `CSS properties:\n${JSON.stringify(task.cssProperties, null, 2)}` : ''}
${task.context ? `Context: ${task.context}` : ''}

If an image is provided, visually check RTL layout correctness.

Respond in JSON:
{
  "suggestions": [
    { "action": "fix_rtl", "description": "specific RTL issue with CSS/layout fix", "confidence": 0.9 }
  ],
  "interpretation": "overall RTL compliance assessment"
}

Check for:
- Text alignment (should default to right)
- Icon and arrow mirroring
- Margin/padding direction (logical properties preferred)
- Navigation flow direction
- Form field labels and placeholders alignment
- Number and date formatting (mixed LTR within RTL)
- Bidirectional text handling
- Scrollbar position
- confidence must be between 0 and 1`;

    const messages = this.buildVisionMessages(task, prompt);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for rtl_check task');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    await prisma.auditLog.create({
      data: {
        action: 'designer_rtl_check',
        entityType: 'resource',
        entityId: task.resourceId,
        details: JSON.stringify({ suggestionsCount: parsed.suggestions.length }),
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
}
