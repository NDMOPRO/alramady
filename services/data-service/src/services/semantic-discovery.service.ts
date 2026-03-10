/**
 * Semantic Relationship Discovery Service - Rasid Platform
 * Discovers semantic relationships across datasets using AI-powered analysis
 */

import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { logger } from '../utils/logger';
import { KeyDetectionService } from './key-detection.service';

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder-key' });

interface SemanticRelationship {
  sourceDatasetId: string;
  sourceColumn: string;
  targetDatasetId: string;
  targetColumn: string;
  relationshipType: 'temporal' | 'categorical' | 'dimensional' | 'hierarchical';
  description: string;
  confidence: number;
}

interface DimensionSuggestion {
  column: string;
  role: 'fact' | 'dimension';
  dimensionType: string;
  suggestedTableName: string;
  reason: string;
  confidence: number;
}

interface StarSchemaSuggestion {
  factTable: string;
  factColumns: string[];
  dimensions: DimensionSuggestion[];
}

interface KnowledgeGraphNode {
  id: string;
  datasetId: string;
  label: string;
  type: 'entity' | 'attribute' | 'measure';
  metadata: Record<string, any>;
}

interface KnowledgeGraphEdge {
  sourceId: string;
  targetId: string;
  label: string;
  type: 'fk' | 'temporal' | 'categorical' | 'dimensional' | 'hierarchical';
  weight: number;
}

interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

type DataRow = Record<string, string | number | null>;

export class SemanticDiscoveryService {
  private readonly keyDetection = new KeyDetectionService();

  async discoverSemanticRelationships(
    datasetIds: string[],
    tenantId: string
  ): Promise<SemanticRelationship[]> {
    logger.info('Discovering semantic relationships', { datasetIds, tenantId });

    const datasetsInfo: Array<{
      id: string;
      name: string;
      columns: Array<{ name: string; dataType: string }>;
      sampleData: DataRow[];
    }> = [];

    for (const dsId of datasetIds) {
      const ds = await prisma.dataset.findFirst({
        where: { id: dsId, tenantId },
        include: { columns: true },
      });

      if (!ds) continue;

      const rows = await prisma.dataRow.findMany({
        where: { datasetId: dsId },
        orderBy: { rowIndex: 'asc' },
        take: 10,
      });

      const sampleData: DataRow[] = rows.map((r) => {
        const data = r.data as Record<string, any>;
        const result: DataRow = {};
        for (const [key, value] of Object.entries(data)) {
          result[key] = value === null || value === undefined ? null : typeof value === 'number' ? value : String(value);
        }
        return result;
      });

      datasetsInfo.push({
        id: dsId,
        name: ds.name,
        columns: ds.columns.map((c) => ({ name: c.name, dataType: c.dataType })),
        sampleData,
      });
    }

    if (datasetsInfo.length < 2) {
      return [];
    }

    const relationships: SemanticRelationship[] = [];

    // Detect temporal relationships
    const temporalRels = this.detectTemporalRelationships(datasetsInfo);
    relationships.push(...temporalRels);

    // Detect categorical overlaps
    const categoricalRels = await this.detectCategoricalRelationships(datasetsInfo);
    relationships.push(...categoricalRels);

    // Use AI for deeper semantic analysis
    const aiRelationships = await this.aiSemanticAnalysis(datasetsInfo);
    relationships.push(...aiRelationships);

    // Deduplicate
    const uniqueRels = this.deduplicateRelationships(relationships);

    logger.info('Semantic relationship discovery complete', {
      tenantId,
      datasetsAnalyzed: datasetsInfo.length,
      relationshipsFound: uniqueRels.length,
    });

    return uniqueRels;
  }

  async suggestDimensions(
    datasetId: string,
    tenantId: string
  ): Promise<StarSchemaSuggestion> {
    logger.info('Suggesting dimensions', { datasetId, tenantId });

    const ds = await prisma.dataset.findFirst({
      where: { id: datasetId, tenantId },
      include: { columns: true },
    });

    if (!ds) {
      throw new Error(`Dataset ${datasetId} not found for tenant ${tenantId}`);
    }

    const rows = await prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
      take: 100,
    });

    const sampleData: DataRow[] = rows.map((r) => {
      const data = r.data as Record<string, any>;
      const result: DataRow = {};
      for (const [key, value] of Object.entries(data)) {
        result[key] = value === null || value === undefined ? null : typeof value === 'number' ? value : String(value);
      }
      return result;
    });

    const columnProfiles = ds.columns.map((col) => {
      const values = sampleData.map((r) => r[col.name]);
      const nonNull = values.filter((v) => v !== null && v !== undefined);
      const uniqueCount = new Set(nonNull.map(String)).size;
      const numericCount = nonNull.filter((v) => typeof v === 'number' || !isNaN(Number(v))).length;
      const isNumeric = numericCount / Math.max(nonNull.length, 1) > 0.8;
      const cardinality = uniqueCount / Math.max(nonNull.length, 1);

      return {
        name: col.name,
        dataType: col.dataType,
        isNumeric,
        cardinality,
        uniqueCount,
        totalCount: values.length,
      };
    });

    const prompt = `You are a data warehouse architect for the Rasid analytics platform (Saudi market).
Analyze this dataset and suggest a star schema design.

Dataset: "${ds.name}"
Columns:
${JSON.stringify(columnProfiles, null, 2)}

Sample data (first 5 rows):
${JSON.stringify(sampleData.slice(0, 5), null, 2)}

Respond in JSON:
{
  "factColumns": ["col1", "col2"],
  "dimensions": [
    {
      "column": "col_name",
      "role": "dimension",
      "dimensionType": "time|geography|category|status|identifier",
      "suggestedTableName": "dim_xxx",
      "reason": "why this is a dimension",
      "confidence": 0.85
    }
  ]
}

Rules:
- Numeric columns with high cardinality are likely facts/measures
- Low-cardinality string columns are likely dimensions
- Date/time columns -> time dimension
- Geographic columns -> geography dimension
- Use Arabic-aware naming when appropriate
- confidence between 0 and 1`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for dimension suggestion');
    }

    const parsed: {
      factColumns: string[];
      dimensions: DimensionSuggestion[];
    } = JSON.parse(content);

    const suggestion: StarSchemaSuggestion = {
      factTable: ds.name,
      factColumns: parsed.factColumns,
      dimensions: parsed.dimensions.map((d) => ({
        column: d.column,
        role: d.role ?? 'dimension',
        dimensionType: d.dimensionType,
        suggestedTableName: d.suggestedTableName,
        reason: d.reason,
        confidence: typeof d.confidence === 'number' ? d.confidence : 0.7,
      })),
    };

    logger.info('Dimension suggestion complete', {
      datasetId,
      tenantId,
      factColumns: suggestion.factColumns.length,
      dimensionCount: suggestion.dimensions.length,
    });

    return suggestion;
  }

  async buildKnowledgeGraph(
    datasetIds: string[],
    tenantId: string
  ): Promise<KnowledgeGraph> {
    logger.info('Building knowledge graph', { datasetIds, tenantId });

    const nodes: KnowledgeGraphNode[] = [];
    const edges: KnowledgeGraphEdge[] = [];

    // Build entity nodes for each dataset
    for (const dsId of datasetIds) {
      const ds = await prisma.dataset.findFirst({
        where: { id: dsId, tenantId },
        include: { columns: true },
      });

      if (!ds) continue;

      nodes.push({
        id: `entity-${dsId}`,
        datasetId: dsId,
        label: ds.name,
        type: 'entity',
        metadata: {
          columnCount: ds.columns.length,
          rowCount: ds.rowCount,
        },
      });

      for (const col of ds.columns) {
        const colType = this.classifyColumnType(col.dataType);
        nodes.push({
          id: `attr-${dsId}-${col.name}`,
          datasetId: dsId,
          label: col.name,
          type: colType,
          metadata: {
            dataType: col.dataType,
            position: col.position,
          },
        });

        edges.push({
          sourceId: `entity-${dsId}`,
          targetId: `attr-${dsId}-${col.name}`,
          label: 'has_attribute',
          type: 'fk',
          weight: 1.0,
        });
      }
    }

    // Add PK/FK-based edges
    const relationshipMap = await this.keyDetection.buildRelationshipMap(datasetIds, tenantId);
    for (const edge of relationshipMap.edges) {
      edges.push({
        sourceId: `attr-${edge.sourceDatasetId}-${edge.sourceColumn}`,
        targetId: `attr-${edge.targetDatasetId}-${edge.targetColumn}`,
        label: `${edge.type}_relationship`,
        type: 'fk',
        weight: edge.confidence,
      });
    }

    // Add semantic edges
    const semanticRels = await this.discoverSemanticRelationships(datasetIds, tenantId);
    for (const rel of semanticRels) {
      edges.push({
        sourceId: `attr-${rel.sourceDatasetId}-${rel.sourceColumn}`,
        targetId: `attr-${rel.targetDatasetId}-${rel.targetColumn}`,
        label: rel.description,
        type: rel.relationshipType,
        weight: rel.confidence,
      });
    }

    logger.info('Knowledge graph built', {
      tenantId,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      datasets: datasetIds.length,
    });

    return { nodes, edges };
  }

  private detectTemporalRelationships(
    datasets: Array<{
      id: string;
      name: string;
      columns: Array<{ name: string; dataType: string }>;
      sampleData: DataRow[];
    }>
  ): SemanticRelationship[] {
    const relationships: SemanticRelationship[] = [];

    const datePattern = /date|time|timestamp|created|updated|day|month|year|hijri/i;

    for (let i = 0; i < datasets.length; i++) {
      for (let j = i + 1; j < datasets.length; j++) {
        const ds1DateCols = datasets[i].columns.filter(
          (c) => datePattern.test(c.name) || c.dataType.toLowerCase().includes('date') || c.dataType.toLowerCase().includes('time')
        );
        const ds2DateCols = datasets[j].columns.filter(
          (c) => datePattern.test(c.name) || c.dataType.toLowerCase().includes('date') || c.dataType.toLowerCase().includes('time')
        );

        for (const col1 of ds1DateCols) {
          for (const col2 of ds2DateCols) {
            const vals1 = datasets[i].sampleData.map((r) => r[col1.name]).filter((v): v is string | number => v !== null);
            const vals2 = datasets[j].sampleData.map((r) => r[col2.name]).filter((v): v is string | number => v !== null);

            if (vals1.length === 0 || vals2.length === 0) continue;

            const dates1 = vals1.map((v) => new Date(String(v)).getTime()).filter((t) => !isNaN(t));
            const dates2 = vals2.map((v) => new Date(String(v)).getTime()).filter((t) => !isNaN(t));

            if (dates1.length === 0 || dates2.length === 0) continue;

            const min1 = Math.min(...dates1);
            const max1 = Math.max(...dates1);
            const min2 = Math.min(...dates2);
            const max2 = Math.max(...dates2);

            const overlap = Math.max(0, Math.min(max1, max2) - Math.max(min1, min2));
            const totalRange = Math.max(max1, max2) - Math.min(min1, min2);

            if (totalRange === 0) continue;

            const overlapRatio = overlap / totalRange;

            if (overlapRatio > 0.2) {
              relationships.push({
                sourceDatasetId: datasets[i].id,
                sourceColumn: col1.name,
                targetDatasetId: datasets[j].id,
                targetColumn: col2.name,
                relationshipType: 'temporal',
                description: `Temporal overlap: ${(overlapRatio * 100).toFixed(1)}% date range overlap`,
                confidence: Math.min(0.95, 0.5 + overlapRatio * 0.5),
              });
            }
          }
        }
      }
    }

    return relationships;
  }

  private async detectCategoricalRelationships(
    datasets: Array<{
      id: string;
      name: string;
      columns: Array<{ name: string; dataType: string }>;
      sampleData: DataRow[];
    }>
  ): Promise<SemanticRelationship[]> {
    const relationships: SemanticRelationship[] = [];

    for (let i = 0; i < datasets.length; i++) {
      for (let j = i + 1; j < datasets.length; j++) {
        const categoricalCols1 = datasets[i].columns.filter((c) => {
          const vals = datasets[i].sampleData.map((r) => r[c.name]).filter((v) => v !== null);
          const unique = new Set(vals.map(String));
          return unique.size < vals.length * 0.5 && unique.size >= 2 && unique.size <= 50;
        });

        const categoricalCols2 = datasets[j].columns.filter((c) => {
          const vals = datasets[j].sampleData.map((r) => r[c.name]).filter((v) => v !== null);
          const unique = new Set(vals.map(String));
          return unique.size < vals.length * 0.5 && unique.size >= 2 && unique.size <= 50;
        });

        for (const col1 of categoricalCols1) {
          const vals1 = new Set(
            datasets[i].sampleData.map((r) => String(r[col1.name] ?? '')).filter((v) => v !== '')
          );

          for (const col2 of categoricalCols2) {
            const vals2 = new Set(
              datasets[j].sampleData.map((r) => String(r[col2.name] ?? '')).filter((v) => v !== '')
            );

            let overlap = 0;
            for (const v of vals1) {
              if (vals2.has(v)) overlap++;
            }

            const overlapRatio = overlap / Math.min(vals1.size, vals2.size);

            if (overlapRatio > 0.3) {
              relationships.push({
                sourceDatasetId: datasets[i].id,
                sourceColumn: col1.name,
                targetDatasetId: datasets[j].id,
                targetColumn: col2.name,
                relationshipType: 'categorical',
                description: `Categorical overlap: ${overlap} shared values (${(overlapRatio * 100).toFixed(1)}%)`,
                confidence: Math.min(0.9, 0.4 + overlapRatio * 0.5),
              });
            }
          }
        }
      }
    }

    return relationships;
  }

  private async aiSemanticAnalysis(
    datasets: Array<{
      id: string;
      name: string;
      columns: Array<{ name: string; dataType: string }>;
      sampleData: DataRow[];
    }>
  ): Promise<SemanticRelationship[]> {
    const prompt = `You are a data relationship expert for the Rasid analytics platform.
Analyze these datasets and discover semantic relationships beyond simple FK relationships.

Datasets:
${datasets.map((ds) => `- "${ds.name}" (id: ${ds.id}): columns [${ds.columns.map((c) => `${c.name}:${c.dataType}`).join(', ')}]
  Sample: ${JSON.stringify(ds.sampleData.slice(0, 3))}`).join('\n\n')}

Look for:
1. Dimensional relationships (fact-dimension patterns)
2. Hierarchical relationships (parent-child patterns)
3. Temporal relationships (shared time periods)
4. Categorical relationships (shared categories)

Respond in JSON:
{
  "relationships": [
    {
      "sourceDatasetId": "id1",
      "sourceColumn": "col1",
      "targetDatasetId": "id2",
      "targetColumn": "col2",
      "relationshipType": "dimensional|hierarchical|temporal|categorical",
      "description": "explanation",
      "confidence": 0.8
    }
  ]
}

Rules:
- Only include genuine relationships with confidence >= 0.5
- Maximum 20 relationships
- confidence between 0 and 1`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return [];

      const parsed: { relationships: SemanticRelationship[] } = JSON.parse(content);

      return parsed.relationships
        .filter((r) => r.confidence >= 0.5)
        .slice(0, 20)
        .map((r) => ({
          sourceDatasetId: r.sourceDatasetId,
          sourceColumn: r.sourceColumn,
          targetDatasetId: r.targetDatasetId,
          targetColumn: r.targetColumn,
          relationshipType: r.relationshipType,
          description: r.description,
          confidence: typeof r.confidence === 'number' ? r.confidence : 0.6,
        }));
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('AI semantic analysis failed', { error: errorMsg });
      return [];
    }
  }

  private deduplicateRelationships(rels: SemanticRelationship[]): SemanticRelationship[] {
    const seen = new Set<string>();
    const unique: SemanticRelationship[] = [];

    for (const rel of rels) {
      const key1 = `${rel.sourceDatasetId}:${rel.sourceColumn}->${rel.targetDatasetId}:${rel.targetColumn}:${rel.relationshipType}`;
      const key2 = `${rel.targetDatasetId}:${rel.targetColumn}->${rel.sourceDatasetId}:${rel.sourceColumn}:${rel.relationshipType}`;

      if (!seen.has(key1) && !seen.has(key2)) {
        seen.add(key1);
        unique.push(rel);
      }
    }

    return unique;
  }

  private classifyColumnType(dataType: string): 'attribute' | 'measure' {
    const numericTypes = ['int', 'integer', 'float', 'double', 'decimal', 'number', 'numeric', 'bigint'];
    const isNumeric = numericTypes.some((t) => dataType.toLowerCase().includes(t));
    return isNumeric ? 'measure' : 'attribute';
  }
}
