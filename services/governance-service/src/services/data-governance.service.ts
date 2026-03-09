import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

const SYNTHETIC_FIRST_NAMES = [
  'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Quinn', 'Avery',
  'Harper', 'Sage', 'Rowan', 'Finley', 'Dakota', 'Skyler', 'Reese', 'Emery',
];
const SYNTHETIC_LAST_NAMES = [
  'Smith', 'Johnson', 'Brown', 'Davis', 'Wilson', 'Moore', 'Anderson', 'Thomas',
  'Jackson', 'White', 'Harris', 'Martin', 'Garcia', 'Martinez', 'Robinson', 'Clark',
];
const SYNTHETIC_DOMAINS = [
  'example.com', 'test.org', 'sample.net', 'demo.io', 'synthetic.dev',
];

export class DataGovernanceService {

  async classifyData(
    datasetId: string,
    classification: 'public' | 'internal' | 'confidential' | 'restricted'
  ): Promise<Record<string, unknown>> {
    const validClassifications = ['public', 'internal', 'confidential', 'restricted'];
    if (!validClassifications.includes(classification)) {
      throw new Error(`Invalid classification '${classification}'. Must be one of: ${validClassifications.join(', ')}`);
    }

    const dataset = await prisma.dataset.findUnique({ where: { id: datasetId } });
    if (!dataset) {
      throw new Error(`Dataset with id '${datasetId}' not found`);
    }

    const previousClassification = (dataset as Record<string, unknown>).classification || 'unclassified';

    const updated = await prisma.dataset.update({
      where: { id: datasetId },
      data: {
        classification,
        updatedAt: new Date(),
      } as Record<string, unknown>,
    });

    await prisma.auditLog.create({
      data: {
        tenantId: dataset.tenantId,
        userId: 'system',
        action: 'data.classification_changed',
        entityType: 'dataset',
        entityId: datasetId,
        detailsJson: {
          previousClassification,
          newClassification: classification,
          changedAt: new Date().toISOString(),
        },
      },
    });

    logger.info('Dataset classification updated', {
      datasetId,
      from: previousClassification,
      to: classification,
    });

    return {
      datasetId,
      name: dataset.name,
      previousClassification,
      classification,
      updatedAt: (updated as Record<string, unknown>).updatedAt || new Date(),
      message: `Dataset classified as '${classification}'`,
    };
  }

  async maskSensitiveData(
    datasetId: string,
    columns: string[],
    method: 'redact' | 'hash' | 'tokenize'
  ): Promise<Record<string, unknown>> {
    const dataset = await prisma.dataset.findUnique({ where: { id: datasetId } });
    if (!dataset) {
      throw new Error(`Dataset with id '${datasetId}' not found`);
    }

    if (!columns || columns.length === 0) {
      throw new Error('At least one column must be specified for masking');
    }

    const validMethods = ['redact', 'hash', 'tokenize'];
    if (!validMethods.includes(method)) {
      throw new Error(`Invalid masking method '${method}'. Must be one of: ${validMethods.join(', ')}`);
    }

    const versions = await prisma.datasetVersion.findMany({
      where: { datasetId },
      orderBy: { version: 'desc' },
      take: 1,
    });

    const latestVersion = versions[0];
    let rows: Record<string, unknown>[] = [];
    if (latestVersion && latestVersion.dataJson) {
      rows = Array.isArray(latestVersion.dataJson)
        ? (latestVersion.dataJson as Record<string, unknown>[])
        : [];
    }

    const tokenMap: Record<string, string> = {};
    let maskedCount = 0;

    const maskedRows = rows.map((row: Record<string, unknown>) => {
      const maskedRow = { ...row };

      for (const col of columns) {
        if (maskedRow[col] === undefined || maskedRow[col] === null) continue;

        const originalValue = String(maskedRow[col]);
        maskedCount++;

        switch (method) {
          case 'redact': {
            const len = originalValue.length;
            if (len <= 2) {
              maskedRow[col] = '***';
            } else {
              maskedRow[col] = originalValue[0] + '*'.repeat(Math.max(3, len - 2)) + originalValue[len - 1];
            }
            break;
          }
          case 'hash': {
            const fullHash = crypto
              .createHash('sha256')
              .update(originalValue)
              .digest('hex');
            maskedRow[col] = fullHash.slice(0, 8);
            break;
          }
          case 'tokenize': {
            if (!tokenMap[originalValue]) {
              tokenMap[originalValue] = crypto.randomUUID();
            }
            maskedRow[col] = tokenMap[originalValue];
            break;
          }
        }
      }

      return maskedRow;
    });

    if (latestVersion) {
      const newVersionNumber = latestVersion.version + 1;
      await prisma.datasetVersion.create({
        data: {
          datasetId,
          version: newVersionNumber,
          dataJson: JSON.parse(JSON.stringify(maskedRows)),
          changeDescription: `Masked columns [${columns.join(', ')}] using '${method}' method`,
          changedBy: 'system',
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: dataset.tenantId,
        userId: 'system',
        action: 'data.masked',
        entityType: 'dataset',
        entityId: datasetId,
        detailsJson: {
          columns,
          method,
          rowsProcessed: rows.length,
          valuesmasked: maskedCount,
          tokenMapSize: method === 'tokenize' ? Object.keys(tokenMap).length : 0,
          maskedAt: new Date().toISOString(),
        },
      },
    });

    logger.info('Sensitive data masked', {
      datasetId,
      method,
      columns,
      rowsProcessed: rows.length,
      valuesMasked: maskedCount,
    });

    return {
      datasetId,
      method,
      columns,
      rowsProcessed: rows.length,
      valuesMasked: maskedCount,
      uniqueTokens: method === 'tokenize' ? Object.keys(tokenMap).length : 0,
      sampleMasked: maskedRows.slice(0, 3),
      message: `Successfully masked ${maskedCount} values across ${columns.length} column(s) using '${method}'`,
    };
  }

  async anonymizeData(
    datasetId: string,
    columns: string[]
  ): Promise<Record<string, unknown>> {
    const dataset = await prisma.dataset.findUnique({ where: { id: datasetId } });
    if (!dataset) {
      throw new Error(`Dataset with id '${datasetId}' not found`);
    }

    if (!columns || columns.length === 0) {
      throw new Error('At least one column must be specified for anonymization');
    }

    const versions = await prisma.datasetVersion.findMany({
      where: { datasetId },
      orderBy: { version: 'desc' },
      take: 1,
    });

    const latestVersion = versions[0];
    let rows: Record<string, unknown>[] = [];
    if (latestVersion && latestVersion.dataJson) {
      rows = Array.isArray(latestVersion.dataJson)
        ? (latestVersion.dataJson as Record<string, unknown>[])
        : [];
    }

    let anonymizedCount = 0;
    const syntheticMapping: Record<string, Record<string, string>> = {};

    const anonymizedRows = rows.map((row: Record<string, unknown>) => {
      const anonRow = { ...row };

      for (const col of columns) {
        if (anonRow[col] === undefined || anonRow[col] === null) continue;

        const originalValue = String(anonRow[col]);
        anonymizedCount++;

        if (!syntheticMapping[col]) {
          syntheticMapping[col] = {};
        }

        if (syntheticMapping[col][originalValue]) {
          anonRow[col] = syntheticMapping[col][originalValue];
          continue;
        }

        const lowerCol = col.toLowerCase();
        let synthetic: string;

        if (lowerCol.includes('email') || lowerCol.includes('mail')) {
          const first = SYNTHETIC_FIRST_NAMES[crypto.randomInt(SYNTHETIC_FIRST_NAMES.length)];
          const domain = SYNTHETIC_DOMAINS[crypto.randomInt(SYNTHETIC_DOMAINS.length)];
          const rand = crypto.randomInt(999);
          synthetic = `${first.toLowerCase()}${rand}@${domain}`;
        } else if (lowerCol.includes('name') || lowerCol.includes('first') || lowerCol.includes('last')) {
          const first = SYNTHETIC_FIRST_NAMES[crypto.randomInt(SYNTHETIC_FIRST_NAMES.length)];
          const last = SYNTHETIC_LAST_NAMES[crypto.randomInt(SYNTHETIC_LAST_NAMES.length)];
          synthetic = lowerCol.includes('first') ? first
            : lowerCol.includes('last') ? last
            : `${first} ${last}`;
        } else if (lowerCol.includes('phone') || lowerCol.includes('tel') || lowerCol.includes('mobile')) {
          const areaCode = crypto.randomInt(100, 1000);
          const mid = crypto.randomInt(100, 1000);
          const last4 = crypto.randomInt(1000, 10000);
          synthetic = `+1-${areaCode}-${mid}-${last4}`;
        } else if (lowerCol.includes('address') || lowerCol.includes('street')) {
          const num = crypto.randomInt(1, 10000);
          const streets = ['Main St', 'Oak Ave', 'Park Blvd', 'Elm Dr', 'Cedar Ln', 'Maple Ct'];
          synthetic = `${num} ${streets[crypto.randomInt(streets.length)]}`;
        } else if (lowerCol.includes('ssn') || lowerCol.includes('social')) {
          const a = crypto.randomInt(100, 1000);
          const b = crypto.randomInt(10, 100);
          const c = crypto.randomInt(1000, 10000);
          synthetic = `${a}-${b}-${c}`;
        } else {
          synthetic = `ANON_${crypto.randomBytes(6).toString('hex')}`;
        }

        syntheticMapping[col][originalValue] = synthetic;
        anonRow[col] = synthetic;
      }

      return anonRow;
    });

    if (latestVersion) {
      await prisma.datasetVersion.create({
        data: {
          datasetId,
          version: latestVersion.version + 1,
          dataJson: JSON.parse(JSON.stringify(anonymizedRows)),
          changeDescription: `Anonymized columns [${columns.join(', ')}] with synthetic data`,
          changedBy: 'system',
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: dataset.tenantId,
        userId: 'system',
        action: 'data.anonymized',
        entityType: 'dataset',
        entityId: datasetId,
        detailsJson: {
          columns,
          rowsProcessed: rows.length,
          valuesAnonymized: anonymizedCount,
          uniqueMappings: Object.values(syntheticMapping).reduce(
            (sum, m) => sum + Object.keys(m).length, 0
          ),
          anonymizedAt: new Date().toISOString(),
        },
      },
    });

    logger.info('Data anonymized', {
      datasetId,
      columns,
      rowsProcessed: rows.length,
      valuesAnonymized: anonymizedCount,
    });

    return {
      datasetId,
      columns,
      rowsProcessed: rows.length,
      valuesAnonymized: anonymizedCount,
      sampleAnonymized: anonymizedRows.slice(0, 3),
      message: `Successfully anonymized ${anonymizedCount} values across ${columns.length} column(s)`,
    };
  }

  async trackDataLineage(
    datasetId: string
  ): Promise<Record<string, unknown>> {
    const dataset = await prisma.dataset.findUnique({ where: { id: datasetId } });
    if (!dataset) {
      throw new Error(`Dataset with id '${datasetId}' not found`);
    }

    const versions = await prisma.datasetVersion.findMany({
      where: { datasetId },
      orderBy: { version: 'asc' },
    });

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entityId: datasetId,
        entityType: 'dataset',
      },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    const transformations = versions.map((ver, index) => ({
      version: ver.version,
      description: ver.changeDescription || `Version ${ver.version}`,
      changedBy: ver.changedBy || 'unknown',
      createdAt: ver.createdAt,
      isInitial: index === 0,
      changeFromPrevious: index > 0
        ? {
            fromVersion: versions[index - 1].version,
            toVersion: ver.version,
            timeDelta: ver.createdAt.getTime() - versions[index - 1].createdAt.getTime(),
          }
        : null,
    }));

    const actionTimeline = auditLogs.map(log => ({
      action: log.action,
      user: log.user?.name || log.userId,
      details: log.detailsJson,
      timestamp: log.createdAt,
    }));

    const derivedDatasets = await prisma.dataset.findMany({
      where: {
        tenantId: dataset.tenantId,
        name: { contains: dataset.name },
        id: { not: datasetId },
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
    });

    const lineageGraph = {
      source: {
        id: dataset.id,
        name: dataset.name,
        createdAt: dataset.createdAt,
        type: 'origin',
      },
      transformations,
      derivedDatasets: derivedDatasets.map(d => ({
        id: d.id,
        name: d.name,
        createdAt: d.createdAt,
        type: 'derived',
      })),
      edges: [
        ...transformations.filter(t => !t.isInitial).map(t => ({
          from: `v${t.changeFromPrevious?.fromVersion}`,
          to: `v${t.version}`,
          label: t.description,
        })),
        ...derivedDatasets.map(d => ({
          from: dataset.id,
          to: d.id,
          label: 'derived',
        })),
      ],
    };

    logger.info('Data lineage tracked', {
      datasetId,
      versionCount: versions.length,
      auditLogCount: auditLogs.length,
      derivedCount: derivedDatasets.length,
    });

    return {
      datasetId,
      datasetName: dataset.name,
      tenantId: dataset.tenantId,
      totalVersions: versions.length,
      totalAuditEntries: auditLogs.length,
      lineageGraph,
      actionTimeline,
    };
  }
}

export const dataGovernanceService = new DataGovernanceService();
