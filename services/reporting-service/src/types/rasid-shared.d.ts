declare module '@rasid/shared' {
  export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  export interface AxisConfig {
    label: string;
    type: 'category' | 'value' | 'time';
    min: number | null;
    max: number | null;
    tickCount?: number;
    tickValues?: string[];
    format: string | null;
    rotation?: number;
  }

  export interface ChartSeries {
    name: string;
    data: Array<{ label: string; value: number; category?: string }>;
    type: string;
    color: string;
    stacked?: boolean;
  }

  export interface ChartContent {
    kind: 'chart';
    chartType: 'bar' | 'line' | 'pie' | 'doughnut' | 'scatter' | 'area' | 'radar' | 'gauge' | 'waterfall' | 'treemap' | 'heatmap' | 'funnel' | 'combo';
    title: string;
    subtitle: string | null;
    xAxis: AxisConfig | null;
    yAxis: AxisConfig | null;
    series: ChartSeries[];
    legend: {
      position: 'top' | 'bottom' | 'left' | 'right';
      items: Array<{ label: string; color: string; shape?: string }>;
    } | null;
    colors: string[];
    dataLabels: boolean;
    gridLines: boolean;
  }
}
