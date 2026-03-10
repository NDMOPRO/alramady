import { prisma } from '../utils/prisma';
import { NotFoundError } from '../middleware/errorHandler';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';

const CACHE_PREFIX = 'excel-formulas';
const CACHE_TTL = 300;

export interface ListFormulasParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  search?: string;
  workbookId?: string;
  tenantId?: string;
}

export class FormulasService {
  async list(params: ListFormulasParams) {
    const { page, limit, sortBy = 'createdAt', sortOrder, search, workbookId, tenantId } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { formulasJson: { path: ['$.expression'], string_contains: search } },
      ];
    }

    if (workbookId) {
      where.id = workbookId;
    }

    if (tenantId) {
      where.tenantId = tenantId;
    }

    const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
    const cached = await cacheGet<{ data: unknown[]; total: number }>(cacheKey);
    if (cached) return cached;

    const [data, total] = await Promise.all([
      prisma.workbook.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.workbook.count({ where }),
    ]);

    const result = {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    await cacheSet(cacheKey, result, CACHE_TTL);
    return result;
  }

  async getById(id: string) {
    const cacheKey = `${CACHE_PREFIX}:${id}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const workbook = await prisma.workbook.findUnique({ where: { id } });
    if (!workbook) {
      throw new NotFoundError('Workbook', id);
    }

    const formulaData = {
      ...workbook,
      formulas: workbook.formulasJson,
    };

    await cacheSet(cacheKey, formulaData, CACHE_TTL);
    return formulaData;
  }

  async create(data: {
    tenant_id: string;
    dataset_id?: string;
    name: string;
    sheets_json?: unknown;
    formulas_json?: unknown;
    created_by: string;
  }) {
    const workbook = await prisma.workbook.create({
      data: {
        tenantId: data.tenant_id,
        datasetId: data.dataset_id || null,
        name: data.name,
        sheetsJson: data.sheets_json ?? {},
        formulasJson: data.formulas_json ?? {},
        createdBy: data.created_by,
      },
    });

    await cacheDel(`${CACHE_PREFIX}:list:*`);
    return workbook;
  }

  async update(id: string, data: {
    name?: string;
    sheets_json?: unknown;
    formulas_json?: unknown;
  }) {
    await this.getById(id);

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.sheets_json !== undefined) updateData.sheetsJson = data.sheets_json;
    if (data.formulas_json !== undefined) updateData.formulasJson = data.formulas_json;

    const updated = await prisma.workbook.update({
      where: { id },
      data: updateData,
    });

    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${id}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);

    return updated;
  }

  async delete(id: string) {
    await this.getById(id);
    await prisma.workbook.delete({ where: { id } });

    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${id}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);

    return { deleted: true };
  }

  async executeFormula(workbookId: string, cellRef: string, expression: string) {
    const workbook = await this.getById(workbookId);
    const formulasJson: Record<string, any> = ((workbook as any).formulasJson as Record<string, any>) || {};

    formulasJson[cellRef] = {
      expression,
      lastExecuted: new Date().toISOString(),
      status: 'executed',
    };

    const updated = await prisma.workbook.update({
      where: { id: workbookId },
      data: { formulasJson: formulasJson },
    });

    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${workbookId}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);

    return updated;
  }

  async batchExecute(workbookId: string, formulas: Array<{ cellRef: string; expression: string }>) {
    const workbook = await this.getById(workbookId);
    const formulasJson: Record<string, any> = ((workbook as any).formulasJson as Record<string, any>) || {};

    for (const formula of formulas) {
      formulasJson[formula.cellRef] = {
        expression: formula.expression,
        lastExecuted: new Date().toISOString(),
        status: 'executed',
      };
    }

    const updated = await prisma.workbook.update({
      where: { id: workbookId },
      data: { formulasJson: formulasJson },
    });

    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${workbookId}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);

    return {
      workbook: updated,
      executedCount: formulas.length,
    };
  }
}

export const formulasService = new FormulasService();
