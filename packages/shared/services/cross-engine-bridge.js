"use strict";
/**
 * Cross-Engine Data Bridge — Rasid Platform
 * جسر البيانات بين المحركات
 *
 * Allows all 13 engines to exchange data seamlessly via publish/subscribe,
 * synchronous request/response, data transformation, and full lineage tracking.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrossEngineBridge = exports.EngineType = void 0;
exports.getCrossEngineBridge = getCrossEngineBridge;
exports.resetCrossEngineBridge = resetCrossEngineBridge;
const crypto_1 = require("crypto");
// ---------------------------------------------------------------------------
// Enums & Interfaces
// ---------------------------------------------------------------------------
var EngineType;
(function (EngineType) {
    EngineType["DATA"] = "data";
    EngineType["EXCEL"] = "excel";
    EngineType["DASHBOARD"] = "dashboard";
    EngineType["REPORTING"] = "reporting";
    EngineType["PRESENTATION"] = "presentation";
    EngineType["INFOGRAPHIC"] = "infographic";
    EngineType["REPLICATION"] = "replication";
    EngineType["LOCALIZATION"] = "localization";
    EngineType["AI"] = "ai";
    EngineType["GOVERNANCE"] = "governance";
    EngineType["LIBRARY"] = "library";
    EngineType["TEMPLATE"] = "template";
    EngineType["CONVERSION"] = "conversion";
})(EngineType || (exports.EngineType = EngineType = {}));
const BUILT_IN_TRANSFORMERS = [
    {
        sourceFormat: 'dataset',
        targetFormat: 'chart',
        transform: (data) => {
            const rows = Array.isArray(data['rows']) ? data['rows'] : [];
            const columns = Array.isArray(data['columns']) ? data['columns'] : [];
            const labels = [];
            const series = {};
            for (const col of columns) {
                series[col] = [];
            }
            for (const row of rows) {
                const rowRecord = row;
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
        transform: (data) => {
            const labels = Array.isArray(data['labels']) ? data['labels'] : [];
            const series = (data['series'] ?? {});
            const seriesKeys = Object.keys(series);
            const columns = ['label', ...seriesKeys];
            const rows = [];
            for (let i = 0; i < labels.length; i++) {
                const row = { label: labels[i] };
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
        transform: (data) => {
            const rows = Array.isArray(data['rows']) ? data['rows'] : [];
            const columns = Array.isArray(data['columns']) ? data['columns'] : [];
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
        transform: (data) => {
            const rows = Array.isArray(data['rows']) ? data['rows'] : [];
            const columns = Array.isArray(data['columns']) ? data['columns'] : [];
            const title = data['title'] ?? 'Data Presentation';
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
        transform: (data) => {
            const sections = Array.isArray(data['sections']) ? data['sections'] : [];
            const slides = [
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
        transform: (data) => {
            const rows = Array.isArray(data['rows']) ? data['rows'] : [];
            const columns = Array.isArray(data['columns']) ? data['columns'] : [];
            const numericColumns = [];
            const stats = {};
            if (rows.length > 0) {
                for (const col of columns) {
                    const values = rows.map((r) => r[col]).filter((v) => typeof v === 'number');
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
        transform: (data) => {
            const statistics = (data['statistics'] ?? {});
            const sections = [];
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
class CrossEngineBridge {
    subscriptions = new Map();
    handlers = new Map();
    lineageStore = [];
    formatTransformers = [...BUILT_IN_TRANSFORMERS];
    startTime = Date.now();
    // Stats counters
    totalPublished = 0;
    totalDelivered = 0;
    totalRequests = 0;
    totalErrors = 0;
    publishedByEngine = {};
    deliveredByEngine = {};
    requestsByEngine = {};
    errorsByEngine = {};
    publishedByDataType = {};
    // ---------------------------------------------------------------------------
    // Publish / Subscribe (async event flow)
    // ---------------------------------------------------------------------------
    /**
     * Publish data onto the bridge. All matching subscribers are notified.
     * Returns the generated payload ID.
     */
    async publish(input) {
        const payloadId = (0, crypto_1.randomUUID)();
        const payload = { ...input, id: payloadId };
        this.totalPublished++;
        this.publishedByEngine[payload.sourceEngine] =
            (this.publishedByEngine[payload.sourceEngine] ?? 0) + 1;
        this.publishedByDataType[payload.dataType] =
            (this.publishedByDataType[payload.dataType] ?? 0) + 1;
        const matchingSubscriptions = this.findMatchingSubscriptions(payload);
        const deliveryPromises = [];
        for (const sub of matchingSubscriptions) {
            deliveryPromises.push(this.deliverToSubscriber(sub, payload));
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
    subscribe(input) {
        const subscriptionId = (0, crypto_1.randomUUID)();
        const subscription = { ...input, id: subscriptionId };
        this.subscriptions.set(subscriptionId, subscription);
        return subscriptionId;
    }
    /**
     * Remove a subscription by ID.
     */
    unsubscribe(subscriptionId) {
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
    async request(source, target, dataType, data, metadata) {
        this.totalRequests++;
        this.requestsByEngine[source] = (this.requestsByEngine[source] ?? 0) + 1;
        const handlerKey = this.buildHandlerKey(target, dataType);
        const handler = this.handlers.get(handlerKey);
        if (!handler) {
            this.totalErrors++;
            this.errorsByEngine[source] = (this.errorsByEngine[source] ?? 0) + 1;
            throw new Error(`No handler registered for engine="${target}" dataType="${dataType}"`);
        }
        const requestPayload = {
            id: (0, crypto_1.randomUUID)(),
            sourceEngine: source,
            targetEngine: target,
            dataType,
            data,
            metadata: {
                tenantId: metadata.tenantId,
                userId: metadata.userId,
                timestamp: new Date().toISOString(),
                correlationId: metadata.correlationId ?? (0, crypto_1.randomUUID)(),
            },
        };
        // Record lineage for the request
        this.recordLineage(requestPayload, target, []);
        let responseData;
        try {
            responseData = await handler(requestPayload);
        }
        catch (err) {
            this.totalErrors++;
            this.errorsByEngine[target] = (this.errorsByEngine[target] ?? 0) + 1;
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(`Handler error on engine="${target}" dataType="${dataType}": ${message}`);
        }
        const responsePayload = {
            id: (0, crypto_1.randomUUID)(),
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
    registerHandler(engine, dataType, handler) {
        const key = this.buildHandlerKey(engine, dataType);
        this.handlers.set(key, handler);
    }
    // ---------------------------------------------------------------------------
    // Lineage
    // ---------------------------------------------------------------------------
    /**
     * Get all lineage records for a given payload ID.
     */
    getLineage(payloadId) {
        return this.lineageStore.filter((r) => r.payloadId === payloadId);
    }
    /**
     * Get lineage records for a tenant, ordered newest first, with optional limit.
     */
    getLineageByTenant(tenantId, limit) {
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
    transformData(payload, targetFormat) {
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
            throw new Error(`No transformer found from "${payload.dataType}" to "${targetFormat}"`);
        }
        const transformedData = transformer.transform({ ...payload.data });
        const transformedPayload = {
            ...payload,
            id: (0, crypto_1.randomUUID)(),
            dataType: targetFormat,
            data: transformedData,
            metadata: {
                ...payload.metadata,
                timestamp: new Date().toISOString(),
            },
        };
        // Record lineage with transformation info
        this.recordLineage(transformedPayload, typeof payload.targetEngine === 'string' && payload.targetEngine !== '*'
            ? payload.targetEngine
            : payload.sourceEngine, [`${payload.dataType}->${targetFormat}`]);
        return transformedPayload;
    }
    /**
     * Register a custom format transformer.
     */
    registerTransformer(transformer) {
        this.formatTransformers.push(transformer);
    }
    // ---------------------------------------------------------------------------
    // Stats
    // ---------------------------------------------------------------------------
    /**
     * Get current bridge statistics.
     */
    getStats() {
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
    findMatchingSubscriptions(payload) {
        const matches = [];
        for (const sub of this.subscriptions.values()) {
            const engineMatch = payload.targetEngine === '*' || payload.targetEngine === sub.engine;
            const dataTypeMatch = sub.dataTypes.length === 0 ||
                sub.dataTypes.includes('*') ||
                sub.dataTypes.includes(payload.dataType);
            if (engineMatch && dataTypeMatch) {
                matches.push(sub);
            }
        }
        return matches;
    }
    async deliverToSubscriber(sub, payload) {
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
    recordLineage(payload, targetEngine, transformations) {
        const record = {
            id: (0, crypto_1.randomUUID)(),
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
    buildHandlerKey(engine, dataType) {
        return `${engine}::${dataType}`;
    }
    findTransformer(sourceFormat, targetFormat) {
        return this.formatTransformers.find((t) => t.sourceFormat === sourceFormat && t.targetFormat === targetFormat);
    }
    findTwoHopTransform(payload, targetFormat) {
        // Find all transformers that start from the payload's dataType
        const firstHops = this.formatTransformers.filter((t) => t.sourceFormat === payload.dataType);
        for (const firstHop of firstHops) {
            const secondHop = this.findTransformer(firstHop.targetFormat, targetFormat);
            if (secondHop) {
                const intermediateData = firstHop.transform({ ...payload.data });
                const finalData = secondHop.transform(intermediateData);
                const transformedPayload = {
                    ...payload,
                    id: (0, crypto_1.randomUUID)(),
                    dataType: targetFormat,
                    data: finalData,
                    metadata: {
                        ...payload.metadata,
                        timestamp: new Date().toISOString(),
                    },
                };
                this.recordLineage(transformedPayload, typeof payload.targetEngine === 'string' && payload.targetEngine !== '*'
                    ? payload.targetEngine
                    : payload.sourceEngine, [
                    `${payload.dataType}->${firstHop.targetFormat}`,
                    `${firstHop.targetFormat}->${targetFormat}`,
                ]);
                return transformedPayload;
            }
        }
        return null;
    }
}
exports.CrossEngineBridge = CrossEngineBridge;
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let bridgeInstance = null;
/**
 * Get the shared CrossEngineBridge singleton.
 */
function getCrossEngineBridge() {
    if (!bridgeInstance) {
        bridgeInstance = new CrossEngineBridge();
    }
    return bridgeInstance;
}
/**
 * Reset the bridge singleton (useful for testing).
 */
function resetCrossEngineBridge() {
    bridgeInstance = null;
}
