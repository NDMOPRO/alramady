import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import {
  VisualAnalysis,
  TextBlock,
  ChartDetection,
  LayoutElement,
  ImageComparison,
  compareImages,
  calculateSSIM,
  extractColorPalette,
  extractLayout,
} from './visual-analyzer.service.js';

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

export interface ReplicationJob {
  id: string;
  tenantId: string;
  userId: string;
  status: string;
  targetFormat: string;
  documentStructure: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface FidelityScore {
  overall: number;
  pixelMatch: number;
  ssim: number;
  colorMatch: number;
  layoutMatch: number;
  breakdown: {
    pixelWeight: number;
    ssimWeight: number;
    colorWeight: number;
    layoutWeight: number;
  };
}

export interface DiffReport {
  id: string;
  pixelComparison: ImageComparison;
  colorComparison: {
    originalColors: string[];
    replicaColors: string[];
    commonColors: string[];
    missingColors: string[];
    extraColors: string[];
    colorMatchScore: number;
  };
  layoutComparison: {
    originalLayout: Record<string, unknown>;
    replicaLayout: Record<string, unknown>;
    layoutMatchScore: number;
    differences: string[];
  };
  overallSimilarity: number;
  generatedAt: string;
}

export async function replicateDocument(
  analysis: VisualAnalysis,
  targetFormat: 'pdf' | 'docx' | 'pptx',
  tenantId: string,
  userId: string
): Promise<ReplicationJob> {
  const jobId = uuidv4();
  const textBlocks = analysis.textContent || [];
  const layoutElements = analysis.layout?.elements || [];
  const charts = analysis.charts || [];
  const tables = analysis.dataTables || [];

  const sortedTextBlocks = [...textBlocks].sort((a, b) => {
    const yDiff = a.position.y - b.position.y;
    if (Math.abs(yDiff) > 5) return yDiff;
    return a.position.x - b.position.x;
  });

  const documentElements: Record<string, unknown>[] = [];

  for (const block of sortedTextBlocks) {
    const isHeading = block.fontSize === 'xlarge' || block.fontSize === 'large' || block.fontWeight === 'bold';
    const elementType = isHeading ? 'heading' : 'paragraph';
    const headingLevel = block.fontSize === 'xlarge' ? 1 : block.fontSize === 'large' ? 2 : 3;

    documentElements.push({
      type: elementType,
      content: block.text,
      style: {
        fontSize: block.fontSize,
        fontWeight: block.fontWeight,
        alignment: block.alignment,
        headingLevel: isHeading ? headingLevel : undefined,
      },
      position: block.position,
      order: documentElements.length,
    });
  }

  for (const chart of charts) {
    documentElements.push({
      type: 'chart',
      chartType: chart.type,
      title: chart.title,
      data: chart.dataPoints,
      colors: chart.colors,
      position: chart.position,
      order: documentElements.length,
    });
  }

  for (const table of tables) {
    documentElements.push({
      type: 'table',
      headers: table.headers,
      rows: table.rows,
      position: table.position,
      order: documentElements.length,
    });
  }

  const documentStructure = {
    format: targetFormat,
    pageSize: {
      width: analysis.dimensions.width,
      height: analysis.dimensions.height,
    },
    layout: {
      columns: analysis.layout?.columns || 1,
      gridStructure: analysis.layout?.gridStructure || 'single-column',
      spacing: analysis.layout?.spacing || 'normal',
    },
    elements: documentElements,
    styling: {
      colors: analysis.colors,
      fonts: analysis.fonts,
    },
    metadata: {
      sourceAnalysisTimestamp: analysis.timestamp,
      elementCount: documentElements.length,
      textBlockCount: sortedTextBlocks.length,
      chartCount: charts.length,
      tableCount: tables.length,
    },
  };

  const job = await prisma.replicationJob.create({
    data: {
      id: jobId,
      tenantId: tenantId,
      userId: userId,
      status: 'completed',
      targetFormat: targetFormat,
      documentStructure: JSON.parse(JSON.stringify(documentStructure)),
      elementCount: documentElements.length,
      sourceDimensions: JSON.parse(JSON.stringify(analysis.dimensions)),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return {
    id: job.id,
    tenantId: job.tenantId,
    userId: job.userId || '',
    status: job.status,
    targetFormat: job.targetFormat || '',
    documentStructure,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export async function replicateDashboard(
  analysis: VisualAnalysis,
  tenantId: string,
  userId: string
): Promise<ReplicationJob> {
  const jobId = uuidv4();
  const charts = analysis.charts || [];
  const tables = analysis.dataTables || [];
  const textBlocks = analysis.textContent || [];
  const layoutElements = analysis.layout?.elements || [];

  const widgets: Record<string, unknown>[] = [];

  for (const chart of charts) {
    const widgetConfig: Record<string, unknown> = {
      type: 'chart',
      chartType: chart.type,
      title: chart.title,
      position: chart.position,
      data: {
        labels: chart.dataPoints.map((dp) => dp.label),
        values: chart.dataPoints.map((dp) => dp.value),
        datasets: [
          {
            label: chart.title,
            data: chart.dataPoints.map((dp) => dp.value),
            backgroundColor: chart.colors.length > 0 ? chart.colors : ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
    };
    widgets.push(widgetConfig);
  }

  for (const table of tables) {
    widgets.push({
      type: 'data-table',
      title: 'Data Table',
      position: table.position,
      columns: table.headers.map((header, idx) => ({
        key: `col_${idx}`,
        label: header,
        sortable: true,
      })),
      rows: table.rows.map((row, rowIdx) => {
        const rowObj: Record<string, unknown> = { id: `row_${rowIdx}` };
        table.headers.forEach((_, colIdx) => {
          rowObj[`col_${colIdx}`] = row[colIdx] || '';
        });
        return rowObj;
      }),
    });
  }

  const headerBlocks = textBlocks.filter(
    (tb) => tb.fontSize === 'xlarge' || tb.fontSize === 'large'
  );
  for (const header of headerBlocks) {
    widgets.push({
      type: 'text-widget',
      content: header.text,
      style: {
        fontSize: header.fontSize,
        fontWeight: header.fontWeight,
        alignment: header.alignment,
      },
      position: header.position,
    });
  }

  const kpiBlocks = textBlocks.filter(
    (tb) => /^\d+[\d,.%$€£]*$/.test(tb.text.trim()) || tb.fontSize === 'xlarge'
  );
  for (const kpi of kpiBlocks) {
    widgets.push({
      type: 'kpi-card',
      value: kpi.text,
      position: kpi.position,
      style: { fontSize: kpi.fontSize, fontWeight: 'bold' },
    });
  }

  const dashboardStructure = {
    format: 'dashboard',
    gridLayout: {
      columns: analysis.layout?.columns || 2,
      rows: analysis.layout?.rows || 2,
      gap: '16px',
    },
    widgets,
    theme: {
      colors: analysis.colors,
      fonts: analysis.fonts,
      background: analysis.colors.length > 0 ? analysis.colors[analysis.colors.length - 1] : '#ffffff',
    },
    metadata: {
      widgetCount: widgets.length,
      chartCount: charts.length,
      tableCount: tables.length,
      sourceAnalysisTimestamp: analysis.timestamp,
    },
  };

  const job = await prisma.replicationJob.create({
    data: {
      id: jobId,
      tenantId: tenantId,
      userId: userId,
      status: 'completed',
      targetFormat: 'dashboard',
      documentStructure: JSON.parse(JSON.stringify(dashboardStructure)),
      elementCount: widgets.length,
      sourceDimensions: JSON.parse(JSON.stringify(analysis.dimensions)),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return {
    id: job.id,
    tenantId: job.tenantId,
    userId: job.userId || '',
    status: job.status,
    targetFormat: job.targetFormat || '',
    documentStructure: dashboardStructure,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export async function replicatePresentation(
  analysis: VisualAnalysis,
  tenantId: string,
  userId: string
): Promise<ReplicationJob> {
  const jobId = uuidv4();
  const textBlocks = analysis.textContent || [];
  const charts = analysis.charts || [];
  const tables = analysis.dataTables || [];
  const layoutElements = analysis.layout?.elements || [];

  const slides: Record<string, unknown>[] = [];

  const titleBlocks = textBlocks.filter(
    (tb) => tb.fontSize === 'xlarge' && tb.position.y < 20
  );
  const subtitleBlocks = textBlocks.filter(
    (tb) => tb.fontSize === 'large' && tb.position.y < 30
  );
  const bodyBlocks = textBlocks.filter(
    (tb) => tb.fontSize !== 'xlarge' && !(tb.fontSize === 'large' && tb.position.y < 30)
  );

  if (titleBlocks.length > 0) {
    slides.push({
      slideNumber: 1,
      type: 'title',
      elements: [
        {
          type: 'title',
          content: titleBlocks[0].text,
          position: { x: 10, y: 30, width: 80, height: 20 },
          style: { fontSize: '44pt', fontWeight: 'bold', alignment: 'center' },
        },
        ...(subtitleBlocks.length > 0
          ? [
              {
                type: 'subtitle',
                content: subtitleBlocks[0].text,
                position: { x: 15, y: 55, width: 70, height: 10 },
                style: { fontSize: '24pt', fontWeight: 'normal', alignment: 'center' },
              },
            ]
          : []),
      ],
    });
  }

  if (bodyBlocks.length > 0) {
    const bulletPoints = bodyBlocks.map((block) => block.text);
    const chunkedBullets: string[][] = [];
    for (let i = 0; i < bulletPoints.length; i += 6) {
      chunkedBullets.push(bulletPoints.slice(i, i + 6));
    }

    for (const chunk of chunkedBullets) {
      slides.push({
        slideNumber: slides.length + 1,
        type: 'content',
        elements: [
          {
            type: 'body',
            content: chunk,
            position: { x: 5, y: 15, width: 90, height: 75 },
            style: { fontSize: '18pt', fontWeight: 'normal', alignment: 'left', bulletStyle: 'disc' },
          },
        ],
      });
    }
  }

  for (const chart of charts) {
    slides.push({
      slideNumber: slides.length + 1,
      type: 'chart',
      elements: [
        {
          type: 'chart-title',
          content: chart.title,
          position: { x: 10, y: 5, width: 80, height: 10 },
          style: { fontSize: '28pt', fontWeight: 'bold', alignment: 'center' },
        },
        {
          type: 'chart',
          chartType: chart.type,
          data: chart.dataPoints,
          colors: chart.colors,
          position: { x: 10, y: 18, width: 80, height: 70 },
        },
      ],
    });
  }

  for (const table of tables) {
    slides.push({
      slideNumber: slides.length + 1,
      type: 'table',
      elements: [
        {
          type: 'table',
          headers: table.headers,
          rows: table.rows,
          position: { x: 5, y: 15, width: 90, height: 75 },
          style: { fontSize: '14pt', borderColor: '#cccccc', headerBackground: '#333333', headerColor: '#ffffff' },
        },
      ],
    });
  }

  const presentationStructure = {
    format: 'pptx',
    slideSize: { width: analysis.dimensions.width, height: analysis.dimensions.height },
    slides,
    theme: {
      colors: analysis.colors,
      fonts: analysis.fonts,
      background: analysis.colors.length > 0 ? analysis.colors[analysis.colors.length - 1] : '#ffffff',
    },
    metadata: {
      slideCount: slides.length,
      chartCount: charts.length,
      tableCount: tables.length,
      sourceAnalysisTimestamp: analysis.timestamp,
    },
  };

  const job = await prisma.replicationJob.create({
    data: {
      id: jobId,
      tenantId: tenantId,
      userId: userId,
      status: 'completed',
      targetFormat: 'pptx',
      documentStructure: JSON.parse(JSON.stringify(presentationStructure)),
      elementCount: slides.length,
      sourceDimensions: JSON.parse(JSON.stringify(analysis.dimensions)),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return {
    id: job.id,
    tenantId: job.tenantId,
    userId: job.userId || '',
    status: job.status,
    targetFormat: job.targetFormat || '',
    documentStructure: presentationStructure,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export async function scoreFidelity(
  originalImage: Buffer,
  replicaImage: Buffer
): Promise<FidelityScore> {
  const pixelComparison = await compareImages(originalImage, replicaImage);
  const pixelMatchScore = pixelComparison.matchPercentage;

  const ssimScore = await calculateSSIM(originalImage, replicaImage);
  const ssimPercentage = ssimScore * 100;

  const originalColors = await extractColorPalette(originalImage);
  const replicaColors = await extractColorPalette(replicaImage);

  let colorMatchCount = 0;
  for (const origColor of originalColors) {
    const origR = parseInt(origColor.slice(1, 3), 16);
    const origG = parseInt(origColor.slice(3, 5), 16);
    const origB = parseInt(origColor.slice(5, 7), 16);

    for (const repColor of replicaColors) {
      const repR = parseInt(repColor.slice(1, 3), 16);
      const repG = parseInt(repColor.slice(3, 5), 16);
      const repB = parseInt(repColor.slice(5, 7), 16);

      const distance = Math.sqrt(
        Math.pow(origR - repR, 2) + Math.pow(origG - repG, 2) + Math.pow(origB - repB, 2)
      );

      if (distance < 50) {
        colorMatchCount++;
        break;
      }
    }
  }

  const colorMatchScore = originalColors.length > 0
    ? (colorMatchCount / originalColors.length) * 100
    : 100;

  const originalLayout = await extractLayout(originalImage);
  const replicaLayout = await extractLayout(replicaImage);

  let layoutScore = 0;
  const colMatch = originalLayout.columns === replicaLayout.columns ? 25 : 0;
  const rowMatch = originalLayout.rows === replicaLayout.rows ? 25 : 0;
  const spacingMatch = originalLayout.spacing === replicaLayout.spacing ? 25 : 0;
  const elementCountDiff = Math.abs(originalLayout.elements.length - replicaLayout.elements.length);
  const elementMatch = Math.max(0, 25 - elementCountDiff * 5);
  layoutScore = colMatch + rowMatch + spacingMatch + elementMatch;

  const pixelWeight = 0.40;
  const ssimWeight = 0.30;
  const colorWeight = 0.15;
  const layoutWeight = 0.15;

  const overall =
    pixelMatchScore * pixelWeight +
    ssimPercentage * ssimWeight +
    colorMatchScore * colorWeight +
    layoutScore * layoutWeight;

  return {
    overall: Math.round(overall * 100) / 100,
    pixelMatch: Math.round(pixelMatchScore * 100) / 100,
    ssim: Math.round(ssimPercentage * 100) / 100,
    colorMatch: Math.round(colorMatchScore * 100) / 100,
    layoutMatch: Math.round(layoutScore * 100) / 100,
    breakdown: {
      pixelWeight,
      ssimWeight,
      colorWeight,
      layoutWeight,
    },
  };
}

export async function generateDiffReport(
  originalImage: Buffer,
  replicaImage: Buffer
): Promise<DiffReport> {
  const reportId = uuidv4();

  const pixelComparison = await compareImages(originalImage, replicaImage);

  const originalColors = await extractColorPalette(originalImage);
  const replicaColors = await extractColorPalette(replicaImage);

  const commonColors: string[] = [];
  const missingColors: string[] = [];

  for (const origColor of originalColors) {
    const origR = parseInt(origColor.slice(1, 3), 16);
    const origG = parseInt(origColor.slice(3, 5), 16);
    const origB = parseInt(origColor.slice(5, 7), 16);
    let found = false;

    for (const repColor of replicaColors) {
      const repR = parseInt(repColor.slice(1, 3), 16);
      const repG = parseInt(repColor.slice(3, 5), 16);
      const repB = parseInt(repColor.slice(5, 7), 16);
      const distance = Math.sqrt(
        Math.pow(origR - repR, 2) + Math.pow(origG - repG, 2) + Math.pow(origB - repB, 2)
      );
      if (distance < 50) {
        found = true;
        commonColors.push(origColor);
        break;
      }
    }
    if (!found) {
      missingColors.push(origColor);
    }
  }

  const extraColors = replicaColors.filter((repColor) => {
    const repR = parseInt(repColor.slice(1, 3), 16);
    const repG = parseInt(repColor.slice(3, 5), 16);
    const repB = parseInt(repColor.slice(5, 7), 16);

    for (const origColor of originalColors) {
      const origR = parseInt(origColor.slice(1, 3), 16);
      const origG = parseInt(origColor.slice(3, 5), 16);
      const origB = parseInt(origColor.slice(5, 7), 16);
      const distance = Math.sqrt(
        Math.pow(origR - repR, 2) + Math.pow(origG - repG, 2) + Math.pow(origB - repB, 2)
      );
      if (distance < 50) return false;
    }
    return true;
  });

  const colorMatchScore = originalColors.length > 0
    ? (commonColors.length / originalColors.length) * 100
    : 100;

  const originalLayout = await extractLayout(originalImage);
  const replicaLayout = await extractLayout(replicaImage);

  const layoutDifferences: string[] = [];
  if (originalLayout.columns !== replicaLayout.columns) {
    layoutDifferences.push(`Column count differs: original=${originalLayout.columns}, replica=${replicaLayout.columns}`);
  }
  if (originalLayout.rows !== replicaLayout.rows) {
    layoutDifferences.push(`Row count differs: original=${originalLayout.rows}, replica=${replicaLayout.rows}`);
  }
  if (originalLayout.spacing !== replicaLayout.spacing) {
    layoutDifferences.push(`Spacing differs: original=${originalLayout.spacing}, replica=${replicaLayout.spacing}`);
  }
  if (originalLayout.alignment !== replicaLayout.alignment) {
    layoutDifferences.push(`Alignment differs: original=${originalLayout.alignment}, replica=${replicaLayout.alignment}`);
  }

  const elementDiff = Math.abs(originalLayout.elements.length - replicaLayout.elements.length);
  if (elementDiff > 0) {
    layoutDifferences.push(`Element count differs by ${elementDiff}: original=${originalLayout.elements.length}, replica=${replicaLayout.elements.length}`);
  }

  const layoutMatchScore = Math.max(0, 100 - layoutDifferences.length * 15);

  const overallSimilarity =
    pixelComparison.matchPercentage * 0.4 +
    colorMatchScore * 0.3 +
    layoutMatchScore * 0.3;

  const diffReport: DiffReport = {
    id: reportId,
    pixelComparison,
    colorComparison: {
      originalColors,
      replicaColors,
      commonColors,
      missingColors,
      extraColors,
      colorMatchScore: Math.round(colorMatchScore * 100) / 100,
    },
    layoutComparison: {
      originalLayout: originalLayout as unknown as Record<string, unknown>,
      replicaLayout: replicaLayout as unknown as Record<string, unknown>,
      layoutMatchScore: Math.round(layoutMatchScore * 100) / 100,
      differences: layoutDifferences,
    },
    overallSimilarity: Math.round(overallSimilarity * 100) / 100,
    generatedAt: new Date().toISOString(),
  };

  return diffReport;
}

export async function suggestImprovements(
  replicaId: string,
  comparison: Record<string, unknown>
): Promise<{ suggestions: string[]; priority: string[]; estimatedImpact: Record<string, unknown> }> {
  const job = await prisma.replicationJob.findUnique({
    where: { id: replicaId },
  });

  if (!job) {
    throw new Error(`Replication job not found: ${replicaId}`);
  }

  const pixelComp = comparison.pixelComparison as Record<string, unknown> | undefined;
  const colorComp = comparison.colorComparison as Record<string, unknown> | undefined;
  const layoutComp = comparison.layoutComparison as Record<string, unknown> | undefined;
  const comparisonSummary = {
    overallSimilarity: (comparison.overallSimilarity as number) || (comparison.overall as number) || 0,
    pixelMatch: (comparison.pixelMatch as number) || (pixelComp?.matchPercentage as number) || 0,
    colorMatch: (comparison.colorMatch as number) || (colorComp?.colorMatchScore as number) || 0,
    layoutMatch: (comparison.layoutMatch as number) || (layoutComp?.layoutMatchScore as number) || 0,
    missingColors: (colorComp?.missingColors as string[]) || [],
    layoutDifferences: (layoutComp?.differences as string[]) || [],
    targetFormat: job.targetFormat,
  };

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are an expert at analyzing visual document replications and suggesting improvements. Return ONLY valid JSON.',
      },
      {
        role: 'user',
        content: `Analyze this replication comparison and suggest specific improvements. The target format is "${comparisonSummary.targetFormat}".

Comparison results:
${JSON.stringify(comparisonSummary, null, 2)}

Return JSON:
{
  "suggestions": ["specific actionable improvement 1", "improvement 2", ...],
  "priority": ["high|medium|low for each suggestion"],
  "estimatedImpact": {
    "pixelImprovement": estimated_percentage_points,
    "colorImprovement": estimated_percentage_points,
    "layoutImprovement": estimated_percentage_points,
    "overallImprovement": estimated_percentage_points
  }
}`,
      },
    ],
    max_tokens: 2048,
    temperature: 0.3,
  });

  const rawContent = response.choices[0]?.message?.content || '{}';
  const cleanedContent = rawContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(cleanedContent);
  } catch {
    const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { suggestions: [], priority: [], estimatedImpact: {} };
  }

  const result: { suggestions: string[]; priority: string[]; estimatedImpact: Record<string, unknown> } = {
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions as string[] : [],
    priority: Array.isArray(parsed.priority) ? parsed.priority as string[] : [],
    estimatedImpact: (parsed.estimatedImpact as Record<string, unknown>) || {
      pixelImprovement: 0,
      colorImprovement: 0,
      layoutImprovement: 0,
      overallImprovement: 0,
    },
  };

  return result;
}
