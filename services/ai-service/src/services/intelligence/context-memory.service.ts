import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { logger } from '../../utils/logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Episode {
  id?: string;
  sessionId: string;
  action: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  outcome: 'success' | 'failure' | 'partial';
  duration_ms: number;
  engineUsed: string;
  tags: string[];
  timestamp?: Date;
}

export interface SemanticFact {
  id?: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  source: string;
  validFrom?: Date;
  validUntil?: Date;
  tags: string[];
}

export interface WorkingMemory {
  currentTask: string | null;
  activeGoals: string[];
  pendingSteps: WorkingMemoryStep[];
  completedSteps: WorkingMemoryStep[];
  scratchpad: Record<string, unknown>;
  attentionFocus: string[];
  lastUpdated: Date;
}

export interface WorkingMemoryStep {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: unknown;
}

export interface IntelligenceContext {
  recentEpisodes: Episode[];
  relevantFacts: SemanticFact[];
  workingMemory: WorkingMemory;
  shortTermData: Record<string, unknown>;
  userPreferences: Record<string, unknown>;
  sessionHistory: string[];
  contextRelevanceScore: number;
}

interface ShortTermEntry {
  value: unknown;
  expiresAt: number;
}

const WORKING_MEMORY_MAX_STEPS = 20;
const DEFAULT_SHORT_TERM_TTL_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_EPISODE_LIMIT = 20;
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

// ─── Validation Schemas ──────────────────────────────────────────────────────

const EpisodeSchema = z.object({
  id: z.string().optional(),
  sessionId: z.string().min(1),
  action: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  output: z.record(z.string(), z.unknown()),
  outcome: z.enum(['success', 'failure', 'partial']),
  duration_ms: z.number().nonnegative(),
  engineUsed: z.string().min(1),
  tags: z.array(z.string()),
  timestamp: z.date().optional(),
});

const SemanticFactSchema = z.object({
  id: z.string().optional(),
  subject: z.string().min(1),
  predicate: z.string().min(1),
  object: z.string().min(1),
  confidence: z.number().min(0).max(1),
  source: z.string().min(1),
  validFrom: z.date().optional(),
  validUntil: z.date().optional(),
  tags: z.array(z.string()),
});

// ─── Service ─────────────────────────────────────────────────────────────────

export class ContextMemoryService {
  private openai: OpenAI;
  private prisma: PrismaClient;
  private shortTermStore: Map<string, ShortTermEntry>;
  private workingMemoryStore: Map<string, WorkingMemory>;
  private cleanupTimer: ReturnType<typeof setInterval> | null;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || new PrismaClient();
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder' || '' });
    this.shortTermStore = new Map();
    this.workingMemoryStore = new Map();
    this.cleanupTimer = setInterval(() => this.runCleanup(), CLEANUP_INTERVAL_MS);
    logger.info('ContextMemoryService initialized');
  }

  // ─── Short-Term Memory ──────────────────────────────────────────────────

  private buildShortTermKey(tenantId: string, userId: string, key: string): string {
    return `${tenantId}:${userId}:${key}`;
  }

  storeShortTerm(
    tenantId: string,
    userId: string,
    key: string,
    value: unknown,
    ttlMs: number = DEFAULT_SHORT_TERM_TTL_MS,
  ): void {
    const compositeKey = this.buildShortTermKey(tenantId, userId, key);
    const entry: ShortTermEntry = {
      value,
      expiresAt: Date.now() + ttlMs,
    };
    this.shortTermStore.set(compositeKey, entry);
    logger.debug('Short-term memory stored', { tenantId, userId, key, ttlMs });
  }

  getShortTerm(tenantId: string, userId: string, key: string): unknown | null {
    const compositeKey = this.buildShortTermKey(tenantId, userId, key);
    const entry = this.shortTermStore.get(compositeKey);

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.shortTermStore.delete(compositeKey);
      return null;
    }

    return entry.value;
  }

  // ─── Long-Term Memory ──────────────────────────────────────────────────

  async storeLongTerm(
    tenantId: string,
    userId: string,
    category: string,
    key: string,
    value: unknown,
  ): Promise<void> {
    const existing = await this.prisma.longTermMemory.findFirst({
      where: { tenantId, userId, category, key },
    });

    if (existing) {
      await this.prisma.longTermMemory.update({
        where: { id: existing.id },
        data: {
          value: JSON.stringify(value),
          updatedAt: new Date(),
          accessCount: { increment: 1 },
        },
      });
      logger.debug('Long-term memory updated', { tenantId, userId, category, key });
    } else {
      await this.prisma.longTermMemory.create({
        data: {
          id: randomUUID(),
          tenantId,
          userId,
          category,
          key,
          value: JSON.stringify(value),
          accessCount: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      logger.debug('Long-term memory created', { tenantId, userId, category, key });
    }
  }

  async getLongTerm(
    tenantId: string,
    userId: string,
    category: string,
    key?: string,
  ): Promise<unknown> {
    if (key) {
      const record = await this.prisma.longTermMemory.findFirst({
        where: { tenantId, userId, category, key },
      });

      if (!record) {
        return null;
      }

      await this.prisma.longTermMemory.update({
        where: { id: record.id },
        data: { lastAccessedAt: new Date(), accessCount: { increment: 1 } },
      });

      return JSON.parse(record.value);
    }

    const records = await this.prisma.longTermMemory.findMany({
      where: { tenantId, userId, category },
      orderBy: { updatedAt: 'desc' },
    });

    const result: Record<string, unknown> = {};
    for (const record of records) {
      result[record.key] = JSON.parse(record.value);

      await this.prisma.longTermMemory.update({
        where: { id: record.id },
        data: { lastAccessedAt: new Date() },
      });
    }

    return result;
  }

  // ─── Episodic Memory ───────────────────────────────────────────────────

  async storeEpisode(
    tenantId: string,
    userId: string,
    episode: Episode,
  ): Promise<string> {
    const validated = EpisodeSchema.parse(episode);
    const id = validated.id || randomUUID();

    const embeddingText = `${validated.action} ${validated.engineUsed} ${validated.tags.join(' ')} ${JSON.stringify(validated.input).substring(0, 500)}`;
    const embedding = await this.generateEmbedding(embeddingText);

    await this.prisma.episodicMemory.create({
      data: {
        id,
        tenantId,
        userId,
        sessionId: validated.sessionId,
        action: validated.action,
        input: JSON.stringify(validated.input),
        output: JSON.stringify(validated.output),
        outcome: validated.outcome,
        durationMs: validated.duration_ms,
        engineUsed: validated.engineUsed,
        tags: JSON.stringify(validated.tags),
        embedding: JSON.stringify(embedding),
        timestamp: validated.timestamp || new Date(),
      },
    });

    logger.info('Episode stored', { tenantId, userId, episodeId: id, action: validated.action });
    return id;
  }

  async getRecentEpisodes(
    tenantId: string,
    userId: string,
    limit: number = DEFAULT_EPISODE_LIMIT,
  ): Promise<Episode[]> {
    const records = await this.prisma.episodicMemory.findMany({
      where: { tenantId, userId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return records.map((record) => this.mapRecordToEpisode(record));
  }

  async searchEpisodes(
    tenantId: string,
    userId: string,
    query: string,
  ): Promise<Episode[]> {
    const queryEmbedding = await this.generateEmbedding(query);

    const allEpisodes = await this.prisma.episodicMemory.findMany({
      where: { tenantId, userId },
      orderBy: { timestamp: 'desc' },
      take: 200,
    });

    const scored = allEpisodes.map((record) => {
      let storedEmbedding: number[];
      try {
        storedEmbedding = JSON.parse(record.embedding);
      } catch {
        storedEmbedding = [];
      }

      const similarity = this.cosineSimilarity(queryEmbedding, storedEmbedding);

      let textScore = 0;
      const queryLower = query.toLowerCase();
      const actionLower = record.action.toLowerCase();
      if (actionLower.includes(queryLower)) {
        textScore = 0.3;
      }

      let tagsArray: string[];
      try {
        tagsArray = JSON.parse(record.tags);
      } catch {
        tagsArray = [];
      }
      for (const tag of tagsArray) {
        if (tag.toLowerCase().includes(queryLower)) {
          textScore += 0.1;
        }
      }

      return {
        record,
        score: similarity * 0.7 + textScore * 0.3,
      };
    });

    scored.sort((a, b) => b.score - a.score);

    const topResults = scored.slice(0, 20).filter((s) => s.score > 0.1);

    return topResults.map((s) => this.mapRecordToEpisode(s.record));
  }

  // ─── Semantic Memory ───────────────────────────────────────────────────

  async storeSemanticFact(
    tenantId: string,
    fact: SemanticFact,
  ): Promise<string> {
    const validated = SemanticFactSchema.parse(fact);
    const id = validated.id || randomUUID();

    const embeddingText = `${validated.subject} ${validated.predicate} ${validated.object}`;
    const embedding = await this.generateEmbedding(embeddingText);

    const existing = await this.prisma.semanticMemory.findFirst({
      where: {
        tenantId,
        subject: validated.subject,
        predicate: validated.predicate,
        object: validated.object,
      },
    });

    if (existing) {
      await this.prisma.semanticMemory.update({
        where: { id: existing.id },
        data: {
          confidence: Math.max(existing.confidence, validated.confidence),
          source: validated.source,
          validFrom: validated.validFrom || existing.validFrom,
          validUntil: validated.validUntil || existing.validUntil,
          tags: JSON.stringify(validated.tags),
          embedding: JSON.stringify(embedding),
          updatedAt: new Date(),
        },
      });
      logger.debug('Semantic fact updated', { tenantId, factId: existing.id });
      return existing.id;
    }

    await this.prisma.semanticMemory.create({
      data: {
        id,
        tenantId,
        subject: validated.subject,
        predicate: validated.predicate,
        object: validated.object,
        confidence: validated.confidence,
        source: validated.source,
        validFrom: validated.validFrom || new Date(),
        validUntil: validated.validUntil || null,
        tags: JSON.stringify(validated.tags),
        embedding: JSON.stringify(embedding),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    logger.info('Semantic fact stored', { tenantId, factId: id, subject: validated.subject });
    return id;
  }

  async querySemanticFacts(
    tenantId: string,
    query: string,
  ): Promise<SemanticFact[]> {
    const queryEmbedding = await this.generateEmbedding(query);

    const allFacts = await this.prisma.semanticMemory.findMany({
      where: {
        tenantId,
        OR: [
          { validUntil: null },
          { validUntil: { gte: new Date() } },
        ],
      },
      orderBy: { confidence: 'desc' },
      take: 300,
    });

    const scored = allFacts.map((record) => {
      let storedEmbedding: number[];
      try {
        storedEmbedding = JSON.parse(record.embedding);
      } catch {
        storedEmbedding = [];
      }

      const similarity = this.cosineSimilarity(queryEmbedding, storedEmbedding);

      let textScore = 0;
      const queryLower = query.toLowerCase();
      if (record.subject.toLowerCase().includes(queryLower)) textScore += 0.2;
      if (record.predicate.toLowerCase().includes(queryLower)) textScore += 0.1;
      if (record.object.toLowerCase().includes(queryLower)) textScore += 0.2;

      return {
        record,
        score: similarity * 0.6 + textScore * 0.4,
      };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored
      .slice(0, 15)
      .filter((s) => s.score > 0.15)
      .map((s) => this.mapRecordToFact(s.record));
  }

  // ─── Working Memory ────────────────────────────────────────────────────

  private buildWorkingMemoryKey(tenantId: string, userId: string): string {
    return `${tenantId}:${userId}`;
  }

  getWorkingMemory(tenantId: string, userId: string): WorkingMemory {
    const key = this.buildWorkingMemoryKey(tenantId, userId);
    const existing = this.workingMemoryStore.get(key);

    if (existing) {
      return existing;
    }

    const fresh: WorkingMemory = {
      currentTask: null,
      activeGoals: [],
      pendingSteps: [],
      completedSteps: [],
      scratchpad: {},
      attentionFocus: [],
      lastUpdated: new Date(),
    };

    this.workingMemoryStore.set(key, fresh);
    return fresh;
  }

  updateWorkingMemory(
    tenantId: string,
    userId: string,
    updates: Partial<WorkingMemory>,
  ): void {
    const key = this.buildWorkingMemoryKey(tenantId, userId);
    const current = this.getWorkingMemory(tenantId, userId);

    const merged: WorkingMemory = {
      currentTask: updates.currentTask !== undefined ? updates.currentTask : current.currentTask,
      activeGoals: updates.activeGoals || current.activeGoals,
      pendingSteps: updates.pendingSteps || current.pendingSteps,
      completedSteps: updates.completedSteps || current.completedSteps,
      scratchpad: updates.scratchpad
        ? { ...current.scratchpad, ...updates.scratchpad }
        : current.scratchpad,
      attentionFocus: updates.attentionFocus || current.attentionFocus,
      lastUpdated: new Date(),
    };

    // Enforce capacity limit on working memory steps
    if (merged.pendingSteps.length > WORKING_MEMORY_MAX_STEPS) {
      merged.pendingSteps = merged.pendingSteps.slice(0, WORKING_MEMORY_MAX_STEPS);
    }
    if (merged.completedSteps.length > WORKING_MEMORY_MAX_STEPS * 2) {
      merged.completedSteps = merged.completedSteps.slice(-WORKING_MEMORY_MAX_STEPS);
    }

    this.workingMemoryStore.set(key, merged);
    logger.debug('Working memory updated', { tenantId, userId });
  }

  clearWorkingMemory(tenantId: string, userId: string): void {
    const key = this.buildWorkingMemoryKey(tenantId, userId);
    this.workingMemoryStore.delete(key);
    logger.debug('Working memory cleared', { tenantId, userId });
  }

  // ─── Context Builder ───────────────────────────────────────────────────

  async buildContext(
    tenantId: string,
    userId: string,
    currentRequest: string,
  ): Promise<IntelligenceContext> {
    const startTime = Date.now();

    // Gracefully handle missing DB tables (models may not be migrated yet)
    let recentEpisodes: Episode[] = [];
    let relevantFacts: SemanticFact[] = [];
    let userPreferencesRaw: unknown = {};
    let relevantEpisodes: Episode[] = [];
    try {
      [recentEpisodes, relevantFacts, userPreferencesRaw] = await Promise.all([
        this.getRecentEpisodes(tenantId, userId, 10),
        this.querySemanticFacts(tenantId, currentRequest),
        this.getLongTerm(tenantId, userId, 'preferences'),
      ]);
      relevantEpisodes = await this.searchEpisodes(tenantId, userId, currentRequest);
    } catch (dbError) {
      logger.warn('Context memory DB fallback — tables may not exist yet', {
        error: (dbError as Error).message?.substring(0, 100),
      });
    }

    const combinedEpisodes = this.deduplicateEpisodes([
      ...relevantEpisodes.slice(0, 5),
      ...recentEpisodes.slice(0, 5),
    ]);

    const workingMemory = this.getWorkingMemory(tenantId, userId);

    const shortTermData: Record<string, unknown> = {};
    const prefix = `${tenantId}:${userId}:`;
    for (const [compositeKey, entry] of this.shortTermStore.entries()) {
      if (compositeKey.startsWith(prefix) && Date.now() <= entry.expiresAt) {
        const cleanKey = compositeKey.slice(prefix.length);
        shortTermData[cleanKey] = entry.value;
      }
    }

    const sessionHistory: string[] = combinedEpisodes.map(
      (ep) => `[${ep.outcome}] ${ep.action} via ${ep.engineUsed} (${ep.duration_ms}ms)`,
    );

    const contextRelevanceScore = this.computeContextRelevance(
      currentRequest,
      combinedEpisodes,
      relevantFacts,
      workingMemory,
    );

    const elapsed = Date.now() - startTime;
    logger.info('Context built', {
      tenantId,
      userId,
      episodeCount: combinedEpisodes.length,
      factCount: relevantFacts.length,
      relevanceScore: contextRelevanceScore,
      buildTimeMs: elapsed,
    });

    return {
      recentEpisodes: combinedEpisodes,
      relevantFacts,
      workingMemory,
      shortTermData,
      userPreferences: (userPreferencesRaw as Record<string, unknown>) || {},
      sessionHistory,
      contextRelevanceScore,
    };
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────

  cleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.runCleanup();
    logger.info('ContextMemoryService cleanup completed');
  }

  // ─── Private Helpers ───────────────────────────────────────────────────

  private runCleanup(): void {
    const now = Date.now();
    let expiredCount = 0;

    for (const [key, entry] of this.shortTermStore.entries()) {
      if (now > entry.expiresAt) {
        this.shortTermStore.delete(key);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      logger.debug('Short-term memory cleanup', { expiredCount });
    }
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const truncated = text.length > 8000 ? text.substring(0, 8000) : text;
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: truncated,
      });
      return response.data[0]?.embedding || [];
    } catch (err) {
      logger.warn('Embedding generation failed, using empty vector', { error: err });
      return [];
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  private mapRecordToEpisode(record: {
    id: string;
    sessionId: string;
    action: string;
    input: string;
    output: string;
    outcome: string;
    durationMs: number;
    engineUsed: string;
    tags: string;
    timestamp: Date;
  }): Episode {
    return {
      id: record.id,
      sessionId: record.sessionId,
      action: record.action,
      input: JSON.parse(record.input),
      output: JSON.parse(record.output),
      outcome: record.outcome as Episode['outcome'],
      duration_ms: record.durationMs,
      engineUsed: record.engineUsed,
      tags: JSON.parse(record.tags),
      timestamp: record.timestamp,
    };
  }

  private mapRecordToFact(record: {
    id: string;
    subject: string;
    predicate: string;
    object: string;
    confidence: number;
    source: string;
    validFrom: Date | null;
    validUntil: Date | null;
    tags: string;
  }): SemanticFact {
    return {
      id: record.id,
      subject: record.subject,
      predicate: record.predicate,
      object: record.object,
      confidence: record.confidence,
      source: record.source,
      validFrom: record.validFrom || undefined,
      validUntil: record.validUntil || undefined,
      tags: JSON.parse(record.tags),
    };
  }

  private deduplicateEpisodes(episodes: Episode[]): Episode[] {
    const seen = new Set<string>();
    const unique: Episode[] = [];

    for (const episode of episodes) {
      const key = episode.id || `${episode.sessionId}:${episode.action}:${episode.timestamp?.toISOString()}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(episode);
      }
    }

    return unique;
  }

  private computeContextRelevance(
    request: string,
    episodes: Episode[],
    facts: SemanticFact[],
    workingMemory: WorkingMemory,
  ): number {
    let score = 0;
    const requestLower = request.toLowerCase();
    const requestTokens = requestLower.split(/\s+/).filter((t) => t.length > 2);

    // Episode relevance
    for (const episode of episodes) {
      const actionLower = episode.action.toLowerCase();
      for (const token of requestTokens) {
        if (actionLower.includes(token)) {
          score += 0.05;
        }
      }
      for (const tag of episode.tags) {
        if (requestLower.includes(tag.toLowerCase())) {
          score += 0.03;
        }
      }
    }

    // Fact relevance
    for (const fact of facts) {
      const factText = `${fact.subject} ${fact.predicate} ${fact.object}`.toLowerCase();
      for (const token of requestTokens) {
        if (factText.includes(token)) {
          score += 0.04;
        }
      }
    }

    // Working memory relevance
    if (workingMemory.currentTask) {
      const taskLower = workingMemory.currentTask.toLowerCase();
      for (const token of requestTokens) {
        if (taskLower.includes(token)) {
          score += 0.1;
        }
      }
    }

    for (const goal of workingMemory.activeGoals) {
      if (requestLower.includes(goal.toLowerCase())) {
        score += 0.08;
      }
    }

    return Math.min(1, Math.max(0, score));
  }
}
