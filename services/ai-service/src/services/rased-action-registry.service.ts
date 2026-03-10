import { RASED_TOOL_REGISTRY, type RasedToolId } from './rased-tool-contracts.js';

export interface RasedRegisteredAction {
  action: string;
  tool_id: string;
  engine: string;
  required_permissions: string[];
  sensitive: boolean;
  async: boolean;
  emitted_events: string[];
  feature_toggle?: string;
}

const REGISTERED_ACTIONS: RasedRegisteredAction[] = [
  {
    action: 'rased.intent.parse',
    tool_id: 'rased.intent_parse',
    engine: 'rased',
    required_permissions: [...RASED_TOOL_REGISTRY['rased.intent_parse'].required_permissions],
    sensitive: false,
    async: false,
    emitted_events: ['rased.action.requested', 'rased.action.completed'],
  },
  {
    action: 'rased.action.plan',
    tool_id: 'rased.plan_action_graph',
    engine: 'rased',
    required_permissions: [...RASED_TOOL_REGISTRY['rased.plan_action_graph'].required_permissions],
    sensitive: false,
    async: false,
    emitted_events: ['rased.action.requested', 'rased.action.completed'],
  },
  {
    action: 'rased.action.execute',
    tool_id: 'rased.execute_action_graph',
    engine: 'rased',
    required_permissions: [...RASED_TOOL_REGISTRY['rased.execute_action_graph'].required_permissions],
    sensitive: false,
    async: true,
    emitted_events: ['rased.action.requested', 'rased.guardrail.evaluated', 'rased.action.completed'],
  },
  {
    action: 'rased.policy.evaluate',
    tool_id: 'rased.policy.check',
    engine: 'policy',
    required_permissions: [...RASED_TOOL_REGISTRY['rased.policy.check'].required_permissions],
    sensitive: false,
    async: false,
    emitted_events: ['rased.guardrail.evaluated'],
  },
  {
    action: 'rased.knowledge.retrieve',
    tool_id: 'rased.knowledge.search',
    engine: 'knowledge',
    required_permissions: [...RASED_TOOL_REGISTRY['rased.knowledge.search'].required_permissions],
    sensitive: false,
    async: false,
    emitted_events: ['rased.action.requested', 'rased.action.completed'],
  },
  {
    action: 'rased.preferences.read',
    tool_id: 'rased.preference.get',
    engine: 'preference',
    required_permissions: [...RASED_TOOL_REGISTRY['rased.preference.get'].required_permissions],
    sensitive: false,
    async: false,
    emitted_events: ['rased.action.completed'],
  },
  {
    action: 'rased.preferences.write',
    tool_id: 'rased.preference.set',
    engine: 'preference',
    required_permissions: [...RASED_TOOL_REGISTRY['rased.preference.set'].required_permissions],
    sensitive: false,
    async: false,
    emitted_events: ['rased.action.completed'],
  },
  {
    action: 'rased.ui.dispatch',
    tool_id: 'rased.ui_action.dispatch',
    engine: 'ui',
    required_permissions: [...RASED_TOOL_REGISTRY['rased.ui_action.dispatch'].required_permissions],
    sensitive: false,
    async: false,
    emitted_events: ['rased.action.requested', 'rased.action.completed'],
  },
  {
    action: 'rased.ui.tour.start',
    tool_id: 'rased.ui_tour.start',
    engine: 'ui',
    required_permissions: [...RASED_TOOL_REGISTRY['rased.ui_tour.start'].required_permissions],
    sensitive: false,
    async: false,
    emitted_events: ['rased.tour.started'],
  },
  {
    action: 'rased.ui.tour.step',
    tool_id: 'rased.ui_tour.step',
    engine: 'ui',
    required_permissions: [...RASED_TOOL_REGISTRY['rased.ui_tour.step'].required_permissions],
    sensitive: false,
    async: false,
    emitted_events: ['rased.tour.progressed'],
  },
  {
    action: 'rased.ui.tour.end',
    tool_id: 'rased.ui_tour.end',
    engine: 'ui',
    required_permissions: [...RASED_TOOL_REGISTRY['rased.ui_tour.end'].required_permissions],
    sensitive: false,
    async: false,
    emitted_events: ['rased.tour.completed'],
  },
  {
    action: 'rased.training.pack.ingest',
    tool_id: 'rased.training.pack.ingest',
    engine: 'training',
    required_permissions: [...RASED_TOOL_REGISTRY['rased.training.pack.ingest'].required_permissions],
    sensitive: false,
    async: true,
    emitted_events: ['rased.training.pack.ingested'],
  },
  {
    action: 'rased.training.playbook.upsert',
    tool_id: 'rased.training.playbook.upsert',
    engine: 'training',
    required_permissions: [...RASED_TOOL_REGISTRY['rased.training.playbook.upsert'].required_permissions],
    sensitive: false,
    async: false,
    emitted_events: ['rased.training.playbook.updated'],
  },
  {
    action: 'rased.training.eval.run',
    tool_id: 'rased.training.eval.run',
    engine: 'training',
    required_permissions: [...RASED_TOOL_REGISTRY['rased.training.eval.run'].required_permissions],
    sensitive: false,
    async: true,
    emitted_events: ['rased.training.eval.completed'],
  },
  {
    action: 'rased.connector.call',
    tool_id: 'rased.connector.call',
    engine: 'connector',
    required_permissions: [...RASED_TOOL_REGISTRY['rased.connector.call'].required_permissions],
    sensitive: true,
    async: true,
    emitted_events: ['rased.action.requested', 'rased.guardrail.evaluated', 'rased.action.completed'],
  },
  {
    action: 'rased.evidence.finalize',
    tool_id: 'rased.evidence.pack',
    engine: 'evidence',
    required_permissions: [...RASED_TOOL_REGISTRY['rased.evidence.pack'].required_permissions],
    sensitive: false,
    async: true,
    emitted_events: ['rased.evidence.finalized'],
  },
  {
    action: 'replication.strict_run',
    tool_id: 'repair.loop_controller',
    engine: 'replication',
    required_permissions: ['replication:execute'],
    sensitive: false,
    async: true,
    emitted_events: ['rased.action.requested', 'rased.action.completed'],
  },
  {
    action: 'slides.generate',
    tool_id: 'slides.build_deck',
    engine: 'slides',
    required_permissions: ['slides:execute'],
    sensitive: false,
    async: true,
    emitted_events: ['rased.action.requested', 'rased.action.completed'],
  },
  {
    action: 'report.build',
    tool_id: 'report.build_doc_ir',
    engine: 'report',
    required_permissions: ['report:execute'],
    sensitive: false,
    async: true,
    emitted_events: ['rased.action.requested', 'rased.action.completed'],
  },
  {
    action: 'dashboard.build',
    tool_id: 'dashboard.build',
    engine: 'dashboard',
    required_permissions: ['dashboard:execute'],
    sensitive: false,
    async: true,
    emitted_events: ['rased.action.requested', 'rased.action.completed'],
  },
  {
    action: 'dashboard.publish',
    tool_id: 'dashboard.publish',
    engine: 'dashboard',
    required_permissions: ['dashboard:publish'],
    sensitive: true,
    async: true,
    emitted_events: ['rased.action.requested', 'rased.guardrail.evaluated', 'rased.action.completed'],
  },
  {
    action: 'excel.export',
    tool_id: 'export.xlsx',
    engine: 'excel',
    required_permissions: ['excel:export'],
    sensitive: true,
    async: true,
    emitted_events: ['rased.action.requested', 'rased.action.completed'],
  },
  {
    action: 'lct.any_to_any',
    tool_id: 'lct.orch.any_to_any',
    engine: 'lct',
    required_permissions: ['conversion:execute'],
    sensitive: false,
    async: true,
    emitted_events: ['rased.action.requested', 'rased.action.completed'],
  },
];

const ACTION_BY_NAME = new Map(REGISTERED_ACTIONS.map((entry) => [entry.action, entry]));
const ACTION_BY_TOOL = new Map(REGISTERED_ACTIONS.map((entry) => [entry.tool_id, entry]));

export class RasedActionRegistryService {
  list(): RasedRegisteredAction[] {
    return REGISTERED_ACTIONS.map((entry) => ({ ...entry, required_permissions: [...entry.required_permissions], emitted_events: [...entry.emitted_events] }));
  }

  resolve(action: string): RasedRegisteredAction | undefined {
    const match = ACTION_BY_NAME.get(action);
    return match ? { ...match, required_permissions: [...match.required_permissions], emitted_events: [...match.emitted_events] } : undefined;
  }

  resolveForTool(toolId: string, step?: Record<string, unknown>): RasedRegisteredAction {
    const explicitAction = typeof step?.action === 'string' ? step.action : undefined;
    if (explicitAction) {
      const match = this.resolve(explicitAction);
      if (match) return match;
    }

    const direct = ACTION_BY_TOOL.get(toolId);
    if (direct) {
      return { ...direct, required_permissions: [...direct.required_permissions], emitted_events: [...direct.emitted_events] };
    }

    return this.fallback(toolId);
  }

  private fallback(toolId: string): RasedRegisteredAction {
    const internal = toolId.startsWith('rased.');
    const meta = internal ? RASED_TOOL_REGISTRY[toolId as RasedToolId] : null;

    return {
      action: internal ? toolId.replace(/_/g, '.').replace(/^rased\./, 'rased.') : toolId.replace(/\./g, '_'),
      tool_id: toolId,
      engine: internal ? toolId.split('.')[1] ?? 'rased' : toolId.split('.')[0] ?? 'external',
      required_permissions: internal && meta ? [...meta.required_permissions] : [],
      sensitive: /publish|delete|export|connector|revoke|overwrite/i.test(toolId),
      async: !internal,
      emitted_events: ['rased.action.requested', 'rased.action.completed'],
    };
  }
}
