import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

// ─── Interfaces ──────────────────────────────────────────────────────
interface SearchRequest {
  query: string;
  filters?: SearchFilter[];
  facets?: string[];
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  highlight?: boolean;
  fuzzy?: boolean;
  boost?: Record<string, number>;
}

interface SearchFilter {
  field: string;
  type: 'term' | 'range' | 'date_range' | 'exists' | 'prefix' | 'wildcard';
  value: unknown;
  operator?: 'and' | 'or' | 'not';
}

interface SearchResult {
  hits: SearchHit[];
  total: number;
  page: number;
  pageSize: number;
  facets: FacetResult[];
  suggestions: string[];
  queryTime: number;
  correctedQuery?: string;
}

interface SearchHit {
  id: string;
  score: number;
  source: Record<string, unknown>;
  highlights: Record<string, string[]>;
  matchedFields: string[];
}

interface FacetResult {
  field: string;
  buckets: FacetBucket[];
  total: number;
}

interface FacetBucket {
  key: string;
  count: number;
  selected: boolean;
}

interface SuggestionRequest {
  prefix: string;
  field: string;
  maxSuggestions: number;
  fuzzyDistance?: number;
  contexts?: Record<string, string>;
}

interface SuggestionResult {
  text: string;
  score: number;
  frequency: number;
  highlighted: string;
}

interface SearchAnalytics {
  queryId: string;
  query: string;
  userId?: string;
  resultCount: number;
  clickedResultId?: string;
  clickPosition?: number;
  queryTime: number;
  timestamp: Date;
  filters: Record<string, unknown>;
}

interface PopularQuery {
  query: string;
  count: number;
  avgResultCount: number;
  avgClickPosition: number;
  lastSearched: Date;
}

interface IndexedDocument {
  id: string;
  title: string;
  content: string;
  description?: string;
  tags: string[];
  category: string;
  fileType?: string;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
  tokens: string[];
  titleTokens: string[];
}

// ─── Service ─────────────────────────────────────────────────────────
export default class SearchEngineService {
  private prisma: PrismaClient;
  private invertedIndex: Map<string, Map<string, number>> = new Map();
  private documentStore: Map<string, IndexedDocument> = new Map();
  private fieldBoosts: Record<string, number> = { title: 3.0, description: 2.0, content: 1.0, tags: 2.5 };
  private queryLog: SearchAnalytics[] = [];
  private suggestionCache: Map<string, SuggestionResult[]> = new Map();
  private readonly STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
    'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'and', 'or', 'not', 'but', 'if', 'then', 'else', 'when', 'up', 'out',
    'no', 'so', 'than', 'too', 'very', 'just', 'about', 'that', 'this',
    'it', 'its', 'my', 'your', 'his', 'her', 'their', 'our', 'we', 'they',
    'في', 'من', 'على', 'إلى', 'عن', 'مع', 'هذا', 'هذه', 'ذلك', 'تلك',
    'الذي', 'التي', 'هو', 'هي', 'هم', 'نحن', 'أنت', 'أنا',
  ]);

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async indexDocument(doc: {
    id: string;
    title: string;
    content: string;
    description?: string;
    tags?: string[];
    category?: string;
    fileType?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const titleTokens = this.tokenize(doc.title);
    const contentTokens = this.tokenize(doc.content);
    const descTokens = doc.description ? this.tokenize(doc.description) : [];
    const tagTokens = (doc.tags || []).flatMap(t => this.tokenize(t));

    const allTokens = [...new Set([...titleTokens, ...contentTokens, ...descTokens, ...tagTokens])];

    const indexed: IndexedDocument = {
      id: doc.id,
      title: doc.title,
      content: doc.content,
      description: doc.description,
      tags: doc.tags || [],
      category: doc.category || 'uncategorized',
      fileType: doc.fileType,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: doc.metadata || {},
      tokens: allTokens,
      titleTokens,
    };

    this.documentStore.set(doc.id, indexed);

    for (const token of titleTokens) {
      this.addToIndex(token, doc.id, this.fieldBoosts.title);
    }
    for (const token of contentTokens) {
      this.addToIndex(token, doc.id, this.fieldBoosts.content);
    }
    for (const token of descTokens) {
      this.addToIndex(token, doc.id, this.fieldBoosts.description);
    }
    for (const token of tagTokens) {
      this.addToIndex(token, doc.id, this.fieldBoosts.tags);
    }

    await this.prisma.searchIndex.upsert({
      where: { documentId: doc.id },
      update: {
        title: doc.title,
        content: doc.content.substring(0, 10000),
        description: doc.description,
        tags: doc.tags || [],
        category: doc.category || 'uncategorized',
        fileType: doc.fileType,
        tokens: allTokens,
        metadata: doc.metadata as Record<string, unknown>,
        updatedAt: new Date(),
      },
      create: {
        id: crypto.randomUUID(),
        documentId: doc.id,
        title: doc.title,
        content: doc.content.substring(0, 10000),
        description: doc.description,
        tags: doc.tags || [],
        category: doc.category || 'uncategorized',
        fileType: doc.fileType,
        tokens: allTokens,
        metadata: doc.metadata as Record<string, unknown>,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  private addToIndex(token: string, docId: string, boost: number): void {
    if (!this.invertedIndex.has(token)) {
      this.invertedIndex.set(token, new Map());
    }
    const docMap = this.invertedIndex.get(token)!;
    const existing = docMap.get(docId) || 0;
    docMap.set(docId, existing + boost);
  }

  private tokenize(text: string): string[] {
    const normalized = text.toLowerCase()
      .replace(/[^\w\u0600-\u06FF\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const words = normalized.split(/\s+/);

    return words
      .filter(w => w.length >= 2 && !this.STOP_WORDS.has(w))
      .map(w => this.stemWord(w));
  }

  private stemWord(word: string): string {
    if (/[\u0600-\u06FF]/.test(word)) {
      let stemmed = word;
      const arabicPrefixes = ['ال', 'و', 'ب', 'ل', 'ف', 'ك'];
      for (const prefix of arabicPrefixes) {
        if (stemmed.startsWith(prefix) && stemmed.length > prefix.length + 2) {
          stemmed = stemmed.substring(prefix.length);
          break;
        }
      }
      return stemmed;
    }

    let stemmed = word;
    if (stemmed.endsWith('ing') && stemmed.length > 5) {
      stemmed = stemmed.slice(0, -3);
    } else if (stemmed.endsWith('tion') && stemmed.length > 6) {
      stemmed = stemmed.slice(0, -4);
    } else if (stemmed.endsWith('ness') && stemmed.length > 6) {
      stemmed = stemmed.slice(0, -4);
    } else if (stemmed.endsWith('ment') && stemmed.length > 6) {
      stemmed = stemmed.slice(0, -4);
    } else if (stemmed.endsWith('ies') && stemmed.length > 4) {
      stemmed = stemmed.slice(0, -3) + 'y';
    } else if (stemmed.endsWith('es') && stemmed.length > 4) {
      stemmed = stemmed.slice(0, -2);
    } else if (stemmed.endsWith('s') && !stemmed.endsWith('ss') && stemmed.length > 3) {
      stemmed = stemmed.slice(0, -1);
    } else if (stemmed.endsWith('ed') && stemmed.length > 4) {
      stemmed = stemmed.slice(0, -2);
    } else if (stemmed.endsWith('ly') && stemmed.length > 4) {
      stemmed = stemmed.slice(0, -2);
    }

    return stemmed;
  }

  async search(request: SearchRequest): Promise<SearchResult> {
    const startTime = Date.now();
    const queryTokens = this.tokenize(request.query);
    const boosts = request.boost || {};

    const documentScores = new Map<string, { score: number; matchedFields: Set<string> }>();

    for (const token of queryTokens) {
      const matchingTokens = request.fuzzy
        ? this.getFuzzyMatches(token, 2)
        : [token];

      for (const matchToken of matchingTokens) {
        const docMap = this.invertedIndex.get(matchToken);
        if (!docMap) continue;

        const idf = Math.log(1 + this.documentStore.size / (1 + docMap.size));

        for (const [docId, tf] of docMap) {
          const existing = documentScores.get(docId) || { score: 0, matchedFields: new Set<string>() };
          const fieldBoost = boosts[matchToken] || 1;
          existing.score += tf * idf * fieldBoost;

          const doc = this.documentStore.get(docId);
          if (doc) {
            if (doc.titleTokens.includes(matchToken)) existing.matchedFields.add('title');
            if (doc.tokens.includes(matchToken)) existing.matchedFields.add('content');
            if (doc.tags.some(t => this.tokenize(t).includes(matchToken))) existing.matchedFields.add('tags');
          }

          documentScores.set(docId, existing);
        }
      }
    }

    let filteredDocs = Array.from(documentScores.entries())
      .map(([docId, data]) => ({
        docId,
        score: data.score,
        matchedFields: data.matchedFields,
      }));

    if (request.filters && request.filters.length > 0) {
      filteredDocs = filteredDocs.filter(entry => {
        const doc = this.documentStore.get(entry.docId);
        if (!doc) return false;
        return this.matchesFilters(doc, request.filters!);
      });
    }

    if (request.sortBy) {
      filteredDocs.sort((a, b) => {
        const docA = this.documentStore.get(a.docId)!;
        const docB = this.documentStore.get(b.docId)!;
        const valA = (docA as Record<string, unknown>)[request.sortBy!] || '';
        const valB = (docB as Record<string, unknown>)[request.sortBy!] || '';
        const cmp = String(valA).localeCompare(String(valB));
        return request.sortOrder === 'desc' ? -cmp : cmp;
      });
    } else {
      filteredDocs.sort((a, b) => b.score - a.score);
    }

    const total = filteredDocs.length;
    const offset = (request.page - 1) * request.pageSize;
    const paginated = filteredDocs.slice(offset, offset + request.pageSize);

    const hits: SearchHit[] = paginated.map(entry => {
      const doc = this.documentStore.get(entry.docId)!;
      const highlights = request.highlight
        ? this.generateHighlights(doc, queryTokens)
        : {};

      return {
        id: entry.docId,
        score: Math.round(entry.score * 10000) / 10000,
        source: {
          title: doc.title,
          description: doc.description,
          category: doc.category,
          fileType: doc.fileType,
          tags: doc.tags,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
          ...doc.metadata,
        },
        highlights,
        matchedFields: Array.from(entry.matchedFields),
      };
    });

    const facets = request.facets
      ? this.computeFacets(filteredDocs.map(d => d.docId), request.facets, request.filters)
      : [];

    const suggestions = this.generateSuggestions(request.query, queryTokens);

    let correctedQuery: string | undefined;
    if (total === 0 && queryTokens.length > 0) {
      correctedQuery = this.suggestCorrection(request.query);
    }

    const queryTime = Date.now() - startTime;

    this.logSearch({
      queryId: crypto.randomUUID(),
      query: request.query,
      resultCount: total,
      queryTime,
      timestamp: new Date(),
      filters: request.filters as unknown as Record<string, unknown> || {},
    });

    return {
      hits,
      total,
      page: request.page,
      pageSize: request.pageSize,
      facets,
      suggestions,
      queryTime,
      correctedQuery,
    };
  }

  private matchesFilters(doc: IndexedDocument, filters: SearchFilter[]): boolean {
    for (const filter of filters) {
      const fieldValue = (doc as Record<string, unknown>)[filter.field] ?? doc.metadata[filter.field];
      const isNot = filter.operator === 'not';
      let matches = false;

      switch (filter.type) {
        case 'term':
          if (Array.isArray(fieldValue)) {
            matches = fieldValue.includes(filter.value);
          } else {
            matches = fieldValue === filter.value;
          }
          break;
        case 'range': {
          const range = filter.value as { min?: number; max?: number };
          const numVal = Number(fieldValue);
          matches = true;
          if (range.min !== undefined && numVal < range.min) matches = false;
          if (range.max !== undefined && numVal > range.max) matches = false;
          break;
        }
        case 'date_range': {
          const dateRange = filter.value as { from?: string; to?: string };
          const dateVal = new Date(String(fieldValue));
          matches = true;
          if (dateRange.from && dateVal < new Date(dateRange.from)) matches = false;
          if (dateRange.to && dateVal > new Date(dateRange.to)) matches = false;
          break;
        }
        case 'exists':
          matches = fieldValue !== null && fieldValue !== undefined;
          break;
        case 'prefix':
          matches = String(fieldValue || '').toLowerCase().startsWith(String(filter.value).toLowerCase());
          break;
        case 'wildcard': {
          const pattern = String(filter.value).replace(/\*/g, '.*').replace(/\?/g, '.');
          const regex = new RegExp(`^${pattern}$`, 'i');
          matches = regex.test(String(fieldValue || ''));
          break;
        }
      }

      if (isNot ? matches : !matches) {
        return false;
      }
    }
    return true;
  }

  private getFuzzyMatches(token: string, maxDistance: number): string[] {
    const matches: string[] = [token];

    for (const indexedToken of this.invertedIndex.keys()) {
      if (indexedToken === token) continue;
      if (Math.abs(indexedToken.length - token.length) > maxDistance) continue;

      const distance = this.levenshteinDistance(token, indexedToken);
      if (distance <= maxDistance) {
        matches.push(indexedToken);
      }
    }

    return matches;
  }

  private levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;

    const dp: number[][] = [];
    for (let i = 0; i <= m; i++) dp[i] = [i];
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[m][n];
  }

  private generateHighlights(
    doc: IndexedDocument,
    queryTokens: string[],
  ): Record<string, string[]> {
    const highlights: Record<string, string[]> = {};

    const titleHighlight = this.highlightText(doc.title, queryTokens);
    if (titleHighlight !== doc.title) {
      highlights.title = [titleHighlight];
    }

    if (doc.description) {
      const descHighlight = this.highlightText(doc.description, queryTokens);
      if (descHighlight !== doc.description) {
        highlights.description = [descHighlight];
      }
    }

    const contentSnippets = this.extractSnippets(doc.content, queryTokens, 3, 100);
    if (contentSnippets.length > 0) {
      highlights.content = contentSnippets;
    }

    return highlights;
  }

  private highlightText(text: string, tokens: string[]): string {
    let highlighted = text;
    for (const token of tokens) {
      const regex = new RegExp(`(${this.escapeRegex(token)}\\w*)`, 'gi');
      highlighted = highlighted.replace(regex, '<em>$1</em>');
    }
    return highlighted;
  }

  private extractSnippets(
    content: string,
    tokens: string[],
    maxSnippets: number,
    snippetLength: number,
  ): string[] {
    const snippets: string[] = [];
    const lowerContent = content.toLowerCase();

    for (const token of tokens) {
      let searchPos = 0;
      while (snippets.length < maxSnippets) {
        const idx = lowerContent.indexOf(token, searchPos);
        if (idx === -1) break;

        const start = Math.max(0, idx - snippetLength / 2);
        const end = Math.min(content.length, idx + token.length + snippetLength / 2);

        let snippet = content.substring(start, end);
        if (start > 0) snippet = '...' + snippet;
        if (end < content.length) snippet = snippet + '...';

        snippet = this.highlightText(snippet, [token]);
        snippets.push(snippet);
        searchPos = idx + token.length;
      }
    }

    return snippets.slice(0, maxSnippets);
  }

  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private computeFacets(
    docIds: string[],
    facetFields: string[],
    activeFilters?: SearchFilter[],
  ): FacetResult[] {
    const results: FacetResult[] = [];

    for (const field of facetFields) {
      const bucketCounts = new Map<string, number>();

      for (const docId of docIds) {
        const doc = this.documentStore.get(docId);
        if (!doc) continue;

        const value = (doc as Record<string, unknown>)[field] ?? doc.metadata[field];
        if (value === null || value === undefined) continue;

        if (Array.isArray(value)) {
          for (const v of value) {
            const key = String(v);
            bucketCounts.set(key, (bucketCounts.get(key) || 0) + 1);
          }
        } else {
          const key = String(value);
          bucketCounts.set(key, (bucketCounts.get(key) || 0) + 1);
        }
      }

      const activeFilterValues = new Set<string>();
      if (activeFilters) {
        for (const filter of activeFilters) {
          if (filter.field === field) {
            activeFilterValues.add(String(filter.value));
          }
        }
      }

      const buckets = Array.from(bucketCounts.entries())
        .map(([key, count]) => ({
          key,
          count,
          selected: activeFilterValues.has(key),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);

      results.push({
        field,
        buckets,
        total: bucketCounts.size,
      });
    }

    return results;
  }

  private generateSuggestions(query: string, tokens: string[]): string[] {
    const suggestions: string[] = [];
    const lastToken = tokens[tokens.length - 1];
    if (!lastToken) return suggestions;

    const prefix = lastToken.toLowerCase();
    const matchingTokens = new Map<string, number>();

    for (const [token, docMap] of this.invertedIndex) {
      if (token.startsWith(prefix) && token !== prefix) {
        matchingTokens.set(token, docMap.size);
      }
    }

    const sorted = Array.from(matchingTokens.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    for (const [token] of sorted) {
      const suggestion = [...tokens.slice(0, -1), token].join(' ');
      suggestions.push(suggestion);
    }

    return suggestions;
  }

  private suggestCorrection(query: string): string | undefined {
    const tokens = this.tokenize(query);
    const corrected: string[] = [];
    let anyCorrection = false;

    for (const token of tokens) {
      if (this.invertedIndex.has(token)) {
        corrected.push(token);
        continue;
      }

      let bestMatch = token;
      let bestDistance = Infinity;
      let bestFrequency = 0;

      for (const [indexedToken, docMap] of this.invertedIndex) {
        if (Math.abs(indexedToken.length - token.length) > 2) continue;

        const dist = this.levenshteinDistance(token, indexedToken);
        if (dist < bestDistance || (dist === bestDistance && docMap.size > bestFrequency)) {
          bestDistance = dist;
          bestMatch = indexedToken;
          bestFrequency = docMap.size;
        }
      }

      if (bestDistance <= 2 && bestMatch !== token) {
        corrected.push(bestMatch);
        anyCorrection = true;
      } else {
        corrected.push(token);
      }
    }

    return anyCorrection ? corrected.join(' ') : undefined;
  }

  private logSearch(analytics: SearchAnalytics): void {
    this.queryLog.push(analytics);

    if (this.queryLog.length > 10000) {
      this.queryLog.splice(0, this.queryLog.length - 10000);
    }

    this.prisma.searchAnalytics.create({
      data: {
        id: analytics.queryId,
        query: analytics.query,
        userId: analytics.userId,
        resultCount: analytics.resultCount,
        queryTime: analytics.queryTime,
        filters: analytics.filters as Record<string, unknown>,
        timestamp: analytics.timestamp,
      },
    }).catch(() => {
      // Non-critical, log silently
    });
  }

  async getPopularQueries(limit: number = 20, days: number = 7): Promise<PopularQuery[]> {
    const since = new Date(Date.now() - days * 86400000);
    const recentLogs = this.queryLog.filter(l => l.timestamp >= since);

    const queryStats = new Map<string, { count: number; totalResults: number; totalClickPos: number; clickCount: number; lastSearched: Date }>();

    for (const log of recentLogs) {
      const normalized = log.query.toLowerCase().trim();
      const existing = queryStats.get(normalized) || {
        count: 0, totalResults: 0, totalClickPos: 0, clickCount: 0, lastSearched: log.timestamp,
      };

      existing.count++;
      existing.totalResults += log.resultCount;
      if (log.clickPosition) {
        existing.totalClickPos += log.clickPosition;
        existing.clickCount++;
      }
      if (log.timestamp > existing.lastSearched) {
        existing.lastSearched = log.timestamp;
      }

      queryStats.set(normalized, existing);
    }

    return Array.from(queryStats.entries())
      .map(([query, stats]) => ({
        query,
        count: stats.count,
        avgResultCount: Math.round(stats.totalResults / stats.count),
        avgClickPosition: stats.clickCount > 0 ? Math.round(stats.totalClickPos / stats.clickCount * 10) / 10 : 0,
        lastSearched: stats.lastSearched,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  async removeDocument(documentId: string): Promise<void> {
    const doc = this.documentStore.get(documentId);
    if (!doc) return;

    for (const token of doc.tokens) {
      const docMap = this.invertedIndex.get(token);
      if (docMap) {
        docMap.delete(documentId);
        if (docMap.size === 0) {
          this.invertedIndex.delete(token);
        }
      }
    }

    this.documentStore.delete(documentId);

    await this.prisma.searchIndex.deleteMany({
      where: { documentId },
    });
  }

  getIndexStats(): { totalDocuments: number; totalTokens: number; avgTokensPerDoc: number } {
    const totalDocuments = this.documentStore.size;
    const totalTokens = this.invertedIndex.size;
    const avgTokensPerDoc = totalDocuments > 0
      ? Array.from(this.documentStore.values()).reduce((sum, d) => sum + d.tokens.length, 0) / totalDocuments
      : 0;

    return {
      totalDocuments,
      totalTokens,
      avgTokensPerDoc: Math.round(avgTokensPerDoc),
    };
  }
}
