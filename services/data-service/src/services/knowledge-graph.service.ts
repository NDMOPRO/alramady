/**
 * Knowledge Graph Service — Rasid Platform
 * بناء وإدارة خريطة المعرفة لربط الملفات والمصادر
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

interface KGNode {
  id: string;
  entityId: string;
  entityType: string;
  label: string;
  metadata: Record<string, any>;
}

interface KGEdge {
  id: string;
  fromId: string;
  toId: string;
  relationship: string;
  weight: number;
}

interface KnowledgeGraph {
  nodes: KGNode[];
  edges: KGEdge[];
}

interface RelatedFile {
  fileId: string;
  fileName: string;
  relationship: string;
  weight: number;
}

interface Cluster {
  id: number;
  nodes: string[];
  size: number;
  label: string;
}

export class KnowledgeGraphService {
  constructor(private prisma: PrismaClient) {}

  async buildGraph(tenantId: string): Promise<KnowledgeGraph> {
    // Fetch all data sources for the tenant
    const sources = await this.prisma.dataSource.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true, columns: true, type: true },
    });

    // Create nodes for each source
    const nodes: KGNode[] = [];
    const edges: KGEdge[] = [];

    for (const source of sources) {
      const node = await this.addNode(
        tenantId,
        source.id,
        'data_source',
        { name: source.name, type: source.type }
      );
      nodes.push(node);
    }

    // Calculate relationships between sources based on column similarity
    for (let i = 0; i < sources.length; i++) {
      for (let j = i + 1; j < sources.length; j++) {
        const colsA = this.parseColumns(sources[i].columns);
        const colsB = this.parseColumns(sources[j].columns);

        const similarity = this.jaccardSimilarity(colsA, colsB);

        if (similarity > 0.3) {
          const commonCols = colsA.filter((c) => colsB.includes(c));
          const edge = await this.addEdge(
            sources[i].id,
            sources[j].id,
            `shared_columns: ${commonCols.join(', ')}`,
            similarity
          );
          edges.push(edge);
        }
      }
    }

    logger.info('Knowledge graph built', { tenantId, nodes: nodes.length, edges: edges.length });

    return { nodes, edges };
  }

  async addNode(
    tenantId: string,
    entityId: string,
    entityType: string,
    metadata: Record<string, any>
  ): Promise<KGNode> {
    const existing = await this.prisma.knowledgeGraphNode.findFirst({
      where: { entityId, tenantId },
    });

    if (existing) {
      await this.prisma.knowledgeGraphNode.update({
        where: { id: existing.id },
        data: { metadata: JSON.stringify(metadata), updatedAt: new Date() },
      });

      return {
        id: existing.id,
        entityId,
        entityType,
        label: String(metadata.name ?? entityId),
        metadata,
      };
    }

    const node = await this.prisma.knowledgeGraphNode.create({
      data: {
        entityId,
        entityType,
        tenantId,
        label: String(metadata.name ?? entityId),
        metadata: JSON.stringify(metadata),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return {
      id: node.id,
      entityId,
      entityType,
      label: node.label,
      metadata,
    };
  }

  async addEdge(
    fromId: string,
    toId: string,
    relationship: string,
    weight: number
  ): Promise<KGEdge> {
    const existing = await this.prisma.knowledgeGraphEdge.findFirst({
      where: { fromEntityId: fromId, toEntityId: toId },
    });

    if (existing) {
      await this.prisma.knowledgeGraphEdge.update({
        where: { id: existing.id },
        data: { relationship, weight, updatedAt: new Date() },
      });

      return {
        id: existing.id,
        fromId,
        toId,
        relationship,
        weight,
      };
    }

    const edge = await this.prisma.knowledgeGraphEdge.create({
      data: {
        fromEntityId: fromId,
        toEntityId: toId,
        relationship,
        weight,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return {
      id: edge.id,
      fromId,
      toId,
      relationship,
      weight,
    };
  }

  async getRelatedFiles(fileId: string): Promise<RelatedFile[]> {
    const edges = await this.prisma.knowledgeGraphEdge.findMany({
      where: {
        OR: [{ fromEntityId: fileId }, { toEntityId: fileId }],
      },
      orderBy: { weight: 'desc' },
    });

    const relatedFiles: RelatedFile[] = [];

    for (const edge of edges) {
      const relatedId = edge.fromEntityId === fileId ? edge.toEntityId : edge.fromEntityId;

      const node = await this.prisma.knowledgeGraphNode.findFirst({
        where: { entityId: relatedId },
      });

      relatedFiles.push({
        fileId: relatedId,
        fileName: node?.label ?? relatedId,
        relationship: edge.relationship,
        weight: edge.weight,
      });
    }

    return relatedFiles;
  }

  async getGraph(tenantId: string): Promise<KnowledgeGraph> {
    const nodes = await this.prisma.knowledgeGraphNode.findMany({
      where: { tenantId },
    });
    const nodeEntityIds = nodes.map((n) => n.entityId);
    const edges = await this.prisma.knowledgeGraphEdge.findMany({
      where: {
        fromEntityId: { in: nodeEntityIds },
      },
    });

    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        entityId: n.entityId,
        entityType: n.entityType,
        label: n.label,
        metadata: typeof n.metadata === 'string' ? JSON.parse(n.metadata) : (n.metadata as unknown as Record<string, any>) ?? {},
      })),
      edges: edges.map((e) => ({
        id: e.id,
        fromId: e.fromEntityId,
        toId: e.toEntityId,
        relationship: e.relationship,
        weight: e.weight,
      })),
    };
  }

  async detectClusters(tenantId: string): Promise<Cluster[]> {
    const graph = await this.getGraph(tenantId);

    // Union-Find algorithm
    const parent = new Map<string, string>();
    const rank = new Map<string, number>();

    const find = (x: string): string => {
      if (!parent.has(x)) {
        parent.set(x, x);
        rank.set(x, 0);
      }
      if (parent.get(x) !== x) {
        parent.set(x, find(parent.get(x)!));
      }
      return parent.get(x)!;
    };

    const union = (x: string, y: string): void => {
      const rootX = find(x);
      const rootY = find(y);
      if (rootX === rootY) return;

      const rankX = rank.get(rootX) ?? 0;
      const rankY = rank.get(rootY) ?? 0;

      if (rankX < rankY) {
        parent.set(rootX, rootY);
      } else if (rankX > rankY) {
        parent.set(rootY, rootX);
      } else {
        parent.set(rootY, rootX);
        rank.set(rootX, rankX + 1);
      }
    };

    // Initialize all nodes
    for (const node of graph.nodes) {
      find(node.entityId);
    }

    // Union connected nodes
    for (const edge of graph.edges) {
      union(edge.fromId, edge.toId);
    }

    // Group nodes by cluster
    const clusterMap = new Map<string, string[]>();
    for (const node of graph.nodes) {
      const root = find(node.entityId);
      if (!clusterMap.has(root)) {
        clusterMap.set(root, []);
      }
      clusterMap.get(root)!.push(node.entityId);
    }

    // Build cluster results
    const clusters: Cluster[] = [];
    let clusterId = 0;

    for (const [_root, members] of clusterMap) {
      if (members.length > 1) {
        clusters.push({
          id: clusterId++,
          nodes: members,
          size: members.length,
          label: `Cluster ${clusterId}`,
        });
      }
    }

    return clusters.sort((a, b) => b.size - a.size);
  }

  private jaccardSimilarity(setA: string[], setB: string[]): number {
    const a = new Set(setA.map((s) => s.toLowerCase().trim()));
    const b = new Set(setB.map((s) => s.toLowerCase().trim()));

    const intersection = new Set([...a].filter((x) => b.has(x)));
    const unionSet = new Set([...a, ...b]);

    if (unionSet.size === 0) return 0;
    return intersection.size / unionSet.size;
  }

  private parseColumns(columns: unknown): string[] {
    if (typeof columns === 'string') {
      try {
        return JSON.parse(columns) as string[];
      } catch {
        return columns.split(',').map((c) => c.trim());
      }
    }
    if (Array.isArray(columns)) {
      return columns.map(String);
    }
    return [];
  }
}
