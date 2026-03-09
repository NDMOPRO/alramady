import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import ExcelJS from 'exceljs';
import { randomUUID } from 'crypto';
import { createLogger, format, transports } from 'winston';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const prisma = new PrismaClient();

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  defaultMeta: { service: 'excel-to-system' },
  transports: [new transports.Console({ format: format.combine(format.colorize(), format.simple()) })],
});

interface TransformationConfig {
  sourceWorkbookId: string;
  targetSystemType: 'dashboard' | 'report' | 'dataset' | 'kpi_registry' | 'workflow';
  mappingRules?: MappingRule[];
  autoDetect?: boolean;
  tenantId: string;
  userId: string;
}

interface MappingRule {
  sourceSheet: string;
  sourceRange?: string;
  targetEntity: string;
  fieldMappings: Array<{
    sourceColumn: string;
    targetField: string;
    transform?: 'none' | 'uppercase' | 'lowercase' | 'trim' | 'number' | 'date' | 'boolean';
  }>;
}

interface TransformationResult {
  id: string;
  status: 'completed' | 'partial' | 'failed';
  sourceWorkbookId: string;
  targetSystemType: string;
  entitiesCreated: number;
  recordsProcessed: number;
  errors: Array<{ row: number; sheet: string; error: string }>;
  createdEntities: Array<{ type: string; id: string; name: string }>;
  processingTimeMs: number;
}

interface SheetAnalysis {
  sheetName: string;
  rowCount: number;
  columnCount: number;
  headers: string[];
  dataTypes: Record<string, string>;
  sampleData: Array<Record<string, unknown>>;
  suggestedTargetType: string;
  confidence: number;
}

export class ExcelToSystemService {
  async analyzeWorkbook(workbookBuffer: Buffer): Promise<SheetAnalysis[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(workbookBuffer);
    const analyses: SheetAnalysis[] = [];

    for (const sheet of workbook.worksheets) {
      const headers: string[] = [];
      const firstRow = sheet.getRow(1);
      for (let col = 1; col <= sheet.columnCount; col++) {
        const cell = firstRow.getCell(col);
        headers.push(String(cell.value || `Column${col}`));
      }

      const dataTypes: Record<string, string> = {};
      const sampleData: Array<Record<string, unknown>> = [];
      const sampleSize = Math.min(sheet.rowCount - 1, 10);

      for (let row = 2; row <= sampleSize + 1; row++) {
        const rowData = sheet.getRow(row);
        const record: Record<string, unknown> = {};
        for (let col = 1; col <= headers.length; col++) {
          const cell = rowData.getCell(col);
          const header = headers[col - 1];
          record[header] = cell.value;

          if (!dataTypes[header] && cell.value !== null && cell.value !== undefined) {
            if (typeof cell.value === 'number') dataTypes[header] = 'number';
            else if (cell.value instanceof Date) dataTypes[header] = 'date';
            else if (typeof cell.value === 'boolean') dataTypes[header] = 'boolean';
            else dataTypes[header] = 'string';
          }
        }
        sampleData.push(record);
      }

      let suggestedTargetType = 'dataset';
      let confidence = 0.6;

      const headerLower = headers.map((h) => h.toLowerCase());
      const hasKpiIndicators = headerLower.some((h) =>
        h.includes('kpi') || h.includes('target') || h.includes('threshold') || h.includes('مؤشر')
      );
      const hasDashboardIndicators = headerLower.some((h) =>
        h.includes('chart') || h.includes('widget') || h.includes('visualization') || h.includes('لوحة')
      );
      const hasWorkflowIndicators = headerLower.some((h) =>
        h.includes('step') || h.includes('stage') || h.includes('workflow') || h.includes('إجراء')
      );
      const hasReportIndicators = headerLower.some((h) =>
        h.includes('section') || h.includes('title') || h.includes('summary') || h.includes('تقرير')
      );

      if (hasKpiIndicators) { suggestedTargetType = 'kpi_registry'; confidence = 0.8; }
      else if (hasDashboardIndicators) { suggestedTargetType = 'dashboard'; confidence = 0.75; }
      else if (hasWorkflowIndicators) { suggestedTargetType = 'workflow'; confidence = 0.7; }
      else if (hasReportIndicators) { suggestedTargetType = 'report'; confidence = 0.7; }

      analyses.push({
        sheetName: sheet.name,
        rowCount: sheet.rowCount - 1,
        columnCount: sheet.columnCount,
        headers,
        dataTypes,
        sampleData,
        suggestedTargetType,
        confidence,
      });
    }

    return analyses;
  }

  async transform(config: TransformationConfig): Promise<TransformationResult> {
    const startTime = Date.now();
    const resultId = randomUUID();
    const errors: Array<{ row: number; sheet: string; error: string }> = [];
    const createdEntities: Array<{ type: string; id: string; name: string }> = [];
    let recordsProcessed = 0;

    logger.info('Starting Excel to system transformation', {
      workbookId: config.sourceWorkbookId,
      targetType: config.targetSystemType,
    });

    const workbookRecord = await prisma.workbook.findUnique({
      where: { id: config.sourceWorkbookId },
    });

    if (!workbookRecord) {
      throw new Error(`Workbook ${config.sourceWorkbookId} not found`);
    }

    const workbookData = workbookRecord.data as Record<string, unknown>;
    const sheets = (workbookData.sheets || []) as Array<{
      name: string;
      headers: string[];
      rows: Array<Array<unknown>>;
    }>;

    for (const sheet of sheets) {
      const mappingRule = config.mappingRules?.find((r) => r.sourceSheet === sheet.name);

      switch (config.targetSystemType) {
        case 'dataset': {
          const dataset = await prisma.dataset.create({
            data: {
              name: `Imported: ${sheet.name}`,
              tenantId: config.tenantId,
              createdBy: config.userId,
              sourceType: 'file',
              format: 'xlsx',
              status: 'active',
              rowCount: sheet.rows.length,
              columnCount: sheet.headers.length,
            },
          });

          for (let ci = 0; ci < sheet.headers.length; ci++) {
            await prisma.datasetColumn.create({
              data: {
                datasetId: dataset.id,
                name: sheet.headers[ci],
                dataType: 'string',
                position: ci,
              },
            });
          }

          for (let ri = 0; ri < sheet.rows.length; ri++) {
            const row = sheet.rows[ri];
            const rowData: Record<string, unknown> = {};
            for (let ci = 0; ci < sheet.headers.length; ci++) {
              let value = row[ci];
              if (mappingRule) {
                const fieldMapping = mappingRule.fieldMappings.find((f) => f.sourceColumn === sheet.headers[ci]);
                if (fieldMapping?.transform) {
                  value = this.applyTransform(value, fieldMapping.transform);
                }
              }
              rowData[sheet.headers[ci]] = value;
            }

            await prisma.dataRow.create({
              data: {
                datasetId: dataset.id,
                rowIndex: ri,
                data: JSON.parse(JSON.stringify(rowData)),
              },
            });
            recordsProcessed++;
          }

          createdEntities.push({ type: 'dataset', id: dataset.id, name: dataset.name });
          break;
        }

        case 'kpi_registry': {
          const nameIdx = sheet.headers.findIndex((h) =>
            h.toLowerCase().includes('name') || h.toLowerCase().includes('kpi') || h.includes('اسم')
          );
          const formulaIdx = sheet.headers.findIndex((h) =>
            h.toLowerCase().includes('formula') || h.toLowerCase().includes('صيغة')
          );
          const targetIdx = sheet.headers.findIndex((h) =>
            h.toLowerCase().includes('target') || h.toLowerCase().includes('threshold') || h.includes('هدف')
          );
          const categoryIdx = sheet.headers.findIndex((h) =>
            h.toLowerCase().includes('category') || h.toLowerCase().includes('تصنيف')
          );

          for (let ri = 0; ri < sheet.rows.length; ri++) {
            const row = sheet.rows[ri];
            const name = String(row[nameIdx >= 0 ? nameIdx : 0] || `KPI_${ri + 1}`);
            const formula = formulaIdx >= 0 ? String(row[formulaIdx] || '') : '';
            const target = targetIdx >= 0 ? Number(row[targetIdx]) || 0 : 0;
            const category = categoryIdx >= 0 ? String(row[categoryIdx] || 'general') : 'general';

            try {
              const kpi = await prisma.kpi.create({
                data: {
                  name,
                  tenantId: config.tenantId,
                  formula,
                  targetValue: target,
                  category,
                  status: 'draft',
                  createdBy: config.userId,
                },
              });
              createdEntities.push({ type: 'kpi', id: kpi.id, name });
              recordsProcessed++;
            } catch (e) {
              errors.push({ row: ri + 2, sheet: sheet.name, error: String(e) });
            }
          }
          break;
        }

        case 'dashboard': {
          const dashboard = await prisma.dashboard.create({
            data: {
              title: `Dashboard: ${sheet.name}`,
              tenantId: config.tenantId,
              createdBy: config.userId,
              visibility: 'private',
              layoutConfig: JSON.parse(JSON.stringify({ columns: 12, rowHeight: 60 })),
            },
          });

          const numericColumns: string[] = [];
          const categoryColumns: string[] = [];

          for (let ci = 0; ci < sheet.headers.length; ci++) {
            const values = sheet.rows.map((r) => r[ci]);
            const isNumeric = values.every((v) => v === null || v === undefined || !isNaN(Number(v)));
            if (isNumeric && values.some((v) => v !== null)) {
              numericColumns.push(sheet.headers[ci]);
            } else {
              categoryColumns.push(sheet.headers[ci]);
            }
          }

          let widgetIdx = 0;
          for (const numCol of numericColumns.slice(0, 4)) {
            const colIdx = sheet.headers.indexOf(numCol);
            const values = sheet.rows.map((r) => Number(r[colIdx]) || 0);
            const sum = values.reduce((s, v) => s + v, 0);
            const avg = values.length > 0 ? sum / values.length : 0;

            await prisma.dashboardWidget.create({
              data: {
                dashboardId: dashboard.id,
                type: 'metric',
                title: numCol,
                config: JSON.parse(JSON.stringify({
                  value: avg.toFixed(2),
                  total: sum.toFixed(2),
                  count: values.length,
                })),
                position: JSON.parse(JSON.stringify({
                  x: (widgetIdx % 4) * 3,
                  y: Math.floor(widgetIdx / 4) * 3,
                  w: 3,
                  h: 3,
                })),
              },
            });
            widgetIdx++;
          }

          if (numericColumns.length > 0 && categoryColumns.length > 0) {
            await prisma.dashboardWidget.create({
              data: {
                dashboardId: dashboard.id,
                type: 'chart',
                title: `${categoryColumns[0]} vs ${numericColumns[0]}`,
                config: JSON.parse(JSON.stringify({
                  chartType: 'bar',
                  xAxis: categoryColumns[0],
                  yAxis: numericColumns[0],
                  dataSource: config.sourceWorkbookId,
                })),
                position: JSON.parse(JSON.stringify({
                  x: 0, y: Math.floor(widgetIdx / 4) * 3 + 3, w: 6, h: 4,
                })),
              },
            });
            widgetIdx++;
          }

          createdEntities.push({ type: 'dashboard', id: dashboard.id, name: dashboard.title });
          recordsProcessed = sheet.rows.length;
          break;
        }

        case 'report': {
          const report = await prisma.report.create({
            data: {
              title: `Report: ${sheet.name}`,
              tenantId: config.tenantId,
              createdBy: config.userId,
              status: 'draft',
              format: 'pdf',
            },
          });

          await prisma.reportSection.create({
            data: {
              reportId: report.id,
              title: 'Data Summary',
              type: 'data',
              content: JSON.parse(JSON.stringify({
                headers: sheet.headers,
                rowCount: sheet.rows.length,
                sampleRows: sheet.rows.slice(0, 20),
              })),
              order: 1,
            },
          });

          createdEntities.push({ type: 'report', id: report.id, name: report.title });
          recordsProcessed = sheet.rows.length;
          break;
        }

        case 'workflow': {
          const stepNameIdx = sheet.headers.findIndex((h) =>
            h.toLowerCase().includes('step') || h.toLowerCase().includes('name') || h.includes('خطوة')
          );
          const actionIdx = sheet.headers.findIndex((h) =>
            h.toLowerCase().includes('action') || h.toLowerCase().includes('إجراء')
          );
          const conditionIdx = sheet.headers.findIndex((h) =>
            h.toLowerCase().includes('condition') || h.toLowerCase().includes('شرط')
          );

          const steps = sheet.rows.map((row, ri) => ({
            name: String(row[stepNameIdx >= 0 ? stepNameIdx : 0] || `Step ${ri + 1}`),
            action: actionIdx >= 0 ? String(row[actionIdx] || 'execute') : 'execute',
            condition: conditionIdx >= 0 ? String(row[conditionIdx] || '') : '',
            order: ri + 1,
          }));

          const workflow = await prisma.workflow.create({
            data: {
              name: `Workflow: ${sheet.name}`,
              tenantId: config.tenantId,
              createdBy: config.userId,
              status: 'draft',
              definition: JSON.parse(JSON.stringify({ steps })),
            },
          });

          createdEntities.push({ type: 'workflow', id: workflow.id, name: workflow.name });
          recordsProcessed = steps.length;
          break;
        }
      }
    }

    const processingTimeMs = Date.now() - startTime;
    const status = errors.length === 0 ? 'completed' : createdEntities.length > 0 ? 'partial' : 'failed';

    logger.info('Transformation complete', {
      resultId,
      status,
      entitiesCreated: createdEntities.length,
      recordsProcessed,
      errors: errors.length,
      processingTimeMs,
    });

    return {
      id: resultId,
      status,
      sourceWorkbookId: config.sourceWorkbookId,
      targetSystemType: config.targetSystemType,
      entitiesCreated: createdEntities.length,
      recordsProcessed,
      errors,
      createdEntities,
      processingTimeMs,
    };
  }

  async autoDetectAndTransform(
    workbookBuffer: Buffer,
    tenantId: string,
    userId: string,
  ): Promise<TransformationResult[]> {
    const analyses = await this.analyzeWorkbook(workbookBuffer);
    const results: TransformationResult[] = [];

    const prompt = `Analyze these Excel sheets and determine the best target system for each:
${analyses.map((a) => `Sheet: "${a.sheetName}", Headers: [${a.headers.join(', ')}], Rows: ${a.rowCount}, Suggested: ${a.suggestedTargetType}`).join('\n')}

Available target systems: dataset, dashboard, kpi_registry, report, workflow

Respond in JSON:
{ "sheets": [{ "sheetName": "...", "targetType": "dataset|dashboard|kpi_registry|report|workflow", "reason": "..." }] }`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('Empty AI response');

    const plan: { sheets: Array<{ sheetName: string; targetType: string }> } = JSON.parse(content);

    for (const sheetPlan of plan.sheets) {
      const targetType = sheetPlan.targetType as TransformationConfig['targetSystemType'];
      if (!['dataset', 'dashboard', 'kpi_registry', 'report', 'workflow'].includes(targetType)) continue;

      const result = await this.transform({
        sourceWorkbookId: randomUUID(),
        targetSystemType: targetType,
        tenantId,
        userId,
        autoDetect: true,
      });
      results.push(result);
    }

    return results;
  }

  private applyTransform(value: unknown, transform: string): unknown {
    if (value === null || value === undefined) return value;
    const str = String(value);
    switch (transform) {
      case 'uppercase': return str.toUpperCase();
      case 'lowercase': return str.toLowerCase();
      case 'trim': return str.trim();
      case 'number': return Number(str) || 0;
      case 'date': return new Date(str).toISOString();
      case 'boolean': return str.toLowerCase() === 'true' || str === '1' || str === 'نعم';
      default: return value;
    }
  }
}

export const excelToSystemService = new ExcelToSystemService();
