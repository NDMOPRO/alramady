/**
 * Composite Operating Modes
 * Three modes controlling optimization level and strictness in replication.
 */

import { logger } from '../../utils/logger.js';

export enum CompositeMode {
  STRICT_REPLICATION = 'STRICT_REPLICATION',
  PROFESSIONAL_CREATION = 'PROFESSIONAL_CREATION',
  HYBRID = 'HYBRID',
}

export interface ModeConfig {
  mode: CompositeMode;
  optimization: 'disabled' | 'controlled' | 'partial';
  strictness: 'absolute' | 'high' | 'balanced';
  pixelThreshold: number;
  structuralThreshold: number;
  allowReflow: boolean;
  allowFontSubstitution: boolean;
  allowColorAdjustment: boolean;
  allowLayoutOptimization: boolean;
  deterministicRendering: boolean;
  fidelityWeight: number;
  aestheticWeight: number;
  performanceWeight: number;
  description: string;
}

const MODE_CONFIGS: Record<CompositeMode, ModeConfig> = {
  [CompositeMode.STRICT_REPLICATION]: {
    mode: CompositeMode.STRICT_REPLICATION,
    optimization: 'disabled',
    strictness: 'absolute',
    pixelThreshold: 0.001,
    structuralThreshold: 0.999,
    allowReflow: false,
    allowFontSubstitution: false,
    allowColorAdjustment: false,
    allowLayoutOptimization: false,
    deterministicRendering: true,
    fidelityWeight: 1.0,
    aestheticWeight: 0.0,
    performanceWeight: 0.0,
    description:
      'Exact pixel-perfect replication with zero optimization. ' +
      'All layout constraints are absolute and immutable.',
  },
  [CompositeMode.PROFESSIONAL_CREATION]: {
    mode: CompositeMode.PROFESSIONAL_CREATION,
    optimization: 'controlled',
    strictness: 'high',
    pixelThreshold: 0.005,
    structuralThreshold: 0.99,
    allowReflow: false,
    allowFontSubstitution: true,
    allowColorAdjustment: true,
    allowLayoutOptimization: false,
    deterministicRendering: true,
    fidelityWeight: 0.7,
    aestheticWeight: 0.25,
    performanceWeight: 0.05,
    description:
      'Professional-grade output with controlled font and color adjustments. ' +
      'Structural fidelity remains high, minor visual tuning permitted.',
  },
  [CompositeMode.HYBRID]: {
    mode: CompositeMode.HYBRID,
    optimization: 'partial',
    strictness: 'balanced',
    pixelThreshold: 0.01,
    structuralThreshold: 0.98,
    allowReflow: true,
    allowFontSubstitution: true,
    allowColorAdjustment: true,
    allowLayoutOptimization: true,
    deterministicRendering: false,
    fidelityWeight: 0.5,
    aestheticWeight: 0.3,
    performanceWeight: 0.2,
    description:
      'Balanced mode allowing layout optimization and reflow. ' +
      'Suitable for documents that need adaptation across formats.',
  },
};

export class CompositeModeManager {
  private currentMode: CompositeMode;
  private overrides: Partial<ModeConfig>;

  constructor(initialMode: CompositeMode = CompositeMode.STRICT_REPLICATION) {
    this.currentMode = initialMode;
    this.overrides = {};
    logger.info('CompositeModeManager initialized', { mode: initialMode });
  }

  /** Get the currently active mode */
  getCurrentMode(): CompositeMode {
    return this.currentMode;
  }

  /** Switch to a different operating mode */
  setMode(mode: CompositeMode): ModeConfig {
    const previousMode = this.currentMode;
    this.currentMode = mode;
    this.overrides = {}; // Clear overrides on mode change
    logger.info('Composite mode changed', { from: previousMode, to: mode });
    return this.getModeConfig();
  }

  /** Get the full configuration for the current mode, including any overrides */
  getModeConfig(): ModeConfig {
    const base = { ...MODE_CONFIGS[this.currentMode] };
    return { ...base, ...this.overrides, mode: this.currentMode };
  }

  /** Get configuration for a specific mode without changing the current one */
  getModeConfigFor(mode: CompositeMode): ModeConfig {
    return { ...MODE_CONFIGS[mode] };
  }

  /** Apply partial overrides to the current mode's configuration */
  applyOverrides(overrides: Partial<Omit<ModeConfig, 'mode'>>): ModeConfig {
    this.overrides = { ...this.overrides, ...overrides };
    logger.info('Mode overrides applied', {
      mode: this.currentMode,
      overrideKeys: Object.keys(overrides),
    });
    return this.getModeConfig();
  }

  /** Clear all overrides, reverting to the base mode config */
  clearOverrides(): ModeConfig {
    this.overrides = {};
    logger.info('Mode overrides cleared', { mode: this.currentMode });
    return this.getModeConfig();
  }

  /** Check if a specific operation is allowed under the current mode */
  isOperationAllowed(operation: 'reflow' | 'fontSubstitution' | 'colorAdjustment' | 'layoutOptimization'): boolean {
    const config = this.getModeConfig();
    switch (operation) {
      case 'reflow':
        return config.allowReflow;
      case 'fontSubstitution':
        return config.allowFontSubstitution;
      case 'colorAdjustment':
        return config.allowColorAdjustment;
      case 'layoutOptimization':
        return config.allowLayoutOptimization;
      default:
        return false;
    }
  }

  /** Validate that a given pixel diff and structural hash meet current mode thresholds */
  meetsThresholds(pixelDiff: number, structuralSimilarity: number): boolean {
    const config = this.getModeConfig();
    return pixelDiff <= config.pixelThreshold && structuralSimilarity >= config.structuralThreshold;
  }

  /** Compute a weighted fidelity score combining pixel, structural, and aesthetic factors */
  computeWeightedScore(pixelFidelity: number, structuralFidelity: number, aestheticScore: number): number {
    const config = this.getModeConfig();
    const raw =
      config.fidelityWeight * ((pixelFidelity + structuralFidelity) / 2) +
      config.aestheticWeight * aestheticScore +
      config.performanceWeight * 1.0; // performance assumed optimal
    return Math.min(1.0, Math.max(0.0, raw));
  }

  /** Get a summary of all available modes */
  listModes(): Array<{ mode: CompositeMode; description: string; strictness: string }> {
    return Object.values(MODE_CONFIGS).map((cfg) => ({
      mode: cfg.mode,
      description: cfg.description,
      strictness: cfg.strictness,
    }));
  }
}

export const compositeModeManager = new CompositeModeManager();
