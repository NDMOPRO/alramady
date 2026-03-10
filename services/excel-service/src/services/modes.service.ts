import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { NotFoundError } from '../middleware/errorHandler';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';

const CACHE_PREFIX = 'excel-modes';
const CACHE_TTL = 300;

export interface ListModesParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  search?: string;
  workbookId?: string;
  tenantId?: string;
}

import type { ModeName, DetailLevel, ModeFeature, ModeDetectionResult, FileComplexity, DragDropOperation } from '../types/modes.types.js';

export class ModesService {
  async list(params: ListModesParams) {
    const { page, limit, sortBy = 'createdAt', sortOrder, search, workbookId, tenantId } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
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

    const sheetsJson: Record<string, any> = ((workbook as any).sheetsJson as Record<string, any>) || {};
    const modeData = {
      ...workbook,
      currentMode: sheetsJson._modeConfig?.currentMode || 'easy',
      modeConfig: sheetsJson._modeConfig || {},
    };

    await cacheSet(cacheKey, modeData, CACHE_TTL);
    return modeData;
  }

  async create(data: {
    tenant_id: string;
    dataset_id?: string;
    name: string;
    sheets_json?: unknown;
    formulas_json?: unknown;
    created_by: string;
  }) {
    const defaultModeConfig = {
      _modeConfig: {
        currentMode: 'easy',
        easy: {
          enabledFeatures: ['basic-formatting', 'simple-formulas', 'auto-save'],
          toolbarLayout: { simplified: true, groupCount: 3 },
          ribbonConfig: { compact: true },
          shortcutsEnabled: true,
          autoSave: true,
          autoSaveInterval: 30,
        },
        advanced: {
          enabledFeatures: [
            'basic-formatting', 'advanced-formatting', 'conditional-formatting',
            'simple-formulas', 'complex-formulas', 'array-formulas',
            'pivot-tables', 'macros', 'vba-editor', 'data-validation',
            'auto-save', 'version-history',
          ],
          toolbarLayout: { simplified: false, groupCount: 8 },
          ribbonConfig: { compact: false, customTabs: true },
          shortcutsEnabled: true,
          autoSave: true,
          autoSaveInterval: 15,
        },
      },
    };

    const sheetsJson = {
      ...(data.sheets_json as Record<string, unknown> || {}),
      ...defaultModeConfig,
    };

    const workbook = await prisma.workbook.create({
      data: {
        tenantId: data.tenant_id,
        datasetId: data.dataset_id || null,
        name: data.name,
        sheetsJson: sheetsJson,
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

  async switchMode(workbookId: string, modeName: 'easy' | 'advanced' | 'auto') {
    const workbook = await prisma.workbook.findUnique({ where: { id: workbookId } });
    if (!workbook) {
      throw new NotFoundError('Workbook', workbookId);
    }

    const sheetsJson: Record<string, any> = ((workbook as any).sheetsJson as Record<string, any>) || {};
    if (!sheetsJson._modeConfig) {
      sheetsJson._modeConfig = {};
    }
    sheetsJson._modeConfig.currentMode = modeName;
    sheetsJson._modeConfig.lastSwitchedAt = new Date().toISOString();

    const updated = await prisma.workbook.update({
      where: { id: workbookId },
      data: { sheetsJson: sheetsJson as Prisma.InputJsonValue },
    });

    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${workbookId}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);

    return {
      workbook: updated,
      currentMode: modeName,
    };
  }

  async getModeConfig(workbookId: string) {
    const workbook = await prisma.workbook.findUnique({ where: { id: workbookId } });
    if (!workbook) {
      throw new NotFoundError('Workbook', workbookId);
    }

    const sheetsJson: Record<string, any> = ((workbook as any).sheetsJson as Record<string, any>) || {};
    const modeConfig = sheetsJson._modeConfig || {
      currentMode: 'easy',
      easy: { enabledFeatures: [] },
      advanced: { enabledFeatures: [] },
    };

    return modeConfig;
  }

  async detectRecommendedMode(workbookId: string): Promise<ModeDetectionResult> {
    const workbook = await prisma.workbook.findUnique({ where: { id: workbookId } });
    if (!workbook) {
      throw new NotFoundError('Workbook', workbookId);
    }

    const sheetsJson: Record<string, any> = ((workbook as any).sheetsJson as Record<string, any>) || {};
    const complexity = this.analyzeFileComplexity(sheetsJson);
    const reasons: string[] = [];
    let recommendedMode: ModeName = 'easy';

    if (complexity.score > 60) {
      recommendedMode = 'advanced';
      if (complexity.formulaCount > 50) reasons.push('High formula count');
      if (complexity.uniqueFunctionCount > 10) reasons.push('Many unique functions used');
      if (complexity.pivotTableCount > 0) reasons.push('Contains pivot tables');
      if (complexity.macroCount > 0) reasons.push('Contains macros');
    } else {
      reasons.push('Simple structure suitable for easy mode');
    }

    return {
      recommendedMode,
      confidence: Math.min(complexity.score / 100, 0.99),
      reasons,
      fileComplexity: complexity,
    };
  }

  getAvailableFeatures(mode: string): ModeFeature[] {
    const allFeatures: ModeFeature[] = [
      { id: 'basic-formatting', name: 'Basic Formatting', description: 'Font, color, borders', category: 'formatting', availableIn: ['easy', 'advanced', 'auto'], enabled: true },
      { id: 'simple-formulas', name: 'Simple Formulas', description: 'SUM, AVERAGE, COUNT, IF', category: 'formulas', availableIn: ['easy', 'advanced', 'auto'], enabled: true },
      { id: 'auto-save', name: 'Auto Save', description: 'Automatic saving', category: 'general', availableIn: ['easy', 'advanced', 'auto'], enabled: true },
      { id: 'advanced-formatting', name: 'Advanced Formatting', description: 'Conditional formatting, themes', category: 'formatting', availableIn: ['advanced', 'auto'], enabled: true },
      { id: 'complex-formulas', name: 'Complex Formulas', description: 'VLOOKUP, INDEX/MATCH, financial', category: 'formulas', availableIn: ['advanced', 'auto'], enabled: true },
      { id: 'array-formulas', name: 'Array Formulas', description: 'Dynamic arrays, SORT, FILTER, UNIQUE', category: 'formulas', availableIn: ['advanced', 'auto'], enabled: true },
      { id: 'pivot-tables', name: 'Pivot Tables', description: 'Pivot table creation', category: 'analysis', availableIn: ['advanced', 'auto'], enabled: true },
      { id: 'macros', name: 'Macros', description: 'Macro recording and playback', category: 'automation', availableIn: ['advanced'], enabled: true },
      { id: 'data-validation', name: 'Data Validation', description: 'Input validation rules', category: 'data', availableIn: ['advanced', 'auto'], enabled: true },
      { id: 'charts', name: 'Charts', description: 'Chart creation', category: 'visualization', availableIn: ['easy', 'advanced', 'auto'], enabled: true },
      { id: 'cultural-formatting', name: 'Cultural Formatting', description: 'RTL, Arabic fonts, locale formats', category: 'formatting', availableIn: ['easy', 'advanced', 'auto'], enabled: true },
      { id: 'professional-themes', name: 'Professional Themes', description: 'Theme presets and brand identity', category: 'formatting', availableIn: ['easy', 'advanced', 'auto'], enabled: true },
      { id: 'version-history', name: 'Version History', description: 'Track changes over time', category: 'general', availableIn: ['advanced', 'auto'], enabled: true },
    ];

    if (mode === 'auto') return allFeatures;
    return allFeatures.filter((f) => f.availableIn.includes(mode as ModeName));
  }

  async selectDetailLevel(workbookId: string, level: DetailLevel) {
    const workbook = await prisma.workbook.findUnique({ where: { id: workbookId } });
    if (!workbook) {
      throw new NotFoundError('Workbook', workbookId);
    }

    const sheetsJson: Record<string, any> = ((workbook as any).sheetsJson as Record<string, any>) || {};
    if (!sheetsJson._modeConfig) sheetsJson._modeConfig = { currentMode: 'easy' };
    sheetsJson._modeConfig.detailLevel = level;
    sheetsJson._modeConfig.detailLevelUpdatedAt = new Date().toISOString();

    const updated = await prisma.workbook.update({
      where: { id: workbookId },
      data: { sheetsJson: sheetsJson as Prisma.InputJsonValue },
    });

    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${workbookId}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);

    return { workbook: updated, detailLevel: level };
  }

  async dragAndDropReorder(workbookId: string, operation: DragDropOperation) {
    const workbook = await prisma.workbook.findUnique({ where: { id: workbookId } });
    if (!workbook) {
      throw new NotFoundError('Workbook', workbookId);
    }

    const sheetsJson: Record<string, any> = ((workbook as any).sheetsJson as Record<string, any>) || {};

    if (operation.type === 'sheet' && Array.isArray(sheetsJson.sheets)) {
      const sheets = sheetsJson.sheets;
      if (operation.sourceIndex >= 0 && operation.sourceIndex < sheets.length &&
          operation.targetIndex >= 0 && operation.targetIndex < sheets.length) {
        const [moved] = sheets.splice(operation.sourceIndex, 1);
        sheets.splice(operation.targetIndex, 0, moved);
        sheetsJson.sheets = sheets;
      }
    }

    const updated = await prisma.workbook.update({
      where: { id: workbookId },
      data: { sheetsJson: sheetsJson as Prisma.InputJsonValue },
    });

    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${workbookId}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);

    return { workbook: updated, operation };
  }

  private analyzeFileComplexity(sheetsJson: Record<string, any>): FileComplexity {
    let formulaCount = 0;
    const uniqueFunctions = new Set<string>();
    let sheetCount = 0;
    let chartCount = 0;
    let pivotTableCount = 0;
    let conditionalFormatCount = 0;
    let macroCount = 0;

    const sheets = sheetsJson.sheets as Record<string, unknown>[] | undefined;
    if (Array.isArray(sheets)) {
      sheetCount = sheets.length;
      for (const sheet of sheets) {
        if (sheet.cells) {
          for (const cellData of Object.values(sheet.cells as Record<string, unknown>)) {
            const data = cellData as Record<string, unknown> | null;
            if (data?.formula) {
              formulaCount++;
              const funcMatch = String(data.formula).match(/[A-Z]+\(/gi);
              if (funcMatch) {
                for (const fn of funcMatch) {
                  uniqueFunctions.add(fn.replace('(', '').toUpperCase());
                }
              }
            }
          }
        }
        if (Array.isArray(sheet.charts)) chartCount += sheet.charts.length;
        if (Array.isArray(sheet.pivotTables)) pivotTableCount += sheet.pivotTables.length;
        if (Array.isArray(sheet.conditionalFormats)) conditionalFormatCount += sheet.conditionalFormats.length;
      }
    }

    const macros = sheetsJson._macros as unknown[] | undefined;
    if (Array.isArray(macros)) macroCount = macros.length;

    const score =
      Math.min(formulaCount * 0.5, 30) +
      Math.min(uniqueFunctions.size * 3, 20) +
      Math.min(sheetCount * 5, 15) +
      (chartCount > 0 ? 10 : 0) +
      (pivotTableCount > 0 ? 15 : 0) +
      Math.min(conditionalFormatCount * 2, 10) +
      (macroCount > 0 ? 20 : 0);

    let level: FileComplexity['level'] = 'simple';
    if (score > 70) level = 'expert';
    else if (score > 45) level = 'complex';
    else if (score > 20) level = 'moderate';

    return {
      formulaCount,
      uniqueFunctionCount: uniqueFunctions.size,
      sheetCount,
      chartCount,
      pivotTableCount,
      conditionalFormatCount,
      macroCount,
      score: Math.round(score),
      level,
    };
  }

  async updateModeConfig(
    workbookId: string,
    modeName: 'easy' | 'advanced',
    config: Record<string, unknown>
  ) {
    const workbook = await prisma.workbook.findUnique({ where: { id: workbookId } });
    if (!workbook) {
      throw new NotFoundError('Workbook', workbookId);
    }

    const sheetsJson: Record<string, any> = ((workbook as any).sheetsJson as Record<string, any>) || {};
    if (!sheetsJson._modeConfig) {
      sheetsJson._modeConfig = { currentMode: 'easy' };
    }
    sheetsJson._modeConfig[modeName] = {
      ...sheetsJson._modeConfig[modeName],
      ...config,
      updatedAt: new Date().toISOString(),
    };

    const updated = await prisma.workbook.update({
      where: { id: workbookId },
      data: { sheetsJson: sheetsJson as Prisma.InputJsonValue },
    });

    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${workbookId}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);

    return updated;
  }
}

export const modesService = new ModesService();
