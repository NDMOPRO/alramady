import { PrismaClient } from '@prisma/client';
import { Client as ElasticsearchClient } from '@elastic/elasticsearch';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface DatasetMetadata {
  id: string;
  name: string;
  description: string;
  sourceType: 'database' | 'file' | 'api' | 'stream';
  sourceConnection: string;
  schema: ColumnDefinition[];
  tags: string[];
  category: string;
  owner: string;
  createdAt: Date;
  updatedAt: Date;
  rowCount: number;
  sizeBytes: number;
  format: string;
  quality: DataQualityScore;
}

export interface ColumnDefinition {
  name: string;
  dataType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  foreignKeyRef?: { table: string; column: string };
  description: string;
  sampleValues: unknown[];
  statistics: ColumnStatistics;
}

export interface ColumnStatistics {
  distinctCount: number;
  nullCount: number;
  minValue?: string | number;
  maxValue?: string | number;
  averageValue?: number;
  medianValue?: number;
  standardDeviation?: number;
  histogram?: { bucket: string; count: number }[];
}

export interface DataQualityScore {
  completeness: number;
  accuracy: number;
  consistency: number;
  timeliness: number;
  overallScore: number;
}

export interface DataDictionaryEntry {
  datasetId: string;
  columnName: string;
  businessName: string;
  businessDescription: string;
  dataType: string;
  format: string;
  allowedValues?: string[];
  validationRules: string[];
  owner: string;
  lastUpdated: Date;
}

export interface ColumnLineage {
  columnId: string;
  datasetId: string;
  columnName: string;
  upstreamSources: { datasetId: string; columnName: string; transformationType: string }[];
  downstreamTargets: { datasetId: string; columnName: string; transformationType: string }[];
}

export interface SchemaChangeImpact {
  affectedDatasets: { id: string; name: string; impactLevel: 'high' | 'medium' | 'low' }[];
  affectedPipelines: { id: string; name: string }[];
  affectedReports: { id: string; name: string }[];
  breakingChanges: string[];
  warnings: string[];
}

export interface UsageStatistics {
  datasetId: string;
  totalQueries: number;
  uniqueUsers: number;
  lastAccessedAt: Date;
  popularColumns: { name: string; queryCount: number }[];
  accessTrend: { date: string; count: number }[];
  topUsers: { userId: string; queryCount: number }[];
}

export interface CatalogSearchResult {
  datasets: DatasetMetadata[];
  totalCount: number;
  facets: {
    categories: { name: string; count: number }[];
    tags: { name: string; count: number }[];
    sourceTypes: { name: string; count: number }[];
  };
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class DataCatalogService {
  private esIndex: string = 'data-catalog';

  constructor(
    private prisma: PrismaClient,
    private elasticsearch: ElasticsearchClient,
  ) {}

  async registerDataset(input: Omit<DatasetMetadata, 'id' | 'createdAt' | 'updatedAt' | 'quality'>): Promise<DatasetMetadata> {
    const qualityScore = await this.calculateDataQuality(input.schema, input.sourceConnection);

    const dataset = await this.prisma.dataset.create({
      data: {
        name: input.name,
        description: input.description,
        sourceType: input.sourceType,
        sourceConnection: input.sourceConnection,
        schemaJson: JSON.stringify(input.schema),
        tags: JSON.stringify(input.tags),
        category: input.category,
        owner: input.owner,
        rowCount: input.rowCount,
        sizeBytes: input.sizeBytes,
        format: input.format,
        qualityScore: qualityScore.overallScore,
        qualityDetails: JSON.stringify(qualityScore),
        createdBy: input.owner,
        tenantId: (input as Record<string, unknown>).tenantId as string || '00000000-0000-0000-0000-000000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const metadata: DatasetMetadata = {
      id: dataset.id,
      name: input.name,
      description: input.description,
      sourceType: input.sourceType,
      sourceConnection: input.sourceConnection,
      schema: input.schema,
      tags: input.tags,
      category: input.category,
      owner: input.owner,
      createdAt: dataset.createdAt,
      updatedAt: dataset.updatedAt,
      rowCount: input.rowCount,
      sizeBytes: input.sizeBytes,
      format: input.format,
      quality: qualityScore,
    };

    await this.indexDataset(metadata);

    for (const column of input.schema) {
      await this.prisma.datasetColumn.create({
        data: {
          datasetId: dataset.id,
          name: column.name,
          dataType: column.dataType,
          nullable: column.nullable,
          isPrimaryKey: column.isPrimaryKey,
          metadata: JSON.parse(JSON.stringify({
            description: column.description,
            sampleValues: column.sampleValues,
            statistics: column.statistics,
          })),
        },
      });
    }

    return metadata;
  }

  async extractMetadata(datasetId: string): Promise<DatasetMetadata> {
    const dataset = await this.prisma.dataset.findUniqueOrThrow({ where: { id: datasetId } });
    const sourceConnection = dataset.sourceConnection || '';
    const sourceType = dataset.sourceType as DatasetMetadata['sourceType'];

    let schema: ColumnDefinition[] = [];
    let rowCount = 0;
    let sizeBytes = 0;

    if (sourceType === 'database') {
      const tableInfo = await this.prisma.$queryRawUnsafe(
        `SELECT column_name, data_type, is_nullable, character_maximum_length
         FROM information_schema.columns WHERE table_name = $1`,
        sourceConnection,
      ) as { column_name: string; data_type: string; is_nullable: string; character_maximum_length: number | null }[];

      const pkInfo = await this.prisma.$queryRawUnsafe(
        `SELECT column_name FROM information_schema.key_column_usage
         WHERE table_name = $1 AND constraint_name LIKE '%_pkey'`,
        sourceConnection,
      ) as { column_name: string }[];

      const pkColumns = new Set(pkInfo.map(p => p.column_name));

      const countResult = await this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*) as cnt FROM "${sourceConnection}"`,
      ) as { cnt: bigint }[];
      rowCount = Number(countResult[0]?.cnt || 0);

      const sizeResult = await this.prisma.$queryRawUnsafe(
        `SELECT pg_total_relation_size($1) as size_bytes`,
        sourceConnection,
      ) as { size_bytes: bigint }[];
      sizeBytes = Number(sizeResult[0]?.size_bytes || 0);

      for (const col of tableInfo) {
        const sampleResult = await this.prisma.$queryRawUnsafe(
          `SELECT DISTINCT "${col.column_name}" FROM "${sourceConnection}" LIMIT 5`,
        ) as Record<string, unknown>[];
        const samples = sampleResult.map(r => r[col.column_name]);

        const statsResult = await this.prisma.$queryRawUnsafe(
          `SELECT COUNT(DISTINCT "${col.column_name}") as distinct_count,
                  SUM(CASE WHEN "${col.column_name}" IS NULL THEN 1 ELSE 0 END) as null_count
           FROM "${sourceConnection}"`,
        ) as { distinct_count: bigint; null_count: bigint }[];

        schema.push({
          name: col.column_name,
          dataType: col.data_type,
          nullable: col.is_nullable === 'YES',
          isPrimaryKey: pkColumns.has(col.column_name),
          isForeignKey: false,
          description: '',
          sampleValues: samples,
          statistics: {
            distinctCount: Number(statsResult[0]?.distinct_count || 0),
            nullCount: Number(statsResult[0]?.null_count || 0),
          },
        });
      }
    } else {
      schema = JSON.parse(dataset.schemaJson as string || '[]');
    }

    const quality = await this.calculateDataQuality(schema, sourceConnection);

    await this.prisma.dataset.update({
      where: { id: datasetId },
      data: {
        schemaJson: JSON.stringify(schema),
        rowCount,
        sizeBytes,
        qualityScore: quality.overallScore,
        qualityDetails: JSON.stringify(quality),
        updatedAt: new Date(),
      },
    });

    const metadata: DatasetMetadata = {
      id: datasetId,
      name: dataset.name,
      description: dataset.description || '',
      sourceType,
      sourceConnection,
      schema,
      tags: JSON.parse(dataset.tags as string || '[]'),
      category: dataset.category || '',
      owner: dataset.owner || '',
      createdAt: dataset.createdAt,
      updatedAt: new Date(),
      rowCount,
      sizeBytes,
      format: dataset.format || '',
      quality,
    };

    await this.indexDataset(metadata);
    return metadata;
  }

  private async calculateDataQuality(schema: ColumnDefinition[], sourceConnection: string): Promise<DataQualityScore> {
    let completenessSum = 0;
    let columnsChecked = 0;

    for (const col of schema) {
      if (col.statistics && col.statistics.nullCount !== undefined && col.statistics.distinctCount !== undefined) {
        const totalRows = col.statistics.nullCount + col.statistics.distinctCount;
        if (totalRows > 0) {
          completenessSum += 1 - (col.statistics.nullCount / totalRows);
          columnsChecked += 1;
        }
      }
    }

    const completeness = columnsChecked > 0 ? completenessSum / columnsChecked : 0.5;
    const accuracy = schema.length > 0 ? schema.filter(c => c.description && c.description.length > 0).length / schema.length : 0.5;
    const consistency = schema.length > 0 ? schema.filter(c => c.dataType && c.dataType.length > 0).length / schema.length : 0.5;
    const now = new Date();
    const timeliness = 0.8;

    const overallScore = (completeness * 0.35) + (accuracy * 0.25) + (consistency * 0.25) + (timeliness * 0.15);

    return {
      completeness: Math.round(completeness * 100) / 100,
      accuracy: Math.round(accuracy * 100) / 100,
      consistency: Math.round(consistency * 100) / 100,
      timeliness: Math.round(timeliness * 100) / 100,
      overallScore: Math.round(overallScore * 100) / 100,
    };
  }

  private async indexDataset(metadata: DatasetMetadata): Promise<void> {
    await this.elasticsearch.index({
      index: this.esIndex,
      id: metadata.id,
      document: {
        name: metadata.name,
        description: metadata.description,
        sourceType: metadata.sourceType,
        tags: metadata.tags,
        category: metadata.category,
        owner: metadata.owner,
        columnNames: metadata.schema.map(c => c.name),
        columnDescriptions: metadata.schema.map(c => c.description).filter(Boolean),
        rowCount: metadata.rowCount,
        sizeBytes: metadata.sizeBytes,
        format: metadata.format,
        qualityScore: metadata.quality.overallScore,
        createdAt: metadata.createdAt.toISOString(),
        updatedAt: metadata.updatedAt.toISOString(),
      },
    });

    await this.elasticsearch.indices.refresh({ index: this.esIndex });
  }

  async searchCatalog(
    query: string,
    filters?: { category?: string; sourceType?: string; tags?: string[]; minQuality?: number },
    page: number = 1,
    pageSize: number = 20,
  ): Promise<CatalogSearchResult> {
    const must: Record<string, unknown>[] = [];
    const filter: Record<string, unknown>[] = [];

    if (query && query.trim().length > 0) {
      must.push({
        multi_match: {
          query,
          fields: ['name^3', 'description^2', 'columnNames', 'columnDescriptions', 'tags^2'],
          fuzziness: 'AUTO',
        },
      });
    } else {
      must.push({ match_all: {} });
    }

    if (filters?.category) {
      filter.push({ term: { category: filters.category } });
    }
    if (filters?.sourceType) {
      filter.push({ term: { sourceType: filters.sourceType } });
    }
    if (filters?.tags && filters.tags.length > 0) {
      filter.push({ terms: { tags: filters.tags } });
    }
    if (filters?.minQuality !== undefined) {
      filter.push({ range: { qualityScore: { gte: filters.minQuality } } });
    }

    const result = await this.elasticsearch.search({
      index: this.esIndex,
      from: (page - 1) * pageSize,
      size: pageSize,
      query: { bool: { must, filter } },
      aggs: {
        categories: { terms: { field: 'category', size: 20 } },
        tags: { terms: { field: 'tags', size: 50 } },
        sourceTypes: { terms: { field: 'sourceType', size: 10 } },
      },
    });

    const hits = result.hits.hits;
    const datasetIds = hits.map((h) => h._id).filter(Boolean) as string[];

    const datasets = await this.prisma.dataset.findMany({
      where: { id: { in: datasetIds } },
    });

    const datasetMetadataList = datasets.map(d => ({
      id: d.id,
      name: d.name,
      description: d.description || '',
      sourceType: d.sourceType as DatasetMetadata['sourceType'],
      sourceConnection: d.sourceConnection || '',
      schema: JSON.parse(d.schemaJson as string || '[]'),
      tags: JSON.parse(d.tags as string || '[]'),
      category: d.category || '',
      owner: d.owner || '',
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      rowCount: d.rowCount,
      sizeBytes: d.sizeBytes,
      format: d.format || '',
      quality: JSON.parse(d.qualityDetails as string || '{}'),
    }));

    const aggs = result.aggregations as Record<string, { buckets: { key: string; doc_count: number }[] }>;

    return {
      datasets: datasetMetadataList as unknown as DatasetMetadata[],
      totalCount: typeof result.hits.total === 'number' ? result.hits.total : (result.hits.total as { value: number })?.value || 0,
      facets: {
        categories: (aggs?.categories?.buckets || []).map(b => ({ name: b.key, count: b.doc_count })),
        tags: (aggs?.tags?.buckets || []).map(b => ({ name: b.key, count: b.doc_count })),
        sourceTypes: (aggs?.sourceTypes?.buckets || []).map(b => ({ name: b.key, count: b.doc_count })),
      },
    };
  }

  async addTags(datasetId: string, tags: string[]): Promise<string[]> {
    const dataset = await this.prisma.dataset.findUniqueOrThrow({ where: { id: datasetId } });
    const existingTags: string[] = JSON.parse(dataset.tags as string || '[]');
    const uniqueNewTags = tags.filter(t => !existingTags.includes(t));
    const mergedTags = [...existingTags, ...uniqueNewTags];

    await this.prisma.dataset.update({
      where: { id: datasetId },
      data: { tags: JSON.stringify(mergedTags), updatedAt: new Date() },
    });

    await this.elasticsearch.update({
      index: this.esIndex,
      id: datasetId,
      doc: { tags: mergedTags },
    });

    for (const tag of uniqueNewTags) {
      await this.prisma.datasetTag.upsert({
        where: { name: tag },
        create: { name: tag, usageCount: 1 },
        update: { usageCount: { increment: 1 } },
      });
    }

    return mergedTags;
  }

  async removeTags(datasetId: string, tags: string[]): Promise<string[]> {
    const dataset = await this.prisma.dataset.findUniqueOrThrow({ where: { id: datasetId } });
    const existingTags: string[] = JSON.parse(dataset.tags as string || '[]');
    const removedSet = new Set(tags);
    const remainingTags = existingTags.filter(t => !removedSet.has(t));

    await this.prisma.dataset.update({
      where: { id: datasetId },
      data: { tags: JSON.stringify(remainingTags), updatedAt: new Date() },
    });

    await this.elasticsearch.update({
      index: this.esIndex,
      id: datasetId,
      doc: { tags: remainingTags },
    });

    for (const tag of tags) {
      if (existingTags.includes(tag)) {
        await this.prisma.datasetTag.update({
          where: { name: tag },
          data: { usageCount: { decrement: 1 } },
        });
      }
    }

    return remainingTags;
  }

  async generateDataDictionary(datasetId: string): Promise<DataDictionaryEntry[]> {
    const dataset = await this.prisma.dataset.findUniqueOrThrow({ where: { id: datasetId } });
    const schema: ColumnDefinition[] = JSON.parse(dataset.schemaJson as string || '[]');
    const entries: DataDictionaryEntry[] = [];

    for (const column of schema) {
      const validationRules: string[] = [];
      if (!column.nullable) validationRules.push('NOT NULL');
      if (column.isPrimaryKey) validationRules.push('PRIMARY KEY');
      if (column.isForeignKey && column.foreignKeyRef) {
        validationRules.push(`FOREIGN KEY -> ${column.foreignKeyRef.table}.${column.foreignKeyRef.column}`);
      }

      const businessName = this.generateBusinessName(column.name);
      const businessDescription = column.description || this.inferDescription(column);

      const entry: DataDictionaryEntry = {
        datasetId,
        columnName: column.name,
        businessName,
        businessDescription,
        dataType: column.dataType,
        format: this.inferFormat(column),
        allowedValues: column.statistics.distinctCount <= 20 ? column.sampleValues.map(String) : undefined,
        validationRules,
        owner: dataset.owner || '',
        lastUpdated: new Date(),
      };

      entries.push(entry);

      await this.prisma.dataDictionaryEntry.upsert({
        where: {
          datasetId_columnName: { datasetId, columnName: column.name },
        },
        create: {
          datasetId,
          columnName: column.name,
          businessName: entry.businessName,
          businessDescription: entry.businessDescription,
          dataType: entry.dataType,
          format: entry.format || '',
          allowedValues: entry.allowedValues ? JSON.stringify(entry.allowedValues) : undefined,
          validationRules: JSON.stringify(entry.validationRules),
          owner: entry.owner || '',
          lastUpdated: entry.lastUpdated,
        },
        update: {
          businessName: entry.businessName,
          businessDescription: entry.businessDescription,
          dataType: entry.dataType,
          format: entry.format || '',
          allowedValues: entry.allowedValues ? JSON.stringify(entry.allowedValues) : undefined,
          validationRules: JSON.stringify(entry.validationRules),
          lastUpdated: entry.lastUpdated,
        },
      });
    }

    return entries;
  }

  private generateBusinessName(columnName: string): string {
    const cleaned = columnName
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase();
    const words = cleaned.split(' ');
    const capitalized = words.map(w => w.charAt(0).toUpperCase() + w.slice(1));
    return capitalized.join(' ');
  }

  private inferDescription(column: ColumnDefinition): string {
    const parts: string[] = [];
    parts.push(`Column of type ${column.dataType}`);
    if (column.isPrimaryKey) parts.push('serving as the primary key');
    if (column.isForeignKey) parts.push('referencing another table');
    if (column.nullable) parts.push('(nullable)');
    else parts.push('(required)');
    if (column.statistics.distinctCount > 0) {
      parts.push(`with ${column.statistics.distinctCount} distinct values`);
    }
    return parts.join(' ');
  }

  private inferFormat(column: ColumnDefinition): string {
    const typeMap: Record<string, string> = {
      'integer': 'Whole number',
      'bigint': 'Large whole number',
      'decimal': 'Decimal number',
      'numeric': 'Decimal number',
      'varchar': 'Text string',
      'text': 'Free text',
      'boolean': 'True/False',
      'timestamp': 'Date and time (ISO 8601)',
      'date': 'Date (YYYY-MM-DD)',
      'uuid': 'UUID v4',
      'jsonb': 'JSON object',
    };
    return typeMap[column.dataType.toLowerCase()] || column.dataType;
  }

  async trackColumnLineage(
    datasetId: string,
    columnName: string,
    upstreamSource: { datasetId: string; columnName: string; transformationType: string },
  ): Promise<ColumnLineage> {
    const existing = await this.prisma.columnLineage.findFirst({
      where: { datasetId, columnName },
    });

    let upstreamSources: ColumnLineage['upstreamSources'] = [];
    if (existing) {
      upstreamSources = JSON.parse(existing.upstreamSources as string || '[]');
    }

    const alreadyTracked = upstreamSources.some(
      s => s.datasetId === upstreamSource.datasetId && s.columnName === upstreamSource.columnName,
    );
    if (!alreadyTracked) {
      upstreamSources.push(upstreamSource);
    }

    await this.prisma.columnLineage.upsert({
      where: { id: existing?.id || 'new' },
      create: {
        datasetId,
        columnName,
        upstreamSources: JSON.stringify(upstreamSources),
        downstreamTargets: JSON.stringify([]),
        updatedAt: new Date(),
      },
      update: {
        upstreamSources: JSON.stringify(upstreamSources),
        updatedAt: new Date(),
      },
    });

    const upstreamLineage = await this.prisma.columnLineage.findFirst({
      where: { datasetId: upstreamSource.datasetId, columnName: upstreamSource.columnName },
    });

    let downstreamTargets: ColumnLineage['downstreamTargets'] = [];
    if (upstreamLineage) {
      downstreamTargets = JSON.parse(upstreamLineage.downstreamTargets as string || '[]');
    }

    const alreadyTargeted = downstreamTargets.some(
      t => t.datasetId === datasetId && t.columnName === columnName,
    );
    if (!alreadyTargeted) {
      downstreamTargets.push({
        datasetId,
        columnName,
        transformationType: upstreamSource.transformationType,
      });
    }

    await this.prisma.columnLineage.upsert({
      where: { id: upstreamLineage?.id || 'new-upstream' },
      create: {
        datasetId: upstreamSource.datasetId,
        columnName: upstreamSource.columnName,
        upstreamSources: JSON.stringify([]),
        downstreamTargets: JSON.stringify(downstreamTargets),
        updatedAt: new Date(),
      },
      update: {
        downstreamTargets: JSON.stringify(downstreamTargets),
        updatedAt: new Date(),
      },
    });

    return {
      columnId: existing?.id || 'created',
      datasetId,
      columnName,
      upstreamSources,
      downstreamTargets: [],
    };
  }

  async analyzeSchemaChangeImpact(
    datasetId: string,
    changes: { type: 'add' | 'remove' | 'modify'; columnName: string; newType?: string }[],
  ): Promise<SchemaChangeImpact> {
    const affectedDatasets: SchemaChangeImpact['affectedDatasets'] = [];
    const affectedPipelines: SchemaChangeImpact['affectedPipelines'] = [];
    const affectedReports: SchemaChangeImpact['affectedReports'] = [];
    const breakingChanges: string[] = [];
    const warnings: string[] = [];

    for (const change of changes) {
      if (change.type === 'remove') {
        breakingChanges.push(`Removing column "${change.columnName}" may break downstream consumers`);

        const lineage = await this.prisma.columnLineage.findFirst({
          where: { datasetId, columnName: change.columnName },
        });

        if (lineage) {
          const downstream: ColumnLineage['downstreamTargets'] = JSON.parse(lineage.downstreamTargets as string || '[]');
          for (const target of downstream) {
            const targetDataset = await this.prisma.dataset.findUnique({
              where: { id: target.datasetId },
            });
            if (targetDataset) {
              affectedDatasets.push({
                id: target.datasetId,
                name: targetDataset.name,
                impactLevel: 'high',
              });
            }
          }
        }
      } else if (change.type === 'modify' && change.newType) {
        warnings.push(`Changing type of "${change.columnName}" to "${change.newType}" may cause data conversion issues`);

        const lineage = await this.prisma.columnLineage.findFirst({
          where: { datasetId, columnName: change.columnName },
        });

        if (lineage) {
          const downstream: ColumnLineage['downstreamTargets'] = JSON.parse(lineage.downstreamTargets as string || '[]');
          for (const target of downstream) {
            const targetDataset = await this.prisma.dataset.findUnique({ where: { id: target.datasetId } });
            if (targetDataset) {
              affectedDatasets.push({
                id: target.datasetId,
                name: targetDataset.name,
                impactLevel: 'medium',
              });
            }
          }
        }
      } else if (change.type === 'add') {
        warnings.push(`Adding column "${change.columnName}" is generally safe but may affect schemas`);
      }
    }

    const pipelinesUsingDataset = await this.prisma.pipeline.findMany({
      where: { steps: { path: [], string_contains: datasetId } } as Record<string, unknown>,
    });
    for (const pipeline of pipelinesUsingDataset) {
      affectedPipelines.push({ id: pipeline.id, name: pipeline.name });
    }

    const reportsUsingDataset = await this.prisma.report.findMany({
      where: { dataSourceId: datasetId },
    });
    for (const report of reportsUsingDataset) {
      affectedReports.push({ id: report.id, name: report.name });
    }

    return { affectedDatasets, affectedPipelines, affectedReports, breakingChanges, warnings };
  }

  async getUsageStatistics(datasetId: string, days: number = 30): Promise<UsageStatistics> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const accessLogs = await this.prisma.datasetAccessLog.findMany({
      where: {
        datasetId,
        accessedAt: { gte: since },
      },
      orderBy: { accessedAt: 'desc' },
    });

    const totalQueries = accessLogs.length;
    const uniqueUserIds = new Set(accessLogs.map(l => l.userId));
    const uniqueUsers = uniqueUserIds.size;
    const lastAccessedAt = accessLogs.length > 0 ? accessLogs[0].accessedAt : new Date();

    const columnUsageMap = new Map<string, number>();
    for (const log of accessLogs) {
      const columns: string[] = JSON.parse(log.columnsAccessed as string || '[]');
      for (const col of columns) {
        columnUsageMap.set(col, (columnUsageMap.get(col) || 0) + 1);
      }
    }

    const popularColumns = Array.from(columnUsageMap.entries())
      .map(([name, queryCount]) => ({ name, queryCount }))
      .sort((a, b) => b.queryCount - a.queryCount)
      .slice(0, 10);

    const accessTrendMap = new Map<string, number>();
    for (const log of accessLogs) {
      const dateKey = log.accessedAt.toISOString().split('T')[0];
      accessTrendMap.set(dateKey, (accessTrendMap.get(dateKey) || 0) + 1);
    }
    const accessTrend = Array.from(accessTrendMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const userUsageMap = new Map<string, number>();
    for (const log of accessLogs) {
      userUsageMap.set(log.userId, (userUsageMap.get(log.userId) || 0) + 1);
    }
    const topUsers = Array.from(userUsageMap.entries())
      .map(([userId, queryCount]) => ({ userId, queryCount }))
      .sort((a, b) => b.queryCount - a.queryCount)
      .slice(0, 10);

    await this.prisma.datasetUsageStats.upsert({
      where: { datasetId },
      create: {
        datasetId,
        totalQueries,
        uniqueUsers,
        lastAccessedAt,
        popularColumns: JSON.stringify(popularColumns),
        computedAt: new Date(),
      },
      update: {
        totalQueries,
        uniqueUsers,
        lastAccessedAt,
        popularColumns: JSON.stringify(popularColumns),
        computedAt: new Date(),
      },
    });

    return {
      datasetId,
      totalQueries,
      uniqueUsers,
      lastAccessedAt,
      popularColumns,
      accessTrend,
      topUsers,
    };
  }

  async deleteDataset(datasetId: string): Promise<void> {
    await this.prisma.datasetColumn.deleteMany({ where: { datasetId } });
    await this.prisma.dataDictionaryEntry.deleteMany({ where: { datasetId } });
    await this.prisma.columnLineage.deleteMany({ where: { datasetId } });
    await this.prisma.datasetAccessLog.deleteMany({ where: { datasetId } });
    await this.prisma.datasetUsageStats.deleteMany({ where: { datasetId } });
    await this.prisma.dataset.delete({ where: { id: datasetId } });

    await this.elasticsearch.delete({ index: this.esIndex, id: datasetId }).catch(() => {});
  }
}
