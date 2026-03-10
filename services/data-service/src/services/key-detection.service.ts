/**
 * Key Detection Service - Rasid Platform
 * Detects primary keys, foreign keys, and builds relationship maps across datasets
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

interface PKCandidate {
  column: string;
  uniquenessRatio: number;
  nonNullRatio: number;
  namePatternScore: number;
  overallScore: number;
  isComposite: false;
}

interface CompositePKCandidate {
  columns: string[];
  uniquenessRatio: number;
  nonNullRatio: number;
  overallScore: number;
  isComposite: true;
}

interface FKCandidate {
  sourceColumn: string;
  targetDatasetId: string;
  targetColumn: string;
  overlapRatio: number;
  namePatternScore: number;
  typeCompatible: boolean;
  overallScore: number;
}

interface RelationshipEdge {
  sourceDatasetId: string;
  sourceColumn: string;
  targetDatasetId: string;
  targetColumn: string;
  type: '1:1' | '1:N' | 'N:M';
  confidence: number;
}

interface RelationshipGraph {
  nodes: Array<{ datasetId: string; name: string; columns: string[] }>;
  edges: RelationshipEdge[];
}

type DataRow = Record<string, string | number | null>;

const PK_NAME_PATTERNS = [/^id$/i, /_id$/i, /^key$/i, /_key$/i, /^code$/i, /_code$/i, /^number$/i, /_number$/i, /^pk$/i, /^uuid$/i];

export class KeyDetectionService {
  async detectPrimaryKeys(
    datasetId: string,
    tenantId: string
  ): Promise<Array<PKCandidate | CompositePKCandidate>> {
    logger.info('Detecting primary keys', { datasetId, tenantId });

    const dataset = await prisma.dataset.findFirst({
      where: { id: datasetId, tenantId },
      include: { columns: true },
    });

    if (!dataset) {
      throw new Error(`Dataset ${datasetId} not found for tenant ${tenantId}`);
    }

    const rows: DataRow[] = await this.fetchDataRows(datasetId);

    if (rows.length === 0) {
      return [];
    }

    const columnNames = dataset.columns.map((c) => c.name);
    const singleCandidates: PKCandidate[] = [];

    for (const col of columnNames) {
      const values = rows.map((r) => r[col]);
      const nonNullValues = values.filter((v) => v !== null && v !== undefined);
      const nonNullRatio = nonNullValues.length / values.length;

      if (nonNullRatio < 1.0) {
        continue; // PKs must be fully non-null
      }

      const uniqueValues = new Set(nonNullValues.map(String));
      const uniquenessRatio = uniqueValues.size / nonNullValues.length;

      const namePatternScore = this.scoreNamePattern(col);

      const overallScore = uniquenessRatio * 0.5 + nonNullRatio * 0.3 + namePatternScore * 0.2;

      if (uniquenessRatio >= 0.95) {
        singleCandidates.push({
          column: col,
          uniquenessRatio,
          nonNullRatio,
          namePatternScore,
          overallScore,
          isComposite: false,
        });
      }
    }

    const compositeCandidates: CompositePKCandidate[] = [];

    if (singleCandidates.filter((c) => c.uniquenessRatio >= 1.0).length === 0 && columnNames.length >= 2) {
      const potentialCols = columnNames.filter((col) => {
        const values = rows.map((r) => r[col]);
        const nonNullValues = values.filter((v) => v !== null && v !== undefined);
        return nonNullValues.length === values.length;
      });

      for (let i = 0; i < Math.min(potentialCols.length, 6); i++) {
        for (let j = i + 1; j < Math.min(potentialCols.length, 6); j++) {
          const compositeKeys = rows.map((r) => `${String(r[potentialCols[i]])}||${String(r[potentialCols[j]])}`);
          const uniqueComposites = new Set(compositeKeys);
          const uniquenessRatio = uniqueComposites.size / rows.length;

          if (uniquenessRatio >= 0.99) {
            compositeCandidates.push({
              columns: [potentialCols[i], potentialCols[j]],
              uniquenessRatio,
              nonNullRatio: 1.0,
              overallScore: uniquenessRatio * 0.8,
              isComposite: true,
            });
          }
        }
      }
    }

    const allCandidates: Array<PKCandidate | CompositePKCandidate> = [
      ...singleCandidates.sort((a, b) => b.overallScore - a.overallScore),
      ...compositeCandidates.sort((a, b) => b.overallScore - a.overallScore),
    ];

    logger.info('Primary key detection complete', {
      datasetId,
      tenantId,
      candidatesFound: allCandidates.length,
    });

    return allCandidates;
  }

  async detectForeignKeys(
    datasetId: string,
    otherDatasetIds: string[],
    tenantId: string
  ): Promise<FKCandidate[]> {
    logger.info('Detecting foreign keys', { datasetId, otherDatasetIds, tenantId });

    const sourceDataset = await prisma.dataset.findFirst({
      where: { id: datasetId, tenantId },
      include: { columns: true },
    });

    if (!sourceDataset) {
      throw new Error(`Source dataset ${datasetId} not found`);
    }

    const sourceRows: DataRow[] = await this.fetchDataRows(datasetId);
    if (sourceRows.length === 0) {
      return [];
    }

    const candidates: FKCandidate[] = [];

    for (const otherDatasetId of otherDatasetIds) {
      const otherDataset = await prisma.dataset.findFirst({
        where: { id: otherDatasetId, tenantId },
        include: { columns: true },
      });

      if (!otherDataset) continue;

      const otherRows: DataRow[] = await this.fetchDataRows(otherDatasetId);
      if (otherRows.length === 0) continue;

      const otherPKs = await this.detectPrimaryKeys(otherDatasetId, tenantId);
      const otherPKColumns = otherPKs
        .filter((pk): pk is PKCandidate => !pk.isComposite && pk.uniquenessRatio >= 0.99)
        .map((pk) => pk.column);

      if (otherPKColumns.length === 0) {
        const allUniqueCols = otherDataset.columns
          .map((c) => c.name)
          .filter((col) => {
            const vals = otherRows.map((r) => r[col]).filter((v) => v !== null);
            return new Set(vals.map(String)).size === vals.length && vals.length > 0;
          });
        otherPKColumns.push(...allUniqueCols.slice(0, 3));
      }

      for (const sourceCol of sourceDataset.columns.map((c) => c.name)) {
        const sourceValues = new Set(
          sourceRows.map((r) => r[sourceCol]).filter((v) => v !== null && v !== undefined).map(String)
        );

        if (sourceValues.size === 0) continue;

        for (const targetCol of otherPKColumns) {
          const targetValues = new Set(
            otherRows.map((r) => r[targetCol]).filter((v) => v !== null && v !== undefined).map(String)
          );

          if (targetValues.size === 0) continue;

          let overlapCount = 0;
          for (const sv of sourceValues) {
            if (targetValues.has(sv)) overlapCount++;
          }

          const overlapRatio = overlapCount / sourceValues.size;

          if (overlapRatio < 0.3) continue;

          const namePatternScore = this.scoreFKNamePattern(sourceCol, targetCol, otherDataset.name);

          const sourceColDef = sourceDataset.columns.find((c) => c.name === sourceCol);
          const targetColDef = otherDataset.columns.find((c) => c.name === targetCol);
          const typeCompatible = this.areTypesCompatible(
            sourceColDef?.dataType ?? 'unknown',
            targetColDef?.dataType ?? 'unknown'
          );

          const overallScore =
            overlapRatio * 0.5 +
            namePatternScore * 0.3 +
            (typeCompatible ? 0.2 : 0);

          candidates.push({
            sourceColumn: sourceCol,
            targetDatasetId: otherDatasetId,
            targetColumn: targetCol,
            overlapRatio,
            namePatternScore,
            typeCompatible,
            overallScore,
          });
        }
      }
    }

    candidates.sort((a, b) => b.overallScore - a.overallScore);

    logger.info('Foreign key detection complete', {
      datasetId,
      tenantId,
      otherDatasetIds,
      candidatesFound: candidates.length,
    });

    return candidates;
  }

  async buildRelationshipMap(
    datasetIds: string[],
    tenantId: string
  ): Promise<RelationshipGraph> {
    logger.info('Building relationship map', { datasetIds, tenantId });

    const nodes: RelationshipGraph['nodes'] = [];
    const edges: RelationshipEdge[] = [];

    for (const dsId of datasetIds) {
      const ds = await prisma.dataset.findFirst({
        where: { id: dsId, tenantId },
        include: { columns: true },
      });
      if (ds) {
        nodes.push({
          datasetId: dsId,
          name: ds.name,
          columns: ds.columns.map((c) => c.name),
        });
      }
    }

    for (const dsId of datasetIds) {
      const otherIds = datasetIds.filter((id) => id !== dsId);
      if (otherIds.length === 0) continue;

      const fkCandidates = await this.detectForeignKeys(dsId, otherIds, tenantId);

      for (const fk of fkCandidates) {
        if (fk.overallScore < 0.4) continue;

        const existingEdge = edges.find(
          (e) =>
            (e.sourceDatasetId === dsId && e.targetDatasetId === fk.targetDatasetId &&
             e.sourceColumn === fk.sourceColumn && e.targetColumn === fk.targetColumn) ||
            (e.sourceDatasetId === fk.targetDatasetId && e.targetDatasetId === dsId &&
             e.sourceColumn === fk.targetColumn && e.targetColumn === fk.sourceColumn)
        );

        if (existingEdge) continue;

        const relType = await this.classifyRelationship(dsId, fk, tenantId);

        edges.push({
          sourceDatasetId: dsId,
          sourceColumn: fk.sourceColumn,
          targetDatasetId: fk.targetDatasetId,
          targetColumn: fk.targetColumn,
          type: relType,
          confidence: fk.overallScore,
        });
      }
    }

    logger.info('Relationship map built', {
      tenantId,
      nodeCount: nodes.length,
      edgeCount: edges.length,
    });

    return { nodes, edges };
  }

  private scoreNamePattern(columnName: string): number {
    for (const pattern of PK_NAME_PATTERNS) {
      if (pattern.test(columnName)) return 1.0;
    }
    const lower = columnName.toLowerCase();
    if (lower.includes('id') || lower.includes('key') || lower.includes('code')) {
      return 0.5;
    }
    return 0;
  }

  private scoreFKNamePattern(sourceCol: string, targetCol: string, targetTableName: string): number {
    const srcLower = sourceCol.toLowerCase();
    const tblLower = targetTableName.toLowerCase().replace(/[\s_-]/g, '');

    // Pattern: source column is "tableName_id" matching target table
    if (srcLower.replace(/[_-]/g, '').includes(tblLower) && srcLower.includes('id')) {
      return 1.0;
    }

    // Columns have same name
    if (sourceCol === targetCol) {
      return 0.8;
    }

    // Both contain "id"
    if (srcLower.includes('id') && targetCol.toLowerCase().includes('id')) {
      return 0.4;
    }

    return 0;
  }

  private areTypesCompatible(type1: string, type2: string): boolean {
    if (type1 === type2) return true;
    const numericTypes = ['int', 'integer', 'bigint', 'float', 'double', 'decimal', 'number', 'numeric'];
    const stringTypes = ['varchar', 'text', 'string', 'char', 'nvarchar'];
    const isNumeric1 = numericTypes.some((t) => type1.toLowerCase().includes(t));
    const isNumeric2 = numericTypes.some((t) => type2.toLowerCase().includes(t));
    const isString1 = stringTypes.some((t) => type1.toLowerCase().includes(t));
    const isString2 = stringTypes.some((t) => type2.toLowerCase().includes(t));
    if (isNumeric1 && isNumeric2) return true;
    if (isString1 && isString2) return true;
    return false;
  }

  private async classifyRelationship(
    sourceDatasetId: string,
    fk: FKCandidate,
    tenantId: string
  ): Promise<'1:1' | '1:N' | 'N:M'> {
    const sourceRows: DataRow[] = await this.fetchDataRows(sourceDatasetId);
    const targetRows: DataRow[] = await this.fetchDataRows(fk.targetDatasetId);

    const sourceValues = sourceRows.map((r) => String(r[fk.sourceColumn] ?? ''));
    const targetValues = targetRows.map((r) => String(r[fk.targetColumn] ?? ''));

    const sourceUnique = new Set(sourceValues).size === sourceValues.length;
    const targetUnique = new Set(targetValues).size === targetValues.length;

    if (sourceUnique && targetUnique) {
      return '1:1';
    }

    if (targetUnique && !sourceUnique) {
      return '1:N';
    }

    return 'N:M';
  }

  private async fetchDataRows(datasetId: string): Promise<DataRow[]> {
    const rows = await prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
      take: 10000,
    });

    return rows.map((r) => {
      const data = r.data as Record<string, any>;
      const result: DataRow = {};
      for (const [key, value] of Object.entries(data)) {
        if (value === null || value === undefined) {
          result[key] = null;
        } else if (typeof value === 'number') {
          result[key] = value;
        } else {
          result[key] = String(value);
        }
      }
      return result;
    });
  }
}
