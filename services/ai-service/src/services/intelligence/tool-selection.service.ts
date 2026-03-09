import { z } from 'zod';
import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger.js';
import { TaskStep } from './task-decomposition.service.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ToolCapability {
  id: string;
  name: string;
  engine: string;
  actions: string[];
  inputFormats: string[];
  outputFormats: string[];
  maxInputSizeMb: number;
  supportsStreaming: boolean;
  supportsArabic: boolean;
  supportsBatch: boolean;
  performanceProfile: {
    avgLatencyMs: number;
    throughputPerSecond: number;
    reliabilityScore: number;
  };
  tags: string[];
}

export interface ToolScore {
  toolId: string;
  toolName: string;
  fitnessScore: number;
  actionMatch: number;
  formatCompatibility: number;
  performanceScore: number;
  reliabilityScore: number;
  arabicSupport: number;
  reasons: string[];
}

export interface ToolSelection {
  stepId: string;
  stepName: string;
  primaryTool: ToolScore;
  fallbackTools: ToolScore[];
  confidence: number;
  warnings: string[];
}

export interface ToolSelectionPlan {
  id: string;
  selections: ToolSelection[];
  overallConfidence: number;
  dataFlowCompatible: boolean;
  warnings: string[];
  createdAt: Date;
}

// ─── Tool Registry ───────────────────────────────────────────────────────────

const TOOL_REGISTRY: ToolCapability[] = [
  {
    id: 'tool-data-reader',
    name: 'Data File Reader',
    engine: 'data_files',
    actions: ['read_file', 'filter_data'],
    inputFormats: ['csv', 'xlsx', 'xls', 'json', 'xml', 'parquet', 'txt', 'pdf', 'docx'],
    outputFormats: ['json', 'array'],
    maxInputSizeMb: 500,
    supportsStreaming: true,
    supportsArabic: true,
    supportsBatch: true,
    performanceProfile: { avgLatencyMs: 2000, throughputPerSecond: 50, reliabilityScore: 0.98 },
    tags: ['io', 'file', 'read', 'parse'],
  },
  {
    id: 'tool-data-profiler',
    name: 'Data Profiler',
    engine: 'data_files',
    actions: ['profile_data'],
    inputFormats: ['json', 'array'],
    outputFormats: ['json'],
    maxInputSizeMb: 1000,
    supportsStreaming: false,
    supportsArabic: true,
    supportsBatch: true,
    performanceProfile: { avgLatencyMs: 5000, throughputPerSecond: 10, reliabilityScore: 0.95 },
    tags: ['analysis', 'quality', 'statistics'],
  },
  {
    id: 'tool-data-cleaner',
    name: 'Data Cleaner',
    engine: 'data_files',
    actions: ['clean_data'],
    inputFormats: ['json', 'array'],
    outputFormats: ['json', 'array'],
    maxInputSizeMb: 500,
    supportsStreaming: false,
    supportsArabic: true,
    supportsBatch: true,
    performanceProfile: { avgLatencyMs: 8000, throughputPerSecond: 5, reliabilityScore: 0.93 },
    tags: ['transform', 'clean', 'deduplicate', 'normalize'],
  },
  {
    id: 'tool-data-merger',
    name: 'Data Merger',
    engine: 'data_files',
    actions: ['merge_data'],
    inputFormats: ['json', 'array'],
    outputFormats: ['json', 'array'],
    maxInputSizeMb: 1000,
    supportsStreaming: false,
    supportsArabic: true,
    supportsBatch: false,
    performanceProfile: { avgLatencyMs: 10000, throughputPerSecond: 3, reliabilityScore: 0.92 },
    tags: ['merge', 'join', 'combine'],
  },
  {
    id: 'tool-excel-processor',
    name: 'Excel Processor',
    engine: 'excel',
    actions: ['process_workbook', 'apply_formulas'],
    inputFormats: ['xlsx', 'xls', 'csv'],
    outputFormats: ['xlsx', 'json', 'csv'],
    maxInputSizeMb: 200,
    supportsStreaming: false,
    supportsArabic: true,
    supportsBatch: true,
    performanceProfile: { avgLatencyMs: 5000, throughputPerSecond: 8, reliabilityScore: 0.94 },
    tags: ['excel', 'spreadsheet', 'formulas'],
  },
  {
    id: 'tool-dashboard-builder',
    name: 'Dashboard Builder',
    engine: 'dashboards',
    actions: ['create_dashboard', 'add_widget', 'configure_layout'],
    inputFormats: ['json', 'array'],
    outputFormats: ['json', 'html'],
    maxInputSizeMb: 100,
    supportsStreaming: false,
    supportsArabic: true,
    supportsBatch: false,
    performanceProfile: { avgLatencyMs: 15000, throughputPerSecond: 2, reliabilityScore: 0.91 },
    tags: ['dashboard', 'visualization', 'charts', 'kpi'],
  },
  {
    id: 'tool-report-generator',
    name: 'Report Generator',
    engine: 'reports',
    actions: ['generate_report', 'add_section'],
    inputFormats: ['json', 'array'],
    outputFormats: ['pdf', 'docx', 'html'],
    maxInputSizeMb: 200,
    supportsStreaming: false,
    supportsArabic: true,
    supportsBatch: false,
    performanceProfile: { avgLatencyMs: 20000, throughputPerSecond: 1, reliabilityScore: 0.90 },
    tags: ['report', 'document', 'professional'],
  },
  {
    id: 'tool-presentation-creator',
    name: 'Presentation Creator',
    engine: 'presentations',
    actions: ['create_presentation', 'create_infographic'],
    inputFormats: ['json', 'array'],
    outputFormats: ['pptx', 'pdf', 'html', 'svg'],
    maxInputSizeMb: 100,
    supportsStreaming: false,
    supportsArabic: true,
    supportsBatch: false,
    performanceProfile: { avgLatencyMs: 25000, throughputPerSecond: 1, reliabilityScore: 0.88 },
    tags: ['presentation', 'slides', 'infographic'],
  },
  {
    id: 'tool-ai-analyzer',
    name: 'AI Analyzer',
    engine: 'ai_intelligence',
    actions: ['analyze_data', 'summarize', 'forecast', 'query_answer'],
    inputFormats: ['json', 'array', 'text'],
    outputFormats: ['json', 'text'],
    maxInputSizeMb: 50,
    supportsStreaming: true,
    supportsArabic: true,
    supportsBatch: true,
    performanceProfile: { avgLatencyMs: 12000, throughputPerSecond: 3, reliabilityScore: 0.89 },
    tags: ['ai', 'analysis', 'nlp', 'intelligence', 'forecast'],
  },
  {
    id: 'tool-translator',
    name: 'Translator',
    engine: 'localization',
    actions: ['translate', 'arabize'],
    inputFormats: ['text', 'json', 'docx', 'pdf'],
    outputFormats: ['text', 'json', 'docx', 'pdf'],
    maxInputSizeMb: 50,
    supportsStreaming: true,
    supportsArabic: true,
    supportsBatch: true,
    performanceProfile: { avgLatencyMs: 12000, throughputPerSecond: 5, reliabilityScore: 0.92 },
    tags: ['translate', 'localize', 'arabize', 'language'],
  },
  {
    id: 'tool-converter',
    name: 'Format Converter',
    engine: 'conversion',
    actions: ['convert_format'],
    inputFormats: ['csv', 'xlsx', 'json', 'xml', 'pdf', 'docx', 'pptx', 'html', 'markdown', 'txt'],
    outputFormats: ['csv', 'xlsx', 'json', 'xml', 'pdf', 'docx', 'pptx', 'html', 'markdown'],
    maxInputSizeMb: 300,
    supportsStreaming: false,
    supportsArabic: true,
    supportsBatch: true,
    performanceProfile: { avgLatencyMs: 5000, throughputPerSecond: 10, reliabilityScore: 0.95 },
    tags: ['convert', 'format', 'transform'],
  },
  {
    id: 'tool-literal-matcher',
    name: 'Literal Matcher',
    engine: 'literal_match',
    actions: ['exact_match'],
    inputFormats: ['text', 'json', 'array'],
    outputFormats: ['json', 'array'],
    maxInputSizeMb: 500,
    supportsStreaming: false,
    supportsArabic: true,
    supportsBatch: true,
    performanceProfile: { avgLatencyMs: 3000, throughputPerSecond: 20, reliabilityScore: 0.99 },
    tags: ['match', 'search', 'exact', 'literal'],
  },
  {
    id: 'tool-governance',
    name: 'Governance Manager',
    engine: 'governance',
    actions: ['check_permissions', 'audit_log'],
    inputFormats: ['json'],
    outputFormats: ['json'],
    maxInputSizeMb: 10,
    supportsStreaming: false,
    supportsArabic: true,
    supportsBatch: false,
    performanceProfile: { avgLatencyMs: 500, throughputPerSecond: 100, reliabilityScore: 0.99 },
    tags: ['governance', 'permissions', 'audit', 'security'],
  },
];

// ─── Service ─────────────────────────────────────────────────────────────────

export class ToolSelectionService {
  private registry: ToolCapability[];

  constructor() {
    this.registry = [...TOOL_REGISTRY];
    logger.info('ToolSelectionService initialized', { toolCount: this.registry.length });
  }

  selectToolsForPlan(steps: TaskStep[], inputFormat?: string): ToolSelectionPlan {
    const startTime = Date.now();
    const selections: ToolSelection[] = [];
    const warnings: string[] = [];

    // Build a map of step outputs for data flow checking
    const stepOutputFormats = new Map<string, string[]>();

    for (const step of steps) {
      const selection = this.selectToolForStep(step, stepOutputFormats, inputFormat);
      selections.push(selection);

      if (selection.warnings.length > 0) {
        warnings.push(...selection.warnings.map((w) => `[${step.name}] ${w}`));
      }

      // Record the output formats of the selected tool for downstream steps
      const selectedTool = this.registry.find((t) => t.id === selection.primaryTool.toolId);
      if (selectedTool) {
        stepOutputFormats.set(step.id, selectedTool.outputFormats);
      }
    }

    // Check data flow compatibility between connected steps
    const dataFlowCompatible = this.checkDataFlowCompatibility(steps, selections);
    if (!dataFlowCompatible) {
      warnings.push('Some steps may have data format incompatibilities; conversion steps may be needed');
    }

    const overallConfidence = selections.length > 0
      ? selections.reduce((sum, s) => sum + s.confidence, 0) / selections.length
      : 0;

    const plan: ToolSelectionPlan = {
      id: randomUUID(),
      selections,
      overallConfidence: Math.round(overallConfidence * 100) / 100,
      dataFlowCompatible,
      warnings,
      createdAt: new Date(),
    };

    const elapsed = Date.now() - startTime;
    logger.info('Tool selection completed', {
      planId: plan.id,
      selectionCount: selections.length,
      overallConfidence: plan.overallConfidence,
      dataFlowCompatible,
      elapsedMs: elapsed,
    });

    return plan;
  }

  // ─── Single Step Selection ─────────────────────────────────────────────

  private selectToolForStep(
    step: TaskStep,
    stepOutputFormats: Map<string, string[]>,
    inputFormat?: string,
  ): ToolSelection {
    const scores: ToolScore[] = [];
    const stepWarnings: string[] = [];

    for (const tool of this.registry) {
      const score = this.scoreTool(tool, step, stepOutputFormats, inputFormat);
      if (score.fitnessScore > 0) {
        scores.push(score);
      }
    }

    scores.sort((a, b) => b.fitnessScore - a.fitnessScore);

    if (scores.length === 0) {
      stepWarnings.push(`No suitable tool found for step "${step.name}" (engine: ${step.engine}, action: ${step.action})`);

      const fallbackScore: ToolScore = {
        toolId: 'tool-ai-analyzer',
        toolName: 'AI Analyzer (fallback)',
        fitnessScore: 0.3,
        actionMatch: 0.1,
        formatCompatibility: 0.5,
        performanceScore: 0.5,
        reliabilityScore: 0.5,
        arabicSupport: 1,
        reasons: ['Fallback tool selected due to no matching tools'],
      };

      return {
        stepId: step.id,
        stepName: step.name,
        primaryTool: fallbackScore,
        fallbackTools: [],
        confidence: 0.3,
        warnings: stepWarnings,
      };
    }

    const primaryTool = scores[0];
    const fallbackTools = scores.slice(1, 3);

    const confidence = primaryTool.fitnessScore;

    if (confidence < 0.5) {
      stepWarnings.push(`Low confidence (${confidence.toFixed(2)}) for tool selection on step "${step.name}"`);
    }

    return {
      stepId: step.id,
      stepName: step.name,
      primaryTool,
      fallbackTools,
      confidence: Math.round(confidence * 100) / 100,
      warnings: stepWarnings,
    };
  }

  // ─── Scoring ───────────────────────────────────────────────────────────

  private scoreTool(
    tool: ToolCapability,
    step: TaskStep,
    stepOutputFormats: Map<string, string[]>,
    inputFormat?: string,
  ): ToolScore {
    const reasons: string[] = [];

    // Action match (highest weight)
    let actionMatch = 0;
    if (tool.actions.includes(step.action)) {
      actionMatch = 1.0;
      reasons.push(`Directly supports action "${step.action}"`);
    } else if (tool.engine === step.engine) {
      actionMatch = 0.3;
      reasons.push(`Same engine "${step.engine}" but different action`);
    }

    // Format compatibility
    let formatCompatibility = 0.5; // default neutral

    if (inputFormat && tool.inputFormats.includes(inputFormat.toLowerCase())) {
      formatCompatibility = 1.0;
      reasons.push(`Supports input format "${inputFormat}"`);
    }

    // Check if upstream step output is compatible with this tool's input
    if (step.dependencies.length > 0) {
      let compatibleDeps = 0;
      for (const depId of step.dependencies) {
        const depOutputs = stepOutputFormats.get(depId);
        if (depOutputs) {
          const hasOverlap = depOutputs.some((f) => tool.inputFormats.includes(f));
          if (hasOverlap) {
            compatibleDeps++;
          }
        }
      }
      if (step.dependencies.length > 0) {
        formatCompatibility = compatibleDeps / step.dependencies.length;
        if (formatCompatibility > 0) {
          reasons.push('Compatible with upstream output formats');
        }
      }
    }

    // Performance score
    const latencyRatio = Math.min(1, step.estimatedTimeMs / Math.max(1, tool.performanceProfile.avgLatencyMs));
    const performanceScore = Math.min(1, latencyRatio);
    if (performanceScore > 0.7) {
      reasons.push('Good performance match');
    }

    // Reliability
    const reliabilityScore = tool.performanceProfile.reliabilityScore;

    // Arabic support
    const arabicSupport = tool.supportsArabic ? 1.0 : 0.3;
    if (tool.supportsArabic) {
      reasons.push('Arabic language support');
    }

    // Weighted fitness score
    const fitnessScore =
      actionMatch * 0.40 +
      formatCompatibility * 0.20 +
      performanceScore * 0.15 +
      reliabilityScore * 0.15 +
      arabicSupport * 0.10;

    return {
      toolId: tool.id,
      toolName: tool.name,
      fitnessScore: Math.round(fitnessScore * 100) / 100,
      actionMatch: Math.round(actionMatch * 100) / 100,
      formatCompatibility: Math.round(formatCompatibility * 100) / 100,
      performanceScore: Math.round(performanceScore * 100) / 100,
      reliabilityScore: Math.round(reliabilityScore * 100) / 100,
      arabicSupport: Math.round(arabicSupport * 100) / 100,
      reasons,
    };
  }

  // ─── Data Flow Compatibility ───────────────────────────────────────────

  private checkDataFlowCompatibility(
    steps: TaskStep[],
    selections: ToolSelection[],
  ): boolean {
    const selectionMap = new Map<string, ToolSelection>();
    for (const sel of selections) {
      selectionMap.set(sel.stepId, sel);
    }

    for (const step of steps) {
      if (step.dependencies.length === 0) continue;

      const currentTool = this.registry.find(
        (t) => t.id === selectionMap.get(step.id)?.primaryTool.toolId,
      );

      if (!currentTool) continue;

      for (const depId of step.dependencies) {
        const depTool = this.registry.find(
          (t) => t.id === selectionMap.get(depId)?.primaryTool.toolId,
        );

        if (!depTool) continue;

        const hasFormatOverlap = depTool.outputFormats.some(
          (outputFmt) => currentTool.inputFormats.includes(outputFmt),
        );

        if (!hasFormatOverlap) {
          logger.warn('Data flow incompatibility detected', {
            fromStep: depId,
            fromTool: depTool.name,
            toStep: step.id,
            toTool: currentTool.name,
            fromOutputs: depTool.outputFormats,
            toInputs: currentTool.inputFormats,
          });
          return false;
        }
      }
    }

    return true;
  }

  // ─── Registry Management ───────────────────────────────────────────────

  getToolCapabilities(): ToolCapability[] {
    return [...this.registry];
  }

  getToolByEngine(engine: string): ToolCapability[] {
    return this.registry.filter((t) => t.engine === engine);
  }

  getToolByAction(action: string): ToolCapability[] {
    return this.registry.filter((t) => t.actions.includes(action));
  }

  registerTool(capability: ToolCapability): void {
    const existing = this.registry.findIndex((t) => t.id === capability.id);
    if (existing >= 0) {
      this.registry[existing] = capability;
      logger.info('Tool capability updated', { toolId: capability.id, name: capability.name });
    } else {
      this.registry.push(capability);
      logger.info('Tool capability registered', { toolId: capability.id, name: capability.name });
    }
  }

  unregisterTool(toolId: string): boolean {
    const index = this.registry.findIndex((t) => t.id === toolId);
    if (index >= 0) {
      this.registry.splice(index, 1);
      logger.info('Tool capability unregistered', { toolId });
      return true;
    }
    return false;
  }
}
