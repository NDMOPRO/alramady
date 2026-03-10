import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

export class DataMergeService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async vlookup(
    sourceDatasetId: string,
    lookupDatasetId: string,
    sourceCol: string,
    lookupCol: string,
    returnCol: string
  ) {
    logger.info('Starting VLOOKUP operation', { sourceDatasetId, lookupDatasetId, sourceCol, lookupCol, returnCol });

    const sourceDataset = await this.prisma.dataset.findUniqueOrThrow({
      where: { id: sourceDatasetId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });
    const sourceRows = await this.prisma.dataRow.findMany({
      where: { datasetId: sourceDatasetId },
      orderBy: { rowIndex: 'asc' },
    });
    const sourceData = sourceRows.map(r => r.data as Record<string, any>);

    const lookupDataset = await this.prisma.dataset.findUniqueOrThrow({
      where: { id: lookupDatasetId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });
    const lookupRows = await this.prisma.dataRow.findMany({
      where: { datasetId: lookupDatasetId },
      orderBy: { rowIndex: 'asc' },
    });
    const lookupData = lookupRows.map(r => r.data as Record<string, any>);

    const lookupMap = new Map<string, unknown>();
    for (const row of lookupData) {
      const key = String(row[lookupCol] ?? '').toLowerCase().trim();
      if (!lookupMap.has(key)) {
        lookupMap.set(key, row[returnCol]);
      }
    }

    let matchCount = 0;
    let missCount = 0;
    const resultColumnName = `vlookup_${returnCol}`;
    const updatedRows: Record<string, any>[] = [];

    for (const row of sourceData) {
      const newRow = { ...row };
      const searchKey = String(row[sourceCol] ?? '').toLowerCase().trim();
      const matchedValue = lookupMap.get(searchKey);

      if (matchedValue !== undefined) {
        newRow[resultColumnName] = matchedValue;
        matchCount++;
      } else {
        newRow[resultColumnName] = null;
        missCount++;
      }
      updatedRows.push(newRow);
    }

    const newPosition = sourceDataset.columns.length;
    await this.prisma.datasetColumn.create({
      data: {
        datasetId: sourceDatasetId,
        name: resultColumnName,
        dataType: this.inferColumnType(updatedRows.slice(0, 100), resultColumnName),
        position: newPosition,
        nullable: true,
      },
    });

    await this.prisma.dataset.update({
      where: { id: sourceDatasetId },
      data: {
        columnCount: newPosition + 1,
        sizeBytes: BigInt(JSON.stringify(updatedRows).length),
      },
    });

    await this.prisma.dataRow.deleteMany({ where: { datasetId: sourceDatasetId } });

    const CHUNK = 1000;
    for (let i = 0; i < updatedRows.length; i += CHUNK) {
      await this.prisma.dataRow.createMany({
        data: updatedRows.slice(i, i + CHUNK).map((row, idx) => ({
          datasetId: sourceDatasetId,
          rowIndex: i + idx,
          data: row,
        })),
      });
    }

    logger.info('VLOOKUP completed', {
      sourceDatasetId,
      lookupDatasetId,
      matchCount,
      missCount,
      resultColumn: resultColumnName,
    });

    return {
      datasetId: sourceDatasetId,
      resultColumn: resultColumnName,
      sourceCol,
      lookupCol,
      returnCol,
      totalRows: updatedRows.length,
      matchCount,
      missCount,
      matchRate: updatedRows.length > 0
        ? Math.round((matchCount / updatedRows.length) * 10000) / 100
        : 0,
      sampleMatches: updatedRows.slice(0, 5).map(r => ({
        [sourceCol]: r[sourceCol],
        [resultColumnName]: r[resultColumnName],
      })),
    };
  }

  async fuzzyMatch(
    sourceId: string,
    targetId: string,
    columns: string[],
    threshold: number
  ) {
    logger.info('Starting fuzzy match', { sourceId, targetId, columns, threshold });

    const sourceRows = await this.prisma.dataRow.findMany({
      where: { datasetId: sourceId },
      orderBy: { rowIndex: 'asc' },
    });
    const sourceData = sourceRows.map(r => r.data as Record<string, any>);

    const targetRows = await this.prisma.dataRow.findMany({
      where: { datasetId: targetId },
      orderBy: { rowIndex: 'asc' },
    });
    const targetData = targetRows.map(r => r.data as Record<string, any>);

    const levenshtein = (a: string, b: string): number => {
      const aLen = a.length;
      const bLen = b.length;
      if (aLen === 0) return bLen;
      if (bLen === 0) return aLen;

      const matrix: number[][] = [];
      for (let i = 0; i <= aLen; i++) {
        matrix[i] = [i];
      }
      for (let j = 0; j <= bLen; j++) {
        matrix[0][j] = j;
      }

      for (let i = 1; i <= aLen; i++) {
        for (let j = 1; j <= bLen; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          matrix[i][j] = Math.min(
            matrix[i - 1][j] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j - 1] + cost
          );
        }
      }
      return matrix[aLen][bLen];
    };

    const similarity = (a: string, b: string): number => {
      const maxLen = Math.max(a.length, b.length);
      if (maxLen === 0) return 1.0;
      const distance = levenshtein(a.toLowerCase(), b.toLowerCase());
      return (maxLen - distance) / maxLen;
    };

    const matches: Array<{
      sourceIndex: number;
      targetIndex: number;
      sourceRow: Record<string, any>;
      targetRow: Record<string, any>;
      scores: Record<string, number>;
      avgScore: number;
    }> = [];

    for (let si = 0; si < sourceData.length; si++) {
      let bestMatch: typeof matches[0] | null = null;
      let bestScore = 0;

      for (let ti = 0; ti < targetData.length; ti++) {
        const scores: Record<string, number> = {};
        let totalScore = 0;

        for (const col of columns) {
          const sourceVal = String(sourceData[si][col] ?? '');
          const targetVal = String(targetData[ti][col] ?? '');
          const score = similarity(sourceVal, targetVal);
          scores[col] = Math.round(score * 10000) / 10000;
          totalScore += score;
        }

        const avgScore = totalScore / columns.length;
        if (avgScore >= threshold && avgScore > bestScore) {
          bestScore = avgScore;
          bestMatch = {
            sourceIndex: si,
            targetIndex: ti,
            sourceRow: sourceData[si],
            targetRow: targetData[ti],
            scores,
            avgScore: Math.round(avgScore * 10000) / 10000,
          };
        }
      }

      if (bestMatch) {
        matches.push(bestMatch);
      }
    }

    matches.sort((a, b) => b.avgScore - a.avgScore);

    const matchRows: Record<string, any>[] = matches.map((m, idx) => ({
      match_index: idx,
      source_row_index: m.sourceIndex,
      target_row_index: m.targetIndex,
      avg_score: m.avgScore,
      ...Object.fromEntries(columns.map(c => [`score_${c}`, m.scores[c]])),
      ...Object.fromEntries(columns.map(c => [`source_${c}`, m.sourceRow[c]])),
      ...Object.fromEntries(columns.map(c => [`target_${c}`, m.targetRow[c]])),
    }));

    const sourceDataset = await this.prisma.dataset.findUniqueOrThrow({ where: { id: sourceId } });

    const allKeys = new Set<string>();
    matchRows.forEach(row => Object.keys(row).forEach(k => allKeys.add(k)));
    const matchColumnNames = Array.from(allKeys);

    const matchColumns = matchColumnNames.map((name, idx) => ({
      name,
      dataType: name.startsWith('score_') || name === 'avg_score' ? 'float' : 'string',
      position: idx,
      nullable: false,
    }));

    const matchDataset = await this.prisma.dataset.create({
      data: {
        tenantId: sourceDataset.tenantId,
        name: `fuzzy_match_${Date.now()}`,
        sourceType: 'manual',
        format: 'FUZZY_MATCH',
        sizeBytes: BigInt(JSON.stringify(matchRows).length),
        rowCount: BigInt(matchRows.length),
        columnCount: matchColumnNames.length,
        schemaJson: JSON.parse(JSON.stringify(matchColumns)),
        status: 'active',
        createdBy: sourceDataset.createdBy,
      },
    });

    for (const col of matchColumns) {
      await this.prisma.datasetColumn.create({
        data: {
          datasetId: matchDataset.id,
          name: col.name,
          dataType: col.dataType,
          position: col.position,
          nullable: col.nullable,
        },
      });
    }

    const CHUNK = 1000;
    for (let i = 0; i < matchRows.length; i += CHUNK) {
      await this.prisma.dataRow.createMany({
        data: matchRows.slice(i, i + CHUNK).map((row, idx) => ({
          datasetId: matchDataset.id,
          rowIndex: i + idx,
          data: row,
        })),
      });
    }

    logger.info('Fuzzy match completed', {
      matchDatasetId: matchDataset.id,
      totalSourceRows: sourceData.length,
      totalTargetRows: targetData.length,
      matchCount: matches.length,
      threshold,
    });

    return {
      matchDatasetId: matchDataset.id,
      sourceId,
      targetId,
      threshold,
      columns,
      totalSourceRows: sourceData.length,
      totalTargetRows: targetData.length,
      matchCount: matches.length,
      unmatchedSourceCount: sourceData.length - matches.length,
      avgScore: matches.length > 0
        ? Math.round((matches.reduce((s, m) => s + m.avgScore, 0) / matches.length) * 10000) / 10000
        : 0,
      topMatches: matches.slice(0, 10).map(m => ({
        sourceIndex: m.sourceIndex,
        targetIndex: m.targetIndex,
        avgScore: m.avgScore,
        scores: m.scores,
      })),
    };
  }

  async concatenateDatasets(
    datasetIds: string[],
    axis: 'vertical' | 'horizontal'
  ) {
    if (datasetIds.length < 2) {
      throw new Error('At least two dataset IDs are required for concatenation');
    }

    logger.info('Starting dataset concatenation', { datasetIds, axis });

    const allDatasets: { dataset: Record<string, any>; rows: Record<string, any>[]; columns: Array<{ name: string; dataType: string; position: number }> }[] = [];
    for (const dsId of datasetIds) {
      const dataset = await this.prisma.dataset.findUniqueOrThrow({
        where: { id: dsId },
        include: { columns: { orderBy: { position: 'asc' } } },
      });
      const dataRows = await this.prisma.dataRow.findMany({
        where: { datasetId: dsId },
        orderBy: { rowIndex: 'asc' },
      });
      allDatasets.push({
        dataset: dataset as unknown as Record<string, any>,
        rows: dataRows.map(r => r.data as Record<string, any>),
        columns: dataset.columns.map(c => ({ name: c.name, dataType: c.dataType || 'string', position: c.position ?? 0 })),
      });
    }

    let resultRows: Record<string, any>[] = [];
    let resultColumnNames: string[] = [];

    if (axis === 'vertical') {
      const allColumnNames = new Set<string>();
      for (const ds of allDatasets) {
        ds.columns.forEach((c) => allColumnNames.add(c.name));
      }
      resultColumnNames = Array.from(allColumnNames);

      for (const ds of allDatasets) {
        for (const row of ds.rows) {
          const normalizedRow: Record<string, any> = {};
          for (const colName of resultColumnNames) {
            normalizedRow[colName] = row[colName] !== undefined ? row[colName] : null;
          }
          resultRows.push(normalizedRow);
        }
      }
    } else {
      const maxRowCount = Math.max(...allDatasets.map(ds => ds.rows.length));

      for (const ds of allDatasets) {
        const prefix = ds.dataset.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
        for (const col of ds.columns) {
          const colName = `${prefix}_${col.name}`;
          resultColumnNames.push(colName);
        }
      }

      for (let i = 0; i < maxRowCount; i++) {
        const combinedRow: Record<string, any> = {};
        let colIdx = 0;
        for (const ds of allDatasets) {
          const row = ds.rows[i] || {};
          for (const col of ds.columns) {
            combinedRow[resultColumnNames[colIdx]] = row[col.name] !== undefined ? row[col.name] : null;
            colIdx++;
          }
        }
        resultRows.push(combinedRow);
      }
    }

    const columns = resultColumnNames.map((name, idx) => ({
      name,
      dataType: this.inferColumnType(resultRows.slice(0, 100), name),
      position: idx,
      nullable: resultRows.some(r => r[name] === null || r[name] === undefined),
    }));

    const firstDataset = allDatasets[0].dataset;

    const newDataset = await this.prisma.dataset.create({
      data: {
        tenantId: firstDataset.tenantId,
        name: `concat_${axis}_${datasetIds.length}_datasets_${Date.now()}`,
        sourceType: 'manual',
        format: 'CONCATENATED',
        sizeBytes: BigInt(JSON.stringify(resultRows).length),
        rowCount: BigInt(resultRows.length),
        columnCount: resultColumnNames.length,
        schemaJson: JSON.parse(JSON.stringify(columns)),
        status: 'active',
        createdBy: firstDataset.createdBy as string,
      },
    });

    for (const col of columns) {
      await this.prisma.datasetColumn.create({
        data: {
          datasetId: newDataset.id,
          name: col.name,
          dataType: col.dataType,
          position: col.position,
          nullable: col.nullable,
        },
      });
    }

    const CHUNK = 1000;
    for (let i = 0; i < resultRows.length; i += CHUNK) {
      await this.prisma.dataRow.createMany({
        data: resultRows.slice(i, i + CHUNK).map((row, idx) => ({
          datasetId: newDataset.id,
          rowIndex: i + idx,
          data: row,
        })),
      });
    }

    logger.info('Concatenation completed', {
      newDatasetId: newDataset.id,
      axis,
      rowCount: resultRows.length,
      columnCount: resultColumnNames.length,
    });

    return {
      id: newDataset.id,
      name: newDataset.name,
      axis,
      sourceDatasetIds: datasetIds,
      rowCount: resultRows.length,
      columnCount: resultColumnNames.length,
      columns,
    };
  }

  async compareDatasets(id1: string, id2: string) {
    logger.info('Starting dataset comparison', { id1, id2 });

    const dataset1 = await this.prisma.dataset.findUniqueOrThrow({
      where: { id: id1 },
      include: { columns: { orderBy: { position: 'asc' } } },
    });
    const dataset2 = await this.prisma.dataset.findUniqueOrThrow({
      where: { id: id2 },
      include: { columns: { orderBy: { position: 'asc' } } },
    });

    const rows1Raw = await this.prisma.dataRow.findMany({
      where: { datasetId: id1 },
      orderBy: { rowIndex: 'asc' },
    });
    const rows2Raw = await this.prisma.dataRow.findMany({
      where: { datasetId: id2 },
      orderBy: { rowIndex: 'asc' },
    });

    const rows1 = rows1Raw.map(r => r.data as Record<string, any>);
    const rows2 = rows2Raw.map(r => r.data as Record<string, any>);

    const cols1 = new Set(dataset1.columns.map(c => c.name));
    const cols2 = new Set(dataset2.columns.map(c => c.name));

    const addedColumns = [...cols2].filter(c => !cols1.has(c));
    const removedColumns = [...cols1].filter(c => !cols2.has(c));
    const commonColumns = [...cols1].filter(c => cols2.has(c));

    const rowToKey = (row: Record<string, any>, cols: string[]): string => {
      return cols.map(c => JSON.stringify(row[c] ?? null)).join('|||');
    };

    const map1 = new Map<string, { row: Record<string, any>; index: number }>();
    for (let i = 0; i < rows1.length; i++) {
      const key = rowToKey(rows1[i], commonColumns);
      if (!map1.has(key)) {
        map1.set(key, { row: rows1[i], index: i });
      }
    }

    const map2 = new Map<string, { row: Record<string, any>; index: number }>();
    for (let i = 0; i < rows2.length; i++) {
      const key = rowToKey(rows2[i], commonColumns);
      if (!map2.has(key)) {
        map2.set(key, { row: rows2[i], index: i });
      }
    }

    const addedRows: Array<{ index: number; row: Record<string, any> }> = [];
    const removedRows: Array<{ index: number; row: Record<string, any> }> = [];
    const changedRows: Array<{
      index1: number;
      index2: number;
      changes: Array<{ column: string; oldValue: unknown; newValue: unknown }>;
    }> = [];

    const maxLen = Math.max(rows1.length, rows2.length);
    const paired1 = new Set<number>();
    const paired2 = new Set<number>();

    for (let i = 0; i < Math.min(rows1.length, rows2.length); i++) {
      const row1 = rows1[i];
      const row2 = rows2[i];
      const changes: Array<{ column: string; oldValue: unknown; newValue: unknown }> = [];

      for (const col of commonColumns) {
        const val1 = row1[col];
        const val2 = row2[col];
        if (JSON.stringify(val1) !== JSON.stringify(val2)) {
          changes.push({ column: col, oldValue: val1, newValue: val2 });
        }
      }

      if (changes.length > 0) {
        changedRows.push({ index1: i, index2: i, changes });
      }
      paired1.add(i);
      paired2.add(i);
    }

    for (let i = rows1.length; i < maxLen; i++) {
      if (i < rows2.length) {
        addedRows.push({ index: i, row: rows2[i] });
      }
    }
    for (let i = rows2.length; i < maxLen; i++) {
      if (i < rows1.length) {
        removedRows.push({ index: i, row: rows1[i] });
      }
    }

    const totalChangedFields = changedRows.reduce((sum, cr) => sum + cr.changes.length, 0);
    const totalFields = Math.min(rows1.length, rows2.length) * commonColumns.length;
    const changePercentage = totalFields > 0
      ? Math.round((totalChangedFields / totalFields) * 10000) / 100
      : 0;

    const diffRows: Record<string, any>[] = [];
    for (const added of addedRows) {
      diffRows.push({ diff_type: 'added', row_index: added.index, ...added.row });
    }
    for (const removed of removedRows) {
      diffRows.push({ diff_type: 'removed', row_index: removed.index, ...removed.row });
    }
    for (const changed of changedRows) {
      diffRows.push({
        diff_type: 'changed',
        row_index_1: changed.index1,
        row_index_2: changed.index2,
        changed_fields: changed.changes.length,
        changes: JSON.stringify(changed.changes),
      });
    }

    logger.info('Dataset comparison completed', {
      id1,
      id2,
      addedRows: addedRows.length,
      removedRows: removedRows.length,
      changedRows: changedRows.length,
    });

    return {
      dataset1: { id: id1, name: dataset1.name, rowCount: rows1.length, columnCount: cols1.size },
      dataset2: { id: id2, name: dataset2.name, rowCount: rows2.length, columnCount: cols2.size },
      schema: {
        addedColumns,
        removedColumns,
        commonColumns,
      },
      data: {
        addedRowCount: addedRows.length,
        removedRowCount: removedRows.length,
        changedRowCount: changedRows.length,
        unchangedRowCount: Math.min(rows1.length, rows2.length) - changedRows.length,
        totalChangedFields,
        changePercentage,
      },
      addedRows: addedRows.slice(0, 50),
      removedRows: removedRows.slice(0, 50),
      changedRows: changedRows.slice(0, 50),
    };
  }

  async reconcileData(
    sourceId: string,
    targetId: string,
    rules: Array<{ sourceCol: string; targetCol: string; matchType: string }>
  ) {
    logger.info('Starting data reconciliation', { sourceId, targetId, ruleCount: rules.length });

    const sourceDataset = await this.prisma.dataset.findUniqueOrThrow({
      where: { id: sourceId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });
    const targetDataset = await this.prisma.dataset.findUniqueOrThrow({
      where: { id: targetId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });

    const sourceRowsRaw = await this.prisma.dataRow.findMany({
      where: { datasetId: sourceId },
      orderBy: { rowIndex: 'asc' },
    });
    const targetRowsRaw = await this.prisma.dataRow.findMany({
      where: { datasetId: targetId },
      orderBy: { rowIndex: 'asc' },
    });

    const sourceRows = sourceRowsRaw.map(r => r.data as Record<string, any>);
    const targetRows = targetRowsRaw.map(r => r.data as Record<string, any>);

    const matchValues = (sourceVal: unknown, targetVal: unknown, matchType: string): boolean => {
      const sStr = String(sourceVal ?? '').trim();
      const tStr = String(targetVal ?? '').trim();

      switch (matchType) {
        case 'exact':
          return sStr === tStr;
        case 'case_insensitive':
          return sStr.toLowerCase() === tStr.toLowerCase();
        case 'numeric': {
          const sNum = parseFloat(sStr);
          const tNum = parseFloat(tStr);
          return !isNaN(sNum) && !isNaN(tNum) && Math.abs(sNum - tNum) < 0.0001;
        }
        case 'numeric_tolerance': {
          const sN = parseFloat(sStr);
          const tN = parseFloat(tStr);
          if (isNaN(sN) || isNaN(tN)) return false;
          const tolerance = Math.max(Math.abs(sN), Math.abs(tN)) * 0.01;
          return Math.abs(sN - tN) <= tolerance;
        }
        case 'contains':
          return sStr.toLowerCase().includes(tStr.toLowerCase()) || tStr.toLowerCase().includes(sStr.toLowerCase());
        case 'date': {
          const sDate = new Date(sStr).getTime();
          const tDate = new Date(tStr).getTime();
          return !isNaN(sDate) && !isNaN(tDate) && sDate === tDate;
        }
        case 'trimmed':
          return sStr.replace(/\s+/g, ' ').trim() === tStr.replace(/\s+/g, ' ').trim();
        default:
          return sStr === tStr;
      }
    };

    const reconciled: Array<{
      sourceIndex: number;
      targetIndex: number | null;
      status: 'matched' | 'partial' | 'unmatched_source' | 'unmatched_target';
      discrepancies: Array<{ sourceCol: string; targetCol: string; sourceVal: unknown; targetVal: unknown; matchType: string }>;
    }> = [];

    const matchedTargetIndices = new Set<number>();

    for (let si = 0; si < sourceRows.length; si++) {
      const sourceRow = sourceRows[si];
      let bestTargetIdx = -1;
      let bestMatchCount = 0;

      for (let ti = 0; ti < targetRows.length; ti++) {
        if (matchedTargetIndices.has(ti)) continue;
        const targetRow = targetRows[ti];

        let matchCount = 0;
        for (const rule of rules) {
          if (matchValues(sourceRow[rule.sourceCol], targetRow[rule.targetCol], rule.matchType)) {
            matchCount++;
          }
        }

        if (matchCount > bestMatchCount) {
          bestMatchCount = matchCount;
          bestTargetIdx = ti;
        }
      }

      if (bestTargetIdx >= 0 && bestMatchCount > 0) {
        matchedTargetIndices.add(bestTargetIdx);
        const targetRow = targetRows[bestTargetIdx];
        const discrepancies: typeof reconciled[0]['discrepancies'] = [];

        for (const rule of rules) {
          if (!matchValues(sourceRow[rule.sourceCol], targetRow[rule.targetCol], rule.matchType)) {
            discrepancies.push({
              sourceCol: rule.sourceCol,
              targetCol: rule.targetCol,
              sourceVal: sourceRow[rule.sourceCol],
              targetVal: targetRow[rule.targetCol],
              matchType: rule.matchType,
            });
          }
        }

        reconciled.push({
          sourceIndex: si,
          targetIndex: bestTargetIdx,
          status: discrepancies.length === 0 ? 'matched' : 'partial',
          discrepancies,
        });
      } else {
        reconciled.push({
          sourceIndex: si,
          targetIndex: null,
          status: 'unmatched_source',
          discrepancies: [],
        });
      }
    }

    for (let ti = 0; ti < targetRows.length; ti++) {
      if (!matchedTargetIndices.has(ti)) {
        reconciled.push({
          sourceIndex: -1,
          targetIndex: ti,
          status: 'unmatched_target',
          discrepancies: [],
        });
      }
    }

    const matchedCount = reconciled.filter(r => r.status === 'matched').length;
    const partialCount = reconciled.filter(r => r.status === 'partial').length;
    const unmatchedSourceCount = reconciled.filter(r => r.status === 'unmatched_source').length;
    const unmatchedTargetCount = reconciled.filter(r => r.status === 'unmatched_target').length;

    const totalDiscrepancies = reconciled.reduce((sum, r) => sum + r.discrepancies.length, 0);

    const reconRows = reconciled.map((r, idx) => ({
      reconciliation_index: idx,
      source_row_index: r.sourceIndex >= 0 ? r.sourceIndex : null,
      target_row_index: r.targetIndex,
      status: r.status,
      discrepancy_count: r.discrepancies.length,
      discrepancies: r.discrepancies.length > 0 ? JSON.stringify(r.discrepancies) : null,
    }));

    const reconDataset = await this.prisma.dataset.create({
      data: {
        tenantId: sourceDataset.tenantId,
        name: `reconciliation_${Date.now()}`,
        sourceType: 'manual',
        format: 'RECONCILIATION',
        sizeBytes: BigInt(JSON.stringify(reconRows).length),
        rowCount: BigInt(reconRows.length),
        columnCount: 6,
        schemaJson: [
          { name: 'reconciliation_index', dataType: 'integer', position: 0 },
          { name: 'source_row_index', dataType: 'integer', position: 1 },
          { name: 'target_row_index', dataType: 'integer', position: 2 },
          { name: 'status', dataType: 'string', position: 3 },
          { name: 'discrepancy_count', dataType: 'integer', position: 4 },
          { name: 'discrepancies', dataType: 'text', position: 5 },
        ] as unknown as Record<string, any>,
        status: 'active',
        createdBy: sourceDataset.createdBy,
      },
    });

    const reconColumns = [
      { name: 'reconciliation_index', dataType: 'integer', position: 0, nullable: false },
      { name: 'source_row_index', dataType: 'integer', position: 1, nullable: true },
      { name: 'target_row_index', dataType: 'integer', position: 2, nullable: true },
      { name: 'status', dataType: 'string', position: 3, nullable: false },
      { name: 'discrepancy_count', dataType: 'integer', position: 4, nullable: false },
      { name: 'discrepancies', dataType: 'text', position: 5, nullable: true },
    ];

    for (const col of reconColumns) {
      await this.prisma.datasetColumn.create({
        data: {
          datasetId: reconDataset.id,
          name: col.name,
          dataType: col.dataType,
          position: col.position,
          nullable: col.nullable,
        },
      });
    }

    const CHUNK = 1000;
    for (let i = 0; i < reconRows.length; i += CHUNK) {
      await this.prisma.dataRow.createMany({
        data: reconRows.slice(i, i + CHUNK).map((row, idx) => ({
          datasetId: reconDataset.id,
          rowIndex: i + idx,
          data: row,
        })),
      });
    }

    logger.info('Reconciliation completed', {
      reconDatasetId: reconDataset.id,
      matchedCount,
      partialCount,
      unmatchedSourceCount,
      unmatchedTargetCount,
    });

    return {
      reconciliationDatasetId: reconDataset.id,
      sourceId,
      targetId,
      rules,
      summary: {
        totalSourceRows: sourceRows.length,
        totalTargetRows: targetRows.length,
        matchedCount,
        partialMatchCount: partialCount,
        unmatchedSourceCount,
        unmatchedTargetCount,
        totalDiscrepancies,
        matchRate: sourceRows.length > 0
          ? Math.round((matchedCount / sourceRows.length) * 10000) / 100
          : 0,
      },
      sampleDiscrepancies: reconciled
        .filter(r => r.discrepancies.length > 0)
        .slice(0, 20)
        .map(r => ({
          sourceIndex: r.sourceIndex,
          targetIndex: r.targetIndex,
          discrepancies: r.discrepancies,
        })),
    };
  }

  private inferColumnType(data: Record<string, any>[], columnName: string): string {
    const sample = data.slice(0, 100).map(r => r[columnName]).filter(v => v !== null && v !== undefined && v !== '');
    if (sample.length === 0) return 'string';

    const allNumbers = sample.every(v => typeof v === 'number' || (typeof v === 'string' && !isNaN(Number(v)) && v.trim() !== ''));
    if (allNumbers) {
      const hasDecimals = sample.some(v => String(v).includes('.'));
      return hasDecimals ? 'float' : 'integer';
    }

    const allBooleans = sample.every(v => typeof v === 'boolean' || ['true', 'false', '0', '1'].includes(String(v).toLowerCase()));
    if (allBooleans) return 'boolean';

    return 'string';
  }
}
