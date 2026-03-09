import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import * as mathjs from 'mathjs';
import * as crypto from 'crypto';
import { z } from 'zod';
import { logger } from '../utils/logger';

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const KpiDirectionSchema = z.enum(['higher_better', 'lower_better']);
const KpiFrequencySchema = z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual']);
const KpiStatusSchema = z.enum(['draft', 'active', 'deprecated']);
const KpiSensitivitySchema = z.enum(['public', 'internal', 'confidential', 'restricted']);
const KpiCategorySchema = z.string().min(1).max(200);

const FormulaVariableSchema = z.object({
  name: z.string().min(1).max(100),
  datasetId: z.string().uuid(),
  column: z.string().min(1).max(200),
  aggregation: z.enum(['sum', 'avg', 'count', 'min', 'max', 'count_distinct', 'latest']),
  filter: z.string().max(500).optional(),
});

const CreateKpiSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(500),
  nameAr: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  formula: z.string().min(1).max(2000),
  variables: z.array(FormulaVariableSchema),
  ownerId: z.string().uuid(),
  category: KpiCategorySchema,
  unit: z.string().max(100).optional(),
  direction: KpiDirectionSchema,
  frequency: KpiFrequencySchema,
  target: z.number().optional(),
  warningThreshold: z.number().optional(),
  criticalThreshold: z.number().optional(),
  sensitivityLevel: KpiSensitivitySchema.default('internal'),
  tags: z.array(z.string().max(100)).default([]),
  parentKpiId: z.string().uuid().optional(),
  stakeholderIds: z.array(z.string().uuid()).default([]),
});

const UpdateKpiSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  nameAr: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional(),
  formula: z.string().min(1).max(2000).optional(),
  variables: z.array(FormulaVariableSchema).optional(),
  category: KpiCategorySchema.optional(),
  unit: z.string().max(100).optional(),
  direction: KpiDirectionSchema.optional(),
  frequency: KpiFrequencySchema.optional(),
  target: z.number().optional(),
  warningThreshold: z.number().optional(),
  criticalThreshold: z.number().optional(),
  sensitivityLevel: KpiSensitivitySchema.optional(),
  tags: z.array(z.string().max(100)).optional(),
  parentKpiId: z.string().uuid().nullable().optional(),
  stakeholderIds: z.array(z.string().uuid()).optional(),
  changeReason: z.string().min(1).max(1000),
  requestedBy: z.string().uuid(),
});

const CalculateKpiSchema = z.object({
  kpiId: z.string().uuid(),
  asOf: z.string().datetime().optional(),
  forceRefresh: z.boolean().default(false),
});

const ApprovalActionSchema = z.object({
  changeRequestId: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
  reviewedBy: z.string().uuid(),
  comment: z.string().max(1000).optional(),
});

const TransferOwnershipSchema = z.object({
  kpiId: z.string().uuid(),
  newOwnerId: z.string().uuid(),
  requestedBy: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

const RollbackVersionSchema = z.object({
  kpiId: z.string().uuid(),
  targetVersion: z.number().int().positive(),
  requestedBy: z.string().uuid(),
  reason: z.string().max(1000).min(1),
});

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface KpiDefinition {
  id: string;
  tenantId: string;
  name: string;
  nameAr: string;
  description: string | null;
  formula: string;
  variables: FormulaVariable[];
  ownerId: string;
  category: string;
  unit: string | null;
  direction: 'higher_better' | 'lower_better';
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
  target: number | null;
  warningThreshold: number | null;
  criticalThreshold: number | null;
  sensitivityLevel: 'public' | 'internal' | 'confidential' | 'restricted';
  tags: string[];
  status: 'draft' | 'active' | 'deprecated';
  parentKpiId: string | null;
  stakeholderIds: string[];
  currentVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FormulaVariable {
  name: string;
  datasetId: string;
  column: string;
  aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'count_distinct' | 'latest';
  filter?: string;
}

export interface KpiCalculationResult {
  kpiId: string;
  value: number;
  asOf: Date;
  status: 'normal' | 'warning' | 'critical';
  variableValues: Record<string, number>;
  cachedAt: Date;
  dataFreshness: 'live' | 'cached';
}

export interface KpiVersionRecord {
  id: string;
  kpiId: string;
  version: number;
  snapshot: KpiDefinition;
  changedBy: string;
  changeReason: string;
  changedAt: Date;
  diff: KpiFieldDiff[];
}

export interface KpiFieldDiff {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface KpiChangeRequest {
  id: string;
  kpiId: string;
  requestedBy: string;
  requestedAt: Date;
  proposedChanges: Partial<KpiDefinition>;
  changeReason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewComment: string | null;
}

export interface KpiImpactPreview {
  kpiId: string;
  affectedDashboards: AffectedAsset[];
  affectedReports: AffectedAsset[];
  affectedChildKpis: AffectedAsset[];
  projectedValueChange: ProjectedChange | null;
  estimatedImpactLevel: 'high' | 'medium' | 'low';
}

export interface AffectedAsset {
  id: string;
  name: string;
  type: 'dashboard' | 'report' | 'kpi';
  referenceContext: string;
}

export interface ProjectedChange {
  currentValue: number;
  projectedValue: number;
  absoluteChange: number;
  percentageChange: number;
}

export interface KpiHierarchy {
  root: KpiNodeWithChildren;
  totalNodes: number;
  maxDepth: number;
}

export interface KpiNodeWithChildren {
  id: string;
  name: string;
  nameAr: string;
  status: 'draft' | 'active' | 'deprecated';
  currentValue: number | null;
  children: KpiNodeWithChildren[];
}

// ─── KPI Table DDL (stored as JSON in kpi_registry namespace via Metadata) ──

const KPI_TABLE = 'kpi_definitions';
const KPI_VERSION_TABLE = 'kpi_version_history';
const KPI_CHANGE_REQUEST_TABLE = 'kpi_change_requests';
const KPI_STAKEHOLDER_TABLE = 'kpi_stakeholders';
const REDIS_TTL_SECONDS = 300;

// ─── Service ─────────────────────────────────────────────────────────────────

export class KpiRegistryService {
  private readonly math: typeof mathjs;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {
    this.math = mathjs;
    this.ensureTablesExist().catch(err =>
      logger.error('KpiRegistryService: Failed to ensure tables', { error: err.message }),
    );
  }

  // ─── Table bootstrapping (idempotent) ──────────────────────────────────────

  private async ensureTablesExist(): Promise<void> {
    await this.prisma.$queryRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ${KPI_TABLE} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        name VARCHAR(500) NOT NULL,
        name_ar VARCHAR(500) NOT NULL,
        description TEXT,
        formula TEXT NOT NULL,
        variables JSONB NOT NULL DEFAULT '[]',
        owner_id UUID NOT NULL,
        category VARCHAR(200) NOT NULL,
        unit VARCHAR(100),
        direction VARCHAR(50) NOT NULL DEFAULT 'higher_better',
        frequency VARCHAR(50) NOT NULL DEFAULT 'monthly',
        target NUMERIC,
        warning_threshold NUMERIC,
        critical_threshold NUMERIC,
        sensitivity_level VARCHAR(50) NOT NULL DEFAULT 'internal',
        tags JSONB NOT NULL DEFAULT '[]',
        status VARCHAR(50) NOT NULL DEFAULT 'draft',
        parent_kpi_id UUID,
        current_version INT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.prisma.$queryRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ${KPI_VERSION_TABLE} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        kpi_id UUID NOT NULL,
        version INT NOT NULL,
        snapshot JSONB NOT NULL,
        changed_by UUID NOT NULL,
        change_reason TEXT NOT NULL,
        diff JSONB NOT NULL DEFAULT '[]',
        changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(kpi_id, version)
      )
    `);

    await this.prisma.$queryRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ${KPI_CHANGE_REQUEST_TABLE} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        kpi_id UUID NOT NULL,
        requested_by UUID NOT NULL,
        requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        proposed_changes JSONB NOT NULL,
        change_reason TEXT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        reviewed_by UUID,
        reviewed_at TIMESTAMPTZ,
        review_comment TEXT
      )
    `);

    await this.prisma.$queryRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ${KPI_STAKEHOLDER_TABLE} (
        kpi_id UUID NOT NULL,
        user_id UUID NOT NULL,
        PRIMARY KEY (kpi_id, user_id)
      )
    `);
  }

  // ─── 1. KPI CRUD ───────────────────────────────────────────────────────────

  async createKpi(input: z.infer<typeof CreateKpiSchema>): Promise<KpiDefinition> {
    const validated = CreateKpiSchema.parse(input);

    this.validateFormula(validated.formula, validated.variables.map(v => v.name));

    if (validated.parentKpiId) {
      await this.assertKpiExists(validated.parentKpiId, validated.tenantId);
    }

    const id = crypto.randomUUID();
    const now = new Date();

    await this.prisma.$queryRawUnsafe(
      `INSERT INTO ${KPI_TABLE}
        (id, tenant_id, name, name_ar, description, formula, variables, owner_id,
         category, unit, direction, frequency, target, warning_threshold,
         critical_threshold, sensitivity_level, tags, status, parent_kpi_id,
         current_version, created_at, updated_at)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,
         'draft',$18,1,$19,$20)`,
      id,
      validated.tenantId,
      validated.name,
      validated.nameAr,
      validated.description ?? null,
      validated.formula,
      JSON.stringify(validated.variables),
      validated.ownerId,
      validated.category,
      validated.unit ?? null,
      validated.direction,
      validated.frequency,
      validated.target ?? null,
      validated.warningThreshold ?? null,
      validated.criticalThreshold ?? null,
      validated.sensitivityLevel,
      JSON.stringify(validated.tags),
      validated.parentKpiId ?? null,
      now,
      now,
    );

    if (validated.stakeholderIds.length > 0) {
      await this.upsertStakeholders(id, validated.stakeholderIds);
    }

    const kpi = await this.getKpiById(id, validated.tenantId);

    await this.saveVersionSnapshot(kpi, validated.ownerId, 'Initial definition created', 1, []);

    await this.invalidateKpiCache(id, validated.tenantId);

    logger.info('KPI created', { kpiId: id, name: validated.name, tenantId: validated.tenantId });

    return kpi;
  }

  async getKpiById(kpiId: string, tenantId: string): Promise<KpiDefinition> {
    const cacheKey = `kpi:def:${tenantId}:${kpiId}`;
    const cached = await this.cacheGet<KpiDefinition>(cacheKey);
    if (cached) return cached;

    const rows: KpiRawRow[] = await this.prisma.$queryRawUnsafe(
      `SELECT k.*, COALESCE(
          (SELECT json_agg(user_id) FROM ${KPI_STAKEHOLDER_TABLE} WHERE kpi_id = k.id),
          '[]'::json
        ) AS stakeholder_ids
       FROM ${KPI_TABLE} k
       WHERE k.id = $1 AND k.tenant_id = $2`,
      kpiId,
      tenantId,
    );

    if (rows.length === 0) {
      throw new Error(`KPI not found: ${kpiId}`);
    }

    const kpi = this.mapRowToKpi(rows[0]);
    await this.cacheSet(cacheKey, kpi, REDIS_TTL_SECONDS);
    return kpi;
  }

  async listKpis(
    tenantId: string,
    options: {
      status?: 'draft' | 'active' | 'deprecated';
      category?: string;
      ownerId?: string;
      tags?: string[];
      search?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ items: KpiDefinition[]; total: number }> {
    const limit = Math.min(options.limit ?? 50, 200);
    const offset = options.offset ?? 0;

    const conditions: string[] = ['k.tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let paramIdx = 2;

    if (options.status) {
      conditions.push(`k.status = $${paramIdx++}`);
      params.push(options.status);
    }
    if (options.category) {
      conditions.push(`k.category = $${paramIdx++}`);
      params.push(options.category);
    }
    if (options.ownerId) {
      conditions.push(`k.owner_id = $${paramIdx++}`);
      params.push(options.ownerId);
    }
    if (options.tags && options.tags.length > 0) {
      conditions.push(`k.tags ?| $${paramIdx++}::text[]`);
      params.push(options.tags);
    }
    if (options.search) {
      conditions.push(
        `(k.name ILIKE $${paramIdx} OR k.name_ar ILIKE $${paramIdx} OR k.description ILIKE $${paramIdx})`,
      );
      params.push(`%${options.search}%`);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    const countRows: { count: string }[] = await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as count FROM ${KPI_TABLE} k WHERE ${whereClause}`,
      ...params,
    );

    const total = parseInt(countRows[0]?.count ?? '0', 10);

    const rows: KpiRawRow[] = await this.prisma.$queryRawUnsafe(
      `SELECT k.*, COALESCE(
          (SELECT json_agg(user_id) FROM ${KPI_STAKEHOLDER_TABLE} WHERE kpi_id = k.id),
          '[]'::json
        ) AS stakeholder_ids
       FROM ${KPI_TABLE} k
       WHERE ${whereClause}
       ORDER BY k.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      ...params,
      limit,
      offset,
    );

    return {
      items: rows.map(r => this.mapRowToKpi(r)),
      total,
    };
  }

  async updateKpi(
    kpiId: string,
    tenantId: string,
    input: z.infer<typeof UpdateKpiSchema>,
  ): Promise<KpiDefinition> {
    const validated = UpdateKpiSchema.parse(input);
    const existing = await this.getKpiById(kpiId, tenantId);

    if (existing.status === 'active') {
      return this.submitChangeRequest(kpiId, tenantId, validated);
    }

    if (existing.status === 'deprecated') {
      throw new Error(`Cannot update a deprecated KPI. Create a new KPI instead.`);
    }

    if (validated.formula && validated.variables) {
      this.validateFormula(validated.formula, validated.variables.map(v => v.name));
    } else if (validated.formula && !validated.variables) {
      this.validateFormula(validated.formula, existing.variables.map(v => v.name));
    }

    if (validated.parentKpiId !== undefined && validated.parentKpiId !== null) {
      await this.assertKpiExists(validated.parentKpiId, tenantId);
      await this.assertNoCircularHierarchy(kpiId, validated.parentKpiId, tenantId);
    }

    const diff = this.computeDiff(existing, validated);
    const newVersion = existing.currentVersion + 1;
    const now = new Date();

    const setClauses: string[] = ['updated_at = $2', 'current_version = $3'];
    const setParams: unknown[] = [kpiId, now, newVersion];
    let paramIdx = 4;

    const fieldMap: Record<string, string> = {
      name: 'name',
      nameAr: 'name_ar',
      description: 'description',
      formula: 'formula',
      category: 'category',
      unit: 'unit',
      direction: 'direction',
      frequency: 'frequency',
      target: 'target',
      warningThreshold: 'warning_threshold',
      criticalThreshold: 'critical_threshold',
      sensitivityLevel: 'sensitivity_level',
      parentKpiId: 'parent_kpi_id',
    };

    const jsonbFields = new Set(['variables', 'tags']);

    for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
      const val = (validated as Record<string, unknown>)[jsKey];
      if (val !== undefined) {
        setClauses.push(`${dbCol} = $${paramIdx++}`);
        setParams.push(val);
      }
    }

    if (validated.variables !== undefined) {
      setClauses.push(`variables = $${paramIdx++}::jsonb`);
      setParams.push(JSON.stringify(validated.variables));
    }

    if (validated.tags !== undefined) {
      setClauses.push(`tags = $${paramIdx++}::jsonb`);
      setParams.push(JSON.stringify(validated.tags));
    }

    if (setClauses.length > 2) {
      await this.prisma.$queryRawUnsafe(
        `UPDATE ${KPI_TABLE} SET ${setClauses.join(', ')} WHERE id = $1 AND tenant_id = $${paramIdx}`,
        ...setParams,
        tenantId,
      );
    }

    if (validated.stakeholderIds !== undefined) {
      await this.prisma.$queryRawUnsafe(
        `DELETE FROM ${KPI_STAKEHOLDER_TABLE} WHERE kpi_id = $1`,
        kpiId,
      );
      if (validated.stakeholderIds.length > 0) {
        await this.upsertStakeholders(kpiId, validated.stakeholderIds);
      }
    }

    const updated = await this.getKpiById(kpiId, tenantId);
    await this.saveVersionSnapshot(updated, validated.requestedBy, validated.changeReason, newVersion, diff);
    await this.invalidateKpiCache(kpiId, tenantId);

    await this.notifyStakeholders(updated, 'KPI_UPDATED', validated.changeReason);

    logger.info('KPI updated (draft)', { kpiId, version: newVersion });
    return updated;
  }

  async activateKpi(kpiId: string, tenantId: string, activatedBy: string): Promise<KpiDefinition> {
    const existing = await this.getKpiById(kpiId, tenantId);

    if (existing.status !== 'draft') {
      throw new Error(`Only draft KPIs can be activated. Current status: ${existing.status}`);
    }

    this.validateFormula(existing.formula, existing.variables.map(v => v.name));

    await this.prisma.$queryRawUnsafe(
      `UPDATE ${KPI_TABLE} SET status = 'active', updated_at = $2 WHERE id = $1 AND tenant_id = $3`,
      kpiId,
      new Date(),
      tenantId,
    );

    await this.invalidateKpiCache(kpiId, tenantId);
    const activated = await this.getKpiById(kpiId, tenantId);

    logger.info('KPI activated', { kpiId, activatedBy });
    await this.notifyStakeholders(activated, 'KPI_ACTIVATED', 'KPI is now active');
    return activated;
  }

  async deprecateKpi(kpiId: string, tenantId: string, deprecatedBy: string, reason: string): Promise<KpiDefinition> {
    const existing = await this.getKpiById(kpiId, tenantId);

    if (existing.status === 'deprecated') {
      throw new Error('KPI is already deprecated');
    }

    await this.prisma.$queryRawUnsafe(
      `UPDATE ${KPI_TABLE} SET status = 'deprecated', updated_at = $2 WHERE id = $1 AND tenant_id = $3`,
      kpiId,
      new Date(),
      tenantId,
    );

    await this.invalidateKpiCache(kpiId, tenantId);
    const deprecated = await this.getKpiById(kpiId, tenantId);

    logger.info('KPI deprecated', { kpiId, deprecatedBy, reason });
    await this.notifyStakeholders(deprecated, 'KPI_DEPRECATED', reason);
    return deprecated;
  }

  async deleteKpi(kpiId: string, tenantId: string, deletedBy: string): Promise<void> {
    const existing = await this.getKpiById(kpiId, tenantId);

    if (existing.status === 'active') {
      throw new Error(`Cannot delete an active KPI. Deprecate it first.`);
    }

    const children: { count: string }[] = await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as count FROM ${KPI_TABLE} WHERE parent_kpi_id = $1 AND tenant_id = $2`,
      kpiId,
      tenantId,
    );

    if (parseInt(children[0]?.count ?? '0', 10) > 0) {
      throw new Error(`Cannot delete KPI with child KPIs. Reassign children first.`);
    }

    await this.prisma.$queryRawUnsafe(
      `DELETE FROM ${KPI_STAKEHOLDER_TABLE} WHERE kpi_id = $1`,
      kpiId,
    );
    await this.prisma.$queryRawUnsafe(
      `DELETE FROM ${KPI_VERSION_TABLE} WHERE kpi_id = $1`,
      kpiId,
    );
    await this.prisma.$queryRawUnsafe(
      `DELETE FROM ${KPI_CHANGE_REQUEST_TABLE} WHERE kpi_id = $1`,
      kpiId,
    );
    await this.prisma.$queryRawUnsafe(
      `DELETE FROM ${KPI_TABLE} WHERE id = $1 AND tenant_id = $2`,
      kpiId,
      tenantId,
    );

    await this.invalidateKpiCache(kpiId, tenantId);
    logger.info('KPI deleted', { kpiId, deletedBy });
  }

  // ─── 2. KPI Calculation ───────────────────────────────────────────────────

  async calculateKpi(input: z.infer<typeof CalculateKpiSchema>, tenantId: string): Promise<KpiCalculationResult> {
    const validated = CalculateKpiSchema.parse(input);
    const kpi = await this.getKpiById(validated.kpiId, tenantId);

    if (kpi.status === 'deprecated') {
      throw new Error(`KPI ${kpi.name} is deprecated and cannot be calculated`);
    }

    const asOf = validated.asOf ? new Date(validated.asOf) : new Date();
    const cacheKey = `kpi:calc:${tenantId}:${validated.kpiId}:${asOf.toISOString().slice(0, 13)}`;

    if (!validated.forceRefresh) {
      const cached = await this.cacheGet<KpiCalculationResult>(cacheKey);
      if (cached) {
        return { ...cached, dataFreshness: 'cached' };
      }
    }

    const variableValues: Record<string, number> = {};

    for (const variable of kpi.variables) {
      variableValues[variable.name] = await this.resolveVariable(variable, asOf);
    }

    let value: number;
    try {
      const scope: Record<string, number> = { ...variableValues };
      const compiled = this.math.compile(kpi.formula);
      const result = compiled.evaluate(scope);

      if (typeof result !== 'number' || !isFinite(result)) {
        throw new Error(`Formula produced non-numeric result: ${result}`);
      }
      value = Math.round(result * 1000000) / 1000000;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Formula evaluation failed for KPI "${kpi.name}": ${message}`);
    }

    const status = this.classifyValue(value, kpi);

    const calculationResult: KpiCalculationResult = {
      kpiId: validated.kpiId,
      value,
      asOf,
      status,
      variableValues,
      cachedAt: new Date(),
      dataFreshness: 'live',
    };

    await this.cacheSet(cacheKey, calculationResult, this.frequencyToCacheTtl(kpi.frequency));

    logger.info('KPI calculated', {
      kpiId: validated.kpiId,
      value,
      status,
      variablesResolved: Object.keys(variableValues).length,
    });

    return calculationResult;
  }

  private async resolveVariable(variable: FormulaVariable, asOf: Date): Promise<number> {
    const dataset = await this.prisma.dataset.findUnique({
      where: { id: variable.datasetId },
      select: { tableName: true, status: true },
    });

    if (!dataset || !dataset.tableName) {
      throw new Error(`Dataset not found or has no table: ${variable.datasetId}`);
    }

    const columnSafe = `"${variable.column.replace(/"/g, '""')}"`;
    const tableSafe = `"${dataset.tableName.replace(/"/g, '""')}"`;

    let filterClause = '';
    if (variable.filter) {
      filterClause = `AND (${variable.filter})`;
    }

    let aggregateQuery: string;
    switch (variable.aggregation) {
      case 'sum':
        aggregateQuery = `SELECT COALESCE(SUM(${columnSafe}::numeric), 0) AS result FROM ${tableSafe} WHERE 1=1 ${filterClause}`;
        break;
      case 'avg':
        aggregateQuery = `SELECT COALESCE(AVG(${columnSafe}::numeric), 0) AS result FROM ${tableSafe} WHERE 1=1 ${filterClause}`;
        break;
      case 'count':
        aggregateQuery = `SELECT COUNT(${columnSafe}) AS result FROM ${tableSafe} WHERE 1=1 ${filterClause}`;
        break;
      case 'count_distinct':
        aggregateQuery = `SELECT COUNT(DISTINCT ${columnSafe}) AS result FROM ${tableSafe} WHERE 1=1 ${filterClause}`;
        break;
      case 'min':
        aggregateQuery = `SELECT COALESCE(MIN(${columnSafe}::numeric), 0) AS result FROM ${tableSafe} WHERE 1=1 ${filterClause}`;
        break;
      case 'max':
        aggregateQuery = `SELECT COALESCE(MAX(${columnSafe}::numeric), 0) AS result FROM ${tableSafe} WHERE 1=1 ${filterClause}`;
        break;
      case 'latest':
        aggregateQuery = `SELECT COALESCE((${columnSafe}::numeric), 0) AS result FROM ${tableSafe} WHERE ${columnSafe} IS NOT NULL ${filterClause} ORDER BY ctid DESC LIMIT 1`;
        break;
      default:
        throw new Error(`Unknown aggregation: ${variable.aggregation}`);
    }

    const rows: { result: string | number }[] = await this.prisma.$queryRawUnsafe(aggregateQuery);
    return parseFloat(String(rows[0]?.result ?? '0'));
  }

  private classifyValue(
    value: number,
    kpi: KpiDefinition,
  ): 'normal' | 'warning' | 'critical' {
    if (kpi.criticalThreshold !== null) {
      const isCritical =
        kpi.direction === 'higher_better'
          ? value <= kpi.criticalThreshold
          : value >= kpi.criticalThreshold;
      if (isCritical) return 'critical';
    }

    if (kpi.warningThreshold !== null) {
      const isWarning =
        kpi.direction === 'higher_better'
          ? value <= kpi.warningThreshold
          : value >= kpi.warningThreshold;
      if (isWarning) return 'warning';
    }

    return 'normal';
  }

  private frequencyToCacheTtl(frequency: KpiDefinition['frequency']): number {
    const map: Record<KpiDefinition['frequency'], number> = {
      daily: 3600,
      weekly: 21600,
      monthly: 86400,
      quarterly: 172800,
      annual: 604800,
    };
    return map[frequency];
  }

  // ─── 3. Version History ───────────────────────────────────────────────────

  async getVersionHistory(kpiId: string, tenantId: string): Promise<KpiVersionRecord[]> {
    await this.assertKpiExists(kpiId, tenantId);

    const rows: KpiVersionRawRow[] = await this.prisma.$queryRawUnsafe(
      `SELECT id, kpi_id, version, snapshot, changed_by, change_reason, diff, changed_at
       FROM ${KPI_VERSION_TABLE}
       WHERE kpi_id = $1
       ORDER BY version DESC`,
      kpiId,
    );

    return rows.map(r => ({
      id: String(r.id),
      kpiId: String(r.kpi_id),
      version: Number(r.version),
      snapshot: r.snapshot as unknown as KpiDefinition,
      changedBy: String(r.changed_by),
      changeReason: String(r.change_reason),
      changedAt: new Date(r.changed_at as string),
      diff: (r.diff as unknown as KpiFieldDiff[]) ?? [],
    }));
  }

  async rollbackToVersion(input: z.infer<typeof RollbackVersionSchema>, tenantId: string): Promise<KpiDefinition> {
    const validated = RollbackVersionSchema.parse(input);
    const existing = await this.getKpiById(validated.kpiId, tenantId);

    if (existing.status === 'active') {
      throw new Error(
        `Cannot directly rollback an active KPI. Submit a change request or deprecate it first.`,
      );
    }

    const versionRows: KpiVersionRawRow[] = await this.prisma.$queryRawUnsafe(
      `SELECT snapshot FROM ${KPI_VERSION_TABLE} WHERE kpi_id = $1 AND version = $2`,
      validated.kpiId,
      validated.targetVersion,
    );

    if (versionRows.length === 0) {
      throw new Error(`Version ${validated.targetVersion} not found for KPI ${validated.kpiId}`);
    }

    const snapshot = versionRows[0].snapshot as unknown as KpiDefinition;
    const newVersion = existing.currentVersion + 1;
    const now = new Date();

    await this.prisma.$queryRawUnsafe(
      `UPDATE ${KPI_TABLE} SET
        name = $2, name_ar = $3, description = $4, formula = $5,
        variables = $6::jsonb, category = $7, unit = $8, direction = $9,
        frequency = $10, target = $11, warning_threshold = $12,
        critical_threshold = $13, sensitivity_level = $14,
        tags = $15::jsonb, parent_kpi_id = $16,
        current_version = $17, updated_at = $18
       WHERE id = $1 AND tenant_id = $19`,
      validated.kpiId,
      snapshot.name,
      snapshot.nameAr,
      snapshot.description,
      snapshot.formula,
      JSON.stringify(snapshot.variables),
      snapshot.category,
      snapshot.unit,
      snapshot.direction,
      snapshot.frequency,
      snapshot.target,
      snapshot.warningThreshold,
      snapshot.criticalThreshold,
      snapshot.sensitivityLevel,
      JSON.stringify(snapshot.tags),
      snapshot.parentKpiId,
      newVersion,
      now,
      tenantId,
    );

    await this.invalidateKpiCache(validated.kpiId, tenantId);
    const rolled = await this.getKpiById(validated.kpiId, tenantId);

    const diff = this.computeDiff(existing, snapshot);
    await this.saveVersionSnapshot(
      rolled,
      validated.requestedBy,
      `Rollback to version ${validated.targetVersion}: ${validated.reason}`,
      newVersion,
      diff,
    );

    logger.info('KPI rolled back', {
      kpiId: validated.kpiId,
      fromVersion: existing.currentVersion,
      toVersion: validated.targetVersion,
      newVersion,
    });

    return rolled;
  }

  // ─── 4. Approval Workflow ─────────────────────────────────────────────────

  private async submitChangeRequest(
    kpiId: string,
    tenantId: string,
    changes: z.infer<typeof UpdateKpiSchema>,
  ): Promise<KpiDefinition> {
    const existing = await this.getKpiById(kpiId, tenantId);

    const pendingRows: { count: string }[] = await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as count FROM ${KPI_CHANGE_REQUEST_TABLE}
       WHERE kpi_id = $1 AND status = 'pending'`,
      kpiId,
    );

    if (parseInt(pendingRows[0]?.count ?? '0', 10) > 0) {
      throw new Error(
        `KPI ${kpi_id_ref(kpiId)} already has a pending change request. Resolve it before submitting another.`,
      );
    }

    const requestId = crypto.randomUUID();
    const proposedChanges: Partial<KpiDefinition> = {};

    if (changes.name !== undefined) proposedChanges.name = changes.name;
    if (changes.nameAr !== undefined) proposedChanges.nameAr = changes.nameAr;
    if (changes.description !== undefined) proposedChanges.description = changes.description;
    if (changes.formula !== undefined) proposedChanges.formula = changes.formula;
    if (changes.variables !== undefined) proposedChanges.variables = changes.variables as FormulaVariable[];
    if (changes.category !== undefined) proposedChanges.category = changes.category;
    if (changes.unit !== undefined) proposedChanges.unit = changes.unit;
    if (changes.direction !== undefined) proposedChanges.direction = changes.direction;
    if (changes.frequency !== undefined) proposedChanges.frequency = changes.frequency;
    if (changes.target !== undefined) proposedChanges.target = changes.target;
    if (changes.warningThreshold !== undefined) proposedChanges.warningThreshold = changes.warningThreshold;
    if (changes.criticalThreshold !== undefined) proposedChanges.criticalThreshold = changes.criticalThreshold;
    if (changes.sensitivityLevel !== undefined) proposedChanges.sensitivityLevel = changes.sensitivityLevel;
    if (changes.tags !== undefined) proposedChanges.tags = changes.tags;
    if (changes.parentKpiId !== undefined) proposedChanges.parentKpiId = changes.parentKpiId ?? null;
    if (changes.stakeholderIds !== undefined) proposedChanges.stakeholderIds = changes.stakeholderIds;

    await this.prisma.$queryRawUnsafe(
      `INSERT INTO ${KPI_CHANGE_REQUEST_TABLE}
        (id, kpi_id, requested_by, requested_at, proposed_changes, change_reason, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'pending')`,
      requestId,
      kpiId,
      changes.requestedBy,
      new Date(),
      JSON.stringify(proposedChanges),
      changes.changeReason,
    );

    await this.notifyStakeholders(existing, 'KPI_CHANGE_REQUESTED', changes.changeReason);

    logger.info('KPI change request submitted', { requestId, kpiId, requestedBy: changes.requestedBy });

    return existing;
  }

  async getPendingChangeRequests(tenantId: string, kpiId?: string): Promise<KpiChangeRequest[]> {
    let query: string;
    let params: unknown[];

    if (kpiId) {
      await this.assertKpiExists(kpiId, tenantId);
      query = `SELECT cr.* FROM ${KPI_CHANGE_REQUEST_TABLE} cr
               JOIN ${KPI_TABLE} k ON k.id = cr.kpi_id
               WHERE cr.kpi_id = $1 AND k.tenant_id = $2
               ORDER BY cr.requested_at DESC`;
      params = [kpiId, tenantId];
    } else {
      query = `SELECT cr.* FROM ${KPI_CHANGE_REQUEST_TABLE} cr
               JOIN ${KPI_TABLE} k ON k.id = cr.kpi_id
               WHERE k.tenant_id = $1 AND cr.status = 'pending'
               ORDER BY cr.requested_at DESC`;
      params = [tenantId];
    }

    const rows: KpiChangeRequestRawRow[] = await this.prisma.$queryRawUnsafe(query, ...params);
    return rows.map(r => this.mapRowToChangeRequest(r));
  }

  async processApproval(
    input: z.infer<typeof ApprovalActionSchema>,
    tenantId: string,
  ): Promise<{ changeRequest: KpiChangeRequest; kpi: KpiDefinition }> {
    const validated = ApprovalActionSchema.parse(input);

    const crRows: KpiChangeRequestRawRow[] = await this.prisma.$queryRawUnsafe(
      `SELECT cr.* FROM ${KPI_CHANGE_REQUEST_TABLE} cr
       JOIN ${KPI_TABLE} k ON k.id = cr.kpi_id
       WHERE cr.id = $1 AND k.tenant_id = $2`,
      validated.changeRequestId,
      tenantId,
    );

    if (crRows.length === 0) {
      throw new Error(`Change request not found: ${validated.changeRequestId}`);
    }

    const cr = crRows[0];

    if (String(cr.status) !== 'pending') {
      throw new Error(`Change request is already ${cr.status}`);
    }

    const now = new Date();

    await this.prisma.$queryRawUnsafe(
      `UPDATE ${KPI_CHANGE_REQUEST_TABLE}
       SET status = $2, reviewed_by = $3, reviewed_at = $4, review_comment = $5
       WHERE id = $1`,
      validated.changeRequestId,
      validated.action === 'approve' ? 'approved' : 'rejected',
      validated.reviewedBy,
      now,
      validated.comment ?? null,
    );

    const kpiId = String(cr.kpi_id);
    let kpi = await this.getKpiById(kpiId, tenantId);

    if (validated.action === 'approve') {
      const proposedChanges = cr.proposed_changes as unknown as Partial<KpiDefinition>;
      const newVersion = kpi.currentVersion + 1;
      const diff = this.computeDiff(kpi, proposedChanges);

      const setClauses: string[] = ['updated_at = $2', `current_version = $3`];
      const setParams: unknown[] = [kpiId, now, newVersion];
      let paramIdx = 4;

      const dbFieldMap: Record<string, string> = {
        name: 'name',
        nameAr: 'name_ar',
        description: 'description',
        formula: 'formula',
        category: 'category',
        unit: 'unit',
        direction: 'direction',
        frequency: 'frequency',
        target: 'target',
        warningThreshold: 'warning_threshold',
        criticalThreshold: 'critical_threshold',
        sensitivityLevel: 'sensitivity_level',
        parentKpiId: 'parent_kpi_id',
      };

      for (const [jsKey, dbCol] of Object.entries(dbFieldMap)) {
        const val = (proposedChanges as Record<string, unknown>)[jsKey];
        if (val !== undefined) {
          setClauses.push(`${dbCol} = $${paramIdx++}`);
          setParams.push(val);
        }
      }

      if (proposedChanges.variables !== undefined) {
        setClauses.push(`variables = $${paramIdx++}::jsonb`);
        setParams.push(JSON.stringify(proposedChanges.variables));
      }
      if (proposedChanges.tags !== undefined) {
        setClauses.push(`tags = $${paramIdx++}::jsonb`);
        setParams.push(JSON.stringify(proposedChanges.tags));
      }

      await this.prisma.$queryRawUnsafe(
        `UPDATE ${KPI_TABLE} SET ${setClauses.join(', ')} WHERE id = $1 AND tenant_id = $${paramIdx}`,
        ...setParams,
        tenantId,
      );

      if (proposedChanges.stakeholderIds !== undefined) {
        await this.prisma.$queryRawUnsafe(
          `DELETE FROM ${KPI_STAKEHOLDER_TABLE} WHERE kpi_id = $1`,
          kpiId,
        );
        if (proposedChanges.stakeholderIds.length > 0) {
          await this.upsertStakeholders(kpiId, proposedChanges.stakeholderIds);
        }
      }

      await this.invalidateKpiCache(kpiId, tenantId);
      kpi = await this.getKpiById(kpiId, tenantId);
      await this.saveVersionSnapshot(kpi, validated.reviewedBy, `Approved change: ${String(cr.change_reason)}`, newVersion, diff);
      await this.notifyStakeholders(kpi, 'KPI_CHANGE_APPROVED', validated.comment ?? 'Change approved');
    } else {
      await this.notifyStakeholders(kpi, 'KPI_CHANGE_REJECTED', validated.comment ?? 'Change rejected');
    }

    const updatedCrRows: KpiChangeRequestRawRow[] = await this.prisma.$queryRawUnsafe(
      `SELECT * FROM ${KPI_CHANGE_REQUEST_TABLE} WHERE id = $1`,
      validated.changeRequestId,
    );

    logger.info('KPI approval processed', {
      changeRequestId: validated.changeRequestId,
      action: validated.action,
      reviewedBy: validated.reviewedBy,
    });

    return {
      changeRequest: this.mapRowToChangeRequest(updatedCrRows[0]),
      kpi,
    };
  }

  // ─── 5. Impact Preview ────────────────────────────────────────────────────

  async previewImpact(
    kpiId: string,
    tenantId: string,
    proposedChanges: Partial<Pick<KpiDefinition, 'formula' | 'variables' | 'target' | 'warningThreshold' | 'criticalThreshold'>>,
  ): Promise<KpiImpactPreview> {
    const kpi = await this.getKpiById(kpiId, tenantId);

    const affectedDashboards = await this.findAffectedDashboards(kpiId, tenantId);
    const affectedReports = await this.findAffectedReports(kpiId, tenantId);
    const affectedChildKpis = await this.findDirectChildren(kpiId, tenantId);

    let projectedValueChange: ProjectedChange | null = null;

    if (proposedChanges.formula || proposedChanges.variables) {
      const testKpi: KpiDefinition = {
        ...kpi,
        formula: proposedChanges.formula ?? kpi.formula,
        variables: proposedChanges.variables ?? kpi.variables,
      };

      try {
        const currentResult = await this.calculateKpi(
          { kpiId, asOf: undefined, forceRefresh: true },
          tenantId,
        );

        const variableValues: Record<string, number> = {};
        for (const variable of testKpi.variables) {
          variableValues[variable.name] = await this.resolveVariable(variable, new Date());
        }

        const compiled = this.math.compile(testKpi.formula);
        const projectedValue = compiled.evaluate({ ...variableValues }) as number;

        const absoluteChange = projectedValue - currentResult.value;
        const percentageChange =
          currentResult.value !== 0
            ? (absoluteChange / Math.abs(currentResult.value)) * 100
            : 0;

        projectedValueChange = {
          currentValue: currentResult.value,
          projectedValue: Math.round(projectedValue * 1000000) / 1000000,
          absoluteChange: Math.round(absoluteChange * 1000000) / 1000000,
          percentageChange: Math.round(percentageChange * 100) / 100,
        };
      } catch {
        projectedValueChange = null;
      }
    }

    const totalAffected = affectedDashboards.length + affectedReports.length + affectedChildKpis.length;
    const estimatedImpactLevel: 'high' | 'medium' | 'low' =
      totalAffected >= 5 ? 'high' : totalAffected >= 2 ? 'medium' : 'low';

    return {
      kpiId,
      affectedDashboards,
      affectedReports,
      affectedChildKpis,
      projectedValueChange,
      estimatedImpactLevel,
    };
  }

  private async findAffectedDashboards(kpiId: string, tenantId: string): Promise<AffectedAsset[]> {
    const rows: { id: string; name: string; config_json: unknown }[] =
      await this.prisma.$queryRawUnsafe(
        `SELECT DISTINCT d.id, d.name, dw.config_json
         FROM dashboard_widgets dw
         JOIN dashboards d ON d.id = dw.dashboard_id
         WHERE d.tenant_id = $1
           AND dw.config_json::text LIKE $2`,
        tenantId,
        `%${kpiId}%`,
      );

    return rows.map(r => ({
      id: String(r.id),
      name: String(r.name),
      type: 'dashboard' as const,
      referenceContext: `Widget configuration references KPI ${kpiId}`,
    }));
  }

  private async findAffectedReports(kpiId: string, tenantId: string): Promise<AffectedAsset[]> {
    const rows: { id: string; name: string }[] = await this.prisma.$queryRawUnsafe(
      `SELECT id, name FROM reports
       WHERE tenant_id = $1
         AND (config_json::text LIKE $2 OR data_source_id::text = $3)`,
      tenantId,
      `%${kpiId}%`,
      kpiId,
    );

    return rows.map(r => ({
      id: String(r.id),
      name: String(r.name),
      type: 'report' as const,
      referenceContext: `Report configuration references KPI ${kpiId}`,
    }));
  }

  private async findDirectChildren(kpiId: string, tenantId: string): Promise<AffectedAsset[]> {
    const rows: { id: string; name: string }[] = await this.prisma.$queryRawUnsafe(
      `SELECT id, name FROM ${KPI_TABLE}
       WHERE parent_kpi_id = $1 AND tenant_id = $2`,
      kpiId,
      tenantId,
    );

    return rows.map(r => ({
      id: String(r.id),
      name: String(r.name),
      type: 'kpi' as const,
      referenceContext: `Child KPI depends on parent formula roll-up`,
    }));
  }

  // ─── 6. KPI Hierarchy ────────────────────────────────────────────────────

  async getKpiHierarchy(rootKpiId: string, tenantId: string): Promise<KpiHierarchy> {
    const root = await this.getKpiById(rootKpiId, tenantId);

    let maxDepth = 0;
    let totalNodes = 0;

    const buildTree = async (kpiId: string, depth: number): Promise<KpiNodeWithChildren> => {
      const kpi = await this.getKpiById(kpiId, tenantId);
      totalNodes++;
      maxDepth = Math.max(maxDepth, depth);

      let currentValue: number | null = null;
      try {
        const calc = await this.calculateKpi({ kpiId, forceRefresh: false }, tenantId);
        currentValue = calc.value;
      } catch {
        currentValue = null;
      }

      const childRows: { id: string }[] = await this.prisma.$queryRawUnsafe(
        `SELECT id FROM ${KPI_TABLE} WHERE parent_kpi_id = $1 AND tenant_id = $2 AND status != 'deprecated'`,
        kpiId,
        tenantId,
      );

      const children: KpiNodeWithChildren[] = [];
      for (const childRow of childRows) {
        children.push(await buildTree(String(childRow.id), depth + 1));
      }

      return {
        id: kpi.id,
        name: kpi.name,
        nameAr: kpi.nameAr,
        status: kpi.status,
        currentValue,
        children,
      };
    };

    const treeRoot = await buildTree(rootKpiId, 0);

    return {
      root: treeRoot,
      totalNodes,
      maxDepth,
    };
  }

  async computeRollupValue(parentKpiId: string, tenantId: string): Promise<number> {
    const childRows: { id: string }[] = await this.prisma.$queryRawUnsafe(
      `SELECT id FROM ${KPI_TABLE}
       WHERE parent_kpi_id = $1 AND tenant_id = $2 AND status = 'active'`,
      parentKpiId,
      tenantId,
    );

    if (childRows.length === 0) {
      const calc = await this.calculateKpi({ kpiId: parentKpiId, forceRefresh: false }, tenantId);
      return calc.value;
    }

    const childValues: number[] = [];
    for (const childRow of childRows) {
      try {
        const calc = await this.calculateKpi({ kpiId: String(childRow.id), forceRefresh: false }, tenantId);
        childValues.push(calc.value);
      } catch {
        logger.warn('Skipping child KPI in rollup due to calculation error', { childKpiId: childRow.id });
      }
    }

    return childValues.length > 0
      ? childValues.reduce((sum, v) => sum + v, 0)
      : 0;
  }

  // ─── 7. Ownership ─────────────────────────────────────────────────────────

  async transferOwnership(input: z.infer<typeof TransferOwnershipSchema>, tenantId: string): Promise<KpiDefinition> {
    const validated = TransferOwnershipSchema.parse(input);
    const kpi = await this.getKpiById(validated.kpiId, tenantId);

    const newOwnerExists = await this.prisma.user.findUnique({
      where: { id: validated.newOwnerId },
      select: { id: true },
    });

    if (!newOwnerExists) {
      throw new Error(`User not found: ${validated.newOwnerId}`);
    }

    await this.prisma.$queryRawUnsafe(
      `UPDATE ${KPI_TABLE} SET owner_id = $2, updated_at = $3
       WHERE id = $1 AND tenant_id = $4`,
      validated.kpiId,
      validated.newOwnerId,
      new Date(),
      tenantId,
    );

    await this.invalidateKpiCache(validated.kpiId, tenantId);
    const updated = await this.getKpiById(validated.kpiId, tenantId);

    const diff: KpiFieldDiff[] = [
      { field: 'ownerId', oldValue: kpi.ownerId, newValue: validated.newOwnerId },
    ];

    await this.saveVersionSnapshot(
      updated,
      validated.requestedBy,
      validated.reason ?? `Ownership transferred from ${kpi.ownerId} to ${validated.newOwnerId}`,
      updated.currentVersion + 1,
      diff,
    );

    await this.notifyStakeholders(
      updated,
      'KPI_OWNERSHIP_TRANSFERRED',
      `KPI ownership transferred to user ${validated.newOwnerId}`,
    );

    logger.info('KPI ownership transferred', {
      kpiId: validated.kpiId,
      from: kpi.ownerId,
      to: validated.newOwnerId,
    });

    return updated;
  }

  async addStakeholders(kpiId: string, tenantId: string, userIds: string[]): Promise<KpiDefinition> {
    await this.assertKpiExists(kpiId, tenantId);
    await this.upsertStakeholders(kpiId, userIds);
    await this.invalidateKpiCache(kpiId, tenantId);
    return this.getKpiById(kpiId, tenantId);
  }

  async removeStakeholder(kpiId: string, tenantId: string, userId: string): Promise<KpiDefinition> {
    await this.assertKpiExists(kpiId, tenantId);

    await this.prisma.$queryRawUnsafe(
      `DELETE FROM ${KPI_STAKEHOLDER_TABLE} WHERE kpi_id = $1 AND user_id = $2`,
      kpiId,
      userId,
    );

    await this.invalidateKpiCache(kpiId, tenantId);
    return this.getKpiById(kpiId, tenantId);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private validateFormula(formula: string, variableNames: string[]): void {
    try {
      const scope: Record<string, number> = {};
      for (const name of variableNames) {
        scope[name] = 1;
      }
      const compiled = this.math.compile(formula);
      const result = compiled.evaluate(scope);
      if (typeof result !== 'number') {
        throw new Error(`Formula must produce a numeric result, got: ${typeof result}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Invalid formula: ${message}`);
    }
  }

  private async assertKpiExists(kpiId: string, tenantId: string): Promise<void> {
    const rows: { count: string }[] = await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as count FROM ${KPI_TABLE} WHERE id = $1 AND tenant_id = $2`,
      kpiId,
      tenantId,
    );
    if (parseInt(rows[0]?.count ?? '0', 10) === 0) {
      throw new Error(`KPI not found: ${kpiId}`);
    }
  }

  private async assertNoCircularHierarchy(
    kpiId: string,
    proposedParentId: string,
    tenantId: string,
  ): Promise<void> {
    let currentId: string | null = proposedParentId;
    const visited = new Set<string>();

    while (currentId !== null) {
      if (currentId === kpiId) {
        throw new Error(`Circular hierarchy detected: KPI ${kpiId} would be its own ancestor`);
      }
      if (visited.has(currentId)) break;
      visited.add(currentId);

      const parentRows: { parent_kpi_id: string | null }[] = await this.prisma.$queryRawUnsafe(
        `SELECT parent_kpi_id FROM ${KPI_TABLE} WHERE id = $1 AND tenant_id = $2`,
        currentId,
        tenantId,
      );

      currentId = parentRows[0]?.parent_kpi_id ?? null;
    }
  }

  private async saveVersionSnapshot(
    kpi: KpiDefinition,
    changedBy: string,
    reason: string,
    version: number,
    diff: KpiFieldDiff[],
  ): Promise<void> {
    await this.prisma.$queryRawUnsafe(
      `INSERT INTO ${KPI_VERSION_TABLE} (id, kpi_id, version, snapshot, changed_by, change_reason, diff, changed_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7::jsonb, $8)
       ON CONFLICT (kpi_id, version) DO UPDATE
         SET snapshot = EXCLUDED.snapshot,
             diff = EXCLUDED.diff,
             changed_at = EXCLUDED.changed_at`,
      crypto.randomUUID(),
      kpi.id,
      version,
      JSON.stringify(kpi),
      changedBy,
      reason,
      JSON.stringify(diff),
      new Date(),
    );
  }

  private computeDiff(
    original: Partial<KpiDefinition>,
    proposed: Partial<KpiDefinition> | Partial<z.infer<typeof UpdateKpiSchema>>,
  ): KpiFieldDiff[] {
    const diffs: KpiFieldDiff[] = [];
    const fields: Array<keyof KpiDefinition> = [
      'name', 'nameAr', 'description', 'formula', 'variables',
      'category', 'unit', 'direction', 'frequency', 'target',
      'warningThreshold', 'criticalThreshold', 'sensitivityLevel',
      'tags', 'parentKpiId', 'stakeholderIds', 'ownerId',
    ];

    for (const field of fields) {
      const oldVal = original[field];
      const newVal = (proposed as Record<string, unknown>)[field];

      if (newVal !== undefined) {
        const oldStr = JSON.stringify(oldVal);
        const newStr = JSON.stringify(newVal);
        if (oldStr !== newStr) {
          diffs.push({ field, oldValue: oldVal, newValue: newVal });
        }
      }
    }

    return diffs;
  }

  private async upsertStakeholders(kpiId: string, userIds: string[]): Promise<void> {
    for (const userId of userIds) {
      await this.prisma.$queryRawUnsafe(
        `INSERT INTO ${KPI_STAKEHOLDER_TABLE} (kpi_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (kpi_id, user_id) DO NOTHING`,
        kpiId,
        userId,
      );
    }
  }

  private async notifyStakeholders(
    kpi: KpiDefinition,
    eventType: string,
    message: string,
  ): Promise<void> {
    const recipientIds = [kpi.ownerId, ...kpi.stakeholderIds];
    const uniqueIds = [...new Set(recipientIds)];

    for (const userId of uniqueIds) {
      try {
        await this.prisma.notification.create({
          data: {
            id: crypto.randomUUID(),
            tenantId: kpi.tenantId,
            userId,
            type: eventType,
            title: `KPI Update: ${kpi.name}`,
            body: message,
            data: { kpiId: kpi.id, kpiName: kpi.name, event: eventType } as unknown as never,
            isRead: false,
            createdAt: new Date(),
          },
        });
      } catch {
        logger.warn('Failed to create notification for stakeholder', { userId, kpiId: kpi.id });
      }
    }
  }

  private async cacheGet<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private async cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // Cache failures are non-critical
    }
  }

  private async invalidateKpiCache(kpiId: string, tenantId: string): Promise<void> {
    try {
      const keys = await this.redis.keys(`kpi:*:${tenantId}:${kpiId}*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch {
      // Cache invalidation failures are non-critical
    }
  }

  private mapRowToKpi(row: KpiRawRow): KpiDefinition {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      name: String(row.name),
      nameAr: String(row.name_ar),
      description: row.description ? String(row.description) : null,
      formula: String(row.formula),
      variables: Array.isArray(row.variables)
        ? (row.variables as unknown as FormulaVariable[])
        : (JSON.parse(String(row.variables ?? '[]')) as FormulaVariable[]),
      ownerId: String(row.owner_id),
      category: String(row.category),
      unit: row.unit ? String(row.unit) : null,
      direction: String(row.direction) as KpiDefinition['direction'],
      frequency: String(row.frequency) as KpiDefinition['frequency'],
      target: row.target !== null && row.target !== undefined ? Number(row.target) : null,
      warningThreshold:
        row.warning_threshold !== null && row.warning_threshold !== undefined
          ? Number(row.warning_threshold)
          : null,
      criticalThreshold:
        row.critical_threshold !== null && row.critical_threshold !== undefined
          ? Number(row.critical_threshold)
          : null,
      sensitivityLevel: String(row.sensitivity_level) as KpiDefinition['sensitivityLevel'],
      tags: Array.isArray(row.tags)
        ? (row.tags as string[])
        : (JSON.parse(String(row.tags ?? '[]')) as string[]),
      status: String(row.status) as KpiDefinition['status'],
      parentKpiId: row.parent_kpi_id ? String(row.parent_kpi_id) : null,
      stakeholderIds: Array.isArray(row.stakeholder_ids)
        ? row.stakeholder_ids.filter(Boolean).map(String)
        : [],
      currentVersion: Number(row.current_version),
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private mapRowToChangeRequest(row: KpiChangeRequestRawRow): KpiChangeRequest {
    return {
      id: String(row.id),
      kpiId: String(row.kpi_id),
      requestedBy: String(row.requested_by),
      requestedAt: new Date(row.requested_at as string),
      proposedChanges: row.proposed_changes as unknown as Partial<KpiDefinition>,
      changeReason: String(row.change_reason),
      status: String(row.status) as KpiChangeRequest['status'],
      reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at as string) : null,
      reviewComment: row.review_comment ? String(row.review_comment) : null,
    };
  }
}

// ─── Raw DB row types (internal) ──────────────────────────────────────────────

interface KpiRawRow {
  id: unknown;
  tenant_id: unknown;
  name: unknown;
  name_ar: unknown;
  description: unknown;
  formula: unknown;
  variables: unknown;
  owner_id: unknown;
  category: unknown;
  unit: unknown;
  direction: unknown;
  frequency: unknown;
  target: unknown;
  warning_threshold: unknown;
  critical_threshold: unknown;
  sensitivity_level: unknown;
  tags: unknown;
  status: unknown;
  parent_kpi_id: unknown;
  current_version: unknown;
  created_at: unknown;
  updated_at: unknown;
  stakeholder_ids: unknown[];
}

interface KpiVersionRawRow {
  id: unknown;
  kpi_id: unknown;
  version: unknown;
  snapshot: unknown;
  changed_by: unknown;
  change_reason: unknown;
  diff: unknown;
  changed_at: unknown;
}

interface KpiChangeRequestRawRow {
  id: unknown;
  kpi_id: unknown;
  requested_by: unknown;
  requested_at: unknown;
  proposed_changes: unknown;
  change_reason: unknown;
  status: unknown;
  reviewed_by: unknown;
  reviewed_at: unknown;
  review_comment: unknown;
}

// ─── Helper (avoids lint warning about unused ref in error message) ───────────

function kpi_id_ref(id: string): string {
  return id;
}

export default KpiRegistryService;
