import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { RasedAgentOsService } from '../services/rased-agent-os.service';

const context = {
  workspace_id: 'workspace-test',
  user_id: 'user-test',
  mode: 'AUTO' as const,
  arabic_mode: 'ELITE' as const,
  locale: 'ar-SA',
};

function request(toolId: string, inputs: Record<string, unknown>, params: Record<string, unknown> = {}) {
  return {
    request_id: `req_${toolId.replace(/\./g, '_')}`,
    tool_id: toolId,
    context,
    inputs,
    params,
  };
}

describe('RasedAgentOsService', () => {
  let service: RasedAgentOsService;
  let rootDir: string;
  let fetchLog: Array<{ url: string; method: string; body: string | null }>;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'rased-agent-os-'));
    fetchLog = [];
    service = new RasedAgentOsService({
      rootDir,
      now: () => new Date('2026-03-10T08:00:00.000Z'),
      fetchImpl: (async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const method = init?.method ?? 'GET';
        const body = typeof init?.body === 'string' ? init.body : null;
        fetchLog.push({ url, method, body });

        const json = (status: number, payload: unknown) => ({
          ok: status >= 200 && status < 300,
          status,
          headers: { get: () => 'application/json' },
          json: async () => payload,
          text: async () => JSON.stringify(payload),
        });

        if (url.endsWith('/api/v1/governance/runtime/registry')) {
          return json(200, {
            success: true,
            data: {
              generated_at: '2026-03-10T08:00:00.000Z',
              tools: [
                {
                  tool_id: 'slides.build_deck',
                  service: 'presentation-service',
                  execute_url: 'http://localhost:8005/api/v1/tools/execute',
                  required_permissions: ['slides:execute'],
                  evidence_required: true,
                  strict_profile: 'NONE',
                  async_mode: 'async',
                  input_schema_path: 'C:/schemas/slides.build_deck.input.json',
                  output_schema_path: 'C:/schemas/slides.build_deck.output.json',
                },
              ],
            },
          });
        }

        if (url.endsWith('/api/v1/governance/runtime/evidence/create')) {
          return json(201, {
            success: true,
            data: {
              evidence_id: 'evidence_runtime_01',
              status: 'open',
              created_at: '2026-03-10T08:00:00.000Z',
              context: {},
              summary: {},
              attachments: [],
              closure: null,
            },
          });
        }

        if (url.includes('/api/v1/governance/runtime/evidence/evidence_runtime_01/attach')) {
          return json(200, {
            success: true,
            data: {
              evidence_id: 'evidence_runtime_01',
              status: 'open',
              created_at: '2026-03-10T08:00:00.000Z',
              context: {},
              summary: {},
              attachments: [{ kind: 'artifact' }],
              closure: null,
            },
          });
        }

        if (url.includes('/api/v1/governance/runtime/evidence/evidence_runtime_01/close')) {
          return json(200, {
            success: true,
            data: {
              evidence_id: 'evidence_runtime_01',
              status: 'closed',
              created_at: '2026-03-10T08:00:00.000Z',
              closed_at: '2026-03-10T08:01:00.000Z',
              context: {},
              summary: {},
              attachments: [{ kind: 'artifact' }],
              closure: { pass: true },
            },
          });
        }

        if (url === 'http://localhost:8005/api/v1/tools/execute') {
          const parsedBody = body ? JSON.parse(body) as { request_id: string; tool_id: string } : { request_id: 'unknown', tool_id: 'unknown' };
          return json(200, {
            success: true,
            data: {
              request_id: parsedBody.request_id,
              tool_id: parsedBody.tool_id,
              status: 'ok',
              refs: {
                artifact: {
                  artifact_id: 'artifact_slide_runtime_01',
                  kind: 'json',
                  uri: join(rootDir, 'runtime-slide.json'),
                },
              },
              warnings: [],
            },
          });
        }

        if (url === 'https://example.com/api/health') {
          return json(200, { ok: true });
        }

        return json(404, {
          success: false,
          data: {
            status: 'failed',
            refs: {},
            failure: {
              code: 'FETCH_NOT_MOCKED',
              message: `No mock defined for ${url}`,
            },
          },
        });
      }) as unknown as typeof fetch,
    });
  });

  it('parses intent and builds a deterministic action graph', async () => {
    const intent = await service.handleTool('rased.intent_parse', request('rased.intent_parse', {
      prompt: 'حوّل PDF إلى PPTX 1:1 مع إرشاد',
      assets: [{
        asset_id: 'asset_pdf_1234',
        uri: 'C:/tmp/source.pdf',
        mime: 'application/pdf',
        sha256: 'a'.repeat(64),
      }],
    }));
    const intentRefs = intent.refs as { intent_manifest: any };

    expect(intent.status).toBe('ok');
    expect(intentRefs.intent_manifest.engine_targets).toContain('strict');
    expect(intentRefs.intent_manifest.controls.guided_tour_requested).toBe(true);

    const plan = await service.handleTool('rased.plan_action_graph', request('rased.plan_action_graph', {
      intent_manifest: intentRefs.intent_manifest,
    }, {
      deterministic: true,
    }));
    const planRefs = plan.refs as { action_graph: any };

    expect(plan.status).toBe('ok');
    expect(planRefs.action_graph.steps.length).toBeGreaterThanOrEqual(3);
    expect(planRefs.action_graph.graph_id).toMatch(/^graph_/);
  });

  it('stores preferences, ingests knowledge, and returns search hits', async () => {
    const knowledgeFile = join(rootDir, 'knowledge.txt');
    writeFileSync(knowledgeFile, 'سياسة مشاركة التقارير الحكومية تمنع النشر العام بدون اعتماد.', 'utf8');

    const setPrefs = await service.handleTool('rased.preference.set', request('rased.preference.set', {
      values: {
        tone: 'official',
        reduce_motion: true,
        evidence_visibility: true,
      },
    }, {
      scope: 'workspace',
    }));
    const prefsRefs = setPrefs.refs as { preferences: any };

    expect(setPrefs.status).toBe('ok');
    expect(prefsRefs.preferences.reduce_motion).toBe(true);

    const ingest = await service.handleTool('rased.training.pack.ingest', request('rased.training.pack.ingest', {
      pack_name: 'gov-pack',
      assets: [{
        asset_id: 'asset_text_1234',
        uri: knowledgeFile,
        mime: 'text/plain',
        sha256: 'b'.repeat(64),
      }],
    }, {
      scope: 'workspace',
    }));

    expect(ingest.status).toBe('ok');
    expect(ingest.refs.pack_id).toMatch(/^pack_/);

    const search = await service.handleTool('rased.knowledge.search', request('rased.knowledge.search', {
      query: 'مشاركة التقارير الحكومية',
    }, {
      top_k: 5,
    }));
    const searchRefs = search.refs as { chunks: Array<{ snippet: string }> };

    expect(search.status).toBe('ok');
    expect(searchRefs.chunks.length).toBeGreaterThan(0);
    expect(searchRefs.chunks[0].snippet).toContain('التقارير');
  });

  it('syncs UI state, dispatches actions, and tracks tours', async () => {
    await service.syncUiState(context, {
      selection: { kind: 'result', id: 'result-1' },
      open_panels: ['context'],
      focus_stage: { open: true, artifact: 'artifact-1' },
      running_jobs: [{ id: 'job-1', stage: 'verifying' }],
    });

    const observed = await service.handleTool('rased.observe_ui_state', request('rased.observe_ui_state', {}));
    const observedRefs = observed.refs as { ui_state: any };
    expect(observed.status).toBe('ok');
    expect(observedRefs.ui_state.focus_stage.open).toBe(true);

    const dispatched = await service.handleTool('rased.ui_action.dispatch', request('rased.ui_action.dispatch', {
      actions: [{ type: 'open_sidebar', target_rased_id: 'sidebar.toggle' }],
    }));
    expect(dispatched.status).toBe('ok');
    expect(dispatched.refs.applied).toBe(1);

    const started = await service.handleTool('rased.ui_tour.start', request('rased.ui_tour.start', {
      tour: {
        name: 'pdf tour',
        mode: 'coach',
        steps: [{ step_id: 'step-1', target_rased_id: 'action.convert', title: 'تحويل', body: 'ابدأ من هنا' }],
      },
    }));
    const startedRefs = started.refs as { tour_session_id: string };
    expect(started.status).toBe('ok');

    const stepped = await service.handleTool('rased.ui_tour.step', request('rased.ui_tour.step', {
      tour_session_id: startedRefs.tour_session_id,
      step_index: 0,
      target_rased_id: 'action.convert',
      status: 'completed',
    }));
    expect(stepped.refs.progress).toBe(1);

    const ended = await service.handleTool('rased.ui_tour.end', request('rased.ui_tour.end', {
      tour_session_id: startedRefs.tour_session_id,
      outcome: 'completed',
    }));
    expect(ended.status).toBe('ok');
    expect(ended.refs.completion_rate).toBe(1);
  });

  it('checks policy, executes action graphs, and creates evidence', async () => {
    const denied = await service.handleTool('rased.policy.check', request('rased.policy.check', {
      operation: 'publish',
      target: 'public-link',
      command_text: 'انشر الآن',
      classification: 'internal',
    }, {}));

    expect(denied.status).toBe('ok');
    expect(denied.refs.allow).toBe(false);
    expect(denied.refs.required_token).toBe('CONFIRM PUBLISH');

    const plan = await service.handleTool('rased.plan_action_graph', request('rased.plan_action_graph', {
      intent_manifest: {
        goal: 'guidance',
        engine_targets: ['slides'],
        exports: ['pptx'],
        controls: {},
        risk_level: 'low',
      },
    }, {
      deterministic: true,
    }));
    const planRefs = plan.refs as { action_graph: any };

    const executed = await service.handleTool('rased.execute_action_graph', request('rased.execute_action_graph', {
      action_graph: planRefs.action_graph,
    }, {
      must_produce_evidence: true,
    }));
    const executedRefs = executed.refs as { action_ids: string[]; artifacts: Array<{ kind: string; uri: string }>; evidence_id: string };

    expect(executed.status).toBe('ok');
    expect(executedRefs.action_ids.length).toBeGreaterThan(0);
    expect(executedRefs.artifacts[0].kind).toBe('json');
    expect(executedRefs.evidence_id).toBe('evidence_runtime_01');
    expect(fetchLog.some((entry) => entry.url.endsWith('/api/v1/governance/runtime/registry'))).toBe(true);
    expect(fetchLog.some((entry) => entry.url === 'http://localhost:8005/api/v1/tools/execute')).toBe(true);
    expect(fetchLog.some((entry) => entry.url.includes('/api/v1/governance/runtime/evidence/evidence_runtime_01/close'))).toBe(true);
    const externalInvocation = fetchLog.find((entry) => entry.url === 'http://localhost:8005/api/v1/tools/execute');
    expect(externalInvocation).toBeTruthy();
    expect(JSON.parse(externalInvocation!.body ?? '{}').tool_id).toBe('slides.build_deck');

    const evidence = await service.handleTool('rased.evidence.pack', request('rased.evidence.pack', {
      action_graph: planRefs.action_graph,
      action_ids: executedRefs.action_ids,
      artifacts: executedRefs.artifacts,
      reports: { parity: 'pass' },
    }));
    const evidenceRefs = evidence.refs as { evidence_id: string; artifact: { uri: string } };

    expect(evidence.status).toBe('ok');
    expect(evidenceRefs.evidence_id).toBe('evidence_runtime_01');
    expect(existsSync(evidenceRefs.artifact.uri)).toBe(true);

    const explain = await service.handleTool('rased.explain.trace', request('rased.explain.trace', {
      action_graph: planRefs.action_graph,
      execution: { artifacts: executedRefs.artifacts },
      evidence_id: evidenceRefs.evidence_id,
    }));

    expect(explain.status).toBe('ok');
    expect(explain.refs.explanation).toContain('الخطة');
  });

  it('writes schema-compatible connector audit on allowlisted calls', async () => {
    const connector = await service.handleTool('rased.connector.call', request('rased.connector.call', {
      connector_id: 'example-api',
      request: {
        method: 'GET',
        url: 'https://example.com/api/health',
      },
    }, {
      allowlisted_hosts: ['example.com'],
      classification: 'public',
    }));
    const connectorRefs = connector.refs as { ok: boolean; status_code: number; audit_id: string };

    expect(connector.status).toBe('ok');
    expect(connectorRefs.ok).toBe(true);
    expect(connectorRefs.status_code).toBe(200);
    expect(readFileSync(join(rootDir, 'connectors', `${connectorRefs.audit_id}.json`), 'utf8')).toContain('example-api');
  });

  it('blocks sensitive execution steps without the required explicit command token', async () => {
    const blocked = await service.handleTool('rased.execute_action_graph', request('rased.execute_action_graph', {
      action_graph: {
        graph_id: 'graph_block_publish',
        goal: 'publish',
        classification: 'internal',
        steps: [
          {
            step_id: 'step-01-publish',
            tool_id: 'dashboard.publish',
            action: 'dashboard.publish',
            label: 'نشر عام',
            phase: 'execution',
          },
        ],
      },
    }, {
      must_produce_evidence: true,
    }));

    expect(blocked.status).toBe('failed');
    expect(blocked.failure?.code).toBe('ACTION_BLOCKED_BY_GUARDRAIL');
    expect(existsSync((blocked.refs as { failure_report: { uri: string } }).failure_report.uri)).toBe(true);
    expect(existsSync(join(rootDir, 'registries', 'action-registry.json'))).toBe(true);
    expect(existsSync(join(rootDir, 'registries', 'guardrail-rules.json'))).toBe(true);
  });
});
