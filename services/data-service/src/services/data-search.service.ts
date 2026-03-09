import { Client as ElasticClient } from '@elastic/elasticsearch';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
const elastic = new ElasticClient({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
});

const DATASET_INDEX = 'rasid_datasets';

export class DataSearchService {

  async fullTextSearch(
    query: string,
    filters?: { format?: string; status?: string },
    pagination?: { page: number; limit: number }
  ): Promise<{
    results: Array<{ id: string; name: string; description: string; score: number; highlights: Record<string, string[]> }>;
    total: number;
    page: number;
    limit: number;
  }> {
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 20;
    const from = (page - 1) * limit;

    logger.info('Full text search', { query, filters, page, limit });

    const mustClauses: Record<string, unknown>[] = [
      {
        multi_match: {
          query,
          fields: ['name^3', 'description^2', 'columns.name', 'dataPreview', 'format'],
          type: 'best_fields',
          fuzziness: 'AUTO',
          operator: 'or',
          minimum_should_match: '60%',
        },
      },
    ];

    const filterClauses: Record<string, unknown>[] = [];
    if (filters?.format) {
      filterClauses.push({ term: { format: filters.format.toLowerCase() } });
    }
    if (filters?.status) {
      filterClauses.push({ term: { status: filters.status.toLowerCase() } });
    }

    const esQuery: Record<string, unknown> = {
      index: DATASET_INDEX,
      body: {
        from,
        size: limit,
        query: {
          bool: {
            must: mustClauses,
            filter: filterClauses,
          },
        },
        highlight: {
          pre_tags: ['<mark>'],
          post_tags: ['</mark>'],
          fields: {
            name: { number_of_fragments: 3 },
            description: { number_of_fragments: 3, fragment_size: 150 },
            'columns.name': { number_of_fragments: 5 },
            dataPreview: { number_of_fragments: 2, fragment_size: 200 },
          },
        },
        _source: ['name', 'description', 'format', 'status', 'rowCount', 'createdAt'],
      },
    };

    const esResponse = await elastic.search(esQuery);
    const hits = esResponse.hits?.hits || [];
    const totalHits = typeof esResponse.hits?.total === 'object'
      ? (esResponse.hits.total as Record<string, unknown>).value
      : esResponse.hits?.total || 0;

    interface ESHit { _id: string; _score: number | null; _source?: Record<string, unknown>; highlight?: Record<string, string[]> }
    const results = (hits as ESHit[]).map((hit) => ({
      id: hit._id as string,
      name: hit._source?.name || '',
      description: hit._source?.description || '',
      score: hit._score || 0,
      highlights: hit.highlight || {},
    }));

    logger.info('Full text search completed', { query, totalHits, returnedCount: results.length });

    return {
      results,
      total: totalHits,
      page,
      limit,
    };
  }

  async filterSearch(
    datasetId: string,
    conditions: Array<{ column: string; operator: string; value: unknown }>
  ): Promise<{ rows: Array<Record<string, unknown>>; matchCount: number; totalRows: number }> {
    logger.info('Filter search within dataset', { datasetId, conditionCount: conditions.length });

    const allRows = await prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
    });

    const totalRows = allRows.length;
    const matchedRows: Array<Record<string, unknown>> = [];

    for (const row of allRows) {
      const data = row.data as Record<string, unknown>;
      let matches = true;

      for (const condition of conditions) {
        const cellValue = data[condition.column];
        const condVal = condition.value;

        switch (condition.operator) {
          case 'eq':
          case '=':
          case '==':
            if (String(cellValue) !== String(condVal)) matches = false;
            break;
          case 'neq':
          case '!=':
            if (String(cellValue) === String(condVal)) matches = false;
            break;
          case 'gt':
          case '>':
            if (parseFloat(cellValue) <= parseFloat(condVal)) matches = false;
            break;
          case 'gte':
          case '>=':
            if (parseFloat(cellValue) < parseFloat(condVal)) matches = false;
            break;
          case 'lt':
          case '<':
            if (parseFloat(cellValue) >= parseFloat(condVal)) matches = false;
            break;
          case 'lte':
          case '<=':
            if (parseFloat(cellValue) > parseFloat(condVal)) matches = false;
            break;
          case 'contains':
            if (!String(cellValue || '').toLowerCase().includes(String(condVal).toLowerCase())) matches = false;
            break;
          case 'startsWith':
            if (!String(cellValue || '').toLowerCase().startsWith(String(condVal).toLowerCase())) matches = false;
            break;
          case 'endsWith':
            if (!String(cellValue || '').toLowerCase().endsWith(String(condVal).toLowerCase())) matches = false;
            break;
          case 'in':
            if (!Array.isArray(condVal) || !condVal.map(String).includes(String(cellValue))) matches = false;
            break;
          case 'isNull':
            if (cellValue !== null && cellValue !== undefined && cellValue !== '') matches = false;
            break;
          case 'isNotNull':
            if (cellValue === null || cellValue === undefined || cellValue === '') matches = false;
            break;
          case 'regex':
            try {
              const regex = new RegExp(String(condVal), 'i');
              if (!regex.test(String(cellValue || ''))) matches = false;
            } catch {
              matches = false;
            }
            break;
          default:
            logger.warn('Unknown operator in filter', { operator: condition.operator });
            matches = false;
        }

        if (!matches) break;
      }

      if (matches) {
        matchedRows.push({ rowIndex: row.rowIndex, ...data });
      }
    }

    logger.info('Filter search completed', { datasetId, matchCount: matchedRows.length, totalRows });

    return {
      rows: matchedRows,
      matchCount: matchedRows.length,
      totalRows,
    };
  }

  async aggregationSearch(
    datasetId: string,
    aggs: Array<{ field: string; type: 'terms' | 'avg' | 'sum' | 'min' | 'max' | 'date_histogram' }>
  ): Promise<Record<string, unknown>> {
    logger.info('Aggregation search', { datasetId, aggCount: aggs.length });

    const aggsBody: Record<string, unknown> = {};

    for (const agg of aggs) {
      const aggName = `${agg.type}_${agg.field}`;

      switch (agg.type) {
        case 'terms':
          aggsBody[aggName] = {
            terms: { field: `data.${agg.field}.keyword`, size: 50 },
          };
          break;
        case 'avg':
          aggsBody[aggName] = {
            avg: { field: `data.${agg.field}` },
          };
          break;
        case 'sum':
          aggsBody[aggName] = {
            sum: { field: `data.${agg.field}` },
          };
          break;
        case 'min':
          aggsBody[aggName] = {
            min: { field: `data.${agg.field}` },
          };
          break;
        case 'max':
          aggsBody[aggName] = {
            max: { field: `data.${agg.field}` },
          };
          break;
        case 'date_histogram':
          aggsBody[aggName] = {
            date_histogram: {
              field: `data.${agg.field}`,
              calendar_interval: 'month',
              format: 'yyyy-MM-dd',
              min_doc_count: 0,
            },
          };
          break;
      }
    }

    const esResponse = await elastic.search({
      index: `${DATASET_INDEX}_rows_${datasetId}`,
      body: {
        size: 0,
        query: { match_all: {} },
        aggs: aggsBody,
      },
    });

    const aggregations = esResponse.aggregations || {};

    const formattedResults: Record<string, unknown> = {};
    for (const agg of aggs) {
      const aggName = `${agg.type}_${agg.field}`;
      const raw = aggregations[aggName] as Record<string, unknown>;

      if (agg.type === 'terms' || agg.type === 'date_histogram') {
        interface AggBucket { key: string; key_as_string?: string; doc_count: number }
        formattedResults[aggName] = {
          buckets: ((raw?.buckets || []) as AggBucket[]).map((b) => ({
            key: b.key_as_string || b.key,
            count: b.doc_count,
          })),
        };
      } else {
        formattedResults[aggName] = { value: raw?.value ?? null };
      }
    }

    logger.info('Aggregation search completed', { datasetId, resultKeys: Object.keys(formattedResults) });
    return formattedResults;
  }

  async suggestSearch(
    prefix: string,
    tenantId: string
  ): Promise<Array<{ text: string; score: number; id: string }>> {
    logger.info('Suggest search', { prefix, tenantId });

    const esResponse = await elastic.search({
      index: DATASET_INDEX,
      body: {
        size: 0,
        suggest: {
          dataset_suggest: {
            prefix,
            completion: {
              field: 'name_suggest',
              size: 10,
              fuzzy: {
                fuzziness: 'AUTO',
                prefix_length: 2,
              },
              contexts: {
                tenantId: [tenantId],
              },
            },
          },
        },
      },
    });

    interface SuggestOption { text?: string; _source?: Record<string, unknown>; _score?: number; _id?: string }
    const suggestResp = esResponse.suggest as Record<string, unknown> | undefined;
    const datasetSuggest = (suggestResp?.dataset_suggest as Array<Record<string, unknown>> | undefined);
    const suggestions = ((datasetSuggest?.[0]?.options || []) as SuggestOption[]);

    const results = suggestions.map((option) => ({
      text: option.text || option._source?.name || '',
      score: option._score || 0,
      id: option._id || '',
    }));

    logger.info('Suggest search completed', { prefix, tenantId, resultCount: results.length });
    return results;
  }

  async indexDataset(datasetId: string): Promise<{ indexed: boolean; documentId: string; rowsIndexed: number }> {
    logger.info('Indexing dataset', { datasetId });

    const dataset = await prisma.dataset.findUnique({
      where: { id: datasetId },
      include: { columns: true },
    });

    if (!dataset) {
      throw new Error(`Dataset ${datasetId} not found`);
    }

    const sampleRows = await prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
      take: 500,
    });

    const dataPreviewStrings = sampleRows.map(r => {
      const data = r.data as Record<string, unknown>;
      return Object.values(data).map(String).join(' ');
    });

    const documentBody: Record<string, unknown> = {
      name: dataset.name,
      description: dataset.description || '',
      format: dataset.format || '',
      status: dataset.status,
      sourceType: dataset.sourceType,
      rowCount: Number(dataset.rowCount || 0),
      columnCount: dataset.columnCount || 0,
      tenantId: dataset.tenantId,
      createdAt: dataset.createdAt.toISOString(),
      columns: dataset.columns.map(c => ({ name: c.name, dataType: c.dataType })),
      dataPreview: dataPreviewStrings.join('\n'),
      name_suggest: {
        input: [dataset.name, ...dataset.name.split(/[\s_-]+/)],
        contexts: { tenantId: [dataset.tenantId] },
      },
    };

    await elastic.index({
      index: DATASET_INDEX,
      id: datasetId,
      body: documentBody,
      refresh: 'wait_for',
    });

    logger.info('Dataset indexed successfully', { datasetId, name: dataset.name, sampleRowCount: sampleRows.length });

    return {
      indexed: true,
      documentId: datasetId,
      rowsIndexed: sampleRows.length,
    };
  }

  async reindexAll(tenantId: string): Promise<{ totalIndexed: number; errors: string[] }> {
    logger.info('Reindexing all datasets for tenant', { tenantId });

    const datasets = await prisma.dataset.findMany({
      where: { tenantId, status: 'active' },
      select: { id: true, name: true },
    });

    let totalIndexed = 0;
    const errors: string[] = [];

    const batchSize = 10;
    for (let i = 0; i < datasets.length; i += batchSize) {
      const batch = datasets.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(ds => this.indexDataset(ds.id))
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result.status === 'fulfilled') {
          totalIndexed++;
        } else {
          const dsName = batch[j].name;
          const errMsg = `Failed to index dataset "${dsName}": ${result.reason?.message || 'Unknown error'}`;
          errors.push(errMsg);
          logger.error(errMsg, { datasetId: batch[j].id });
        }
      }
    }

    logger.info('Reindex all completed', { tenantId, totalIndexed, errorCount: errors.length, totalDatasets: datasets.length });

    return { totalIndexed, errors };
  }
}
