/**
 * Cross-filtering Service — Rasid Platform
 * خدمة التصفية المتقاطعة بين عناصر اللوحة
 */
import { PrismaClient } from '@prisma/client';

interface CrossFilterConfig {
  dashboardId: string;
  sourceWidgetId: string;
  targetWidgetIds: string[];
  filterField: string;
}

interface FilteredWidgetData {
  widgetId: string;
  data: Record<string, unknown>[];
  appliedFilter: { field: string; values: unknown[] };
}

export class CrossFilterService {
  constructor(private prisma: PrismaClient) {}

  async registerCrossFilter(dashboardId: string, sourceWidgetId: string, targetWidgetIds: string[], filterField: string): Promise<void> {
    await this.prisma.crossFilterConfig.upsert({
      where: { dashboardId_sourceWidgetId: { dashboardId, sourceWidgetId } },
      create: { dashboardId, sourceWidgetId, targetWidgetIds: JSON.stringify(targetWidgetIds), filterField, createdAt: new Date() },
      update: { targetWidgetIds: JSON.stringify(targetWidgetIds), filterField, updatedAt: new Date() },
    });
  }

  async applyCrossFilter(dashboardId: string, sourceWidgetId: string, selectedValues: unknown[]): Promise<FilteredWidgetData[]> {
    const config = await this.prisma.crossFilterConfig.findFirst({
      where: { dashboardId, sourceWidgetId },
    });
    if (!config) throw new Error('Cross filter config not found');

    const targetIds: string[] = JSON.parse(config.targetWidgetIds as string);
    const results: FilteredWidgetData[] = [];

    for (const widgetId of targetIds) {
      const widget = await this.prisma.dashboardWidget.findUnique({ where: { id: widgetId } });
      if (!widget) continue;

      const rawData = (widget as unknown as Record<string, unknown>).data;
      const widgetData: Record<string, unknown>[] = typeof rawData === 'string' ? JSON.parse(rawData) : (rawData as Record<string, unknown>[]) ?? [];
      const filteredData = widgetData.filter((row) => selectedValues.includes(row[config.filterField]));

      results.push({ widgetId, data: filteredData, appliedFilter: { field: config.filterField, values: selectedValues } });
    }
    return results;
  }

  async clearCrossFilter(dashboardId: string, sourceWidgetId: string): Promise<void> {
    await this.prisma.crossFilterConfig.deleteMany({ where: { dashboardId, sourceWidgetId } });
  }
}
