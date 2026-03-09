/**
 * CDR Absolute Locked Mode
 * Enforces ABSOLUTE_LOCKED layout — no grid adaptive, no auto reflow,
 * no flex, no constraint solving. All coordinates are immutable pixel values.
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import { VisualElement, LayoutConstraint, BoundingBox } from '../layers/index.js';
import { CDR } from '../visual-structural-replication-engine.js';

/** Result of an absolute lock validation */
export interface AbsoluteLockValidation {
  valid: boolean;
  violations: AbsoluteLockViolation[];
  elementCount: number;
  lockedCount: number;
  lockRatio: number;
}

export interface AbsoluteLockViolation {
  elementId: string;
  field: string;
  reason: string;
  value: number | string;
}

export class AbsoluteLockedMode {
  /**
   * Lock all element coordinates to absolute pixel values.
   * Returns a new array with every element's bbox frozen.
   */
  preserveAbsoluteCoordinates(elements: VisualElement[]): VisualElement[] {
    if (elements.length === 0) {
      logger.warn('preserveAbsoluteCoordinates called with empty element list');
      return [];
    }

    const locked: VisualElement[] = elements.map((el) => {
      const frozenBbox: BoundingBox = {
        x: Math.round(el.bbox.x * 1000) / 1000,
        y: Math.round(el.bbox.y * 1000) / 1000,
        width: Math.round(el.bbox.width * 1000) / 1000,
        height: Math.round(el.bbox.height * 1000) / 1000,
      };

      const lockedChildren = el.children.length > 0
        ? this.preserveAbsoluteCoordinates(el.children)
        : [];

      // Recompute fingerprint to include locked coordinates
      const coordHash = crypto
        .createHash('sha256')
        .update(`${frozenBbox.x}:${frozenBbox.y}:${frozenBbox.width}:${frozenBbox.height}:${el.fingerprint}`)
        .digest('hex');

      return {
        ...el,
        bbox: Object.freeze(frozenBbox) as BoundingBox,
        children: lockedChildren,
        fingerprint: coordHash,
        style: {
          ...el.style,
          position: 'absolute',
          layoutMode: 'ABSOLUTE_LOCKED',
        },
      };
    });

    logger.info('Absolute coordinates preserved', { count: locked.length });
    return locked;
  }

  /**
   * Validate that a CDR is fully in ABSOLUTE_LOCKED mode.
   * No element may have relative positioning, percentage units, or flex styles.
   */
  validateAbsoluteLock(cdr: CDR): AbsoluteLockValidation {
    const violations: AbsoluteLockViolation[] = [];

    if (cdr.layout_mode !== 'ABSOLUTE_LOCKED') {
      violations.push({
        elementId: 'CDR',
        field: 'layout_mode',
        reason: `Expected ABSOLUTE_LOCKED, got ${cdr.layout_mode}`,
        value: cdr.layout_mode,
      });
    }

    let lockedCount = 0;

    const checkElement = (el: VisualElement): void => {
      // Validate no relative positioning
      if (el.style.position === 'relative' || el.style.position === 'sticky') {
        violations.push({
          elementId: el.id,
          field: 'style.position',
          reason: 'Relative/sticky positioning not allowed in ABSOLUTE_LOCKED mode',
          value: String(el.style.position),
        });
      }

      // Validate no flex/grid
      if (el.style.display === 'flex' || el.style.display === 'grid') {
        violations.push({
          elementId: el.id,
          field: 'style.display',
          reason: 'Flex/grid display not allowed in ABSOLUTE_LOCKED mode',
          value: String(el.style.display),
        });
      }

      // Validate bbox values are finite numbers
      const bboxFields: Array<keyof BoundingBox> = ['x', 'y', 'width', 'height'];
      for (const field of bboxFields) {
        const val = el.bbox[field];
        if (!Number.isFinite(val)) {
          violations.push({
            elementId: el.id,
            field: `bbox.${field}`,
            reason: `Non-finite value: ${val}`,
            value: val,
          });
        }
        if (field === 'width' || field === 'height') {
          if (val < 0) {
            violations.push({
              elementId: el.id,
              field: `bbox.${field}`,
              reason: `Negative dimension: ${val}`,
              value: val,
            });
          }
        }
      }

      // Verify no percentage-based units in constraints targeting this element
      const relatedConstraints = cdr.constraints.filter((c) => c.targetIds.includes(el.id));
      for (const constraint of relatedConstraints) {
        if (constraint.unit === 'percent') {
          violations.push({
            elementId: el.id,
            field: `constraint.${constraint.id}`,
            reason: 'Percentage unit not allowed in ABSOLUTE_LOCKED mode',
            value: `${constraint.value}%`,
          });
        }
        if (!constraint.locked) {
          violations.push({
            elementId: el.id,
            field: `constraint.${constraint.id}.locked`,
            reason: 'Constraint must be locked in ABSOLUTE_LOCKED mode',
            value: 'false',
          });
        }
      }

      if (el.style.layoutMode === 'ABSOLUTE_LOCKED' || el.style.position === 'absolute') {
        lockedCount++;
      }

      for (const child of el.children) {
        checkElement(child);
      }
    };

    for (const element of cdr.elements) {
      checkElement(element);
    }

    const totalElements = this.countElements(cdr.elements);
    const lockRatio = totalElements > 0 ? lockedCount / totalElements : 0;
    const valid = violations.length === 0;

    logger.info('Absolute lock validation', {
      valid,
      violations: violations.length,
      lockRatio,
      totalElements,
    });

    return {
      valid,
      violations,
      elementCount: totalElements,
      lockedCount,
      lockRatio,
    };
  }

  /**
   * Apply absolute lock to an entire CDR, modifying elements and constraints.
   */
  applyCDRLock(cdr: CDR): CDR {
    const lockedElements = this.preserveAbsoluteCoordinates(cdr.elements);
    const lockedConstraints: LayoutConstraint[] = cdr.constraints.map((c) => ({
      ...c,
      unit: c.unit === 'percent' ? 'px' as const : c.unit,
      locked: true,
    }));

    const lockedCdr: CDR = {
      ...cdr,
      layout_mode: 'ABSOLUTE_LOCKED',
      elements: lockedElements,
      constraints: lockedConstraints,
    };

    const validation = this.validateAbsoluteLock(lockedCdr);
    if (!validation.valid) {
      logger.error('CDR absolute lock failed validation after application', {
        violations: validation.violations.length,
      });
    }

    return lockedCdr;
  }

  /**
   * Recursively count all elements including children.
   */
  private countElements(elements: VisualElement[]): number {
    let count = 0;
    for (const el of elements) {
      count++;
      if (el.children.length > 0) {
        count += this.countElements(el.children);
      }
    }
    return count;
  }
}

export const absoluteLockedMode = new AbsoluteLockedMode();
