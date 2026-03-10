declare module 'node-cron' {
  export interface ScheduledTask {
    stop(): void;
    start(): void;
  }
  export function schedule(expression: string, func: () => void, options?: Record<string, any>): ScheduledTask;
  export function validate(expression: string): boolean;
}

declare module 'chartjs-node-canvas' {
  import type { ChartConfiguration } from 'chart.js';
  export class ChartJSNodeCanvas {
    constructor(config: { width: number; height: number; backgroundColour?: string });
    renderToBuffer(config: ChartConfiguration): Promise<Buffer>;
    renderToDataURL(config: ChartConfiguration): Promise<string>;
  }
}

declare module 'chart.js' {
  export interface ChartConfiguration {
    type: string;
    data: Record<string, any>;
    options?: Record<string, any>;
  }
  export type ChartType = string;
}

declare module 'cheerio' {
  export function load(html: string): any;
  export function html(): string;
}

declare module '@json2csv/plainjs' {
  export class Parser {
    constructor(opts?: { fields?: string[]; delimiter?: string });
    parse(data: Record<string, any>[]): string;
  }
}
