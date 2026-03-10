export enum EngineType {
  DATA = 'data',
  EXCEL = 'excel',
  DASHBOARD = 'dashboard',
  REPORT = 'report',
  PRESENTATION = 'presentation',
  AI = 'ai',
  REPLICATION = 'replication',
  CONVERSION = 'conversion',
  LOCALIZATION = 'localization',
  GOVERNANCE = 'governance',
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

class CrossEngineBridge {
  private lineage: LineageEntry[] = [];
  private stats = { published: 0, requested: 0, errors: 0 };

  async publish(payload: BridgePayload): Promise<string> {
    const payloadId = crypto.randomUUID();
    this.lineage.push({
      payloadId,
      sourceEngine: String(payload.sourceEngine),
      targetEngine: String(payload.targetEngine),
      dataType: payload.dataType,
      timestamp: new Date().toISOString(),
      tenantId: payload.metadata?.tenantId as string,
    });
    this.stats.published++;
    return payloadId;
  }

  async request(
    sourceEngine: EngineType,
    targetEngine: EngineType,
    dataType: string,
    data: Record<string, unknown>,
    metadata: Record<string, unknown>,
  ): Promise<BridgeResponse> {
    this.stats.requested++;
    return {
      id: crypto.randomUUID(),
      data: { message: 'Bridge request processed', dataType, ...data },
      sourceEngine: String(sourceEngine),
    };
  }

  getLineage(payloadId: string): LineageEntry[] {
    return this.lineage.filter(e => e.payloadId === payloadId);
  }

  getLineageByTenant(tenantId: string, limit: number): LineageEntry[] {
    return this.lineage
      .filter(e => e.tenantId === tenantId)
      .slice(-limit);
  }

  getStats() {
    return { ...this.stats, lineageSize: this.lineage.length };
  }
}

let bridgeInstance: CrossEngineBridge | null = null;

export function getCrossEngineBridge(): CrossEngineBridge {
  if (!bridgeInstance) {
    bridgeInstance = new CrossEngineBridge();
  }
  return bridgeInstance;
}
