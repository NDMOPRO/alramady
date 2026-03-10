import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder' });
const prisma = new PrismaClient();

export interface AgentResult {
  agentType: string;
  taskType: string;
  suggestions: Array<{ action: string; description: string; confidence: number }>;
  interpretation: string;
  requiresApproval: boolean;
  executedAt: Date;
}

export interface DashboardBuilderTask {
  type: 'auto_create_dashboard' | 'suggest_widgets' | 'optimize_layout' | 'generate_kpi_dashboard';
  datasetId: string;
  data: Array<Record<string, number | string | null>>;
  columns?: string[];
  existingWidgets?: Array<{ type: string; title: string; column: string; position: { x: number; y: number; w: number; h: number } }>;
  kpiDefinitions?: Array<{ name: string; column: string; aggregation: string; target?: number }>;
  context?: string;
}

interface ColumnMeta {
  name: string;
  type: 'numeric' | 'categorical' | 'temporal' | 'text';
  cardinality: number;
  hasNulls: boolean;
  sampleValues: string[];
}

interface WidgetConfig {
  id: string;
  type: 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_plot' | 'kpi_card' | 'table' | 'heatmap' | 'gauge' | 'donut_chart';
  title: string;
  columns: string[];
  aggregation?: string;
  position: { x: number; y: number; w: number; h: number };
  config: Record<string, string | number | boolean>;
}

export class DashboardBuilderAgent {
  private readonly agentType = 'dashboard-builder';

  async execute(task: DashboardBuilderTask): Promise<AgentResult> {
    switch (task.type) {
      case 'auto_create_dashboard':
        return this.autoCreateDashboard(task);
      case 'suggest_widgets':
        return this.suggestWidgets(task);
      case 'optimize_layout':
        return this.optimizeLayout(task);
      case 'generate_kpi_dashboard':
        return this.generateKpiDashboard(task);
      default: {
        const exhaustive: never = task.type;
        throw new Error(`Unsupported task type: ${exhaustive}`);
      }
    }
  }

  private analyzeColumns(data: Array<Record<string, number | string | null>>, columnNames: string[]): ColumnMeta[] {
    return columnNames.map((name) => {
      const values = data.map((row) => row[name]);
      const nonNull = values.filter((v): v is number | string => v !== null && v !== undefined);
      const numericCount = nonNull.filter((v) => typeof v === 'number' || (!isNaN(Number(v)) && String(v).trim() !== '')).length;
      const datePattern = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/;
      const dateCount = nonNull.filter((v) => typeof v === 'string' && datePattern.test(v)).length;
      const uniqueCount = new Set(nonNull.map(String)).size;

      let type: ColumnMeta['type'] = 'text';
      if (dateCount / (nonNull.length || 1) > 0.8) {
        type = 'temporal';
      } else if (numericCount / (nonNull.length || 1) > 0.8) {
        type = 'numeric';
      } else if (uniqueCount < Math.min(20, nonNull.length * 0.5)) {
        type = 'categorical';
      }

      return {
        name,
        type,
        cardinality: uniqueCount,
        hasNulls: values.some((v) => v === null || v === undefined),
        sampleValues: nonNull.slice(0, 5).map(String),
      };
    });
  }

  private selectChartType(xMeta: ColumnMeta, yMeta: ColumnMeta): WidgetConfig['type'] {
    if (xMeta.type === 'temporal' && yMeta.type === 'numeric') return 'line_chart';
    if (xMeta.type === 'categorical' && yMeta.type === 'numeric' && xMeta.cardinality <= 6) return 'pie_chart';
    if (xMeta.type === 'categorical' && yMeta.type === 'numeric') return 'bar_chart';
    if (xMeta.type === 'numeric' && yMeta.type === 'numeric') return 'scatter_plot';
    return 'bar_chart';
  }

  private generateWidgetId(): string {
    const timestamp = Date.now().toString(36);
    const arr = new Uint8Array(4);
    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
      globalThis.crypto.getRandomValues(arr);
    } else {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = (Date.now() * (i + 1)) & 0xff;
      }
    }
    return `w-${timestamp}-${Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  }

  private autoGenerateWidgets(columnMetas: ColumnMeta[]): WidgetConfig[] {
    const widgets: WidgetConfig[] = [];
    let gridY = 0;

    const numericCols = columnMetas.filter((c) => c.type === 'numeric');
    const categoricalCols = columnMetas.filter((c) => c.type === 'categorical');
    const temporalCols = columnMetas.filter((c) => c.type === 'temporal');

    // KPI cards for top numeric columns
    const kpiCols = numericCols.slice(0, 4);
    kpiCols.forEach((col, i) => {
      widgets.push({
        id: this.generateWidgetId(),
        type: 'kpi_card',
        title: col.name,
        columns: [col.name],
        aggregation: 'sum',
        position: { x: i * 3, y: gridY, w: 3, h: 2 },
        config: { format: 'number', showTrend: true, rtl: true },
      });
    });
    if (kpiCols.length > 0) gridY += 2;

    // Time series charts
    if (temporalCols.length > 0 && numericCols.length > 0) {
      const timCol = temporalCols[0];
      const valCols = numericCols.slice(0, 3);
      widgets.push({
        id: this.generateWidgetId(),
        type: 'line_chart',
        title: `${valCols.map((c) => c.name).join(' / ')} over ${timCol.name}`,
        columns: [timCol.name, ...valCols.map((c) => c.name)],
        position: { x: 0, y: gridY, w: 12, h: 4 },
        config: { xAxis: timCol.name, rtl: true, showLegend: true },
      });
      gridY += 4;
    }

    // Category breakdowns
    categoricalCols.slice(0, 2).forEach((catCol, i) => {
      if (numericCols.length > 0) {
        const chartType = catCol.cardinality <= 6 ? 'pie_chart' : 'bar_chart';
        widgets.push({
          id: this.generateWidgetId(),
          type: chartType,
          title: `${numericCols[0].name} by ${catCol.name}`,
          columns: [catCol.name, numericCols[0].name],
          aggregation: 'sum',
          position: { x: i * 6, y: gridY, w: 6, h: 4 },
          config: { groupBy: catCol.name, rtl: true },
        });
      }
    });
    if (categoricalCols.length > 0) gridY += 4;

    // Scatter plot for numeric pairs
    if (numericCols.length >= 2) {
      widgets.push({
        id: this.generateWidgetId(),
        type: 'scatter_plot',
        title: `${numericCols[0].name} vs ${numericCols[1].name}`,
        columns: [numericCols[0].name, numericCols[1].name],
        position: { x: 0, y: gridY, w: 6, h: 4 },
        config: { xAxis: numericCols[0].name, yAxis: numericCols[1].name, rtl: true },
      });
    }

    // Data table
    widgets.push({
      id: this.generateWidgetId(),
      type: 'table',
      title: 'Data Table',
      columns: columnMetas.slice(0, 8).map((c) => c.name),
      position: { x: numericCols.length >= 2 ? 6 : 0, y: gridY, w: numericCols.length >= 2 ? 6 : 12, h: 4 },
      config: { pageSize: 10, sortable: true, rtl: true },
    });

    return widgets;
  }

  private async autoCreateDashboard(task: DashboardBuilderTask): Promise<AgentResult> {
    const columnNames = task.columns ?? Object.keys(task.data[0] ?? {});
    const columnMetas = this.analyzeColumns(task.data, columnNames);
    const widgets = this.autoGenerateWidgets(columnMetas);

    const prompt = `You are a dashboard design expert for a Saudi-market analytics platform (Rasid).
Review this auto-generated dashboard configuration and provide optimization suggestions.

Dataset "${task.datasetId}" with ${task.data.length} rows.
Column types: ${JSON.stringify(columnMetas.map((c) => ({ name: c.name, type: c.type, cardinality: c.cardinality })))}

Auto-generated widgets (${widgets.length}):
${JSON.stringify(widgets.map((w) => ({ type: w.type, title: w.title, columns: w.columns })), null, 2)}

${task.context ? `Context: ${task.context}` : ''}

Respond in JSON:
{
  "suggestions": [
    { "action": "dashboard_improvement", "description": "specific improvement suggestion", "confidence": 0.85 }
  ],
  "interpretation": "dashboard design assessment in Arabic (formal MSA)"
}

Consider:
- RTL layout for Arabic users
- Color accessibility
- Information hierarchy
- Saudi business context`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for auto_create_dashboard');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    // Prepend widget creation suggestions
    const widgetSuggestions = widgets.map((w) => ({
      action: 'create_widget',
      description: `Create ${w.type} "${w.title}" at position (${w.position.x},${w.position.y}) size ${w.position.w}x${w.position.h} using columns [${w.columns.join(', ')}]`,
      confidence: 0.9,
    }));

    const allSuggestions = [...widgetSuggestions, ...parsed.suggestions];

    await prisma.auditLog.create({
      data: {
        action: 'dashboard_builder_auto_create',
        entityType: 'dashboard',
        entityId: task.datasetId,
        details: JSON.stringify({ widgetCount: widgets.length, columnCount: columnNames.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions: allSuggestions,
      interpretation: parsed.interpretation,
      requiresApproval: true,
      executedAt: new Date(),
    };
  }

  private async suggestWidgets(task: DashboardBuilderTask): Promise<AgentResult> {
    const columnNames = task.columns ?? Object.keys(task.data[0] ?? {});
    const columnMetas = this.analyzeColumns(task.data, columnNames);
    const sampleRows = task.data.slice(0, 5);

    const prompt = `You are a dashboard widget specialist for a Saudi-market analytics platform (Rasid).
Given this dataset, suggest the most impactful widgets.

Dataset "${task.datasetId}" with ${task.data.length} rows:
Columns: ${JSON.stringify(columnMetas.map((c) => ({ name: c.name, type: c.type, cardinality: c.cardinality, samples: c.sampleValues })))}

Sample data:
${JSON.stringify(sampleRows, null, 2)}

${task.existingWidgets ? `Existing widgets: ${JSON.stringify(task.existingWidgets.map((w) => ({ type: w.type, title: w.title })))}` : 'No existing widgets.'}

${task.context ? `Context: ${task.context}` : ''}

Respond in JSON:
{
  "suggestions": [
    {
      "action": "add_widget",
      "description": "widget_type: [bar_chart|line_chart|pie_chart|area_chart|scatter_plot|kpi_card|table|heatmap|gauge|donut_chart] | title: widget title | columns: [col1, col2] | aggregation: sum/avg/count | reason: why this widget",
      "confidence": 0.9
    }
  ],
  "interpretation": "widget recommendation summary in Arabic (formal MSA)"
}

Rules:
- Suggest 5-8 widgets
- Avoid duplicating existing widgets
- Consider Saudi business context
- Prioritize actionable visualizations
- confidence must be between 0 and 1`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for suggest_widgets');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    await prisma.auditLog.create({
      data: {
        action: 'dashboard_builder_suggest_widgets',
        entityType: 'dashboard',
        entityId: task.datasetId,
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

  private async optimizeLayout(task: DashboardBuilderTask): Promise<AgentResult> {
    const existingWidgets = task.existingWidgets ?? [];
    if (existingWidgets.length === 0) {
      return {
        agentType: this.agentType,
        taskType: task.type,
        suggestions: [{ action: 'no_widgets', description: 'No existing widgets to optimize', confidence: 1.0 }],
        interpretation: 'No widgets provided for layout optimization.',
        requiresApproval: false,
        executedAt: new Date(),
      };
    }

    // Detect overlaps
    const overlaps: Array<{ widget1: string; widget2: string }> = [];
    for (let i = 0; i < existingWidgets.length; i++) {
      for (let j = i + 1; j < existingWidgets.length; j++) {
        const a = existingWidgets[i].position;
        const b = existingWidgets[j].position;
        if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
          overlaps.push({ widget1: existingWidgets[i].title, widget2: existingWidgets[j].title });
        }
      }
    }

    // Re-layout using grid packing
    const gridCols = 12;
    const packed: Array<{ title: string; position: { x: number; y: number; w: number; h: number } }> = [];
    const grid: boolean[][] = [];

    const ensureRows = (maxY: number) => {
      while (grid.length <= maxY) {
        grid.push(new Array(gridCols).fill(false));
      }
    };

    const canPlace = (x: number, y: number, w: number, h: number): boolean => {
      ensureRows(y + h);
      for (let row = y; row < y + h; row++) {
        for (let col = x; col < x + w; col++) {
          if (col >= gridCols || grid[row][col]) return false;
        }
      }
      return true;
    };

    const place = (x: number, y: number, w: number, h: number) => {
      ensureRows(y + h);
      for (let row = y; row < y + h; row++) {
        for (let col = x; col < x + w; col++) {
          grid[row][col] = true;
        }
      }
    };

    // Sort widgets: KPI cards first (smallest), then by original position
    const sorted = [...existingWidgets].sort((a, b) => {
      if (a.type === 'kpi_card' && b.type !== 'kpi_card') return -1;
      if (b.type === 'kpi_card' && a.type !== 'kpi_card') return 1;
      return (a.position.y * 100 + a.position.x) - (b.position.y * 100 + b.position.x);
    });

    for (const widget of sorted) {
      const w = Math.min(widget.position.w, gridCols);
      const h = widget.position.h;
      let placed = false;
      for (let y = 0; !placed; y++) {
        for (let x = 0; x <= gridCols - w; x++) {
          if (canPlace(x, y, w, h)) {
            place(x, y, w, h);
            packed.push({ title: widget.title, position: { x, y, w, h } });
            placed = true;
            break;
          }
        }
      }
    }

    const suggestions: Array<{ action: string; description: string; confidence: number }> = [];

    if (overlaps.length > 0) {
      overlaps.forEach((o) => {
        suggestions.push({
          action: 'fix_overlap',
          description: `Overlap detected between "${o.widget1}" and "${o.widget2}" - repositioned in optimized layout`,
          confidence: 0.95,
        });
      });
    }

    packed.forEach((p) => {
      suggestions.push({
        action: 'reposition_widget',
        description: `"${p.title}" -> position (${p.position.x}, ${p.position.y}), size ${p.position.w}x${p.position.h}`,
        confidence: 0.85,
      });
    });

    const interpretation = `Layout optimization: ${existingWidgets.length} widgets re-packed into a ${gridCols}-column grid. ${overlaps.length} overlaps resolved. RTL-compatible layout generated.`;

    await prisma.auditLog.create({
      data: {
        action: 'dashboard_builder_optimize_layout',
        entityType: 'dashboard',
        entityId: task.datasetId,
        details: JSON.stringify({ widgetCount: existingWidgets.length, overlapsFixed: overlaps.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: true,
      executedAt: new Date(),
    };
  }

  private async generateKpiDashboard(task: DashboardBuilderTask): Promise<AgentResult> {
    const kpis = task.kpiDefinitions ?? [];
    const columnNames = task.columns ?? Object.keys(task.data[0] ?? {});
    const columnMetas = this.analyzeColumns(task.data, columnNames);

    // If no KPIs defined, auto-detect from numeric columns
    const effectiveKpis = kpis.length > 0 ? kpis : columnMetas
      .filter((c) => c.type === 'numeric')
      .slice(0, 6)
      .map((c) => ({ name: c.name, column: c.name, aggregation: 'sum', target: undefined }));

    const widgets: WidgetConfig[] = [];
    let gridX = 0;
    let gridY = 0;

    for (const kpi of effectiveKpis) {
      const values = task.data
        .map((row) => row[kpi.column])
        .filter((v): v is number | string => v !== null && v !== undefined)
        .map((v) => (typeof v === 'number' ? v : Number(v)))
        .filter((v) => !isNaN(v));

      let aggregatedValue = 0;
      switch (kpi.aggregation) {
        case 'sum':
          aggregatedValue = values.reduce((s, v) => s + v, 0);
          break;
        case 'avg':
          aggregatedValue = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
          break;
        case 'count':
          aggregatedValue = values.length;
          break;
        case 'min':
          aggregatedValue = values.length > 0 ? Math.min(...values) : 0;
          break;
        case 'max':
          aggregatedValue = values.length > 0 ? Math.max(...values) : 0;
          break;
        default:
          aggregatedValue = values.reduce((s, v) => s + v, 0);
      }

      const hasTarget = kpi.target !== undefined;
      const achievement = hasTarget && kpi.target !== 0 ? (aggregatedValue / kpi.target) * 100 : 0;

      widgets.push({
        id: this.generateWidgetId(),
        type: hasTarget ? 'gauge' : 'kpi_card',
        title: kpi.name,
        columns: [kpi.column],
        aggregation: kpi.aggregation,
        position: { x: gridX, y: gridY, w: 4, h: 2 },
        config: {
          value: aggregatedValue,
          ...(hasTarget ? { target: kpi.target!, achievement: Number(achievement.toFixed(1)) } : {}),
          format: 'number',
          rtl: true,
        },
      });

      gridX += 4;
      if (gridX >= 12) {
        gridX = 0;
        gridY += 2;
      }
    }

    // Add trend chart if temporal column exists
    const temporalCol = columnMetas.find((c) => c.type === 'temporal');
    if (temporalCol && effectiveKpis.length > 0) {
      widgets.push({
        id: this.generateWidgetId(),
        type: 'line_chart',
        title: `KPI Trends over ${temporalCol.name}`,
        columns: [temporalCol.name, ...effectiveKpis.slice(0, 3).map((k) => k.column)],
        position: { x: 0, y: gridY, w: 12, h: 4 },
        config: { xAxis: temporalCol.name, rtl: true, showLegend: true },
      });
    }

    const suggestions = widgets.map((w) => ({
      action: 'create_kpi_widget',
      description: `${w.type} "${w.title}": ${w.aggregation ?? 'display'} of ${w.columns.join(', ')}${w.config.target ? ` (target: ${w.config.target}, achievement: ${w.config.achievement}%)` : ''} at (${w.position.x},${w.position.y})`,
      confidence: 0.9,
    }));

    const interpretation = `KPI dashboard generated with ${widgets.length} widgets for ${effectiveKpis.length} KPIs. ${kpis.length === 0 ? 'KPIs auto-detected from numeric columns.' : 'Using provided KPI definitions.'}`;

    await prisma.auditLog.create({
      data: {
        action: 'dashboard_builder_generate_kpi',
        entityType: 'dashboard',
        entityId: task.datasetId,
        details: JSON.stringify({ kpiCount: effectiveKpis.length, widgetCount: widgets.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: true,
      executedAt: new Date(),
    };
  }
}
