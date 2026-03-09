/**
 * Cross-Engine Data Bridge — Rasid Platform
 * جسر البيانات بين المحركات
 *
 * Allows all 13 engines to exchange data seamlessly via publish/subscribe,
 * synchronous request/response, data transformation, and full lineage tracking.
 */
export declare enum EngineType {
    DATA = "data",
    EXCEL = "excel",
    DASHBOARD = "dashboard",
    REPORTING = "reporting",
    PRESENTATION = "presentation",
    INFOGRAPHIC = "infographic",
    REPLICATION = "replication",
    LOCALIZATION = "localization",
    AI = "ai",
    GOVERNANCE = "governance",
    LIBRARY = "library",
    TEMPLATE = "template",
    CONVERSION = "conversion"
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
interface FormatTransformer {
    sourceFormat: string;
    targetFormat: string;
    transform: (data: Record<string, unknown>) => Record<string, unknown>;
}
export declare class CrossEngineBridge {
    private subscriptions;
    private handlers;
    private lineageStore;
    private formatTransformers;
    private startTime;
    private totalPublished;
    private totalDelivered;
    private totalRequests;
    private totalErrors;
    private publishedByEngine;
    private deliveredByEngine;
    private requestsByEngine;
    private errorsByEngine;
    private publishedByDataType;
    /**
     * Publish data onto the bridge. All matching subscribers are notified.
     * Returns the generated payload ID.
     */
    publish(input: Omit<BridgePayload, 'id'>): Promise<string>;
    /**
     * Subscribe to payloads that match the given engine target and data types.
     * Returns the subscription ID.
     */
    subscribe(input: Omit<BridgeSubscription, 'id'>): string;
    /**
     * Remove a subscription by ID.
     */
    unsubscribe(subscriptionId: string): void;
    /**
     * Send a synchronous request from one engine to another.
     * A registered handler on the target engine processes the request and returns data.
     */
    request(source: EngineType, target: EngineType, dataType: string, data: Record<string, unknown>, metadata: {
        tenantId: string;
        userId: string;
        correlationId?: string;
    }): Promise<BridgePayload>;
    /**
     * Register a handler that processes synchronous requests for a specific engine + dataType.
     */
    registerHandler(engine: EngineType, dataType: string, handler: (payload: BridgePayload) => Promise<Record<string, unknown>>): void;
    /**
     * Get all lineage records for a given payload ID.
     */
    getLineage(payloadId: string): DataLineageRecord[];
    /**
     * Get lineage records for a tenant, ordered newest first, with optional limit.
     */
    getLineageByTenant(tenantId: string, limit?: number): DataLineageRecord[];
    /**
     * Transform payload data from its current dataType format to a target format.
     * Uses registered format transformers. Throws if no transformer path is found.
     */
    transformData(payload: BridgePayload, targetFormat: string): BridgePayload;
    /**
     * Register a custom format transformer.
     */
    registerTransformer(transformer: FormatTransformer): void;
    /**
     * Get current bridge statistics.
     */
    getStats(): BridgeStats;
    private findMatchingSubscriptions;
    private deliverToSubscriber;
    private recordLineage;
    private buildHandlerKey;
    private findTransformer;
    private findTwoHopTransform;
}
/**
 * Get the shared CrossEngineBridge singleton.
 */
export declare function getCrossEngineBridge(): CrossEngineBridge;
/**
 * Reset the bridge singleton (useful for testing).
 */
export declare function resetCrossEngineBridge(): void;
export {};
