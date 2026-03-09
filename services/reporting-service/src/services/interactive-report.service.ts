import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface InteractiveReport {
  id: string;
  name: string;
  description: string;
  baseReportId: string;
  elements: InteractiveElement[];
  parameters: ReportParameter[];
  linkedReports: ReportLink[];
  bookmarks: Bookmark[];
  version: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InteractiveElement {
  id: string;
  type: 'filter' | 'drill_down' | 'sort' | 'toggle' | 'slider' | 'date_picker';
  config: FilterConfig | DrillDownConfig | SortConfig | ToggleConfig;
  targetSections: string[];
  position: { x: number; y: number; width: number; height: number };
}

export interface FilterConfig {
  field: string;
  filterType: 'single_select' | 'multi_select' | 'range' | 'text_search' | 'date_range';
  options?: { label: string; value: unknown }[];
  defaultValue?: unknown;
  cascadeFrom?: string;
  dependentFilters?: string[];
}

export interface DrillDownConfig {
  levels: DrillDownLevel[];
  currentLevel: number;
  breadcrumb: { level: number; label: string; filterValue: unknown }[];
}

export interface DrillDownLevel {
  field: string;
  label: string;
  aggregation: 'sum' | 'count' | 'avg' | 'min' | 'max';
  chartType?: string;
}

export interface SortConfig {
  field: string;
  direction: 'asc' | 'desc';
  multiSort: boolean;
}

export interface ToggleConfig {
  options: { label: string; value: string }[];
  defaultValue: string;
  targetProperty: string;
}

export interface ReportParameter {
  id: string;
  name: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'enum';
  defaultValue?: unknown;
  required: boolean;
  validValues?: unknown[];
  description: string;
}

export interface ReportLink {
  sourceReportId: string;
  targetReportId: string;
  linkType: 'drill_through' | 'reference' | 'subreport';
  parameterMapping: { sourceField: string; targetParam: string }[];
  label: string;
}

export interface Bookmark {
  id: string;
  name: string;
  description?: string;
  state: BookmarkState;
  createdBy: string;
  isDefault: boolean;
  createdAt: Date;
}

export interface BookmarkState {
  filterValues: Record<string, unknown>;
  sortState: { field: string; direction: 'asc' | 'desc' }[];
  drillDownState: Record<string, { level: number; filterValue: unknown }>;
  scrollPosition: { x: number; y: number };
  expandedSections: string[];
}

export interface ReportComment {
  id: string;
  reportId: string;
  sectionId?: string;
  userId: string;
  userName: string;
  content: string;
  parentCommentId?: string;
  resolved: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export interface VersionComparison {
  version1: number;
  version2: number;
  changes: {
    type: 'added' | 'removed' | 'modified';
    elementType: string;
    elementId: string;
    description: string;
    oldValue?: unknown;
    newValue?: unknown;
  }[];
  summary: string;
}

export interface ReportAnnotation {
  id: string;
  reportId: string;
  sectionId: string;
  type: 'highlight' | 'note' | 'arrow' | 'rectangle' | 'callout';
  position: { x: number; y: number; width?: number; height?: number };
  content?: string;
  color: string;
  createdBy: string;
  createdAt: Date;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class InteractiveReportService {
  constructor(private prisma: PrismaClient) {}

  async createInteractiveReport(
    input: Omit<InteractiveReport, 'id' | 'version' | 'createdAt' | 'updatedAt'>,
  ): Promise<InteractiveReport> {
    const validationErrors = this.validateReport(input);
    if (validationErrors.length > 0) {
      throw new Error(`Report validation failed: ${validationErrors.join(', ')}`);
    }

    const paramValidation = this.validateParameters(input.parameters);
    if (paramValidation.length > 0) {
      throw new Error(`Parameter validation failed: ${paramValidation.join(', ')}`);
    }

    const report = await this.prisma.interactiveReport.create({
      data: {
        name: input.name,
        description: input.description || '',
        reportId: input.baseReportId,
        elements: JSON.stringify(input.elements),
        parameters: JSON.stringify(input.parameters),
        linkedReports: JSON.stringify(input.linkedReports),
        bookmarks: JSON.stringify(input.bookmarks),
        version: 1,
        createdBy: input.createdBy,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await this.prisma.interactiveReportVersion.create({
      data: {
        reportId: report.id,
        version: 1,
        elements: JSON.stringify(input.elements),
        parameters: JSON.stringify(input.parameters),
        linkedReports: JSON.stringify(input.linkedReports),
        changedBy: input.createdBy,
        changeDescription: 'Initial creation',
        createdAt: new Date(),
      },
    });

    return {
      id: report.id,
      name: input.name,
      description: input.description,
      baseReportId: input.baseReportId,
      elements: input.elements,
      parameters: input.parameters,
      linkedReports: input.linkedReports,
      bookmarks: input.bookmarks,
      version: 1,
      createdBy: input.createdBy,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  }

  private validateReport(input: Omit<InteractiveReport, 'id' | 'version' | 'createdAt' | 'updatedAt'>): string[] {
    const errors: string[] = [];
    if (!input.name || input.name.trim().length === 0) errors.push('Report name is required');
    if (!input.baseReportId) errors.push('Base report ID is required');

    const elementIds = new Set<string>();
    for (const element of input.elements) {
      if (elementIds.has(element.id)) errors.push(`Duplicate element ID: ${element.id}`);
      elementIds.add(element.id);

      if (!element.type) errors.push(`Element ${element.id}: type is required`);
      if (!element.targetSections || element.targetSections.length === 0) {
        errors.push(`Element ${element.id}: must target at least one section`);
      }
    }

    for (const link of input.linkedReports) {
      if (!link.targetReportId) errors.push('Linked report must have a target report ID');
      if (!link.parameterMapping || link.parameterMapping.length === 0) {
        errors.push('Linked report must have parameter mappings');
      }
    }

    return errors;
  }

  private validateParameters(parameters: ReportParameter[]): string[] {
    const errors: string[] = [];
    const names = new Set<string>();

    for (const param of parameters) {
      if (names.has(param.name)) errors.push(`Duplicate parameter name: ${param.name}`);
      names.add(param.name);
      if (!param.name || param.name.trim().length === 0) errors.push('Parameter name is required');
      if (!param.type) errors.push(`Parameter ${param.name}: type is required`);

      if (param.required && param.defaultValue === undefined) {
        errors.push(`Parameter ${param.name}: required parameters should have a default value`);
      }

      if (param.type === 'enum' && (!param.validValues || param.validValues.length === 0)) {
        errors.push(`Parameter ${param.name}: enum type must specify valid values`);
      }

      if (param.defaultValue !== undefined && param.validValues && param.validValues.length > 0) {
        if (!param.validValues.includes(param.defaultValue)) {
          errors.push(`Parameter ${param.name}: default value not in valid values list`);
        }
      }
    }

    return errors;
  }

  async executeWithParameters(
    reportId: string,
    paramValues: Record<string, unknown>,
  ): Promise<{ data: unknown[]; appliedParams: Record<string, unknown>; executionTimeMs: number }> {
    const report = await this.getReport(reportId);
    const startTime = Date.now();
    const appliedParams: Record<string, unknown> = {};

    for (const param of report.parameters) {
      const value = paramValues[param.name];
      if (value !== undefined) {
        if (param.type === 'number' && typeof value !== 'number') {
          throw new Error(`Parameter ${param.name} expects a number`);
        }
        if (param.type === 'enum' && param.validValues && !param.validValues.includes(value)) {
          throw new Error(`Parameter ${param.name}: invalid value "${value}"`);
        }
        appliedParams[param.name] = value;
      } else if (param.required) {
        if (param.defaultValue !== undefined) {
          appliedParams[param.name] = param.defaultValue;
        } else {
          throw new Error(`Required parameter ${param.name} is missing`);
        }
      } else if (param.defaultValue !== undefined) {
        appliedParams[param.name] = param.defaultValue;
      }
    }

    const baseReportDef = await this.prisma.reportDefinition.findUnique({
      where: { id: report.baseReportId },
    });

    if (!baseReportDef) {
      throw new Error(`Base report definition ${report.baseReportId} not found`);
    }

    const config = baseReportDef.config as Record<string, unknown> || {};
    const dataSources = config.dataSources || (baseReportDef.dataSources as unknown[]) || [];
    const primaryDataset = dataSources[0]?.datasetId;

    // Use parameterized filtering on dataset rows instead of raw SQL
    const dataset = primaryDataset
      ? await this.prisma.dataset.findUnique({ where: { id: primaryDataset } })
      : null;

    let data: unknown[] = [];
    if (dataset) {
      const rawData = (dataset as unknown as Record<string, unknown>).data;
      let rows: Record<string, unknown>[] = Array.isArray(rawData) ? rawData : [];

      // Apply parameter filters in-memory (safe from injection)
      for (const [name, value] of Object.entries(appliedParams)) {
        if (value === null || value === undefined) continue;
        if (Array.isArray(value)) {
          rows = rows.filter(row => value.includes(row[name]));
        } else {
          rows = rows.filter(row => row[name] === value);
        }
      }

      data = rows;
    }
    const executionTimeMs = Date.now() - startTime;

    return { data, appliedParams, executionTimeMs };
  }

  async executeDrillDown(
    reportId: string,
    elementId: string,
    drillValue: unknown,
    currentParams?: Record<string, unknown>,
  ): Promise<{ data: unknown[]; breadcrumb: DrillDownConfig['breadcrumb']; currentLevel: number }> {
    const report = await this.getReport(reportId);
    const element = report.elements.find(e => e.id === elementId);
    if (!element || element.type !== 'drill_down') {
      throw new Error(`Drill-down element ${elementId} not found`);
    }

    const drillConfig = element.config as DrillDownConfig;
    const nextLevel = drillConfig.currentLevel + 1;

    if (nextLevel >= drillConfig.levels.length) {
      throw new Error('Already at the deepest drill-down level');
    }

    const currentLevelConfig = drillConfig.levels[drillConfig.currentLevel];
    const nextLevelConfig = drillConfig.levels[nextLevel];

    const breadcrumb = [
      ...drillConfig.breadcrumb,
      { level: drillConfig.currentLevel, label: String(drillValue), filterValue: drillValue },
    ];

    const baseReportDef = await this.prisma.reportDefinition.findUnique({
      where: { id: report.baseReportId },
    });

    if (!baseReportDef) {
      throw new Error(`Base report definition ${report.baseReportId} not found`);
    }

    const defConfig = baseReportDef.config as Record<string, unknown> || {};
    const dataSources = defConfig.dataSources || (baseReportDef.dataSources as unknown[]) || [];
    const primaryDataset = dataSources[0]?.datasetId;

    const dataset = primaryDataset
      ? await this.prisma.dataset.findUnique({ where: { id: primaryDataset } })
      : null;

    let data: unknown[] = [];
    if (dataset) {
      const rawData = (dataset as unknown as Record<string, unknown>).data;
      let rows: Record<string, unknown>[] = Array.isArray(rawData) ? rawData : [];

      // Apply breadcrumb filters in-memory (safe from injection)
      for (const crumb of breadcrumb) {
        const levelConfig = drillConfig.levels[crumb.level];
        rows = rows.filter(row => String(row[levelConfig.field]) === String(crumb.filterValue));
      }

      if (currentParams) {
        for (const [key, value] of Object.entries(currentParams)) {
          if (value !== null && value !== undefined) {
            rows = rows.filter(row => String(row[key]) === String(value));
          }
        }
      }

      // Group by next level field and aggregate
      const aggField = nextLevelConfig.field;
      const groups = new Map<string, number[]>();
      for (const row of rows) {
        const key = String(row[aggField] ?? '');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(Number(row[aggField]) || 0);
      }

      const aggFunc = nextLevelConfig.aggregation;
      data = Array.from(groups.entries()).map(([key, values]) => {
        let aggValue: number;
        switch (aggFunc) {
          case 'sum': aggValue = values.reduce((a, b) => a + b, 0); break;
          case 'avg': aggValue = values.reduce((a, b) => a + b, 0) / values.length; break;
          case 'count': aggValue = values.length; break;
          case 'min': aggValue = Math.min(...values); break;
          case 'max': aggValue = Math.max(...values); break;
          default: aggValue = values.length;
        }
        return { [aggField]: key, agg_value: aggValue };
      }).sort((a, b) => (b.agg_value as number) - (a.agg_value as number));
    }

    await this.prisma.interactiveReport.update({
      where: { id: reportId },
      data: {
        elements: JSON.stringify(report.elements.map(e =>
          e.id === elementId
            ? { ...e, config: { ...drillConfig, currentLevel: nextLevel, breadcrumb } }
            : e,
        )),
        updatedAt: new Date(),
      },
    });

    return { data, breadcrumb, currentLevel: nextLevel };
  }

  async createBookmark(
    reportId: string,
    name: string,
    state: BookmarkState,
    createdBy: string,
    isDefault: boolean = false,
  ): Promise<Bookmark> {
    const report = await this.getReport(reportId);
    const bookmarkId = `bm_${Date.now()}_${crypto.randomUUID().split('-')[0]}`;

    if (isDefault) {
      const updatedBookmarks = report.bookmarks.map(b => ({ ...b, isDefault: false }));
      report.bookmarks = updatedBookmarks;
    }

    const bookmark: Bookmark = {
      id: bookmarkId,
      name,
      state,
      createdBy,
      isDefault,
      createdAt: new Date(),
    };

    report.bookmarks.push(bookmark);

    await this.prisma.interactiveReport.update({
      where: { id: reportId },
      data: {
        bookmarks: JSON.stringify(report.bookmarks),
        updatedAt: new Date(),
      },
    });

    return bookmark;
  }

  async applyBookmark(reportId: string, bookmarkId: string): Promise<BookmarkState> {
    const report = await this.getReport(reportId);
    const bookmark = report.bookmarks.find(b => b.id === bookmarkId);
    if (!bookmark) {
      throw new Error(`Bookmark ${bookmarkId} not found`);
    }

    const updatedElements = report.elements.map(element => {
      if (element.type === 'filter') {
        const filterConfig = element.config as FilterConfig;
        const savedValue = bookmark.state.filterValues[element.id];
        if (savedValue !== undefined) {
          return { ...element, config: { ...filterConfig, defaultValue: savedValue } };
        }
      }

      if (element.type === 'drill_down') {
        const drillConfig = element.config as DrillDownConfig;
        const savedDrill = bookmark.state.drillDownState[element.id];
        if (savedDrill) {
          return { ...element, config: { ...drillConfig, currentLevel: savedDrill.level } };
        }
      }

      return element;
    });

    await this.prisma.interactiveReport.update({
      where: { id: reportId },
      data: {
        elements: JSON.stringify(updatedElements),
        updatedAt: new Date(),
      },
    });

    return bookmark.state;
  }

  async addComment(
    reportId: string,
    userId: string,
    userName: string,
    content: string,
    sectionId?: string,
    parentCommentId?: string,
  ): Promise<ReportComment> {
    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(content)) !== null) {
      mentions.push(match[1]);
    }

    const comment = await this.prisma.reportComment.create({
      data: {
        reportId,
        sectionId: sectionId || null,
        userId,
        userName,
        content,
        parentCommentId: parentCommentId || null,
        resolved: false,
        mentions: JSON.stringify(mentions),
        createdAt: new Date(),
      },
    });

    return {
      id: comment.id,
      reportId,
      sectionId,
      userId,
      userName,
      content,
      parentCommentId,
      resolved: false,
      createdAt: comment.createdAt,
    };
  }

  async getComments(
    reportId: string,
    options?: { sectionId?: string; resolved?: boolean },
  ): Promise<ReportComment[]> {
    const where: Record<string, unknown> = { reportId };
    if (options?.sectionId) where.sectionId = options.sectionId;
    if (options?.resolved !== undefined) where.resolved = options.resolved;

    const comments = await this.prisma.reportComment.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    return comments.map(c => ({
      id: c.id,
      reportId: c.reportId,
      sectionId: c.sectionId || undefined,
      userId: c.userId,
      userName: c.userName,
      content: c.content,
      parentCommentId: c.parentCommentId || undefined,
      resolved: c.resolved,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt || undefined,
    }));
  }

  async resolveComment(commentId: string, userId: string): Promise<void> {
    await this.prisma.reportComment.update({
      where: { id: commentId },
      data: { resolved: true, resolvedBy: userId, resolvedAt: new Date(), updatedAt: new Date() },
    });

    const childComments = await this.prisma.reportComment.findMany({
      where: { parentCommentId: commentId },
    });

    for (const child of childComments) {
      await this.prisma.reportComment.update({
        where: { id: child.id },
        data: { resolved: true, resolvedBy: userId, resolvedAt: new Date(), updatedAt: new Date() },
      });
    }
  }

  async compareVersions(reportId: string, version1: number, version2: number): Promise<VersionComparison> {
    const [v1Record, v2Record] = await Promise.all([
      this.prisma.interactiveReportVersion.findFirst({
        where: { reportId, version: version1 },
      }),
      this.prisma.interactiveReportVersion.findFirst({
        where: { reportId, version: version2 },
      }),
    ]);

    if (!v1Record || !v2Record) {
      throw new Error('One or both versions not found');
    }

    const v1Elements: InteractiveElement[] = JSON.parse(v1Record.elements as string);
    const v2Elements: InteractiveElement[] = JSON.parse(v2Record.elements as string);
    const v1Params: ReportParameter[] = JSON.parse(v1Record.parameters as string);
    const v2Params: ReportParameter[] = JSON.parse(v2Record.parameters as string);

    const changes: VersionComparison['changes'] = [];

    const v1ElementMap = new Map(v1Elements.map(e => [e.id, e]));
    const v2ElementMap = new Map(v2Elements.map(e => [e.id, e]));

    for (const [id, element] of v2ElementMap) {
      if (!v1ElementMap.has(id)) {
        changes.push({
          type: 'added',
          elementType: 'interactive_element',
          elementId: id,
          description: `Added ${element.type} element`,
          newValue: element,
        });
      } else {
        const oldElement = v1ElementMap.get(id)!;
        if (JSON.stringify(oldElement) !== JSON.stringify(element)) {
          changes.push({
            type: 'modified',
            elementType: 'interactive_element',
            elementId: id,
            description: `Modified ${element.type} element`,
            oldValue: oldElement,
            newValue: element,
          });
        }
      }
    }

    for (const [id, element] of v1ElementMap) {
      if (!v2ElementMap.has(id)) {
        changes.push({
          type: 'removed',
          elementType: 'interactive_element',
          elementId: id,
          description: `Removed ${element.type} element`,
          oldValue: element,
        });
      }
    }

    const v1ParamMap = new Map(v1Params.map(p => [p.id, p]));
    const v2ParamMap = new Map(v2Params.map(p => [p.id, p]));

    for (const [id, param] of v2ParamMap) {
      if (!v1ParamMap.has(id)) {
        changes.push({ type: 'added', elementType: 'parameter', elementId: id, description: `Added parameter "${param.name}"`, newValue: param });
      }
    }

    for (const [id, param] of v1ParamMap) {
      if (!v2ParamMap.has(id)) {
        changes.push({ type: 'removed', elementType: 'parameter', elementId: id, description: `Removed parameter "${param.name}"`, oldValue: param });
      }
    }

    const added = changes.filter(c => c.type === 'added').length;
    const removed = changes.filter(c => c.type === 'removed').length;
    const modified = changes.filter(c => c.type === 'modified').length;
    const summary = `${changes.length} changes: ${added} added, ${removed} removed, ${modified} modified`;

    return { version1, version2, changes, summary };
  }

  async addAnnotation(
    reportId: string,
    sectionId: string,
    type: ReportAnnotation['type'],
    position: ReportAnnotation['position'],
    createdBy: string,
    content?: string,
    color?: string,
  ): Promise<ReportAnnotation> {
    const annotation = await this.prisma.reportAnnotation.create({
      data: {
        reportId,
        sectionId,
        type,
        position: JSON.stringify(position),
        content: content || null,
        color: color || '#FFEB3B',
        createdBy,
        createdAt: new Date(),
      },
    });

    return {
      id: annotation.id,
      reportId,
      sectionId,
      type,
      position,
      content,
      color: annotation.color ?? '#FFEB3B',
      createdBy,
      createdAt: annotation.createdAt,
    };
  }

  async createReportLink(
    sourceReportId: string,
    targetReportId: string,
    linkType: ReportLink['linkType'],
    parameterMapping: ReportLink['parameterMapping'],
    label: string,
  ): Promise<ReportLink> {
    const sourceReport = await this.getReport(sourceReportId);
    const targetReport = await this.getReport(targetReportId);

    for (const mapping of parameterMapping) {
      const targetParam = targetReport.parameters.find(p => p.name === mapping.targetParam);
      if (!targetParam) {
        throw new Error(`Target parameter "${mapping.targetParam}" not found in target report`);
      }
    }

    const link: ReportLink = {
      sourceReportId,
      targetReportId,
      linkType,
      parameterMapping,
      label,
    };

    sourceReport.linkedReports.push(link);

    await this.prisma.interactiveReport.update({
      where: { id: sourceReportId },
      data: {
        linkedReports: JSON.stringify(sourceReport.linkedReports),
        updatedAt: new Date(),
      },
    });

    return link;
  }

  private async getReport(reportId: string): Promise<InteractiveReport> {
    const report = await this.prisma.interactiveReport.findUniqueOrThrow({
      where: { id: reportId },
    });

    return {
      id: report.id,
      name: report.name,
      description: report.description || '',
      baseReportId: report.reportId ?? '',
      elements: JSON.parse(report.elements as string || '[]'),
      parameters: JSON.parse(report.parameters as string || '[]'),
      linkedReports: JSON.parse(report.linkedReports as string || '[]'),
      bookmarks: JSON.parse(report.bookmarks as string || '[]'),
      version: report.version,
      createdBy: report.createdBy,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  }
}
