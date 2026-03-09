/**
 * Cross-Engine Data Bridge — Rasid Platform
 * جسر البيانات بين المحركات
 *
 * Allows all 13 engines to exchange data seamlessly via publish/subscribe,
 * synchronous request/response, data transformation, and full lineage tracking.
 */

import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Enums & Interfaces
// ---------------------------------------------------------------------------

export enum EngineType {
  DATA = 'data',
  EXCEL = 'excel',
  DASHBOARD = 'dashboard',
  REPORTING = 'reporting',
  PRESENTATION = 'presentation',
  INFOGRAPHIC = 'infographic',
  REPLICATION = 'replication',
  LOCALIZATION = 'localization',
  AI = 'ai',
  GOVERNANCE = 'governance',
  LIBRARY = 'library',
  TEMPLATE = 'template',
  CONVERSION = 'conversion',
}

export interface BridgePayload {
  id: string;
  sourceEngine: EngineType;
  targetEngine: EngineType | '*';
  dataType: string;
  data: Record<string, unknown>;
  metadata: {
    tenantId: string;
    userId: string;
    timestamp: string;
    correlationId: string;
    ttlMs?: number;
  };
}

export interface BridgeSubscription {
  id: string;
  engine: EngineType;
  dataTypes: string[];
  callback: (payload: BridgePayload) => Promise<void>;
}

export interface DataLineageRecord {
  id: string;
  payloadId: string;
  sourceEngine: EngineType;
  targetEngine: EngineType;
  dataType: string;
  timestamp: string;
  tenantId: string;
  userId: string;
  transformations: string[];
}

export interface BridgeStats {
  totalPublished: number;
  totalDelivered: number;
  totalRequests: number;
  totalErrors: number;
  activeSubscriptions: number;
  registeredHandlers: number;
  lineageRecords: number;
  publishedByEngine: Record<string, number>;
  deliveredByEngine: Record<string, number>;
  requestsByEngine: Record<string, number>;
  errorsByEngine: Record<string, number>;
  publishedByDataType: Record<string, number>;
  uptime: number;
}

type RequestHandler = (payload: BridgePayload) => Promise<Record<string, unknown>>;

interface HandlerKey {
  engine: EngineType;
  dataType: string;
}

// ---------------------------------------------------------------------------
// Data format transformers registry
// ---------------------------------------------------------------------------

interface FormatTransformer {
  sourceFormat: string;
  targetFormat: string;
  transform: (data: Record<string, unknown>) => Record<string, unknown>;
}

const BUILT_IN_TRANSFORMERS: FormatTransformer[] = [
  {
    sourceFormat: 'dataset',
    targetFormat: 'chart',
    transform: (data: Record<string, unknown>): Record<string, unknown> => {
      const rows = Array.isArray(data['rows']) ? data['rows'] as Record<string, unknown>[] : [];
      const columns = Array.isArray(data['columns']) ? data['columns'] as string[] : [];
      const labels: unknown[] = [];
      const series: Record<string, unknown[]> = {};

      for (const col of columns) {
        series[col] = [];
      }

      for (const row of rows) {
        const rowRecord = row as Record<string, unknown>;
        const firstCol = columns[0];
        if (firstCol) {
          labels.push(rowRecord[firstCol]);
        }
        for (let i = 1; i < columns.length; i++) {
          const col = columns[i];
          if (col && series[col]) {
            series[col].push(rowRecord[col]);
          }
        }
      }

      return { labels, series, chartType: data['chartType'] ?? 'bar' };
    },
  },
  {
    sourceFormat: 'chart',
    targetFormat: 'dataset',
    transform: (data: Record<string, unknown>): Record<string, unknown> => {
      const labels = Array.isArray(data['labels']) ? data['labels'] : [];
      const series = (data['series'] ?? {}) as Record<string, unknown[]>;
      const seriesKeys = Object.keys(series);
      const columns = ['label', ...seriesKeys];
      const rows: Record<string, unknown>[] = [];

      for (let i = 0; i < labels.length; i++) {
        const row: Record<string, unknown> = { label: labels[i] };
        for (const key of seriesKeys) {
          row[key] = series[key]?.[i] ?? null;
        }
        rows.push(row);
      }

      return { columns, rows, rowCount: rows.length };
    },
  },
  {
    sourceFormat: 'dataset',
    targetFormat: 'report',
    transform: (data: Record<string, unknown>): Record<string, unknown> => {
      const rows = Array.isArray(data['rows']) ? data['rows'] as Record<string, unknown>[] : [];
      const columns = Array.isArray(data['columns']) ? data['columns'] as string[] : [];

      return {
        title: data['title'] ?? 'Generated Report',
        sections: [
          {
            type: 'table',
            headers: columns,
            rows: rows,
            summary: `Contains ${rows.length} rows across ${columns.length} columns`,
          },
        ],
        generatedAt: new Date().toISOString(),
        dataSource: data['source'] ?? 'cross-engine-bridge',
      };
    },
  },
  {
    sourceFormat: 'dataset',
    targetFormat: 'presentation',
    transform: (data: Record<string, unknown>): Record<string, unknown> => {
      const rows = Array.isArray(data['rows']) ? data['rows'] as Record<string, unknown>[] : [];
      const columns = Array.isArray(data['columns']) ? data['columns'] as string[] : [];
      const title = (data['title'] as string) ?? 'Data Presentation';

      return {
        title,
        slides: [
          {
            type: 'title',
            content: { heading: title, subtitle: `${rows.length} records, ${columns.length} fields` },
          },
          {
            type: 'table',
            content: { headers: columns, rows: rows.slice(0, 20) },
          },
          {
            type: 'summary',
            content: { text: `Total records: ${rows.length}` },
          },
        ],
      };
    },
  },
  {
    sourceFormat: 'report',
    targetFormat: 'presentation',
    transform: (data: Record<string, unknown>): Record<string, unknown> => {
      const sections = Array.isArray(data['sections']) ? data['sections'] as Record<string, unknown>[] : [];
      const slides: Record<string, unknown>[] = [
        {
          type: 'title',
          content: { heading: data['title'] ?? 'Report', subtitle: data['generatedAt'] ?? '' },
        },
      ];

      for (const section of sections) {
        slides.push({
          type: section['type'] ?? 'content',
          content: section,
        });
      }

      return { title: data['title'] ?? 'Report Presentation', slides };
    },
  },
  {
    sourceFormat: 'dataset',
    targetFormat: 'analysis',
    transform: (data: Record<string, unknown>): Record<string, unknown> => {
      const rows = Array.isArray(data['rows']) ? data['rows'] as Record<string, unknown>[] : [];
      const columns = Array.isArray(data['columns']) ? data['columns'] as string[] : [];

      const numericColumns: string[] = [];
      const stats: Record<string, Record<string, unknown>> = {};

      if (rows.length > 0) {
        for (const col of columns) {
          const values = rows.map((r) => (r as Record<string, unknown>)[col]).filter((v) => typeof v === 'number') as number[];
          if (values.length > 0) {
            numericColumns.push(col);
            const sorted = [...values].sort((a, b) => a - b);
            const sum = sorted.reduce((a, b) => a + b, 0);
            stats[col] = {
              count: values.length,
              min: sorted[0],
              max: sorted[sorted.length - 1],
              mean: sum / values.length,
              median: sorted.length % 2 === 0
                ? ((sorted[sorted.length / 2 - 1] ?? 0) + (sorted[sorted.length / 2] ?? 0)) / 2
                : sorted[Math.floor(sorted.length / 2)],
            };
          }
        }
      }

      return {
        rowCount: rows.length,
        columnCount: columns.length,
        columns,
        numericColumns,
        statistics: stats,
        analyzedAt: new Date().toISOString(),
      };
    },
  },
  {
    sourceFormat: 'analysis',
    targetFormat: 'report',
    transform: (data: Record<string, unknown>): Record<string, unknown> => {
      const statistics = (data['statistics'] ?? {}) as Record<string, Record<string, unknown>>;
      const sections: Record<string, unknown>[] = [];

      sections.push({
        type: 'overview',
        content: {
          rowCount: data['rowCount'],
          columnCount: data['columnCount'],
          analyzedAt: data['analyzedAt'],
        },
      });

      for (const [column, stats] of Object.entries(statistics)) {
        sections.push({
          type: 'statistics',
          column,
          content: stats,
        });
      }

      return {
        title: 'Analysis Report',
        sections,
        generatedAt: new Date().toISOString(),
      };
    },
  },
];

// ---------------------------------------------------------------------------
// CrossEngineBridge
// ---------------------------------------------------------------------------

export class CrossEngineBridge {
  private subscriptions: Map<string, BridgeSubscription> = new Map();
  private handlers: Map<string, RequestHandler> = new Map();
  private lineageStore: DataLineageRecord[] = [];
  private formatTransformers: FormatTransformer[] = [...BUILT_IN_TRANSFORMERS];
  private startTime: number = Date.now();

  // Stats counters
  private totalPublished = 0;
  private totalDelivered = 0;
  private totalRequests = 0;
  private totalErrors = 0;
  private publishedByEngine: Record<string, number> = {};
  private deliveredByEngine: Record<string, number> = {};
  private requestsByEngine: Record<string, number> = {};
  private errorsByEngine: Record<string, number> = {};
  private publishedByDataType: Record<string, number> = {};

  // ---------------------------------------------------------------------------
  // Publish / Subscribe (async event flow)
  // ---------------------------------------------------------------------------

  /**
   * Publish data onto the bridge. All matching subscribers are notified.
   * Returns the generated payload ID.
   */
  async publish(input: Omit<BridgePayload, 'id'>): Promise<string> {
    const payloadId = randomUUID();
    const payload: BridgePayload = { ...input, id: payloadId };

    this.totalPublished++;
    this.publishedByEngine[payload.sourceEngine] =
      (this.publishedByEngine[payload.sourceEngine] ?? 0) + 1;
    this.publishedByDataType[payload.dataType] =
      (this.publishedByDataType[payload.dataType] ?? 0) + 1;

    const matchingSubscriptions = this.findMatchingSubscriptions(payload);
    const deliveryPromises: Promise<void>[] = [];

    for (const sub of matchingSubscriptions) {
      deliveryPromises.push(
        this.deliverToSubscriber(sub, payload)
      );
    }

    const results = await Promise.allSettled(deliveryPromises);
    for (const result of results) {
      if (result.status === 'rejected') {
        this.totalErrors++;
        this.errorsByEngine[payload.sourceEngine] =
          (this.errorsByEngine[payload.sourceEngine] ?? 0) + 1;
      }
    }

    return payloadId;
  }

  /**
   * Subscribe to payloads that match the given engine target and data types.
   * Returns the subscription ID.
   */
  subscribe(input: Omit<BridgeSubscription, 'id'>): string {
    const subscriptionId = randomUUID();
    const subscription: BridgeSubscription = { ...input, id: subscriptionId };
    this.subscriptions.set(subscriptionId, subscription);
    return subscriptionId;
  }

  /**
   * Remove a subscription by ID.
   */
  unsubscribe(subscriptionId: string): void {
    if (!this.subscriptions.has(subscriptionId)) {
      throw new Error(`Subscription not found: ${subscriptionId}`);
    }
    this.subscriptions.delete(subscriptionId);
  }

  // ---------------------------------------------------------------------------
  // Request / Response (sync flow)
  // ---------------------------------------------------------------------------

  /**
   * Send a synchronous request from one engine to another.
   * A registered handler on the target engine processes the request and returns data.
   */
  async request(
    source: EngineType,
    target: EngineType,
    dataType: string,
    data: Record<string, unknown>,
    metadata: { tenantId: string; userId: string; correlationId?: string }
  ): Promise<BridgePayload> {
    this.totalRequests++;
    this.requestsByEngine[source] = (this.requestsByEngine[source] ?? 0) + 1;

    const handlerKey = this.buildHandlerKey(target, dataType);
    const handler = this.handlers.get(handlerKey);

    if (!handler) {
      this.totalErrors++;
      this.errorsByEngine[source] = (this.errorsByEngine[source] ?? 0) + 1;
      throw new Error(
        `No handler registered for engine="${target}" dataType="${dataType}"`
      );
    }

    const requestPayload: BridgePayload = {
      id: randomUUID(),
      sourceEngine: source,
      targetEngine: target,
      dataType,
      data,
      metadata: {
        tenantId: metadata.tenantId,
        userId: metadata.userId,
        timestamp: new Date().toISOString(),
        correlationId: metadata.correlationId ?? randomUUID(),
      },
    };

    // Record lineage for the request
    this.recordLineage(requestPayload, target, []);

    let responseData: Record<string, unknown>;
    try {
      responseData = await handler(requestPayload);
    } catch (err) {
      this.totalErrors++;
      this.errorsByEngine[target] = (this.errorsByEngine[target] ?? 0) + 1;
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Handler error on engine="${target}" dataType="${dataType}": ${message}`);
    }

    const responsePayload: BridgePayload = {
      id: randomUUID(),
      sourceEngine: target,
      targetEngine: source,
      dataType: `${dataType}:response`,
      data: responseData,
      metadata: {
        tenantId: metadata.tenantId,
        userId: metadata.userId,
        timestamp: new Date().toISOString(),
        correlationId: requestPayload.metadata.correlationId,
      },
    };

    // Record lineage for the response
    this.recordLineage(responsePayload, source, []);

    return responsePayload;
  }

  /**
   * Register a handler that processes synchronous requests for a specific engine + dataType.
   */
  registerHandler(
    engine: EngineType,
    dataType: string,
    handler: (payload: BridgePayload) => Promise<Record<string, unknown>>
  ): void {
    const key = this.buildHandlerKey(engine, dataType);
    this.handlers.set(key, handler);
  }

  // ---------------------------------------------------------------------------
  // Lineage
  // ---------------------------------------------------------------------------

  /**
   * Get all lineage records for a given payload ID.
   */
  getLineage(payloadId: string): DataLineageRecord[] {
    return this.lineageStore.filter((r) => r.payloadId === payloadId);
  }

  /**
   * Get lineage records for a tenant, ordered newest first, with optional limit.
   */
  getLineageByTenant(tenantId: string, limit?: number): DataLineageRecord[] {
    const filtered = this.lineageStore
      .filter((r) => r.tenantId === tenantId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (limit !== undefined && limit > 0) {
      return filtered.slice(0, limit);
    }
    return filtered;
  }

  // ---------------------------------------------------------------------------
  // Data Transformation
  // ---------------------------------------------------------------------------

  /**
   * Transform payload data from its current dataType format to a target format.
   * Uses registered format transformers. Throws if no transformer path is found.
   */
  transformData(payload: BridgePayload, targetFormat: string): BridgePayload {
    if (payload.dataType === targetFormat) {
      return { ...payload };
    }

    const transformer = this.findTransformer(payload.dataType, targetFormat);
    if (!transformer) {
      // Try two-hop: sourceFormat -> intermediate -> targetFormat
      const twoHopResult = this.findTwoHopTransform(payload, targetFormat);
      if (twoHopResult) {
        return twoHopResult;
      }

      throw new Error(
        `No transformer found from "${payload.dataType}" to "${targetFormat}"`
      );
    }

    const transformedData = transformer.transform({ ...payload.data });
    const transformedPayload: BridgePayload = {
      ...payload,
      id: randomUUID(),
      dataType: targetFormat,
      data: transformedData,
      metadata: {
        ...payload.metadata,
        timestamp: new Date().toISOString(),
      },
    };

    // Record lineage with transformation info
    this.recordLineage(
      transformedPayload,
      typeof payload.targetEngine === 'string' && payload.targetEngine !== '*'
        ? payload.targetEngine as EngineType
        : payload.sourceEngine,
      [`${payload.dataType}->${targetFormat}`]
    );

    return transformedPayload;
  }

  /**
   * Register a custom format transformer.
   */
  registerTransformer(transformer: FormatTransformer): void {
    this.formatTransformers.push(transformer);
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  /**
   * Get current bridge statistics.
   */
  getStats(): BridgeStats {
    return {
      totalPublished: this.totalPublished,
      totalDelivered: this.totalDelivered,
      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      activeSubscriptions: this.subscriptions.size,
      registeredHandlers: this.handlers.size,
      lineageRecords: this.lineageStore.length,
      publishedByEngine: { ...this.publishedByEngine },
      deliveredByEngine: { ...this.deliveredByEngine },
      requestsByEngine: { ...this.requestsByEngine },
      errorsByEngine: { ...this.errorsByEngine },
      publishedByDataType: { ...this.publishedByDataType },
      uptime: Date.now() - this.startTime,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private findMatchingSubscriptions(payload: BridgePayload): BridgeSubscription[] {
    const matches: BridgeSubscription[] = [];
    for (const sub of this.subscriptions.values()) {
      const engineMatch =
        payload.targetEngine === '*' || payload.targetEngine === sub.engine;
      const dataTypeMatch =
        sub.dataTypes.length === 0 ||
        sub.dataTypes.includes('*') ||
        sub.dataTypes.includes(payload.dataType);

      if (engineMatch && dataTypeMatch) {
        matches.push(sub);
      }
    }
    return matches;
  }

  private async deliverToSubscriber(
    sub: BridgeSubscription,
    payload: BridgePayload
  ): Promise<void> {
    // Check TTL before delivery
    if (payload.metadata.ttlMs !== undefined) {
      const payloadTime = new Date(payload.metadata.timestamp).getTime();
      const now = Date.now();
      if (now - payloadTime > payload.metadata.ttlMs) {
        return; // TTL expired, skip delivery
      }
    }

    await sub.callback(payload);
    this.totalDelivered++;
    this.deliveredByEngine[sub.engine] =
      (this.deliveredByEngine[sub.engine] ?? 0) + 1;

    // Record lineage for the delivery
    this.recordLineage(payload, sub.engine, []);
  }

  private recordLineage(
    payload: BridgePayload,
    targetEngine: EngineType,
    transformations: string[]
  ): void {
    const record: DataLineageRecord = {
      id: randomUUID(),
      payloadId: payload.id,
      sourceEngine: payload.sourceEngine,
      targetEngine,
      dataType: payload.dataType,
      timestamp: new Date().toISOString(),
      tenantId: payload.metadata.tenantId,
      userId: payload.metadata.userId,
      transformations,
    };
    this.lineageStore.push(record);
  }

  private buildHandlerKey(engine: EngineType, dataType: string): string {
    return `${engine}::${dataType}`;
  }

  private findTransformer(
    sourceFormat: string,
    targetFormat: string
  ): FormatTransformer | undefined {
    return this.formatTransformers.find(
      (t) => t.sourceFormat === sourceFormat && t.targetFormat === targetFormat
    );
  }

  private findTwoHopTransform(
    payload: BridgePayload,
    targetFormat: string
  ): BridgePayload | null {
    // Find all transformers that start from the payload's dataType
    const firstHops = this.formatTransformers.filter(
      (t) => t.sourceFormat === payload.dataType
    );

    for (const firstHop of firstHops) {
      const secondHop = this.findTransformer(firstHop.targetFormat, targetFormat);
      if (secondHop) {
        const intermediateData = firstHop.transform({ ...payload.data });
        const finalData = secondHop.transform(intermediateData);
        const transformedPayload: BridgePayload = {
          ...payload,
          id: randomUUID(),
          dataType: targetFormat,
          data: finalData,
          metadata: {
            ...payload.metadata,
            timestamp: new Date().toISOString(),
          },
        };

        this.recordLineage(
          transformedPayload,
          typeof payload.targetEngine === 'string' && payload.targetEngine !== '*'
            ? payload.targetEngine as EngineType
            : payload.sourceEngine,
          [
            `${payload.dataType}->${firstHop.targetFormat}`,
            `${firstHop.targetFormat}->${targetFormat}`,
          ]
        );

        return transformedPayload;
      }
    }

    return null;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let bridgeInstance: CrossEngineBridge | null = null;

/**
 * Get the shared CrossEngineBridge singleton.
 */
export function getCrossEngineBridge(): CrossEngineBridge {
  if (!bridgeInstance) {
    bridgeInstance = new CrossEngineBridge();
  }
  return bridgeInstance;
}

/**
 * Reset the bridge singleton (useful for testing).
 */
export function resetCrossEngineBridge(): void {
  bridgeInstance = null;
}
