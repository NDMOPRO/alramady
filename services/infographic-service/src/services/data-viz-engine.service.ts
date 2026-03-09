import { PrismaClient } from '@prisma/client';
import { createCanvas, Canvas, CanvasRenderingContext2D } from 'canvas';
import sharp from 'sharp';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface ChartConfig {
  type: 'bar' | 'line' | 'pie' | 'donut' | 'area' | 'scatter' | 'bubble' | 'radar' | 'treemap' | 'funnel';
  width: number;
  height: number;
  data: ChartDataPoint[];
  colors: string[];
  title?: string;
  subtitle?: string;
  showLegend: boolean;
  showLabels: boolean;
  animated: boolean;
  backgroundColor: string;
  borderRadius: number;
  padding: number;
}

export interface ChartDataPoint {
  label: string;
  value: number;
  secondaryValue?: number;
  group?: string;
  color?: string;
}

export interface DataDrivenLayout {
  id: string;
  name: string;
  sections: LayoutSection[];
  width: number;
  height: number;
  gridColumns: number;
  gridRows: number;
}

export interface LayoutSection {
  id: string;
  type: 'chart' | 'text' | 'stat' | 'icon' | 'divider' | 'image';
  position: { x: number; y: number; width: number; height: number };
  config: Record<string, unknown>;
  dataBinding?: string;
}

export interface InfographicStory {
  title: string;
  sections: StorySection[];
  theme: StoryTheme;
  dataSource: unknown[];
}

export interface StorySection {
  heading: string;
  narrative: string;
  visualization: ChartConfig;
  keyInsight: string;
  order: number;
}

export interface StoryTheme {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  fontFamily: string;
  headingSize: number;
  bodySize: number;
}

export interface ComparisonViz {
  type: 'side_by_side' | 'stacked' | 'overlay' | 'versus';
  items: { label: string; values: Record<string, number> }[];
  metrics: string[];
  width: number;
  height: number;
  colors: string[];
}

export interface RankingViz {
  items: { label: string; value: number; icon?: string; description?: string }[];
  type: 'horizontal_bar' | 'numbered_list' | 'podium' | 'progress';
  maxItems: number;
  width: number;
  height: number;
  showValues: boolean;
  showRank: boolean;
}

export interface TimelineViz {
  events: TimelineEvent[];
  direction: 'horizontal' | 'vertical';
  width: number;
  height: number;
  style: 'minimal' | 'detailed' | 'alternating';
}

export interface TimelineEvent {
  date: string;
  title: string;
  description: string;
  icon?: string;
  color?: string;
  importance: 'high' | 'medium' | 'low';
}

export interface MapViz {
  type: 'choropleth' | 'bubble_map' | 'pin_map';
  dataPoints: { lat: number; lng: number; value: number; label: string; color?: string }[];
  width: number;
  height: number;
  zoomLevel: number;
  centerLat: number;
  centerLng: number;
}

export interface RenderResult {
  imageBuffer: Buffer;
  width: number;
  height: number;
  format: 'png' | 'svg';
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class DataVizEngineService {
  private readonly DEFAULT_COLORS = [
    '#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F',
    '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC',
  ];

  constructor(private prisma: PrismaClient) {}

  async renderChart(config: ChartConfig): Promise<RenderResult> {
    const canvas = createCanvas(config.width, config.height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = config.backgroundColor;
    this.roundRect(ctx, 0, 0, config.width, config.height, config.borderRadius);
    ctx.fill();

    const padding = config.padding;
    let titleHeight = 0;
    if (config.title) {
      ctx.fillStyle = '#333333';
      ctx.font = `bold 18px ${config.title}`;
      ctx.fillText(config.title, padding, padding + 18);
      titleHeight = 30;
    }
    if (config.subtitle) {
      ctx.fillStyle = '#666666';
      ctx.font = '13px sans-serif';
      ctx.fillText(config.subtitle, padding, padding + titleHeight + 14);
      titleHeight += 22;
    }

    const chartArea = {
      x: padding,
      y: padding + titleHeight + 10,
      width: config.width - padding * 2,
      height: config.height - padding * 2 - titleHeight - (config.showLegend ? 40 : 0) - 10,
    };

    const colors = config.colors.length > 0 ? config.colors : this.DEFAULT_COLORS;

    switch (config.type) {
      case 'bar':
        this.drawBarChart(ctx, config.data, chartArea, colors, config.showLabels);
        break;
      case 'line':
        this.drawLineChart(ctx, config.data, chartArea, colors, config.showLabels);
        break;
      case 'pie':
      case 'donut':
        this.drawPieChart(ctx, config.data, chartArea, colors, config.showLabels, config.type === 'donut');
        break;
      case 'scatter':
        this.drawScatterChart(ctx, config.data, chartArea, colors);
        break;
      case 'funnel':
        this.drawFunnelChart(ctx, config.data, chartArea, colors, config.showLabels);
        break;
      default:
        this.drawBarChart(ctx, config.data, chartArea, colors, config.showLabels);
    }

    if (config.showLegend) {
      this.drawLegend(ctx, config.data, colors, padding, config.height - 35, config.width - padding * 2);
    }

    const imageBuffer = canvas.toBuffer('image/png');

    await (this.prisma as unknown as Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>).chartRender.create({
      data: {
        chartType: config.type,
        width: config.width,
        height: config.height,
        dataPointCount: config.data.length,
        renderSize: imageBuffer.length,
        renderedAt: new Date(),
      },
    });

    return { imageBuffer, width: config.width, height: config.height, format: 'png' };
  }

  private drawBarChart(
    ctx: CanvasRenderingContext2D,
    data: ChartDataPoint[],
    area: { x: number; y: number; width: number; height: number },
    colors: string[],
    showLabels: boolean,
  ): void {
    const maxValue = Math.max(...data.map(d => d.value));
    const barCount = data.length;
    const barGap = Math.max(4, area.width * 0.02);
    const barWidth = (area.width - barGap * (barCount + 1)) / barCount;
    const labelSpace = 25;
    const chartHeight = area.height - labelSpace;

    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 1;
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = area.y + (chartHeight / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(area.x, y);
      ctx.lineTo(area.x + area.width, y);
      ctx.stroke();

      ctx.fillStyle = '#999999';
      ctx.font = '10px sans-serif';
      const gridValue = Math.round(maxValue - (maxValue / gridLines) * i);
      ctx.fillText(String(gridValue), area.x - 5, y + 3);
    }

    for (let i = 0; i < barCount; i++) {
      const barHeight = maxValue > 0 ? (data[i].value / maxValue) * chartHeight : 0;
      const x = area.x + barGap + i * (barWidth + barGap);
      const y = area.y + chartHeight - barHeight;

      const colorIdx = i % colors.length;
      ctx.fillStyle = colors[colorIdx];
      this.roundRect(ctx, x, y, barWidth, barHeight, 3);
      ctx.fill();

      if (showLabels) {
        ctx.fillStyle = '#333333';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(data[i].label, x + barWidth / 2, area.y + area.height - 5);
        ctx.fillText(String(Math.round(data[i].value)), x + barWidth / 2, y - 5);
        ctx.textAlign = 'left';
      }
    }
  }

  private drawLineChart(
    ctx: CanvasRenderingContext2D,
    data: ChartDataPoint[],
    area: { x: number; y: number; width: number; height: number },
    colors: string[],
    showLabels: boolean,
  ): void {
    const maxValue = Math.max(...data.map(d => d.value));
    const minValue = Math.min(...data.map(d => d.value));
    const range = maxValue - minValue || 1;
    const labelSpace = 25;
    const chartHeight = area.height - labelSpace;

    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = area.y + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(area.x, y);
      ctx.lineTo(area.x + area.width, y);
      ctx.stroke();
    }

    const stepX = data.length > 1 ? area.width / (data.length - 1) : area.width;
    const points: { x: number; y: number }[] = data.map((d, i) => ({
      x: area.x + stepX * i,
      y: area.y + chartHeight - ((d.value - minValue) / range) * chartHeight,
    }));

    ctx.fillStyle = colors[0] + '20';
    ctx.beginPath();
    ctx.moveTo(points[0].x, area.y + chartHeight);
    for (const pt of points) {
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.lineTo(points[points.length - 1].x, area.y + chartHeight);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = colors[0];
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

    for (let i = 0; i < points.length; i++) {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(points[i].x, points[i].y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colors[0];
      ctx.lineWidth = 2;
      ctx.stroke();

      if (showLabels) {
        ctx.fillStyle = '#333333';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(data[i].label, points[i].x, area.y + area.height - 5);
        ctx.textAlign = 'left';
      }
    }
  }

  private drawPieChart(
    ctx: CanvasRenderingContext2D,
    data: ChartDataPoint[],
    area: { x: number; y: number; width: number; height: number },
    colors: string[],
    showLabels: boolean,
    isDonut: boolean,
  ): void {
    const centerX = area.x + area.width / 2;
    const centerY = area.y + area.height / 2;
    const radius = Math.min(area.width, area.height) / 2 - 20;
    const innerRadius = isDonut ? radius * 0.55 : 0;
    const total = data.reduce((sum, d) => sum + d.value, 0);

    let currentAngle = -Math.PI / 2;

    for (let i = 0; i < data.length; i++) {
      const sliceAngle = total > 0 ? (data[i].value / total) * Math.PI * 2 : 0;
      const colorIdx = i % colors.length;

      ctx.fillStyle = colors[colorIdx];
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
      ctx.closePath();
      ctx.fill();

      if (isDonut) {
        ctx.fillStyle = area.x === 0 ? '#FFFFFF' : ctx.fillStyle;
      }

      if (showLabels && sliceAngle > 0.15) {
        const midAngle = currentAngle + sliceAngle / 2;
        const labelRadius = radius + 15;
        const labelX = centerX + Math.cos(midAngle) * labelRadius;
        const labelY = centerY + Math.sin(midAngle) * labelRadius;
        const percentage = total > 0 ? ((data[i].value / total) * 100).toFixed(1) : '0';

        ctx.fillStyle = '#333333';
        ctx.font = '11px sans-serif';
        ctx.textAlign = midAngle > Math.PI / 2 && midAngle < Math.PI * 1.5 ? 'right' : 'left';
        ctx.fillText(`${data[i].label} (${percentage}%)`, labelX, labelY);
        ctx.textAlign = 'left';
      }

      currentAngle += sliceAngle;
    }

    if (isDonut) {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#333333';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(total), centerX, centerY + 5);
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#666666';
      ctx.fillText('Total', centerX, centerY + 22);
      ctx.textAlign = 'left';
    }
  }

  private drawScatterChart(
    ctx: CanvasRenderingContext2D,
    data: ChartDataPoint[],
    area: { x: number; y: number; width: number; height: number },
    colors: string[],
  ): void {
    const maxX = Math.max(...data.map(d => d.value));
    const maxY = Math.max(...data.map(d => d.secondaryValue || 0));
    const minX = Math.min(...data.map(d => d.value));
    const minY = Math.min(...data.map(d => d.secondaryValue || 0));
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(area.x, area.y + area.height);
    ctx.lineTo(area.x + area.width, area.y + area.height);
    ctx.moveTo(area.x, area.y);
    ctx.lineTo(area.x, area.y + area.height);
    ctx.stroke();

    for (let i = 0; i < data.length; i++) {
      const ptX = area.x + ((data[i].value - minX) / rangeX) * area.width;
      const ptY = area.y + area.height - (((data[i].secondaryValue || 0) - minY) / rangeY) * area.height;
      const colorIdx = i % colors.length;

      ctx.fillStyle = colors[colorIdx] + 'AA';
      ctx.beginPath();
      ctx.arc(ptX, ptY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colors[colorIdx];
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  private drawFunnelChart(
    ctx: CanvasRenderingContext2D,
    data: ChartDataPoint[],
    area: { x: number; y: number; width: number; height: number },
    colors: string[],
    showLabels: boolean,
  ): void {
    const sorted = [...data].sort((a, b) => b.value - a.value);
    const maxValue = sorted.length > 0 ? sorted[0].value : 1;
    const stepHeight = area.height / sorted.length;

    for (let i = 0; i < sorted.length; i++) {
      const widthRatio = maxValue > 0 ? sorted[i].value / maxValue : 0;
      const nextWidthRatio = i + 1 < sorted.length ? sorted[i + 1].value / maxValue : widthRatio * 0.6;
      const topWidth = widthRatio * area.width;
      const bottomWidth = nextWidthRatio * area.width;
      const y = area.y + i * stepHeight;
      const topX = area.x + (area.width - topWidth) / 2;
      const bottomX = area.x + (area.width - bottomWidth) / 2;

      const colorIdx = i % colors.length;
      ctx.fillStyle = colors[colorIdx];
      ctx.beginPath();
      ctx.moveTo(topX, y);
      ctx.lineTo(topX + topWidth, y);
      ctx.lineTo(bottomX + bottomWidth, y + stepHeight);
      ctx.lineTo(bottomX, y + stepHeight);
      ctx.closePath();
      ctx.fill();

      if (showLabels) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${sorted[i].label}: ${sorted[i].value}`, area.x + area.width / 2, y + stepHeight / 2 + 5);
        ctx.textAlign = 'left';
      }
    }
  }

  private drawLegend(
    ctx: CanvasRenderingContext2D,
    data: ChartDataPoint[],
    colors: string[],
    x: number,
    y: number,
    maxWidth: number,
  ): void {
    let currentX = x;
    ctx.font = '11px sans-serif';

    for (let i = 0; i < Math.min(data.length, 10); i++) {
      const colorIdx = i % colors.length;
      const labelWidth = ctx.measureText(data[i].label).width;

      if (currentX + 18 + labelWidth > x + maxWidth) {
        break;
      }

      ctx.fillStyle = colors[colorIdx];
      ctx.fillRect(currentX, y, 12, 12);
      ctx.fillStyle = '#333333';
      ctx.fillText(data[i].label, currentX + 16, y + 10);
      currentX += 20 + labelWidth + 12;
    }
  }

  async generateDataDrivenLayout(
    dataSource: Record<string, unknown>[],
    width: number,
    height: number,
  ): Promise<DataDrivenLayout> {
    const columns = Object.keys(dataSource[0] || {});
    const numericCols = columns.filter(col =>
      dataSource.every(row => typeof row[col] === 'number'),
    );
    const categoryCols = columns.filter(col =>
      dataSource.every(row => typeof row[col] === 'string'),
    );

    const sections: LayoutSection[] = [];
    const gridColumns = 12;
    const gridRows = 8;
    let sectionIndex = 0;

    if (numericCols.length > 0) {
      const topMetrics = numericCols.slice(0, 4);
      const metricWidth = Math.floor(gridColumns / topMetrics.length);

      for (let i = 0; i < topMetrics.length; i++) {
        const values = dataSource.map(r => r[topMetrics[i]] as number);
        const sum = values.reduce((a, b) => a + b, 0);
        const avg = values.length > 0 ? sum / values.length : 0;

        sections.push({
          id: `stat_${sectionIndex++}`,
          type: 'stat',
          position: { x: i * metricWidth, y: 0, width: metricWidth, height: 1 },
          config: {
            label: topMetrics[i],
            value: Math.round(sum * 100) / 100,
            subtitle: `Avg: ${Math.round(avg * 100) / 100}`,
          },
          dataBinding: topMetrics[i],
        });
      }
    }

    if (numericCols.length >= 1 && categoryCols.length >= 1) {
      sections.push({
        id: `chart_${sectionIndex++}`,
        type: 'chart',
        position: { x: 0, y: 1, width: 8, height: 4 },
        config: {
          chartType: 'bar',
          xField: categoryCols[0],
          yField: numericCols[0],
        },
        dataBinding: `${categoryCols[0]},${numericCols[0]}`,
      });
    }

    if (numericCols.length >= 2) {
      sections.push({
        id: `chart_${sectionIndex++}`,
        type: 'chart',
        position: { x: 8, y: 1, width: 4, height: 4 },
        config: {
          chartType: 'pie',
          labelField: categoryCols[0] || numericCols[0],
          valueField: numericCols[1],
        },
        dataBinding: numericCols[1],
      });
    }

    if (dataSource.length > 0) {
      sections.push({
        id: `table_${sectionIndex++}`,
        type: 'chart',
        position: { x: 0, y: 5, width: 12, height: 3 },
        config: {
          chartType: 'table',
          columns: columns.slice(0, 6),
          maxRows: 10,
        },
      });
    }

    const layout: DataDrivenLayout = {
      id: `layout_${Date.now()}`,
      name: 'Auto-generated Layout',
      sections,
      width,
      height,
      gridColumns,
      gridRows,
    };

    await (this.prisma as unknown as Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>).infographicLayout.create({
      data: {
        name: layout.name,
        sections: JSON.stringify(sections),
        width,
        height,
        gridColumns,
        gridRows,
        dataPointCount: dataSource.length,
        createdAt: new Date(),
      },
    });

    return layout;
  }

  async generateDataStory(data: unknown[], title: string, theme: StoryTheme): Promise<InfographicStory> {
    const records = data as Record<string, unknown>[];
    const columns = Object.keys(records[0] || {});
    const numericCols = columns.filter(c => records.every(r => typeof r[c] === 'number'));
    const categoryCols = columns.filter(c => records.every(r => typeof r[c] === 'string'));

    const sections: StorySection[] = [];
    let order = 1;

    if (numericCols.length > 0) {
      const col = numericCols[0];
      const values = records.map(r => r[col] as number);
      const total = values.reduce((a, b) => a + b, 0);
      const avg = values.length > 0 ? total / values.length : 0;
      const max = Math.max(...values);
      const min = Math.min(...values);

      sections.push({
        heading: `Overview of ${col}`,
        narrative: `The dataset contains ${records.length} records. The total ${col} is ${Math.round(total)}, with an average of ${Math.round(avg * 100) / 100}. Values range from ${min} to ${max}.`,
        visualization: {
          type: 'bar',
          width: 600,
          height: 300,
          data: records.slice(0, 10).map(r => ({
            label: String(r[categoryCols[0]] || r[columns[0]] || ''),
            value: r[col] as number,
          })),
          colors: [theme.primaryColor, theme.secondaryColor],
          showLegend: true,
          showLabels: true,
          animated: false,
          backgroundColor: theme.backgroundColor,
          borderRadius: 8,
          padding: 20,
        },
        keyInsight: `The highest value of ${col} is ${max}, while the lowest is ${min}.`,
        order: order++,
      });
    }

    if (categoryCols.length > 0 && numericCols.length > 0) {
      const catCol = categoryCols[0];
      const numCol = numericCols[0];
      const grouped = new Map<string, number>();

      for (const r of records) {
        const key = String(r[catCol]);
        grouped.set(key, (grouped.get(key) || 0) + (r[numCol] as number));
      }

      const sortedGroups = Array.from(grouped.entries()).sort((a, b) => b[1] - a[1]);
      const topGroup = sortedGroups[0];
      const bottomGroup = sortedGroups[sortedGroups.length - 1];

      sections.push({
        heading: `${numCol} by ${catCol}`,
        narrative: `Breaking down ${numCol} by ${catCol}, "${topGroup[0]}" leads with ${Math.round(topGroup[1])}, while "${bottomGroup[0]}" has the lowest at ${Math.round(bottomGroup[1])}.`,
        visualization: {
          type: 'pie',
          width: 500,
          height: 400,
          data: sortedGroups.slice(0, 8).map(([label, value]) => ({ label, value })),
          colors: this.DEFAULT_COLORS,
          showLegend: true,
          showLabels: true,
          animated: false,
          backgroundColor: theme.backgroundColor,
          borderRadius: 8,
          padding: 20,
        },
        keyInsight: `"${topGroup[0]}" accounts for the largest share of ${numCol}.`,
        order: order++,
      });
    }

    if (numericCols.length >= 2) {
      const col1 = numericCols[0];
      const col2 = numericCols[1];

      sections.push({
        heading: `${col1} vs ${col2}`,
        narrative: `Exploring the relationship between ${col1} and ${col2} across all records.`,
        visualization: {
          type: 'scatter',
          width: 600,
          height: 400,
          data: records.slice(0, 50).map(r => ({
            label: String(r[categoryCols[0]] || ''),
            value: r[col1] as number,
            secondaryValue: r[col2] as number,
          })),
          colors: [theme.primaryColor],
          showLegend: false,
          showLabels: false,
          animated: false,
          backgroundColor: theme.backgroundColor,
          borderRadius: 8,
          padding: 20,
        },
        keyInsight: `The scatter plot reveals patterns between ${col1} and ${col2}.`,
        order: order++,
      });
    }

    return { title, sections, theme, dataSource: data };
  }

  async renderComparison(config: ComparisonViz): Promise<RenderResult> {
    const canvas = createCanvas(config.width, config.height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, config.width, config.height);

    const padding = 30;
    const chartArea = { x: padding, y: padding, width: config.width - padding * 2, height: config.height - padding * 2 };

    const itemWidth = chartArea.width / config.items.length;
    const metricHeight = (chartArea.height - 40) / config.metrics.length;

    ctx.fillStyle = '#333333';
    ctx.font = 'bold 14px sans-serif';
    for (let i = 0; i < config.items.length; i++) {
      ctx.textAlign = 'center';
      ctx.fillText(config.items[i].label, chartArea.x + itemWidth * i + itemWidth / 2, chartArea.y + 15);
    }

    const allValues = config.items.flatMap(item => config.metrics.map(m => item.values[m] || 0));
    const maxValue = Math.max(...allValues) || 1;

    for (let m = 0; m < config.metrics.length; m++) {
      const metricY = chartArea.y + 30 + metricHeight * m;
      ctx.fillStyle = '#666666';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(config.metrics[m], chartArea.x, metricY + 12);

      for (let i = 0; i < config.items.length; i++) {
        const value = config.items[i].values[config.metrics[m]] || 0;
        const barMaxWidth = itemWidth * 0.8;
        const barWidth = (value / maxValue) * barMaxWidth;
        const barX = chartArea.x + itemWidth * i + (itemWidth - barMaxWidth) / 2;
        const barY = metricY + 20;

        ctx.fillStyle = config.colors[m % config.colors.length];
        this.roundRect(ctx, barX, barY, barWidth, 18, 3);
        ctx.fill();

        ctx.fillStyle = '#333333';
        ctx.font = '10px sans-serif';
        ctx.fillText(String(Math.round(value)), barX + barWidth + 5, barY + 13);
      }
    }

    ctx.textAlign = 'left';
    const imageBuffer = canvas.toBuffer('image/png');
    return { imageBuffer, width: config.width, height: config.height, format: 'png' };
  }

  async renderRanking(config: RankingViz): Promise<RenderResult> {
    const canvas = createCanvas(config.width, config.height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, config.width, config.height);

    const padding = 20;
    const items = config.items.slice(0, config.maxItems);
    const maxValue = Math.max(...items.map(i => i.value)) || 1;
    const itemHeight = (config.height - padding * 2) / items.length;

    for (let i = 0; i < items.length; i++) {
      const y = padding + i * itemHeight;
      const barMaxWidth = config.width - padding * 2 - (config.showRank ? 40 : 0) - (config.showValues ? 60 : 0) - 100;
      const barWidth = (items[i].value / maxValue) * barMaxWidth;

      if (config.showRank) {
        ctx.fillStyle = i < 3 ? this.DEFAULT_COLORS[i] : '#999999';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(`#${i + 1}`, padding, y + itemHeight / 2 + 6);
      }

      const labelX = padding + (config.showRank ? 40 : 0);
      ctx.fillStyle = '#333333';
      ctx.font = '13px sans-serif';
      ctx.fillText(items[i].label, labelX, y + itemHeight / 2 + 5);

      const barX = labelX + 100;
      const hue = 210 - (i / items.length) * 60;
      ctx.fillStyle = `hsl(${hue}, 60%, 55%)`;
      this.roundRect(ctx, barX, y + 5, barWidth, itemHeight - 10, 4);
      ctx.fill();

      if (config.showValues) {
        ctx.fillStyle = '#333333';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(String(Math.round(items[i].value)), barX + barWidth + 8, y + itemHeight / 2 + 5);
      }
    }

    const imageBuffer = canvas.toBuffer('image/png');
    return { imageBuffer, width: config.width, height: config.height, format: 'png' };
  }

  async renderTimeline(config: TimelineViz): Promise<RenderResult> {
    const canvas = createCanvas(config.width, config.height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, config.width, config.height);

    const padding = 40;
    const events = config.events;

    if (config.direction === 'vertical') {
      const lineX = padding + 80;
      const availableHeight = config.height - padding * 2;
      const stepHeight = events.length > 1 ? availableHeight / (events.length - 1) : availableHeight;

      ctx.strokeStyle = '#CCCCCC';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lineX, padding);
      ctx.lineTo(lineX, config.height - padding);
      ctx.stroke();

      for (let i = 0; i < events.length; i++) {
        const y = padding + i * stepHeight;
        const event = events[i];
        const dotColor = event.color || (event.importance === 'high' ? '#E15759' : event.importance === 'medium' ? '#F28E2B' : '#76B7B2');
        const dotRadius = event.importance === 'high' ? 8 : event.importance === 'medium' ? 6 : 5;

        ctx.fillStyle = dotColor;
        ctx.beginPath();
        ctx.arc(lineX, y, dotRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#666666';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(event.date, lineX - 15, y + 4);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#333333';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(event.title, lineX + 20, y - 2);

        ctx.fillStyle = '#666666';
        ctx.font = '11px sans-serif';
        const maxDescWidth = config.width - lineX - 40;
        const truncated = event.description.length > 60 ? event.description.slice(0, 60) + '...' : event.description;
        ctx.fillText(truncated, lineX + 20, y + 16);
      }
    } else {
      const lineY = config.height / 2;
      const availableWidth = config.width - padding * 2;
      const stepWidth = events.length > 1 ? availableWidth / (events.length - 1) : availableWidth;

      ctx.strokeStyle = '#CCCCCC';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padding, lineY);
      ctx.lineTo(config.width - padding, lineY);
      ctx.stroke();

      for (let i = 0; i < events.length; i++) {
        const x = padding + i * stepWidth;
        const event = events[i];
        const above = i % 2 === 0;
        const dotColor = event.color || this.DEFAULT_COLORS[i % this.DEFAULT_COLORS.length];

        ctx.fillStyle = dotColor;
        ctx.beginPath();
        ctx.arc(x, lineY, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.textAlign = 'center';
        const textY = above ? lineY - 25 : lineY + 30;
        ctx.fillStyle = '#333333';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(event.title, x, textY);
        ctx.fillStyle = '#999999';
        ctx.font = '10px sans-serif';
        ctx.fillText(event.date, x, above ? textY - 14 : textY + 14);
      }
    }

    ctx.textAlign = 'left';
    const imageBuffer = canvas.toBuffer('image/png');
    return { imageBuffer, width: config.width, height: config.height, format: 'png' };
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
