import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
const prisma = new PrismaClient();

export interface AgentResult {
  agentType: string;
  taskType: string;
  suggestions: Array<{ action: string; description: string; confidence: number }>;
  interpretation: string;
  requiresApproval: boolean;
  executedAt: Date;
}

export interface MonitoringTask {
  type: 'watch_changes' | 'suggest_updates' | 'alert_anomalies';
  datasetId: string;
  watchedColumns?: string[];
  baselineSnapshot?: Record<string, { mean: number; stdDev: number; min: number; max: number; count: number }>;
  currentSnapshot?: Record<string, { mean: number; stdDev: number; min: number; max: number; count: number }>;
  alertThresholds?: Record<string, { warningPct: number; criticalPct: number }>;
  context?: string;
}

interface ChangeDetection {
  column: string;
  metric: string;
  baselineValue: number;
  currentValue: number;
  changePercent: number;
  severity: 'info' | 'warning' | 'critical';
}

export class MonitoringAgent {
  private readonly agentType = 'monitoring';

  async execute(task: MonitoringTask): Promise<AgentResult> {
    switch (task.type) {
      case 'watch_changes':
        return this.watchChanges(task);
      case 'suggest_updates':
        return this.suggestUpdates(task);
      case 'alert_anomalies':
        return this.alertAnomalies(task);
      default: {
        const exhaustive: never = task.type;
        throw new Error(`Unsupported task type: ${exhaustive}`);
      }
    }
  }

  private detectChanges(task: MonitoringTask): ChangeDetection[] {
    const baseline = task.baselineSnapshot ?? {};
    const current = task.currentSnapshot ?? {};
    const thresholds = task.alertThresholds ?? {};
    const changes: ChangeDetection[] = [];
    const columns = task.watchedColumns ?? Object.keys(baseline);

    for (const col of columns) {
      const base = baseline[col];
      const curr = current[col];
      if (!base || !curr) continue;

      const colThreshold = thresholds[col] ?? { warningPct: 10, criticalPct: 25 };
      const metrics: Array<{ key: keyof typeof base; label: string }> = [
        { key: 'mean', label: 'average' },
        { key: 'stdDev', label: 'standard deviation' },
        { key: 'min', label: 'minimum' },
        { key: 'max', label: 'maximum' },
        { key: 'count', label: 'record count' },
      ];

      for (const metric of metrics) {
        const baseVal = base[metric.key];
        const currVal = curr[metric.key];

        if (baseVal === 0 && currVal === 0) continue;

        const changePercent = baseVal === 0
          ? (currVal !== 0 ? 100 : 0)
          : ((currVal - baseVal) / Math.abs(baseVal)) * 100;

        const absChange = Math.abs(changePercent);
        let severity: 'info' | 'warning' | 'critical' = 'info';
        if (absChange >= colThreshold.criticalPct) severity = 'critical';
        else if (absChange >= colThreshold.warningPct) severity = 'warning';

        if (severity !== 'info') {
          changes.push({
            column: col,
            metric: metric.label,
            baselineValue: parseFloat(baseVal.toFixed(4)),
            currentValue: parseFloat(currVal.toFixed(4)),
            changePercent: parseFloat(changePercent.toFixed(2)),
            severity,
          });
        }
      }
    }

    changes.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity] || Math.abs(b.changePercent) - Math.abs(a.changePercent);
    });

    return changes;
  }

  private async watchChanges(task: MonitoringTask): Promise<AgentResult> {
    const changes = this.detectChanges(task);

    const prompt = `You are a data monitoring specialist for a Saudi analytics platform.
Analyze the following detected data changes and provide interpretation.

Dataset: "${task.datasetId}"

Detected changes:
${changes.length > 0
  ? changes.map((c) => `- [${c.severity.toUpperCase()}] "${c.column}" ${c.metric}: ${c.baselineValue} -> ${c.currentValue} (${c.changePercent > 0 ? '+' : ''}${c.changePercent}%)`).join('\n')
  : 'No significant changes detected.'}

${task.context ? `Monitoring context: ${task.context}` : ''}

Respond in JSON:
{
  "suggestions": [
    { "action": "monitor_action", "description": "specific action to take based on change", "confidence": 0.9 }
  ],
  "interpretation": "overall assessment of data drift and its potential impact"
}

Consider:
- Whether changes indicate data quality issues or genuine business shifts
- Seasonal patterns that might explain the changes
- Cascading effects on downstream reports and dashboards
- confidence must be between 0 and 1`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for watch_changes task');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    await prisma.monitoringEvent.create({
      data: {
        datasetId: task.datasetId,
        eventType: 'watch_changes',
        severity: changes.some((c) => c.severity === 'critical') ? 'critical' : changes.some((c) => c.severity === 'warning') ? 'warning' : 'info',
        changesDetected: changes.length,
        details: JSON.stringify(changes),
        createdAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions: parsed.suggestions,
      interpretation: parsed.interpretation,
      requiresApproval: false,
      executedAt: new Date(),
    };
  }

  private async suggestUpdates(task: MonitoringTask): Promise<AgentResult> {
    const changes = this.detectChanges(task);

    const staleDatasets = await prisma.dataset.findMany({
      where: {
        id: task.datasetId,
        updatedAt: {
          lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
      select: {
        id: true,
        name: true,
        updatedAt: true,
      },
    });

    const prompt = `You are a data freshness and update advisor for a Saudi analytics platform.
Suggest data update strategies based on changes and staleness.

Dataset: "${task.datasetId}"

Recent changes:
${changes.length > 0
  ? changes.slice(0, 10).map((c) => `- "${c.column}" ${c.metric}: ${c.changePercent > 0 ? '+' : ''}${c.changePercent}%`).join('\n')
  : 'No recent changes detected.'}

Stale datasets:
${staleDatasets.length > 0
  ? staleDatasets.map((d) => `- "${d.name}" last updated: ${d.updatedAt.toISOString()}`).join('\n')
  : 'No stale datasets found.'}

${task.context ? `Context: ${task.context}` : ''}

Respond in JSON:
{
  "suggestions": [
    { "action": "update_schedule", "description": "specific update recommendation with frequency and priority", "confidence": 0.88 }
  ],
  "interpretation": "overall data freshness assessment and update priority matrix"
}

Consider:
- Business criticality of the data
- Cost of frequent updates vs. risk of stale data
- Dependent reports and dashboards that need refresh
- confidence must be between 0 and 1`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for suggest_updates task');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions: parsed.suggestions,
      interpretation: parsed.interpretation,
      requiresApproval: false,
      executedAt: new Date(),
    };
  }

  private async alertAnomalies(task: MonitoringTask): Promise<AgentResult> {
    const changes = this.detectChanges(task);
    const criticalChanges = changes.filter((c) => c.severity === 'critical');
    const warningChanges = changes.filter((c) => c.severity === 'warning');

    if (criticalChanges.length === 0 && warningChanges.length === 0) {
      return {
        agentType: this.agentType,
        taskType: task.type,
        suggestions: [],
        interpretation: 'No anomalies detected. All monitored metrics are within acceptable thresholds.',
        requiresApproval: false,
        executedAt: new Date(),
      };
    }

    const prompt = `You are an alert management specialist for a Saudi data analytics platform.
Evaluate these anomalies and determine which require immediate attention.

Dataset: "${task.datasetId}"

Critical anomalies:
${criticalChanges.length > 0
  ? criticalChanges.map((c) => `- "${c.column}" ${c.metric}: ${c.baselineValue} -> ${c.currentValue} (${c.changePercent > 0 ? '+' : ''}${c.changePercent}%)`).join('\n')
  : 'None'}

Warning anomalies:
${warningChanges.length > 0
  ? warningChanges.map((c) => `- "${c.column}" ${c.metric}: ${c.baselineValue} -> ${c.currentValue} (${c.changePercent > 0 ? '+' : ''}${c.changePercent}%)`).join('\n')
  : 'None'}

${task.context ? `Alert context: ${task.context}` : ''}

Respond in JSON:
{
  "suggestions": [
    { "action": "alert", "description": "specific alert with severity, affected metric, and recommended immediate action", "confidence": 0.92 }
  ],
  "interpretation": "triage assessment: which anomalies need immediate action vs. monitoring"
}

For each alert, classify as:
- IMMEDIATE: requires human intervention now
- INVESTIGATE: needs investigation within 24 hours
- MONITOR: continue watching, may self-correct
- confidence must be between 0 and 1`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for alert_anomalies task');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    await prisma.monitoringEvent.create({
      data: {
        datasetId: task.datasetId,
        eventType: 'alert_anomalies',
        severity: criticalChanges.length > 0 ? 'critical' : 'warning',
        changesDetected: criticalChanges.length + warningChanges.length,
        details: JSON.stringify({ critical: criticalChanges, warning: warningChanges }),
        createdAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions: parsed.suggestions,
      interpretation: parsed.interpretation,
      requiresApproval: criticalChanges.length > 0,
      executedAt: new Date(),
    };
  }
}
