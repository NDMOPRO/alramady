declare module 'chartjs-node-canvas' {
  export class ChartJSNodeCanvas {
    constructor(options: { width: number; height: number; backgroundColour?: string });
    renderToBuffer(config: any): Promise<Buffer>;
    renderToDataURL(config: any): Promise<string>;
  }
}
