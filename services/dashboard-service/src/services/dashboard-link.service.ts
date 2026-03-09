/**
 * Dashboard Link Service — Rasid Platform
 * ربط لوحات المؤشرات وتنفيذ drill-through
 */
import { PrismaClient } from '@prisma/client';

interface FilterMapping {
  sourceField: string;
  targetField: string;
}

interface DashboardLink {
  id: string;
  sourceDashboardId: string;
  targetDashboardId: string;
  triggerWidgetId: string;
  filterMapping: FilterMapping[];
}

interface DrillThroughResult {
  targetDashboardId: string;
  preAppliedFilters: Record<string, unknown>;
}

export class DashboardLinkService {
  constructor(private prisma: PrismaClient) {}

  async linkDashboards(sourceDashboardId: string, targetDashboardId: string, triggerWidgetId: string, filterMapping: FilterMapping[]): Promise<DashboardLink> {
    const link = await this.prisma.dashboardLink.create({
      data: {
        sourceDashboardId,
        targetDashboardId,
        triggerWidgetId,
        filterMapping: JSON.stringify(filterMapping),
        createdAt: new Date(),
      },
    });

    return {
      id: link.id,
      sourceDashboardId,
      targetDashboardId,
      triggerWidgetId,
      filterMapping,
    };
  }

  async getDrillThroughTarget(widgetId: string, selectedValue: unknown): Promise<DrillThroughResult> {
    const link = await this.prisma.dashboardLink.findFirst({
      where: { triggerWidgetId: widgetId },
    });
    if (!link) throw new Error('No drill-through link configured for this widget');

    const mapping: FilterMapping[] = typeof link.filterMapping === 'string' ? JSON.parse(link.filterMapping) : link.filterMapping as FilterMapping[];
    const preAppliedFilters: Record<string, unknown> = {};
    for (const fm of mapping) {
      preAppliedFilters[fm.targetField] = selectedValue;
    }

    return { targetDashboardId: link.targetDashboardId, preAppliedFilters };
  }
}
