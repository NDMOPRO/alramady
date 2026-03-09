import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { createLogger, format, transports } from 'winston';

const prisma = new PrismaClient();

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  defaultMeta: { service: 'web-intelligence' },
  transports: [new transports.Console({ format: format.combine(format.colorize(), format.simple()) })],
});

interface ScrapeResult {
  id: string;
  url: string;
  title: string;
  content: string;
  extractedData: Record<string, unknown>;
  tables: Array<{ headers: string[]; rows: string[][] }>;
  metadata: Record<string, string>;
  scrapedAt: string;
}

interface MonitorConfig {
  id: string;
  url: string;
  selectors: Record<string, string>;
  frequency: 'hourly' | 'daily' | 'weekly';
  tenantId: string;
  isActive: boolean;
}

interface SnapshotComparison {
  added: Record<string, unknown>;
  removed: Record<string, unknown>;
  changed: Array<{ key: string; before: unknown; after: unknown }>;
  changeCount: number;
}

export class WebIntelligenceService {
  async scrapeUrl(
    url: string,
    selectors: Record<string, string>,
    tenantId: string,
  ): Promise<ScrapeResult> {
    const cheerio = await import('cheerio');
    const jobId = randomUUID();

    logger.info('Scraping URL', { jobId, url, tenantId });

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RasidBot/1.0; +https://rasid.sa/bot)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'Accept-Language': 'ar,en;q=0.9',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    $('script, style, noscript, iframe').remove();

    const title = $('title').text().trim() || $('h1').first().text().trim() || '';
    const content = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 10000);

    const extractedData: Record<string, unknown> = {};
    for (const [key, selector] of Object.entries(selectors)) {
      const elements = $(selector);
      if (elements.length === 0) {
        extractedData[key] = null;
      } else if (elements.length === 1) {
        extractedData[key] = elements.text().trim();
      } else {
        extractedData[key] = elements.map((_: number, el: unknown) => $(el).text().trim()).get();
      }
    }

    const tables = this.extractTablesFromHtml($, cheerio);

    const metadata: Record<string, string> = {};
    $('meta').each((_: number, el: unknown) => {
      const name = $(el).attr('name') || $(el).attr('property') || '';
      const metaContent = $(el).attr('content') || '';
      if (name && metaContent) metadata[name] = metaContent;
    });

    const result: ScrapeResult = {
      id: jobId,
      url,
      title,
      content,
      extractedData,
      tables,
      metadata,
      scrapedAt: new Date().toISOString(),
    };

    await prisma.auditLog.create({
      data: {
        action: 'web_scrape',
        entityType: 'web_intelligence',
        entityId: jobId,
        tenantId,
        details: JSON.stringify({ url, extractedKeys: Object.keys(extractedData), tableCount: tables.length }),
        performedAt: new Date(),
      },
    });

    logger.info('Scrape complete', { jobId, title, tablesFound: tables.length });
    return result;
  }

  async scrapeMultiple(
    urls: string[],
    selectors: Record<string, string>,
    tenantId: string,
  ): Promise<ScrapeResult[]> {
    const results: ScrapeResult[] = [];
    const batchSize = 5;

    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map((url) => this.scrapeUrl(url, selectors, tenantId)),
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          logger.warn('Failed to scrape URL', { error: result.reason });
        }
      }

      if (i + batchSize < urls.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  async monitorUrl(
    url: string,
    selectors: Record<string, string>,
    frequency: 'hourly' | 'daily' | 'weekly',
    tenantId: string,
  ): Promise<MonitorConfig> {
    const monitorId = randomUUID();
    const schedule = frequency === 'hourly' ? '0 * * * *'
      : frequency === 'daily' ? '0 6 * * *'
      : '0 6 * * 1';

    await prisma.scheduledJob.create({
      data: {
        jobId: monitorId,
        name: `web_monitor_${new URL(url).hostname}`,
        jobType: 'web_monitor',
        schedule,
        config: JSON.parse(JSON.stringify({ url, selectors, tenantId })),
        isActive: true,
        createdAt: new Date(),
      },
    });

    const initial = await this.scrapeUrl(url, selectors, tenantId);

    await prisma.jobHistory.create({
      data: {
        jobId: monitorId,
        status: 'completed',
        startedAt: new Date(),
        completedAt: new Date(),
        result: JSON.parse(JSON.stringify(initial.extractedData)),
      },
    });

    logger.info('Web monitoring set up', { monitorId, url, frequency });

    return {
      id: monitorId,
      url,
      selectors,
      frequency,
      tenantId,
      isActive: true,
    };
  }

  async stopMonitoring(monitorId: string): Promise<void> {
    await prisma.scheduledJob.update({
      where: { jobId: monitorId },
      data: { isActive: false },
    });
    logger.info('Web monitoring stopped', { monitorId });
  }

  async getScrapedData(jobId: string): Promise<ScrapeResult | null> {
    const history = await prisma.jobHistory.findFirst({
      where: { jobId },
      orderBy: { startedAt: 'desc' },
    });

    if (!history) return null;

    return {
      id: jobId,
      url: ((history.result as Record<string, unknown>)?.url as string) || '',
      title: ((history.result as Record<string, unknown>)?.title as string) || '',
      content: ((history.result as Record<string, unknown>)?.content as string) || '',
      extractedData: (history.result as Record<string, unknown>) ?? {},
      tables: [],
      metadata: {},
      scrapedAt: history.startedAt.toISOString(),
    };
  }

  async compareSnapshots(
    monitorId: string,
    date1: string,
    date2: string,
  ): Promise<SnapshotComparison> {
    const [snap1, snap2] = await Promise.all([
      prisma.jobHistory.findFirst({
        where: {
          jobId: monitorId,
          startedAt: { gte: new Date(date1), lt: new Date(new Date(date1).getTime() + 86400000) },
        },
      }),
      prisma.jobHistory.findFirst({
        where: {
          jobId: monitorId,
          startedAt: { gte: new Date(date2), lt: new Date(new Date(date2).getTime() + 86400000) },
        },
      }),
    ]);

    const data1 = (snap1?.result as Record<string, unknown>) ?? {};
    const data2 = (snap2?.result as Record<string, unknown>) ?? {};

    const added: Record<string, unknown> = {};
    const removed: Record<string, unknown> = {};
    const changed: Array<{ key: string; before: unknown; after: unknown }> = [];

    const allKeys = new Set([...Object.keys(data1), ...Object.keys(data2)]);
    for (const key of allKeys) {
      if (!(key in data1)) added[key] = data2[key];
      else if (!(key in data2)) removed[key] = data1[key];
      else if (JSON.stringify(data1[key]) !== JSON.stringify(data2[key])) {
        changed.push({ key, before: data1[key], after: data2[key] });
      }
    }

    return {
      added,
      removed,
      changed,
      changeCount: Object.keys(added).length + Object.keys(removed).length + changed.length,
    };
  }

  async extractTables(url: string, tenantId: string): Promise<Array<{ headers: string[]; rows: string[][] }>> {
    const cheerio = await import('cheerio');

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RasidBot/1.0)' },
      signal: AbortSignal.timeout(30000),
    });

    const html = await response.text();
    const $ = cheerio.load(html);
    return this.extractTablesFromHtml($, cheerio);
  }

  async searchWeb(
    query: string,
    tenantId: string,
  ): Promise<Array<{ title: string; url: string; snippet: string }>> {
    const searchApiKey = process.env.SEARCH_API_KEY;
    const searchEngineId = process.env.SEARCH_ENGINE_ID;

    if (!searchApiKey || !searchEngineId) {
      throw new Error('Search API not configured. Set SEARCH_API_KEY and SEARCH_ENGINE_ID.');
    }

    const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${searchApiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}&num=10`;

    const response = await fetch(searchUrl, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Search API error: ${response.status}`);

    const data = await response.json() as {
      items?: Array<{ title: string; link: string; snippet: string }>;
    };

    await prisma.auditLog.create({
      data: {
        action: 'web_search',
        entityType: 'web_intelligence',
        entityId: randomUUID(),
        tenantId,
        details: JSON.stringify({ query, resultCount: data.items?.length || 0 }),
        performedAt: new Date(),
      },
    });

    return (data.items || []).map((item) => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet,
    }));
  }

  private extractTablesFromHtml($: ReturnType<typeof import('cheerio')['load']>, cheerio: typeof import('cheerio')): Array<{ headers: string[]; rows: string[][] }> {
    const tables: Array<{ headers: string[]; rows: string[][] }> = [];

    $('table').each((_: number, table: unknown) => {
      const headers: string[] = [];
      $(table).find('thead th, tr:first-child th').each((_: number, th: unknown) => {
        headers.push($(th).text().trim());
      });

      if (headers.length === 0) {
        $(table).find('tr:first-child td').each((_: number, td: unknown) => {
          headers.push($(td).text().trim());
        });
      }

      const rows: string[][] = [];
      const startRow = headers.length > 0 ? 1 : 0;
      $(table).find('tr').each((idx: number, tr: unknown) => {
        if (idx < startRow) return;
        const row: string[] = [];
        $(tr).find('td, th').each((_: number, cell: unknown) => {
          row.push($(cell).text().trim());
        });
        if (row.length > 0 && row.some((c) => c !== '')) rows.push(row);
      });

      if (headers.length > 0 || rows.length > 0) {
        tables.push({ headers, rows });
      }
    });

    return tables;
  }
}

export const webIntelligenceService = new WebIntelligenceService();
