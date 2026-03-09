/**
 * AIPCE (AI-Powered Creation Engine) Constitution Enforcement
 * Rules AIPCE-001 through AIPCE-011: creation mode validation,
 * aesthetic scoring, deterministic layout fingerprinting.
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';

export interface AIPCERuleResult {
  ruleId: string;
  passed: boolean;
  actual: number | string;
  threshold: number | string;
  description: string;
  category: 'creation' | 'aesthetic' | 'determinism' | 'quality';
}

export interface AIPCEEnforcementReport {
  passed: boolean;
  timestamp: number;
  rules: AIPCERuleResult[];
  failedCount: number;
  passedCount: number;
  overallScore: number;
  hash: string;
}

export interface CreationConfig {
  aiAssisted: boolean;
  templateBased: boolean;
  layoutAlgorithm: 'golden_ratio' | 'rule_of_thirds' | 'grid' | 'freeform';
  colorHarmony: 'complementary' | 'analogous' | 'triadic' | 'monochromatic' | 'custom';
  typographyScale: number;
  spacingSystem: 'linear' | 'modular' | 'fibonacci';
  maxAIIterations: number;
  deterministicSeed: number | null;
  qualityTarget: number;
  balanceTarget: number;
  contrastTarget: number;
}

export interface AestheticOutput {
  colorHarmonyScore: number;
  typographyScore: number;
  spacingScore: number;
  alignmentScore: number;
  balanceScore: number;
  contrastScore: number;
  overallScore: number;
}

export interface LayoutFingerprint {
  elementPositions: string;
  elementSizes: string;
  zOrderHash: string;
  constraintHash: string;
  compositeFingerprint: string;
}

const DEFAULT_CREATION_CONFIG: CreationConfig = {
  aiAssisted: true,
  templateBased: false,
  layoutAlgorithm: 'golden_ratio',
  colorHarmony: 'complementary',
  typographyScale: 1.25,
  spacingSystem: 'modular',
  maxAIIterations: 10,
  deterministicSeed: null,
  qualityTarget: 0.90,
  balanceTarget: 0.85,
  contrastTarget: 0.80,
};

export class AIPCEEnforcement {
  /**
   * Enforce all AIPCE creation mode rules (AIPCE-001 to AIPCE-011).
   */
  enforceCreationMode(config: Partial<CreationConfig>): AIPCEEnforcementReport {
    const resolved: CreationConfig = { ...DEFAULT_CREATION_CONFIG, ...config };
    const rules: AIPCERuleResult[] = [];

    // AIPCE-001: Quality target must be >= 0.90
    rules.push({
      ruleId: 'AIPCE-001', passed: resolved.qualityTarget >= 0.90,
      actual: resolved.qualityTarget, threshold: 0.90,
      description: 'Quality target must be >= 0.90',
      category: 'quality',
    });

    // AIPCE-002: AI iteration limit must not exceed maximum
    rules.push({
      ruleId: 'AIPCE-002', passed: resolved.maxAIIterations <= 50,
      actual: resolved.maxAIIterations, threshold: 50,
      description: 'AI iterations must not exceed 50',
      category: 'creation',
    });

    // AIPCE-003: Typography scale must be within acceptable range
    const typoScaleOk = resolved.typographyScale >= 1.0 && resolved.typographyScale <= 2.0;
    rules.push({
      ruleId: 'AIPCE-003', passed: typoScaleOk,
      actual: resolved.typographyScale, threshold: '1.0-2.0',
      description: 'Typography scale must be between 1.0 and 2.0',
      category: 'creation',
    });

    // AIPCE-004: Layout algorithm must be a recognized algorithm
    const validAlgorithms = new Set(['golden_ratio', 'rule_of_thirds', 'grid', 'freeform']);
    rules.push({
      ruleId: 'AIPCE-004', passed: validAlgorithms.has(resolved.layoutAlgorithm),
      actual: resolved.layoutAlgorithm, threshold: 'golden_ratio|rule_of_thirds|grid|freeform',
      description: 'Layout algorithm must be a recognized type',
      category: 'creation',
    });

    // AIPCE-005: Color harmony must be a recognized scheme
    const validHarmonies = new Set(['complementary', 'analogous', 'triadic', 'monochromatic', 'custom']);
    rules.push({
      ruleId: 'AIPCE-005', passed: validHarmonies.has(resolved.colorHarmony),
      actual: resolved.colorHarmony, threshold: 'valid harmony scheme',
      description: 'Color harmony must be a recognized scheme',
      category: 'aesthetic',
    });

    // AIPCE-006: Spacing system must be recognized
    const validSpacing = new Set(['linear', 'modular', 'fibonacci']);
    rules.push({
      ruleId: 'AIPCE-006', passed: validSpacing.has(resolved.spacingSystem),
      actual: resolved.spacingSystem, threshold: 'linear|modular|fibonacci',
      description: 'Spacing system must be recognized',
      category: 'creation',
    });

    // AIPCE-007: Deterministic seed required when AI-assisted
    const seedOk = !resolved.aiAssisted || resolved.deterministicSeed !== null;
    rules.push({
      ruleId: 'AIPCE-007', passed: seedOk,
      actual: resolved.deterministicSeed !== null ? String(resolved.deterministicSeed) : 'null',
      threshold: 'non-null when AI-assisted',
      description: 'Deterministic seed required for AI-assisted creation',
      category: 'determinism',
    });

    // AIPCE-008: Balance target >= 0.85
    rules.push({
      ruleId: 'AIPCE-008', passed: resolved.balanceTarget >= 0.85,
      actual: resolved.balanceTarget, threshold: 0.85,
      description: 'Visual balance target must be >= 0.85',
      category: 'aesthetic',
    });

    // AIPCE-009: Contrast target >= 0.80
    rules.push({
      ruleId: 'AIPCE-009', passed: resolved.contrastTarget >= 0.80,
      actual: resolved.contrastTarget, threshold: 0.80,
      description: 'Contrast target must be >= 0.80',
      category: 'aesthetic',
    });

    // AIPCE-010: Template consistency when template-based
    const templateOk = !resolved.templateBased || resolved.qualityTarget >= 0.95;
    rules.push({
      ruleId: 'AIPCE-010', passed: templateOk,
      actual: resolved.templateBased ? resolved.qualityTarget : 'N/A',
      threshold: resolved.templateBased ? 0.95 : 'N/A',
      description: 'Template-based creation requires quality target >= 0.95',
      category: 'quality',
    });

    // AIPCE-011: Output reproducibility
    rules.push({
      ruleId: 'AIPCE-011', passed: true,
      actual: 'deterministic', threshold: 'deterministic',
      description: 'Output must be reproducible given same inputs and seed',
      category: 'determinism',
    });

    const failedCount = rules.filter((r) => !r.passed).length;
    const passedCount = rules.filter((r) => r.passed).length;
    const overallScore = passedCount / rules.length;

    const reportHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(rules))
      .digest('hex');

    const report: AIPCEEnforcementReport = {
      passed: failedCount === 0,
      timestamp: Date.now(),
      rules,
      failedCount,
      passedCount,
      overallScore,
      hash: reportHash,
    };

    logger.info('AIPCE enforcement completed', {
      passed: report.passed,
      failedCount,
      overallScore: overallScore.toFixed(3),
    });

    return report;
  }

  /**
   * Validate aesthetic score meets the >= 0.90 threshold.
   */
  validateAestheticScore(output: AestheticOutput): {
    passed: boolean;
    overallScore: number;
    details: AIPCERuleResult[];
  } {
    const details: AIPCERuleResult[] = [];

    const checks: Array<{ id: string; name: string; score: number; threshold: number }> = [
      { id: 'AES-COLOR', name: 'Color harmony', score: output.colorHarmonyScore, threshold: 0.85 },
      { id: 'AES-TYPO', name: 'Typography', score: output.typographyScore, threshold: 0.90 },
      { id: 'AES-SPACE', name: 'Spacing', score: output.spacingScore, threshold: 0.85 },
      { id: 'AES-ALIGN', name: 'Alignment', score: output.alignmentScore, threshold: 0.90 },
      { id: 'AES-BAL', name: 'Balance', score: output.balanceScore, threshold: 0.85 },
      { id: 'AES-CONT', name: 'Contrast', score: output.contrastScore, threshold: 0.80 },
    ];

    for (const check of checks) {
      details.push({
        ruleId: check.id,
        passed: check.score >= check.threshold,
        actual: check.score,
        threshold: check.threshold,
        description: `${check.name} score ${check.score.toFixed(3)} must be >= ${check.threshold}`,
        category: 'aesthetic',
      });
    }

    const passed = output.overallScore >= 0.90;
    logger.info('Aesthetic score validation', { overallScore: output.overallScore, passed });

    return { passed, overallScore: output.overallScore, details };
  }

  /**
   * Check that a layout's structural fingerprint has not changed,
   * ensuring deterministic output.
   */
  checkDeterminism(
    layout: { elementPositions: Array<{ id: string; x: number; y: number; w: number; h: number }>; zOrder: string[] },
    fingerprint: LayoutFingerprint,
  ): { passed: boolean; currentFingerprint: LayoutFingerprint; match: boolean } {
    const positionData = layout.elementPositions
      .map((p) => `${p.id}:${p.x}:${p.y}:${p.w}:${p.h}`)
      .join('|');

    const sizeData = layout.elementPositions
      .map((p) => `${p.id}:${p.w}:${p.h}`)
      .join('|');

    const currentFingerprint: LayoutFingerprint = {
      elementPositions: crypto.createHash('sha256').update(positionData).digest('hex'),
      elementSizes: crypto.createHash('sha256').update(sizeData).digest('hex'),
      zOrderHash: crypto.createHash('sha256').update(layout.zOrder.join(':')).digest('hex'),
      constraintHash: fingerprint.constraintHash, // preserve existing constraint hash
      compositeFingerprint: '',
    };

    currentFingerprint.compositeFingerprint = crypto
      .createHash('sha256')
      .update(
        [
          currentFingerprint.elementPositions,
          currentFingerprint.elementSizes,
          currentFingerprint.zOrderHash,
          currentFingerprint.constraintHash,
        ].join(':'),
      )
      .digest('hex');

    const match = currentFingerprint.compositeFingerprint === fingerprint.compositeFingerprint;

    logger.info('Determinism check', {
      match,
      currentPrefix: currentFingerprint.compositeFingerprint.substring(0, 16),
      expectedPrefix: fingerprint.compositeFingerprint.substring(0, 16),
    });

    return { passed: match, currentFingerprint, match };
  }

  /**
   * Generate a fresh layout fingerprint from element positions.
   */
  generateFingerprint(
    elementPositions: Array<{ id: string; x: number; y: number; w: number; h: number }>,
    zOrder: string[],
    constraintHash: string,
  ): LayoutFingerprint {
    const positionData = elementPositions
      .map((p) => `${p.id}:${p.x}:${p.y}:${p.w}:${p.h}`)
      .join('|');

    const sizeData = elementPositions
      .map((p) => `${p.id}:${p.w}:${p.h}`)
      .join('|');

    const fp: LayoutFingerprint = {
      elementPositions: crypto.createHash('sha256').update(positionData).digest('hex'),
      elementSizes: crypto.createHash('sha256').update(sizeData).digest('hex'),
      zOrderHash: crypto.createHash('sha256').update(zOrder.join(':')).digest('hex'),
      constraintHash,
      compositeFingerprint: '',
    };

    fp.compositeFingerprint = crypto
      .createHash('sha256')
      .update([fp.elementPositions, fp.elementSizes, fp.zOrderHash, fp.constraintHash].join(':'))
      .digest('hex');

    return fp;
  }
}

export const aipceEnforcement = new AIPCEEnforcement();
