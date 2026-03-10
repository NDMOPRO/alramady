import { PrismaClient, Prisma } from '@prisma/client';
import * as crypto from 'crypto';

// ─── Interfaces ──────────────────────────────────────────────────────
interface TemplateVersion {
  id: string;
  templateId: string;
  version: number;
  label?: string;
  content: Record<string, unknown>;
  contentHash: string;
  changes: ChangeRecord[];
  createdBy: string;
  createdAt: Date;
  message: string;
  parentVersionId?: string;
  branchName: string;
  tags: string[];
  size: number;
}

interface ChangeRecord {
  path: string;
  type: 'add' | 'modify' | 'delete' | 'move' | 'rename';
  oldValue?: unknown;
  newValue?: unknown;
  description: string;
}

interface DiffResult {
  templateId: string;
  versionA: number;
  versionB: number;
  changes: ChangeRecord[];
  summary: DiffSummary;
}

interface DiffSummary {
  totalChanges: number;
  additions: number;
  modifications: number;
  deletions: number;
  moves: number;
  renames: number;
  affectedPaths: string[];
}

interface VersionHistory {
  templateId: string;
  versions: TemplateVersion[];
  branches: BranchInfo[];
  currentVersion: number;
  currentBranch: string;
  totalVersions: number;
}

interface BranchInfo {
  name: string;
  headVersion: number;
  baseVersion: number;
  createdAt: Date;
  createdBy: string;
  isDefault: boolean;
  aheadBy: number;
  behindBy: number;
}

interface RollbackResult {
  success: boolean;
  templateId: string;
  fromVersion: number;
  toVersion: number;
  changes: ChangeRecord[];
  rolledBackAt: Date;
}

interface MergeResult {
  success: boolean;
  templateId: string;
  sourceBranch: string;
  targetBranch: string;
  mergedVersion: number;
  conflicts: MergeConflict[];
  resolvedAutomatically: number;
}

interface MergeConflict {
  path: string;
  sourceValue: unknown;
  targetValue: unknown;
  baseValue: unknown;
  resolution?: 'source' | 'target' | 'manual';
  resolvedValue?: unknown;
}

// ─── Service ─────────────────────────────────────────────────────────
export default class VersionControlService {
  private prisma: PrismaClient;
  private versionCache: Map<string, TemplateVersion[]> = new Map();
  private branchHeads: Map<string, Map<string, number>> = new Map();
  private readonly DEFAULT_BRANCH = 'main';

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createVersion(
    templateId: string,
    content: Record<string, unknown>,
    createdBy: string,
    message: string,
    branchName?: string,
  ): Promise<TemplateVersion> {
    const branch = branchName || this.DEFAULT_BRANCH;
    const existingVersions = await this.getVersionHistory(templateId);
    const branchVersions = existingVersions.versions.filter(v => v.branchName === branch);
    const latestVersion = branchVersions.length > 0
      ? Math.max(...branchVersions.map(v => v.version))
      : 0;

    const newVersionNumber = latestVersion + 1;
    const contentString = JSON.stringify(content);
    const contentHash = crypto.createHash('sha256').update(contentString).digest('hex');

    const lastVersion = branchVersions.find(v => v.version === latestVersion);
    const changes = lastVersion
      ? this.computeChanges(lastVersion.content, content)
      : [{ path: '/', type: 'add' as const, newValue: 'Initial version', description: 'Template created' }];

    const version: TemplateVersion = {
      id: crypto.randomUUID(),
      templateId,
      version: newVersionNumber,
      content,
      contentHash,
      changes,
      createdBy,
      createdAt: new Date(),
      message,
      parentVersionId: lastVersion?.id,
      branchName: branch,
      tags: [],
      size: contentString.length,
    };

    await this.prisma.templateVersion.create({
      data: {
        id: version.id,
        templateId: version.templateId,
        version: version.version,
        content: version.content as Prisma.InputJsonValue,
        contentHash: version.contentHash,
        changes: version.changes as unknown as Prisma.InputJsonValue[],
        createdBy: version.createdBy,
        createdAt: version.createdAt,
        message: version.message,
        parentVersionId: version.parentVersionId,
        branchName: version.branchName,
        tags: version.tags,
        size: version.size,
      },
    });

    const cached = this.versionCache.get(templateId) || [];
    cached.push(version);
    this.versionCache.set(templateId, cached);

    this.updateBranchHead(templateId, branch, newVersionNumber);

    return version;
  }

  private computeChanges(
    oldContent: Record<string, unknown>,
    newContent: Record<string, unknown>,
    basePath: string = '',
  ): ChangeRecord[] {
    const changes: ChangeRecord[] = [];

    const allKeys = new Set([...Object.keys(oldContent), ...Object.keys(newContent)]);

    for (const key of allKeys) {
      const path = basePath ? `${basePath}.${key}` : key;
      const oldVal = oldContent[key];
      const newVal = newContent[key];

      if (oldVal === undefined && newVal !== undefined) {
        changes.push({
          path,
          type: 'add',
          newValue: this.summarizeValue(newVal),
          description: `Added ${path}`,
        });
      } else if (oldVal !== undefined && newVal === undefined) {
        changes.push({
          path,
          type: 'delete',
          oldValue: this.summarizeValue(oldVal),
          description: `Removed ${path}`,
        });
      } else if (typeof oldVal === 'object' && typeof newVal === 'object' &&
                 oldVal !== null && newVal !== null &&
                 !Array.isArray(oldVal) && !Array.isArray(newVal)) {
        const nestedChanges = this.computeChanges(
          oldVal as Record<string, unknown>,
          newVal as Record<string, unknown>,
          path,
        );
        changes.push(...nestedChanges);
      } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({
          path,
          type: 'modify',
          oldValue: this.summarizeValue(oldVal),
          newValue: this.summarizeValue(newVal),
          description: `Modified ${path}`,
        });
      }
    }

    return changes;
  }

  private summarizeValue(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    const str = JSON.stringify(value);
    if (str.length > 200) {
      return str.substring(0, 200) + '...';
    }
    return value;
  }

  private updateBranchHead(templateId: string, branch: string, version: number): void {
    if (!this.branchHeads.has(templateId)) {
      this.branchHeads.set(templateId, new Map());
    }
    this.branchHeads.get(templateId)!.set(branch, version);
  }

  async getVersion(templateId: string, version: number, branch?: string): Promise<TemplateVersion | null> {
    const cached = this.versionCache.get(templateId);
    if (cached) {
      const found = cached.find(v =>
        v.version === version && (branch ? v.branchName === branch : true),
      );
      if (found) return found;
    }

    const record = await this.prisma.templateVersion.findFirst({
      where: {
        templateId,
        version,
        ...(branch ? { branchName: branch } : {}),
      },
    });

    if (!record) return null;

    return {
      id: record.id,
      templateId: record.templateId,
      version: record.version,
      content: record.content as Record<string, unknown>,
      contentHash: record.contentHash,
      changes: record.changes as unknown as ChangeRecord[],
      createdBy: record.createdBy,
      createdAt: record.createdAt,
      message: record.message,
      parentVersionId: record.parentVersionId || undefined,
      branchName: record.branchName,
      tags: record.tags as string[],
      size: record.size,
    };
  }

  async getVersionHistory(templateId: string): Promise<VersionHistory> {
    const records = await this.prisma.templateVersion.findMany({
      where: { templateId },
      orderBy: { version: 'desc' },
    });

    const versions: TemplateVersion[] = records.map(r => ({
      id: r.id,
      templateId: r.templateId,
      version: r.version,
      content: r.content as Record<string, unknown>,
      contentHash: r.contentHash,
      changes: r.changes as unknown as ChangeRecord[],
      createdBy: r.createdBy,
      createdAt: r.createdAt,
      message: r.message,
      parentVersionId: r.parentVersionId || undefined,
      branchName: r.branchName,
      tags: r.tags as string[],
      size: r.size,
    }));

    this.versionCache.set(templateId, versions);

    const branchMap = new Map<string, TemplateVersion[]>();
    for (const v of versions) {
      if (!branchMap.has(v.branchName)) {
        branchMap.set(v.branchName, []);
      }
      branchMap.get(v.branchName)!.push(v);
    }

    const mainVersions = branchMap.get(this.DEFAULT_BRANCH) || [];
    const mainHead = mainVersions.length > 0 ? Math.max(...mainVersions.map(v => v.version)) : 0;

    const branches: BranchInfo[] = Array.from(branchMap.entries()).map(([name, branchVersions]) => {
      const headVersion = Math.max(...branchVersions.map(v => v.version));
      const baseVersion = Math.min(...branchVersions.map(v => v.version));
      const oldest = branchVersions.reduce((min, v) => v.createdAt < min.createdAt ? v : min, branchVersions[0]);

      const aheadBy = branchVersions.filter(v => v.version > mainHead).length;
      const behindBy = mainHead > headVersion ? mainHead - headVersion : 0;

      return {
        name,
        headVersion,
        baseVersion,
        createdAt: oldest.createdAt,
        createdBy: oldest.createdBy,
        isDefault: name === this.DEFAULT_BRANCH,
        aheadBy: name === this.DEFAULT_BRANCH ? 0 : aheadBy,
        behindBy: name === this.DEFAULT_BRANCH ? 0 : behindBy,
      };
    });

    const currentBranch = this.DEFAULT_BRANCH;
    const currentVersion = mainHead;

    return {
      templateId,
      versions,
      branches,
      currentVersion,
      currentBranch,
      totalVersions: versions.length,
    };
  }

  async diffVersions(
    templateId: string,
    versionA: number,
    versionB: number,
    branch?: string,
  ): Promise<DiffResult> {
    const [verA, verB] = await Promise.all([
      this.getVersion(templateId, versionA, branch),
      this.getVersion(templateId, versionB, branch),
    ]);

    if (!verA || !verB) {
      throw new Error(`Version not found: ${!verA ? versionA : versionB}`);
    }

    const changes = this.computeChanges(verA.content, verB.content);

    const summary: DiffSummary = {
      totalChanges: changes.length,
      additions: changes.filter(c => c.type === 'add').length,
      modifications: changes.filter(c => c.type === 'modify').length,
      deletions: changes.filter(c => c.type === 'delete').length,
      moves: changes.filter(c => c.type === 'move').length,
      renames: changes.filter(c => c.type === 'rename').length,
      affectedPaths: changes.map(c => c.path),
    };

    return { templateId, versionA, versionB, changes, summary };
  }

  async rollback(
    templateId: string,
    targetVersion: number,
    createdBy: string,
  ): Promise<RollbackResult> {
    const history = await this.getVersionHistory(templateId);
    const currentHead = history.currentVersion;

    const targetVer = await this.getVersion(templateId, targetVersion, this.DEFAULT_BRANCH);
    if (!targetVer) {
      throw new Error(`Target version ${targetVersion} not found`);
    }

    const currentVer = await this.getVersion(templateId, currentHead, this.DEFAULT_BRANCH);
    const changes = currentVer
      ? this.computeChanges(currentVer.content, targetVer.content)
      : [];

    await this.createVersion(
      templateId,
      targetVer.content,
      createdBy,
      `Rollback to version ${targetVersion}`,
      this.DEFAULT_BRANCH,
    );

    return {
      success: true,
      templateId,
      fromVersion: currentHead,
      toVersion: targetVersion,
      changes,
      rolledBackAt: new Date(),
    };
  }

  async createBranch(
    templateId: string,
    branchName: string,
    createdBy: string,
    baseVersion?: number,
  ): Promise<BranchInfo> {
    const history = await this.getVersionHistory(templateId);
    const base = baseVersion || history.currentVersion;

    const sourceVersion = await this.getVersion(templateId, base, this.DEFAULT_BRANCH);
    if (!sourceVersion) {
      throw new Error(`Base version ${base} not found`);
    }

    const existingBranch = history.branches.find(b => b.name === branchName);
    if (existingBranch) {
      throw new Error(`Branch "${branchName}" already exists`);
    }

    await this.createVersion(
      templateId,
      sourceVersion.content,
      createdBy,
      `Branch "${branchName}" created from version ${base}`,
      branchName,
    );

    return {
      name: branchName,
      headVersion: 1,
      baseVersion: base,
      createdAt: new Date(),
      createdBy,
      isDefault: false,
      aheadBy: 0,
      behindBy: 0,
    };
  }

  async mergeBranch(
    templateId: string,
    sourceBranch: string,
    targetBranch: string,
    createdBy: string,
    conflictResolutions?: Map<string, 'source' | 'target'>,
  ): Promise<MergeResult> {
    const history = await this.getVersionHistory(templateId);

    const sourceVersions = history.versions.filter(v => v.branchName === sourceBranch);
    const targetVersions = history.versions.filter(v => v.branchName === targetBranch);

    if (sourceVersions.length === 0) {
      throw new Error(`Source branch "${sourceBranch}" not found`);
    }
    if (targetVersions.length === 0) {
      throw new Error(`Target branch "${targetBranch}" not found`);
    }

    const sourceHead = sourceVersions.reduce((max, v) => v.version > max.version ? v : max, sourceVersions[0]);
    const targetHead = targetVersions.reduce((max, v) => v.version > max.version ? v : max, targetVersions[0]);

    const conflicts: MergeConflict[] = [];
    const mergedContent = { ...targetHead.content };

    const sourceChanges = this.computeChanges(targetHead.content, sourceHead.content);

    let resolvedAutomatically = 0;

    for (const change of sourceChanges) {
      const targetValue = this.getNestedValue(targetHead.content, change.path);
      const sourceValue = change.newValue;

      if (change.type === 'add') {
        this.setNestedValue(mergedContent, change.path, sourceValue);
        resolvedAutomatically++;
      } else if (change.type === 'delete') {
        this.deleteNestedValue(mergedContent, change.path);
        resolvedAutomatically++;
      } else if (change.type === 'modify') {
        const resolution = conflictResolutions?.get(change.path);
        if (resolution === 'source') {
          this.setNestedValue(mergedContent, change.path, sourceValue);
          resolvedAutomatically++;
        } else if (resolution === 'target') {
          resolvedAutomatically++;
        } else {
          conflicts.push({
            path: change.path,
            sourceValue,
            targetValue,
            baseValue: change.oldValue,
            resolution: 'target',
            resolvedValue: targetValue,
          });
          resolvedAutomatically++;
        }
      }
    }

    const mergedVersion = await this.createVersion(
      templateId,
      mergedContent,
      createdBy,
      `Merge branch "${sourceBranch}" into "${targetBranch}"`,
      targetBranch,
    );

    return {
      success: true,
      templateId,
      sourceBranch,
      targetBranch,
      mergedVersion: mergedVersion.version,
      conflicts,
      resolvedAutomatically,
    };
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.').filter(p => p.length > 0);
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  private setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.').filter(p => p.length > 0);
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
        current[parts[i]] = {};
      }
      current = current[parts[i]] as Record<string, unknown>;
    }
    if (parts.length > 0) {
      current[parts[parts.length - 1]] = value;
    }
  }

  private deleteNestedValue(obj: Record<string, unknown>, path: string): void {
    const parts = path.split('.').filter(p => p.length > 0);
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]] || typeof current[parts[i]] !== 'object') return;
      current = current[parts[i]] as Record<string, unknown>;
    }
    if (parts.length > 0) {
      delete current[parts[parts.length - 1]];
    }
  }

  async tagVersion(
    templateId: string,
    version: number,
    tag: string,
    branch?: string,
  ): Promise<void> {
    const ver = await this.getVersion(templateId, version, branch);
    if (!ver) {
      throw new Error(`Version ${version} not found`);
    }

    const updatedTags = [...ver.tags, tag];

    await this.prisma.templateVersion.update({
      where: { id: ver.id },
      data: { tags: updatedTags },
    });

    ver.tags = updatedTags;
  }

  async getVersionByTag(templateId: string, tag: string): Promise<TemplateVersion | null> {
    const record = await this.prisma.templateVersion.findFirst({
      where: { templateId, tags: { has: tag } },
    });

    if (!record) return null;

    return {
      id: record.id,
      templateId: record.templateId,
      version: record.version,
      content: record.content as Record<string, unknown>,
      contentHash: record.contentHash,
      changes: record.changes as unknown as ChangeRecord[],
      createdBy: record.createdBy,
      createdAt: record.createdAt,
      message: record.message,
      parentVersionId: record.parentVersionId || undefined,
      branchName: record.branchName,
      tags: record.tags as string[],
      size: record.size,
    };
  }
}
