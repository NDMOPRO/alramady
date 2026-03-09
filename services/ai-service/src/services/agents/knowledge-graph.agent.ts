import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const prisma = new PrismaClient();

export interface AgentResult {
  agentType: string;
  taskType: string;
  suggestions: Array<{ action: string; description: string; confidence: number }>;
  interpretation: string;
  requiresApproval: boolean;
  executedAt: Date;
}

export interface KnowledgeGraphTask {
  type: 'discover_relationships' | 'map_dependencies' | 'suggest_connections' | 'trace_lineage' | 'find_similar';
  datasetId: string;
  data?: Array<Record<string, number | string | null>>;
  columns?: string[];
  otherDatasets?: Array<{
    datasetId: string;
    columns: string[];
    sampleData?: Array<Record<string, number | string | null>>;
  }>;
  entityType?: string;
  lineageDepth?: number;
  context?: string;
}

interface Relationship {
  sourceDataset: string;
  sourceColumn: string;
  targetDataset: string;
  targetColumn: string;
  type: 'exact_match' | 'fuzzy_match' | 'foreign_key' | 'semantic' | 'derived';
  confidence: number;
  evidence: string;
}

interface GraphNode {
  id: string;
  type: 'dataset' | 'column' | 'entity' | 'process';
  label: string;
  metadata: Record<string, string | number>;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
  weight: number;
  label: string;
}

export class KnowledgeGraphAgent {
  private readonly agentType = 'knowledge-graph';

  async execute(task: KnowledgeGraphTask): Promise<AgentResult> {
    switch (task.type) {
      case 'discover_relationships':
        return this.discoverRelationships(task);
      case 'map_dependencies':
        return this.mapDependencies(task);
      case 'suggest_connections':
        return this.suggestConnections(task);
      case 'trace_lineage':
        return this.traceLineage(task);
      case 'find_similar':
        return this.findSimilar(task);
      default: {
        const exhaustive: never = task.type;
        throw new Error(`Unsupported task type: ${exhaustive}`);
      }
    }
  }

  private jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
    if (setA.size === 0 && setB.size === 0) return 0;
    let intersection = 0;
    for (const item of setA) {
      if (setB.has(item)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  private normalizeColumnName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[\s_-]+/g, '_')
      .replace(/[^a-z0-9_\u0600-\u06FF]/g, '')
      .trim();
  }

  private tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\u0600-\u06FF\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 1)
    );
  }

  private computeValueOverlap(
    valuesA: Array<number | string | null>,
    valuesB: Array<number | string | null>
  ): number {
    const setA = new Set(valuesA.filter((v) => v !== null && v !== undefined).map(String));
    const setB = new Set(valuesB.filter((v) => v !== null && v !== undefined).map(String));
    return this.jaccardSimilarity(setA, setB);
  }

  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n === 0) return 0;
    const meanX = x.reduce((s, v) => s + v, 0) / n;
    const meanY = y.reduce((s, v) => s + v, 0) / n;
    let num = 0;
    let denX = 0;
    let denY = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }
    const den = Math.sqrt(denX * denY);
    return den === 0 ? 0 : num / den;
  }

  private extractEntityReferences(details: Record<string, unknown>): string[] {
    const refs: string[] = [];
    const idPatterns = ['datasetId', 'sourceDatasetId', 'targetDatasetId', 'reportId', 'dashboardId', 'workflowId'];
    for (const key of idPatterns) {
      const val = details[key];
      if (typeof val === 'string' && val.length > 0 && val !== 'unknown') {
        refs.push(val);
      }
    }
    return refs;
  }

  private inferEntityType(entityId: string): GraphNode['type'] {
    if (entityId.startsWith('ds-') || entityId.includes('dataset')) return 'dataset';
    if (entityId.startsWith('wf-') || entityId.includes('workflow')) return 'process';
    if (entityId.startsWith('col-')) return 'column';
    return 'entity';
  }

  private countByType(relationships: Relationship[]): string {
    const counts = new Map<string, number>();
    relationships.forEach((r) => counts.set(r.type, (counts.get(r.type) ?? 0) + 1));
    return Array.from(counts.entries()).map(([t, c]) => `${t}:${c}`).join(', ');
  }

  private countNodeTypes(nodes: GraphNode[]): string {
    const counts = new Map<string, number>();
    nodes.forEach((n) => counts.set(n.type, (counts.get(n.type) ?? 0) + 1));
    return Array.from(counts.entries()).map(([t, c]) => `${t}:${c}`).join(', ');
  }

  private async discoverRelationships(task: KnowledgeGraphTask): Promise<AgentResult> {
    const data = task.data ?? [];
    const ownColumns = task.columns ?? (data.length > 0 ? Object.keys(data[0]) : []);
    const otherDatasets = task.otherDatasets ?? [];
    const relationships: Relationship[] = [];

    for (const other of otherDatasets) {
      for (const ownCol of ownColumns) {
        const ownNorm = this.normalizeColumnName(ownCol);
        const ownTokens = this.tokenize(ownCol);

        for (const otherCol of other.columns) {
          const otherNorm = this.normalizeColumnName(otherCol);
          const otherTokens = this.tokenize(otherCol);

          // Exact name match
          if (ownNorm === otherNorm) {
            relationships.push({
              sourceDataset: task.datasetId,
              sourceColumn: ownCol,
              targetDataset: other.datasetId,
              targetColumn: otherCol,
              type: 'exact_match',
              confidence: 0.95,
              evidence: `Identical normalized column names: "${ownNorm}"`,
            });
            continue;
          }

          // Token-based similarity (Jaccard)
          const nameSimilarity = this.jaccardSimilarity(ownTokens, otherTokens);
          if (nameSimilarity > 0.5) {
            relationships.push({
              sourceDataset: task.datasetId,
              sourceColumn: ownCol,
              targetDataset: other.datasetId,
              targetColumn: otherCol,
              type: 'fuzzy_match',
              confidence: Math.min(0.9, nameSimilarity),
              evidence: `Column name similarity: ${(nameSimilarity * 100).toFixed(0)}% (Jaccard on tokens)`,
            });
          }

          // Value overlap check
          if (data.length > 0 && other.sampleData && other.sampleData.length > 0) {
            const ownValues = data.map((row) => row[ownCol]);
            const otherValues = other.sampleData.map((row) => row[otherCol]);
            const valueOverlap = this.computeValueOverlap(ownValues, otherValues);

            if (valueOverlap > 0.3) {
              const existingRel = relationships.find(
                (r) =>
                  r.sourceColumn === ownCol &&
                  r.targetColumn === otherCol &&
                  r.targetDataset === other.datasetId
              );

              if (existingRel) {
                existingRel.confidence = Math.min(0.98, existingRel.confidence + valueOverlap * 0.3);
                existingRel.evidence += ` + Value overlap: ${(valueOverlap * 100).toFixed(0)}%`;
              } else {
                relationships.push({
                  sourceDataset: task.datasetId,
                  sourceColumn: ownCol,
                  targetDataset: other.datasetId,
                  targetColumn: otherCol,
                  type: 'foreign_key',
                  confidence: Math.min(0.85, valueOverlap),
                  evidence: `Value overlap: ${(valueOverlap * 100).toFixed(0)}%`,
                });
              }
            }
          }
        }
      }
    }

    // Intra-dataset derived relationships via correlation
    if (data.length > 5) {
      const numericColumns = ownColumns.filter((col) => {
        const vals = data.map((r) => r[col]).filter((v) => v !== null && v !== undefined);
        const numCount = vals.filter((v) => typeof v === 'number' || (!isNaN(Number(v)) && String(v).trim() !== '')).length;
        return numCount / (vals.length || 1) > 0.8;
      });

      for (let i = 0; i < numericColumns.length; i++) {
        for (let j = i + 1; j < numericColumns.length; j++) {
          const xVals = data.map((r) => r[numericColumns[i]]).map((v) => (v !== null && v !== undefined ? Number(v) : NaN)).filter((v) => !isNaN(v));
          const yVals = data.map((r) => r[numericColumns[j]]).map((v) => (v !== null && v !== undefined ? Number(v) : NaN)).filter((v) => !isNaN(v));
          const minLen = Math.min(xVals.length, yVals.length);

          if (minLen > 5) {
            const corr = this.pearsonCorrelation(xVals.slice(0, minLen), yVals.slice(0, minLen));
            if (Math.abs(corr) > 0.85) {
              relationships.push({
                sourceDataset: task.datasetId,
                sourceColumn: numericColumns[i],
                targetDataset: task.datasetId,
                targetColumn: numericColumns[j],
                type: 'derived',
                confidence: Math.abs(corr),
                evidence: `High correlation: r=${corr.toFixed(4)} - possible derived relationship`,
              });
            }
          }
        }
      }
    }

    const sorted = relationships.sort((a, b) => b.confidence - a.confidence);
    const suggestions = sorted.slice(0, 30).map((r) => ({
      action: `relationship_${r.type}`,
      description: `${r.sourceDataset}.${r.sourceColumn} <-> ${r.targetDataset}.${r.targetColumn} (${r.type}, confidence: ${(r.confidence * 100).toFixed(0)}%). ${r.evidence}`,
      confidence: r.confidence,
    }));

    const interpretation = `Relationship discovery: ${relationships.length} relationships found across ${otherDatasets.length + 1} datasets. Types: ${this.countByType(relationships)}. Strongest: ${sorted[0] ? `${sorted[0].sourceColumn} <-> ${sorted[0].targetColumn} (${(sorted[0].confidence * 100).toFixed(0)}%)` : 'none'}.`;

    await prisma.auditLog.create({
      data: {
        action: 'knowledge_graph_discover_relationships',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ relationshipsFound: relationships.length, datasetsCompared: otherDatasets.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: false,
      executedAt: new Date(),
    };
  }

  private async mapDependencies(task: KnowledgeGraphTask): Promise<AgentResult> {
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entityId: task.datasetId },
          { details: { contains: task.datasetId } },
        ],
      },
      orderBy: { performedAt: 'asc' },
      take: 500,
    });

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const processedEntities = new Set<string>();

    nodes.push({
      id: task.datasetId,
      type: 'dataset',
      label: task.datasetId,
      metadata: { auditEntries: auditLogs.length },
    });
    processedEntities.add(task.datasetId);

    for (const log of auditLogs) {
      let details: Record<string, unknown> = {};
      try {
        details = JSON.parse(log.details ?? '{}');
      } catch {
        continue;
      }

      const relatedEntities = this.extractEntityReferences(details);
      for (const entity of relatedEntities) {
        if (entity === task.datasetId) continue;
        if (!processedEntities.has(entity)) {
          nodes.push({
            id: entity,
            type: this.inferEntityType(entity),
            label: entity,
            metadata: { discoveredFrom: log.action },
          });
          processedEntities.add(entity);
        }

        edges.push({
          source: log.entityId ?? task.datasetId,
          target: entity,
          type: log.action,
          weight: 1,
          label: log.action,
        });
      }
    }

    // Aggregate edges
    const edgeMap = new Map<string, GraphEdge>();
    for (const edge of edges) {
      const key = `${edge.source}->${edge.target}`;
      const existing = edgeMap.get(key);
      if (existing) {
        existing.weight++;
        existing.label = `${existing.type} (x${existing.weight})`;
      } else {
        edgeMap.set(key, { ...edge });
      }
    }
    const uniqueEdges = Array.from(edgeMap.values());

    const suggestions: Array<{ action: string; description: string; confidence: number }> = [];

    nodes.forEach((node) => {
      if (node.id !== task.datasetId) {
        const edgeCount = uniqueEdges.filter((e) => e.source === node.id || e.target === node.id).length;
        suggestions.push({
          action: 'dependency_found',
          description: `${node.type} "${node.id}" connected to "${task.datasetId}" via ${edgeCount} interactions`,
          confidence: 0.8,
        });
      }
    });

    if (nodes.length === 1) {
      suggestions.push({
        action: 'no_dependencies',
        description: `No dependencies found for "${task.datasetId}" in audit trail.`,
        confidence: 0.7,
      });
    }

    suggestions.push({
      action: 'dependency_graph',
      description: `Dependency graph: ${nodes.length} nodes, ${uniqueEdges.length} edges. Types: ${this.countNodeTypes(nodes)}.`,
      confidence: 0.85,
    });

    const interpretation = `Dependency mapping for "${task.datasetId}": ${nodes.length} entities, ${uniqueEdges.length} connections from ${auditLogs.length} audit entries.`;

    await prisma.auditLog.create({
      data: {
        action: 'knowledge_graph_map_dependencies',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ nodes: nodes.length, edges: uniqueEdges.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: false,
      executedAt: new Date(),
    };
  }

  private async suggestConnections(task: KnowledgeGraphTask): Promise<AgentResult> {
    const data = task.data ?? [];
    const ownColumns = task.columns ?? (data.length > 0 ? Object.keys(data[0]) : []);
    const otherDatasets = task.otherDatasets ?? [];
    const sampleRows = data.slice(0, 10);

    const prompt = `You are a knowledge graph specialist for a Saudi-market analytics platform.
Suggest meaningful connections between this dataset and other available datasets.

Primary dataset "${task.datasetId}":
Columns: ${JSON.stringify(ownColumns)}
Sample data:
${JSON.stringify(sampleRows, null, 2)}

Other available datasets:
${JSON.stringify(otherDatasets.map((d) => ({ datasetId: d.datasetId, columns: d.columns, sampleRow: d.sampleData?.[0] })), null, 2)}

${task.context ? `Context: ${task.context}` : ''}

Respond in JSON:
{
  "suggestions": [
    {
      "action": "suggest_connection",
      "description": "sourceDataset.sourceColumn -> targetDataset.targetColumn | join_type: [inner|left|lookup] | reason: explanation | potential_insights: what this connection enables",
      "confidence": 0.85
    }
  ],
  "interpretation": "connection analysis summary in Arabic (formal MSA)"
}

Consider:
- Saudi business data patterns (national ID, region codes)
- Temporal alignment (date columns)
- Hierarchical relationships
- Transactional links
- confidence must be between 0 and 1`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for suggest_connections');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    await prisma.auditLog.create({
      data: {
        action: 'knowledge_graph_suggest_connections',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ suggestionsCount: parsed.suggestions.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions: parsed.suggestions,
      interpretation: parsed.interpretation,
      requiresApproval: false,
      executedAt: new Date(),
    };
  }

  private async traceLineage(task: KnowledgeGraphTask): Promise<AgentResult> {
    const depth = task.lineageDepth ?? 5;

    const allLogs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entityId: task.datasetId },
          { details: { contains: task.datasetId } },
        ],
      },
      orderBy: { performedAt: 'asc' },
      take: 1000,
    });

    const lineageSteps: Array<{
      step: number;
      action: string;
      entityType: string;
      entityId: string;
      timestamp: Date;
      details: string;
    }> = [];

    const visitedEntities = new Set<string>([task.datasetId]);
    let currentEntities = [task.datasetId];
    let currentDepth = 0;

    while (currentDepth < depth && currentEntities.length > 0) {
      const nextEntities: string[] = [];

      for (const entityId of currentEntities) {
        const relatedLogs = allLogs.filter(
          (log) => log.entityId === entityId || (log.details ?? '').includes(entityId)
        );

        for (const log of relatedLogs) {
          lineageSteps.push({
            step: currentDepth + 1,
            action: log.action,
            entityType: log.entityType ?? 'unknown',
            entityId: log.entityId ?? entityId,
            timestamp: log.performedAt,
            details: log.details ?? '',
          });

          let details: Record<string, unknown> = {};
          try {
            details = JSON.parse(log.details ?? '{}');
          } catch {
            continue;
          }

          const refs = this.extractEntityReferences(details);
          for (const ref of refs) {
            if (!visitedEntities.has(ref)) {
              visitedEntities.add(ref);
              nextEntities.push(ref);
            }
          }
        }
      }

      currentEntities = nextEntities;
      currentDepth++;
    }

    const suggestions: Array<{ action: string; description: string; confidence: number }> = [];

    if (lineageSteps.length > 0) {
      const actionGroups = new Map<string, number>();
      lineageSteps.forEach((s) => actionGroups.set(s.action, (actionGroups.get(s.action) ?? 0) + 1));

      suggestions.push({
        action: 'lineage_overview',
        description: `Data lineage traced ${currentDepth} levels deep. ${lineageSteps.length} operations, ${visitedEntities.size} entities.`,
        confidence: 0.85,
      });

      const chronological = lineageSteps.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      const firstEvent = chronological[0];
      const lastEvent = chronological[chronological.length - 1];

      suggestions.push({
        action: 'lineage_timeline',
        description: `Origin: ${firstEvent.action} on ${firstEvent.entityId} at ${firstEvent.timestamp.toISOString()}. Latest: ${lastEvent.action} at ${lastEvent.timestamp.toISOString()}.`,
        confidence: 0.8,
      });

      Array.from(actionGroups.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([action, count]) => {
          suggestions.push({
            action: 'lineage_step',
            description: `Operation "${action}": ${count} occurrences in lineage`,
            confidence: 0.75,
          });
        });
    } else {
      suggestions.push({
        action: 'no_lineage',
        description: `No lineage data found for "${task.datasetId}". May be a root/source dataset.`,
        confidence: 0.7,
      });
    }

    const interpretation = `Data lineage for "${task.datasetId}": ${lineageSteps.length} operations, ${visitedEntities.size} entities, ${currentDepth} levels deep.`;

    await prisma.auditLog.create({
      data: {
        action: 'knowledge_graph_trace_lineage',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ depth: currentDepth, steps: lineageSteps.length, entities: visitedEntities.size }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: false,
      executedAt: new Date(),
    };
  }

  private async findSimilar(task: KnowledgeGraphTask): Promise<AgentResult> {
    const ownColumns = task.columns ?? [];
    const otherDatasets = task.otherDatasets ?? [];

    if (otherDatasets.length === 0) {
      throw new Error('find_similar requires otherDatasets for comparison');
    }

    const ownColumnSet = new Set(ownColumns.map((c) => this.normalizeColumnName(c)));
    const ownTokens = new Set<string>();
    ownColumns.forEach((c) => this.tokenize(c).forEach((t) => ownTokens.add(t)));

    const similarities: Array<{
      datasetId: string;
      columnSimilarity: number;
      tokenSimilarity: number;
      overallScore: number;
      matchingColumns: string[];
    }> = [];

    for (const other of otherDatasets) {
      const otherColumnSet = new Set(other.columns.map((c) => this.normalizeColumnName(c)));
      const otherTokens = new Set<string>();
      other.columns.forEach((c) => this.tokenize(c).forEach((t) => otherTokens.add(t)));

      const columnSimilarity = this.jaccardSimilarity(ownColumnSet, otherColumnSet);
      const tokenSimilarity = this.jaccardSimilarity(ownTokens, otherTokens);

      const matchingColumns: string[] = [];
      for (const ownCol of ownColumns) {
        const ownNorm = this.normalizeColumnName(ownCol);
        for (const otherCol of other.columns) {
          if (this.normalizeColumnName(otherCol) === ownNorm) {
            matchingColumns.push(ownCol);
            break;
          }
        }
      }

      const overallScore = columnSimilarity * 0.6 + tokenSimilarity * 0.4;
      similarities.push({ datasetId: other.datasetId, columnSimilarity, tokenSimilarity, overallScore, matchingColumns });
    }

    const ranked = similarities.sort((a, b) => b.overallScore - a.overallScore);

    const suggestions = ranked.map((s) => ({
      action: 'similar_dataset',
      description: `"${s.datasetId}": similarity ${(s.overallScore * 100).toFixed(1)}% (columns: ${(s.columnSimilarity * 100).toFixed(1)}%, tokens: ${(s.tokenSimilarity * 100).toFixed(1)}%). Matching: [${s.matchingColumns.join(', ')}]`,
      confidence: Math.min(0.95, s.overallScore + 0.1),
    }));

    const mostSimilar = ranked[0];
    const interpretation = `Similarity search: compared "${task.datasetId}" against ${otherDatasets.length} datasets. Most similar: "${mostSimilar?.datasetId ?? 'none'}" (${((mostSimilar?.overallScore ?? 0) * 100).toFixed(1)}%). ${ranked.filter((s) => s.overallScore > 0.5).length} datasets >50% similar.`;

    await prisma.auditLog.create({
      data: {
        action: 'knowledge_graph_find_similar',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ datasetsCompared: otherDatasets.length, topScore: mostSimilar?.overallScore }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: false,
      executedAt: new Date(),
    };
  }
}
