/**
 * SRC (Structural Replication Constitution) Enforcement
 * Rules SRC-001 through SRC-023: pixel fidelity, structural hash integrity,
 * deterministic rendering, and dual fidelity verification.
 */

import crypto from 'crypto';
import winston from 'winston';
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'src-enforcement' },
  transports: [new winston.transports.Console({ format: winston.format.combine(winston.format.colorize(), winston.format.simple()) })],
});
import { CompositeMode } from '../modes/composite-modes.js';

/** Result of a single SRC rule check */
export interface SRCRuleResult {
  ruleId: string;
  passed: boolean;
  actual: number | string;
  threshold: number | string;
  description: string;
}

/** Full SRC enforcement report */
export interface SRCEnforcementReport {
  passed: boolean;
  mode: CompositeMode;
  timestamp: number;
  rules: SRCRuleResult[];
  failedCount: number;
  passedCount: number;
  hash: string;
}

export interface SRCConfig {
  pixelThreshold: number;
  structuralThreshold: number;
  deterministicRendering: boolean;
  allowColorDeviation: number;
  allowPositionDeviation: number;
  allowSizeDeviation: number;
  maxMismatchRegions: number;
  requireBinaryLock: boolean;
  requireDualFidelity: boolean;
  maxRenderIterations: number;
  fontMatchThreshold: number;
  colorMatchThreshold: number;
}

const DEFAULT_SRC_CONFIG: SRCConfig = {
  pixelThreshold: 0.001,
  structuralThreshold: 0.999,
  deterministicRendering: true,
  allowColorDeviation: 2,
  allowPositionDeviation: 0,
  allowSizeDeviation: 0,
  maxMismatchRegions: 0,
  requireBinaryLock: true,
  requireDualFidelity: true,
  maxRenderIterations: 1,
  fontMatchThreshold: 1.0,
  colorMatchThreshold: 0.998,
};

const MODE_SRC_OVERRIDES: Partial<Record<CompositeMode, Partial<SRCConfig>>> = {
  [CompositeMode.PROFESSIONAL_CREATION]: {
    pixelThreshold: 0.005,
    structuralThreshold: 0.99,
    allowColorDeviation: 5,
    allowPositionDeviation: 1,
    allowSizeDeviation: 1,
    maxMismatchRegions: 3,
    fontMatchThreshold: 0.98,
    colorMatchThreshold: 0.99,
  },
  [CompositeMode.HYBRID]: {
    pixelThreshold: 0.01,
    structuralThreshold: 0.98,
    allowColorDeviation: 10,
    allowPositionDeviation: 2,
    allowSizeDeviation: 2,
    maxMismatchRegions: 10,
    requireBinaryLock: false,
    fontMatchThreshold: 0.95,
    colorMatchThreshold: 0.98,
  },
};

export class SRCEnforcement {
  /**
   * Enforce all SRC rules (SRC-001 to SRC-023) for a given configuration and mode.
   */
  enforceSRC(config: Partial<SRCConfig>, mode: CompositeMode): SRCEnforcementReport {
    const modeOverrides = MODE_SRC_OVERRIDES[mode] ?? {};
    const resolved: SRCConfig = { ...DEFAULT_SRC_CONFIG, ...modeOverrides, ...config };
    const rules: SRCRuleResult[] = [];

    // SRC-001: Pixel difference threshold
    rules.push(this.makeSRCRule('SRC-001', 'Pixel difference threshold',
      resolved.pixelThreshold, DEFAULT_SRC_CONFIG.pixelThreshold,
      resolved.pixelThreshold <= (modeOverrides.pixelThreshold ?? DEFAULT_SRC_CONFIG.pixelThreshold)));

    // SRC-002: Structural hash threshold
    rules.push(this.makeSRCRule('SRC-002', 'Structural hash similarity threshold',
      resolved.structuralThreshold, DEFAULT_SRC_CONFIG.structuralThreshold,
      resolved.structuralThreshold >= (modeOverrides.structuralThreshold ?? DEFAULT_SRC_CONFIG.structuralThreshold)));

    // SRC-003: Deterministic rendering required
    rules.push({ ruleId: 'SRC-003', passed: resolved.deterministicRendering || mode === CompositeMode.HYBRID,
      actual: String(resolved.deterministicRendering), threshold: 'true',
      description: 'Deterministic rendering must be enabled' });

    // SRC-004: Color deviation within bounds
    rules.push(this.makeSRCRule('SRC-004', 'Color deviation within bounds',
      resolved.allowColorDeviation, modeOverrides.allowColorDeviation ?? DEFAULT_SRC_CONFIG.allowColorDeviation,
      resolved.allowColorDeviation <= (modeOverrides.allowColorDeviation ?? DEFAULT_SRC_CONFIG.allowColorDeviation)));

    // SRC-005: Position deviation within bounds
    rules.push(this.makeSRCRule('SRC-005', 'Position deviation within bounds',
      resolved.allowPositionDeviation, modeOverrides.allowPositionDeviation ?? DEFAULT_SRC_CONFIG.allowPositionDeviation,
      resolved.allowPositionDeviation <= (modeOverrides.allowPositionDeviation ?? DEFAULT_SRC_CONFIG.allowPositionDeviation)));

    // SRC-006: Size deviation within bounds
    rules.push(this.makeSRCRule('SRC-006', 'Size deviation within bounds',
      resolved.allowSizeDeviation, modeOverrides.allowSizeDeviation ?? DEFAULT_SRC_CONFIG.allowSizeDeviation,
      resolved.allowSizeDeviation <= (modeOverrides.allowSizeDeviation ?? DEFAULT_SRC_CONFIG.allowSizeDeviation)));

    // SRC-007: Maximum mismatch regions
    rules.push(this.makeSRCRule('SRC-007', 'Maximum mismatch regions',
      resolved.maxMismatchRegions, modeOverrides.maxMismatchRegions ?? DEFAULT_SRC_CONFIG.maxMismatchRegions,
      resolved.maxMismatchRegions <= (modeOverrides.maxMismatchRegions ?? DEFAULT_SRC_CONFIG.maxMismatchRegions)));

    // SRC-008: Binary lock required
    rules.push({ ruleId: 'SRC-008', passed: resolved.requireBinaryLock || !DEFAULT_SRC_CONFIG.requireBinaryLock,
      actual: String(resolved.requireBinaryLock), threshold: String(modeOverrides.requireBinaryLock ?? DEFAULT_SRC_CONFIG.requireBinaryLock),
      description: 'Binary output lock must be applied' });

    // SRC-009: Dual fidelity verification required
    rules.push({ ruleId: 'SRC-009', passed: resolved.requireDualFidelity,
      actual: String(resolved.requireDualFidelity), threshold: 'true',
      description: 'Dual fidelity verification must pass' });

    // SRC-010: Render iterations limit
    rules.push(this.makeSRCRule('SRC-010', 'Maximum render iterations',
      resolved.maxRenderIterations, DEFAULT_SRC_CONFIG.maxRenderIterations,
      resolved.maxRenderIterations <= 3));

    // SRC-011: Font match threshold
    rules.push(this.makeSRCRule('SRC-011', 'Font match threshold',
      resolved.fontMatchThreshold, modeOverrides.fontMatchThreshold ?? DEFAULT_SRC_CONFIG.fontMatchThreshold,
      resolved.fontMatchThreshold >= (modeOverrides.fontMatchThreshold ?? DEFAULT_SRC_CONFIG.fontMatchThreshold)));

    // SRC-012: Color match threshold
    rules.push(this.makeSRCRule('SRC-012', 'Color match threshold',
      resolved.colorMatchThreshold, modeOverrides.colorMatchThreshold ?? DEFAULT_SRC_CONFIG.colorMatchThreshold,
      resolved.colorMatchThreshold >= (modeOverrides.colorMatchThreshold ?? DEFAULT_SRC_CONFIG.colorMatchThreshold)));

    // SRC-013 to SRC-023: Structural integrity rules — validated with actual data
    // These are validated below in enforceStructural() when structural data is provided.
    // When called without structural data (config-only mode), they are marked as pending.
    const structuralRuleDescs = [
      { id: 'SRC-013', desc: 'Z-index ordering preserved' },
      { id: 'SRC-014', desc: 'Element count matches source' },
      { id: 'SRC-015', desc: 'Spatial relations preserved' },
      { id: 'SRC-016', desc: 'Opacity values preserved' },
      { id: 'SRC-017', desc: 'Rotation values preserved' },
      { id: 'SRC-018', desc: 'Nested hierarchy preserved' },
      { id: 'SRC-019', desc: 'Constraint graph acyclic' },
      { id: 'SRC-020', desc: 'Layout graph connected' },
      { id: 'SRC-021', desc: 'Fingerprint chain unbroken' },
      { id: 'SRC-022', desc: 'No phantom elements introduced' },
      { id: 'SRC-023', desc: 'Output format matches specification' },
    ];

    for (const rule of structuralRuleDescs) {
      rules.push({
        ruleId: rule.id,
        passed: false, // default to false until validated with real data
        actual: 'pending_validation',
        threshold: 'true',
        description: rule.desc,
      });
    }

    const failedCount = rules.filter((r) => !r.passed).length;
    const passedCount = rules.filter((r) => r.passed).length;

    const reportHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(rules))
      .digest('hex');

    const report: SRCEnforcementReport = {
      passed: failedCount === 0,
      mode,
      timestamp: Date.now(),
      rules,
      failedCount,
      passedCount,
      hash: reportHash,
    };

    logger.info('SRC enforcement completed', {
      mode,
      passed: report.passed,
      failedCount,
      passedCount,
    });

    return report;
  }

  /** Check that pixel difference is within the threshold (default 0.1%) */
  checkPixelThreshold(diff: number, threshold: number = 0.001): SRCRuleResult {
    const passed = diff <= threshold;
    logger.debug('Pixel threshold check', { diff, threshold, passed });
    return {
      ruleId: 'SRC-001',
      passed,
      actual: diff,
      threshold,
      description: `Pixel difference ${diff.toFixed(6)} must be <= ${threshold}`,
    };
  }

  /** Check that structural hash similarity meets or exceeds 0.999 */
  checkStructuralHash(similarity: number, threshold: number = 0.999): SRCRuleResult {
    const passed = similarity >= threshold;
    logger.debug('Structural hash check', { similarity, threshold, passed });
    return {
      ruleId: 'SRC-002',
      passed,
      actual: similarity,
      threshold,
      description: `Structural similarity ${similarity.toFixed(6)} must be >= ${threshold}`,
    };
  }

  /** Validate that both pixel and structural fidelity pass simultaneously */
  validateDualFidelity(
    pixelDiff: number,
    structuralHash: number,
    pixelThreshold: number = 0.001,
    structuralThreshold: number = 0.999,
  ): { passed: boolean; pixel: SRCRuleResult; structural: SRCRuleResult } {
    const pixel = this.checkPixelThreshold(pixelDiff, pixelThreshold);
    const structural = this.checkStructuralHash(structuralHash, structuralThreshold);
    const passed = pixel.passed && structural.passed;

    logger.info('Dual fidelity validation', {
      passed,
      pixelDiff,
      structuralHash,
    });

    return { passed, pixel, structural };
  }

  /**
   * Validate structural integrity rules SRC-013 to SRC-023 with actual replication data.
   * This must be called after replication to enforce these rules with real artifacts.
   */
  enforceStructural(params: {
    sourceElements: Array<{ id: string; zIndex: number; opacity: number; rotation: number; children: unknown[] }>;
    replicatedElements: Array<{ id: string; zIndex: number; opacity: number; rotation: number; children: unknown[] }>;
    sourceRelations: Array<{ sourceId: string; targetId: string; relation: string }>;
    replicatedRelations: Array<{ sourceId: string; targetId: string; relation: string }>;
    constraintGraph: number[][];
    layoutGraph: number[][];
    fingerprintChain: string[];
    outputFormat: string;
    expectedFormat: string;
    mode: CompositeMode;
  }): SRCRuleResult[] {
    const results: SRCRuleResult[] = [];
    const {
      sourceElements, replicatedElements, sourceRelations, replicatedRelations,
      constraintGraph, layoutGraph, fingerprintChain, outputFormat, expectedFormat,
    } = params;

    // SRC-013: Z-index ordering preserved
    const sourceZOrder = sourceElements.map(e => e.zIndex).join(',');
    const replicaZOrder = replicatedElements.map(e => e.zIndex).join(',');
    results.push({
      ruleId: 'SRC-013', passed: sourceZOrder === replicaZOrder,
      actual: replicaZOrder, threshold: sourceZOrder,
      description: 'Z-index ordering preserved',
    });

    // SRC-014: Element count matches source
    results.push({
      ruleId: 'SRC-014', passed: sourceElements.length === replicatedElements.length,
      actual: replicatedElements.length, threshold: sourceElements.length,
      description: 'Element count matches source',
    });

    // SRC-015: Spatial relations preserved
    const sourceRelStr = sourceRelations.map(r => `${r.relation}`).sort().join(',');
    const replicaRelStr = replicatedRelations.map(r => `${r.relation}`).sort().join(',');
    results.push({
      ruleId: 'SRC-015', passed: sourceRelStr === replicaRelStr,
      actual: replicatedRelations.length, threshold: sourceRelations.length,
      description: 'Spatial relations preserved',
    });

    // SRC-016: Opacity values preserved
    const opacityMatch = sourceElements.every((s, i) =>
      i < replicatedElements.length && Math.abs(s.opacity - replicatedElements[i].opacity) < 0.001
    );
    results.push({
      ruleId: 'SRC-016', passed: opacityMatch,
      actual: opacityMatch ? 'matched' : 'mismatch', threshold: 'matched',
      description: 'Opacity values preserved',
    });

    // SRC-017: Rotation values preserved
    const rotationMatch = sourceElements.every((s, i) =>
      i < replicatedElements.length && Math.abs(s.rotation - replicatedElements[i].rotation) < 0.001
    );
    results.push({
      ruleId: 'SRC-017', passed: rotationMatch,
      actual: rotationMatch ? 'matched' : 'mismatch', threshold: 'matched',
      description: 'Rotation values preserved',
    });

    // SRC-018: Nested hierarchy preserved
    const sourceDepths = sourceElements.map(e => Array.isArray(e.children) ? e.children.length : 0);
    const replicaDepths = replicatedElements.map(e => Array.isArray(e.children) ? e.children.length : 0);
    const hierarchyMatch = JSON.stringify(sourceDepths) === JSON.stringify(replicaDepths);
    results.push({
      ruleId: 'SRC-018', passed: hierarchyMatch,
      actual: hierarchyMatch ? 'matched' : 'mismatch', threshold: 'matched',
      description: 'Nested hierarchy preserved',
    });

    // SRC-019: Constraint graph acyclic (DAG check)
    const isAcyclic = this.checkAcyclic(constraintGraph);
    results.push({
      ruleId: 'SRC-019', passed: isAcyclic,
      actual: isAcyclic ? 'acyclic' : 'cyclic', threshold: 'acyclic',
      description: 'Constraint graph acyclic',
    });

    // SRC-020: Layout graph connected
    const isConnected = this.checkConnected(layoutGraph);
    results.push({
      ruleId: 'SRC-020', passed: isConnected,
      actual: isConnected ? 'connected' : 'disconnected', threshold: 'connected',
      description: 'Layout graph connected',
    });

    // SRC-021: Fingerprint chain unbroken
    const chainValid = fingerprintChain.length > 0 && fingerprintChain.every(f => f.length > 0);
    results.push({
      ruleId: 'SRC-021', passed: chainValid,
      actual: chainValid ? 'valid' : 'broken', threshold: 'valid',
      description: 'Fingerprint chain unbroken',
    });

    // SRC-022: No phantom elements introduced
    const noPhantoms = replicatedElements.length <= sourceElements.length;
    results.push({
      ruleId: 'SRC-022', passed: noPhantoms,
      actual: replicatedElements.length, threshold: sourceElements.length,
      description: 'No phantom elements introduced',
    });

    // SRC-023: Output format matches specification
    const formatMatch = outputFormat === expectedFormat;
    results.push({
      ruleId: 'SRC-023', passed: formatMatch,
      actual: outputFormat, threshold: expectedFormat,
      description: 'Output format matches specification',
    });

    const failedRules = results.filter(r => !r.passed);
    if (failedRules.length > 0) {
      logger.warn('SRC structural enforcement failed', {
        failedCount: failedRules.length,
        failedRules: failedRules.map(r => r.ruleId),
        mode: params.mode,
      });

      // In STRICT mode, throw to block output
      if (params.mode === CompositeMode.STRICT_REPLICATION) {
        const error = new Error(
          `SRC enforcement BLOCKED: ${failedRules.length} rules failed [${failedRules.map(r => r.ruleId).join(', ')}]`
        );
        (error as unknown as Record<string, unknown>).srcReport = results;
        throw error;
      }
    }

    return results;
  }

  /** Check if a directed graph (adjacency matrix) is acyclic */
  private checkAcyclic(graph: number[][]): boolean {
    if (graph.length === 0) return true;
    const n = graph.length;
    const visited = new Array(n).fill(0); // 0=unvisited, 1=visiting, 2=visited
    const hasCycle = (node: number): boolean => {
      visited[node] = 1;
      for (let i = 0; i < n; i++) {
        if (graph[node][i] > 0) {
          if (visited[i] === 1) return true;
          if (visited[i] === 0 && hasCycle(i)) return true;
        }
      }
      visited[node] = 2;
      return false;
    };
    for (let i = 0; i < n; i++) {
      if (visited[i] === 0 && hasCycle(i)) return false;
    }
    return true;
  }

  /** Check if an undirected graph (adjacency matrix) is connected */
  private checkConnected(graph: number[][]): boolean {
    if (graph.length <= 1) return true;
    const n = graph.length;
    const visited = new Set<number>();
    const queue = [0];
    visited.add(0);
    while (queue.length > 0) {
      const node = queue.shift()!;
      for (let i = 0; i < n; i++) {
        if (graph[node][i] > 0 && !visited.has(i)) {
          visited.add(i);
          queue.push(i);
        }
      }
    }
    return visited.size === n;
  }

  private makeSRCRule(
    ruleId: string,
    description: string,
    actual: number,
    threshold: number,
    passed: boolean,
  ): SRCRuleResult {
    return { ruleId, passed, actual, threshold, description };
  }
}

export const srcEnforcement = new SRCEnforcement();
