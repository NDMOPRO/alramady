export interface RasedRegisteredEventSchema {
  event_name: string;
  version: string;
  description: string;
  payload_fields: string[];
  producer: string;
  consumers: string[];
}

const EVENT_SCHEMAS: RasedRegisteredEventSchema[] = [
  {
    event_name: 'rased.action.requested',
    version: '1.0.0',
    description: 'يصدر عند طلب تنفيذ خطوة داخل راصد.',
    payload_fields: ['event_id', 'action_id', 'action', 'tool_id', 'graph_id', 'step_id', 'recorded_at'],
    producer: 'RasedAgentOsService',
    consumers: ['audit', 'telemetry', 'ui-run-card'],
  },
  {
    event_name: 'rased.guardrail.evaluated',
    version: '1.0.0',
    description: 'نتيجة تقييم guardrails قبل التنفيذ.',
    payload_fields: ['event_id', 'evaluation_id', 'decision', 'action', 'required_token', 'recorded_at'],
    producer: 'RasedGuardrailsService',
    consumers: ['audit', 'policy-engine', 'ui-run-card'],
  },
  {
    event_name: 'rased.action.completed',
    version: '1.0.0',
    description: 'إتمام أو تفويض خطوة تنفيذ.',
    payload_fields: ['event_id', 'action_id', 'status', 'outputs', 'recorded_at'],
    producer: 'RasedAgentOsService',
    consumers: ['audit', 'evidence', 'ui-run-card'],
  },
  {
    event_name: 'rased.action.failed',
    version: '1.0.0',
    description: 'فشل خطوة أو حجبها.',
    payload_fields: ['event_id', 'action_id', 'status', 'reason', 'recorded_at'],
    producer: 'RasedAgentOsService',
    consumers: ['audit', 'evidence', 'ui-run-card'],
  },
  {
    event_name: 'rased.evidence.finalized',
    version: '1.0.0',
    description: 'تم إنشاء evidence pack.',
    payload_fields: ['event_id', 'evidence_id', 'artifact_id', 'recorded_at'],
    producer: 'RasedAgentOsService',
    consumers: ['audit', 'trace', 'ui-result-card'],
  },
  {
    event_name: 'rased.tour.started',
    version: '1.0.0',
    description: 'بداية جلسة guided tour.',
    payload_fields: ['event_id', 'tour_session_id', 'mode', 'recorded_at'],
    producer: 'RasedAgentOsService',
    consumers: ['analytics', 'ui-tour-overlay'],
  },
  {
    event_name: 'rased.tour.progressed',
    version: '1.0.0',
    description: 'تقدم tour بخطوة جديدة.',
    payload_fields: ['event_id', 'tour_session_id', 'step_index', 'status', 'recorded_at'],
    producer: 'RasedAgentOsService',
    consumers: ['analytics', 'ui-tour-overlay'],
  },
  {
    event_name: 'rased.tour.completed',
    version: '1.0.0',
    description: 'نهاية جلسة tour.',
    payload_fields: ['event_id', 'tour_session_id', 'completion_rate', 'recorded_at'],
    producer: 'RasedAgentOsService',
    consumers: ['analytics', 'audit'],
  },
];

const EVENT_BY_NAME = new Map(EVENT_SCHEMAS.map((entry) => [entry.event_name, entry]));

export class RasedEventSchemaRegistryService {
  list(): RasedRegisteredEventSchema[] {
    return EVENT_SCHEMAS.map((entry) => ({ ...entry, payload_fields: [...entry.payload_fields], consumers: [...entry.consumers] }));
  }

  resolve(eventName: string): RasedRegisteredEventSchema | undefined {
    const match = EVENT_BY_NAME.get(eventName);
    return match ? { ...match, payload_fields: [...match.payload_fields], consumers: [...match.consumers] } : undefined;
  }
}
