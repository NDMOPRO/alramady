/**
 * Bridge Integration Helper — Rasid Platform
 * مساعد تكامل جسر البيانات
 *
 * Convenience class that each engine service can instantiate to interact
 * with the CrossEngineBridge without dealing with low-level details.
 */

import { randomUUID } from 'crypto';
import {
  CrossEngineBridge,
  EngineType,
  BridgePayload,
  BridgeSubscription,
  DataLineageRecord,
  BridgeStats,
  getCrossEngineBridge,
} from './cross-engine-bridge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PublishOptions {
  targetEngine?: EngineType | '*';
  ttlMs?: number;
  correlationId?: string;
}

export interface RequestOptions {
  correlationId?: string;
  timeoutMs?: number;
}

export interface SubscriptionOptions {
  dataTypes?: string[];
}

// ---------------------------------------------------------------------------
// BridgeIntegration
// ---------------------------------------------------------------------------

export class BridgeIntegration {
  private readonly engine: EngineType;
  private readonly bridge: CrossEngineBridge;
  private readonly activeSubscriptions: Set<string> = new Set();

  constructor(engine: EngineType, bridge?: CrossEngineBridge) {
    this.engine = engine;
    this.bridge = bridge ?? getCrossEngineBridge();
  }

  // ---------------------------------------------------------------------------
  // Metadata helper
  // ---------------------------------------------------------------------------

  private buildMetadata(
    tenantId: string,
    userId: string,
    options?: { correlationId?: string; ttlMs?: number }
  ): BridgePayload['metadata'] {
    return {
      tenantId,
      userId,
      timestamp: new Date().toISOString(),
      correlationId: options?.correlationId ?? randomUUID(),
      ttlMs: options?.ttlMs,
    };
  }

  // ---------------------------------------------------------------------------
  // Publish helpers
  // ---------------------------------------------------------------------------

  /**
   * Publish a dataset to the bridge.
   */
  async publishDataset(
    data: Record<string, unknown>,
    tenantId: string,
    userId: string,
    options?: PublishOptions
  ): Promise<string> {
    return this.bridge.publish({
      sourceEngine: this.engine,
      targetEngine: options?.targetEngine ?? '*',
      dataType: 'dataset',
      data,
      metadata: this.buildMetadata(tenantId, userId, options),
    });
  }

  /**
   * Publish chart data to the bridge.
   */
  async publishChart(
    data: Record<string, unknown>,
    tenantId: string,
    userId: string,
    options?: PublishOptions
  ): Promise<string> {
    return this.bridge.publish({
      sourceEngine: this.engine,
      targetEngine: options?.targetEngine ?? '*',
      dataType: 'chart',
      data,
      metadata: this.buildMetadata(tenantId, userId, options),
    });
  }

  /**
   * Publish a report to the bridge.
   */
  async publishReport(
    data: Record<string, unknown>,
    tenantId: string,
    userId: string,
    options?: PublishOptions
  ): Promise<string> {
    return this.bridge.publish({
      sourceEngine: this.engine,
      targetEngine: options?.targetEngine ?? '*',
      dataType: 'report',
      data,
      metadata: this.buildMetadata(tenantId, userId, options),
    });
  }

  /**
   * Publish an analysis result to the bridge.
   */
  async publishAnalysis(
    data: Record<string, unknown>,
    tenantId: string,
    userId: string,
    options?: PublishOptions
  ): Promise<string> {
    return this.bridge.publish({
      sourceEngine: this.engine,
      targetEngine: options?.targetEngine ?? '*',
      dataType: 'analysis',
      data,
      metadata: this.buildMetadata(tenantId, userId, options),
    });
  }

  /**
   * Publish a template to the bridge.
   */
  async publishTemplate(
    data: Record<string, unknown>,
    tenantId: string,
    userId: string,
    options?: PublishOptions
  ): Promise<string> {
    return this.bridge.publish({
      sourceEngine: this.engine,
      targetEngine: options?.targetEngine ?? '*',
      dataType: 'template',
      data,
      metadata: this.buildMetadata(tenantId, userId, options),
    });
  }

  /**
   * Publish a presentation to the bridge.
   */
  async publishPresentation(
    data: Record<string, unknown>,
    tenantId: string,
    userId: string,
    options?: PublishOptions
  ): Promise<string> {
    return this.bridge.publish({
      sourceEngine: this.engine,
      targetEngine: options?.targetEngine ?? '*',
      dataType: 'presentation',
      data,
      metadata: this.buildMetadata(tenantId, userId, options),
    });
  }

  /**
   * Publish arbitrary typed data to the bridge.
   */
  async publishCustom(
    dataType: string,
    data: Record<string, unknown>,
    tenantId: string,
    userId: string,
    options?: PublishOptions
  ): Promise<string> {
    return this.bridge.publish({
      sourceEngine: this.engine,
      targetEngine: options?.targetEngine ?? '*',
      dataType,
      data,
      metadata: this.buildMetadata(tenantId, userId, options),
    });
  }

  // ---------------------------------------------------------------------------
  // Request helpers (synchronous request/response)
  // ---------------------------------------------------------------------------

  /**
   * Request a dataset from a specific engine.
   */
  async requestDataset(
    targetEngine: EngineType,
    data: Record<string, unknown>,
    tenantId: string,
    userId: string,
    options?: RequestOptions
  ): Promise<BridgePayload> {
    return this.executeRequest(targetEngine, 'dataset', data, tenantId, userId, options);
  }

  /**
   * Request chart data from a specific engine.
   */
  async requestChart(
    targetEngine: EngineType,
    data: Record<string, unknown>,
    tenantId: string,
    userId: string,
    options?: RequestOptions
  ): Promise<BridgePayload> {
    return this.executeRequest(targetEngine, 'chart', data, tenantId, userId, options);
  }

  /**
   * Request a report from a specific engine.
   */
  async requestReport(
    targetEngine: EngineType,
    data: Record<string, unknown>,
    tenantId: string,
    userId: string,
    options?: RequestOptions
  ): Promise<BridgePayload> {
    return this.executeRequest(targetEngine, 'report', data, tenantId, userId, options);
  }

  /**
   * Request an analysis from a specific engine.
   */
  async requestAnalysis(
    targetEngine: EngineType,
    data: Record<string, unknown>,
    tenantId: string,
    userId: string,
    options?: RequestOptions
  ): Promise<BridgePayload> {
    return this.executeRequest(targetEngine, 'analysis', data, tenantId, userId, options);
  }

  /**
   * Request a template from a specific engine.
   */
  async requestTemplate(
    targetEngine: EngineType,
    data: Record<string, unknown>,
    tenantId: string,
    userId: string,
    options?: RequestOptions
  ): Promise<BridgePayload> {
    return this.executeRequest(targetEngine, 'template', data, tenantId, userId, options);
  }

  /**
   * Request arbitrary typed data from a specific engine.
   */
  async requestCustom(
    targetEngine: EngineType,
    dataType: string,
    data: Record<string, unknown>,
    tenantId: string,
    userId: string,
    options?: RequestOptions
  ): Promise<BridgePayload> {
    return this.executeRequest(targetEngine, dataType, data, tenantId, userId, options);
  }

  // ---------------------------------------------------------------------------
  // Subscribe helpers
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to payloads destined for this engine.
   */
  onData(
    callback: (payload: BridgePayload) => Promise<void>,
    options?: SubscriptionOptions
  ): string {
    const subId = this.bridge.subscribe({
      engine: this.engine,
      dataTypes: options?.dataTypes ?? [],
      callback,
    });
    this.activeSubscriptions.add(subId);
    return subId;
  }

  /**
   * Subscribe specifically to dataset payloads.
   */
  onDataset(callback: (payload: BridgePayload) => Promise<void>): string {
    return this.onData(callback, { dataTypes: ['dataset'] });
  }

  /**
   * Subscribe specifically to chart payloads.
   */
  onChart(callback: (payload: BridgePayload) => Promise<void>): string {
    return this.onData(callback, { dataTypes: ['chart'] });
  }

  /**
   * Subscribe specifically to report payloads.
   */
  onReport(callback: (payload: BridgePayload) => Promise<void>): string {
    return this.onData(callback, { dataTypes: ['report'] });
  }

  /**
   * Subscribe specifically to analysis payloads.
   */
  onAnalysis(callback: (payload: BridgePayload) => Promise<void>): string {
    return this.onData(callback, { dataTypes: ['analysis'] });
  }

  /**
   * Register a handler that responds to synchronous requests for a given dataType.
   */
  handleRequests(
    dataType: string,
    handler: (payload: BridgePayload) => Promise<Record<string, unknown>>
  ): void {
    this.bridge.registerHandler(this.engine, dataType, handler);
  }

  /**
   * Unsubscribe a previously registered subscription.
   */
  removeSubscription(subscriptionId: string): void {
    this.bridge.unsubscribe(subscriptionId);
    this.activeSubscriptions.delete(subscriptionId);
  }

  /**
   * Remove all subscriptions registered through this integration instance.
   */
  removeAllSubscriptions(): void {
    for (const subId of this.activeSubscriptions) {
      try {
        this.bridge.unsubscribe(subId);
      } catch {
        // Subscription may have already been removed
      }
    }
    this.activeSubscriptions.clear();
  }

  // ---------------------------------------------------------------------------
  // Lineage & Stats
  // ---------------------------------------------------------------------------

  /**
   * Get lineage records for a specific payload.
   */
  getLineage(payloadId: string): DataLineageRecord[] {
    return this.bridge.getLineage(payloadId);
  }

  /**
   * Get lineage records for a tenant.
   */
  getLineageByTenant(tenantId: string, limit?: number): DataLineageRecord[] {
    return this.bridge.getLineageByTenant(tenantId, limit);
  }

  /**
   * Get bridge statistics.
   */
  getStats(): BridgeStats {
    return this.bridge.getStats();
  }

  /**
   * Transform a payload's data to a different format.
   */
  transformData(payload: BridgePayload, targetFormat: string): BridgePayload {
    return this.bridge.transformData(payload, targetFormat);
  }

  /**
   * Get the engine type this integration is bound to.
   */
  getEngineType(): EngineType {
    return this.engine;
  }

  /**
   * Get count of active subscriptions managed by this integration.
   */
  getActiveSubscriptionCount(): number {
    return this.activeSubscriptions.size;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async executeRequest(
    targetEngine: EngineType,
    dataType: string,
    data: Record<string, unknown>,
    tenantId: string,
    userId: string,
    options?: RequestOptions
  ): Promise<BridgePayload> {
    if (options?.timeoutMs !== undefined && options.timeoutMs > 0) {
      return Promise.race([
        this.bridge.request(this.engine, targetEngine, dataType, data, {
          tenantId,
          userId,
          correlationId: options.correlationId,
        }),
        new Promise<never>((_resolve, reject) => {
          setTimeout(
            () => reject(new Error(`Request timed out after ${options.timeoutMs}ms`)),
            options.timeoutMs
          );
        }),
      ]);
    }

    return this.bridge.request(this.engine, targetEngine, dataType, data, {
      tenantId,
      userId,
      correlationId: options?.correlationId,
    });
  }
}
