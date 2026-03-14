import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { randomUUID } from 'crypto';

export interface RuntimeEvidenceRecord {
  evidence_id: string;
  status: 'open' | 'closed';
  created_at: string;
  closed_at?: string;
  context: Record<string, unknown>;
  summary: Record<string, unknown>;
  attachments: Array<Record<string, unknown>>;
  closure: Record<string, unknown> | null;
}

export class RuntimeEvidenceServiceError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = 'RuntimeEvidenceServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function isWorkspaceRoot(candidate: string): boolean {
  return existsSync(join(candidate, 'schemas')) && existsSync(join(candidate, 'services'));
}

function resolveWorkspaceRoot(startDir = process.cwd()): string | null {
  const explicitRoot = process.env.RASED_WORKSPACE_ROOT;
  if (explicitRoot) {
    const resolvedExplicitRoot = resolve(explicitRoot);
    if (isWorkspaceRoot(resolvedExplicitRoot)) {
      return resolvedExplicitRoot;
    }
  }

  let current = resolve(startDir);
  while (true) {
    if (isWorkspaceRoot(current)) {
      return current;
    }

    const parent = resolve(current, '..');
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function resolveEvidenceStorageDir(startDir = process.cwd()): string {
  const explicitDir = process.env.RASED_RUNTIME_EVIDENCE_DIR;
  if (explicitDir) {
    return resolve(explicitDir);
  }

  const workspaceRoot = resolveWorkspaceRoot(startDir);
  if (workspaceRoot) {
    return join(workspaceRoot, '.governance-runtime', 'evidence');
  }

  return join(resolve(startDir), '.governance-runtime', 'evidence');
}

export class RuntimeEvidenceService {
  private readonly storageDir: string;

  constructor(rootDir?: string | null) {
    this.storageDir = rootDir
      ? join(resolve(rootDir), '.governance-runtime', 'evidence')
      : resolveEvidenceStorageDir();
    mkdirSync(this.storageDir, { recursive: true });
  }

  create(context: Record<string, unknown>, summary: Record<string, unknown>) {
    const evidenceId = `evidence_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const record: RuntimeEvidenceRecord = {
      evidence_id: evidenceId,
      status: 'open',
      created_at: new Date().toISOString(),
      context,
      summary,
      attachments: [],
      closure: null,
    };
    this.write(record);
    return record;
  }

  attach(evidenceId: string, attachment: Record<string, unknown>) {
    const record = this.read(evidenceId);
    if (record.status === 'closed') {
      throw new RuntimeEvidenceServiceError(
        `Evidence record is immutable after close: ${evidenceId}`,
        409,
        'EVIDENCE_IMMUTABLE',
      );
    }
    record.attachments.push({
      ...attachment,
      attached_at: new Date().toISOString(),
    });
    this.write(record);
    return record;
  }

  close(evidenceId: string, closure: Record<string, unknown>) {
    const record = this.read(evidenceId);
    if (record.status === 'closed') {
      throw new RuntimeEvidenceServiceError(
        `Evidence record is immutable after close: ${evidenceId}`,
        409,
        'EVIDENCE_IMMUTABLE',
      );
    }
    record.status = 'closed';
    record.closed_at = new Date().toISOString();
    record.closure = closure;
    this.write(record);
    return record;
  }

  read(evidenceId: string): RuntimeEvidenceRecord {
    const path = this.pathFor(evidenceId);
    if (!existsSync(path)) {
      throw new RuntimeEvidenceServiceError(
        `Evidence record not found: ${evidenceId}`,
        404,
        'EVIDENCE_NOT_FOUND',
      );
    }
    return JSON.parse(readFileSync(path, 'utf8')) as RuntimeEvidenceRecord;
  }

  private write(record: RuntimeEvidenceRecord) {
    writeFileSync(this.pathFor(record.evidence_id), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  }

  private pathFor(evidenceId: string) {
    return join(this.storageDir, `${evidenceId}.json`);
  }
}
