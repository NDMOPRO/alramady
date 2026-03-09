/**
 * Replication Service — 7-Layer Model
 * Defines the sequential processing pipeline for visual-structural replication.
 */

export enum ReplicationLayer {
  VISUAL_CAPTURE = 'VISUAL_CAPTURE',
  STRUCTURAL_RECONSTRUCTION = 'STRUCTURAL_RECONSTRUCTION',
  MATHEMATICAL_LAYOUT_GRAPH = 'MATHEMATICAL_LAYOUT_GRAPH',
  CONSTRAINT_MATRIX = 'CONSTRAINT_MATRIX',
  DETERMINISTIC_RENDERER = 'DETERMINISTIC_RENDERER',
  DUAL_FIDELITY_VERIFICATION = 'DUAL_FIDELITY_VERIFICATION',
  BINARY_OUTPUT_LOCK = 'BINARY_OUTPUT_LOCK',
}

/** Bounding box in absolute pixel coordinates */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A single visual element extracted from the source */
export interface VisualElement {
  id: string;
  type: 'text' | 'image' | 'shape' | 'line' | 'group' | 'table' | 'chart';
  bbox: BoundingBox;
  zIndex: number;
  opacity: number;
  rotation: number;
  content: Buffer | string | null;
  style: Record<string, string | number>;
  children: VisualElement[];
  fingerprint: string;
}

/** Spatial relationship between two elements */
export interface SpatialRelation {
  sourceId: string;
  targetId: string;
  relation: 'above' | 'below' | 'left_of' | 'right_of' | 'overlaps' | 'contains' | 'adjacent';
  distance: number;
}

/** A constraint applied to an element or pair of elements */
export interface LayoutConstraint {
  id: string;
  type: 'position' | 'size' | 'alignment' | 'spacing' | 'proportion' | 'anchor';
  targetIds: string[];
  value: number;
  unit: 'px' | 'pt' | 'mm' | 'percent';
  priority: number;
  locked: boolean;
}

// ─── Layer 1: Visual Capture ───────────────────────────────────────

export interface VisualCaptureInput {
  buffer: Buffer;
  format: 'png' | 'jpeg' | 'pdf' | 'pptx' | 'svg';
  dpi: number;
  pageIndex: number;
}

export interface VisualCaptureOutput {
  rasterBuffer: Buffer;
  width: number;
  height: number;
  channels: number;
  dpi: number;
  colorSpace: 'srgb' | 'cmyk';
  rawPixelHash: string;
}

// ─── Layer 2: Structural Reconstruction ────────────────────────────

export interface StructuralReconstructionInput {
  capture: VisualCaptureOutput;
  originalBuffer: Buffer;
  format: string;
}

export interface StructuralReconstructionOutput {
  elements: VisualElement[];
  relations: SpatialRelation[];
  pageWidth: number;
  pageHeight: number;
  structuralHash: string;
}

// ─── Layer 3: Mathematical Layout Graph ────────────────────────────

export interface LayoutNode {
  elementId: string;
  bbox: BoundingBox;
  edges: LayoutEdge[];
}

export interface LayoutEdge {
  targetNodeId: string;
  weight: number;
  relation: SpatialRelation['relation'];
}

export interface MathLayoutGraphInput {
  elements: VisualElement[];
  relations: SpatialRelation[];
  pageWidth: number;
  pageHeight: number;
}

export interface MathLayoutGraphOutput {
  nodes: LayoutNode[];
  adjacencyMatrix: number[][];
  graphHash: string;
}

// ─── Layer 4: Constraint Matrix ────────────────────────────────────

export interface ConstraintMatrixInput {
  graph: MathLayoutGraphOutput;
  elements: VisualElement[];
}

export interface ConstraintMatrixOutput {
  constraints: LayoutConstraint[];
  matrix: number[][];
  deterministic: boolean;
  constraintHash: string;
}

// ─── Layer 5: Deterministic Renderer ───────────────────────────────

export interface DeterministicRenderInput {
  elements: VisualElement[];
  constraints: LayoutConstraint[];
  pageWidth: number;
  pageHeight: number;
}

export interface DeterministicRenderOutput {
  renderedBuffer: Buffer;
  renderHash: string;
  renderWidth: number;
  renderHeight: number;
}

// ─── Layer 6: Dual Fidelity Verification ───────────────────────────

export interface DualFidelityInput {
  originalCapture: VisualCaptureOutput;
  renderedOutput: DeterministicRenderOutput;
  structuralHash: string;
  renderHash: string;
}

export interface DualFidelityOutput {
  pixelDiffPercent: number;
  structuralSimilarity: number;
  passed: boolean;
  details: {
    pixelThresholdMet: boolean;
    structuralThresholdMet: boolean;
    mismatchRegions: BoundingBox[];
  };
}

// ─── Layer 7: Binary Output Lock ───────────────────────────────────

export interface BinaryOutputLockInput {
  renderedBuffer: Buffer;
  renderHash: string;
  structuralHash: string;
  fidelityResult: DualFidelityOutput;
}

export interface BinaryOutputLockOutput {
  lockedBuffer: Buffer;
  lockHash: string;
  immutable: boolean;
  timestamp: number;
  fingerprints: {
    pixel: string;
    structural: string;
    render: string;
    lock: string;
  };
}

/** Ordered list of layers for sequential processing */
export const LAYER_ORDER: ReplicationLayer[] = [
  ReplicationLayer.VISUAL_CAPTURE,
  ReplicationLayer.STRUCTURAL_RECONSTRUCTION,
  ReplicationLayer.MATHEMATICAL_LAYOUT_GRAPH,
  ReplicationLayer.CONSTRAINT_MATRIX,
  ReplicationLayer.DETERMINISTIC_RENDERER,
  ReplicationLayer.DUAL_FIDELITY_VERIFICATION,
  ReplicationLayer.BINARY_OUTPUT_LOCK,
];
