/**
 * replication-engine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete API layer for the Replication Engine (replication-service:8007)
 * Covers all 97 endpoints behind /api/v1/replication/
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { replicationApi } from "./client";
import type { AxiosResponse } from "axios";

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED / BASE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type ReplicationMode =
  | "STRICT_REPLICATION"
  | "PROFESSIONAL_CREATION"
  | "HYBRID";

export type JobStatus =
  | "pending"
  | "analyzing"
  | "replicating"
  | "completed"
  | "failed";

export type TargetFormat =
  | "xlsx"
  | "pptx"
  | "pdf"
  | "html"
  | "docx"
  | "png"
  | "svg";

export type TargetType =
  | "dashboard"
  | "presentation"
  | "report"
  | "spreadsheet";

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ColorInfo {
  hex: string;
  percentage: number;
  name?: string;
}

export interface LayoutElement {
  id: string;
  type: string;
  description: string;
  boundingBox: BoundingBox;
  zIndex?: number;
  styles?: Record<string, string | number>;
  children?: LayoutElement[];
}

export interface FontInfo {
  family: string;
  size: number;
  weight: number;
  style: string;
  color: string;
}

export interface ChartData {
  type: string;
  title: string;
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    color?: string;
  }>;
}

export interface Dimensions {
  width: number;
  height: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface FidelityScore {
  overall: number;
  layout: number;
  colors: number;
  typography: number;
  content: number;
  pixelAccuracy: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE ANALYSIS & EXTRACTION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface AnalysisResult {
  id: string;
  colorPalette: string[];
  dominantColors: ColorInfo[];
  dimensions: Dimensions;
  format: string;
  style: string;
  complexity: "low" | "medium" | "high";
  elements: LayoutElement[];
  fonts: FontInfo[];
  charts: ChartData[];
  textBlocks: Array<{
    text: string;
    boundingBox: BoundingBox;
    font: FontInfo;
    direction: "ltr" | "rtl";
  }>;
  layoutGrid: {
    columns: number;
    rows: number;
    gaps: { horizontal: number; vertical: number };
  };
  metadata: Record<string, unknown>;
}

export interface ColorExtractionResult {
  dominantColors: ColorInfo[];
  palette: string[];
  colorSpace: string;
  histogram: Array<{ range: string; count: number }>;
  gradients: Array<{
    type: "linear" | "radial";
    stops: Array<{ color: string; position: number }>;
    angle?: number;
  }>;
}

export interface TextExtractionResult {
  blocks: Array<{
    text: string;
    confidence: number;
    boundingBox: BoundingBox;
    font: FontInfo;
    direction: "ltr" | "rtl";
    language: string;
  }>;
  fullText: string;
  languages: string[];
}

export interface LayoutExtractionResult {
  grid: {
    columns: number;
    rows: number;
    gaps: { horizontal: number; vertical: number };
  };
  sections: Array<{
    id: string;
    type: string;
    boundingBox: BoundingBox;
    children: string[];
  }>;
  hierarchy: Record<string, string[]>;
  alignment: {
    horizontal: "left" | "center" | "right";
    vertical: "top" | "middle" | "bottom";
  };
}

export interface ChartExtractionResult {
  charts: ChartData[];
  totalCharts: number;
  chartTypes: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE COMPARISON TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ComparisonResult {
  similarity: number;
  differences: Array<{
    region: BoundingBox;
    type: "color" | "layout" | "content" | "typography";
    severity: "low" | "medium" | "high";
    description: string;
  }>;
  overlayImageUrl: string;
  metrics: {
    pixelDifference: number;
    structuralSimilarity: number;
    colorDifference: number;
    layoutDifference: number;
  };
}

export interface SSIMResult {
  score: number;
  map: string;
  regions: Array<{
    boundingBox: BoundingBox;
    localScore: number;
  }>;
}

export interface ScoreResult {
  overall: number;
  breakdown: FidelityScore;
  grade: "A+" | "A" | "B" | "C" | "D" | "F";
  suggestions: string[];
}

export interface DiffReport {
  id: string;
  timestamp: string;
  overallSimilarity: number;
  fidelity: FidelityScore;
  differences: Array<{
    region: BoundingBox;
    type: string;
    severity: string;
    original: string;
    replica: string;
    description: string;
  }>;
  visualDiffUrl: string;
  summary: string;
  recommendations: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPLICATION JOB TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ReplicationJob {
  id: string;
  type: "document" | "dashboard" | "presentation";
  status: JobStatus;
  progress: number;
  mode: ReplicationMode;
  analysis: AnalysisResult;
  targetFormat: TargetFormat;
  resultUrl: string | null;
  fidelityScore: FidelityScore | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ReplicateDocumentRequest {
  analysis: AnalysisResult;
  targetFormat: TargetFormat;
  mode?: ReplicationMode;
  options?: {
    targetWidth?: number;
    targetHeight?: number;
    fidelityTarget?: number;
    preserveFonts?: boolean;
    preserveColors?: boolean;
  };
}

export interface ReplicateDashboardRequest {
  analysis: AnalysisResult;
  mode?: ReplicationMode;
  targetLayout?: {
    columns: number;
    rows: number;
  };
  options?: {
    interactive?: boolean;
    responsive?: boolean;
    theme?: string;
  };
}

export interface ReplicatePresentationRequest {
  analysis: AnalysisResult;
  mode?: ReplicationMode;
  slideCount?: number;
  options?: {
    animations?: boolean;
    transitions?: boolean;
    speakerNotes?: boolean;
  };
}

export interface SuggestionResult {
  jobId: string;
  suggestions: Array<{
    type: string;
    description: string;
    priority: "low" | "medium" | "high";
    autoApplicable: boolean;
    fix?: Record<string, unknown>;
  }>;
}

export interface JobListQuery {
  page?: number;
  limit?: number;
  status?: JobStatus;
}

// ═══════════════════════════════════════════════════════════════════════════════
// OPERATING MODES TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SetModeRequest {
  mode: ReplicationMode;
}

export interface SetModeResponse {
  mode: ReplicationMode;
  previousMode: ReplicationMode;
  activeSince: string;
}

export interface StrictModeSwitches {
  layoutSnapping: boolean;
  autoSpacing: boolean;
  autoHierarchyRebalance: boolean;
  beautification: boolean;
  fontSubstitution: boolean;
  chartBeautification: boolean;
}

export interface StrictConfigRequest {
  pixelDiffThreshold: number;
  structuralHashThreshold: number;
  numericPrecision: number;
  subPixelPrecision: boolean;
}

export interface StrictConfigResponse {
  config: StrictConfigRequest;
  appliedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPTURE & STRUCTURE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CaptureRequest {
  sourceUrl?: string;
  sourceHtml?: string;
  viewport?: Dimensions;
  fullPage?: boolean;
  format?: "png" | "jpeg" | "webp";
  quality?: number;
  selector?: string;
}

export interface CaptureResult {
  imageUrl: string;
  dimensions: Dimensions;
  format: string;
  fileSize: number;
  capturedAt: string;
}

export interface FingerprintRequest {
  elements: LayoutElement[];
}

export interface FingerprintResult {
  hash: string;
  structuralHash: string;
  visualHash: string;
  elementHashes: Array<{
    elementId: string;
    hash: string;
  }>;
}

export interface ExtractStructureRequest {
  file: File;
  fileType: string;
  mode?: ReplicationMode;
}

export interface StructureResult {
  elements: LayoutElement[];
  hierarchy: Record<string, string[]>;
  grid: {
    columns: number;
    rows: number;
    gaps: { horizontal: number; vertical: number };
  };
  metadata: Record<string, unknown>;
}

export interface InferDataStructureRequest {
  elements: LayoutElement[];
}

export interface InferDataStructureResult {
  tables: Array<{
    id: string;
    headers: string[];
    rows: Array<Record<string, string | number>>;
    boundingBox: BoundingBox;
  }>;
  charts: ChartData[];
  keyValuePairs: Array<{
    key: string;
    value: string;
    boundingBox: BoundingBox;
  }>;
  lists: Array<{
    items: string[];
    ordered: boolean;
    boundingBox: BoundingBox;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RECONSTRUCTION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ReconstructExcelRequest {
  analysis: AnalysisResult;
  mode?: ReplicationMode;
  options?: {
    preserveFormulas?: boolean;
    preserveFormatting?: boolean;
    sheetNames?: string[];
  };
}

export interface ReconstructionResult {
  fileUrl: string;
  format: string;
  fidelityScore: FidelityScore;
  warnings: string[];
  metadata: Record<string, unknown>;
}

export interface ToLiveSystemRequest {
  analysis: AnalysisResult;
  mode?: ReplicationMode;
  targetType: TargetType;
  options?: {
    interactive?: boolean;
    dataBindings?: Array<{
      elementId: string;
      dataSource: string;
      field: string;
    }>;
  };
}

export interface LiveSystemResult {
  systemId: string;
  type: TargetType;
  url: string;
  components: Array<{
    id: string;
    type: string;
    props: Record<string, unknown>;
  }>;
  fidelityScore: FidelityScore;
}

export interface ImageToDashboardResult {
  dashboardId: string;
  url: string;
  widgets: Array<{
    id: string;
    type: string;
    position: BoundingBox;
    data: Record<string, unknown>;
  }>;
  fidelityScore: FidelityScore;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSFORM & EXPORT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface TransformRequest {
  source: TargetFormat;
  target: TargetFormat;
  fileId?: string;
  cdrId?: string;
}

export interface TransformResult {
  fileUrl: string;
  sourceFormat: string;
  targetFormat: string;
  fileSize: number;
  transformedAt: string;
}

export interface ExportRequest {
  cdrId: string;
  format: TargetFormat;
  options?: {
    quality?: number;
    resolution?: number;
    includeMetadata?: boolean;
  };
}

export interface ExportResult {
  fileUrl: string;
  format: string;
  fileSize: number;
  exportedAt: string;
}

export interface VisualReplicateRequest {
  file: File;
  targetFormat: TargetFormat;
  mode?: ReplicationMode;
}

export interface VisualReplicateResult {
  resultUrl: string;
  fidelityScore: FidelityScore;
  format: string;
  warnings: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// RTL TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface RTLTransformRequest {
  elements: LayoutElement[];
  direction: "rtl" | "ltr";
  preserveLayout?: boolean;
}

export interface RTLTransformResult {
  elements: LayoutElement[];
  mirrored: boolean;
  adjustments: Array<{
    elementId: string;
    property: string;
    oldValue: string | number;
    newValue: string | number;
  }>;
}

export interface RTLMirrorRequest {
  elements: LayoutElement[];
  containerWidth: number;
  excludeIds?: string[];
}

export interface RTLMirrorResult {
  elements: LayoutElement[];
  mirroredCount: number;
  skippedCount: number;
}

export interface RTLValidateRequest {
  elements: LayoutElement[];
  expectedDirection: "rtl" | "ltr";
}

export interface RTLValidateResult {
  valid: boolean;
  issues: Array<{
    elementId: string;
    issue: string;
    severity: "warning" | "error";
    suggestion: string;
  }>;
  score: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATA BINDING TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface DataBindingRequest {
  cdrId?: string;
  elements: Array<{
    elementId: string;
    dataSource: string;
    field: string;
    transform?: string;
    format?: string;
  }>;
  refreshInterval?: number;
}

export interface DataBindingResult {
  bindingId: string;
  boundElements: number;
  errors: Array<{
    elementId: string;
    error: string;
  }>;
  preview: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CDR MANAGEMENT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CDRBuildRequest {
  analysis: AnalysisResult;
  mode?: ReplicationMode;
  name?: string;
  description?: string;
  tags?: string[];
}

export interface CDR {
  id: string;
  name: string;
  description: string;
  mode: ReplicationMode;
  elements: LayoutElement[];
  styles: Record<string, Record<string, string | number>>;
  dataBindings: Array<{
    elementId: string;
    dataSource: string;
    field: string;
  }>;
  metadata: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CDRSnapshotRequest {
  cdrId: string;
  label?: string;
  description?: string;
}

export interface CDRSnapshot {
  id: string;
  cdrId: string;
  label: string;
  description: string;
  data: CDR;
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFICATION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface VerifyRequest {
  originalAnalysis: AnalysisResult;
  replicaAnalysis: AnalysisResult;
  thresholds?: {
    layout?: number;
    color?: number;
    typography?: number;
    content?: number;
  };
}

export interface VerifyResult {
  passed: boolean;
  fidelityScore: FidelityScore;
  failures: Array<{
    category: string;
    expected: number;
    actual: number;
    threshold: number;
  }>;
  details: Record<string, unknown>;
}

export interface DriftReport {
  drifts: Array<{
    jobId: string;
    originalScore: number;
    currentScore: number;
    drift: number;
    detectedAt: string;
  }>;
  totalDrifts: number;
  averageDrift: number;
}

export interface RoundTripValidateRequest {
  fileUrl: string;
  format: TargetFormat;
  mode?: ReplicationMode;
  maxIterations?: number;
}

export interface RoundTripValidateResult {
  iterations: number;
  initialScore: number;
  finalScore: number;
  degradation: number;
  passed: boolean;
  iterationResults: Array<{
    iteration: number;
    score: number;
    delta: number;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYOUT LOCKING TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface LayoutLockRequest {
  cdrId: string;
  elementIds?: string[];
  lockAll?: boolean;
  properties?: Array<"position" | "size" | "style" | "content">;
}

export interface LayoutLockResult {
  locked: boolean;
  lockedElements: string[];
  lockedProperties: string[];
  lockedAt: string;
}

export interface LayoutUnlockRequest {
  cdrId: string;
  elementIds?: string[];
  unlockAll?: boolean;
}

export interface LayoutUnlockResult {
  unlocked: boolean;
  unlockedElements: string[];
  unlockedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// XLSX TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface XLSXStructureResult {
  sheets: Array<{
    name: string;
    dimensions: { rows: number; columns: number };
    mergedCells: Array<{ start: string; end: string }>;
    charts: ChartData[];
    tables: Array<{
      name: string;
      range: string;
      headers: string[];
      rowCount: number;
    }>;
    conditionalFormatting: Array<{
      range: string;
      type: string;
      rules: Record<string, unknown>[];
    }>;
  }>;
  namedRanges: Array<{ name: string; range: string; sheet: string }>;
  styles: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface XLSXValidateRequest {
  originalStructure: XLSXStructureResult;
  replicaStructure: XLSXStructureResult;
  thresholds?: {
    cellAccuracy?: number;
    formulaAccuracy?: number;
    styleAccuracy?: number;
  };
}

export interface XLSXValidateResult {
  valid: boolean;
  score: FidelityScore;
  cellDifferences: Array<{
    cell: string;
    sheet: string;
    original: string;
    replica: string;
  }>;
  styleDifferences: Array<{
    range: string;
    property: string;
    original: string;
    replica: string;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PPTX TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface PPTXStructureResult {
  slides: Array<{
    index: number;
    layout: string;
    elements: LayoutElement[];
    notes: string;
    transitions: Record<string, unknown>;
    animations: Array<{
      elementId: string;
      type: string;
      duration: number;
      delay: number;
    }>;
  }>;
  masterSlides: Array<{
    name: string;
    elements: LayoutElement[];
  }>;
  theme: {
    colors: Record<string, string>;
    fonts: Record<string, string>;
  };
  metadata: Record<string, unknown>;
}

export interface PPTXValidateRequest {
  originalStructure: PPTXStructureResult;
  replicaStructure: PPTXStructureResult;
  thresholds?: {
    layoutAccuracy?: number;
    contentAccuracy?: number;
    styleAccuracy?: number;
  };
}

export interface PPTXValidateResult {
  valid: boolean;
  score: FidelityScore;
  slideDifferences: Array<{
    slideIndex: number;
    differences: Array<{
      elementId: string;
      property: string;
      original: string;
      replica: string;
    }>;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SRC ENFORCEMENT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SRCEnforceRequest {
  cdrId: string;
  rules: Array<{
    type: "layout" | "color" | "typography" | "spacing" | "alignment";
    target: string;
    constraint: Record<string, unknown>;
    priority: number;
  }>;
  mode?: ReplicationMode;
}

export interface SRCEnforceResult {
  enforced: boolean;
  appliedRules: number;
  violations: Array<{
    rule: string;
    element: string;
    expected: string;
    actual: string;
    autoFixed: boolean;
  }>;
  resultCdrId: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHART DATA TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ChartExtractRequest {
  imageUrl?: string;
  elements?: LayoutElement[];
  cdrId?: string;
}

export interface ChartExtractResult {
  charts: Array<
    ChartData & {
      boundingBox: BoundingBox;
      confidence: number;
      rawDataUrl?: string;
    }
  >;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VISUAL REPLICATION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface VisualReplicationAnalyzeResult {
  analysis: AnalysisResult;
  visualFingerprint: string;
  complexity: "low" | "medium" | "high" | "extreme";
  estimatedTime: number;
  requiredCapabilities: string[];
}

export interface VisualReplicationReconstructRequest {
  analysis: AnalysisResult;
  mode?: ReplicationMode;
  options?: {
    interactive?: boolean;
    responsive?: boolean;
    dataBindable?: boolean;
    theme?: string;
  };
}

export interface VisualReplicationReconstructResult {
  id: string;
  type: string;
  url: string;
  components: Array<{
    id: string;
    type: string;
    props: Record<string, unknown>;
    position: BoundingBox;
  }>;
  fidelityScore: FidelityScore;
  warnings: string[];
}

export interface VisualReplicationCompareResult {
  similarity: number;
  fidelity: FidelityScore;
  pixelDiff: number;
  structuralDiff: number;
  visualDiffUrl: string;
  passed: boolean;
}

export interface VisualReplicationFingerprintRequest {
  elements: LayoutElement[];
  includeStyles?: boolean;
  algorithm?: "perceptual" | "structural" | "hybrid";
}

export interface VisualReplicationFingerprintResult {
  fingerprint: string;
  algorithm: string;
  components: Array<{
    elementId: string;
    hash: string;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CANONICAL PIPELINE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface PipelineExecuteRequest {
  sourceFile?: string;
  sourceUrl?: string;
  cdrId?: string;
  steps: Array<{
    type: string;
    config: Record<string, unknown>;
  }>;
  targetFormat: TargetFormat;
  mode?: ReplicationMode;
}

export interface PipelineExecuteResult {
  pipelineId: string;
  status: JobStatus;
  steps: Array<{
    type: string;
    status: "pending" | "running" | "completed" | "failed";
    result?: Record<string, unknown>;
    error?: string;
    duration?: number;
  }>;
  resultUrl: string | null;
  fidelityScore: FidelityScore | null;
}

export interface PipelineGenerator {
  id: string;
  name: string;
  description: string;
  inputTypes: string[];
  outputTypes: string[];
  capabilities: string[];
  version: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PIXEL VALIDATION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface PixelCompareResult {
  similarity: number;
  diffPixels: number;
  totalPixels: number;
  diffPercentage: number;
  diffImageUrl: string;
  hotspots: Array<{
    region: BoundingBox;
    diffIntensity: number;
  }>;
}

export interface PixelValidateLoopResult {
  iterations: number;
  converged: boolean;
  finalScore: number;
  history: Array<{
    iteration: number;
    score: number;
    adjustments: string[];
  }>;
  resultUrl: string;
}

export interface QualityValidateRequest {
  cdrId?: string;
  jobId?: string;
  checks: Array<
    | "pixel"
    | "layout"
    | "color"
    | "typography"
    | "content"
    | "accessibility"
    | "rtl"
  >;
  thresholds?: Record<string, number>;
}

export interface QualityValidateResult {
  passed: boolean;
  overallScore: number;
  checks: Array<{
    type: string;
    passed: boolean;
    score: number;
    issues: Array<{
      description: string;
      severity: "info" | "warning" | "error";
      location?: BoundingBox;
    }>;
  }>;
}

export interface FontRecognizeResult {
  fonts: Array<{
    family: string;
    confidence: number;
    weight: number;
    style: string;
    size: number;
    regions: BoundingBox[];
    alternatives: Array<{
      family: string;
      similarity: number;
    }>;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GENERATE FROM LAYOUT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface GenerateFromLayoutRequest {
  layout: {
    elements: LayoutElement[];
    grid?: { columns: number; rows: number };
    dimensions: Dimensions;
  };
  targetFormat: TargetFormat;
  mode?: ReplicationMode;
  generator?: string;
  dataBindings?: Array<{
    elementId: string;
    dataSource: string;
    field: string;
  }>;
}

export interface GenerateFromLayoutResult {
  fileUrl: string;
  format: string;
  fidelityScore: FidelityScore;
  generatorUsed: string;
  warnings: string[];
}

export interface GenerateFromLayoutGenerator {
  id: string;
  name: string;
  description: string;
  supportedFormats: TargetFormat[];
  capabilities: string[];
}

export interface ExtractDataFromLayoutRequest {
  elements: LayoutElement[];
  dataTypes?: Array<"table" | "chart" | "kpi" | "text" | "list">;
}

export interface ExtractDataFromLayoutResult {
  extractedData: Array<{
    type: string;
    elementId: string;
    data: Record<string, unknown>;
    confidence: number;
  }>;
}

export interface BindableNodesRequest {
  elements: LayoutElement[];
  dataSchema?: Record<string, unknown>;
}

export interface BindableNodesResult {
  nodes: Array<{
    elementId: string;
    type: string;
    currentValue: string | number | null;
    suggestedBindings: Array<{
      dataSource: string;
      field: string;
      confidence: number;
    }>;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADVANCED TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface LargeImageProcessResult {
  tiles: Array<{
    index: number;
    boundingBox: BoundingBox;
    analysisUrl: string;
  }>;
  combinedAnalysis: AnalysisResult;
  originalDimensions: Dimensions;
  processingTime: number;
}

export interface LargeImageCheckResult {
  isLargeImage: boolean;
  dimensions: Dimensions;
  fileSize: number;
  recommendedTileSize: number;
  estimatedTiles: number;
  estimatedProcessingTime: number;
}

export interface LargeImageMultiScaleResult {
  scales: Array<{
    scale: number;
    dimensions: Dimensions;
    analysis: AnalysisResult;
  }>;
  mergedAnalysis: AnalysisResult;
}

export interface PDFProcessResult {
  pages: Array<{
    index: number;
    analysis: AnalysisResult;
    text: string;
    dimensions: Dimensions;
  }>;
  totalPages: number;
  metadata: Record<string, unknown>;
}

export interface PDFToLayoutGraphResult {
  pages: Array<{
    index: number;
    elements: LayoutElement[];
    connections: Array<{
      from: string;
      to: string;
      type: string;
    }>;
  }>;
  globalStyles: Record<string, Record<string, string | number>>;
}

export interface LocalizeArabicRequest {
  elements: LayoutElement[];
  textBlocks: Array<{
    elementId: string;
    text: string;
    language: string;
  }>;
  mirrorLayout?: boolean;
  preserveNumbers?: boolean;
}

export interface LocalizeArabicResult {
  elements: LayoutElement[];
  translatedBlocks: Array<{
    elementId: string;
    originalText: string;
    translatedText: string;
    direction: "rtl";
  }>;
  layoutAdjustments: Array<{
    elementId: string;
    adjustment: string;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRUD ENTITY TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CorePrinciple {
  id: string;
  name: string;
  description: string;
  category: string;
  priority: number;
  rules: Array<{
    type: string;
    constraint: Record<string, unknown>;
  }>;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CorePrincipleCreateRequest {
  name: string;
  description: string;
  category: string;
  priority: number;
  rules: Array<{
    type: string;
    constraint: Record<string, unknown>;
  }>;
  active?: boolean;
}

export interface DualVerify {
  id: string;
  name: string;
  description: string;
  primaryMethod: string;
  secondaryMethod: string;
  threshold: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DualVerifyCreateRequest {
  name: string;
  description: string;
  primaryMethod: string;
  secondaryMethod: string;
  threshold: number;
  active?: boolean;
}

export interface ImageMatching {
  id: string;
  name: string;
  algorithm: string;
  threshold: number;
  config: Record<string, unknown>;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ImageMatchingCreateRequest {
  name: string;
  algorithm: string;
  threshold: number;
  config: Record<string, unknown>;
  active?: boolean;
}

export interface MatchPhase {
  id: string;
  name: string;
  order: number;
  description: string;
  steps: Array<{
    name: string;
    action: string;
    config: Record<string, unknown>;
  }>;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MatchPhaseCreateRequest {
  name: string;
  order: number;
  description: string;
  steps: Array<{
    name: string;
    action: string;
    config: Record<string, unknown>;
  }>;
  active?: boolean;
}

export interface MatchScope {
  id: string;
  name: string;
  description: string;
  includes: string[];
  excludes: string[];
  depth: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MatchScopeCreateRequest {
  name: string;
  description: string;
  includes: string[];
  excludes: string[];
  depth: number;
  active?: boolean;
}

export interface PrintLock {
  id: string;
  name: string;
  description: string;
  targetId: string;
  targetType: string;
  lockedProperties: string[];
  lockedBy: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PrintLockCreateRequest {
  name: string;
  description: string;
  targetId: string;
  targetType: string;
  lockedProperties: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const UPLOAD_TIMEOUT = 120_000;

function multipartConfig(timeout: number = UPLOAD_TIMEOUT) {
  return {
    headers: { "Content-Type": "multipart/form-data" },
    timeout,
  };
}

function buildFileForm(file: File, extraFields?: Record<string, string>, fieldName?: string): FormData {
  const form = new FormData();
  form.append(fieldName ?? "image", file);
  if (extraFields) {
    for (const [key, value] of Object.entries(extraFields)) {
      form.append(key, value);
    }
  }
  return form;
}

function buildTwoFileForm(
  original: File,
  replica: File,
  extraFields?: Record<string, string>
): FormData {
  const form = new FormData();
  form.append("original", original);
  form.append("replica", replica);
  if (extraFields) {
    for (const [key, value] of Object.entries(extraFields)) {
      form.append(key, value);
    }
  }
  return form;
}

function unwrap<T>(response: AxiosResponse<ApiResponse<T>>): T {
  return response.data.data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. IMAGE ANALYSIS & EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

export async function analyzeImage(file: File): Promise<AnalysisResult> {
  const form = buildFileForm(file);
  const res = await replicationApi.post<ApiResponse<AnalysisResult>>(
    "/analyze",
    form,
    multipartConfig()
  );
  return unwrap(res);
}

export async function extractColors(file: File): Promise<ColorExtractionResult> {
  const form = buildFileForm(file);
  const res = await replicationApi.post<ApiResponse<ColorExtractionResult>>(
    "/extract/colors",
    form,
    multipartConfig()
  );
  return unwrap(res);
}

export async function extractText(file: File): Promise<TextExtractionResult> {
  const form = buildFileForm(file);
  const res = await replicationApi.post<ApiResponse<TextExtractionResult>>(
    "/extract/text",
    form,
    multipartConfig()
  );
  return unwrap(res);
}

export async function extractLayout(file: File): Promise<LayoutExtractionResult> {
  const form = buildFileForm(file);
  const res = await replicationApi.post<ApiResponse<LayoutExtractionResult>>(
    "/extract/layout",
    form,
    multipartConfig()
  );
  return unwrap(res);
}

export async function extractCharts(file: File): Promise<ChartExtractionResult> {
  const form = buildFileForm(file);
  const res = await replicationApi.post<ApiResponse<ChartExtractionResult>>(
    "/extract/charts",
    form,
    multipartConfig()
  );
  return unwrap(res);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. IMAGE COMPARISON
// ═══════════════════════════════════════════════════════════════════════════════

export async function compareImages(
  original: File,
  replica: File
): Promise<ComparisonResult> {
  const form = buildTwoFileForm(original, replica);
  const res = await replicationApi.post<ApiResponse<ComparisonResult>>(
    "/compare",
    form,
    multipartConfig()
  );
  return unwrap(res);
}

export async function computeSSIM(
  original: File,
  replica: File
): Promise<SSIMResult> {
  const form = buildTwoFileForm(original, replica);
  const res = await replicationApi.post<ApiResponse<SSIMResult>>(
    "/ssim",
    form,
    multipartConfig()
  );
  return unwrap(res);
}

export async function computeScore(
  original: File,
  replica: File
): Promise<ScoreResult> {
  const form = buildTwoFileForm(original, replica);
  const res = await replicationApi.post<ApiResponse<ScoreResult>>(
    "/score",
    form,
    multipartConfig()
  );
  return unwrap(res);
}

export async function generateDiffReport(
  original: File,
  replica: File
): Promise<DiffReport> {
  const form = buildTwoFileForm(original, replica);
  const res = await replicationApi.post<ApiResponse<DiffReport>>(
    "/diff-report",
    form,
    multipartConfig()
  );
  return unwrap(res);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. REPLICATION JOBS
// ═══════════════════════════════════════════════════════════════════════════════

export async function replicateDocument(
  payload: ReplicateDocumentRequest
): Promise<ReplicationJob> {
  const res = await replicationApi.post<ApiResponse<ReplicationJob>>(
    "/replicate/document",
    payload
  );
  return unwrap(res);
}

export async function replicateDashboard(
  payload: ReplicateDashboardRequest
): Promise<ReplicationJob> {
  const res = await replicationApi.post<ApiResponse<ReplicationJob>>(
    "/replicate/dashboard",
    payload
  );
  return unwrap(res);
}

export async function replicatePresentation(
  payload: ReplicatePresentationRequest
): Promise<ReplicationJob> {
  const res = await replicationApi.post<ApiResponse<ReplicationJob>>(
    "/replicate/presentation",
    payload
  );
  return unwrap(res);
}

export async function getSuggestions(jobId: string): Promise<SuggestionResult> {
  const res = await replicationApi.get<ApiResponse<SuggestionResult>>(
    `/suggest/${jobId}`
  );
  return unwrap(res);
}

export async function listJobs(
  query?: JobListQuery
): Promise<PaginatedResponse<ReplicationJob>> {
  const res = await replicationApi.get<PaginatedResponse<ReplicationJob>>(
    "/jobs",
    { params: query }
  );
  return res.data;
}

export async function getJob(jobId: string): Promise<ReplicationJob> {
  const res = await replicationApi.get<ApiResponse<ReplicationJob>>(
    `/jobs/${jobId}`
  );
  return unwrap(res);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. OPERATING MODES
// ═══════════════════════════════════════════════════════════════════════════════

export async function setMode(
  payload: SetModeRequest
): Promise<SetModeResponse> {
  const res = await replicationApi.put<ApiResponse<SetModeResponse>>(
    "/mode",
    payload
  );
  return unwrap(res);
}

export async function setStrictMode(
  switches: StrictModeSwitches
): Promise<ApiResponse<StrictModeSwitches>> {
  const res = await replicationApi.put<ApiResponse<StrictModeSwitches>>(
    "/strict-mode",
    switches
  );
  return res.data;
}

export async function setStrictConfig(
  config: StrictConfigRequest
): Promise<StrictConfigResponse> {
  const res = await replicationApi.post<ApiResponse<StrictConfigResponse>>(
    "/strict-config",
    config
  );
  return unwrap(res);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. CAPTURE & STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════════

export async function capture(
  payload: CaptureRequest
): Promise<CaptureResult> {
  const res = await replicationApi.post<ApiResponse<CaptureResult>>(
    "/capture",
    payload
  );
  return unwrap(res);
}

export async function fingerprint(
  payload: FingerprintRequest
): Promise<FingerprintResult> {
  const res = await replicationApi.post<ApiResponse<FingerprintResult>>(
    "/fingerprint",
    payload
  );
  return unwrap(res);
}

export async function extractStructure(
  file: File,
  fileType: string,
  mode?: ReplicationMode
): Promise<StructureResult> {
  const fields: Record<string, string> = { fileType };
  if (mode) fields.mode = mode;
  const form = buildFileForm(file, fields);
  const res = await replicationApi.post<ApiResponse<StructureResult>>(
    "/extract-structure",
    form,
    multipartConfig()
  );
  return unwrap(res);
}

export async function inferDataStructure(
  payload: InferDataStructureRequest
): Promise<InferDataStructureResult> {
  const res = await replicationApi.post<ApiResponse<InferDataStructureResult>>(
    "/infer-data-structure",
    payload
  );
  return unwrap(res);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. RECONSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════════

export async function reconstructExcel(
  payload: ReconstructExcelRequest
): Promise<ReconstructionResult> {
  const res = await replicationApi.post<ApiResponse<ReconstructionResult>>(
    "/reconstruct/excel",
    payload
  );
  return unwrap(res);
}

export async function toLiveSystem(
  payload: ToLiveSystemRequest
): Promise<LiveSystemResult> {
  const res = await replicationApi.post<ApiResponse<LiveSystemResult>>(
    "/to-live-system",
    payload
  );
  return unwrap(res);
}

export async function imageToDashboard(
  file: File
): Promise<ImageToDashboardResult> {
  const form = buildFileForm(file);
  const res = await replicationApi.post<ApiResponse<ImageToDashboardResult>>(
    "/image-to-dashboard",
    form,
    multipartConfig()
  );
  return unwrap(res);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. TRANSFORM & EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export async function transform(
  payload: TransformRequest
): Promise<TransformResult> {
  const res = await replicationApi.post<ApiResponse<TransformResult>>(
    "/transform",
    payload
  );
  return unwrap(res);
}

export async function exportCDR(
  payload: ExportRequest
): Promise<ExportResult> {
  const res = await replicationApi.post<ApiResponse<ExportResult>>(
    "/export",
    payload
  );
  return unwrap(res);
}

export async function visualReplicate(
  file: File,
  targetFormat: TargetFormat,
  mode?: ReplicationMode
): Promise<VisualReplicateResult> {
  const fields: Record<string, string> = { targetFormat };
  if (mode) fields.mode = mode;
  const form = buildFileForm(file, fields);
  const res = await replicationApi.post<ApiResponse<VisualReplicateResult>>(
    "/visual-replicate",
    form,
    multipartConfig()
  );
  return unwrap(res);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. RTL
// ═══════════════════════════════════════════════════════════════════════════════

export async function rtlTransform(
  payload: RTLTransformRequest
): Promise<RTLTransformResult> {
  const res = await replicationApi.post<ApiResponse<RTLTransformResult>>(
    "/rtl-transform",
    payload
  );
  return unwrap(res);
}

export async function rtlMirror(
  payload: RTLMirrorRequest
): Promise<RTLMirrorResult> {
  const res = await replicationApi.post<ApiResponse<RTLMirrorResult>>(
    "/rtl/mirror",
    payload
  );
  return unwrap(res);
}

export async function rtlValidate(
  payload: RTLValidateRequest
): Promise<RTLValidateResult> {
  const res = await replicationApi.post<ApiResponse<RTLValidateResult>>(
    "/rtl/validate",
    payload
  );
  return unwrap(res);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. DATA BINDING
// ═══════════════════════════════════════════════════════════════════════════════

export async function bindData(
  payload: DataBindingRequest
): Promise<DataBindingResult> {
  const res = await replicationApi.post<ApiResponse<DataBindingResult>>(
    "/bind-data",
    payload
  );
  return unwrap(res);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. CDR MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

export async function buildCDR(payload: CDRBuildRequest): Promise<CDR> {
  const res = await replicationApi.post<ApiResponse<CDR>>("/cdr/build", payload);
  return unwrap(res);
}

export async function getCDR(cdrId: string): Promise<CDR> {
  const res = await replicationApi.get<ApiResponse<CDR>>(`/cdr/${cdrId}`);
  return unwrap(res);
}

export async function snapshotCDR(
  payload: CDRSnapshotRequest
): Promise<CDRSnapshot> {
  const res = await replicationApi.post<ApiResponse<CDRSnapshot>>(
    "/cdr/snapshot",
    payload
  );
  return unwrap(res);
}

export async function getCDRSnapshots(cdrId: string): Promise<CDRSnapshot[]> {
  const res = await replicationApi.get<ApiResponse<CDRSnapshot[]>>(
    `/cdr/snapshots/${cdrId}`
  );
  return unwrap(res);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 11. VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

export async function verify(
  payload: VerifyRequest
): Promise<VerifyResult> {
  const res = await replicationApi.post<ApiResponse<VerifyResult>>(
    "/verify",
    payload
  );
  return unwrap(res);
}

export async function getFidelityScore(
  jobId: string
): Promise<FidelityScore> {
  const res = await replicationApi.get<ApiResponse<FidelityScore>>(
    `/fidelity-score/${jobId}`
  );
  return unwrap(res);
}

export async function getDriftReport(): Promise<DriftReport> {
  const res = await replicationApi.get<ApiResponse<DriftReport>>(
    "/drift-report"
  );
  return unwrap(res);
}

export async function roundTripValidate(
  payload: RoundTripValidateRequest
): Promise<RoundTripValidateResult> {
  const res = await replicationApi.post<ApiResponse<RoundTripValidateResult>>(
    "/round-trip-validate",
    payload
  );
  return unwrap(res);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 12. LAYOUT LOCKING
// ═══════════════════════════════════════════════════════════════════════════════

export async function lockLayout(
  payload: LayoutLockRequest
): Promise<LayoutLockResult> {
  const res = await replicationApi.post<ApiResponse<LayoutLockResult>>(
    "/lock-layout",
    payload
  );
  return unwrap(res);
}

export async function unlockLayout(
  payload: LayoutUnlockRequest
): Promise<LayoutUnlockResult> {
  const res = await replicationApi.post<ApiResponse<LayoutUnlockResult>>(
    "/unlock-layout",
    payload
  );
  return unwrap(res);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 13. XLSX
// ═══════════════════════════════════════════════════════════════════════════════

export async function xlsxExtractStructure(
  file: File
): Promise<XLSXStructureResult> {
  const form = buildFileForm(file);
  const res = await replicationApi.post<ApiResponse<XLSXStructureResult>>(
    "/xlsx/extract-structure",
    form,
    multipartConfig()
  );
  return unwrap(res);
}

export async function xlsxValidate(
  payload: XLSXValidateRequest
): Promise<XLSXValidateResult> {
  const res = await replicationApi.post<ApiResponse<XLSXValidateResult>>(
    "/xlsx/validate",
    payload
  );
  return unwrap(res);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 14. PPTX
// ═══════════════════════════════════════════════════════════════════════════════

export async function pptxExtractStructure(
  file: File
): Promise<PPTXStructureResult> {
  const form = buildFileForm(file);
  const res = await replicationApi.post<ApiResponse<PPTXStructureResult>>(
    "/pptx/extract-structure",
    form,
    multipartConfig()
  );
  return unwrap(res);
}

export async function pptxValidate(
  payload: PPTXValidateRequest
): Promise<PPTXValidateResult> {
  const res = await replicationApi.post<ApiResponse<PPTXValidateResult>>(
    "/pptx/validate",
    payload
  );
  return unwrap(res);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 15. SRC ENFORCEMENT
// ═══════════════════════════════════════════════════════════════════════════════

export async function srcEnforce(
  payload: SRCEnforceRequest
): Promise<SRCEnforceResult> {
  const res = await replicationApi.post<ApiResponse<SRCEnforceResult>>(
    "/src/enforce",
    payload
  );
  return unwrap(res);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 16. CHART DATA
// ═══════════════════════════════════════════════════════════════════════════════

export async function chartExtract(
  payload: ChartExtractRequest
): Promise<ChartExtractResult> {
  const res = await replicationApi.post<ApiResponse<ChartExtractResult>>(
    "/chart/extract",
    payload
  );
  return unwrap(res);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 17. VISUAL REPLICATION
// ═══════════════════════════════════════════════════════════════════════════════

export async function visualReplicationAnalyze(
  file: File
): Promise<VisualReplicationAnalyzeResult> {
  const form = buildFileForm(file);
  const res = await replicationApi.post<
    ApiResponse<VisualReplicationAnalyzeResult>
  >("/visual-replication/analyze", form, multipartConfig());
  return unwrap(res);
}

export async function visualReplicationReconstructDashboard(
  file: File
): Promise<VisualReplicationReconstructResult> {
  const form = buildFileForm(file);
  const res = await replicationApi.post<
    ApiResponse<VisualReplicationReconstructResult>
  >("/visual-replication/reconstruct/dashboard", form, multipartConfig());
  return unwrap(res);
}

export async function visualReplicationReconstructPresentation(
  files: File[]
): Promise<VisualReplicationReconstructResult> {
  const form = new FormData();
  files.forEach((f) => form.append("images", f));
  const res = await replicationApi.post<
    ApiResponse<VisualReplicationReconstructResult>
  >("/visual-replication/reconstruct/presentation", form, multipartConfig());
  return unwrap(res);
}

export async function visualReplicationReconstructReport(
  files: File[]
): Promise<VisualReplicationReconstructResult> {
  const form = new FormData();
  files.forEach((f) => form.append("images", f));
  const res = await replicationApi.post<
    ApiResponse<VisualReplicationReconstructResult>
  >("/visual-replication/reconstruct/report", form, multipartConfig());
  return unwrap(res);
}

export async function visualReplicationCompare(
  original: File,
  replica: File
): Promise<VisualReplicationCompareResult> {
  const form = new FormData();
  form.append("original", original);
  form.append("reconstructed", replica);
  const res = await replicationApi.post<
    ApiResponse<VisualReplicationCompareResult>
  >("/visual-replication/compare", form, multipartConfig());
  return unwrap(res);
}

export async function visualReplicationFingerprint(
  payload: VisualReplicationFingerprintRequest
): Promise<VisualReplicationFingerprintResult> {
  const res = await replicationApi.post<
    ApiResponse<VisualReplicationFingerprintResult>
  >("/visual-replication/fingerprint", payload);
  return unwrap(res);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 18. CANONICAL PIPELINE
// ═══════════════════════════════════════════════════════════════════════════════

export async function executePipeline(
  payload: PipelineExecuteRequest
): Promise<PipelineExecuteResult> {
  const res = await replicationApi.post<ApiResponse<PipelineExecuteResult>>(
    "/pipeline/execute",
    payload
  );
  return unwrap(res);
}

export async function getPipelineGenerators(): Promise<PipelineGenerator[]> {
  const res = await replicationApi.get<ApiResponse<PipelineGenerator[]>>(
    "/pipeline/generators"
  );
  return unwrap(res);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 19. PIXEL VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

export async function pixelCompare(
  original: File,
  replica: File
): Promise<PixelCompareResult> {
  const form = new FormData();
  form.append("source", original);
  form.append("generated", replica);
  const res = await replicationApi.post<ApiResponse<PixelCompareResult>>(
    "/pixel/compare",
    form,
    multipartConfig()
  );
  return unwrap(res);
}

export async function pixelValidateLoop(
  source: File,
  generated: File
): Promise<PixelValidateLoopResult> {
  const form = new FormData();
  form.append("source", source);
  form.append("generated", generated);
  const res = await replicationApi.post<ApiResponse<PixelValidateLoopResult>>(
    "/pixel/validate-loop",
    form,
    multipartConfig()
  );
  return unwrap(res);
}

export async function qualityValidate(
  payload: QualityValidateRequest
): Promise<QualityValidateResult> {
  const res = await replicationApi.post<ApiResponse<QualityValidateResult>>(
    "/quality/validate",
    payload
  );
  return unwrap(res);
}

export async function recognizeFonts(
  file: File
): Promise<FontRecognizeResult> {
  const form = buildFileForm(file);
  const res = await replicationApi.post<ApiResponse<FontRecognizeResult>>(
    "/fonts/recognize",
    form,
    multipartConfig()
  );
  return unwrap(res);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 20. GENERATE FROM LAYOUT
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateFromLayout(
  payload: GenerateFromLayoutRequest
): Promise<GenerateFromLayoutResult> {
  const res = await replicationApi.post<ApiResponse<GenerateFromLayoutResult>>(
    "/generate-from-layout",
    payload
  );
  return unwrap(res);
}

export async function generateFromLayoutUpload(
  file: File
): Promise<GenerateFromLayoutResult> {
  const form = buildFileForm(file, undefined, "file");
  const res = await replicationApi.post<ApiResponse<GenerateFromLayoutResult>>(
    "/generate-from-layout/upload",
    form,
    multipartConfig()
  );
  return unwrap(res);
}

export async function getGenerateFromLayoutGenerators(): Promise<
  GenerateFromLayoutGenerator[]
> {
  const res = await replicationApi.get<
    ApiResponse<GenerateFromLayoutGenerator[]>
  >("/generate-from-layout/generators");
  return unwrap(res);
}

export async function extractDataFromLayout(
  payload: ExtractDataFromLayoutRequest
): Promise<ExtractDataFromLayoutResult> {
  const res = await replicationApi.post<
    ApiResponse<ExtractDataFromLayoutResult>
  >("/generate-from-layout/extract-data", payload);
  return unwrap(res);
}

export async function getBindableNodes(
  payload: BindableNodesRequest
): Promise<BindableNodesResult> {
  const res = await replicationApi.post<ApiResponse<BindableNodesResult>>(
    "/generate-from-layout/bindable-nodes",
    payload
  );
  return unwrap(res);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 21. ADVANCED
// ═══════════════════════════════════════════════════════════════════════════════

export async function processLargeImage(
  file: File
): Promise<LargeImageProcessResult> {
  const form = buildFileForm(file);
  const res = await replicationApi.post<ApiResponse<LargeImageProcessResult>>(
    "/large-image/process",
    form,
    multipartConfig()
  );
  return unwrap(res);
}

export async function checkLargeImage(
  file: File
): Promise<LargeImageCheckResult> {
  const form = buildFileForm(file);
  const res = await replicationApi.post<ApiResponse<LargeImageCheckResult>>(
    "/large-image/check",
    form,
    multipartConfig()
  );
  return unwrap(res);
}

export async function multiScaleLargeImage(
  file: File
): Promise<LargeImageMultiScaleResult> {
  const form = buildFileForm(file);
  const res = await replicationApi.post<
    ApiResponse<LargeImageMultiScaleResult>
  >("/large-image/multi-scale", form, multipartConfig());
  return unwrap(res);
}

export async function processPDF(file: File): Promise<PDFProcessResult> {
  const form = buildFileForm(file, undefined, "pdf");
  const res = await replicationApi.post<ApiResponse<PDFProcessResult>>(
    "/pdf/process",
    form,
    multipartConfig()
  );
  return unwrap(res);
}

export async function pdfToLayoutGraph(
  file: File
): Promise<PDFToLayoutGraphResult> {
  const form = buildFileForm(file, undefined, "pdf");
  const res = await replicationApi.post<ApiResponse<PDFToLayoutGraphResult>>(
    "/pdf/to-layout-graph",
    form,
    multipartConfig()
  );
  return unwrap(res);
}

export async function localizeArabic(
  payload: LocalizeArabicRequest
): Promise<LocalizeArabicResult> {
  const res = await replicationApi.post<ApiResponse<LocalizeArabicResult>>(
    "/localize/arabic",
    payload
  );
  return unwrap(res);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 22. CRUD ENTITIES — Generic factory + typed exports
// ═══════════════════════════════════════════════════════════════════════════════

interface CrudApi<T, TCreate> {
  list(): Promise<T[]>;
  getById(id: string): Promise<T>;
  create(payload: TCreate): Promise<T>;
  update(id: string, payload: Partial<TCreate>): Promise<T>;
  remove(id: string): Promise<void>;
}

function createCrudApi<T, TCreate>(basePath: string): CrudApi<T, TCreate> {
  return {
    async list(): Promise<T[]> {
      const res = await replicationApi.get<ApiResponse<T[]>>(basePath);
      return unwrap(res);
    },
    async getById(id: string): Promise<T> {
      const res = await replicationApi.get<ApiResponse<T>>(
        `${basePath}/${id}`
      );
      return unwrap(res);
    },
    async create(payload: TCreate): Promise<T> {
      const res = await replicationApi.post<ApiResponse<T>>(basePath, payload);
      return unwrap(res);
    },
    async update(id: string, payload: Partial<TCreate>): Promise<T> {
      const res = await replicationApi.put<ApiResponse<T>>(
        `${basePath}/${id}`,
        payload
      );
      return unwrap(res);
    },
    async remove(id: string): Promise<void> {
      await replicationApi.delete(`${basePath}/${id}`);
    },
  };
}

export const corePrincipleApi: CrudApi<CorePrinciple, CorePrincipleCreateRequest> =
  createCrudApi<CorePrinciple, CorePrincipleCreateRequest>("/core-principle");

export const dualVerifyApi: CrudApi<DualVerify, DualVerifyCreateRequest> =
  createCrudApi<DualVerify, DualVerifyCreateRequest>("/dual-verify");

export const imageMatchingApi: CrudApi<ImageMatching, ImageMatchingCreateRequest> =
  createCrudApi<ImageMatching, ImageMatchingCreateRequest>("/image-matching");

export const matchPhasesApi: CrudApi<MatchPhase, MatchPhaseCreateRequest> =
  createCrudApi<MatchPhase, MatchPhaseCreateRequest>("/match-phases");

export const matchScopeApi: CrudApi<MatchScope, MatchScopeCreateRequest> =
  createCrudApi<MatchScope, MatchScopeCreateRequest>("/match-scope");

export const printLockApi: CrudApi<PrintLock, PrintLockCreateRequest> =
  createCrudApi<PrintLock, PrintLockCreateRequest>("/print-lock");

// ═══════════════════════════════════════════════════════════════════════════════
// RE-EXPORT EVERYTHING FOR BARREL IMPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export type { CrudApi };
