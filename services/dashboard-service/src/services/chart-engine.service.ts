import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { ChartConfiguration, ChartDataset } from 'chart.js';
import sharp from 'sharp';
import Color from 'color';
import { logger } from '../utils/logger';

interface DatasetEntry {
  label: string;
  data: number[];
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  barPercentage?: number;
  categoryPercentage?: number;
  pointRadius?: number;
  pointHoverRadius?: number;
  tension?: number;
  fill?: boolean;
}

interface LineDatasetEntry {
  label: string;
  data: number[];
  borderColor?: string;
  pointRadius?: number;
  pointHoverRadius?: number;
  borderWidth?: number;
  tension?: number;
  fill?: boolean;
}

interface CombinedBarDatasetEntry {
  label: string;
  data: number[];
  backgroundColor?: string;
}

interface CombinedLineDatasetEntry {
  label: string;
  data: number[];
  borderColor?: string;
}

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 600;
const DEFAULT_BG = '#ffffff';

const DEFAULT_PALETTE = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2',
  '#59a14f', '#edc949', '#af7aa1', '#ff9da7',
  '#9c755f', '#bab0ab',
];

function createCanvas(width: number, height: number): ChartJSNodeCanvas {
  return new ChartJSNodeCanvas({
    width,
    height,
    backgroundColour: DEFAULT_BG,
  });
}

function assignColors(datasets: DatasetEntry[], palette: string[]): DatasetEntry[] {
  return datasets.map((ds: DatasetEntry, idx: number) => {
    const baseColor = ds.backgroundColor ?? palette[idx % palette.length];
    const borderColor = ds.borderColor ?? Color(baseColor).darken(0.2).hex();
    return {
      ...ds,
      backgroundColor: ds.backgroundColor ?? baseColor,
      borderColor: borderColor,
    };
  });
}

export async function renderBarChart(
  data: { labels: string[]; datasets: Array<{ label: string; data: number[]; backgroundColor?: string }> },
  config?: { width?: number; height?: number; title?: string }
): Promise<Buffer> {
  const width = config?.width ?? DEFAULT_WIDTH;
  const height = config?.height ?? DEFAULT_HEIGHT;
  const title = config?.title ?? 'Bar Chart';

  logger.info('Rendering bar chart', { width, height, title, datasetCount: data.datasets.length });

  const coloredDatasets = assignColors(data.datasets, DEFAULT_PALETTE).map((ds: DatasetEntry) => ({
    ...ds,
    borderWidth: ds.borderWidth ?? 1,
    borderRadius: ds.borderRadius ?? 4,
    barPercentage: ds.barPercentage ?? 0.8,
    categoryPercentage: ds.categoryPercentage ?? 0.9,
  }));

  const chartConfig: ChartConfiguration = {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: coloredDatasets,
    },
    options: {
      responsive: false,
      animation: false as const,
      plugins: {
        title: {
          display: true,
          text: title,
          font: { size: 18, weight: 'bold' },
          padding: { top: 10, bottom: 20 },
        },
        legend: {
          display: data.datasets.length > 1,
          position: 'bottom',
          labels: { padding: 15, usePointStyle: true },
        },
        tooltip: { enabled: true },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 12 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: '#e0e0e0' },
          ticks: { font: { size: 12 } },
        },
      },
    },
  };

  const canvas = createCanvas(width, height);
  const buffer = await canvas.renderToBuffer(chartConfig);

  logger.info('Bar chart rendered', { bufferSize: buffer.length });
  return buffer;
}

export async function renderLineChart(
  data: { labels: string[]; datasets: Array<{ label: string; data: number[]; borderColor?: string }> },
  config?: { width?: number; height?: number; title?: string; tension?: number; fill?: boolean }
): Promise<Buffer> {
  const width = config?.width ?? DEFAULT_WIDTH;
  const height = config?.height ?? DEFAULT_HEIGHT;
  const title = config?.title ?? 'Line Chart';
  const tension = config?.tension ?? 0.3;
  const fill = config?.fill ?? false;

  logger.info('Rendering line chart', { width, height, title, datasetCount: data.datasets.length });

  const coloredDatasets = data.datasets.map((ds: LineDatasetEntry, idx: number) => {
    const lineColor = ds.borderColor ?? DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length];
    const pointBg = Color(lineColor).lighten(0.2).hex();
    return {
      ...ds,
      borderColor: lineColor,
      backgroundColor: fill ? Color(lineColor).alpha(0.15).rgb().string() : lineColor,
      pointBackgroundColor: pointBg,
      pointBorderColor: lineColor,
      pointRadius: ds.pointRadius ?? 4,
      pointHoverRadius: ds.pointHoverRadius ?? 6,
      borderWidth: ds.borderWidth ?? 2,
      tension: ds.tension ?? tension,
      fill: ds.fill ?? fill,
    };
  });

  const chartConfig: ChartConfiguration = {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: coloredDatasets,
    },
    options: {
      responsive: false,
      animation: false as const,
      plugins: {
        title: {
          display: true,
          text: title,
          font: { size: 18, weight: 'bold' },
          padding: { top: 10, bottom: 20 },
        },
        legend: {
          display: true,
          position: 'bottom',
          labels: { padding: 15, usePointStyle: true },
        },
      },
      scales: {
        x: {
          grid: { color: '#f0f0f0' },
          ticks: { font: { size: 12 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: '#e0e0e0' },
          ticks: { font: { size: 12 } },
        },
      },
      interaction: {
        mode: 'index',
        intersect: false,
      },
    },
  };

  const canvas = createCanvas(width, height);
  const buffer = await canvas.renderToBuffer(chartConfig);

  logger.info('Line chart rendered', { bufferSize: buffer.length });
  return buffer;
}

export async function renderPieChart(
  data: { labels: string[]; data: number[]; backgroundColor?: string[] },
  config?: { width?: number; height?: number; title?: string; doughnut?: boolean; cutout?: string }
): Promise<Buffer> {
  const width = config?.width ?? DEFAULT_WIDTH;
  const height = config?.height ?? DEFAULT_HEIGHT;
  const title = config?.title ?? 'Pie Chart';
  const isDoughnut = config?.doughnut ?? false;
  const cutout = config?.cutout ?? (isDoughnut ? '50%' : '0%');

  logger.info('Rendering pie chart', { width, height, title, isDoughnut });

  const colors = data.backgroundColor ?? data.labels.map((_: string, i: number) => DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]);
  const borderColors = colors.map((c: string) => Color(c).darken(0.15).hex());

  const chartConfig: ChartConfiguration = {
    type: isDoughnut ? 'doughnut' : 'pie',
    data: {
      labels: data.labels,
      datasets: [{
        data: data.data,
        backgroundColor: colors,
        borderColor: borderColors,
        borderWidth: 2,
        hoverOffset: 10,
      }],
    },
    options: {
      responsive: false,
      animation: false as const,
      cutout,
      plugins: {
        title: {
          display: true,
          text: title,
          font: { size: 18, weight: 'bold' },
          padding: { top: 10, bottom: 20 },
        },
        legend: {
          display: true,
          position: 'right',
          labels: {
            padding: 12,
            usePointStyle: true,
            font: { size: 12 },
          },
        },
      },
    } as ChartConfiguration['options'],
  };

  const canvas = createCanvas(width, height);
  const buffer = await canvas.renderToBuffer(chartConfig as ChartConfiguration);

  logger.info('Pie chart rendered', { bufferSize: buffer.length });
  return buffer;
}

export async function renderScatterPlot(
  data: { datasets: Array<{ label: string; data: Array<{ x: number; y: number }>; backgroundColor?: string }> },
  config?: { width?: number; height?: number; title?: string; trendLine?: boolean }
): Promise<Buffer> {
  const width = config?.width ?? DEFAULT_WIDTH;
  const height = config?.height ?? DEFAULT_HEIGHT;
  const title = config?.title ?? 'Scatter Plot';
  const showTrendLine = config?.trendLine ?? false;

  logger.info('Rendering scatter plot', { width, height, title, trendLine: showTrendLine });

  const chartDatasets: ChartDataset[] = data.datasets.map((ds: (typeof data.datasets)[number], idx: number) => {
    const color = ds.backgroundColor ?? DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length];
    return {
      label: ds.label,
      data: ds.data,
      backgroundColor: Color(color).alpha(0.7).rgb().string(),
      borderColor: color,
      borderWidth: 1,
      pointRadius: ds.pointRadius ?? 5,
      pointHoverRadius: ds.pointHoverRadius ?? 8,
      showLine: false,
    };
  });

  if (showTrendLine && data.datasets.length > 0) {
    const points = data.datasets[0].data;
    const n = points.length;
    if (n >= 2) {
      const sumX = points.reduce((s: number, p: { x: number; y: number }) => s + p.x, 0);
      const sumY = points.reduce((s: number, p: { x: number; y: number }) => s + p.y, 0);
      const sumXY = points.reduce((s: number, p: { x: number; y: number }) => s + p.x * p.y, 0);
      const sumX2 = points.reduce((s: number, p: { x: number; y: number }) => s + p.x * p.x, 0);
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      const minX = Math.min(...points.map((p: { x: number }) => p.x));
      const maxX = Math.max(...points.map((p: { x: number }) => p.x));

      chartDatasets.push({
        label: 'Trend Line',
        data: [
          { x: minX, y: slope * minX + intercept },
          { x: maxX, y: slope * maxX + intercept },
        ],
        type: 'line' as const,
        borderColor: '#ff0000',
        borderWidth: 2,
        borderDash: [8, 4],
        pointRadius: 0,
        showLine: true,
        fill: false,
      });
    }
  }

  const chartConfig: ChartConfiguration = {
    type: 'scatter',
    data: { datasets: chartDatasets },
    options: {
      responsive: false,
      animation: false as const,
      plugins: {
        title: {
          display: true,
          text: title,
          font: { size: 18, weight: 'bold' },
          padding: { top: 10, bottom: 20 },
        },
        legend: {
          display: true,
          position: 'bottom',
          labels: { padding: 15, usePointStyle: true },
        },
      },
      scales: {
        x: {
          grid: { color: '#e0e0e0' },
          ticks: { font: { size: 12 } },
        },
        y: {
          grid: { color: '#e0e0e0' },
          ticks: { font: { size: 12 } },
        },
      },
    },
  };

  const canvas = createCanvas(width, height);
  const buffer = await canvas.renderToBuffer(chartConfig);

  logger.info('Scatter plot rendered', { bufferSize: buffer.length });
  return buffer;
}

export async function renderAreaChart(
  data: { labels: string[]; datasets: Array<{ label: string; data: number[]; backgroundColor?: string }> },
  config?: { width?: number; height?: number; title?: string; stacked?: boolean }
): Promise<Buffer> {
  const width = config?.width ?? DEFAULT_WIDTH;
  const height = config?.height ?? DEFAULT_HEIGHT;
  const title = config?.title ?? 'Area Chart';
  const stacked = config?.stacked ?? false;

  logger.info('Rendering area chart', { width, height, title, stacked });

  const coloredDatasets = data.datasets.map((ds: DatasetEntry, idx: number) => {
    const baseColor = ds.backgroundColor ?? DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length];
    return {
      ...ds,
      backgroundColor: Color(baseColor).alpha(0.3).rgb().string(),
      borderColor: baseColor,
      borderWidth: 2,
      fill: true,
      tension: ds.tension ?? 0.3,
      pointRadius: ds.pointRadius ?? 3,
      pointBackgroundColor: baseColor,
    };
  });

  const chartConfig: ChartConfiguration = {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: coloredDatasets,
    },
    options: {
      responsive: false,
      animation: false as const,
      plugins: {
        title: {
          display: true,
          text: title,
          font: { size: 18, weight: 'bold' },
          padding: { top: 10, bottom: 20 },
        },
        legend: {
          display: true,
          position: 'bottom',
          labels: { padding: 15, usePointStyle: true },
        },
        filler: { propagate: true },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 12 } },
        },
        y: {
          beginAtZero: true,
          stacked: stacked,
          grid: { color: '#e0e0e0' },
          ticks: { font: { size: 12 } },
        },
      },
    },
  };

  const canvas = createCanvas(width, height);
  const buffer = await canvas.renderToBuffer(chartConfig);

  logger.info('Area chart rendered', { bufferSize: buffer.length });
  return buffer;
}

export async function renderRadarChart(
  data: { labels: string[]; datasets: Array<{ label: string; data: number[]; backgroundColor?: string }> },
  config?: { width?: number; height?: number; title?: string }
): Promise<Buffer> {
  const width = config?.width ?? DEFAULT_WIDTH;
  const height = config?.height ?? DEFAULT_HEIGHT;
  const title = config?.title ?? 'Radar Chart';

  logger.info('Rendering radar chart', { width, height, title });

  const coloredDatasets = data.datasets.map((ds: DatasetEntry, idx: number) => {
    const baseColor = ds.backgroundColor ?? DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length];
    return {
      ...ds,
      backgroundColor: Color(baseColor).alpha(0.2).rgb().string(),
      borderColor: baseColor,
      borderWidth: 2,
      pointBackgroundColor: baseColor,
      pointBorderColor: '#ffffff',
      pointBorderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
    };
  });

  const chartConfig: ChartConfiguration = {
    type: 'radar',
    data: {
      labels: data.labels,
      datasets: coloredDatasets,
    },
    options: {
      responsive: false,
      animation: false as const,
      plugins: {
        title: {
          display: true,
          text: title,
          font: { size: 18, weight: 'bold' },
          padding: { top: 10, bottom: 20 },
        },
        legend: {
          display: true,
          position: 'bottom',
          labels: { padding: 15, usePointStyle: true },
        },
      },
      scales: {
        r: {
          beginAtZero: true,
          grid: { color: '#e0e0e0' },
          pointLabels: { font: { size: 12 } },
          ticks: { font: { size: 10 }, backdropColor: 'transparent' },
        },
      },
    },
  };

  const canvas = createCanvas(width, height);
  const buffer = await canvas.renderToBuffer(chartConfig);

  logger.info('Radar chart rendered', { bufferSize: buffer.length });
  return buffer;
}

export async function renderGaugeChart(
  value: number,
  max: number,
  config?: { width?: number; height?: number; title?: string; thresholds?: { warning: number; critical: number } }
): Promise<Buffer> {
  const width = config?.width ?? DEFAULT_WIDTH;
  const height = config?.height ?? DEFAULT_HEIGHT;
  const title = config?.title ?? 'Gauge';

  logger.info('Rendering gauge chart', { width, height, title, value, max });

  const clampedValue = Math.max(0, Math.min(value, max));
  const remaining = max - clampedValue;
  const percentage = Math.round((clampedValue / max) * 100);

  const warningThreshold = config?.thresholds?.warning ?? max * 0.6;
  const criticalThreshold = config?.thresholds?.critical ?? max * 0.85;

  let gaugeColor: string;
  if (clampedValue >= criticalThreshold) {
    gaugeColor = '#e15759';
  } else if (clampedValue >= warningThreshold) {
    gaugeColor = '#f28e2b';
  } else {
    gaugeColor = '#59a14f';
  }

  const chartConfig: ChartConfiguration = {
    type: 'doughnut',
    data: {
      labels: ['Value', 'Remaining'],
      datasets: [{
        data: [clampedValue, remaining],
        backgroundColor: [gaugeColor, '#e8e8e8'],
        borderColor: [Color(gaugeColor).darken(0.1).hex(), '#d0d0d0'],
        borderWidth: 1,
        circumference: 270,
        rotation: 225,
      }],
    },
    options: {
      responsive: false,
      animation: false as const,
      cutout: '75%',
      plugins: {
        title: {
          display: true,
          text: `${title} — ${percentage}%`,
          font: { size: 18, weight: 'bold' },
          padding: { top: 10, bottom: 5 },
        },
        legend: { display: false },
        tooltip: { enabled: false },
      },
    } as ChartConfiguration['options'],
  };

  const canvas = createCanvas(width, height);
  const buffer = await canvas.renderToBuffer(chartConfig);

  logger.info('Gauge chart rendered', { bufferSize: buffer.length, percentage });
  return buffer;
}

export async function renderWaterfallChart(
  data: { labels: string[]; values: number[] },
  config?: { width?: number; height?: number; title?: string }
): Promise<Buffer> {
  const width = config?.width ?? DEFAULT_WIDTH;
  const height = config?.height ?? DEFAULT_HEIGHT;
  const title = config?.title ?? 'Waterfall Chart';

  logger.info('Rendering waterfall chart', { width, height, title, itemCount: data.values.length });

  const cumulativeBase: number[] = [];
  const positiveValues: (number | null)[] = [];
  const negativeValues: (number | null)[] = [];
  const backgroundColors: string[] = [];

  let runningTotal = 0;

  for (let i = 0; i < data.values.length; i++) {
    const val = data.values[i];

    if (i === 0) {
      cumulativeBase.push(0);
      positiveValues.push(val >= 0 ? val : null);
      negativeValues.push(val < 0 ? Math.abs(val) : null);
      backgroundColors.push(val >= 0 ? '#59a14f' : '#e15759');
      runningTotal = val;
    } else if (i === data.values.length - 1) {
      cumulativeBase.push(0);
      positiveValues.push(runningTotal + val >= 0 ? runningTotal + val : null);
      negativeValues.push(runningTotal + val < 0 ? Math.abs(runningTotal + val) : null);
      backgroundColors.push('#4e79a7');
    } else {
      if (val >= 0) {
        cumulativeBase.push(runningTotal);
        positiveValues.push(val);
        negativeValues.push(null);
        backgroundColors.push('#59a14f');
      } else {
        cumulativeBase.push(runningTotal + val);
        positiveValues.push(null);
        negativeValues.push(Math.abs(val));
        backgroundColors.push('#e15759');
      }
      runningTotal += val;
    }
  }

  const displayValues = data.values.map((_: number, i: number) => {
    return positiveValues[i] ?? negativeValues[i] ?? 0;
  });

  const chartConfig: ChartConfiguration = {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [
        {
          label: 'Base',
          data: cumulativeBase,
          backgroundColor: 'transparent',
          borderWidth: 0,
          barPercentage: 0.7,
        },
        {
          label: 'Values',
          data: displayValues,
          backgroundColor: backgroundColors,
          borderColor: backgroundColors.map((c: string) => Color(c).darken(0.15).hex()),
          borderWidth: 1,
          barPercentage: 0.7,
        },
      ],
    },
    options: {
      responsive: false,
      animation: false as const,
      plugins: {
        title: {
          display: true,
          text: title,
          font: { size: 18, weight: 'bold' },
          padding: { top: 10, bottom: 20 },
        },
        legend: { display: false },
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { font: { size: 12 } },
        },
        y: {
          stacked: true,
          grid: { color: '#e0e0e0' },
          ticks: { font: { size: 12 } },
        },
      },
    },
  };

  const canvas = createCanvas(width, height);
  const buffer = await canvas.renderToBuffer(chartConfig);

  logger.info('Waterfall chart rendered', { bufferSize: buffer.length });
  return buffer;
}

export async function renderCombinedChart(
  data: {
    labels: string[];
    barDatasets?: Array<{ label: string; data: number[]; backgroundColor?: string }>;
    lineDatasets?: Array<{ label: string; data: number[]; borderColor?: string }>;
  },
  config?: { width?: number; height?: number; title?: string }
): Promise<Buffer> {
  const width = config?.width ?? DEFAULT_WIDTH;
  const height = config?.height ?? DEFAULT_HEIGHT;
  const title = config?.title ?? 'Combined Chart';

  logger.info('Rendering combined chart', { width, height, title });

  const barDs = (data.barDatasets ?? []).map((ds: CombinedBarDatasetEntry, idx: number) => {
    const color = ds.backgroundColor ?? DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length];
    return {
      type: 'bar' as const,
      label: ds.label,
      data: ds.data,
      backgroundColor: Color(color).alpha(0.7).rgb().string(),
      borderColor: color,
      borderWidth: 1,
      borderRadius: 3,
      order: 2,
    };
  });

  const lineDs = (data.lineDatasets ?? []).map((ds: CombinedLineDatasetEntry, idx: number) => {
    const color = ds.borderColor ?? DEFAULT_PALETTE[(barDs.length + idx) % DEFAULT_PALETTE.length];
    return {
      type: 'line' as const,
      label: ds.label,
      data: ds.data,
      borderColor: color,
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 4,
      pointBackgroundColor: color,
      tension: 0.3,
      fill: false,
      order: 1,
    };
  });

  const chartConfig: ChartConfiguration = {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [...barDs, ...lineDs] as ChartDataset[],
    },
    options: {
      responsive: false,
      animation: false as const,
      plugins: {
        title: {
          display: true,
          text: title,
          font: { size: 18, weight: 'bold' },
          padding: { top: 10, bottom: 20 },
        },
        legend: {
          display: true,
          position: 'bottom',
          labels: { padding: 15, usePointStyle: true },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 12 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: '#e0e0e0' },
          ticks: { font: { size: 12 } },
        },
      },
    },
  };

  const canvas = createCanvas(width, height);
  const buffer = await canvas.renderToBuffer(chartConfig);

  logger.info('Combined chart rendered', { bufferSize: buffer.length });
  return buffer;
}

export async function renderChartToImage(
  chartConfig: ChartConfiguration,
  format: 'png' | 'jpeg',
  width: number,
  height: number
): Promise<Buffer> {
  const effectiveWidth = Math.max(100, Math.min(width, 4096));
  const effectiveHeight = Math.max(100, Math.min(height, 4096));

  logger.info('Rendering custom chart to image', {
    format,
    width: effectiveWidth,
    height: effectiveHeight,
    type: chartConfig?.type,
  });

  const config: ChartConfiguration = {
    ...chartConfig,
    options: {
      ...chartConfig.options,
      responsive: false,
      animation: false as const,
    },
  };

  const canvas = createCanvas(effectiveWidth, effectiveHeight);
  const pngBuffer = await canvas.renderToBuffer(config);

  let outputBuffer: Buffer;
  if (format === 'jpeg') {
    outputBuffer = await sharp(pngBuffer)
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
  } else {
    outputBuffer = await sharp(pngBuffer)
      .png({ compressionLevel: 6 })
      .toBuffer();
  }

  logger.info('Custom chart rendered', {
    format,
    inputSize: pngBuffer.length,
    outputSize: outputBuffer.length,
  });

  return outputBuffer;
}
