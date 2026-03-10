import { createCanvas, CanvasRenderingContext2D, Canvas } from 'canvas';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

interface PrismaDelegate {
  findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  findUnique(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  count(args: Record<string, unknown>): Promise<number>;
}

const infographicsModel = (prisma as unknown as Record<string, PrismaDelegate>).infographic;

interface Dimensions {
  width: number;
  height: number;
}

interface Position {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TimelineEvent {
  date: string;
  title: string;
  description: string;
}

interface ComparisonItem {
  name: string;
  values: Record<string, unknown>;
}

interface FlowchartStep {
  title: string;
  description: string;
}

interface InfographicElement {
  id: string;
  type: 'header' | 'stats' | 'timeline' | 'comparison' | 'flowchart' | 'text' | 'statistic';
  content: Record<string, any>;
  position: Position;
  createdAt: string;
}

const PALETTE = {
  primary: '#2563EB',
  secondary: '#7C3AED',
  accent: '#F59E0B',
  background: '#FFFFFF',
  surface: '#F8FAFC',
  text: '#1E293B',
  textSecondary: '#64748B',
  border: '#E2E8F0',
  success: '#10B981',
  error: '#EF4444',
  info: '#3B82F6',
  gradient1: '#6366F1',
  gradient2: '#8B5CF6',
};

export async function createInfographic(
  name: string,
  template: string,
  dimensions: Dimensions,
  tenantId: string,
  userId: string
): Promise<Record<string, unknown>> {
  const infographicId = randomUUID();
  const now = new Date();

  const validatedWidth = Math.max(400, Math.min(dimensions.width, 4000));
  const validatedHeight = Math.max(400, Math.min(dimensions.height, 8000));

  const templateDefaults: Record<string, { bgColor: string; fontFamily: string; accentColor: string }> = {
    modern: { bgColor: '#FFFFFF', fontFamily: 'Arial', accentColor: PALETTE.primary },
    corporate: { bgColor: '#F1F5F9', fontFamily: 'Helvetica', accentColor: '#1E40AF' },
    creative: { bgColor: '#FFFBEB', fontFamily: 'Georgia', accentColor: PALETTE.secondary },
    minimal: { bgColor: '#FAFAFA', fontFamily: 'Arial', accentColor: '#171717' },
    dark: { bgColor: '#0F172A', fontFamily: 'Arial', accentColor: '#38BDF8' },
  };

  const templateConfig = templateDefaults[template] || templateDefaults['modern'];

  const metadata = {
    id: infographicId,
    name: name.trim().substring(0, 255),
    template,
    width: validatedWidth,
    height: validatedHeight,
    bgColor: templateConfig.bgColor,
    fontFamily: templateConfig.fontFamily,
    accentColor: templateConfig.accentColor,
    elementsJson: JSON.stringify([]),
    status: 'draft',
    version: 1,
  };

  const record = await infographicsModel.create({
    data: {
      id: infographicId,
      name: metadata.name,
      template: metadata.template,
      width: metadata.width,
      height: metadata.height,
      bg_color: metadata.bgColor,
      font_family: metadata.fontFamily,
      accent_color: metadata.accentColor,
      elements_json: metadata.elementsJson,
      status: metadata.status,
      version: metadata.version,
      tenant_id: tenantId,
      user_id: userId,
      created_at: now,
      updated_at: now,
    },
  });

  return {
    id: record.id,
    name: record.name,
    template: record.template,
    dimensions: { width: record.width, height: record.height },
    bgColor: record.bg_color,
    fontFamily: record.font_family,
    accentColor: record.accent_color,
    status: record.status,
    version: record.version,
    tenantId: record.tenant_id,
    userId: record.user_id,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export async function addSection(
  infographicId: string,
  type: 'header' | 'stats' | 'timeline' | 'comparison' | 'flowchart' | 'text',
  content: Record<string, unknown> | string,
  position: Position
): Promise<Record<string, unknown>> {
  const infographic = await infographicsModel.findUnique({
    where: { id: infographicId },
  });

  if (!infographic) {
    throw new Error(`Infographic with id ${infographicId} not found`);
  }

  const existingElements: InfographicElement[] = JSON.parse((infographic.elements_json as string) || '[]');

  const igWidth = infographic.width as number;
  const igHeight = infographic.height as number;
  const clampedPosition: Position = {
    x: Math.max(0, Math.min(position.x, igWidth - 10)),
    y: Math.max(0, Math.min(position.y, igHeight - 10)),
    w: Math.max(50, Math.min(position.w, igWidth - position.x)),
    h: Math.max(30, Math.min(position.h, igHeight - position.y)),
  };

  const sanitizedContent: Record<string, unknown> = typeof content === 'string' ? { text: content } : { ...content };
  if (type === 'header' && !sanitizedContent.fontSize) {
    sanitizedContent.fontSize = 32;
  }
  if (type === 'text' && !sanitizedContent.fontSize) {
    sanitizedContent.fontSize = 16;
  }
  if (!sanitizedContent.color) {
    sanitizedContent.color = PALETTE.text;
  }
  if (!sanitizedContent.bgColor) {
    sanitizedContent.bgColor = 'transparent';
  }

  const element: InfographicElement = {
    id: randomUUID(),
    type,
    content: sanitizedContent,
    position: clampedPosition,
    createdAt: new Date().toISOString(),
  };

  existingElements.push(element);

  const updated = await infographicsModel.update({
    where: { id: infographicId },
    data: {
      elements_json: JSON.stringify(existingElements),
      updated_at: new Date(),
      version: { increment: 1 },
    },
  });

  return {
    element,
    totalElements: existingElements.length,
    infographicVersion: updated.version,
  };
}

export async function addStatistic(
  infographicId: string,
  value: string,
  label: string,
  icon: string,
  position: Position
): Promise<Record<string, unknown>> {
  const infographic = await infographicsModel.findUnique({
    where: { id: infographicId },
  });

  if (!infographic) {
    throw new Error(`Infographic with id ${infographicId} not found`);
  }

  const existingElements: InfographicElement[] = JSON.parse((infographic.elements_json as string) || '[]');

  const statContent = {
    value: value.toString().substring(0, 50),
    label: label.substring(0, 100),
    icon: icon.substring(0, 50),
    valueColor: PALETTE.primary,
    labelColor: PALETTE.textSecondary,
    bgColor: PALETTE.surface,
    borderColor: PALETTE.border,
    valueFontSize: 48,
    labelFontSize: 14,
  };

  const element: InfographicElement = {
    id: randomUUID(),
    type: 'statistic',
    content: statContent,
    position: {
      x: Math.max(0, position.x),
      y: Math.max(0, position.y),
      w: Math.max(100, position.w),
      h: Math.max(80, position.h),
    },
    createdAt: new Date().toISOString(),
  };

  existingElements.push(element);

  const updated = await infographicsModel.update({
    where: { id: infographicId },
    data: {
      elements_json: JSON.stringify(existingElements),
      updated_at: new Date(),
      version: { increment: 1 },
    },
  });

  return {
    element,
    totalElements: existingElements.length,
    infographicVersion: updated.version,
  };
}

export async function addTimeline(
  infographicId: string,
  events: TimelineEvent[],
  position: Position
): Promise<Record<string, unknown>> {
  const infographic = await infographicsModel.findUnique({
    where: { id: infographicId },
  });

  if (!infographic) {
    throw new Error(`Infographic with id ${infographicId} not found`);
  }

  const existingElements: InfographicElement[] = JSON.parse((infographic.elements_json as string) || '[]');

  const sortedEvents = [...events]
    .filter((e) => e.date && e.title)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (sortedEvents.length === 0) {
    throw new Error('At least one valid event with date and title is required');
  }

  const sanitizedEvents = sortedEvents.map((event, index) => ({
    date: event.date,
    title: event.title.substring(0, 200),
    description: (event.description || '').substring(0, 500),
    index,
    color: [PALETTE.primary, PALETTE.secondary, PALETTE.accent, PALETTE.success, PALETTE.info][index % 5],
  }));

  const timelineContent = {
    events: sanitizedEvents,
    lineColor: PALETTE.border,
    dotRadius: 8,
    connectorWidth: 3,
    titleFontSize: 16,
    dateFontSize: 12,
    descFontSize: 13,
    orientation: 'vertical',
  };

  const element: InfographicElement = {
    id: randomUUID(),
    type: 'timeline',
    content: timelineContent,
    position: {
      x: Math.max(0, position.x),
      y: Math.max(0, position.y),
      w: Math.max(200, position.w),
      h: Math.max(sanitizedEvents.length * 80, position.h),
    },
    createdAt: new Date().toISOString(),
  };

  existingElements.push(element);

  const updated = await infographicsModel.update({
    where: { id: infographicId },
    data: {
      elements_json: JSON.stringify(existingElements),
      updated_at: new Date(),
      version: { increment: 1 },
    },
  });

  return {
    element,
    eventsCount: sanitizedEvents.length,
    totalElements: existingElements.length,
    infographicVersion: updated.version,
  };
}

export async function addComparison(
  infographicId: string,
  items: ComparisonItem[],
  position: Position
): Promise<Record<string, unknown>> {
  const infographic = await infographicsModel.findUnique({
    where: { id: infographicId },
  });

  if (!infographic) {
    throw new Error(`Infographic with id ${infographicId} not found`);
  }

  if (!items || items.length < 2) {
    throw new Error('At least two items are required for comparison');
  }

  const existingElements: InfographicElement[] = JSON.parse((infographic.elements_json as string) || '[]');

  const allKeys = new Set<string>();
  items.forEach((item) => {
    Object.keys(item.values).forEach((key) => allKeys.add(key));
  });

  const sanitizedItems = items.map((item, index) => ({
    name: item.name.substring(0, 100),
    values: Object.fromEntries(
      Array.from(allKeys).map((key) => [key, item.values[key] ?? 'N/A'])
    ),
    color: [PALETTE.primary, PALETTE.secondary, PALETTE.accent, PALETTE.success][index % 4],
    index,
  }));

  const comparisonContent = {
    items: sanitizedItems,
    keys: Array.from(allKeys),
    headerBgColor: PALETTE.primary,
    headerTextColor: '#FFFFFF',
    rowBgColors: [PALETTE.surface, '#FFFFFF'],
    borderColor: PALETTE.border,
    headerFontSize: 16,
    cellFontSize: 14,
    nameFontSize: 18,
  };

  const element: InfographicElement = {
    id: randomUUID(),
    type: 'comparison',
    content: comparisonContent,
    position: {
      x: Math.max(0, position.x),
      y: Math.max(0, position.y),
      w: Math.max(300, position.w),
      h: Math.max(150, position.h),
    },
    createdAt: new Date().toISOString(),
  };

  existingElements.push(element);

  const updated = await infographicsModel.update({
    where: { id: infographicId },
    data: {
      elements_json: JSON.stringify(existingElements),
      updated_at: new Date(),
      version: { increment: 1 },
    },
  });

  return {
    element,
    comparedItems: sanitizedItems.length,
    comparisonKeys: Array.from(allKeys),
    totalElements: existingElements.length,
    infographicVersion: updated.version,
  };
}

export async function addFlowchart(
  infographicId: string,
  steps: FlowchartStep[],
  position: Position
): Promise<Record<string, unknown>> {
  const infographic = await infographicsModel.findUnique({
    where: { id: infographicId },
  });

  if (!infographic) {
    throw new Error(`Infographic with id ${infographicId} not found`);
  }

  if (!steps || steps.length < 2) {
    throw new Error('At least two steps are required for a flowchart');
  }

  const existingElements: InfographicElement[] = JSON.parse((infographic.elements_json as string) || '[]');

  const sanitizedSteps = steps.map((step, index) => ({
    title: step.title.substring(0, 100),
    description: (step.description || '').substring(0, 300),
    index,
    color: [PALETTE.primary, PALETTE.secondary, PALETTE.accent, PALETTE.success, PALETTE.info][index % 5],
    shape: index === 0 ? 'rounded' : index === steps.length - 1 ? 'rounded' : 'rect',
  }));

  const flowchartContent = {
    steps: sanitizedSteps,
    arrowColor: PALETTE.textSecondary,
    arrowWidth: 2,
    stepWidth: 160,
    stepHeight: 70,
    stepGap: 40,
    titleFontSize: 14,
    descFontSize: 11,
    orientation: 'horizontal',
    connectorType: 'arrow',
  };

  const element: InfographicElement = {
    id: randomUUID(),
    type: 'flowchart',
    content: flowchartContent,
    position: {
      x: Math.max(0, position.x),
      y: Math.max(0, position.y),
      w: Math.max(sanitizedSteps.length * 200, position.w),
      h: Math.max(120, position.h),
    },
    createdAt: new Date().toISOString(),
  };

  existingElements.push(element);

  const updated = await infographicsModel.update({
    where: { id: infographicId },
    data: {
      elements_json: JSON.stringify(existingElements),
      updated_at: new Date(),
      version: { increment: 1 },
    },
  });

  return {
    element,
    stepsCount: sanitizedSteps.length,
    totalElements: existingElements.length,
    infographicVersion: updated.version,
  };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
): void {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): number {
  const words = text.split(' ');
  let line = '';
  let currentY = y;
  let lineCount = 0;

  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && i > 0) {
      ctx.fillText(line.trim(), x, currentY);
      line = words[i] + ' ';
      currentY += lineHeight;
      lineCount++;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), x, currentY);
  lineCount++;
  return lineCount;
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
  width: number
): void {
  const headLength = 10;
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - headLength * Math.cos(angle - Math.PI / 6),
    toY - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    toX - headLength * Math.cos(angle + Math.PI / 6),
    toY - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export async function renderInfographic(infographicId: string): Promise<Buffer> {
  const infographic = await infographicsModel.findUnique({
    where: { id: infographicId },
  });

  if (!infographic) {
    throw new Error(`Infographic with id ${infographicId} not found`);
  }

  const width = infographic.width as number;
  const height = infographic.height as number;
  const canvas: Canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Fill background
  ctx.fillStyle = (infographic.bg_color as string) || '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Draw subtle grid pattern on background
  ctx.strokeStyle = 'rgba(0,0,0,0.03)';
  ctx.lineWidth = 0.5;
  for (let gx = 0; gx < width; gx += 20) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, height);
    ctx.stroke();
  }
  for (let gy = 0; gy < height; gy += 20) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(width, gy);
    ctx.stroke();
  }

  // Draw accent bar at top
  const accentColor = (infographic.accent_color as string) || PALETTE.primary;
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 0, width, 6);

  const fontFamily = (infographic.font_family as string) || 'Arial';
  const elements: InfographicElement[] = JSON.parse((infographic.elements_json as string) || '[]');

  for (const element of elements) {
    const { type, content, position } = element;
    const { x, y, w, h } = position;

    ctx.save();

    if (type === 'header') {
      // Draw header section with gradient background
      const gradient = ctx.createLinearGradient(x, y, x + w, y);
      gradient.addColorStop(0, accentColor);
      gradient.addColorStop(1, PALETTE.gradient2);
      ctx.fillStyle = gradient;
      drawRoundedRect(ctx, x, y, w, h, 8);
      ctx.fill();

      // Draw header text
      const fontSize = content.fontSize || 32;
      ctx.font = `bold ${fontSize}px ${fontFamily}`;
      ctx.fillStyle = content.textColor || '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const headerText = content.text || content.title || 'Header';
      ctx.fillText(headerText, x + w / 2, y + h / 2);

      // Draw underline accent
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      const textWidth = ctx.measureText(headerText).width;
      ctx.beginPath();
      ctx.moveTo(x + w / 2 - textWidth / 2, y + h / 2 + fontSize / 2 + 4);
      ctx.lineTo(x + w / 2 + textWidth / 2, y + h / 2 + fontSize / 2 + 4);
      ctx.stroke();

    } else if (type === 'text') {
      // Draw text section background
      if (content.bgColor && content.bgColor !== 'transparent') {
        ctx.fillStyle = content.bgColor;
        drawRoundedRect(ctx, x, y, w, h, 6);
        ctx.fill();
      }

      // Draw border
      ctx.strokeStyle = content.borderColor || PALETTE.border;
      ctx.lineWidth = 1;
      drawRoundedRect(ctx, x, y, w, h, 6);
      ctx.stroke();

      // Draw text content with word wrapping
      const fontSize = content.fontSize || 16;
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.fillStyle = content.color || PALETTE.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const padding = 12;
      const textContent = content.text || '';
      wrapText(ctx, textContent, x + padding, y + padding, w - padding * 2, fontSize * 1.5);

    } else if (type === 'statistic' || type === 'stats') {
      // Draw stat card background with shadow effect
      ctx.fillStyle = 'rgba(0,0,0,0.05)';
      drawRoundedRect(ctx, x + 3, y + 3, w, h, 12);
      ctx.fill();

      ctx.fillStyle = content.bgColor || PALETTE.surface;
      drawRoundedRect(ctx, x, y, w, h, 12);
      ctx.fill();

      // Draw left accent border
      ctx.fillStyle = content.valueColor || PALETTE.primary;
      drawRoundedRect(ctx, x, y, 5, h, 12);
      ctx.fill();

      // Draw border
      ctx.strokeStyle = content.borderColor || PALETTE.border;
      ctx.lineWidth = 1;
      drawRoundedRect(ctx, x, y, w, h, 12);
      ctx.stroke();

      // Draw icon background circle
      const iconRadius = 20;
      const iconCenterX = x + 30;
      const iconCenterY = y + h / 2;
      ctx.fillStyle = accentColor + '20';
      ctx.beginPath();
      ctx.arc(iconCenterX, iconCenterY, iconRadius, 0, Math.PI * 2);
      ctx.fill();

      // Draw icon text
      ctx.font = `${iconRadius}px ${fontFamily}`;
      ctx.fillStyle = accentColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const iconChar = content.icon ? content.icon.charAt(0).toUpperCase() : '★';
      ctx.fillText(iconChar, iconCenterX, iconCenterY);

      // Draw value
      const valueFontSize = content.valueFontSize || 48;
      ctx.font = `bold ${valueFontSize}px ${fontFamily}`;
      ctx.fillStyle = content.valueColor || PALETTE.primary;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const valueText = content.value || '0';
      const valueX = x + 60;
      ctx.fillText(valueText, valueX, y + h / 2 + 5);

      // Draw label
      const labelFontSize = content.labelFontSize || 14;
      ctx.font = `${labelFontSize}px ${fontFamily}`;
      ctx.fillStyle = content.labelColor || PALETTE.textSecondary;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const labelText = content.label || '';
      ctx.fillText(labelText, valueX, y + h / 2 + 14);

    } else if (type === 'timeline') {
      const events = content.events || [];
      const lineX = x + 30;
      const dotRadius = content.dotRadius || 8;
      const titleFontSize = content.titleFontSize || 16;
      const dateFontSize = content.dateFontSize || 12;
      const descFontSize = content.descFontSize || 13;
      const eventSpacing = Math.min(h / Math.max(events.length, 1), 100);

      // Draw main vertical timeline line
      ctx.strokeStyle = content.lineColor || PALETTE.border;
      ctx.lineWidth = content.connectorWidth || 3;
      ctx.beginPath();
      ctx.moveTo(lineX, y + 10);
      ctx.lineTo(lineX, y + h - 10);
      ctx.stroke();

      // Draw each event
      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        const eventY = y + 20 + i * eventSpacing;
        const eventColor = event.color || PALETTE.primary;

        // Draw dot
        ctx.fillStyle = eventColor;
        ctx.beginPath();
        ctx.arc(lineX, eventY, dotRadius, 0, Math.PI * 2);
        ctx.fill();

        // Draw outer ring
        ctx.strokeStyle = eventColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(lineX, eventY, dotRadius + 4, 0, Math.PI * 2);
        ctx.stroke();

        // Draw connector line from dot to content
        ctx.strokeStyle = eventColor + '60';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(lineX + dotRadius + 6, eventY);
        ctx.lineTo(x + 70, eventY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw date
        ctx.font = `bold ${dateFontSize}px ${fontFamily}`;
        ctx.fillStyle = eventColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(event.date, x + 75, eventY - 12);

        // Draw title
        ctx.font = `bold ${titleFontSize}px ${fontFamily}`;
        ctx.fillStyle = PALETTE.text;
        ctx.fillText(event.title.substring(0, 40), x + 75, eventY + 6);

        // Draw description
        if (event.description) {
          ctx.font = `${descFontSize}px ${fontFamily}`;
          ctx.fillStyle = PALETTE.textSecondary;
          wrapText(ctx, event.description, x + 75, eventY + 24, w - 100, descFontSize * 1.4);
        }
      }

    } else if (type === 'comparison') {
      const items = content.items || [];
      const keys = content.keys || [];
      const headerFontSize = content.headerFontSize || 16;
      const cellFontSize = content.cellFontSize || 14;
      const colWidth = w / (items.length + 1);
      const rowHeight = Math.min(40, h / (keys.length + 2));

      // Draw table border
      ctx.strokeStyle = content.borderColor || PALETTE.border;
      ctx.lineWidth = 1;
      drawRoundedRect(ctx, x, y, w, h, 8);
      ctx.stroke();
      ctx.save();
      drawRoundedRect(ctx, x, y, w, h, 8);
      ctx.clip();

      // Draw header row
      ctx.fillStyle = content.headerBgColor || PALETTE.primary;
      ctx.fillRect(x, y, w, rowHeight + 10);

      // Draw header labels (item names)
      ctx.font = `bold ${headerFontSize}px ${fontFamily}`;
      ctx.fillStyle = content.headerTextColor || '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Feature', x + colWidth / 2, y + (rowHeight + 10) / 2);

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        ctx.fillText(
          item.name.substring(0, 15),
          x + colWidth * (i + 1) + colWidth / 2,
          y + (rowHeight + 10) / 2
        );
      }

      // Draw data rows
      for (let r = 0; r < keys.length; r++) {
        const rowY = y + rowHeight + 10 + r * rowHeight;
        const bgColors = content.rowBgColors || [PALETTE.surface, '#FFFFFF'];
        ctx.fillStyle = bgColors[r % bgColors.length];
        ctx.fillRect(x, rowY, w, rowHeight);

        // Draw row border
        ctx.strokeStyle = PALETTE.border;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, rowY + rowHeight);
        ctx.lineTo(x + w, rowY + rowHeight);
        ctx.stroke();

        // Draw key label
        ctx.font = `${cellFontSize}px ${fontFamily}`;
        ctx.fillStyle = PALETTE.textSecondary;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(keys[r].substring(0, 20), x + 10, rowY + rowHeight / 2);

        // Draw values
        ctx.textAlign = 'center';
        ctx.fillStyle = PALETTE.text;
        for (let i = 0; i < items.length; i++) {
          const val = String(items[i].values[keys[r]] ?? 'N/A');
          ctx.fillText(val.substring(0, 20), x + colWidth * (i + 1) + colWidth / 2, rowY + rowHeight / 2);
        }
      }

      ctx.restore();

    } else if (type === 'flowchart') {
      const steps = content.steps || [];
      const stepWidth = content.stepWidth || 160;
      const stepHeight = content.stepHeight || 70;
      const stepGap = content.stepGap || 40;
      const titleFontSize = content.titleFontSize || 14;
      const descFontSize = content.descFontSize || 11;

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepX = x + i * (stepWidth + stepGap);
        const stepY = y + (h - stepHeight) / 2;
        const stepColor = step.color || PALETTE.primary;

        // Draw shadow
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        if (step.shape === 'rounded') {
          drawRoundedRect(ctx, stepX + 3, stepY + 3, stepWidth, stepHeight, 20);
        } else {
          drawRoundedRect(ctx, stepX + 3, stepY + 3, stepWidth, stepHeight, 8);
        }
        ctx.fill();

        // Draw step box
        ctx.fillStyle = '#FFFFFF';
        if (step.shape === 'rounded') {
          drawRoundedRect(ctx, stepX, stepY, stepWidth, stepHeight, 20);
        } else {
          drawRoundedRect(ctx, stepX, stepY, stepWidth, stepHeight, 8);
        }
        ctx.fill();

        // Draw colored top border
        ctx.fillStyle = stepColor;
        if (step.shape === 'rounded') {
          drawRoundedRect(ctx, stepX, stepY, stepWidth, 5, 20);
        } else {
          ctx.fillRect(stepX, stepY, stepWidth, 5);
        }
        ctx.fill();

        // Draw border
        ctx.strokeStyle = stepColor + '40';
        ctx.lineWidth = 1.5;
        if (step.shape === 'rounded') {
          drawRoundedRect(ctx, stepX, stepY, stepWidth, stepHeight, 20);
        } else {
          drawRoundedRect(ctx, stepX, stepY, stepWidth, stepHeight, 8);
        }
        ctx.stroke();

        // Draw step number circle
        const numRadius = 12;
        const numX = stepX + stepWidth / 2;
        const numY = stepY + 20;
        ctx.fillStyle = stepColor;
        ctx.beginPath();
        ctx.arc(numX, numY, numRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = `bold 11px ${fontFamily}`;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), numX, numY);

        // Draw title
        ctx.font = `bold ${titleFontSize}px ${fontFamily}`;
        ctx.fillStyle = PALETTE.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(step.title.substring(0, 18), stepX + stepWidth / 2, stepY + 36);

        // Draw description
        if (step.description) {
          ctx.font = `${descFontSize}px ${fontFamily}`;
          ctx.fillStyle = PALETTE.textSecondary;
          wrapText(
            ctx,
            step.description.substring(0, 60),
            stepX + 10,
            stepY + 54,
            stepWidth - 20,
            descFontSize * 1.3
          );
        }

        // Draw arrow to next step
        if (i < steps.length - 1) {
          const arrowFromX = stepX + stepWidth + 4;
          const arrowToX = stepX + stepWidth + stepGap - 4;
          const arrowY = stepY + stepHeight / 2;
          drawArrow(ctx, arrowFromX, arrowY, arrowToX, arrowY, content.arrowColor || PALETTE.textSecondary, content.arrowWidth || 2);
        }
      }
    }

    ctx.restore();
  }

  // Draw footer bar
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, height - 4, width, 4);

  // Draw watermark
  ctx.font = `10px ${fontFamily}`;
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('Generated by RASID Infographic Service', width - 10, height - 8);

  const buffer = canvas.toBuffer('image/png');
  return buffer;
}

export async function exportToImage(
  infographicId: string,
  format: 'png' | 'jpeg' | 'webp',
  resolution?: number
): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
  const infographic = await infographicsModel.findUnique({
    where: { id: infographicId },
  });

  if (!infographic) {
    throw new Error(`Infographic with id ${infographicId} not found`);
  }

  const rawBuffer = await renderInfographic(infographicId);
  const scale = resolution ? resolution / 72 : 1;
  const targetWidth = Math.round((infographic.width as number) * scale);
  const targetHeight = Math.round((infographic.height as number) * scale);

  let sharpInstance = sharp(rawBuffer).resize(targetWidth, targetHeight, {
    fit: 'fill',
    kernel: sharp.kernel.lanczos3,
  });

  let contentType: string;
  let extension: string;

  if (format === 'jpeg') {
    sharpInstance = sharpInstance.jpeg({ quality: 90, progressive: true, mozjpeg: true });
    contentType = 'image/jpeg';
    extension = 'jpg';
  } else if (format === 'webp') {
    sharpInstance = sharpInstance.webp({ quality: 90, effort: 4, lossless: false });
    contentType = 'image/webp';
    extension = 'webp';
  } else {
    sharpInstance = sharpInstance.png({ compressionLevel: 6, progressive: false });
    contentType = 'image/png';
    extension = 'png';
  }

  const outputBuffer = await sharpInstance.toBuffer();
  const sanitizedName = ((infographic.name as string) || 'infographic').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${sanitizedName}_${infographicId.substring(0, 8)}.${extension}`;

  return { buffer: outputBuffer, contentType, filename };
}

export async function exportToPDF(
  infographicId: string
): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
  const infographic = await infographicsModel.findUnique({
    where: { id: infographicId },
  });

  if (!infographic) {
    throw new Error(`Infographic with id ${infographicId} not found`);
  }

  const imageBuffer = await renderInfographic(infographicId);
  const imgBase64 = imageBuffer.toString('base64');
  const pageWidth = infographic.width as number;
  const pageHeight = infographic.height as number;

  const pdfHeader = '%PDF-1.4\n';
  const catalog = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const pages = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
  const imageData = Buffer.from(imgBase64, 'base64');
  const imageStream = `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pageWidth} /Height ${pageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageData.length} >>\nstream\n`;

  const jpegBuffer = await sharp(imageBuffer)
    .jpeg({ quality: 95 })
    .toBuffer();

  const mediaBox = `[0 0 ${pageWidth} ${pageHeight}]`;
  const contentStream = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Img1 Do Q`;
  const contentStreamObj = `5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj\n`;

  const imageObj = `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pageWidth} /Height ${pageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBuffer.length} >>\nstream\n`;
  const imageObjEnd = `\nendstream\nendobj\n`;

  const page = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox ${mediaBox} /Contents 5 0 R /Resources << /XObject << /Img1 4 0 R >> >> >>\nendobj\n`;

  const parts: Buffer[] = [];
  parts.push(Buffer.from(pdfHeader, 'ascii'));
  parts.push(Buffer.from(catalog, 'ascii'));
  parts.push(Buffer.from(pages, 'ascii'));
  parts.push(Buffer.from(page, 'ascii'));
  parts.push(Buffer.from(imageObj, 'ascii'));
  parts.push(jpegBuffer);
  parts.push(Buffer.from(imageObjEnd, 'ascii'));
  parts.push(Buffer.from(contentStreamObj, 'ascii'));

  const xrefOffset = parts.reduce((sum, p) => sum + p.length, 0);
  const xref = `xref\n0 6\n0000000000 65535 f \n`;
  const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  parts.push(Buffer.from(xref, 'ascii'));
  parts.push(Buffer.from(trailer, 'ascii'));

  const pdfBuffer = Buffer.concat(parts);
  const sanitizedName = ((infographic.name as string) || 'infographic').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${sanitizedName}_${infographicId.substring(0, 8)}.pdf`;

  return { buffer: pdfBuffer, contentType: 'application/pdf', filename };
}
