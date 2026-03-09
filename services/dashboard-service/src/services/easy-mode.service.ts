import { prisma } from '../utils/prisma';
import { cacheDel } from '../utils/redis';
import { BaseCrudService, ListParams } from './base/base-crud.service';

export class EasyModeService extends BaseCrudService {
  protected readonly modelName = 'dashboardEasyMode';
  protected readonly entityLabel = 'DashboardEasyMode';
  protected readonly cachePrefix = 'dashboard:easy-mode';
  protected readonly cacheTtl = 300;

  protected buildSearchWhere(search: string) {
    return {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ],
    };
  }

  protected buildFilterWhere(params: ListParams) {
    const where: Record<string, unknown> = {};
    if (params.dashboardType) where.dashboardType = params.dashboardType;
    return where;
  }

  async publish(id: string) {
    const updated = await prisma.dashboardEasyMode.update({
      where: { id },
      data: { isPublic: true },
    });
    await this.invalidateCache(id);
    return updated;
  }
}

export const easyModeService = new EasyModeService();
