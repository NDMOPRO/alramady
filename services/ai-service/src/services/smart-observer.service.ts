import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.js';
import { IntentEngineService, IntentResult } from './intelligence/intent-engine.service.js';
import { TaskDecompositionService, DecompositionResult } from './intelligence/task-decomposition.service.js';
import { ExecutionEngineService, ExecutionResult } from './intelligence/execution-engine.service.js';

const prisma = new PrismaClient();

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ObserverResponse {
  messageId: string;
  sessionId: string;
  message: string;
  intent: IntentResult;
  plan: DecompositionResult;
  result: ExecutionResult;
  suggestions: string[];
  outputUrl?: string;
}

// ─── Localized Messages ──────────────────────────────────────────────────────

const SUCCESS_MESSAGES: Record<string, { ar: string; en: string }> = {
  analyze: { ar: 'اكتمل التحليل', en: 'Analysis complete' },
  build_dashboard: { ar: 'تم إنشاء لوحة المؤشرات', en: 'Dashboard created' },
  generate_report: { ar: 'تم إنشاء التقرير بنجاح', en: 'Report generated' },
  compare: { ar: 'اكتملت المقارنة', en: 'Comparison complete' },
  clean_data: { ar: 'تم تنظيف البيانات', en: 'Data cleaned' },
  import: { ar: 'تم الاستيراد بنجاح', en: 'Import successful' },
  export: { ar: 'تم التصدير بنجاح', en: 'Export successful' },
  translate: { ar: 'تمت الترجمة بنجاح', en: 'Translation complete' },
  present: { ar: 'تم إنشاء العرض التقديمي', en: 'Presentation created' },
  forecast: { ar: 'تم إنجاز التنبؤ', en: 'Forecast complete' },
  summarize: { ar: 'تم التلخيص', en: 'Summary complete' },
  query: { ar: 'تم الإجابة', en: 'Query answered' },
  visualize: { ar: 'تم إنشاء الرسم البياني', en: 'Visualization created' },
  convert: { ar: 'تم التحويل بنجاح', en: 'Conversion complete' },
  match: { ar: 'اكتملت المطابقة', en: 'Matching complete' },
  extract: { ar: 'تم الاستخراج', en: 'Extraction complete' },
  merge: { ar: 'تم الدمج بنجاح', en: 'Merge complete' },
  govern: { ar: 'تم التحقق من الحوكمة', en: 'Governance check complete' },
};

const FOLLOW_UP_SUGGESTIONS: Record<string, { ar: string[]; en: string[] }> = {
  analyze: {
    ar: ['أنشئ تقريرا بالنتائج', 'أنشئ لوحة مؤشرات', 'اكشف الشذوذات'],
    en: ['Generate a report', 'Create a dashboard', 'Detect anomalies'],
  },
  generate_report: {
    ar: ['قارن مع الشهر الماضي', 'أنشئ لوحة مؤشرات', 'أرسل بالبريد'],
    en: ['Compare with last month', 'Create dashboard', 'Send by email'],
  },
  build_dashboard: {
    ar: ['أضف مؤشرا جديدا', 'شارك مع الفريق', 'فعّل التحديث الفوري'],
    en: ['Add new KPI', 'Share with team', 'Enable real-time'],
  },
  forecast: {
    ar: ['حلل البيانات التاريخية', 'أنشئ تقريرا بالتوقعات', 'قارن السيناريوهات'],
    en: ['Analyze historical data', 'Generate forecast report', 'Compare scenarios'],
  },
};

const DEFAULT_SUGGESTIONS = {
  ar: ['حلل البيانات', 'أنشئ تقريرا', 'أنشئ لوحة مؤشرات'],
  en: ['Analyze data', 'Generate report', 'Create dashboard'],
};

// ─── Service ─────────────────────────────────────────────────────────────────

export class SmartObserverService {
  private intentEngine: IntentEngineService;
  private taskDecomposition: TaskDecompositionService;
  private executionEngine: ExecutionEngineService;

  constructor() {
    this.intentEngine = new IntentEngineService();
    this.taskDecomposition = new TaskDecompositionService();
    this.executionEngine = new ExecutionEngineService();
    logger.info('SmartObserverService initialized');
  }

  async processCommand(
    query: string,
    tenantId: string,
    userId: string,
    sessionId?: string,
  ): Promise<ObserverResponse> {
    const messageId = `msg_${randomUUID().substring(0, 8)}`;

    // 1. Detect intent
    const intent = await this.intentEngine.parseIntent(query);
    logger.info('Intent detected', {
      intent: intent.intent,
      confidence: intent.confidence,
      language: intent.detectedLanguage,
    });

    // 2. Get or create session
    const session = await this.getOrCreateSession(tenantId, userId, sessionId);

    // 3. Decompose task
    const decomposition = await this.taskDecomposition.decompose(intent, {
      tenantId,
      userId,
    });

    // 5. Execute plan
    const executionResult = await this.executionEngine.execute(
      decomposition.plan,
      tenantId,
      userId,
    );

    // 6. Build response message
    const isAr = intent.detectedLanguage === 'ar';
    const message = this.buildMessage(intent, executionResult, isAr);

    // 7. Get suggestions
    const suggestions = this.getSuggestions(intent.intent, isAr);

    // 8. Update session
    const output = executionResult.finalResult as Record<string, unknown> | null;

    try {
      await prisma.aiSession.update({
        where: { id: session.id },
        data: {
          messageCount: (session.messageCount || 0) + 2,
          lastActivity: new Date(),
        },
      });

      // Save the query
      await prisma.aiQuery.create({
        data: {
          sessionId: session.id,
          query,
          response: JSON.stringify({
            message,
            intent: intent.intent,
            confidence: intent.confidence,
            status: executionResult.status,
          }),
          status: executionResult.status === 'complete' ? 'COMPLETED' : 'FAILED',
          model: 'gpt-4o',
          processingTimeMs: executionResult.totalDuration,
          tenantId,
          userId,
        },
      });
    } catch (err) {
      logger.warn('Failed to update session', { error: err });
    }

    // Extract output URL if available
    const outputUrl = output?.downloadUrl || output?.url || output?.fileUrl;

    return {
      messageId,
      sessionId: session.id,
      message,
      intent,
      plan: decomposition,
      result: executionResult,
      suggestions,
      outputUrl: typeof outputUrl === 'string' ? outputUrl : undefined,
    };
  }

  async listSessions(tenantId: string, userId: string): Promise<unknown[]> {
    return prisma.aiSession.findMany({
      where: { userId, tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        title: true,
        messageCount: true,
        createdAt: true,
        lastActivity: true,
      },
    });
  }

  async getSessionHistory(sessionId: string, userId: string): Promise<unknown[]> {
    const session = await prisma.aiSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) throw new Error('Session not found');

    return prisma.aiQuery.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        query: true,
        response: true,
        status: true,
        processingTimeMs: true,
        createdAt: true,
      },
    });
  }

  private async getOrCreateSession(
    tenantId: string,
    userId: string,
    sessionId?: string,
  ) {
    if (sessionId) {
      const existing = await prisma.aiSession.findFirst({
        where: { id: sessionId, userId },
      });
      if (existing) return existing;
    }

    return prisma.$queryRawUnsafe(
      `INSERT INTO ai_sessions (id, user_id, tenant_id, session_type, title, message_count, last_activity, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2, 'smart_observer', 'Smart Observer Session', 0, NOW(), 'active', NOW(), NOW())
       RETURNING *`,
      userId,
      tenantId,
    ).then((rows: unknown) => (rows as Record<string, unknown>[])[0]);
  }

  private buildMessage(
    intent: IntentResult,
    result: ExecutionResult,
    isAr: boolean,
  ): string {
    if (result.status === 'failed') {
      const failedSteps = result.steps.filter((s) => s.status === 'failed');
      const errorInfo = failedSteps[0]?.error || 'Unknown error';
      return isAr
        ? `حدث خطأ أثناء التنفيذ: ${errorInfo}`
        : `Execution failed: ${errorInfo}`;
    }

    const successMsg = SUCCESS_MESSAGES[intent.intent];
    if (successMsg) {
      return isAr ? successMsg.ar : successMsg.en;
    }

    return isAr ? 'تم التنفيذ بنجاح' : 'Execution completed successfully';
  }

  private getSuggestions(intentType: string, isAr: boolean): string[] {
    const followUp = FOLLOW_UP_SUGGESTIONS[intentType];
    if (followUp) {
      return isAr ? followUp.ar : followUp.en;
    }
    return isAr ? DEFAULT_SUGGESTIONS.ar : DEFAULT_SUGGESTIONS.en;
  }
}
