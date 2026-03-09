/**
 * Shared API Types — Rasid Platform Frontend
 * أنواع مشتركة للـ API
 */

// ─── Generic Response Types ────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiError {
  success: false;
  error: string;
  code?: string;
  details?: Record<string, string[]>;
}

// ─── Data Engine ───────────────────────────────────────────────────────────

export interface DataTable {
  id: string;
  name: string;
  columns: ColumnDef[];
  rowCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ColumnDef {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'unknown';
  nullable: boolean;
  unique?: boolean;
}

export interface FileUpload {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
}

// ─── Connectors ────────────────────────────────────────────────────────────

export interface ConnectorInfo {
  type: string;
  name: string;
  authType: 'oauth2' | 'api_key';
  icon?: string;
  description: string;
}

export interface Connection {
  id: string;
  type: string;
  name: string;
  status: 'active' | 'expired' | 'error';
  lastSyncAt?: string;
  createdAt: string;
}

// ─── Dashboard ─────────────────────────────────────────────────────────────

export interface Dashboard {
  id: string;
  name: string;
  description: string;
  widgets: Widget[];
  layout: Record<string, unknown>;
  theme: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Widget {
  id: string;
  type: 'chart' | 'kpi' | 'table' | 'map' | 'text' | 'image';
  title: string;
  config: Record<string, unknown>;
  position: { x: number; y: number; w: number; h: number };
  dataSourceId?: string;
}

// ─── Reports ───────────────────────────────────────────────────────────────

export interface Report {
  id: string;
  title: string;
  type: string;
  status: 'draft' | 'published' | 'archived';
  sections: ReportSection[];
  createdAt: string;
  updatedAt: string;
}

export interface ReportSection {
  id: string;
  type: 'text' | 'chart' | 'table' | 'image' | 'kpi';
  content: Record<string, unknown>;
  order: number;
}

// ─── Presentations ─────────────────────────────────────────────────────────

export interface Presentation {
  id: string;
  title: string;
  slides: Slide[];
  theme: string;
  isProtected: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Slide {
  id: string;
  elements: SlideElement[];
  notes?: string;
  transition?: string;
  order: number;
}

export interface SlideElement {
  id: string;
  type: 'text' | 'image' | 'chart' | 'video' | 'qr' | 'shape';
  content: Record<string, unknown>;
  position: { x: number; y: number; width: number; height: number };
  style?: Record<string, unknown>;
}

// ─── AI Engine ─────────────────────────────────────────────────────────────

export interface AIQuery {
  query: string;
  dataSourceId?: string;
  language?: string;
}

export interface AIResult {
  answer: string;
  confidence: number;
  sources: string[];
  sqlPreview?: string;
  charts?: Record<string, unknown>[];
}

export interface ConfidenceResult {
  overallConfidence: number;
  factors: Array<{
    name: string;
    score: number;
    weight: number;
    reasoning: string;
  }>;
  recommendation: 'high_confidence' | 'review_recommended' | 'low_confidence';
}

export interface StressTestResult {
  overallScore: number;
  tests: Array<{
    name: string;
    passed: boolean;
    score: number;
    details: string;
  }>;
  recommendations: string[];
}

export interface FineTuneJob {
  id: string;
  baseModel: string;
  status: string;
  trainedTokens: number;
  resultModelId?: string;
  createdAt: string;
  finishedAt?: string;
}

// ─── Conversion ────────────────────────────────────────────────────────────

export interface ConversionJob {
  jobId: string;
  sourceFormat: string;
  targetFormat: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  outputUrl?: string;
}

export interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
  words: Array<{ word: string; start: number; end: number }>;
}

// ─── Localization ──────────────────────────────────────────────────────────

export interface TranslationProject {
  id: string;
  name: string;
  sourceLocale: string;
  targetLocales: string[];
  progress: number;
  status: string;
}

export interface QualityReport {
  id: string;
  overallScore: number;
  checks: Array<{
    type: string;
    passed: boolean;
    score: number;
    issueCount: number;
  }>;
  issues: Array<{
    severity: string;
    description: string;
    suggestion?: string;
  }>;
}

export interface LanguageInfo {
  code: string;
  name: string;
  nativeName: string;
  isRtl: boolean;
}

// ─── Governance ────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  action: string;
  userId: string;
  resource: string;
  resourceId: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface FreezeRule {
  id: string;
  documentId: string;
  range: string;
  frozenBy: string;
  reason: string;
  frozenAt: string;
  expiresAt?: string;
}

export interface ApprovalRequest {
  id: string;
  action: string;
  requestedBy: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  createdAt: string;
}

export interface ShutdownStatus {
  isActive: boolean;
  reason: string;
  activatedBy: string;
  scope: 'global' | 'tenant' | 'engine';
  activatedAt: string;
}

// ─── Excel ─────────────────────────────────────────────────────────────────

export interface MonteCarloResult {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  percentile5: number;
  percentile95: number;
  median: number;
  histogram: Array<{ binStart: number; binEnd: number; count: number }>;
}

export interface FormulaResult {
  value: unknown;
  type: string;
  error?: string;
}
