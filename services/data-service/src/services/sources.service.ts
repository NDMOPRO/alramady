import { PrismaClient } from '@prisma/client';
import { Client as ElasticClient } from '@elastic/elasticsearch';
import { Parser as Json2CsvParser } from '@json2csv/plainjs';
import ExcelJS from 'exceljs';
import * as archiver from 'archiver';
import { Writable, PassThrough } from 'stream';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
const elastic = new ElasticClient({ node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200' });

export class SourcesService {

  async listDatasets(tenantId: string, options: { page?: number; limit?: number; search?: string; format?: string; sortBy?: string; sortDir?: 'asc' | 'desc' }) {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: Record<string, any> = { tenantId, status: 'active' };
    if (options.format) where.format = options.format;
    if (options.search) {
      where.OR = [
        { name: { contains: options.search, mode: 'insensitive' } },
        { description: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    const [datasets, total] = await Promise.all([
      prisma.dataset.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [options.sortBy || 'createdAt']: options.sortDir || 'desc' },
        include: { columns: true, _count: { select: { dataRows: true } } },
      }),
      prisma.dataset.count({ where }),
    ]);

    return {
      data: datasets.map(d => ({
        ...d,
        sizeBytes: Number(d.sizeBytes),
        rowCount: Number(d.rowCount),
        actualRowCount: d._count.dataRows,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getDataset(datasetId: string, tenantId: string) {
    const dataset = await prisma.dataset.findFirst({
      where: { id: datasetId, tenantId },
      include: { columns: { orderBy: { position: 'asc' } }, _count: { select: { dataRows: true } } },
    });
    if (!dataset) throw new Error('Dataset not found');
    return { ...dataset, sizeBytes: Number(dataset.sizeBytes), rowCount: Number(dataset.rowCount) };
  }

  async getDatasetRows(datasetId: string, tenantId: string, options: { page?: number; limit?: number; sortBy?: string; sortDir?: 'asc' | 'desc'; filters?: Record<string, any> }) {
    const dataset = await prisma.dataset.findFirst({ where: { id: datasetId, tenantId } });
    if (!dataset) throw new Error('Dataset not found');

    const page = options.page || 1;
    const limit = Math.min(options.limit || 50, 500);
    const skip = (page - 1) * limit;

    const rows = await prisma.dataRow.findMany({
      where: { datasetId },
      skip,
      take: limit,
      orderBy: { rowIndex: 'asc' },
    });

    let filteredRows = rows;
    if (options.filters && Object.keys(options.filters).length > 0) {
      filteredRows = rows.filter(row => {
        const data = row.data as Record<string, any>;
        return Object.entries(options.filters!).every(([key, value]) => {
          if (typeof value === 'string') return String(data[key] ?? '').toLowerCase().includes(value.toLowerCase());
          return data[key] === value;
        });
      });
    }

    const total = await prisma.dataRow.count({ where: { datasetId } });

    return {
      data: filteredRows.map(r => ({ rowIndex: r.rowIndex, ...(r.data as Record<string, any>) })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async deleteDataset(datasetId: string, tenantId: string) {
    const dataset = await prisma.dataset.findFirst({ where: { id: datasetId, tenantId } });
    if (!dataset) throw new Error('Dataset not found');

    await prisma.dataset.update({ where: { id: datasetId }, data: { status: 'deleted' } });

    try {
      await elastic.delete({ index: 'rasid-datasets', id: datasetId });
    } catch (e) {
      logger.warn('Failed to remove from Elasticsearch', { datasetId, error: e });
    }

    return { id: datasetId, status: 'deleted' };
  }

  async exportCSV(datasetId: string, tenantId: string, options: { delimiter?: string; encoding?: string } = {}) {
    const dataset = await prisma.dataset.findFirst({ where: { id: datasetId, tenantId }, include: { columns: { orderBy: { position: 'asc' } } } });
    if (!dataset) throw new Error('Dataset not found');

    const allRows = await prisma.dataRow.findMany({ where: { datasetId }, orderBy: { rowIndex: 'asc' } });
    const data = allRows.map(r => r.data as Record<string, any>);
    const fields = dataset.columns.map(c => c.name);

    const parser = new Json2CsvParser({ fields, delimiter: options.delimiter || ',' });
    const csv = parser.parse(data);

    return { content: csv, filename: `${dataset.name}.csv`, mimeType: 'text/csv', rowCount: data.length };
  }

  async exportExcel(datasetId: string, tenantId: string) {
    const dataset = await prisma.dataset.findFirst({ where: { id: datasetId, tenantId }, include: { columns: { orderBy: { position: 'asc' } } } });
    if (!dataset) throw new Error('Dataset not found');

    const allRows = await prisma.dataRow.findMany({ where: { datasetId }, orderBy: { rowIndex: 'asc' } });
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Rasid Platform';
    wb.created = new Date();

    const ws = wb.addWorksheet(dataset.name);
    ws.columns = dataset.columns.map(c => ({
      header: c.name,
      key: c.name,
      width: Math.max(c.name.length + 2, 15),
    }));

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, size: 12 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };

    for (const row of allRows) {
      ws.addRow(row.data as Record<string, any>);
    }

    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: allRows.length + 1, column: dataset.columns.length } };

    const buffer = await wb.xlsx.writeBuffer();
    return { content: Buffer.from(buffer), filename: `${dataset.name}.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', rowCount: allRows.length };
  }

  async exportJSON(datasetId: string, tenantId: string, options: { format?: 'json' | 'jsonl' } = {}) {
    const dataset = await prisma.dataset.findFirst({ where: { id: datasetId, tenantId } });
    if (!dataset) throw new Error('Dataset not found');

    const allRows = await prisma.dataRow.findMany({ where: { datasetId }, orderBy: { rowIndex: 'asc' } });
    const data = allRows.map(r => r.data);

    const content = options.format === 'jsonl'
      ? data.map(d => JSON.stringify(d)).join('\n')
      : JSON.stringify(data, null, 2);

    return { content, filename: `${dataset.name}.${options.format || 'json'}`, mimeType: 'application/json', rowCount: data.length };
  }

  async searchDatasets(tenantId: string, query: string) {
    try {
      const result = await elastic.search({
        index: 'rasid-datasets',
        query: {
          bool: {
            must: [
              { match: { tenantId } },
              { multi_match: { query, fields: ['name^3', 'columns^2'], fuzziness: 'AUTO' } },
            ],
          },
        },
        size: 20,
      });

      return {
        hits: result.hits.hits.map((hit: Record<string, any>) => ({ id: hit._id, score: hit._score, ...(hit._source as Record<string, any>) })),
        total: typeof result.hits.total === 'number' ? result.hits.total : result.hits.total?.value || 0,
      };
    } catch (e) {
      logger.warn('Elasticsearch search failed, falling back to DB search', { error: e });
      return this.listDatasets(tenantId, { search: query });
    }
  }

  async getStatistics(datasetId: string, tenantId: string) {
    const dataset = await prisma.dataset.findFirst({ where: { id: datasetId, tenantId }, include: { columns: true } });
    if (!dataset) throw new Error('Dataset not found');

    const allRows = await prisma.dataRow.findMany({ where: { datasetId }, orderBy: { rowIndex: 'asc' } });
    const data = allRows.map(r => r.data as Record<string, any>);

    const columnStats: Record<string, Record<string, any>> = {};
    for (const col of dataset.columns) {
      const values = data.map(r => r[col.name]).filter(v => v !== null && v !== undefined);
      columnStats[col.name] = {
        type: col.dataType,
        totalCount: data.length,
        nonNullCount: values.length,
        nullCount: data.length - values.length,
        uniqueCount: new Set(values.map(String)).size,
      };

      if (col.dataType === 'integer' || col.dataType === 'float') {
        const nums = values.map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
        if (nums.length > 0) {
          columnStats[col.name].min = nums[0];
          columnStats[col.name].max = nums[nums.length - 1];
          columnStats[col.name].mean = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
          columnStats[col.name].median = nums.length % 2 === 0 ? (nums[nums.length / 2 - 1] + nums[nums.length / 2]) / 2 : nums[Math.floor(nums.length / 2)];
          const variance = nums.reduce((s, n) => s + Math.pow(n - columnStats[col.name].mean, 2), 0) / nums.length;
          columnStats[col.name].stdDev = Math.round(Math.sqrt(variance) * 100) / 100;
        }
      }
    }

    return {
      datasetId,
      name: dataset.name,
      totalRows: data.length,
      totalColumns: dataset.columns.length,
      columns: columnStats,
    };
  }
}

export const sourcesService = new SourcesService();
