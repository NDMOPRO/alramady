/**
 * RASID Platform - API Request/Response Types for All 13 Services
 *
 * Each service has its own namespace with request and response types.
 */

import { PaginationParams, SortParams, DateRange, FileUpload, AsyncJobStatus } from './common';

// ===========================================================================
// 1. DATA ENGINE (port 8001)
// ===========================================================================

export namespace DataApi {
  export interface CreateDatasetRequest {
    name: string;
    nameAr?: string;
    description?: string;
    descriptionAr?: string;
    sourceType: 'file' | 'api' | 'database' | 'manual';
    tags?: string[];
    metadata?: Record<string, unknown>;
  }

  export interface DatasetResponse {
    id: string;
    name: string;
    nameAr?: string;
    description?: string;
    sourceType: string;
    rowCount: number;
    columnCount: number;
    sizeBytes: number;
    status: 'draft' | 'processing' | 'ready' | 'error';
    schema: DataColumnSchema[];
    tags: string[];
    createdAt: string;
    updatedAt: string;
    createdBy: string;
  }

  export interface DataColumnSchema {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'json' | 'array';
    nullable: boolean;
    unique: boolean;
    defaultValue?: unknown;
    description?: string;
  }

  export interface IngestFileRequest {
    datasetId: string;
    fileId: string;
    parseOptions?: {
      delimiter?: string;
      headerRow?: number;
      skipRows?: number;
      encoding?: string;
      dateFormat?: string;
    };
  }

  export interface CleansingRuleRequest {
    datasetId: string;
    rules: Array<{
      type: 'remove_duplicates' | 'fill_missing' | 'trim_whitespace' | 'normalize' | 'regex_replace';
      column?: string;
      params?: Record<string, unknown>;
    }>;
  }

  export interface TransformRequest {
    datasetId: string;
    operations: Array<{
      type: 'filter' | 'map' | 'aggregate' | 'join' | 'pivot' | 'unpivot' | 'sort' | 'rename';
      config: Record<string, unknown>;
    }>;
    outputDatasetName?: string;
  }

  export interface MergeRequest {
    sourceDatasetIds: string[];
    mergeType: 'inner' | 'left' | 'right' | 'full' | 'cross';
    joinKeys: Array<{ left: string; right: string }>;
    outputDatasetName: string;
  }

  export interface DataExportRequest {
    datasetId: string;
    format: 'csv' | 'json' | 'excel' | 'parquet' | 'xml';
    columns?: string[];
    filters?: Record<string, unknown>;
    dateRange?: DateRange;
  }

  export interface DataQueryRequest extends PaginationParams, SortParams {
    datasetId: string;
    search?: string;
    filters?: Record<string, unknown>;
    columns?: string[];
  }

  export interface DataQueryResponse {
    rows: Record<string, unknown>[];
    columns: DataColumnSchema[];
    totalRows: number;
  }
}

// ===========================================================================
// 2. EXCEL ENGINE (port 8002)
// ===========================================================================

export namespace ExcelApi {
  export interface CreateWorkbookRequest {
    name: string;
    templateId?: string;
    sheets?: Array<{
      name: string;
      data?: unknown[][];
    }>;
  }

  export interface WorkbookResponse {
    id: string;
    name: string;
    sheets: SheetInfo[];
    sizeBytes: number;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
  }

  export interface SheetInfo {
    id: string;
    name: string;
    rowCount: number;
    columnCount: number;
    index: number;
  }

  export interface CellUpdateRequest {
    workbookId: string;
    sheetId: string;
    cells: Array<{
      row: number;
      col: number;
      value: unknown;
      formula?: string;
      format?: CellFormat;
    }>;
  }

  export interface CellFormat {
    fontFamily?: string;
    fontSize?: number;
    bold?: boolean;
    italic?: boolean;
    color?: string;
    backgroundColor?: string;
    numberFormat?: string;
    alignment?: 'left' | 'center' | 'right';
    borderStyle?: string;
  }

  export interface FormulaRequest {
    workbookId: string;
    sheetId: string;
    formula: string;
    targetCell: { row: number; col: number };
  }

  export interface PivotTableRequest {
    workbookId: string;
    sourceSheetId: string;
    rows: string[];
    columns: string[];
    values: Array<{
      field: string;
      aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max';
    }>;
    filters?: Record<string, unknown>;
  }

  export interface ExcelExportRequest {
    workbookId: string;
    format: 'xlsx' | 'csv' | 'pdf' | 'ods';
    sheets?: string[];
    includeFormulas?: boolean;
  }
}

// ===========================================================================
// 3. DASHBOARD ENGINE (port 8003)
// ===========================================================================

export namespace DashboardApi {
  export interface CreateDashboardRequest {
    name: string;
    nameAr?: string;
    description?: string;
    layout: DashboardLayout;
    theme?: string;
    isPublic?: boolean;
    tags?: string[];
  }

  export interface DashboardResponse {
    id: string;
    name: string;
    nameAr?: string;
    description?: string;
    layout: DashboardLayout;
    widgets: WidgetConfig[];
    theme: string;
    isPublic: boolean;
    shareToken?: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
  }

  export interface DashboardLayout {
    type: 'grid' | 'freeform' | 'responsive';
    columns?: number;
    rowHeight?: number;
    gap?: number;
  }

  export interface WidgetConfig {
    id: string;
    type: 'chart' | 'table' | 'kpi' | 'map' | 'text' | 'image' | 'filter' | 'custom';
    title?: string;
    titleAr?: string;
    position: { x: number; y: number; w: number; h: number };
    dataSource: {
      datasetId?: string;
      query?: string;
      refreshIntervalMs?: number;
    };
    config: Record<string, unknown>;
    style?: Record<string, unknown>;
  }

  export interface AddWidgetRequest {
    dashboardId: string;
    widget: Omit<WidgetConfig, 'id'>;
  }

  export interface DashboardFilterRequest {
    dashboardId: string;
    filters: Array<{
      widgetId?: string;
      field: string;
      operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'like' | 'between';
      value: unknown;
    }>;
  }

  export interface ImageToDashboardRequest {
    imageFileId: string;
    name: string;
    aiOptions?: {
      detectCharts?: boolean;
      detectTables?: boolean;
      extractColors?: boolean;
    };
  }

  export interface DashboardExportRequest {
    dashboardId: string;
    format: 'pdf' | 'png' | 'pptx';
    options?: {
      width?: number;
      height?: number;
      quality?: number;
      includeFilters?: boolean;
    };
  }
}

// ===========================================================================
// 4. REPORTING ENGINE (port 8004)
// ===========================================================================

export namespace ReportingApi {
  export interface CreateReportRequest {
    name: string;
    nameAr?: string;
    description?: string;
    templateId?: string;
    dataSources: Array<{
      datasetId: string;
      alias: string;
      filters?: Record<string, unknown>;
    }>;
    sections: ReportSection[];
  }

  export interface ReportResponse {
    id: string;
    name: string;
    nameAr?: string;
    status: 'draft' | 'generating' | 'ready' | 'scheduled' | 'error';
    sections: ReportSection[];
    generatedAt?: string;
    fileUrl?: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
  }

  export interface ReportSection {
    id?: string;
    type: 'header' | 'text' | 'chart' | 'table' | 'summary' | 'page_break';
    title?: string;
    titleAr?: string;
    content: Record<string, unknown>;
    order: number;
  }

  export interface ScheduleReportRequest {
    reportId: string;
    schedule: {
      frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
      time: string;
      timezone: string;
      dayOfWeek?: number;
      dayOfMonth?: number;
    };
    recipients: Array<{
      email: string;
      format: 'pdf' | 'excel' | 'html';
    }>;
    enabled: boolean;
  }

  export interface ReportExportRequest {
    reportId: string;
    format: 'pdf' | 'docx' | 'xlsx' | 'html' | 'pptx';
    options?: {
      locale?: 'ar' | 'en';
      includeAppendix?: boolean;
      watermark?: string;
      headerFooter?: {
        headerText?: string;
        footerText?: string;
        pageNumbers?: boolean;
      };
    };
  }
}

// ===========================================================================
// 5. PRESENTATION ENGINE (port 8005)
// ===========================================================================

export namespace PresentationApi {
  export interface CreatePresentationRequest {
    name: string;
    nameAr?: string;
    templateId?: string;
    theme?: string;
    aspectRatio?: '16:9' | '4:3' | '16:10';
    slides?: SlideInput[];
  }

  export interface PresentationResponse {
    id: string;
    name: string;
    nameAr?: string;
    theme: string;
    aspectRatio: string;
    slideCount: number;
    slides: SlideResponse[];
    createdAt: string;
    updatedAt: string;
    createdBy: string;
  }

  export interface SlideInput {
    layout: 'title' | 'content' | 'two_column' | 'image' | 'chart' | 'blank' | 'comparison';
    title?: string;
    titleAr?: string;
    content?: Record<string, unknown>;
    elements?: SlideElement[];
    notes?: string;
    transition?: string;
  }

  export interface SlideResponse extends SlideInput {
    id: string;
    index: number;
    thumbnailUrl?: string;
  }

  export interface SlideElement {
    type: 'text' | 'image' | 'chart' | 'shape' | 'video' | 'table' | 'icon';
    position: { x: number; y: number; width: number; height: number };
    rotation?: number;
    opacity?: number;
    content: Record<string, unknown>;
    animations?: Array<{
      type: string;
      trigger: 'onClick' | 'afterPrevious' | 'withPrevious';
      duration: number;
      delay?: number;
    }>;
  }

  export interface AIGenerateRequest {
    topic: string;
    slideCount?: number;
    style?: string;
    locale?: 'ar' | 'en';
    includeCharts?: boolean;
    dataSources?: string[];
    outline?: string[];
  }

  export interface PresentationExportRequest {
    presentationId: string;
    format: 'pptx' | 'pdf' | 'html' | 'images';
    options?: {
      quality?: number;
      includeNotes?: boolean;
      includeAnimations?: boolean;
    };
  }
}

// ===========================================================================
// 6. INFOGRAPHIC ENGINE (port 8006)
// ===========================================================================

export namespace InfographicApi {
  export interface CreateInfographicRequest {
    name: string;
    nameAr?: string;
    templateId?: string;
    width: number;
    height: number;
    theme?: string;
    elements?: InfographicElement[];
  }

  export interface InfographicResponse {
    id: string;
    name: string;
    nameAr?: string;
    width: number;
    height: number;
    theme: string;
    elements: InfographicElement[];
    thumbnailUrl?: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
  }

  export interface InfographicElement {
    id?: string;
    type: 'text' | 'icon' | 'chart' | 'number' | 'image' | 'shape' | 'divider' | 'timeline';
    position: { x: number; y: number; width: number; height: number };
    content: Record<string, unknown>;
    style?: Record<string, unknown>;
    order: number;
  }

  export interface InfographicExportRequest {
    infographicId: string;
    format: 'png' | 'svg' | 'pdf';
    scale?: number;
  }
}

// ===========================================================================
// 7. REPLICATION ENGINE (port 8007)
// ===========================================================================

export namespace ReplicationApi {
  export interface CreateReplicationRequest {
    name: string;
    sourceFileId: string;
    targetFormat: 'dashboard' | 'report' | 'presentation' | 'infographic';
    options?: {
      matchColors?: boolean;
      matchFonts?: boolean;
      matchLayout?: boolean;
      matchSpacing?: boolean;
      fidelityLevel?: 'low' | 'medium' | 'high' | 'pixel_perfect';
    };
  }

  export interface ReplicationResponse {
    id: string;
    name: string;
    status: 'analyzing' | 'replicating' | 'verifying' | 'completed' | 'failed';
    sourceFileId: string;
    targetFormat: string;
    fidelityScore: number;
    fingerprint: string;
    analysis: ReplicationAnalysis;
    outputId?: string;
    createdAt: string;
    updatedAt: string;
  }

  export interface ReplicationAnalysis {
    colorPalette: string[];
    fonts: Array<{ family: string; weight: number; size: number }>;
    layoutStructure: Record<string, unknown>;
    spacingMetrics: Record<string, number>;
    comparisonReport?: {
      matchPercentage: number;
      differences: Array<{
        area: string;
        type: string;
        severity: 'low' | 'medium' | 'high';
        description: string;
      }>;
    };
  }

  export interface CompareRequest {
    sourceFileId: string;
    targetFileId: string;
    comparisonType: 'pixel' | 'structural' | 'semantic';
  }
}

// ===========================================================================
// 8. LOCALIZATION ENGINE (port 8008)
// ===========================================================================

export namespace LocalizationApi {
  export interface TranslateRequest {
    text: string;
    sourceLang: 'ar' | 'en';
    targetLang: 'ar' | 'en';
    context?: string;
    glossaryId?: string;
  }

  export interface TranslateResponse {
    translatedText: string;
    confidence: number;
    alternatives?: string[];
    glossaryMatches?: Array<{
      source: string;
      target: string;
      glossaryId: string;
    }>;
  }

  export interface RTLTransformRequest {
    contentId: string;
    contentType: 'dashboard' | 'report' | 'presentation' | 'infographic';
    options?: {
      mirrorLayout?: boolean;
      adjustTypography?: boolean;
      convertNumbers?: boolean;
      adjustDateFormats?: boolean;
    };
  }

  export interface GlossaryEntry {
    id: string;
    termEn: string;
    termAr: string;
    domain?: string;
    notes?: string;
    approved: boolean;
  }

  export interface CreateGlossaryRequest {
    name: string;
    domain: string;
    entries: Omit<GlossaryEntry, 'id'>[];
  }

  export interface CulturalFormatRequest {
    value: string | number;
    type: 'date' | 'number' | 'currency' | 'percentage' | 'phone';
    locale: 'ar-SA' | 'ar-AE' | 'ar-EG' | 'en-US' | 'en-GB';
    options?: Record<string, unknown>;
  }
}

// ===========================================================================
// 9. AI ENGINE (port 8009)
// ===========================================================================

export namespace AIApi {
  export interface ChatRequest {
    message: string;
    conversationId?: string;
    context?: {
      datasetIds?: string[];
      dashboardId?: string;
      reportId?: string;
    };
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
    };
  }

  export interface ChatResponse {
    conversationId: string;
    messageId: string;
    response: string;
    citations?: Array<{
      source: string;
      text: string;
      confidence: number;
    }>;
    suggestedActions?: Array<{
      type: string;
      label: string;
      params: Record<string, unknown>;
    }>;
    tokensUsed: {
      prompt: number;
      completion: number;
      total: number;
    };
  }

  export interface AnalysisRequest {
    datasetId: string;
    analysisType: 'descriptive' | 'diagnostic' | 'predictive' | 'prescriptive';
    columns?: string[];
    options?: {
      depth?: 'quick' | 'standard' | 'deep';
      includeVisualizations?: boolean;
      language?: 'ar' | 'en';
    };
  }

  export interface AnalysisResponse {
    analysisId: string;
    type: string;
    summary: string;
    summaryAr?: string;
    insights: Array<{
      title: string;
      description: string;
      importance: 'low' | 'medium' | 'high' | 'critical';
      visualizationType?: string;
      data?: Record<string, unknown>;
    }>;
    recommendations: Array<{
      action: string;
      reasoning: string;
      impact: string;
      priority: number;
    }>;
  }

  export interface RecommendationRequest {
    context: Record<string, unknown>;
    type: 'chart' | 'layout' | 'color' | 'content' | 'optimization';
    count?: number;
  }

  export interface AgentTaskRequest {
    task: string;
    agentType: 'data_analyst' | 'report_builder' | 'dashboard_designer' | 'content_writer';
    inputs: Record<string, unknown>;
    constraints?: Record<string, unknown>;
  }

  export interface AgentTaskResponse {
    taskId: string;
    status: 'running' | 'completed' | 'failed';
    steps: Array<{
      name: string;
      status: string;
      output?: unknown;
      durationMs: number;
    }>;
    result?: unknown;
  }
}

// ===========================================================================
// 10. GOVERNANCE ENGINE (port 8010)
// ===========================================================================

export namespace GovernanceApi {
  export interface CreateUserRequest {
    email: string;
    password: string;
    firstName: string;
    firstNameAr?: string;
    lastName: string;
    lastNameAr?: string;
    roleIds: string[];
    tenantId?: string;
    locale?: 'ar' | 'en';
  }

  export interface UserResponse {
    id: string;
    email: string;
    firstName: string;
    firstNameAr?: string;
    lastName: string;
    lastNameAr?: string;
    roles: RoleResponse[];
    tenantId?: string;
    locale: string;
    isActive: boolean;
    lastLoginAt?: string;
    createdAt: string;
    updatedAt: string;
  }

  export interface LoginRequest {
    email: string;
    password: string;
    mfaCode?: string;
  }

  export interface LoginResponse {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: 'Bearer';
    user: UserResponse;
  }

  export interface RoleResponse {
    id: string;
    name: string;
    nameAr?: string;
    description?: string;
    permissions: PermissionResponse[];
    isSystem: boolean;
    createdAt: string;
  }

  export interface PermissionResponse {
    id: string;
    resource: string;
    action: 'create' | 'read' | 'update' | 'delete' | 'manage' | 'export';
    conditions?: Record<string, unknown>;
  }

  export interface CreateRoleRequest {
    name: string;
    nameAr?: string;
    description?: string;
    permissionIds: string[];
  }

  export interface AuditLogEntry {
    id: string;
    userId: string;
    action: string;
    resource: string;
    resourceId?: string;
    details?: Record<string, unknown>;
    ipAddress: string;
    userAgent: string;
    timestamp: string;
  }

  export interface AuditLogQuery extends PaginationParams, SortParams {
    userId?: string;
    action?: string;
    resource?: string;
    dateRange?: DateRange;
  }

  export interface WorkflowRequest {
    name: string;
    type: 'approval' | 'review' | 'publishing';
    steps: Array<{
      name: string;
      assigneeRoleId: string;
      action: 'approve' | 'reject' | 'review' | 'sign';
      order: number;
    }>;
  }

  export interface NotificationRequest {
    recipientIds: string[];
    type: 'email' | 'push' | 'in_app' | 'sms';
    template: string;
    data: Record<string, unknown>;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
  }
}

// ===========================================================================
// 11. LIBRARY ENGINE (port 8011)
// ===========================================================================

export namespace LibraryApi {
  export interface CreateAssetRequest {
    name: string;
    nameAr?: string;
    type: 'image' | 'icon' | 'font' | 'template' | 'dataset' | 'color_palette' | 'media';
    fileId: string;
    tags?: string[];
    category?: string;
    metadata?: Record<string, unknown>;
  }

  export interface AssetResponse {
    id: string;
    name: string;
    nameAr?: string;
    type: string;
    fileUrl: string;
    thumbnailUrl?: string;
    sizeBytes: number;
    mimeType: string;
    tags: string[];
    category?: string;
    metadata?: Record<string, unknown>;
    usageCount: number;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
  }

  export interface AssetSearchRequest extends PaginationParams, SortParams {
    query?: string;
    type?: string;
    tags?: string[];
    category?: string;
    mimeType?: string;
    dateRange?: DateRange;
  }

  export interface BulkAssetRequest {
    assets: CreateAssetRequest[];
  }
}

// ===========================================================================
// 12. TEMPLATE ENGINE (port 8012)
// ===========================================================================

export namespace TemplateApi {
  export interface CreateTemplateRequest {
    name: string;
    nameAr?: string;
    type: 'dashboard' | 'report' | 'presentation' | 'infographic' | 'excel';
    category?: string;
    description?: string;
    descriptionAr?: string;
    thumbnailFileId?: string;
    definition: Record<string, unknown>;
    isPublic?: boolean;
    tags?: string[];
  }

  export interface TemplateResponse {
    id: string;
    name: string;
    nameAr?: string;
    type: string;
    category?: string;
    description?: string;
    descriptionAr?: string;
    thumbnailUrl?: string;
    definition: Record<string, unknown>;
    isPublic: boolean;
    usageCount: number;
    rating: number;
    tags: string[];
    createdAt: string;
    updatedAt: string;
    createdBy: string;
  }

  export interface TemplateSearchRequest extends PaginationParams, SortParams {
    query?: string;
    type?: string;
    category?: string;
    tags?: string[];
    isPublic?: boolean;
    minRating?: number;
  }

  export interface InstantiateTemplateRequest {
    templateId: string;
    name: string;
    overrides?: Record<string, unknown>;
  }
}

// ===========================================================================
// 13. CONVERSION ENGINE (port 8013)
// ===========================================================================

export namespace ConversionApi {
  export interface ConvertRequest {
    sourceFileId: string;
    targetFormat: string;
    options?: {
      quality?: number;
      dpi?: number;
      pageRange?: string;
      preserveFormatting?: boolean;
      ocrEnabled?: boolean;
      language?: string;
    };
  }

  export interface ConvertResponse {
    conversionId: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    sourceFormat: string;
    targetFormat: string;
    progress: number;
    outputFileId?: string;
    outputUrl?: string;
    sizeBytes?: number;
    durationMs?: number;
    error?: string;
  }

  export interface DetectFormatRequest {
    fileId: string;
  }

  export interface FormatDetectionResponse {
    fileId: string;
    detectedFormat: string;
    mimeType: string;
    confidence: number;
    alternativeFormats?: Array<{
      format: string;
      confidence: number;
    }>;
    metadata: {
      pageCount?: number;
      hasImages?: boolean;
      hasText?: boolean;
      hasTables?: boolean;
      encoding?: string;
    };
  }

  export interface BatchConvertRequest {
    conversions: Array<{
      sourceFileId: string;
      targetFormat: string;
      options?: ConvertRequest['options'];
    }>;
    notifyOnComplete?: boolean;
  }

  export interface SupportedFormatsResponse {
    formats: Array<{
      format: string;
      mimeType: string;
      extensions: string[];
      canConvertTo: string[];
      canConvertFrom: string[];
    }>;
  }
}

// ===========================================================================
// 14. CROSS-ENGINE DATA BRIDGE
// ===========================================================================

export namespace BridgeApi {
  export type EngineType =
    | 'data' | 'excel' | 'dashboard' | 'reporting' | 'presentation'
    | 'infographic' | 'replication' | 'localization' | 'ai'
    | 'governance' | 'library' | 'template' | 'conversion';

  export interface PublishRequest {
    sourceEngine: EngineType;
    targetEngine: EngineType | '*';
    dataType: string;
    data: Record<string, unknown>;
    tenantId: string;
    userId: string;
    correlationId?: string;
    ttlMs?: number;
  }

  export interface PublishResponse {
    payloadId: string;
    deliveredTo: number;
    timestamp: string;
  }

  export interface RequestPayload {
    sourceEngine: EngineType;
    targetEngine: EngineType;
    dataType: string;
    data: Record<string, unknown>;
    tenantId: string;
    userId: string;
    timeoutMs?: number;
  }

  export interface RequestResponse {
    payloadId: string;
    responseData: Record<string, unknown>;
    sourceEngine: EngineType;
    processingTimeMs: number;
  }

  export interface LineageRecord {
    id: string;
    payloadId: string;
    sourceEngine: EngineType;
    targetEngine: EngineType;
    dataType: string;
    transformations: string[];
    timestamp: string;
  }

  export interface BridgeStats {
    totalPublished: number;
    totalRequests: number;
    activeSubscriptions: number;
    engineActivity: Record<string, { published: number; consumed: number }>;
    averageLatencyMs: number;
  }
}

// ===========================================================================
// 15. AI TRAINING CENTER
// ===========================================================================

export namespace TrainingApi {
  export interface DatasetCreateRequest {
    name: string;
    description?: string;
    taskType: 'classification' | 'regression' | 'ner' | 'text_generation' | 'summarization' | 'translation';
    format: 'jsonl' | 'csv' | 'parquet';
    samples: Array<{ input: string; output: string; label?: string }>;
  }

  export interface DatasetResponse {
    id: string;
    name: string;
    taskType: string;
    sampleCount: number;
    trainCount: number;
    validationCount: number;
    testCount: number;
    qualityScore: number | null;
    version: number;
    status: string;
    createdAt: string;
  }

  export interface ModelBuildRequest {
    datasetId: string;
    baseModel: string;
    taskType: string;
    hyperparameters: {
      learningRate: number;
      epochs: number;
      batchSize: number;
      warmupSteps?: number;
      weightDecay?: number;
    };
  }

  export interface TrainingJobResponse {
    id: string;
    datasetId: string;
    baseModel: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    currentEpoch: number;
    epochs: number;
    trainingLoss: number | null;
    validationLoss: number | null;
    metrics: Record<string, number> | null;
    startedAt: string | null;
    completedAt: string | null;
  }

  export interface EvaluationRequest {
    jobId: string;
    testDatasetId?: string;
    metrics: string[];
  }

  export interface EvaluationResponse {
    jobId: string;
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
    bleuScore?: number;
    rougeScores?: { rouge1: number; rouge2: number; rougeL: number };
    confusionMatrix?: number[][];
    perClassMetrics?: Record<string, { precision: number; recall: number; f1: number }>;
  }

  export interface ModelRegistryEntry {
    id: string;
    jobId: string;
    name: string;
    version: string;
    taskType: string;
    baseModel: string;
    metrics: Record<string, number>;
    status: 'registered' | 'promoted' | 'deployed' | 'archived';
    deploymentId: string | null;
    createdAt: string;
  }

  export interface DeployRequest {
    modelId: string;
    strategy: 'replace' | 'canary' | 'ab_test';
    trafficPercentage?: number;
    rateLimit?: number;
  }

  export interface DeployResponse {
    deploymentId: string;
    modelId: string;
    status: 'deploying' | 'active' | 'failed';
    endpoint: string;
    strategy: string;
  }
}

// ===========================================================================
// 16. AUTONOMOUS INTELLIGENCE LAYER
// ===========================================================================

export namespace IntelligenceApi {
  export interface UnderstandRequest {
    text: string;
    tenantId: string;
    userId: string;
    locale?: string;
  }

  export interface UnderstandResponse {
    intent: string;
    confidence: number;
    entities: Array<{
      type: string;
      value: string;
      position: { start: number; end: number };
    }>;
    dialect?: string;
    suggestedActions: string[];
  }

  export interface PlanRequest {
    text: string;
    tenantId: string;
    userId: string;
    intent?: string;
    constraints?: Record<string, unknown>;
  }

  export interface ExecutionPlan {
    planId: string;
    steps: Array<{
      stepId: string;
      engine: string;
      action: string;
      params: Record<string, unknown>;
      dependsOn: string[];
      estimatedTimeMs: number;
    }>;
    totalEstimatedTimeMs: number;
    parallelizable: boolean;
  }

  export interface ExecuteRequest {
    planId: string;
    tenantId: string;
    userId: string;
    autoApprove?: boolean;
  }

  export interface ExecuteResponse {
    executionId: string;
    status: 'running' | 'completed' | 'failed' | 'paused';
    completedSteps: number;
    totalSteps: number;
    results: Record<string, unknown>[];
  }

  export interface ContextResponse {
    shortTerm: Record<string, unknown>;
    workingMemory: {
      currentTask: string | null;
      activeDatasets: string[];
      recentActions: string[];
    };
    recentEpisodes: Array<{
      requestText: string;
      intent: string;
      outcome: string;
      timestamp: string;
    }>;
    suggestions: string[];
  }

  export interface ProactiveSuggestion {
    id: string;
    type: 'anomaly' | 'optimization' | 'insight' | 'action';
    title: string;
    titleAr: string;
    description: string;
    descriptionAr: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    action: string;
    params: Record<string, unknown>;
  }
}
