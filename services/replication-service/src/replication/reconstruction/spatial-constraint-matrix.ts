import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import type { ReconstructedElement } from './structural-reconstruction-engine.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ConstraintRelation =
  | 'left_to_right'
  | 'right_to_left'
  | 'top_to_bottom'
  | 'bottom_to_top'
  | 'width_ratio'
  | 'height_ratio'
  | 'center_x_align'
  | 'center_y_align'
  | 'equal_width'
  | 'equal_height'
  | 'equal_spacing';

export interface SpatialConstraint {
  id: string;
  sourceElementId: string;
  targetElementId: string;
  relation: ConstraintRelation;
  property: string;
  referenceProperty: string;
  value: number;
  unit: 'px' | 'ratio' | 'percent';
  confidence: number;
  expression: string;
}

export interface SpatialConstraintMatrix {
  constraints: SpatialConstraint[];
  elementIds: string[];
  containerWidth: number;
  containerHeight: number;
  adjacencyMap: Map<string, string[]>;
  constraintsByElement: Map<string, SpatialConstraint[]>;
  hash: string;
  createdAt: number;
}

export interface ConstraintMatrixConfig {
  containerWidth: number;
  containerHeight: number;
  alignmentThreshold: number;
  spacingThreshold: number;
  ratioThreshold: number;
  maxConstraintsPerPair: number;
}

const DEFAULT_CONFIG: ConstraintMatrixConfig = {
  containerWidth: 1920,
  containerHeight: 1080,
  alignmentThreshold: 4,
  spacingThreshold: 8,
  ratioThreshold: 0.02,
  maxConstraintsPerPair: 6,
};

// ─── Engine ──────────────────────────────────────────────────────────────────

export class SpatialConstraintMatrixBuilder {
  private readonly config: ConstraintMatrixConfig;
  private constraintCounter: number = 0;

  constructor(config?: Partial<ConstraintMatrixConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.info('SpatialConstraintMatrixBuilder initialized', {
      containerWidth: this.config.containerWidth,
      containerHeight: this.config.containerHeight,
    });
  }

  buildConstraintMatrix(elements: ReconstructedElement[]): SpatialConstraintMatrix {
    logger.info('Building spatial constraint matrix', { elementCount: elements.length });
    const startTime = Date.now();
    this.constraintCounter = 0;

    const constraints: SpatialConstraint[] = [];
    const elementIds = elements.map((el) => el.id);
    const adjacencyMap = new Map<string, string[]>();
    const constraintsByElement = new Map<string, SpatialConstraint[]>();

    for (const id of elementIds) {
      adjacencyMap.set(id, []);
      constraintsByElement.set(id, []);
    }

    // Pairwise constraint detection
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const pairConstraints = this.detectPairConstraints(elements[i], elements[j]);
        for (const constraint of pairConstraints) {
          constraints.push(constraint);
          adjacencyMap.get(constraint.sourceElementId)!.push(constraint.targetElementId);
          adjacencyMap.get(constraint.targetElementId)!.push(constraint.sourceElementId);
          constraintsByElement.get(constraint.sourceElementId)!.push(constraint);
          constraintsByElement.get(constraint.targetElementId)!.push(constraint);
        }
      }
    }

    // Container-relative constraints
    for (const element of elements) {
      const containerConstraints = this.detectContainerConstraints(element);
      for (const constraint of containerConstraints) {
        constraints.push(constraint);
        constraintsByElement.get(element.id)!.push(constraint);
      }
    }

    // Group alignment constraints
    const alignmentConstraints = this.detectGroupAlignments(elements);
    for (const constraint of alignmentConstraints) {
      constraints.push(constraint);
      constraintsByElement.get(constraint.sourceElementId)!.push(constraint);
    }

    const matrixHash = this.computeMatrixHash(constraints);

    const matrix: SpatialConstraintMatrix = {
      constraints,
      elementIds,
      containerWidth: this.config.containerWidth,
      containerHeight: this.config.containerHeight,
      adjacencyMap,
      constraintsByElement,
      hash: matrixHash,
      createdAt: Date.now(),
    };

    logger.info('Spatial constraint matrix built', {
      constraintCount: constraints.length,
      elementCount: elementIds.length,
      elapsedMs: Date.now() - startTime,
    });

    return matrix;
  }

  validateConstraints(matrix: SpatialConstraintMatrix, tolerance: number): boolean {
    logger.info('Validating constraints', { constraintCount: matrix.constraints.length, tolerance });
    let violations = 0;

    for (const constraint of matrix.constraints) {
      if (constraint.unit === 'px' && Math.abs(constraint.value) > this.config.containerWidth * 2) {
        violations++;
        logger.warn('Constraint value out of bounds', {
          constraintId: constraint.id,
          value: constraint.value,
          expression: constraint.expression,
        });
      }

      if (constraint.unit === 'ratio' && (constraint.value < -10 || constraint.value > 10)) {
        violations++;
        logger.warn('Constraint ratio extreme', {
          constraintId: constraint.id,
          value: constraint.value,
        });
      }

      if (constraint.confidence < tolerance) {
        violations++;
      }
    }

    const valid = violations === 0;
    logger.info('Constraint validation result', { valid, violations, total: matrix.constraints.length });
    return valid;
  }

  serializeMatrix(matrix: SpatialConstraintMatrix): string {
    const serializable = {
      constraints: matrix.constraints.map((c) => ({
        id: c.id,
        src: c.sourceElementId,
        tgt: c.targetElementId,
        rel: c.relation,
        prop: c.property,
        ref: c.referenceProperty,
        val: c.value,
        unit: c.unit,
        conf: c.confidence,
        expr: c.expression,
      })),
      elementIds: matrix.elementIds,
      containerWidth: matrix.containerWidth,
      containerHeight: matrix.containerHeight,
      hash: matrix.hash,
      createdAt: matrix.createdAt,
    };
    return JSON.stringify(serializable, null, 0);
  }

  private detectPairConstraints(a: ReconstructedElement, b: ReconstructedElement): SpatialConstraint[] {
    const constraints: SpatialConstraint[] = [];

    // Horizontal spacing: b.left = a.right + gap
    const horizontalGap = b.x - (a.x + a.width);
    if (horizontalGap > 0 && horizontalGap < this.config.containerWidth * 0.5) {
      constraints.push(this.createConstraint(
        b.id, a.id, 'left_to_right', 'left', 'right',
        horizontalGap, 'px', 0.9,
        `${b.id}.left = ${a.id}.right + ${horizontalGap}px`
      ));
    }

    // Vertical spacing: b.top = a.bottom + gap
    const verticalGap = b.y - (a.y + a.height);
    if (verticalGap > 0 && verticalGap < this.config.containerHeight * 0.5) {
      constraints.push(this.createConstraint(
        b.id, a.id, 'top_to_bottom', 'top', 'bottom',
        verticalGap, 'px', 0.9,
        `${b.id}.top = ${a.id}.bottom + ${verticalGap}px`
      ));
    }

    // Horizontal center alignment
    const centerAx = a.x + a.width / 2;
    const centerBx = b.x + b.width / 2;
    if (Math.abs(centerAx - centerBx) <= this.config.alignmentThreshold) {
      constraints.push(this.createConstraint(
        a.id, b.id, 'center_x_align', 'centerX', 'centerX',
        0, 'px', 0.95,
        `${a.id}.centerX = ${b.id}.centerX`
      ));
    }

    // Vertical center alignment
    const centerAy = a.y + a.height / 2;
    const centerBy = b.y + b.height / 2;
    if (Math.abs(centerAy - centerBy) <= this.config.alignmentThreshold) {
      constraints.push(this.createConstraint(
        a.id, b.id, 'center_y_align', 'centerY', 'centerY',
        0, 'px', 0.95,
        `${a.id}.centerY = ${b.id}.centerY`
      ));
    }

    // Equal width
    if (Math.abs(a.width - b.width) <= this.config.spacingThreshold) {
      constraints.push(this.createConstraint(
        a.id, b.id, 'equal_width', 'width', 'width',
        1, 'ratio', 0.85,
        `${a.id}.width = ${b.id}.width`
      ));
    }

    // Equal height
    if (Math.abs(a.height - b.height) <= this.config.spacingThreshold) {
      constraints.push(this.createConstraint(
        a.id, b.id, 'equal_height', 'height', 'height',
        1, 'ratio', 0.85,
        `${a.id}.height = ${b.id}.height`
      ));
    }

    // Width ratio
    if (a.width > 0 && b.width > 0) {
      const widthRatio = parseFloat((b.width / a.width).toFixed(4));
      if (widthRatio !== 1 && Math.abs(widthRatio - Math.round(widthRatio * 2) / 2) < this.config.ratioThreshold) {
        constraints.push(this.createConstraint(
          b.id, a.id, 'width_ratio', 'width', 'width',
          widthRatio, 'ratio', 0.8,
          `${b.id}.width = ${widthRatio} * ${a.id}.width`
        ));
      }
    }

    return constraints.slice(0, this.config.maxConstraintsPerPair);
  }

  private detectContainerConstraints(element: ReconstructedElement): SpatialConstraint[] {
    const constraints: SpatialConstraint[] = [];
    const cw = this.config.containerWidth;
    const ch = this.config.containerHeight;

    // Width as ratio of container
    const widthRatio = parseFloat((element.width / cw).toFixed(4));
    if (widthRatio > 0.1 && widthRatio < 1.0) {
      constraints.push(this.createConstraint(
        element.id, 'Container', 'width_ratio', 'width', 'width',
        widthRatio, 'ratio', 0.9,
        `${element.id}.width = ${widthRatio} * Container.width`
      ));
    }

    // Height as ratio of container
    const heightRatio = parseFloat((element.height / ch).toFixed(4));
    if (heightRatio > 0.1 && heightRatio < 1.0) {
      constraints.push(this.createConstraint(
        element.id, 'Container', 'height_ratio', 'height', 'height',
        heightRatio, 'ratio', 0.9,
        `${element.id}.height = ${heightRatio} * Container.height`
      ));
    }

    // Horizontal center alignment with container
    const elementCenterX = element.x + element.width / 2;
    const containerCenterX = cw / 2;
    if (Math.abs(elementCenterX - containerCenterX) <= this.config.alignmentThreshold) {
      constraints.push(this.createConstraint(
        element.id, 'Container', 'center_x_align', 'centerX', 'centerX',
        0, 'px', 0.95,
        `${element.id}.centerX = Container.centerX`
      ));
    }

    return constraints;
  }

  private detectGroupAlignments(elements: ReconstructedElement[]): SpatialConstraint[] {
    const constraints: SpatialConstraint[] = [];

    // Detect rows of equally spaced elements
    const yGroups = new Map<number, ReconstructedElement[]>();
    for (const el of elements) {
      const roundedY = Math.round(el.y / this.config.spacingThreshold) * this.config.spacingThreshold;
      if (!yGroups.has(roundedY)) yGroups.set(roundedY, []);
      yGroups.get(roundedY)!.push(el);
    }

    for (const [, group] of yGroups) {
      if (group.length < 3) continue;
      const sorted = [...group].sort((a, b) => a.x - b.x);
      const gaps: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        gaps.push(sorted[i].x - (sorted[i - 1].x + sorted[i - 1].width));
      }
      const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      const maxDeviation = Math.max(...gaps.map((g) => Math.abs(g - avgGap)));

      if (maxDeviation <= this.config.spacingThreshold) {
        for (let i = 1; i < sorted.length; i++) {
          constraints.push(this.createConstraint(
            sorted[i].id, sorted[i - 1].id, 'equal_spacing', 'left', 'right',
            avgGap, 'px', 0.9,
            `${sorted[i].id}.left = ${sorted[i - 1].id}.right + ${Math.round(avgGap)}px (group)`
          ));
        }
      }
    }

    return constraints;
  }

  private createConstraint(
    sourceId: string, targetId: string,
    relation: ConstraintRelation, property: string, referenceProperty: string,
    value: number, unit: 'px' | 'ratio' | 'percent', confidence: number,
    expression: string,
  ): SpatialConstraint {
    this.constraintCounter++;
    return {
      id: `constraint_${this.constraintCounter}`,
      sourceElementId: sourceId,
      targetElementId: targetId,
      relation,
      property,
      referenceProperty,
      value,
      unit,
      confidence,
      expression,
    };
  }

  private computeMatrixHash(constraints: SpatialConstraint[]): string {
    const normalized = constraints
      .map((c) => `${c.sourceElementId}|${c.targetElementId}|${c.relation}|${c.value}`)
      .sort()
      .join('\n');
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }
}
