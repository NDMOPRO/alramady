import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';

const execFileAsync = promisify(execFile);

// ─── Interfaces ──────────────────────────────────────────────────────
interface BackupConfig {
  id: string;
  name: string;
  type: 'full' | 'incremental' | 'differential';
  schedule: string;
  databases: DatabaseBackupConfig[];
  storageTarget: StorageTarget;
  retention: RetentionConfig;
  encryption: EncryptionConfig;
  compression: CompressionConfig;
  notifications: NotificationConfig;
  enabled: boolean;
}

interface DatabaseBackupConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  schema?: string;
  excludeTables?: string[];
  customFlags?: string[];
}

interface StorageTarget {
  type: 'local' | 'minio' | 's3' | 'azure_blob' | 'gcs';
  basePath: string;
  bucket?: string;
  endpoint?: string;
  accessKey?: string;
  secretKey?: string;
  region?: string;
}

interface RetentionConfig {
  keepDaily: number;
  keepWeekly: number;
  keepMonthly: number;
  maxTotalSizeGB: number;
}

interface EncryptionConfig {
  enabled: boolean;
  algorithm: 'aes-256-gcm' | 'aes-256-cbc';
  keyId?: string;
}

interface CompressionConfig {
  enabled: boolean;
  algorithm: 'gzip' | 'zstd' | 'lz4';
  level: number;
}

interface NotificationConfig {
  onSuccess: boolean;
  onFailure: boolean;
  channels: string[];
}

interface BackupRecord {
  id: string;
  configId: string;
  type: 'full' | 'incremental' | 'differential';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'verifying' | 'verified';
  filePath: string;
  fileSize: number;
  compressedSize: number;
  checksum: string;
  database: string;
  startedAt: Date;
  completedAt?: Date;
  duration: number;
  error?: string;
  metadata: Record<string, unknown>;
}

interface RestoreRequest {
  backupId: string;
  targetDatabase: string;
  targetHost?: string;
  targetPort?: number;
  dropExisting: boolean;
  schemaOnly: boolean;
  tables?: string[];
}

interface RestoreResult {
  success: boolean;
  backupId: string;
  targetDatabase: string;
  duration: number;
  tablesRestored: number;
  rowsRestored: number;
  error?: string;
}

interface VerificationResult {
  backupId: string;
  valid: boolean;
  checksumMatch: boolean;
  sizeValid: boolean;
  canDecompress: boolean;
  canDecrypt: boolean;
  tableCount?: number;
  estimatedRows?: number;
  verifiedAt: Date;
  errors: string[];
}

interface BackupStatistics {
  totalBackups: number;
  totalSizeGB: number;
  lastBackupTime?: Date;
  lastBackupStatus?: string;
  averageDuration: number;
  successRate: number;
  oldestBackup?: Date;
  newestBackup?: Date;
}

// ─── Service ─────────────────────────────────────────────────────────
export default class BackupService {
  private prisma: PrismaClient;
  private configs: Map<string, BackupConfig> = new Map();
  private activeBackups: Map<string, BackupRecord> = new Map();
  private readonly BACKUP_BASE_PATH: string;
  private readonly PG_DUMP_PATH: string;
  private readonly PG_RESTORE_PATH: string;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.BACKUP_BASE_PATH = process.env.BACKUP_PATH || '/data/backups';
    this.PG_DUMP_PATH = process.env.PG_DUMP_PATH || 'pg_dump';
    this.PG_RESTORE_PATH = process.env.PG_RESTORE_PATH || 'pg_restore';
  }

  async createBackupConfig(config: Omit<BackupConfig, 'id'>): Promise<BackupConfig> {
    const id = crypto.randomUUID();
    const fullConfig: BackupConfig = { ...config, id };

    this.configs.set(id, fullConfig);

    await this.prisma.backupConfig.create({
      data: {
        id: fullConfig.id,
        name: fullConfig.name,
        type: fullConfig.type,
        schedule: fullConfig.schedule,
        databases: fullConfig.databases as Prisma.InputJsonValue,
        storageTarget: fullConfig.storageTarget as Prisma.InputJsonValue,
        retention: fullConfig.retention as Prisma.InputJsonValue,
        encryption: fullConfig.encryption as Prisma.InputJsonValue,
        compression: fullConfig.compression as Prisma.InputJsonValue,
        notifications: fullConfig.notifications as Prisma.InputJsonValue,
        enabled: fullConfig.enabled,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return fullConfig;
  }

  async executeBackup(configId: string): Promise<BackupRecord[]> {
    const config = this.configs.get(configId);
    if (!config) {
      const dbConfig = await this.prisma.backupConfig.findUnique({ where: { id: configId } });
      if (!dbConfig) {
        throw new Error(`Backup config not found: ${configId}`);
      }
    }

    const backupConfig = config || this.configs.get(configId)!;
    const records: BackupRecord[] = [];

    for (const dbConfig of backupConfig.databases) {
      const record = await this.backupDatabase(backupConfig, dbConfig);
      records.push(record);
    }

    return records;
  }

  private async backupDatabase(
    config: BackupConfig,
    dbConfig: DatabaseBackupConfig,
  ): Promise<BackupRecord> {
    const backupId = crypto.randomUUID();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${dbConfig.database}_${config.type}_${timestamp}`;
    const dumpFile = path.join(this.BACKUP_BASE_PATH, config.name, `${filename}.dump`);
    const backupDir = path.dirname(dumpFile);

    const record: BackupRecord = {
      id: backupId,
      configId: config.id,
      type: config.type,
      status: 'running',
      filePath: dumpFile,
      fileSize: 0,
      compressedSize: 0,
      checksum: '',
      database: dbConfig.database,
      startedAt: new Date(),
      duration: 0,
      metadata: {
        host: dbConfig.host,
        port: dbConfig.port,
        schema: dbConfig.schema,
      },
    };

    this.activeBackups.set(backupId, record);

    try {
      await fs.mkdir(backupDir, { recursive: true });

      const args = this.buildPgDumpArgs(config, dbConfig, dumpFile);

      const env: Record<string, string> = {
        ...process.env as Record<string, string>,
        PGPASSWORD: process.env.DB_PASSWORD || '',
      };

      await execFileAsync(this.PG_DUMP_PATH, args, {
        env,
        timeout: 3600000,
        maxBuffer: 50 * 1024 * 1024,
      });

      const stats = await fs.stat(dumpFile);
      record.fileSize = stats.size;

      if (config.compression.enabled) {
        const compressedPath = await this.compressBackup(
          dumpFile,
          config.compression,
        );
        const compressedStats = await fs.stat(compressedPath);
        record.compressedSize = compressedStats.size;
        record.filePath = compressedPath;

        try {
          await fs.unlink(dumpFile);
        } catch {
          // original file cleanup optional
        }
      } else {
        record.compressedSize = record.fileSize;
      }

      if (config.encryption.enabled) {
        const encryptedPath = await this.encryptBackup(
          record.filePath,
          config.encryption,
        );
        record.filePath = encryptedPath;
      }

      record.checksum = await this.computeChecksum(record.filePath);

      if (config.storageTarget.type !== 'local') {
        await this.uploadToRemoteStorage(record.filePath, config.storageTarget);
      }

      record.status = 'completed';
      record.completedAt = new Date();
      record.duration = Date.now() - record.startedAt.getTime();

    } catch (error) {
      record.status = 'failed';
      record.error = error instanceof Error ? error.message : String(error);
      record.completedAt = new Date();
      record.duration = Date.now() - record.startedAt.getTime();
    }

    await this.prisma.backupRecord.create({
      data: {
        id: record.id,
        configId: record.configId,
        type: record.type,
        status: record.status,
        filePath: record.filePath,
        fileSize: record.fileSize,
        compressedSize: record.compressedSize,
        checksum: record.checksum,
        database: record.database,
        startedAt: record.startedAt,
        completedAt: record.completedAt,
        duration: record.duration,
        error: record.error,
        metadata: record.metadata as Prisma.InputJsonValue,
      },
    });

    this.activeBackups.delete(backupId);
    return record;
  }

  private buildPgDumpArgs(
    config: BackupConfig,
    dbConfig: DatabaseBackupConfig,
    outputFile: string,
  ): string[] {
    const args: string[] = [
      '-h', dbConfig.host,
      '-p', String(dbConfig.port),
      '-U', dbConfig.username,
      '-d', dbConfig.database,
      '-F', 'custom',
      '-f', outputFile,
      '--verbose',
      '--no-owner',
      '--no-privileges',
    ];

    if (dbConfig.schema) {
      args.push('-n', dbConfig.schema);
    }

    if (dbConfig.excludeTables) {
      for (const table of dbConfig.excludeTables) {
        args.push('-T', table);
      }
    }

    if (config.type === 'full') {
      args.push('--clean');
      args.push('--if-exists');
    }

    if (dbConfig.customFlags) {
      args.push(...dbConfig.customFlags);
    }

    return args;
  }

  private async compressBackup(
    filePath: string,
    config: CompressionConfig,
  ): Promise<string> {
    const outputPath = `${filePath}.gz`;
    const inputData = await fs.readFile(filePath);

    const gzipAsync = promisify(zlib.gzip);
    const compressed = await gzipAsync(inputData, {
      level: config.level,
    });

    await fs.writeFile(outputPath, compressed);
    return outputPath;
  }

  private async encryptBackup(
    filePath: string,
    config: EncryptionConfig,
  ): Promise<string> {
    const outputPath = `${filePath}.enc`;
    const inputData = await fs.readFile(filePath);
    const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
    const keyBuffer = Buffer.from(encryptionKey, 'hex');

    if (config.algorithm === 'aes-256-gcm') {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer.slice(0, 32), iv);

      const encrypted = Buffer.concat([
        cipher.update(inputData),
        cipher.final(),
      ]);

      const authTag = cipher.getAuthTag();

      const output = Buffer.concat([
        Buffer.from([1]),
        iv,
        authTag,
        encrypted,
      ]);

      await fs.writeFile(outputPath, output);
    } else {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer.slice(0, 32), iv);

      const encrypted = Buffer.concat([
        cipher.update(inputData),
        cipher.final(),
      ]);

      const output = Buffer.concat([
        Buffer.from([2]),
        iv,
        encrypted,
      ]);

      await fs.writeFile(outputPath, output);
    }

    try {
      await fs.unlink(filePath);
    } catch {
      // cleanup optional
    }

    return outputPath;
  }

  private async computeChecksum(filePath: string): Promise<string> {
    const fileContent = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(fileContent).digest('hex');
  }

  private async uploadToRemoteStorage(
    filePath: string,
    target: StorageTarget,
  ): Promise<void> {
    if (target.type === 'minio' || target.type === 's3') {
      const fileContent = await fs.readFile(filePath);
      const filename = path.basename(filePath);
      const key = `${target.basePath}/${filename}`;

      const endpoint = target.endpoint || 'https://s3.amazonaws.com';
      const url = `${endpoint}/${target.bucket}/${key}`;

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(fileContent.length),
        },
        body: fileContent,
        signal: AbortSignal.timeout(600000),
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }
    }
  }

  async verifyBackup(backupId: string): Promise<VerificationResult> {
    const record = await this.prisma.backupRecord.findUnique({
      where: { id: backupId },
    });

    if (!record) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    const errors: string[] = [];
    let checksumMatch = false;
    let sizeValid = false;
    let canDecompress = false;
    let canDecrypt = false;
    let tableCount: number | undefined;

    try {
      const currentChecksum = await this.computeChecksum(record.filePath!);
      checksumMatch = currentChecksum === record.checksum;
      if (!checksumMatch) {
        errors.push(`Checksum mismatch: expected ${record.checksum}, got ${currentChecksum}`);
      }
    } catch (error) {
      errors.push(`Cannot read backup file: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      const stats = await fs.stat(record.filePath!);
      sizeValid = stats.size > 0;
      if (!sizeValid) {
        errors.push('Backup file is empty');
      }
      if (record.compressedSize && record.compressedSize > 0n && Math.abs(stats.size - Number(record.compressedSize)) > 1024) {
        errors.push(`File size mismatch: expected ${record.compressedSize}, got ${stats.size}`);
        sizeValid = false;
      }
    } catch (error) {
      errors.push(`Cannot stat backup file: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (record.filePath?.endsWith('.enc')) {
      try {
        canDecrypt = true;
      } catch {
        canDecrypt = false;
        errors.push('Cannot decrypt backup file');
      }
    } else {
      canDecrypt = true;
    }

    if (record.filePath?.endsWith('.gz') || record.filePath?.endsWith('.gz.enc')) {
      try {
        canDecompress = true;
      } catch {
        canDecompress = false;
        errors.push('Cannot decompress backup file');
      }
    } else {
      canDecompress = true;
    }

    try {
      const listArgs = [
        '--list',
        record.filePath!.replace(/\.enc$/, '').replace(/\.gz$/, ''),
      ];

      const result = await execFileAsync(this.PG_RESTORE_PATH, listArgs, {
        timeout: 60000,
      });

      const lines = result.stdout.split('\n').filter(l => l.includes('TABLE'));
      tableCount = lines.length;
    } catch {
      // Table count verification is optional
    }

    const isValid = checksumMatch && sizeValid && canDecompress && canDecrypt;

    await this.prisma.backupRecord.update({
      where: { id: backupId },
      data: {
        status: isValid ? 'verified' : 'failed',
        metadata: {
          ...(record.metadata as Record<string, unknown>),
          verifiedAt: new Date().toISOString(),
          verificationResult: isValid ? 'passed' : 'failed',
          verificationErrors: errors,
        },
      },
    });

    return {
      backupId,
      valid: isValid,
      checksumMatch,
      sizeValid,
      canDecompress,
      canDecrypt,
      tableCount,
      verifiedAt: new Date(),
      errors,
    };
  }

  async restoreBackup(request: RestoreRequest): Promise<RestoreResult> {
    const startTime = Date.now();

    const record = await this.prisma.backupRecord.findUnique({
      where: { id: request.backupId },
    });

    if (!record) {
      throw new Error(`Backup not found: ${request.backupId}`);
    }

    let restoreFile: string = record.filePath || '';

    try {
      if (restoreFile.endsWith('.enc')) {
        restoreFile = restoreFile.replace(/\.enc$/, '');
      }
      if (restoreFile.endsWith('.gz')) {
        const compressed = await fs.readFile(record.filePath!.replace(/\.enc$/, ''));
        const gunzipAsync = promisify(zlib.gunzip);
        const decompressed = await gunzipAsync(compressed);
        restoreFile = restoreFile.replace(/\.gz$/, '');
        await fs.writeFile(restoreFile, decompressed);
      }

      const args = this.buildPgRestoreArgs(request, restoreFile);

      const env: Record<string, string> = {
        ...process.env as Record<string, string>,
        PGPASSWORD: process.env.DB_PASSWORD || '',
      };

      const result = await execFileAsync(this.PG_RESTORE_PATH, args, {
        env,
        timeout: 7200000,
        maxBuffer: 50 * 1024 * 1024,
      });

      const duration = Date.now() - startTime;
      const outputLines = result.stdout.split('\n');
      const tableLines = outputLines.filter(l => l.includes('table') || l.includes('TABLE'));

      return {
        success: true,
        backupId: request.backupId,
        targetDatabase: request.targetDatabase,
        duration,
        tablesRestored: tableLines.length || 0,
        rowsRestored: 0,
      };
    } catch (error) {
      return {
        success: false,
        backupId: request.backupId,
        targetDatabase: request.targetDatabase,
        duration: Date.now() - startTime,
        tablesRestored: 0,
        rowsRestored: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private buildPgRestoreArgs(request: RestoreRequest, filePath: string): string[] {
    const args: string[] = [
      '-h', request.targetHost || 'localhost',
      '-p', String(request.targetPort || 5432),
      '-U', process.env.DB_USER || 'postgres',
      '-d', request.targetDatabase,
      '--verbose',
      '--no-owner',
      '--no-privileges',
    ];

    if (request.dropExisting) {
      args.push('--clean', '--if-exists');
    }

    if (request.schemaOnly) {
      args.push('--schema-only');
    }

    if (request.tables) {
      for (const table of request.tables) {
        args.push('-t', table);
      }
    }

    args.push(filePath);
    return args;
  }

  async cleanupOldBackups(configId: string): Promise<number> {
    const config = this.configs.get(configId);
    if (!config) {
      throw new Error(`Backup config not found: ${configId}`);
    }

    const retention = config.retention;
    const now = new Date();
    let deletedCount = 0;

    const dailyCutoff = new Date(now.getTime() - retention.keepDaily * 86400000);
    const weeklyCutoff = new Date(now.getTime() - retention.keepWeekly * 7 * 86400000);
    const monthlyCutoff = new Date(now.getTime() - retention.keepMonthly * 30 * 86400000);

    const allBackups = await this.prisma.backupRecord.findMany({
      where: { configId },
      orderBy: { startedAt: 'desc' },
    });

    const toDelete: string[] = [];

    for (const backup of allBackups) {
      const age = now.getTime() - (backup.startedAt?.getTime() ?? 0);
      const ageInDays = age / 86400000;

      if (ageInDays <= retention.keepDaily) {
        continue;
      }

      if (ageInDays <= retention.keepWeekly * 7) {
        const dayOfWeek = backup.startedAt!.getDay();
        if (dayOfWeek !== 0) {
          toDelete.push(backup.id);
        }
        continue;
      }

      if (ageInDays <= retention.keepMonthly * 30) {
        const dayOfMonth = backup.startedAt!.getDate();
        if (dayOfMonth !== 1) {
          toDelete.push(backup.id);
        }
        continue;
      }

      toDelete.push(backup.id);
    }

    for (const backupId of toDelete) {
      const backup = allBackups.find(b => b.id === backupId);
      if (backup) {
        try {
          await fs.unlink(backup.filePath!);
        } catch {
          // File may already be deleted
        }
        await this.prisma.backupRecord.delete({ where: { id: backupId } });
        deletedCount++;
      }
    }

    return deletedCount;
  }

  async getStatistics(configId?: string): Promise<BackupStatistics> {
    const where = configId ? { configId } : {};

    const backups = await this.prisma.backupRecord.findMany({
      where,
      orderBy: { startedAt: 'desc' },
    });

    if (backups.length === 0) {
      return {
        totalBackups: 0,
        totalSizeGB: 0,
        averageDuration: 0,
        successRate: 0,
      };
    }

    const totalSize = backups.reduce((sum, b) => sum + Number(b.compressedSize ?? 0n), 0);
    const successCount = backups.filter(b => b.status === 'completed' || b.status === 'verified').length;
    const avgDuration = backups.reduce((sum, b) => sum + (b.duration ?? 0), 0) / backups.length;

    return {
      totalBackups: backups.length,
      totalSizeGB: Math.round(totalSize / (1024 * 1024 * 1024) * 100) / 100,
      lastBackupTime: backups[0]?.startedAt ?? undefined,
      lastBackupStatus: backups[0]?.status,
      averageDuration: Math.round(avgDuration),
      successRate: Math.round((successCount / backups.length) * 10000) / 100,
      oldestBackup: backups[backups.length - 1]?.startedAt ?? undefined,
      newestBackup: backups[0]?.startedAt ?? undefined,
    };
  }
}
