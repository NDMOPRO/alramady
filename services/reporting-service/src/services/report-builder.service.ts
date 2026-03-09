import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { NotFoundError, BadRequestError } from '../middleware/errorHandler';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { ensureRuntimeReportRecord } from './report-runtime-record.service';

const prisma = new PrismaClient();

const CACHE_PREFIX = 'reporting:report-builder';
const CACHE_TTL = 300;

interface DataSourceRef {
  datasetId: string;
  query?: Record<string, unknown>;
}

interface SectionDefinition {
  type: 'text' | 'chart' | 'table' | 'image' | 'pagebreak';
  content: Record<string, unknown>;
  position: number;
}

interface HeaderConfig {
  logo?: string;
  title?: string;
  showPageNumbers: boolean;
}

interface FooterConfig {
  text?: string;
  showDate: boolean;
  showPageNumbers: boolean;
}

interface CoverPageConfig {
  title: string;
  subtitle?: string;
  author?: string;
  organization?: string;
  logo?: string;
  date?: string;
  version?: string;
  classification?: string;
  colorScheme?: {
    primary: string;
    secondary: string;
    accent: string;
  };
}

interface ReportConfig {
  sections: Array<SectionDefinition & { id: string; createdAt: string }>;
  header: HeaderConfig | null;
  footer: FooterConfig | null;
  coverPage: CoverPageConfig | null;
  tableOfContents: Array<{ title: string; page: number; level: number }> | null;
  dataSources: DataSourceRef[];
  metadata: Record<string, unknown>;
}

export class ReportBuilderService {
  /**
   * Create a new report definition in Prisma with full configuration.
   */
  async createReport(
    name: string,
    templateId: string | null,
    dataSources: DataSourceRef[],
    tenantId: string,
    userId: string
  ): Promise<Record<string, unknown>> {
    const reportId = uuidv4();
    const now = new Date().toISOString();

    logger.info('Creating report definition', { name, templateId, tenantId, userId });

    if (!name || name.trim().length === 0) {
      throw new BadRequestError('Report name is required and cannot be empty');
    }

    if (!dataSources || dataSources.length === 0) {
      throw new BadRequestError('At least one data source must be specified');
    }

    const validatedSources = dataSources.map((ds) => {
      if (!ds.datasetId || ds.datasetId.trim().length === 0) {
        throw new BadRequestError('Each data source must have a valid datasetId');
      }
      return {
        datasetId: ds.datasetId.trim(),
        query: ds.query || null,
      };
    });

    const initialConfig: ReportConfig = {
      sections: [],
      header: null,
      footer: null,
      coverPage: null,
      tableOfContents: null,
      dataSources: validatedSources,
      metadata: {
        createdBy: userId,
        createdAt: now,
        lastModified: now,
        version: 1,
        buildCount: 0,
      },
    };

    const report = await prisma.reportDefinition.create({
      data: {
        id: reportId,
        name: name.trim(),
        templateId: templateId || null,
        config: JSON.parse(JSON.stringify(initialConfig)),
        status: 'DRAFT',
        tenantId,
        createdBy: userId,
        updatedBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await ensureRuntimeReportRecord({
      reportId,
      tenantId,
      userId,
      name: name.trim(),
      dataSources: validatedSources,
    });

    await cacheDel(`${CACHE_PREFIX}:list:*`);

    logger.info('Report definition created successfully', { reportId: report.id, name });

    return {
      id: report.id,
      name: report.name,
      templateId: report.templateId,
      config: initialConfig,
      status: report.status,
      tenantId: report.tenantId,
      createdBy: report.createdBy,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  }

  /**
   * Execute full build pipeline: fetch data, render sections, produce output.
   */
  async buildReport(reportId: string): Promise<Record<string, unknown>> {
    logger.info('Starting report build pipeline', { reportId });

    const report = await prisma.reportDefinition.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundError('Report', reportId);
    }

    const config = report.config as unknown as ReportConfig;
    const buildId = uuidv4();
    const buildStartTime = Date.now();

    await prisma.reportDefinition.update({
      where: { id: reportId },
      data: {
        status: 'BUILDING',
        updatedAt: new Date(),
      },
    });

    const fetchedDataMap: Record<string, Record<string, unknown>[]> = {};

    for (const source of config.dataSources) {
      try {
        logger.info('Fetching data from source', { datasetId: source.datasetId });

        const datasets = await prisma.$queryRawUnsafe<Array<{ id: string; name: string }>>(
          'SELECT id, name FROM datasets WHERE id = $1 LIMIT 1',
          source.datasetId
        );
        const dataset = datasets[0];

        if (!dataset) {
          logger.warn('Dataset not found, using empty data', { datasetId: source.datasetId });
          fetchedDataMap[source.datasetId] = [];
          continue;
        }

        const rawRows = await prisma.$queryRawUnsafe<Array<{ data: unknown }>>(
          `SELECT data FROM data_rows WHERE dataset_id = $1 ORDER BY row_index ASC`,
          source.datasetId
        );
        let dataRows = rawRows.map((row) => {
          if (typeof row.data === 'string') {
            return JSON.parse(row.data) as Record<string, unknown>;
          }
          return (row.data as Record<string, unknown>) ?? {};
        });

        if (source.query && source.query.filters) {
          const filters = source.query.filters as Record<string, unknown>;

          dataRows = dataRows.filter((row: Record<string, unknown>) => {
            return Object.entries(filters).every(([key, value]) => {
              if (value === null || value === undefined) return true;
              if (typeof value === 'object' && (value as Record<string, unknown>).operator) {
                const filterObj = value as Record<string, unknown>;
                const fieldVal = row[key];
                switch (filterObj.operator) {
                  case 'eq': return fieldVal === filterObj.value;
                  case 'neq': return fieldVal !== filterObj.value;
                  case 'gt': return (fieldVal as number) > (filterObj.value as number);
                  case 'gte': return (fieldVal as number) >= (filterObj.value as number);
                  case 'lt': return (fieldVal as number) < (filterObj.value as number);
                  case 'lte': return (fieldVal as number) <= (filterObj.value as number);
                  case 'contains': return String(fieldVal).includes(String(filterObj.value));
                  case 'in': return Array.isArray(filterObj.value) && (filterObj.value as unknown[]).includes(fieldVal);
                  default: return true;
                }
              }
              return row[key] === value;
            });
          });

          if (source.query.sortBy) {
            const sortField = source.query.sortBy as string;
            const sortDir = source.query.sortOrder === 'desc' ? -1 : 1;
            dataRows.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
              if ((a[sortField] as string) < (b[sortField] as string)) return -1 * sortDir;
              if ((a[sortField] as string) > (b[sortField] as string)) return 1 * sortDir;
              return 0;
            });
          }

          if (source.query.limit && typeof source.query.limit === 'number') {
            dataRows = dataRows.slice(0, source.query.limit);
          }
        }

        fetchedDataMap[source.datasetId] = dataRows;
        logger.info('Data fetched successfully', {
          datasetId: source.datasetId,
          rowCount: dataRows.length,
        });
      } catch (fetchError) {
        const fetchMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
        logger.error('Failed to fetch data from source', {
          datasetId: source.datasetId,
          error: fetchMsg,
        });
        fetchedDataMap[source.datasetId] = [];
      }
    }

    const renderedSections: Array<{ id: string; type: string; renderedContent: Record<string, unknown> | null; position: number }> = [];

    const sortedSections = [...config.sections].sort((a, b) => a.position - b.position);

    for (const section of sortedSections) {
      const rendered: { id: string; type: string; renderedContent: Record<string, unknown> | null; position: number } = {
        id: section.id,
        type: section.type,
        position: section.position,
        renderedContent: null,
      };

      switch (section.type) {
        case 'text': {
          let textContent = typeof section.content === 'string'
            ? section.content
            : section.content?.text || '';
          const variablePattern = /\{\{(\w+(?:\.\w+)*)\}\}/g;
          textContent = textContent.replace(variablePattern, (_match: string, path: string) => {
            const parts = path.split('.');
            let value: unknown = fetchedDataMap;
            for (const part of parts) {
              if (value && typeof value === 'object' && part in value) {
                value = value[part];
              } else {
                return `{{${path}}}`;
              }
            }
            return String(value);
          });
          rendered.renderedContent = { text: textContent, format: section.content?.format || 'plain' };
          break;
        }
        case 'table': {
          const tableDatasetId = section.content?.datasetId;
          const columns = section.content?.columns || [];
          const tableData = tableDatasetId ? (fetchedDataMap[tableDatasetId] || []) : [];
          const headerRow = columns.map((col: unknown) => {
            const colObj = col as Record<string, unknown>;
            return typeof col === 'string' ? col : colObj.label || colObj.field || col;
          });
          const bodyRows = tableData.map((row: Record<string, unknown>) =>
            columns.map((col: unknown) => {
              const colObj = col as Record<string, unknown>;
              const field = (colObj.field || col) as string;
              const value = row[field];
              if (colObj.formatter === 'currency') return `$${Number(value || 0).toFixed(2)}`;
              if (colObj.formatter === 'percent') return `${Number(value || 0).toFixed(1)}%`;
              if (colObj.formatter === 'date') return new Date(value as string).toLocaleDateString();
              return value !== undefined && value !== null ? String(value) : '';
            })
          );
          rendered.renderedContent = {
            headers: headerRow,
            rows: bodyRows,
            totalRows: bodyRows.length,
            styling: section.content?.styling || { bordered: true, striped: true },
          };
          break;
        }
        case 'chart': {
          const chartDatasetId = section.content?.datasetId;
          const chartData = chartDatasetId ? (fetchedDataMap[chartDatasetId] || []) : [];
          const labels = chartData.map((row: Record<string, unknown>) => row[(section.content?.labelField as string) || 'label'] || '');
          const datasets = (section.content?.valueFields || ['value']).map((field: string, idx: number) => ({
            label: field,
            data: chartData.map((row: Record<string, unknown>) => Number(row[field] || 0)),
            backgroundColor: section.content?.colors?.[idx] || `hsl(${idx * 60}, 70%, 60%)`,
          }));
          rendered.renderedContent = {
            chartType: section.content?.chartType || 'bar',
            labels,
            datasets,
            options: section.content?.options || { responsive: true },
          };
          break;
        }
        case 'image': {
          rendered.renderedContent = {
            src: section.content?.src || section.content?.url || '',
            alt: section.content?.alt || 'Report image',
            width: section.content?.width || 'auto',
            height: section.content?.height || 'auto',
            alignment: section.content?.alignment || 'center',
          };
          break;
        }
        case 'pagebreak': {
          rendered.renderedContent = { type: 'pagebreak' };
          break;
        }
        default: {
          rendered.renderedContent = section.content;
        }
      }

      renderedSections.push(rendered);
    }

    const buildEndTime = Date.now();
    const buildDuration = buildEndTime - buildStartTime;

    const outputRecord = await prisma.reportBuildOutput.create({
      data: {
        id: buildId,
        reportId,
        renderedSections: JSON.parse(JSON.stringify(renderedSections)),
        fetchedData: JSON.parse(JSON.stringify(fetchedDataMap)),
        buildDuration,
        status: 'COMPLETED',
        format: 'JSON',
        metadata: JSON.parse(JSON.stringify({
          sectionCount: renderedSections.length,
          dataSourceCount: Object.keys(fetchedDataMap).length,
          totalDataRows: Object.values(fetchedDataMap).reduce((sum, rows) => sum + rows.length, 0),
          builtAt: new Date().toISOString(),
        })),
        createdAt: new Date(),
      },
    });

    const updatedConfig: ReportConfig = {
      ...config,
      metadata: {
        ...config.metadata,
        lastModified: new Date().toISOString(),
        buildCount: (config.metadata.buildCount || 0) + 1,
        lastBuildId: buildId,
        lastBuildDuration: buildDuration,
      },
    };

    await prisma.reportDefinition.update({
      where: { id: reportId },
      data: {
        config: JSON.parse(JSON.stringify(updatedConfig)),
        status: 'BUILT',
        updatedAt: new Date(),
      },
    });

    await cacheDel(`${CACHE_PREFIX}:${reportId}*`);

    logger.info('Report build completed', {
      reportId,
      buildId,
      duration: buildDuration,
      sectionCount: renderedSections.length,
    });

    return {
      buildId: outputRecord.id,
      reportId,
      status: 'completed',
      duration: buildDuration,
      sectionCount: renderedSections.length,
      dataSourceCount: Object.keys(fetchedDataMap).length,
      renderedSections,
      createdAt: outputRecord.createdAt,
    };
  }

  /**
   * Add a section (text, chart, table, image, pagebreak) to the report config.
   */
  async addSection(
    reportId: string,
    section: SectionDefinition
  ): Promise<Record<string, unknown>> {
    logger.info('Adding section to report', { reportId, type: section.type, position: section.position });

    const report = await prisma.reportDefinition.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundError('Report', reportId);
    }

    const validTypes: SectionDefinition['type'][] = ['text', 'chart', 'table', 'image', 'pagebreak'];
    if (!validTypes.includes(section.type)) {
      throw new BadRequestError(`Invalid section type '${section.type}'. Allowed: ${validTypes.join(', ')}`);
    }

    if (typeof section.position !== 'number' || section.position < 0) {
      throw new BadRequestError('Section position must be a non-negative number');
    }

    if (section.type === 'text' && !section.content) {
      throw new BadRequestError('Text sections must have content');
    }

    if (section.type === 'table' && (!section.content || !section.content.columns)) {
      throw new BadRequestError('Table sections must specify columns in content');
    }

    if (section.type === 'chart' && (!section.content || !section.content.chartType)) {
      throw new BadRequestError('Chart sections must specify chartType in content');
    }

    const config = report.config as unknown as ReportConfig;
    const sectionId = uuidv4();
    const now = new Date().toISOString();

    const newSection = {
      id: sectionId,
      type: section.type,
      content: section.content,
      position: section.position,
      createdAt: now,
    };

    const updatedSections = [...config.sections];

    updatedSections.forEach((s) => {
      if (s.position >= section.position) {
        s.position += 1;
      }
    });

    updatedSections.push(newSection);
    updatedSections.sort((a, b) => a.position - b.position);

    const updatedConfig: ReportConfig = {
      ...config,
      sections: updatedSections,
      metadata: {
        ...config.metadata,
        lastModified: now,
      },
    };

    await prisma.reportDefinition.update({
      where: { id: reportId },
      data: {
        config: JSON.parse(JSON.stringify(updatedConfig)),
        updatedAt: new Date(),
      },
    });

    await cacheDel(`${CACHE_PREFIX}:${reportId}*`);

    logger.info('Section added successfully', { reportId, sectionId, type: section.type });

    return {
      sectionId,
      reportId,
      type: section.type,
      position: section.position,
      content: section.content,
      totalSections: updatedSections.length,
      createdAt: now,
    };
  }

  /**
   * Scan all sections, generate a table of contents with page estimates.
   */
  async addTableOfContents(reportId: string): Promise<Record<string, unknown>> {
    logger.info('Generating table of contents', { reportId });

    const report = await prisma.reportDefinition.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundError('Report', reportId);
    }

    const config = report.config as unknown as ReportConfig;
    const sections = [...config.sections].sort((a, b) => a.position - b.position);

    if (sections.length === 0) {
      throw new BadRequestError('Cannot generate table of contents for a report with no sections');
    }

    const tocEntries: Array<{ title: string; page: number; level: number; sectionId: string; type: string }> = [];
    let estimatedPage = 1;
    const linesPerPage = 45;
    let currentLineCount = 0;

    // Reserve first page for TOC itself
    estimatedPage = 2;
    currentLineCount = 0;

    for (const section of sections) {
      let sectionTitle = '';
      let estimatedLines = 0;

      switch (section.type) {
        case 'text': {
          const text = typeof section.content === 'string' ? section.content : section.content?.text || '';
          sectionTitle = section.content?.title || text.substring(0, 60).trim() || `Text Section`;
          estimatedLines = Math.ceil(text.length / 80) + 2;
          break;
        }
        case 'table': {
          sectionTitle = section.content?.title || `Data Table`;
          const rowCount = section.content?.estimatedRows || 20;
          estimatedLines = rowCount + 4; // header + rows + padding
          break;
        }
        case 'chart': {
          sectionTitle = section.content?.title || `Chart - ${section.content?.chartType || 'bar'}`;
          estimatedLines = 20; // charts take roughly 20 lines of space
          break;
        }
        case 'image': {
          sectionTitle = section.content?.title || section.content?.alt || 'Image';
          estimatedLines = 15;
          break;
        }
        case 'pagebreak': {
          estimatedPage += 1;
          currentLineCount = 0;
          continue;
        }
        default: {
          sectionTitle = `Section ${section.position}`;
          estimatedLines = 10;
        }
      }

      const level = section.content?.headingLevel || 1;

      tocEntries.push({
        title: sectionTitle,
        page: estimatedPage,
        level,
        sectionId: section.id,
        type: section.type,
      });

      currentLineCount += estimatedLines;
      if (currentLineCount >= linesPerPage) {
        estimatedPage += Math.floor(currentLineCount / linesPerPage);
        currentLineCount = currentLineCount % linesPerPage;
      }
    }

    const updatedConfig: ReportConfig = {
      ...config,
      tableOfContents: tocEntries,
      metadata: {
        ...config.metadata,
        lastModified: new Date().toISOString(),
        tocGeneratedAt: new Date().toISOString(),
        estimatedPages: estimatedPage,
      },
    };

    await prisma.reportDefinition.update({
      where: { id: reportId },
      data: {
        config: JSON.parse(JSON.stringify(updatedConfig)),
        updatedAt: new Date(),
      },
    });

    await cacheDel(`${CACHE_PREFIX}:${reportId}*`);

    logger.info('Table of contents generated', {
      reportId,
      entryCount: tocEntries.length,
      estimatedPages: estimatedPage,
    });

    return {
      reportId,
      entries: tocEntries,
      totalEntries: tocEntries.length,
      estimatedPages: estimatedPage,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Set header configuration for the report.
   */
  async addHeader(reportId: string, headerConfig: HeaderConfig): Promise<Record<string, unknown>> {
    logger.info('Setting report header', { reportId, hasLogo: !!headerConfig.logo });

    const report = await prisma.reportDefinition.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundError('Report', reportId);
    }

    const config = report.config as unknown as ReportConfig;

    const validatedHeader: HeaderConfig = {
      logo: headerConfig.logo || undefined,
      title: headerConfig.title || undefined,
      showPageNumbers: typeof headerConfig.showPageNumbers === 'boolean'
        ? headerConfig.showPageNumbers
        : false,
    };

    if (validatedHeader.logo && typeof validatedHeader.logo === 'string') {
      const allowedExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.gif'];
      const hasValidExtension = allowedExtensions.some((ext) =>
        validatedHeader.logo!.toLowerCase().endsWith(ext)
      );
      if (!validatedHeader.logo.startsWith('data:image/') && !hasValidExtension) {
        throw new BadRequestError('Logo must be an image file (png, jpg, jpeg, svg, gif) or a data URI');
      }
    }

    const updatedConfig: ReportConfig = {
      ...config,
      header: validatedHeader,
      metadata: {
        ...config.metadata,
        lastModified: new Date().toISOString(),
      },
    };

    await prisma.reportDefinition.update({
      where: { id: reportId },
      data: {
        config: JSON.parse(JSON.stringify(updatedConfig)),
        updatedAt: new Date(),
      },
    });

    await cacheDel(`${CACHE_PREFIX}:${reportId}*`);

    logger.info('Report header set successfully', { reportId });

    return {
      reportId,
      header: validatedHeader,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Set footer configuration for the report.
   */
  async addFooter(reportId: string, footerConfig: FooterConfig): Promise<Record<string, unknown>> {
    logger.info('Setting report footer', { reportId });

    const report = await prisma.reportDefinition.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundError('Report', reportId);
    }

    const config = report.config as unknown as ReportConfig;

    const validatedFooter: FooterConfig = {
      text: footerConfig.text || undefined,
      showDate: typeof footerConfig.showDate === 'boolean'
        ? footerConfig.showDate
        : false,
      showPageNumbers: typeof footerConfig.showPageNumbers === 'boolean'
        ? footerConfig.showPageNumbers
        : false,
    };

    if (validatedFooter.text && validatedFooter.text.length > 500) {
      throw new BadRequestError('Footer text cannot exceed 500 characters');
    }

    const updatedConfig: ReportConfig = {
      ...config,
      footer: validatedFooter,
      metadata: {
        ...config.metadata,
        lastModified: new Date().toISOString(),
      },
    };

    await prisma.reportDefinition.update({
      where: { id: reportId },
      data: {
        config: JSON.parse(JSON.stringify(updatedConfig)),
        updatedAt: new Date(),
      },
    });

    await cacheDel(`${CACHE_PREFIX}:${reportId}*`);

    logger.info('Report footer set successfully', { reportId });

    return {
      reportId,
      footer: validatedFooter,
      updatedAt: new Date().toISOString(),
    };
  }
  /**
   * Set a professional cover page for the report.
   * Validates all fields, stores in the report config.
   */
  async addCoverPage(reportId: string, coverConfig: CoverPageConfig): Promise<Record<string, unknown>> {
    logger.info('Setting report cover page', { reportId, title: coverConfig.title });

    const report = await prisma.reportDefinition.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundError('Report', reportId);
    }

    if (!coverConfig.title || coverConfig.title.trim().length === 0) {
      throw new BadRequestError('Cover page title is required and cannot be empty');
    }

    if (coverConfig.title.length > 200) {
      throw new BadRequestError('Cover page title cannot exceed 200 characters');
    }

    if (coverConfig.subtitle && coverConfig.subtitle.length > 300) {
      throw new BadRequestError('Cover page subtitle cannot exceed 300 characters');
    }

    if (coverConfig.logo && typeof coverConfig.logo === 'string') {
      const allowedExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.gif'];
      const hasValidExtension = allowedExtensions.some((ext) =>
        coverConfig.logo!.toLowerCase().endsWith(ext)
      );
      if (!coverConfig.logo.startsWith('data:image/') && !hasValidExtension) {
        throw new BadRequestError('Logo must be an image file (png, jpg, jpeg, svg, gif) or a data URI');
      }
    }

    const validatedCover: CoverPageConfig = {
      title: coverConfig.title.trim(),
      subtitle: coverConfig.subtitle?.trim() || undefined,
      author: coverConfig.author?.trim() || undefined,
      organization: coverConfig.organization?.trim() || undefined,
      logo: coverConfig.logo || undefined,
      date: coverConfig.date || new Date().toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      version: coverConfig.version?.trim() || undefined,
      classification: coverConfig.classification?.trim() || undefined,
      colorScheme: coverConfig.colorScheme || {
        primary: '#1a365d',
        secondary: '#2d3748',
        accent: '#3182ce',
      },
    };

    const config = report.config as unknown as ReportConfig;

    const updatedConfig: ReportConfig = {
      ...config,
      coverPage: validatedCover,
      metadata: {
        ...config.metadata,
        lastModified: new Date().toISOString(),
        coverPageAddedAt: new Date().toISOString(),
      },
    };

    await prisma.reportDefinition.update({
      where: { id: reportId },
      data: {
        config: JSON.parse(JSON.stringify(updatedConfig)),
        updatedAt: new Date(),
      },
    });

    await cacheDel(`${CACHE_PREFIX}:${reportId}*`);

    logger.info('Report cover page set successfully', { reportId });

    return {
      reportId,
      coverPage: validatedCover,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Remove the cover page from a report.
   */
  async removeCoverPage(reportId: string): Promise<Record<string, unknown>> {
    logger.info('Removing report cover page', { reportId });

    const report = await prisma.reportDefinition.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundError('Report', reportId);
    }

    const config = report.config as unknown as ReportConfig;

    if (!config.coverPage) {
      throw new BadRequestError('Report does not have a cover page to remove');
    }

    const updatedConfig: ReportConfig = {
      ...config,
      coverPage: null,
      metadata: {
        ...config.metadata,
        lastModified: new Date().toISOString(),
      },
    };

    await prisma.reportDefinition.update({
      where: { id: reportId },
      data: {
        config: JSON.parse(JSON.stringify(updatedConfig)),
        updatedAt: new Date(),
      },
    });

    await cacheDel(`${CACHE_PREFIX}:${reportId}*`);

    logger.info('Report cover page removed successfully', { reportId });

    return {
      reportId,
      coverPage: null,
      updatedAt: new Date().toISOString(),
    };
  }
}

export const reportBuilderService = new ReportBuilderService();
