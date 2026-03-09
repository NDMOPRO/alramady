import { logger } from '../../utils/logger.js';
import * as crypto from 'crypto';

interface VersionRecord {
  versionId: string;
  componentId: string;
  state: unknown;
  timestamp: number;
  author?: string;
  message?: string;
  hash: string;
  parentVersionId: string | null;
  size: number;
}

interface VersionDiff {
  added: string[];
  removed: string[];
  modified: { path: string; oldValue: unknown; newValue: unknown }[];
  unchanged: string[];
}

interface VersionListEntry {
  versionId: string;
  timestamp: number;
  message?: string;
  author?: string;
  hash: string;
}

export class ComponentVersioning {
  private versions: Map<string, VersionRecord[]> = new Map();

  createVersion(componentId: string, state: unknown, options?: { author?: string; message?: string }): VersionRecord {
    const serialized = JSON.stringify(state);
    const hash = crypto.createHash('sha256').update(serialized).digest('hex').substring(0, 12);

    const history = this.versions.get(componentId) ?? [];
    const parentVersionId = history.length > 0 ? history[history.length - 1].versionId : null;

    // Skip if state is identical to latest version
    if (history.length > 0 && history[history.length - 1].hash === hash) {
      logger.debug('ComponentVersioning: state unchanged, skipping version', { componentId });
      return history[history.length - 1];
    }

    const versionId = `v_${Date.now()}_${hash.substring(0, 6)}`;
    const record: VersionRecord = {
      versionId,
      componentId,
      state: JSON.parse(serialized), // deep clone
      timestamp: Date.now(),
      author: options?.author,
      message: options?.message,
      hash,
      parentVersionId,
      size: serialized.length,
    };

    history.push(record);
    this.versions.set(componentId, history);

    logger.info('ComponentVersioning version created', {
      componentId,
      versionId,
      versionNumber: history.length,
      size: record.size,
    });

    return record;
  }

  getHistory(componentId: string): VersionListEntry[] {
    const history = this.versions.get(componentId);
    if (!history || history.length === 0) {
      logger.debug('ComponentVersioning: no history found', { componentId });
      return [];
    }

    return history.map(v => ({
      versionId: v.versionId,
      timestamp: v.timestamp,
      message: v.message,
      author: v.author,
      hash: v.hash,
    }));
  }

  restoreVersion(componentId: string, versionId: string): unknown {
    const history = this.versions.get(componentId);
    if (!history) {
      throw new Error(`No version history for component "${componentId}"`);
    }

    const version = history.find(v => v.versionId === versionId);
    if (!version) {
      throw new Error(`Version "${versionId}" not found for component "${componentId}"`);
    }

    // Deep clone the stored state so mutations don't affect the version store
    const restoredState = JSON.parse(JSON.stringify(version.state));

    // Create a new version recording the restore action
    this.createVersion(componentId, restoredState, {
      message: `Restored from version ${versionId}`,
    });

    logger.info('ComponentVersioning version restored', { componentId, versionId });
    return restoredState;
  }

  compareVersions(componentId: string, versionId1: string, versionId2: string): VersionDiff {
    const history = this.versions.get(componentId);
    if (!history) {
      throw new Error(`No version history for component "${componentId}"`);
    }

    const v1 = history.find(v => v.versionId === versionId1);
    const v2 = history.find(v => v.versionId === versionId2);
    if (!v1) throw new Error(`Version "${versionId1}" not found`);
    if (!v2) throw new Error(`Version "${versionId2}" not found`);

    const diff = this.deepDiff(v1.state, v2.state);

    logger.debug('ComponentVersioning versions compared', {
      componentId,
      v1: versionId1,
      v2: versionId2,
      added: diff.added.length,
      removed: diff.removed.length,
      modified: diff.modified.length,
    });

    return diff;
  }

  getVersion(componentId: string, versionId: string): VersionRecord | null {
    const history = this.versions.get(componentId);
    if (!history) return null;
    return history.find(v => v.versionId === versionId) ?? null;
  }

  getLatestVersion(componentId: string): VersionRecord | null {
    const history = this.versions.get(componentId);
    if (!history || history.length === 0) return null;
    return history[history.length - 1];
  }

  pruneHistory(componentId: string, keepCount: number): number {
    const history = this.versions.get(componentId);
    if (!history || history.length <= keepCount) return 0;

    const pruneCount = history.length - keepCount;
    history.splice(0, pruneCount);

    logger.info('ComponentVersioning history pruned', { componentId, prunedCount: pruneCount, remaining: keepCount });
    return pruneCount;
  }

  private deepDiff(obj1: unknown, obj2: unknown, prefix: string = ''): VersionDiff {
    const diff: VersionDiff = { added: [], removed: [], modified: [], unchanged: [] };

    if (obj1 === obj2) {
      if (prefix) diff.unchanged.push(prefix);
      return diff;
    }

    if (typeof obj1 !== 'object' || typeof obj2 !== 'object' || obj1 === null || obj2 === null) {
      if (prefix) {
        diff.modified.push({ path: prefix, oldValue: obj1, newValue: obj2 });
      }
      return diff;
    }

    const o1 = obj1 as Record<string, unknown>;
    const o2 = obj2 as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(o1), ...Object.keys(o2)]);

    for (const key of allKeys) {
      const path = prefix ? `${prefix}.${key}` : key;

      if (!(key in o1)) {
        diff.added.push(path);
      } else if (!(key in o2)) {
        diff.removed.push(path);
      } else if (typeof o1[key] === 'object' && typeof o2[key] === 'object' && o1[key] !== null && o2[key] !== null) {
        const childDiff = this.deepDiff(o1[key], o2[key], path);
        diff.added.push(...childDiff.added);
        diff.removed.push(...childDiff.removed);
        diff.modified.push(...childDiff.modified);
        diff.unchanged.push(...childDiff.unchanged);
      } else if (o1[key] !== o2[key]) {
        diff.modified.push({ path, oldValue: o1[key], newValue: o2[key] });
      } else {
        diff.unchanged.push(path);
      }
    }

    return diff;
  }
}
