import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
import { ContextMemoryService, Episode, SemanticFact } from './context-memory.service.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProactiveInsight {
  id: string;
  tenantId: string;
  userId: string | null;
  type: InsightType;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  suggestedAction: string;
  suggestedActionAr: string;
  confidence: number;
  relatedEntityId: string | null;
  relatedEntityType: string | null;
  metadata: Record<string, unknown>;
  isDismissed: boolean;
  isActedUpon: boolean;
  createdAt: Date;
  expiresAt: Date | null;
}

export type InsightType =
  | 'anomaly_detected'
  | 'trend_change'
  | 'data_quality_issue'
  | 'optimization_suggestion'
  | 'usage_pattern'
  | 'stale_data'
  | 'capacity_warning'
  | 'correlation_found'
  | 'recommended_analysis'
  | 'dashboard_improvement'
  | 'report_suggestion';

export interface UserBehaviorPattern {
  userId: string;
  tenantId: string;
  frequentActions: Array<{ action: string; count: number; lastUsed: Date }>;
  preferredEngines: Array<{ engine: string; usageCount: number }>;
  peakUsageHours: number[];
  averageSessionDurationMs: number;
  commonDataSources: string[];
  languagePreference: 'ar' | 'en' | 'mixed';
  lastAnalyzed: Date;
}

export interface SystemState {
  tenantId: string;
  datasetCount: number;
  dashboardCount: number;
  reportCount: number;
  recentActivityCount: number;
  lastDataUpdate: Date | null;
  dataQualityScore: number;
  storageUsedMb: number;
  activeUsers: number;
}

export interface AnomalyResult {
  isAnomaly: boolean;
  zScore: number;
  direction: 'above' | 'below' | 'none';
  description: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class ProactiveIntelligenceService {
  private openai: OpenAI;
  private prisma: PrismaClient;
  private contextMemory: ContextMemoryService;
  private behaviorCache: Map<string, UserBehaviorPattern>;
  private monitoringInterval: ReturnType<typeof setInterval> | null;

  private readonly ANOMALY_Z_THRESHOLD = 2.5;
  private readonly STALE_DATA_DAYS = 30;
  private readonly QUALITY_SCORE_MIN = 0.7;
  private readonly MONITORING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(prisma?: PrismaClient, contextMemory?: ContextMemoryService) {
    this.prisma = prisma || new PrismaClient();
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
    this.contextMemory = contextMemory || new ContextMemoryService(this.prisma);
    this.behaviorCache = new Map();
    this.monitoringInterval = null;
    logger.info('ProactiveIntelligenceService initialized');
  }

  // ─── Monitoring ────────────────────────────────────────────────────────

  startMonitoring(): void {
    if (this.monitoringInterval) {
      logger.warn('Monitoring already active');
      return;
    }

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.runMonitoringCycle();
      } catch (err) {
        logger.error('Monitoring cycle error', { error: err });
      }
    }, this.MONITORING_INTERVAL_MS);

    logger.info('Proactive monitoring started', { intervalMs: this.MONITORING_INTERVAL_MS });
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Proactive monitoring stopped');
    }
  }

  private async runMonitoringCycle(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true },
    }).catch(() => []);

    for (const tenant of tenants) {
      try {
        await this.monitorTenant(tenant.id);
      } catch (err) {
        logger.warn('Monitoring failed for tenant', { tenantId: tenant.id, error: err });
      }
    }
  }

  private async monitorTenant(tenantId: string): Promise<void> {
    const systemState = await this.getSystemState(tenantId);

    const checks = await Promise.allSettled([
      this.checkStaleData(tenantId, systemState),
      this.checkDataQuality(tenantId, systemState),
      this.checkCapacity(tenantId, systemState),
      this.detectDataAnomalies(tenantId),
    ]);

    const insights: ProactiveInsight[] = [];
    for (const result of checks) {
      if (result.status === 'fulfilled' && result.value) {
        if (Array.isArray(result.value)) {
          insights.push(...result.value);
        } else {
          insights.push(result.value);
        }
      }
    }

    if (insights.length > 0) {
      await this.storeInsights(insights);
      logger.info('Proactive insights generated', { tenantId, count: insights.length });
    }
  }

  // ─── System State ──────────────────────────────────────────────────────

  private async getSystemState(tenantId: string): Promise<SystemState> {
    const [datasetCount, dashboardCount, reportCount, recentActivity] = await Promise.all([
      this.prisma.dataset.count({ where: { tenantId } }).catch(() => 0),
      this.prisma.dashboard.count({ where: { tenantId } }).catch(() => 0),
      this.prisma.report.count({ where: { tenantId } }).catch(() => 0),
      this.prisma.activityLog.count({
        where: {
          tenantId,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }).catch(() => 0),
    ]);

    const lastDataset = await this.prisma.dataset.findFirst({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    }).catch(() => null);

    return {
      tenantId,
      datasetCount,
      dashboardCount,
      reportCount,
      recentActivityCount: recentActivity,
      lastDataUpdate: lastDataset?.updatedAt || null,
      dataQualityScore: 0.85, // Will be computed from real data
      storageUsedMb: 0,
      activeUsers: 0,
    };
  }

  // ─── Anomaly Detection ─────────────────────────────────────────────────

  async detectDataAnomalies(tenantId: string): Promise<ProactiveInsight[]> {
    const insights: ProactiveInsight[] = [];

    const datasets = await this.prisma.dataset.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }).catch(() => []);

    for (const dataset of datasets) {
      const recentMetrics = await this.prisma.datasetMetric.findMany({
        where: { datasetId: dataset.id },
        orderBy: { recordedAt: 'desc' },
        take: 100,
      }).catch(() => []);

      if (recentMetrics.length < 10) continue;

      const values = recentMetrics.map((m) => m.value);
      const anomalyResult = this.detectAnomaly(values);

      if (anomalyResult.isAnomaly) {
        insights.push({
          id: randomUUID(),
          tenantId,
          userId: null,
          type: 'anomaly_detected',
          severity: Math.abs(anomalyResult.zScore) > 3.5 ? 'critical' : 'warning',
          title: `Anomaly detected in dataset "${dataset.name}"`,
          titleAr: `تم اكتشاف شذوذ في مجموعة البيانات "${dataset.name}"`,
          description: anomalyResult.description,
          descriptionAr: `اكتشف النظام قيمة غير عادية (${anomalyResult.direction === 'above' ? 'أعلى' : 'أقل'} من المتوسط بـ ${Math.abs(anomalyResult.zScore).toFixed(1)} انحراف معياري)`,
          suggestedAction: `Review the latest data in "${dataset.name}" for unusual values`,
          suggestedActionAr: `راجع أحدث البيانات في "${dataset.name}" للبحث عن قيم غير عادية`,
          confidence: Math.min(0.95, 0.5 + Math.abs(anomalyResult.zScore) * 0.1),
          relatedEntityId: dataset.id,
          relatedEntityType: 'dataset',
          metadata: {
            zScore: anomalyResult.zScore,
            direction: anomalyResult.direction,
            latestValue: values[0],
            mean: this.mean(values),
            stdDev: this.standardDeviation(values),
          },
          isDismissed: false,
          isActedUpon: false,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
      }
    }

    return insights;
  }

  private detectAnomaly(values: number[]): AnomalyResult {
    if (values.length < 5) {
      return { isAnomaly: false, zScore: 0, direction: 'none', description: 'Insufficient data' };
    }

    const avg = this.mean(values);
    const std = this.standardDeviation(values);

    if (std === 0) {
      return { isAnomaly: false, zScore: 0, direction: 'none', description: 'No variance in data' };
    }

    const latestValue = values[0];
    const zScore = (latestValue - avg) / std;

    const isAnomaly = Math.abs(zScore) > this.ANOMALY_Z_THRESHOLD;
    const direction: 'above' | 'below' | 'none' = zScore > 0 ? 'above' : zScore < 0 ? 'below' : 'none';

    return {
      isAnomaly,
      zScore: Math.round(zScore * 100) / 100,
      direction,
      description: isAnomaly
        ? `Latest value (${latestValue.toFixed(2)}) is ${Math.abs(zScore).toFixed(1)} standard deviations ${direction} the mean (${avg.toFixed(2)})`
        : 'No anomaly detected',
    };
  }

  // ─── Data Quality Checks ──────────────────────────────────────────────

  private async checkDataQuality(
    tenantId: string,
    state: SystemState,
  ): Promise<ProactiveInsight | null> {
    if (state.dataQualityScore >= this.QUALITY_SCORE_MIN) {
      return null;
    }

    return {
      id: randomUUID(),
      tenantId,
      userId: null,
      type: 'data_quality_issue',
      severity: state.dataQualityScore < 0.5 ? 'critical' : 'warning',
      title: 'Data quality below threshold',
      titleAr: 'جودة البيانات أقل من الحد المطلوب',
      description: `Overall data quality score is ${(state.dataQualityScore * 100).toFixed(0)}%, below the ${(this.QUALITY_SCORE_MIN * 100).toFixed(0)}% threshold`,
      descriptionAr: `درجة جودة البيانات الإجمالية هي ${(state.dataQualityScore * 100).toFixed(0)}٪، أقل من الحد المطلوب ${(this.QUALITY_SCORE_MIN * 100).toFixed(0)}٪`,
      suggestedAction: 'Run data cleaning operations on datasets with low quality scores',
      suggestedActionAr: 'قم بتشغيل عمليات تنظيف البيانات على مجموعات البيانات ذات الدرجات المنخفضة',
      confidence: 0.9,
      relatedEntityId: null,
      relatedEntityType: null,
      metadata: { qualityScore: state.dataQualityScore, threshold: this.QUALITY_SCORE_MIN },
      isDismissed: false,
      isActedUpon: false,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    };
  }

  // ─── Stale Data Check ─────────────────────────────────────────────────

  private async checkStaleData(
    tenantId: string,
    state: SystemState,
  ): Promise<ProactiveInsight | null> {
    if (!state.lastDataUpdate) return null;

    const daysSinceUpdate = (Date.now() - state.lastDataUpdate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceUpdate < this.STALE_DATA_DAYS) return null;

    return {
      id: randomUUID(),
      tenantId,
      userId: null,
      type: 'stale_data',
      severity: daysSinceUpdate > this.STALE_DATA_DAYS * 2 ? 'critical' : 'warning',
      title: 'Data has not been updated recently',
      titleAr: 'لم يتم تحديث البيانات مؤخراً',
      description: `No data updates in the last ${Math.floor(daysSinceUpdate)} days`,
      descriptionAr: `لا توجد تحديثات للبيانات خلال آخر ${Math.floor(daysSinceUpdate)} يوم`,
      suggestedAction: 'Import new data or refresh existing data sources',
      suggestedActionAr: 'قم باستيراد بيانات جديدة أو تحديث مصادر البيانات الحالية',
      confidence: 0.95,
      relatedEntityId: null,
      relatedEntityType: null,
      metadata: { daysSinceUpdate: Math.floor(daysSinceUpdate), threshold: this.STALE_DATA_DAYS },
      isDismissed: false,
      isActedUpon: false,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };
  }

  // ─── Capacity Check ───────────────────────────────────────────────────

  private async checkCapacity(
    tenantId: string,
    state: SystemState,
  ): Promise<ProactiveInsight | null> {
    const maxStorageMb = 10 * 1024; // 10 GB default
    const usagePercent = (state.storageUsedMb / maxStorageMb) * 100;

    if (usagePercent < 80) return null;

    return {
      id: randomUUID(),
      tenantId,
      userId: null,
      type: 'capacity_warning',
      severity: usagePercent > 95 ? 'critical' : 'warning',
      title: 'Storage capacity approaching limit',
      titleAr: 'سعة التخزين تقترب من الحد الأقصى',
      description: `Storage usage is at ${usagePercent.toFixed(0)}% (${state.storageUsedMb}MB of ${maxStorageMb}MB)`,
      descriptionAr: `استخدام التخزين عند ${usagePercent.toFixed(0)}٪ (${state.storageUsedMb} ميجا من ${maxStorageMb} ميجا)`,
      suggestedAction: 'Archive old data or increase storage capacity',
      suggestedActionAr: 'قم بأرشفة البيانات القديمة أو زيادة سعة التخزين',
      confidence: 0.99,
      relatedEntityId: null,
      relatedEntityType: null,
      metadata: { storageUsedMb: state.storageUsedMb, maxStorageMb, usagePercent },
      isDismissed: false,
      isActedUpon: false,
      createdAt: new Date(),
      expiresAt: null,
    };
  }

  // ─── Recommendations ──────────────────────────────────────────────────

  async getRecommendations(
    tenantId: string,
    userId: string,
  ): Promise<ProactiveInsight[]> {
    const insights: ProactiveInsight[] = [];

    // Analyze user behavior patterns
    const behavior = await this.analyzeUserBehavior(tenantId, userId);

    // Generate personalized recommendations based on behavior
    if (behavior.frequentActions.length > 0) {
      const topAction = behavior.frequentActions[0];

      // Suggest analysis if user frequently imports but rarely analyzes
      const hasImports = behavior.frequentActions.some((a) => a.action.includes('import') || a.action.includes('read'));
      const hasAnalysis = behavior.frequentActions.some((a) => a.action.includes('analyze'));

      if (hasImports && !hasAnalysis) {
        insights.push({
          id: randomUUID(),
          tenantId,
          userId,
          type: 'recommended_analysis',
          severity: 'info',
          title: 'Try analyzing your imported data',
          titleAr: 'جرب تحليل بياناتك المستوردة',
          description: 'You frequently import data but haven\'t run any analyses yet. Our AI can help discover insights.',
          descriptionAr: 'أنت تستورد البيانات كثيراً لكن لم تقم بأي تحليلات بعد. يمكن للذكاء الاصطناعي مساعدتك في اكتشاف الرؤى.',
          suggestedAction: 'Run AI analysis on your latest dataset',
          suggestedActionAr: 'قم بتشغيل التحليل الذكي على أحدث مجموعة بيانات',
          confidence: 0.8,
          relatedEntityId: null,
          relatedEntityType: null,
          metadata: { pattern: 'import_without_analysis', importCount: topAction.count },
          isDismissed: false,
          isActedUpon: false,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
      }

      // Suggest dashboard if user does analysis but no dashboards
      const hasDashboards = behavior.preferredEngines.some((e) => e.engine === 'dashboards');
      if (hasAnalysis && !hasDashboards) {
        insights.push({
          id: randomUUID(),
          tenantId,
          userId,
          type: 'dashboard_improvement',
          severity: 'info',
          title: 'Create a dashboard for your analyses',
          titleAr: 'أنشئ لوحة معلومات لتحليلاتك',
          description: 'You perform analyses frequently. Creating a dashboard can help visualize results automatically.',
          descriptionAr: 'أنت تقوم بالتحليلات كثيراً. إنشاء لوحة معلومات يمكن أن يساعد في عرض النتائج تلقائياً.',
          suggestedAction: 'Create an interactive dashboard from your analysis results',
          suggestedActionAr: 'أنشئ لوحة معلومات تفاعلية من نتائج تحليلاتك',
          confidence: 0.75,
          relatedEntityId: null,
          relatedEntityType: null,
          metadata: { pattern: 'analysis_without_dashboard' },
          isDismissed: false,
          isActedUpon: false,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        });
      }
    }

    // AI-generated suggestions based on data characteristics
    const aiSuggestions = await this.generateAISuggestions(tenantId, userId, behavior);
    insights.push(...aiSuggestions);

    logger.info('Recommendations generated', { tenantId, userId, count: insights.length });
    return insights;
  }

  // ─── User Behavior Analysis ────────────────────────────────────────────

  async analyzeUserBehavior(
    tenantId: string,
    userId: string,
  ): Promise<UserBehaviorPattern> {
    const cacheKey = `${tenantId}:${userId}`;
    const cached = this.behaviorCache.get(cacheKey);

    if (cached && Date.now() - cached.lastAnalyzed.getTime() < 60 * 60 * 1000) {
      return cached;
    }

    // Get recent episodes from context memory
    const episodes = await this.contextMemory.getRecentEpisodes(tenantId, userId, 100);

    // Compute frequency of actions
    const actionCounts = new Map<string, { count: number; lastUsed: Date }>();
    const engineCounts = new Map<string, number>();
    const hours: number[] = [];
    let totalDuration = 0;
    const dataSources = new Set<string>();

    for (const episode of episodes) {
      const existing = actionCounts.get(episode.action) || { count: 0, lastUsed: new Date(0) };
      actionCounts.set(episode.action, {
        count: existing.count + 1,
        lastUsed: episode.timestamp && episode.timestamp > existing.lastUsed
          ? episode.timestamp
          : existing.lastUsed,
      });

      const engineCount = engineCounts.get(episode.engineUsed) || 0;
      engineCounts.set(episode.engineUsed, engineCount + 1);

      if (episode.timestamp) {
        hours.push(episode.timestamp.getHours());
      }

      totalDuration += episode.duration_ms;

      // Extract data sources from input
      if (episode.input && typeof episode.input === 'object') {
        const inputStr = JSON.stringify(episode.input);
        const fileMatches = inputStr.match(/[\w-]+\.(csv|xlsx?|json|pdf|docx?)/gi);
        if (fileMatches) {
          fileMatches.forEach((f) => dataSources.add(f));
        }
      }
    }

    // Compute peak hours
    const hourCounts = new Array(24).fill(0);
    for (const h of hours) {
      hourCounts[h]++;
    }
    const maxHourCount = Math.max(...hourCounts, 1);
    const peakHours = hourCounts
      .map((count, hour) => ({ hour, count }))
      .filter((h) => h.count > maxHourCount * 0.5)
      .map((h) => h.hour);

    // Detect language preference
    let arabicCount = 0;
    let englishCount = 0;
    for (const episode of episodes) {
      const actionStr = episode.action + JSON.stringify(episode.input);
      const arabicChars = (actionStr.match(/[\u0600-\u06FF]/g) || []).length;
      const latinChars = (actionStr.match(/[a-zA-Z]/g) || []).length;
      arabicCount += arabicChars;
      englishCount += latinChars;
    }

    const totalChars = arabicCount + englishCount;
    let languagePreference: 'ar' | 'en' | 'mixed' = 'en';
    if (totalChars > 0) {
      const arabicRatio = arabicCount / totalChars;
      languagePreference = arabicRatio > 0.6 ? 'ar' : arabicRatio > 0.3 ? 'mixed' : 'en';
    }

    const pattern: UserBehaviorPattern = {
      userId,
      tenantId,
      frequentActions: Array.from(actionCounts.entries())
        .map(([action, data]) => ({ action, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      preferredEngines: Array.from(engineCounts.entries())
        .map(([engine, usageCount]) => ({ engine, usageCount }))
        .sort((a, b) => b.usageCount - a.usageCount),
      peakUsageHours: peakHours,
      averageSessionDurationMs: episodes.length > 0 ? totalDuration / episodes.length : 0,
      commonDataSources: Array.from(dataSources).slice(0, 20),
      languagePreference,
      lastAnalyzed: new Date(),
    };

    this.behaviorCache.set(cacheKey, pattern);

    // Store behavior as semantic facts for long-term learning
    await this.storeBehaviorFacts(tenantId, userId, pattern);

    return pattern;
  }

  // ─── AI Suggestions ───────────────────────────────────────────────────

  private async generateAISuggestions(
    tenantId: string,
    userId: string,
    behavior: UserBehaviorPattern,
  ): Promise<ProactiveInsight[]> {
    const systemPrompt = `You are a proactive intelligence engine for Rasid (راصد), a data management platform.
Based on user behavior patterns, suggest actionable insights.

Return a JSON array of suggestions, each with:
- title (English)
- titleAr (Arabic)
- description (English)
- descriptionAr (Arabic)
- suggestedAction (English)
- suggestedActionAr (Arabic)
- type: one of "recommended_analysis", "dashboard_improvement", "report_suggestion", "optimization_suggestion"
- confidence: 0.0 to 1.0

Maximum 3 suggestions. Respond ONLY with valid JSON array.`;

    const userPrompt = `User behavior:
- Frequent actions: ${behavior.frequentActions.slice(0, 5).map((a) => `${a.action} (${a.count}x)`).join(', ')}
- Preferred engines: ${behavior.preferredEngines.slice(0, 5).map((e) => `${e.engine} (${e.usageCount}x)`).join(', ')}
- Common data sources: ${behavior.commonDataSources.slice(0, 5).join(', ')}
- Language preference: ${behavior.languagePreference}
- Peak hours: ${behavior.peakUsageHours.join(', ')}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 1500,
      });

      const raw = response.choices[0]?.message?.content || '[]';
      let parsed: Array<Record<string, unknown>>;
      try {
        const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        logger.warn('AI suggestions returned non-JSON');
        return [];
      }

      if (!Array.isArray(parsed)) return [];

      return parsed.slice(0, 3).map((item) => ({
        id: randomUUID(),
        tenantId,
        userId,
        type: (String(item.type || 'recommended_analysis')) as InsightType,
        severity: 'info' as const,
        title: String(item.title || ''),
        titleAr: String(item.titleAr || ''),
        description: String(item.description || ''),
        descriptionAr: String(item.descriptionAr || ''),
        suggestedAction: String(item.suggestedAction || ''),
        suggestedActionAr: String(item.suggestedActionAr || ''),
        confidence: Number(item.confidence) || 0.6,
        relatedEntityId: null,
        relatedEntityType: null,
        metadata: { source: 'ai_generated', behavior: behavior.frequentActions.slice(0, 3) },
        isDismissed: false,
        isActedUpon: false,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }));
    } catch (err) {
      logger.error('AI suggestion generation failed', { error: err });
      return [];
    }
  }

  // ─── Storage ───────────────────────────────────────────────────────────

  private async storeInsights(insights: ProactiveInsight[]): Promise<void> {
    for (const insight of insights) {
      await this.prisma.proactiveInsight.create({
        data: {
          id: insight.id,
          tenantId: insight.tenantId,
          userId: insight.userId,
          type: insight.type,
          severity: insight.severity,
          title: insight.title,
          titleAr: insight.titleAr,
          description: insight.description,
          descriptionAr: insight.descriptionAr,
          suggestedAction: insight.suggestedAction,
          suggestedActionAr: insight.suggestedActionAr,
          confidence: insight.confidence,
          relatedEntityId: insight.relatedEntityId,
          relatedEntityType: insight.relatedEntityType,
          metadata: JSON.stringify(insight.metadata),
          isDismissed: false,
          isActedUpon: false,
          createdAt: insight.createdAt,
          expiresAt: insight.expiresAt,
        },
      }).catch((err) => {
        logger.warn('Failed to store insight', { insightId: insight.id, error: err });
      });
    }
  }

  private async storeBehaviorFacts(
    tenantId: string,
    userId: string,
    pattern: UserBehaviorPattern,
  ): Promise<void> {
    if (pattern.frequentActions.length > 0) {
      await this.contextMemory.storeSemanticFact(tenantId, {
        subject: userId,
        predicate: 'frequently_uses',
        object: pattern.frequentActions[0].action,
        confidence: 0.9,
        source: 'behavior_analysis',
        tags: ['behavior', 'frequent_action'],
      }).catch((err) => {
        logger.debug('Failed to store behavior fact', { error: err });
      });
    }

    if (pattern.preferredEngines.length > 0) {
      await this.contextMemory.storeSemanticFact(tenantId, {
        subject: userId,
        predicate: 'prefers_engine',
        object: pattern.preferredEngines[0].engine,
        confidence: 0.85,
        source: 'behavior_analysis',
        tags: ['behavior', 'engine_preference'],
      }).catch((err) => {
        logger.debug('Failed to store engine preference fact', { error: err });
      });
    }

    await this.contextMemory.storeSemanticFact(tenantId, {
      subject: userId,
      predicate: 'language_preference',
      object: pattern.languagePreference,
      confidence: 0.95,
      source: 'behavior_analysis',
      tags: ['behavior', 'language'],
    }).catch((err) => {
      logger.debug('Failed to store language preference fact', { error: err });
    });
  }

  // ─── Insight Retrieval ─────────────────────────────────────────────────

  async getInsights(
    tenantId: string,
    userId?: string,
    includeExpired: boolean = false,
  ): Promise<ProactiveInsight[]> {
    const where: Record<string, unknown> = {
      tenantId,
      isDismissed: false,
    };

    if (userId) {
      where.OR = [{ userId }, { userId: null }];
    }

    if (!includeExpired) {
      where.AND = [
        {
          OR: [
            { expiresAt: null },
            { expiresAt: { gte: new Date() } },
          ],
        },
      ];
    }

    const records = await this.prisma.proactiveInsight.findMany({
      where,
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      take: 50,
    });

    return records.map((record) => ({
      id: record.id,
      tenantId: record.tenantId,
      userId: record.userId,
      type: record.type as InsightType,
      severity: record.severity as ProactiveInsight['severity'],
      title: record.title,
      titleAr: record.titleAr,
      description: record.description,
      descriptionAr: record.descriptionAr,
      suggestedAction: record.suggestedAction,
      suggestedActionAr: record.suggestedActionAr,
      confidence: record.confidence,
      relatedEntityId: record.relatedEntityId,
      relatedEntityType: record.relatedEntityType,
      metadata: typeof record.metadata === 'string' ? JSON.parse(record.metadata) : record.metadata as Record<string, unknown>,
      isDismissed: record.isDismissed,
      isActedUpon: record.isActedUpon,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    }));
  }

  async dismissInsight(insightId: string): Promise<void> {
    await this.prisma.proactiveInsight.update({
      where: { id: insightId },
      data: { isDismissed: true },
    });
    logger.info('Insight dismissed', { insightId });
  }

  async markInsightActedUpon(insightId: string): Promise<void> {
    await this.prisma.proactiveInsight.update({
      where: { id: insightId },
      data: { isActedUpon: true },
    });
    logger.info('Insight marked as acted upon', { insightId });
  }

  // ─── Math Helpers ──────────────────────────────────────────────────────

  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private standardDeviation(values: number[]): number {
    if (values.length < 2) return 0;
    const avg = this.mean(values);
    const squaredDiffs = values.map((v) => (v - avg) ** 2);
    return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1));
  }
}
