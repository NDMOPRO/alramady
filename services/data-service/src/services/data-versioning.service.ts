import { Prisma, PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export class DataVersioningService {

  async createVersion(
    datasetId: string,
    description: string,
    userId: string
  ): Promise<{
    versionId: string;
    versionNumber: number;
    rowCount: number;
    schemaHash: string;
    dataHash: string;
  }> {
    logger.info('Creating dataset version snapshot', { datasetId, userId });

    const dataset = await prisma.dataset.findUnique({
      where: { id: datasetId },
      include: { columns: true },
    });

    if (!dataset) {
      throw new Error(`Dataset ${datasetId} not found`);
    }

    const existingVersions = await prisma.datasetVersion.findMany({
      where: { datasetId },
      orderBy: { version: 'desc' },
      take: 1,
    });

    const nextVersion = existingVersions.length > 0 ? existingVersions[0].version + 1 : 1;

    const allRows = await prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
    });

    const schemaSnapshot = dataset.columns.map(c => ({
      name: c.name,
      dataType: c.dataType,
      position: c.position,
      nullable: c.nullable,
    }));

    const schemaHashValue = createHash('sha256')
      .update(JSON.stringify(schemaSnapshot))
      .digest('hex');

    const rowHashes: string[] = [];
    const rowsData: Array<{ rowIndex: number; data: unknown }> = [];

    for (const row of allRows) {
      const rowStr = JSON.stringify(row.data);
      const rowHash = createHash('md5').update(rowStr).digest('hex');
      rowHashes.push(rowHash);
      rowsData.push({ rowIndex: row.rowIndex, data: row.data });
    }

    const dataHashValue = createHash('sha256')
      .update(rowHashes.join('|'))
      .digest('hex');

    const snapshotPayload = {
      schema: schemaSnapshot,
      schemaHash: schemaHashValue,
      dataHash: dataHashValue,
      rowCount: allRows.length,
      rowHashes,
      rows: rowsData,
      createdBy: userId,
      timestamp: new Date().toISOString(),
    };

    const version = await prisma.datasetVersion.create({
      data: {
        datasetId,
        version: nextVersion,
        changeType: 'update',
        changeSummary: description,
        snapshotPath: JSON.stringify(snapshotPayload),
      },
    });

    logger.info('Dataset version created', {
      datasetId,
      versionId: version.id,
      versionNumber: nextVersion,
      rowCount: allRows.length,
    });

    return {
      versionId: version.id,
      versionNumber: nextVersion,
      rowCount: allRows.length,
      schemaHash: schemaHashValue,
      dataHash: dataHashValue,
    };
  }

  async listVersions(datasetId: string): Promise<Array<{
    id: string;
    version: number;
    description: string;
    createdAt: Date;
    rowCount: number;
    changeType: string | null;
  }>> {
    logger.info('Listing versions for dataset', { datasetId });

    const versions = await prisma.datasetVersion.findMany({
      where: { datasetId },
      orderBy: { version: 'desc' },
    });

    const result = versions.map(v => {
      let rowCount = 0;
      if (v.snapshotPath) {
        try {
          const snapshot = JSON.parse(v.snapshotPath);
          rowCount = snapshot.rowCount || 0;
        } catch {
          rowCount = 0;
        }
      }

      return {
        id: v.id,
        version: v.version,
        description: v.changeSummary || '',
        createdAt: v.createdAt,
        rowCount,
        changeType: v.changeType,
      };
    });

    logger.info('Versions listed', { datasetId, versionCount: result.length });
    return result;
  }

  async restoreVersion(
    datasetId: string,
    versionId: string,
    userId: string
  ): Promise<{
    restoredVersion: number;
    rowsRestored: number;
    columnsRestored: number;
  }> {
    logger.info('Restoring dataset version', { datasetId, versionId, userId });

    const version = await prisma.datasetVersion.findUnique({
      where: { id: versionId },
    });

    if (!version) {
      throw new Error(`Version ${versionId} not found`);
    }

    if (version.datasetId !== datasetId) {
      throw new Error(`Version ${versionId} does not belong to dataset ${datasetId}`);
    }

    if (!version.snapshotPath) {
      throw new Error(`Version ${versionId} has no snapshot data`);
    }

    let snapshot: Record<string, any>;
    try {
      snapshot = JSON.parse(version.snapshotPath);
    } catch {
      throw new Error(`Version ${versionId} has corrupted snapshot data`);
    }

    const schema = snapshot.schema as Array<{
      name: string; dataType: string; position: number; nullable: boolean;
    }>;
    const rows = snapshot.rows as Array<{ rowIndex: number; data: unknown }>;

    await prisma.$transaction(async (tx) => {
      await tx.dataRow.deleteMany({ where: { datasetId } });
      await tx.datasetColumn.deleteMany({ where: { datasetId } });

      for (const col of schema) {
        await tx.datasetColumn.create({
          data: {
            datasetId,
            name: col.name,
            dataType: col.dataType,
            position: col.position,
            nullable: col.nullable,
          },
        });
      }

      const batchSize = 500;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        await tx.dataRow.createMany({
          data: batch.map(r => ({
            datasetId,
            rowIndex: r.rowIndex,
            data: r.data as Prisma.InputJsonValue,
          })),
        });
      }

      await tx.dataset.update({
        where: { id: datasetId },
        data: {
          rowCount: rows.length,
          columnCount: schema.length,
          updatedAt: new Date(),
        },
      });
    });

    await this.createVersion(datasetId, `Restored to version ${version.version}`, userId);

    logger.info('Dataset version restored', {
      datasetId,
      versionId,
      restoredVersion: version.version,
      rowsRestored: rows.length,
      columnsRestored: schema.length,
    });

    return {
      restoredVersion: version.version,
      rowsRestored: rows.length,
      columnsRestored: schema.length,
    };
  }

  async compareVersions(
    versionId1: string,
    versionId2: string
  ): Promise<{
    version1: number;
    version2: number;
    schemaChanges: { added: string[]; removed: string[]; typeChanged: Array<{ column: string; from: string; to: string }> };
    rowChanges: { added: number; removed: number; modified: number; unchanged: number };
    summary: string;
  }> {
    logger.info('Comparing versions', { versionId1, versionId2 });

    const [v1, v2] = await Promise.all([
      prisma.datasetVersion.findUnique({ where: { id: versionId1 } }),
      prisma.datasetVersion.findUnique({ where: { id: versionId2 } }),
    ]);

    if (!v1) throw new Error(`Version ${versionId1} not found`);
    if (!v2) throw new Error(`Version ${versionId2} not found`);

    let snap1: Record<string, any>, snap2: Record<string, any>;
    try {
      snap1 = JSON.parse(v1.snapshotPath || '{}');
      snap2 = JSON.parse(v2.snapshotPath || '{}');
    } catch {
      throw new Error('One or both versions have corrupted snapshot data');
    }

    const schema1 = (snap1.schema || []) as Array<{ name: string; dataType: string }>;
    const schema2 = (snap2.schema || []) as Array<{ name: string; dataType: string }>;

    const colNames1 = new Set(schema1.map(c => c.name));
    const colNames2 = new Set(schema2.map(c => c.name));

    const addedCols = [...colNames2].filter(n => !colNames1.has(n));
    const removedCols = [...colNames1].filter(n => !colNames2.has(n));

    const typeChanged: Array<{ column: string; from: string; to: string }> = [];
    for (const col1 of schema1) {
      const col2 = schema2.find(c => c.name === col1.name);
      if (col2 && col1.dataType !== col2.dataType) {
        typeChanged.push({ column: col1.name, from: col1.dataType, to: col2.dataType });
      }
    }

    const hashes1 = (snap1.rowHashes || []) as string[];
    const hashes2 = (snap2.rowHashes || []) as string[];

    const hashSet1 = new Set(hashes1);
    const hashSet2 = new Set(hashes2);

    let unchanged = 0;
    let modified = 0;

    const minLen = Math.min(hashes1.length, hashes2.length);
    for (let i = 0; i < minLen; i++) {
      if (hashes1[i] === hashes2[i]) {
        unchanged++;
      } else {
        modified++;
      }
    }

    const added = hashes2.length > hashes1.length ? hashes2.length - hashes1.length : 0;
    const removed = hashes1.length > hashes2.length ? hashes1.length - hashes2.length : 0;

    const changesExist = addedCols.length > 0 || removedCols.length > 0 || typeChanged.length > 0 ||
      added > 0 || removed > 0 || modified > 0;

    const summaryParts: string[] = [];
    if (addedCols.length > 0) summaryParts.push(`${addedCols.length} columns added`);
    if (removedCols.length > 0) summaryParts.push(`${removedCols.length} columns removed`);
    if (typeChanged.length > 0) summaryParts.push(`${typeChanged.length} column types changed`);
    if (added > 0) summaryParts.push(`${added} rows added`);
    if (removed > 0) summaryParts.push(`${removed} rows removed`);
    if (modified > 0) summaryParts.push(`${modified} rows modified`);
    if (!changesExist) summaryParts.push('No differences detected');

    const summary = `Version ${v1.version} vs ${v2.version}: ${summaryParts.join(', ')}`;

    logger.info('Version comparison completed', { versionId1, versionId2, summary });

    return {
      version1: v1.version,
      version2: v2.version,
      schemaChanges: { added: addedCols, removed: removedCols, typeChanged },
      rowChanges: { added, removed, modified, unchanged },
      summary,
    };
  }

  async branchDataset(
    datasetId: string,
    name: string,
    userId: string
  ): Promise<{
    branchDatasetId: string;
    branchName: string;
    rowsCopied: number;
    columnsCopied: number;
  }> {
    logger.info('Branching dataset', { datasetId, name, userId });

    const sourceDataset = await prisma.dataset.findUnique({
      where: { id: datasetId },
      include: { columns: true },
    });

    if (!sourceDataset) {
      throw new Error(`Source dataset ${datasetId} not found`);
    }

    const sourceRows = await prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
    });

    const branchDataset = await prisma.dataset.create({
      data: {
        tenantId: sourceDataset.tenantId,
        name,
        description: `Branch of "${sourceDataset.name}" (source: ${datasetId})`,
        sourceType: sourceDataset.sourceType,
        format: sourceDataset.format,
        rowCount: sourceDataset.rowCount,
        columnCount: sourceDataset.columnCount,
        schemaJson: sourceDataset.schemaJson || undefined,
        status: 'active',
        createdBy: userId,
      },
    });

    for (const col of sourceDataset.columns) {
      await prisma.datasetColumn.create({
        data: {
          datasetId: branchDataset.id,
          name: col.name,
          dataType: col.dataType,
          position: col.position,
          nullable: col.nullable,
        },
      });
    }

    const batchSize = 500;
    for (let i = 0; i < sourceRows.length; i += batchSize) {
      const batch = sourceRows.slice(i, i + batchSize);
      await prisma.dataRow.createMany({
        data: batch.map(r => ({
          datasetId: branchDataset.id,
          rowIndex: r.rowIndex,
          data: r.data as Prisma.InputJsonValue,
        })),
      });
    }

    await this.createVersion(
      branchDataset.id,
      `Initial branch from dataset "${sourceDataset.name}" (${datasetId})`,
      userId
    );

    logger.info('Dataset branched successfully', {
      sourceDatasetId: datasetId,
      branchDatasetId: branchDataset.id,
      branchName: name,
      rowsCopied: sourceRows.length,
      columnsCopied: sourceDataset.columns.length,
    });

    return {
      branchDatasetId: branchDataset.id,
      branchName: name,
      rowsCopied: sourceRows.length,
      columnsCopied: sourceDataset.columns.length,
    };
  }
}
