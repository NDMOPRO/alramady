import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import crypto from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────

interface JoinConfig {
  leftDatasetId: string;
  rightDatasetId: string;
  joinType: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'CROSS';
  joinKeys: JoinKey[];
  tenantId: string;
  userId: string;
  outputName?: string;
}

interface JoinKey {
  leftColumn: string;
  rightColumn: string;
}

interface JoinSuggestion {
  leftColumn: string;
  rightColumn: string;
  confidence: number;
  matchType: 'exact_name' | 'similar_name' | 'type_match' | 'value_overlap';
  overlapPercentage: number;
  sampleMatches: Array<{ left: unknown; right: unknown }>;
}

interface JoinDetectionResult {
  datasetPairs: Array<{
    leftDatasetId: string;
    leftDatasetName: string;
    rightDatasetId: string;
    rightDatasetName: string;
    suggestions: JoinSuggestion[];
  }>;
  totalSuggestions: number;
}

interface JoinResult {
  datasetId: string;
  name: string;
  rowCount: number;
  columnCount: number;
  joinType: string;
  leftRowsMatched: number;
  rightRowsMatched: number;
  leftRowsUnmatched: number;
  rightRowsUnmatched: number;
  executionTimeMs: number;
}

interface JoinPreviewResult {
  columns: string[];
  rows: Record<string, any>[];
  totalEstimatedRows: number;
  leftRowsMatched: number;
  rightRowsMatched: number;
}

interface DatasetInfo {
  id: string;
  name: string;
  columns: Array<{
    name: string;
    dataType: string | null;
  }>;
  rows: Record<string, any>[];
}

// ─── Service ───────────────────────────────────────────────────────

export class JoinBuilderService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async detectJoinKeys(
    datasetIds: string[],
    tenantId: string
  ): Promise<JoinDetectionResult> {
    logger.info('Detecting join keys', { datasetIds, tenantId });

    if (datasetIds.length < 2) {
      throw new Error('At least 2 dataset IDs are required for join detection');
    }

    // Load dataset info
    const datasets: DatasetInfo[] = [];
    for (const dsId of datasetIds) {
      const ds = await this.loadDatasetInfo(dsId, tenantId);
      datasets.push(ds);
    }

    const pairs: JoinDetectionResult['datasetPairs'] = [];
    let totalSuggestions = 0;

    // Compare all pairs
    for (let i = 0; i < datasets.length; i++) {
      for (let j = i + 1; j < datasets.length; j++) {
        const suggestions = this.detectPairJoinKeys(datasets[i], datasets[j]);
        if (suggestions.length > 0) {
          pairs.push({
            leftDatasetId: datasets[i].id,
            leftDatasetName: datasets[i].name,
            rightDatasetId: datasets[j].id,
            rightDatasetName: datasets[j].name,
            suggestions,
          });
          totalSuggestions += suggestions.length;
        }
      }
    }

    await this.logAudit(tenantId, 'join_keys_detect', JSON.stringify({
      datasetIds,
      totalSuggestions,
    }));

    return { datasetPairs: pairs, totalSuggestions };
  }

  async executeJoin(config: JoinConfig): Promise<JoinResult> {
    logger.info('Executing join', {
      leftDatasetId: config.leftDatasetId,
      rightDatasetId: config.rightDatasetId,
      joinType: config.joinType,
    });
    const startTime = Date.now();

    const leftDs = await this.loadDatasetInfo(config.leftDatasetId, config.tenantId);
    const rightDs = await this.loadDatasetInfo(config.rightDatasetId, config.tenantId);

    // Perform the join
    const {
      resultRows,
      leftMatched,
      rightMatched,
      leftUnmatched,
      rightUnmatched,
    } = this.performJoin(leftDs.rows, rightDs.rows, config.joinType, config.joinKeys, leftDs.name, rightDs.name);

    // Create new dataset
    const outputName = config.outputName
      || `${leftDs.name} ${config.joinType} JOIN ${rightDs.name}`;
    const columns = resultRows.length > 0 ? Object.keys(resultRows[0]) : [];

    const newDataset = await this.prisma.dataset.create({
      data: {
        id: crypto.randomUUID(),
        tenantId: config.tenantId,
        name: outputName,
        sourceType: 'computed' as any,
        format: 'join',
        rowCount: BigInt(resultRows.length),
        columnCount: columns.length,
        status: 'active',
        createdBy: config.userId,
        metadata: {
          joinType: config.joinType,
          leftDatasetId: config.leftDatasetId,
          rightDatasetId: config.rightDatasetId,
          joinKeys: config.joinKeys,
        } as any,
      },
    });

    // Create columns
    for (let i = 0; i < columns.length; i++) {
      const sampleValues = resultRows.slice(0, 50).map(r => r[columns[i]]);
      await this.prisma.datasetColumn.create({
        data: {
          id: crypto.randomUUID(),
          datasetId: newDataset.id,
          name: columns[i],
          dataType: this.inferDataType(sampleValues),
          position: i,
          nullable: true,
        },
      });
    }

    // Insert rows in batches
    const BATCH_SIZE = 500;
    for (let i = 0; i < resultRows.length; i += BATCH_SIZE) {
      const batch = resultRows.slice(i, i + BATCH_SIZE);
      await this.prisma.dataRow.createMany({
        data: batch.map((row, idx) => ({
          id: crypto.randomUUID(),
          datasetId: newDataset.id,
          rowIndex: i + idx,
          data: row,
        })),
      });
    }

    // Track lineage
    await this.trackLineage(newDataset.id, config);

    // Audit
    await this.logAudit(config.tenantId, 'join_execute', JSON.stringify({
      newDatasetId: newDataset.id,
      joinType: config.joinType,
      leftDatasetId: config.leftDatasetId,
      rightDatasetId: config.rightDatasetId,
      resultRowCount: resultRows.length,
    }), config.userId);

    return {
      datasetId: newDataset.id,
      name: outputName,
      rowCount: resultRows.length,
      columnCount: columns.length,
      joinType: config.joinType,
      leftRowsMatched: leftMatched,
      rightRowsMatched: rightMatched,
      leftRowsUnmatched: leftUnmatched,
      rightRowsUnmatched: rightUnmatched,
      executionTimeMs: Date.now() - startTime,
    };
  }

  async previewJoin(config: JoinConfig, limit: number = 50): Promise<JoinPreviewResult> {
    logger.info('Previewing join', {
      leftDatasetId: config.leftDatasetId,
      rightDatasetId: config.rightDatasetId,
      joinType: config.joinType,
      limit,
    });

    const leftDs = await this.loadDatasetInfo(config.leftDatasetId, config.tenantId);
    const rightDs = await this.loadDatasetInfo(config.rightDatasetId, config.tenantId);

    const {
      resultRows,
      leftMatched,
      rightMatched,
    } = this.performJoin(leftDs.rows, rightDs.rows, config.joinType, config.joinKeys, leftDs.name, rightDs.name);

    const limitedRows = resultRows.slice(0, limit);
    const columns = limitedRows.length > 0 ? Object.keys(limitedRows[0]) : [];

    return {
      columns,
      rows: limitedRows,
      totalEstimatedRows: resultRows.length,
      leftRowsMatched: leftMatched,
      rightRowsMatched: rightMatched,
    };
  }

  // ─── Private methods ───────────────────────────────────────────

  private async loadDatasetInfo(datasetId: string, tenantId: string): Promise<DatasetInfo> {
    const dataset = await this.prisma.dataset.findFirst({
      where: { id: datasetId, tenantId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });

    if (!dataset) throw new Error(`Dataset '${datasetId}' not found`);

    const rows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
      select: { data: true },
    });

    return {
      id: dataset.id,
      name: dataset.name,
      columns: dataset.columns.map(c => ({
        name: c.name,
        dataType: c.dataType,
      })),
      rows: rows.map(r => r.data as Record<string, any>),
    };
  }

  private detectPairJoinKeys(left: DatasetInfo, right: DatasetInfo): JoinSuggestion[] {
    const suggestions: JoinSuggestion[] = [];

    for (const lCol of left.columns) {
      for (const rCol of right.columns) {
        let confidence = 0;
        let matchType: JoinSuggestion['matchType'] = 'type_match';

        // Exact name match
        if (lCol.name.toLowerCase() === rCol.name.toLowerCase()) {
          confidence = 0.9;
          matchType = 'exact_name';
        }
        // Similar name match (one contains the other, or common suffixes like _id)
        else if (this.areSimilarNames(lCol.name, rCol.name)) {
          confidence = 0.7;
          matchType = 'similar_name';
        }
        // Same data type
        else if (lCol.dataType && lCol.dataType === rCol.dataType) {
          confidence = 0.2;
          matchType = 'type_match';
        }

        if (confidence < 0.1) continue;

        // Check value overlap
        const leftValues = new Set(
          left.rows.slice(0, 200).map(r => String(r[lCol.name] ?? '').toLowerCase().trim()).filter(v => v !== '')
        );
        const rightValues = new Set(
          right.rows.slice(0, 200).map(r => String(r[rCol.name] ?? '').toLowerCase().trim()).filter(v => v !== '')
        );

        let overlap = 0;
        const sampleMatches: Array<{ left: unknown; right: unknown }> = [];

        for (const lv of leftValues) {
          if (rightValues.has(lv)) {
            overlap++;
            if (sampleMatches.length < 5) {
              sampleMatches.push({ left: lv, right: lv });
            }
          }
        }

        const overlapPercentage = leftValues.size > 0
          ? (overlap / Math.min(leftValues.size, rightValues.size)) * 100
          : 0;

        // Boost or reduce confidence based on overlap
        if (overlapPercentage > 50) {
          confidence = Math.min(1, confidence + 0.2);
          if (matchType === 'type_match') matchType = 'value_overlap';
        } else if (overlapPercentage < 5 && matchType !== 'exact_name') {
          confidence *= 0.3;
        }

        if (confidence >= 0.2) {
          suggestions.push({
            leftColumn: lCol.name,
            rightColumn: rCol.name,
            confidence: Math.round(confidence * 100) / 100,
            matchType,
            overlapPercentage: Math.round(overlapPercentage * 100) / 100,
            sampleMatches,
          });
        }
      }
    }

    // Sort by confidence descending
    suggestions.sort((a, b) => b.confidence - a.confidence);

    // Return top suggestions (avoid too many low-quality suggestions)
    return suggestions.slice(0, 10);
  }

  private areSimilarNames(name1: string, name2: string): boolean {
    const n1 = name1.toLowerCase().replace(/[_\-\s]/g, '');
    const n2 = name2.toLowerCase().replace(/[_\-\s]/g, '');

    // One contains the other
    if (n1.includes(n2) || n2.includes(n1)) return true;

    // Common ID patterns
    const idPattern = /^(.+?)_?id$/i;
    const m1 = name1.match(idPattern);
    const m2 = name2.match(idPattern);
    if (m1 && m2) {
      const base1 = m1[1].toLowerCase();
      const base2 = m2[1].toLowerCase();
      if (base1 === base2 || base1.includes(base2) || base2.includes(base1)) return true;
    }

    // Levenshtein-based similarity for short names
    if (n1.length <= 20 && n2.length <= 20) {
      const distance = this.levenshteinDistance(n1, n2);
      const maxLen = Math.max(n1.length, n2.length);
      if (maxLen > 0 && (1 - distance / maxLen) > 0.7) return true;
    }

    return false;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= a.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= b.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    return matrix[a.length][b.length];
  }

  private performJoin(
    leftRows: Record<string, any>[],
    rightRows: Record<string, any>[],
    joinType: JoinConfig['joinType'],
    joinKeys: JoinKey[],
    leftName: string,
    rightName: string
  ): {
    resultRows: Record<string, any>[];
    leftMatched: number;
    rightMatched: number;
    leftUnmatched: number;
    rightUnmatched: number;
  } {
    const resultRows: Record<string, any>[] = [];

    // Detect column collisions
    const leftCols = leftRows.length > 0 ? new Set(Object.keys(leftRows[0])) : new Set<string>();
    const rightCols = rightRows.length > 0 ? new Set(Object.keys(rightRows[0])) : new Set<string>();
    const joinKeyCols = new Set(joinKeys.map(jk => jk.rightColumn));

    const collidingCols = new Set<string>();
    for (const rc of rightCols) {
      if (leftCols.has(rc) && !joinKeyCols.has(rc)) {
        collidingCols.add(rc);
      }
    }

    // Build right index
    const rightIndex = new Map<string, Record<string, any>[]>();
    for (const rRow of rightRows) {
      const key = joinKeys.map(jk => String(rRow[jk.rightColumn] ?? '').toLowerCase().trim()).join('|||');
      const bucket = rightIndex.get(key);
      if (bucket) {
        bucket.push(rRow);
      } else {
        rightIndex.set(key, [rRow]);
      }
    }

    // Build null rows for outer joins
    const rightNullRow: Record<string, any> = {};
    for (const col of rightCols) {
      if (joinKeyCols.has(col)) continue;
      const outputCol = collidingCols.has(col) ? `${rightName}.${col}` : col;
      rightNullRow[outputCol] = null;
    }

    const leftNullRow: Record<string, any> = {};
    for (const col of leftCols) {
      leftNullRow[col] = null;
    }

    const leftMatchedSet = new Set<number>();
    const rightMatchedKeys = new Set<string>();

    if (joinType === 'CROSS') {
      for (const lRow of leftRows) {
        for (const rRow of rightRows) {
          resultRows.push(this.mergeRows(lRow, rRow, collidingCols, joinKeyCols, rightName));
        }
      }
      return {
        resultRows,
        leftMatched: leftRows.length,
        rightMatched: rightRows.length,
        leftUnmatched: 0,
        rightUnmatched: 0,
      };
    }

    for (let li = 0; li < leftRows.length; li++) {
      const lRow = leftRows[li];
      const key = joinKeys.map(jk => String(lRow[jk.leftColumn] ?? '').toLowerCase().trim()).join('|||');
      const rightMatches = rightIndex.get(key);

      if (rightMatches && rightMatches.length > 0) {
        leftMatchedSet.add(li);
        rightMatchedKeys.add(key);
        for (const rRow of rightMatches) {
          resultRows.push(this.mergeRows(lRow, rRow, collidingCols, joinKeyCols, rightName));
        }
      } else if (joinType === 'LEFT' || joinType === 'FULL') {
        resultRows.push({ ...lRow, ...rightNullRow });
      }
    }

    if (joinType === 'RIGHT' || joinType === 'FULL') {
      for (const rRow of rightRows) {
        const key = joinKeys.map(jk => String(rRow[jk.rightColumn] ?? '').toLowerCase().trim()).join('|||');
        if (!rightMatchedKeys.has(key)) {
          const merged = { ...leftNullRow };
          for (const [col, val] of Object.entries(rRow)) {
            if (joinKeyCols.has(col)) continue;
            const outputCol = collidingCols.has(col) ? `${rightName}.${col}` : col;
            merged[outputCol] = val;
          }
          // Copy join key values from right side
          for (const jk of joinKeys) {
            merged[jk.leftColumn] = rRow[jk.rightColumn];
          }
          resultRows.push(merged);
        }
      }
    }

    const leftMatched = leftMatchedSet.size;
    const rightMatched = rightMatchedKeys.size;

    return {
      resultRows,
      leftMatched,
      rightMatched,
      leftUnmatched: leftRows.length - leftMatched,
      rightUnmatched: rightRows.length - this.countMatchedRightRows(rightRows, rightMatchedKeys, joinKeys),
    };
  }

  private mergeRows(
    left: Record<string, any>,
    right: Record<string, any>,
    collidingCols: Set<string>,
    joinKeyCols: Set<string>,
    rightName: string
  ): Record<string, any> {
    const merged: Record<string, any> = { ...left };
    for (const [col, val] of Object.entries(right)) {
      if (joinKeyCols.has(col)) continue;
      const outputCol = collidingCols.has(col) ? `${rightName}.${col}` : col;
      merged[outputCol] = val;
    }
    return merged;
  }

  private countMatchedRightRows(
    rightRows: Record<string, any>[],
    matchedKeys: Set<string>,
    joinKeys: JoinKey[]
  ): number {
    let count = 0;
    for (const rRow of rightRows) {
      const key = joinKeys.map(jk => String(rRow[jk.rightColumn] ?? '').toLowerCase().trim()).join('|||');
      if (matchedKeys.has(key)) count++;
    }
    return count;
  }

  private inferDataType(values: unknown[]): string {
    const nonNull = values.filter(v => v !== null && v !== undefined && v !== '');
    if (nonNull.length === 0) return 'text';

    let allNumbers = true;
    let allBooleans = true;
    let allDates = true;

    for (const v of nonNull.slice(0, 50)) {
      if (typeof v !== 'number' && isNaN(Number(v))) allNumbers = false;
      if (typeof v !== 'boolean' && v !== 'true' && v !== 'false') allBooleans = false;
      if (typeof v === 'string' && isNaN(Date.parse(v))) allDates = false;
      if (typeof v !== 'string') allDates = false;
    }

    if (allBooleans) return 'boolean';
    if (allNumbers) return 'number';
    if (allDates) return 'date';
    return 'text';
  }

  private async trackLineage(newDatasetId: string, config: JoinConfig): Promise<void> {
    try {
      // Create lineage nodes
      const sourceNodeId = crypto.randomUUID();
      const targetNodeId = crypto.randomUUID();
      const outputNodeId = crypto.randomUUID();

      await this.prisma.lineageNode.createMany({
        data: [
          {
            id: sourceNodeId,
            datasetId: config.leftDatasetId,
            type: 'source',
            name: `Left source for join`,
            metadata: { joinRole: 'left' },
          },
          {
            id: targetNodeId,
            datasetId: config.rightDatasetId,
            type: 'source',
            name: `Right source for join`,
            metadata: { joinRole: 'right' },
          },
          {
            id: outputNodeId,
            datasetId: newDatasetId,
            type: 'output',
            name: `Join result`,
            metadata: { joinType: config.joinType, joinKeys: config.joinKeys } as any,
          },
        ],
      });

      // Create lineage edges
      await this.prisma.lineageEdge.createMany({
        data: [
          {
            id: crypto.randomUUID(),
            datasetId: newDatasetId,
            sourceId: sourceNodeId,
            targetId: outputNodeId,
            transformationType: `${config.joinType}_JOIN`,
          },
          {
            id: crypto.randomUUID(),
            datasetId: newDatasetId,
            sourceId: targetNodeId,
            targetId: outputNodeId,
            transformationType: `${config.joinType}_JOIN`,
          },
        ],
      });
    } catch (err) {
      logger.warn('Failed to track lineage', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async logAudit(tenantId: string, action: string, details: string, userId?: string): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          tenantId,
          userId: userId || '00000000-0000-0000-0000-000000000000',
          action,
          entityType: 'dataset',
          detailsJson: { action, details, timestamp: new Date().toISOString() },
        },
      });
    } catch (err) {
      logger.warn('Failed to write audit log', { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
