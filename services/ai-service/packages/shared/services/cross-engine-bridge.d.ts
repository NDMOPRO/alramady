export declare enum EngineType {
    DATA = "data",
    EXCEL = "excel",
    DASHBOARD = "dashboard",
    REPORT = "report",
    PRESENTATION = "presentation",
    AI = "ai",
    REPLICATION = "replication",
    CONVERSION = "conversion",
    LOCALIZATION = "localization",
    GOVERNANCE = "governance"
}
interface BridgePayload {
    sourceEngine: EngineType | string;
    targetEngine: EngineType | string;
    dataType: string;
    data: Record<string, unknown>;
    metadata: Record<string, unknown>;
}
interface BridgeResponse {
    id: string;
    data: Record<string, unknown>;
    sourceEngine: string;
}
interface LineageEntry {
    payloadId: string;
    sourceEngine: string;
    targetEngine: string;
    dataType: string;
    timestamp: string;
    tenantId?: string;
}
declare class CrossEngineBridge {
    private lineage;
    private stats;
    publish(payload: BridgePayload): Promise<string>;
    request(sourceEngine: EngineType, targetEngine: EngineType, dataType: string, data: Record<string, unknown>, metadata: Record<string, unknown>): Promise<BridgeResponse>;
    getLineage(payloadId: string): LineageEntry[];
    getLineageByTenant(tenantId: string, limit: number): LineageEntry[];
    getStats(): {
        lineageSize: number;
        published: number;
        requested: number;
        errors: number;
    };
}
export declare function getCrossEngineBridge(): CrossEngineBridge;
export {};
//# sourceMappingURL=cross-engine-bridge.d.ts.map