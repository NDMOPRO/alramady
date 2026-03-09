/**
 * Constraint Rebalance for RTL Layouts
 * Recalculates constraint positions when switching text direction,
 * preserving alignment symmetry and validating balance scores.
 */

import { logger } from '../../utils/logger.js';

/** Layout direction */
export type LayoutDirection = 'ltr' | 'rtl';

/** Constraint types */
export type ConstraintType =
  | 'leading'
  | 'trailing'
  | 'top'
  | 'bottom'
  | 'centerX'
  | 'centerY'
  | 'width'
  | 'height'
  | 'aspectRatio'
  | 'equalWidth'
  | 'equalHeight'
  | 'horizontalChain'
  | 'verticalChain';

/** A layout constraint between elements */
export interface LayoutConstraint {
  id: string;
  type: ConstraintType;
  sourceElementId: string;
  targetElementId: string | null;
  value: number;
  priority: number;
  direction: LayoutDirection;
}

/** A set of constraints for a layout */
export interface ConstraintSet {
  constraints: LayoutConstraint[];
  containerWidth: number;
  containerHeight: number;
  direction: LayoutDirection;
}

/** Rebalanced constraint result */
export interface RebalancedConstraints {
  constraints: LayoutConstraint[];
  containerWidth: number;
  containerHeight: number;
  direction: LayoutDirection;
  balanceScore: number;
  adjustments: ConstraintAdjustment[];
  passed: boolean;
}

/** Record of a constraint adjustment */
export interface ConstraintAdjustment {
  constraintId: string;
  originalValue: number;
  newValue: number;
  originalType: ConstraintType;
  newType: ConstraintType;
  reason: string;
}

/** Minimum acceptable balance score */
const MIN_BALANCE_SCORE = 0.9;

/**
 * Flips leading/trailing constraint types for RTL/LTR switch.
 */
function flipConstraintType(type: ConstraintType): ConstraintType {
  switch (type) {
    case 'leading': return 'trailing';
    case 'trailing': return 'leading';
    default: return type;
  }
}

/**
 * Recalculates the X-position value of a horizontal constraint for opposite direction.
 */
function recalculateXPosition(
  constraint: LayoutConstraint,
  containerWidth: number,
  targetDirection: LayoutDirection
): { value: number; type: ConstraintType; reason: string } {
  const currentDirection = constraint.direction;
  if (currentDirection === targetDirection) {
    return { value: constraint.value, type: constraint.type, reason: 'no change needed' };
  }

  switch (constraint.type) {
    case 'leading':
    case 'trailing': {
      const newType = flipConstraintType(constraint.type);
      return {
        value: constraint.value,
        type: newType,
        reason: `Flipped ${constraint.type} to ${newType} for ${targetDirection}`,
      };
    }
    case 'centerX': {
      const newValue = containerWidth - constraint.value;
      return {
        value: newValue,
        type: 'centerX',
        reason: `Mirrored centerX from ${constraint.value} to ${newValue}`,
      };
    }
    case 'horizontalChain': {
      const newValue = containerWidth - constraint.value;
      return {
        value: newValue,
        type: 'horizontalChain',
        reason: `Reversed horizontal chain position`,
      };
    }
    default:
      return { value: constraint.value, type: constraint.type, reason: 'non-horizontal constraint unchanged' };
  }
}

/**
 * Computes alignment symmetry score for a set of constraints.
 * A score of 1.0 means perfectly balanced; below 0.9 is failing.
 */
function computeBalanceScore(
  constraints: LayoutConstraint[],
  containerWidth: number
): number {
  if (constraints.length === 0) return 1.0;

  const horizontalConstraints = constraints.filter(c =>
    c.type === 'leading' || c.type === 'trailing' || c.type === 'centerX' || c.type === 'horizontalChain'
  );

  if (horizontalConstraints.length === 0) return 1.0;

  let totalBalance = 0;
  let count = 0;
  const halfWidth = containerWidth / 2;

  const leadingConstraints = horizontalConstraints.filter(c => c.type === 'leading');
  const trailingConstraints = horizontalConstraints.filter(c => c.type === 'trailing');

  if (leadingConstraints.length > 0 && trailingConstraints.length > 0) {
    const avgLeading = leadingConstraints.reduce((s, c) => s + c.value, 0) / leadingConstraints.length;
    const avgTrailing = trailingConstraints.reduce((s, c) => s + c.value, 0) / trailingConstraints.length;

    const symmetryDelta = Math.abs(avgLeading - avgTrailing) / Math.max(containerWidth, 1);
    totalBalance += 1 - Math.min(symmetryDelta, 1);
    count++;
  }

  const centerConstraints = horizontalConstraints.filter(c => c.type === 'centerX');
  for (const c of centerConstraints) {
    const deviation = Math.abs(c.value - halfWidth) / Math.max(halfWidth, 1);
    totalBalance += 1 - Math.min(deviation, 1);
    count++;
  }

  if (count === 0) return 1.0;

  const chainConstraints = horizontalConstraints.filter(c => c.type === 'horizontalChain');
  if (chainConstraints.length > 0) {
    const values = chainConstraints.map(c => c.value).sort((a, b) => a - b);
    if (values.length >= 2) {
      const gaps: number[] = [];
      for (let i = 1; i < values.length; i++) {
        gaps.push(values[i] - values[i - 1]);
      }
      const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      const gapVariance = gaps.reduce((s, g) => s + Math.pow(g - avgGap, 2), 0) / gaps.length;
      const normalizedVariance = Math.sqrt(gapVariance) / Math.max(avgGap, 1);
      totalBalance += 1 - Math.min(normalizedVariance, 1);
      count++;
    }
  }

  return totalBalance / count;
}

/**
 * Rebalances a set of layout constraints for a target direction.
 * Recalculates X positions, preserves alignment symmetry, and validates
 * that the balance score meets the minimum threshold of 0.9.
 */
export function rebalanceConstraints(
  constraintSet: ConstraintSet,
  direction: LayoutDirection
): RebalancedConstraints {
  logger.info('Starting constraint rebalance', {
    constraintCount: constraintSet.constraints.length,
    fromDirection: constraintSet.direction,
    toDirection: direction,
    containerWidth: constraintSet.containerWidth,
  });

  const adjustments: ConstraintAdjustment[] = [];
  const rebalancedConstraints: LayoutConstraint[] = [];

  for (const constraint of constraintSet.constraints) {
    const { value, type, reason } = recalculateXPosition(
      constraint,
      constraintSet.containerWidth,
      direction
    );

    const isChanged = value !== constraint.value || type !== constraint.type;

    if (isChanged) {
      adjustments.push({
        constraintId: constraint.id,
        originalValue: constraint.value,
        newValue: value,
        originalType: constraint.type,
        newType: type,
        reason,
      });
    }

    rebalancedConstraints.push({
      ...constraint,
      value,
      type,
      direction,
    });
  }

  let balanceScore = computeBalanceScore(rebalancedConstraints, constraintSet.containerWidth);

  if (balanceScore < MIN_BALANCE_SCORE) {
    logger.warn('Balance score below threshold, applying corrections', {
      score: balanceScore,
      threshold: MIN_BALANCE_SCORE,
    });

    const corrected = applyBalanceCorrections(
      rebalancedConstraints,
      constraintSet.containerWidth,
      adjustments
    );

    balanceScore = computeBalanceScore(corrected, constraintSet.containerWidth);

    const result: RebalancedConstraints = {
      constraints: corrected,
      containerWidth: constraintSet.containerWidth,
      containerHeight: constraintSet.containerHeight,
      direction,
      balanceScore,
      adjustments,
      passed: balanceScore >= MIN_BALANCE_SCORE,
    };

    if (!result.passed) {
      logger.error('Constraint rebalance failed balance validation', {
        score: balanceScore,
        threshold: MIN_BALANCE_SCORE,
      });
    }

    return result;
  }

  logger.info('Constraint rebalance complete', {
    adjustments: adjustments.length,
    balanceScore,
    passed: true,
  });

  return {
    constraints: rebalancedConstraints,
    containerWidth: constraintSet.containerWidth,
    containerHeight: constraintSet.containerHeight,
    direction,
    balanceScore,
    adjustments,
    passed: true,
  };
}

/**
 * Applies corrections to constraints that fail balance validation.
 * Adjusts leading/trailing symmetry and normalizes chain spacing.
 */
function applyBalanceCorrections(
  constraints: LayoutConstraint[],
  containerWidth: number,
  adjustments: ConstraintAdjustment[]
): LayoutConstraint[] {
  const corrected = [...constraints];

  const leadingIdxs: number[] = [];
  const trailingIdxs: number[] = [];

  for (let i = 0; i < corrected.length; i++) {
    if (corrected[i].type === 'leading') leadingIdxs.push(i);
    if (corrected[i].type === 'trailing') trailingIdxs.push(i);
  }

  if (leadingIdxs.length > 0 && trailingIdxs.length > 0) {
    const avgLeading = leadingIdxs.reduce((s, i) => s + corrected[i].value, 0) / leadingIdxs.length;
    const avgTrailing = trailingIdxs.reduce((s, i) => s + corrected[i].value, 0) / trailingIdxs.length;
    const targetAvg = (avgLeading + avgTrailing) / 2;

    for (const idx of leadingIdxs) {
      const c = corrected[idx];
      const delta = c.value - avgLeading;
      const newValue = targetAvg + delta;
      adjustments.push({
        constraintId: c.id,
        originalValue: c.value,
        newValue,
        originalType: c.type,
        newType: c.type,
        reason: 'Balance correction: symmetrized leading/trailing',
      });
      corrected[idx] = { ...c, value: newValue };
    }

    for (const idx of trailingIdxs) {
      const c = corrected[idx];
      const delta = c.value - avgTrailing;
      const newValue = targetAvg + delta;
      adjustments.push({
        constraintId: c.id,
        originalValue: c.value,
        newValue,
        originalType: c.type,
        newType: c.type,
        reason: 'Balance correction: symmetrized leading/trailing',
      });
      corrected[idx] = { ...c, value: newValue };
    }
  }

  const chainIdxs = corrected
    .map((c, i) => (c.type === 'horizontalChain' ? i : -1))
    .filter(i => i >= 0);

  if (chainIdxs.length >= 2) {
    const values = chainIdxs.map(i => corrected[i].value).sort((a, b) => a - b);
    const totalSpan = values[values.length - 1] - values[0];
    const evenSpacing = totalSpan / (chainIdxs.length - 1);

    const sortedIdxs = [...chainIdxs].sort((a, b) => corrected[a].value - corrected[b].value);
    const startValue = corrected[sortedIdxs[0]].value;

    for (let i = 0; i < sortedIdxs.length; i++) {
      const idx = sortedIdxs[i];
      const c = corrected[idx];
      const newValue = startValue + i * evenSpacing;

      if (Math.abs(newValue - c.value) > 0.5) {
        adjustments.push({
          constraintId: c.id,
          originalValue: c.value,
          newValue,
          originalType: c.type,
          newType: c.type,
          reason: 'Balance correction: normalized chain spacing',
        });
        corrected[idx] = { ...c, value: newValue };
      }
    }
  }

  return corrected;
}
