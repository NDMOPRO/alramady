import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { ChartConfiguration, ChartType } from 'chart.js';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export class DataVisualizationService {

  async generateChart(
    datasetId: string,
    chartType: 'bar' | 'line' | 'pie' | 'scatter' | 'doughnut',
    config: { xColumn: string; yColumn: string; title?: string; width?: number; height?: number }
  ): Promise<Buffer> {
    const width = config.width || 800;
    const height = config.height || 600;
    const chartTitle = config.title || `${chartType} chart`;

    logger.info('Generating chart', { datasetId, chartType, xColumn: config.xColumn, yColumn: config.yColumn });

    const rows = await prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
      take: 10000,
    });

    if (rows.length === 0) {
      throw new Error(`No data rows found for dataset ${datasetId}`);
    }

    const xValues: string[] = [];
    const yValues: number[] = [];

    for (const row of rows) {
      const data = row.data as Record<string, unknown>;
      const xVal = data[config.xColumn];
      const yVal = parseFloat(data[config.yColumn]);
      if (xVal !== undefined && xVal !== null && !isNaN(yVal)) {
        xValues.push(String(xVal));
        yValues.push(yVal);
      }
    }

    if (xValues.length === 0) {
      throw new Error(`No valid data found for columns ${config.xColumn} and ${config.yColumn}`);
    }

    const backgroundColors = xValues.map((_, i) => {
      const hue = (i * 137.508) % 360;
      return `hsla(${hue}, 70%, 55%, 0.7)`;
    });

    const borderColors = xValues.map((_, i) => {
      const hue = (i * 137.508) % 360;
      return `hsla(${hue}, 70%, 45%, 1)`;
    });

    const chartCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour: '#ffffff' });

    const datasets: Record<string, unknown>[] = chartType === 'scatter'
      ? [{
          label: `${config.xColumn} vs ${config.yColumn}`,
          data: xValues.map((x, i) => ({ x: parseFloat(x) || i, y: yValues[i] })),
          backgroundColor: 'rgba(54, 162, 235, 0.6)',
          borderColor: 'rgba(54, 162, 235, 1)',
          pointRadius: 4,
        }]
      : [{
          label: config.yColumn,
          data: yValues,
          backgroundColor: backgroundColors,
          borderColor: borderColors,
          borderWidth: chartType === 'line' ? 2 : 1,
          fill: chartType === 'line' ? false : undefined,
          tension: chartType === 'line' ? 0.3 : undefined,
        }];

    const chartConfig: ChartConfiguration = {
      type: chartType as ChartType,
      data: {
        labels: xValues,
        datasets,
      },
      options: {
        responsive: false,
        plugins: {
          title: {
            display: true,
            text: chartTitle,
            font: { size: 18, weight: 'bold' },
          },
          legend: {
            display: chartType === 'pie' || chartType === 'doughnut',
            position: 'bottom',
          },
        },
        scales: chartType !== 'pie' && chartType !== 'doughnut' ? {
          x: { title: { display: true, text: config.xColumn } },
          y: { title: { display: true, text: config.yColumn }, beginAtZero: true },
        } : undefined,
      },
    };

    const imageBuffer = await chartCanvas.renderToBuffer(chartConfig);
    logger.info('Chart generated successfully', { datasetId, chartType, dataPoints: xValues.length, sizeBytes: imageBuffer.length });
    return imageBuffer;
  }

  async generateHeatmap(datasetId: string, columns: string[]): Promise<Buffer> {
    logger.info('Generating heatmap', { datasetId, columns });

    const rows = await prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
      take: 50000,
    });

    if (rows.length === 0) {
      throw new Error(`No data rows found for dataset ${datasetId}`);
    }

    const columnData: Record<string, number[]> = {};
    for (const col of columns) {
      columnData[col] = [];
    }

    for (const row of rows) {
      const data = row.data as Record<string, unknown>;
      for (const col of columns) {
        const val = parseFloat(data[col]);
        if (!isNaN(val)) {
          columnData[col].push(val);
        }
      }
    }

    const minLen = Math.min(...columns.map(c => columnData[c].length));
    if (minLen < 2) {
      throw new Error('Insufficient numeric data for correlation heatmap');
    }

    for (const col of columns) {
      columnData[col] = columnData[col].slice(0, minLen);
    }

    const correlationMatrix: number[][] = [];
    for (let i = 0; i < columns.length; i++) {
      correlationMatrix[i] = [];
      for (let j = 0; j < columns.length; j++) {
        correlationMatrix[i][j] = this.pearsonCorrelation(columnData[columns[i]], columnData[columns[j]]);
      }
    }

    const cellSize = 80;
    const labelOffset = 120;
    const width = labelOffset + columns.length * cellSize + 60;
    const height = labelOffset + columns.length * cellSize + 40;
    const chartCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour: '#ffffff' });

    const scatterData: { x: number; y: number; v: number }[] = [];
    for (let i = 0; i < columns.length; i++) {
      for (let j = 0; j < columns.length; j++) {
        scatterData.push({ x: j, y: i, v: correlationMatrix[i][j] });
      }
    }

    const bgColors = scatterData.map(p => {
      const val = p.v;
      if (val >= 0) {
        const intensity = Math.round(val * 200);
        return `rgba(${255 - intensity}, ${55 + intensity}, ${55}, 0.85)`;
      } else {
        const intensity = Math.round(Math.abs(val) * 200);
        return `rgba(${55}, ${55 + intensity}, ${255 - intensity}, 0.85)`;
      }
    });

    const chartConfig: ChartConfiguration = {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Correlation',
          data: scatterData.map(p => ({ x: p.x, y: p.y })),
          backgroundColor: bgColors,
          pointRadius: cellSize / 2.5,
          pointStyle: 'rect',
        }],
      },
      options: {
        responsive: false,
        plugins: {
          title: { display: true, text: 'Correlation Heatmap', font: { size: 16 } },
          legend: { display: false },
        },
        scales: {
          x: {
            type: 'linear',
            min: -0.5,
            max: columns.length - 0.5,
            ticks: {
              stepSize: 1,
              callback: (val: string | number) => columns[val as number] || '',
            },
          },
          y: {
            type: 'linear',
            min: -0.5,
            max: columns.length - 0.5,
            ticks: {
              stepSize: 1,
              callback: (val: string | number) => columns[val as number] || '',
            },
            reverse: true,
          },
        },
      },
    };

    const imageBuffer = await chartCanvas.renderToBuffer(chartConfig);
    logger.info('Heatmap generated', { datasetId, columns: columns.length, sizeBytes: imageBuffer.length });
    return imageBuffer;
  }

  async generateHistogram(datasetId: string, column: string, bins: number = 20): Promise<Buffer> {
    logger.info('Generating histogram', { datasetId, column, bins });

    const rows = await prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
      take: 100000,
    });

    const values: number[] = [];
    for (const row of rows) {
      const data = row.data as Record<string, unknown>;
      const val = parseFloat(data[column]);
      if (!isNaN(val) && isFinite(val)) {
        values.push(val);
      }
    }

    if (values.length === 0) {
      throw new Error(`No numeric data found in column "${column}"`);
    }

    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal;
    const binWidth = range === 0 ? 1 : range / bins;

    const binEdges: number[] = [];
    const binCounts: number[] = new Array(bins).fill(0);
    const binLabels: string[] = [];

    for (let i = 0; i <= bins; i++) {
      binEdges.push(minVal + i * binWidth);
    }

    for (const val of values) {
      let binIndex = Math.floor((val - minVal) / binWidth);
      if (binIndex >= bins) binIndex = bins - 1;
      if (binIndex < 0) binIndex = 0;
      binCounts[binIndex]++;
    }

    for (let i = 0; i < bins; i++) {
      binLabels.push(`${binEdges[i].toFixed(2)} - ${binEdges[i + 1].toFixed(2)}`);
    }

    const chartCanvas = new ChartJSNodeCanvas({ width: 900, height: 600, backgroundColour: '#ffffff' });

    const chartConfig: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: binLabels,
        datasets: [{
          label: `Distribution of ${column}`,
          data: binCounts,
          backgroundColor: 'rgba(75, 192, 192, 0.6)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1,
          barPercentage: 1.0,
          categoryPercentage: 1.0,
        }],
      },
      options: {
        responsive: false,
        plugins: {
          title: { display: true, text: `Histogram: ${column}`, font: { size: 16 } },
        },
        scales: {
          x: { title: { display: true, text: column } },
          y: { title: { display: true, text: 'Frequency' }, beginAtZero: true },
        },
      },
    };

    const imageBuffer = await chartCanvas.renderToBuffer(chartConfig);
    logger.info('Histogram generated', { datasetId, column, bins, valueCount: values.length, sizeBytes: imageBuffer.length });
    return imageBuffer;
  }

  async generateBoxplot(datasetId: string, columns: string[]): Promise<Buffer> {
    logger.info('Generating boxplot', { datasetId, columns });

    const rows = await prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
      take: 100000,
    });

    if (rows.length === 0) {
      throw new Error(`No data rows found for dataset ${datasetId}`);
    }

    const columnStats: Array<{
      name: string; min: number; q1: number; median: number; q3: number; max: number;
    }> = [];

    for (const col of columns) {
      const values: number[] = [];
      for (const row of rows) {
        const data = row.data as Record<string, unknown>;
        const val = parseFloat(data[col]);
        if (!isNaN(val) && isFinite(val)) {
          values.push(val);
        }
      }

      if (values.length < 4) {
        logger.warn(`Skipping column ${col}: insufficient numeric data (${values.length} values)`);
        continue;
      }

      values.sort((a, b) => a - b);
      const n = values.length;
      const q1Idx = Math.floor(n * 0.25);
      const medIdx = Math.floor(n * 0.5);
      const q3Idx = Math.floor(n * 0.75);

      const q1 = values[q1Idx];
      const median = values[medIdx];
      const q3 = values[q3Idx];
      const iqr = q3 - q1;
      const lowerFence = q1 - 1.5 * iqr;
      const upperFence = q3 + 1.5 * iqr;

      const minVal = values.find(v => v >= lowerFence) ?? values[0];
      const maxVal = [...values].reverse().find(v => v <= upperFence) ?? values[n - 1];

      columnStats.push({ name: col, min: minVal, q1, median, q3, max: maxVal });
    }

    if (columnStats.length === 0) {
      throw new Error('No columns had sufficient numeric data for boxplot');
    }

    const chartCanvas = new ChartJSNodeCanvas({ width: 900, height: 600, backgroundColour: '#ffffff' });

    const labels = columnStats.map(s => s.name);
    const minData = columnStats.map(s => s.min);
    const q1Data = columnStats.map(s => s.q1);
    const medianData = columnStats.map(s => s.median);
    const q3Data = columnStats.map(s => s.q3);
    const maxData = columnStats.map(s => s.max);

    const chartConfig: ChartConfiguration = {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Min',
            data: minData,
            backgroundColor: 'rgba(255, 99, 132, 0.5)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 1,
          },
          {
            label: 'Q1',
            data: q1Data,
            backgroundColor: 'rgba(255, 159, 64, 0.5)',
            borderColor: 'rgba(255, 159, 64, 1)',
            borderWidth: 1,
          },
          {
            label: 'Median',
            data: medianData,
            backgroundColor: 'rgba(75, 192, 192, 0.5)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1,
          },
          {
            label: 'Q3',
            data: q3Data,
            backgroundColor: 'rgba(54, 162, 235, 0.5)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1,
          },
          {
            label: 'Max',
            data: maxData,
            backgroundColor: 'rgba(153, 102, 255, 0.5)',
            borderColor: 'rgba(153, 102, 255, 1)',
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: false,
        plugins: {
          title: { display: true, text: 'Box Plot (Min / Q1 / Median / Q3 / Max)', font: { size: 16 } },
          legend: { display: true, position: 'bottom' },
        },
        scales: {
          x: { title: { display: true, text: 'Columns' } },
          y: { title: { display: true, text: 'Values' }, beginAtZero: false },
        },
      },
    };

    const imageBuffer = await chartCanvas.renderToBuffer(chartConfig);
    logger.info('Boxplot generated', { datasetId, columnsRendered: columnStats.length, sizeBytes: imageBuffer.length });
    return imageBuffer;
  }

  async getStatistics(datasetId: string): Promise<Record<string, Record<string, number>>> {
    logger.info('Computing descriptive statistics', { datasetId });

    const datasetColumns = await prisma.datasetColumn.findMany({
      where: { datasetId },
    });

    const rows = await prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
    });

    if (rows.length === 0) {
      throw new Error(`No data rows found for dataset ${datasetId}`);
    }

    const numericColumns = datasetColumns.filter(c =>
      c.dataType === 'number' || c.dataType === 'integer' || c.dataType === 'float' || c.dataType === 'decimal'
    );

    if (numericColumns.length === 0) {
      const allCols = datasetColumns.map(c => c.name);
      for (const col of allCols) {
        const vals: number[] = [];
        for (const row of rows.slice(0, 100)) {
          const d = row.data as Record<string, unknown>;
          const v = parseFloat(d[col]);
          if (!isNaN(v)) vals.push(v);
        }
        if (vals.length > rows.slice(0, 100).length * 0.5) {
          numericColumns.push({ id: '', datasetId, name: col, dataType: 'number', position: null, nullable: null, statsJson: null } as unknown as typeof numericColumns[number]);
        }
      }
    }

    const result: Record<string, Record<string, number>> = {};

    for (const col of numericColumns) {
      const values: number[] = [];
      let nullCount = 0;

      for (const row of rows) {
        const data = row.data as Record<string, unknown>;
        const val = data[col.name];
        if (val === null || val === undefined || val === '') {
          nullCount++;
        } else {
          const num = parseFloat(val);
          if (!isNaN(num) && isFinite(num)) {
            values.push(num);
          } else {
            nullCount++;
          }
        }
      }

      if (values.length === 0) {
        result[col.name] = { count: 0, nullCount, mean: 0, median: 0, std: 0, min: 0, max: 0, q1: 0, q3: 0 };
        continue;
      }

      values.sort((a, b) => a - b);
      const n = values.length;
      const sum = values.reduce((acc, v) => acc + v, 0);
      const mean = sum / n;

      const varianceSum = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0);
      const std = Math.sqrt(varianceSum / (n - 1 || 1));

      const median = n % 2 === 0 ? (values[n / 2 - 1] + values[n / 2]) / 2 : values[Math.floor(n / 2)];
      const q1Idx = Math.floor(n * 0.25);
      const q3Idx = Math.floor(n * 0.75);
      const q1 = values[q1Idx];
      const q3 = values[q3Idx];

      result[col.name] = {
        count: n,
        nullCount,
        mean: parseFloat(mean.toFixed(6)),
        median: parseFloat(median.toFixed(6)),
        std: parseFloat(std.toFixed(6)),
        min: values[0],
        max: values[n - 1],
        q1: parseFloat(q1.toFixed(6)),
        q3: parseFloat(q3.toFixed(6)),
      };
    }

    logger.info('Statistics computed', { datasetId, columnsAnalyzed: Object.keys(result).length, totalRows: rows.length });
    return result;
  }

  async getCorrelation(datasetId: string, columns: string[]): Promise<{ matrix: number[][]; columns: string[] }> {
    logger.info('Computing correlation matrix', { datasetId, columns });

    const rows = await prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
      take: 100000,
    });

    if (rows.length === 0) {
      throw new Error(`No data rows found for dataset ${datasetId}`);
    }

    const columnData: Record<string, number[]> = {};
    for (const col of columns) {
      columnData[col] = [];
    }

    for (const row of rows) {
      const data = row.data as Record<string, unknown>;
      let allValid = true;
      const parsed: Record<string, number> = {};
      for (const col of columns) {
        const val = parseFloat(data[col]);
        if (isNaN(val) || !isFinite(val)) {
          allValid = false;
          break;
        }
        parsed[col] = val;
      }
      if (allValid) {
        for (const col of columns) {
          columnData[col].push(parsed[col]);
        }
      }
    }

    const sampleSize = columnData[columns[0]]?.length || 0;
    if (sampleSize < 2) {
      throw new Error('Insufficient paired numeric data for correlation computation');
    }

    const matrix: number[][] = [];
    for (let i = 0; i < columns.length; i++) {
      matrix[i] = [];
      for (let j = 0; j < columns.length; j++) {
        const r = this.pearsonCorrelation(columnData[columns[i]], columnData[columns[j]]);
        matrix[i][j] = parseFloat(r.toFixed(6));
      }
    }

    logger.info('Correlation matrix computed', { datasetId, columnsCount: columns.length, sampleSize });
    return { matrix, columns };
  }

  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n === 0) return 0;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((a, xi, i) => a + xi * y[i], 0);
    const sumX2 = x.reduce((a, xi) => a + xi * xi, 0);
    const sumY2 = y.reduce((a, yi) => a + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    if (denominator === 0) return 0;
    return numerator / denominator;
  }
}
