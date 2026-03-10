import { prisma } from '../../utils/prisma';
import { NotFoundError } from '../../middleware/errorHandler';
import { cacheGet, cacheSet, cacheDel } from '../../utils/redis';
import { logger } from '../../utils/logger';

interface PrismaDelegate {
  findMany(args: Record<string, unknown>): Promise<unknown[]>;
  findUnique(args: Record<string, unknown>): Promise<unknown | null>;
  count(args: Record<string, unknown>): Promise<number>;
  create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(args: Record<string, unknown>): Promise<unknown>;
}

export interface ListParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  search?: string;
  [key: string]: unknown;
}

export interface ListResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Abstract base class for CRUD section services.
 *
 * Subclasses must provide:
 * - `modelName`: The Prisma model key (e.g., 'dashboardEasyMode')
 * - `entityLabel`: Human-readable name for logs/errors (e.g., 'DashboardEasyMode')
 * - `cachePrefix`: Redis cache key prefix
 * - `cacheTtl`: Cache TTL in seconds (optional, defaults to 300)
 * - `buildSearchWhere(search)`: Search field mapping
 * - `buildFilterWhere(params)`: Additional filters from params
 */
export abstract class BaseCrudService<T = unknown> {
  protected abstract readonly modelName: string;
  protected abstract readonly entityLabel: string;
  protected abstract readonly cachePrefix: string;
  protected readonly cacheTtl: number = 300;

  /**
   * Build the `where` clause for text search.
   * Override in subclass to specify searchable fields.
   */
  protected abstract buildSearchWhere(search: string): Record<string, unknown>;

  /**
   * Build additional `where` filters from list params.
   * Override in subclass to add section-specific filters.
   */
  protected buildFilterWhere(_params: ListParams): Record<string, unknown> {
    return {};
  }

  /**
   * Get the Prisma model delegate.
   */
  protected get model(): PrismaDelegate {
    return (prisma as unknown as Record<string, PrismaDelegate>)[this.modelName];
  }

  async list(params: ListParams): Promise<ListResult<T>> {
    const { page, limit, sortBy = 'createdAt', sortOrder, search } = params;
    const skip = (page - 1) * limit;

    const cacheKey = `${this.cachePrefix}:list:${JSON.stringify(params)}`;
    const cached = await cacheGet<ListResult<T>>(cacheKey);
    if (cached) return cached;

    const where: Record<string, unknown> = {};

    if (search) {
      const searchWhere = this.buildSearchWhere(search);
      Object.assign(where, searchWhere);
    }

    const filterWhere = this.buildFilterWhere(params);
    Object.assign(where, filterWhere);

    const [data, total] = await Promise.all([
      this.model.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.model.count({ where }),
    ]);

    const result: ListResult<T> = {
      data: data as T[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    await cacheSet(cacheKey, result, this.cacheTtl);
    return result;
  }

  async getById(id: string): Promise<T> {
    const cacheKey = `${this.cachePrefix}:${id}`;
    const cached = await cacheGet<T>(cacheKey);
    if (cached) return cached;

    const record = await this.model.findUnique({ where: { id } });
    if (!record) throw new NotFoundError(this.entityLabel, id);

    await cacheSet(cacheKey, record, this.cacheTtl);
    return record as T;
  }

  async create(data: Record<string, unknown>): Promise<T> {
    const record = await this.model.create({ data });
    logger.info(`${this.entityLabel} created`, { id: (record as any).id });
    await cacheDel(`${this.cachePrefix}:list:*`);
    return record as T;
  }

  async update(id: string, data: Record<string, unknown>): Promise<T> {
    await this.getById(id);
    const updated = await this.model.update({ where: { id }, data });
    logger.info(`${this.entityLabel} updated`, { id });
    await Promise.all([
      cacheDel(`${this.cachePrefix}:${id}`),
      cacheDel(`${this.cachePrefix}:list:*`),
    ]);
    return updated as T;
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    await this.getById(id);
    await this.model.delete({ where: { id } });
    logger.info(`${this.entityLabel} deleted`, { id });
    await Promise.all([
      cacheDel(`${this.cachePrefix}:${id}`),
      cacheDel(`${this.cachePrefix}:list:*`),
    ]);
    return { deleted: true };
  }

  async duplicate(id: string): Promise<T> {
    const source = await this.getById(id) as Record<string, unknown>;
    const { id: _id, createdAt, updatedAt, ...rest } = source;
    const record = await this.model.create({
      data: { ...rest, name: `${rest.name} (Copy)` },
    });
    logger.info(`${this.entityLabel} duplicated`, { sourceId: id, newId: (record as any).id });
    await cacheDel(`${this.cachePrefix}:list:*`);
    return record as T;
  }

  /**
   * Invalidate all cache entries for this service.
   */
  protected async invalidateCache(id?: string): Promise<void> {
    const tasks: Promise<void>[] = [cacheDel(`${this.cachePrefix}:list:*`)];
    if (id) {
      tasks.push(cacheDel(`${this.cachePrefix}:${id}`));
    }
    await Promise.all(tasks);
  }
}
