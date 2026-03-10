import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { createLogger, format, transports } from 'winston';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
const prisma = new PrismaClient();

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  defaultMeta: { service: 'competitor-research' },
  transports: [new transports.Console({ format: format.combine(format.colorize(), format.simple()) })],
});

interface CompetitorProfile {
  id: string;
  name: string;
  domain: string;
  industry: string;
  metrics: Record<string, any>;
  lastUpdated: string;
}

interface ResearchResult {
  id: string;
  tenantId: string;
  competitors: CompetitorProfile[];
  analysis: CompetitorAnalysis;
  benchmarks: BenchmarkResult[];
  recommendations: string[];
  createdAt: string;
}

interface CompetitorAnalysis {
  strengths: Array<{ competitor: string; strength: string; impact: string }>;
  weaknesses: Array<{ competitor: string; weakness: string; opportunity: string }>;
  threats: Array<{ competitor: string; threat: string; severity: string }>;
  opportunities: Array<{ description: string; confidence: number }>;
  marketPosition: string;
}

interface BenchmarkResult {
  metric: string;
  yourValue: number;
  industryAverage: number;
  bestInClass: number;
  percentile: number;
  trend: 'improving' | 'stable' | 'declining';
}

interface WebScrapedData {
  url: string;
  title: string;
  content: string;
  extractedData: Record<string, any>;
  scrapedAt: string;
}

interface MonitorConfig {
  competitorName: string;
  url: string;
  selectors: Record<string, string>;
  frequency: 'hourly' | 'daily' | 'weekly';
  tenantId: string;
}

export class CompetitorResearchService {
  async scrapeCompetitorData(url: string, selectors: Record<string, string>, tenantId: string): Promise<WebScrapedData> {
    const cheerio = await import('cheerio');

    logger.info('Scraping competitor data', { url, tenantId });

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RasidBot/1.0; +https://rasid.sa/bot)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ar,en;q=0.9',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const title = $('title').text().trim() || $('h1').first().text().trim() || '';
    const metaDesc = $('meta[name="description"]').attr('content') || '';

    const extractedData: Record<string, any> = {};
    for (const [key, selector] of Object.entries(selectors)) {
      const elements = $(selector);
      if (elements.length === 1) {
        extractedData[key] = elements.text().trim();
      } else if (elements.length > 1) {
        extractedData[key] = elements.map((_: number, el: unknown) => $(el).text().trim()).get();
      }
    }

    const bodyText = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 5000);

    const result: WebScrapedData = {
      url,
      title,
      content: bodyText,
      extractedData: {
        ...extractedData,
        metaDescription: metaDesc,
        headings: $('h1, h2, h3').map((_: number, el: unknown) => $(el).text().trim()).get().slice(0, 20),
        links: $('a[href]').map((_: number, el: unknown) => ({
          text: $(el).text().trim(),
          href: $(el).attr('href'),
        })).get().slice(0, 50),
        images: $('img').length,
        tables: $('table').length,
      },
      scrapedAt: new Date().toISOString(),
    };

    await prisma.auditLog.create({
      data: {
        action: 'competitor_scrape',
        entityType: 'research' as any,
        entityId: url,
        tenantId,
        details: JSON.stringify({ url, dataKeys: Object.keys(extractedData) }),
        performedAt: new Date(),
      } as any,
    });

    return result;
  }

  async extractTableData(url: string, tenantId: string): Promise<Array<{ headers: string[]; rows: string[][] }>> {
    const cheerio = await import('cheerio');

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RasidBot/1.0)' },
      signal: AbortSignal.timeout(30000),
    });

    const html = await response.text();
    const $ = cheerio.load(html);
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
        if (row.length > 0) rows.push(row);
      });

      if (headers.length > 0 || rows.length > 0) {
        tables.push({ headers, rows });
      }
    });

    return tables;
  }

  async analyzeCompetitors(
    competitorData: Array<{ name: string; data: Record<string, any> }>,
    yourMetrics: Record<string, number>,
    industry: string,
    tenantId: string,
  ): Promise<ResearchResult> {
    const researchId = randomUUID();
    logger.info('Analyzing competitors', { researchId, competitorCount: competitorData.length });

    const prompt = `You are a competitive intelligence analyst specializing in the Saudi market.

Industry: ${industry}

Your company metrics:
${JSON.stringify(yourMetrics, null, 2)}

Competitor data:
${competitorData.map((c) => `${c.name}: ${JSON.stringify(c.data)}`).join('\n')}

Analyze and provide a comprehensive competitive analysis. Respond in JSON:
{
  "analysis": {
    "strengths": [{ "competitor": "name", "strength": "detail", "impact": "high|medium|low" }],
    "weaknesses": [{ "competitor": "name", "weakness": "detail", "opportunity": "how to exploit" }],
    "threats": [{ "competitor": "name", "threat": "detail", "severity": "high|medium|low" }],
    "opportunities": [{ "description": "detail", "confidence": 0.8 }],
    "marketPosition": "summary of market position"
  },
  "recommendations": ["actionable recommendation 1", "recommendation 2"]
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('Empty AI response');

    const parsed: {
      analysis: CompetitorAnalysis;
      recommendations: string[];
    } = JSON.parse(content);

    const competitors: CompetitorProfile[] = competitorData.map((c) => ({
      id: randomUUID(),
      name: c.name,
      domain: (c.data.domain as string) || '',
      industry,
      metrics: c.data,
      lastUpdated: new Date().toISOString(),
    }));

    const benchmarks: BenchmarkResult[] = [];
    for (const [metric, value] of Object.entries(yourMetrics)) {
      const competitorValues = competitorData
        .map((c) => Number(c.data[metric]) || 0)
        .filter((v) => v > 0);

      if (competitorValues.length === 0) continue;

      const allValues = [...competitorValues, value].sort((a, b) => a - b);
      const avg = competitorValues.reduce((s, v) => s + v, 0) / competitorValues.length;
      const best = Math.max(...competitorValues);
      const rank = allValues.indexOf(value);
      const percentile = ((rank + 1) / allValues.length) * 100;

      benchmarks.push({
        metric,
        yourValue: value,
        industryAverage: avg,
        bestInClass: best,
        percentile,
        trend: value > avg * 1.1 ? 'improving' : value < avg * 0.9 ? 'declining' : 'stable',
      });
    }

    await prisma.auditLog.create({
      data: {
        action: 'competitor_analysis_complete',
        entityType: 'research' as any,
        entityId: researchId,
        tenantId,
        details: JSON.stringify({
          competitorCount: competitors.length,
          benchmarkCount: benchmarks.length,
          recommendationCount: parsed.recommendations.length,
        }),
        performedAt: new Date(),
      } as any,
    });

    return {
      id: researchId,
      tenantId,
      competitors,
      analysis: parsed.analysis,
      benchmarks,
      recommendations: parsed.recommendations,
      createdAt: new Date().toISOString(),
    };
  }

  async setupMonitoring(config: MonitorConfig): Promise<{ monitorId: string; status: string }> {
    const monitorId = randomUUID();

    await prisma.scheduledJob.create({
      data: {
        jobId: monitorId,
        name: `competitor_monitor_${config.competitorName}`,
        jobType: 'competitor_monitor',
        schedule: config.frequency === 'hourly' ? '0 * * * *'
          : config.frequency === 'daily' ? '0 6 * * *'
          : '0 6 * * 1',
        config: JSON.parse(JSON.stringify({
          url: config.url,
          selectors: config.selectors,
          competitorName: config.competitorName,
          tenantId: config.tenantId,
        })),
        isActive: true,
        createdAt: new Date(),
      } as any,
    });

    logger.info('Competitor monitoring setup', { monitorId, url: config.url, frequency: config.frequency });

    return { monitorId, status: 'active' };
  }

  async stopMonitoring(monitorId: string): Promise<void> {
    await prisma.scheduledJob.update({
      where: { jobId: monitorId } as any,
      data: { isActive: false } as any,
    });
    logger.info('Competitor monitoring stopped', { monitorId });
  }

  async getMonitoringHistory(monitorId: string, limit: number = 50): Promise<Array<{
    scrapedAt: string;
    dataSnapshot: Record<string, any>;
    changesDetected: number;
  }>> {
    const history = await prisma.jobHistory.findMany({
      where: { jobId: monitorId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });

    return history.map((h) => ({
      scrapedAt: h.startedAt?.toISOString() ?? new Date().toISOString(),
      dataSnapshot: ((h as any).result as Record<string, any>) ?? {},
      changesDetected: (((h as any).result as Record<string, any>)?.changesDetected as number) ?? 0,
    }));
  }

  async compareSnapshots(
    monitorId: string,
    date1: string,
    date2: string,
  ): Promise<{
    added: Record<string, any>;
    removed: Record<string, any>;
    changed: Array<{ key: string; before: unknown; after: unknown }>;
  }> {
    const [snap1, snap2] = await Promise.all([
      prisma.jobHistory.findFirst({
        where: { jobId: monitorId, startedAt: { gte: new Date(date1), lt: new Date(new Date(date1).getTime() + 86400000) } },
      }),
      prisma.jobHistory.findFirst({
        where: { jobId: monitorId, startedAt: { gte: new Date(date2), lt: new Date(new Date(date2).getTime() + 86400000) } },
      }),
    ]);

    const data1 = ((snap1 as any)?.result as Record<string, any>) ?? {};
    const data2 = ((snap2 as any)?.result as Record<string, any>) ?? {};

    const added: Record<string, any> = {};
    const removed: Record<string, any> = {};
    const changed: Array<{ key: string; before: unknown; after: unknown }> = [];

    const allKeys = new Set([...Object.keys(data1), ...Object.keys(data2)]);
    for (const key of allKeys) {
      if (!(key in data1)) {
        added[key] = data2[key];
      } else if (!(key in data2)) {
        removed[key] = data1[key];
      } else if (JSON.stringify(data1[key]) !== JSON.stringify(data2[key])) {
        changed.push({ key, before: data1[key], after: data2[key] });
      }
    }

    return { added, removed, changed };
  }
}

export const competitorResearchService = new CompetitorResearchService();
