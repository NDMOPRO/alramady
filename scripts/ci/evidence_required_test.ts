import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rasedCanvasMachine } from '../../frontend/state/rasedCanvas.machine.ts';
import { RasedAgentOsService } from '../../services/ai-service/src/services/rased-agent-os.service.ts';

const context = {
  workspace_id: 'workspace-evidence',
  user_id: 'user-evidence',
  mode: 'AUTO' as const,
  arabic_mode: 'ELITE' as const,
  locale: 'ar-SA',
};

function jsonResponse(status: number, payload: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

async function main() {
  const { createActor } = await import(pathToFileURL(join(process.cwd(), 'frontend', 'node_modules', 'xstate', 'dist', 'xstate.esm.js')).href);
  const actor = createActor(rasedCanvasMachine).start();
  actor.send({ type: 'APP/READY' });
  actor.send({ type: 'JOB/CREATE', jobId: 'job-evidence-1' });
  actor.send({ type: 'JOB/RESULT_READY', jobId: 'job-evidence-1', artifactIds: ['artifact-1'], resultCardId: 'card.result.job-evidence-1' });

  let snapshot = actor.getSnapshot();
  assert.equal(snapshot.context.jobs.byId['job-evidence-1']?.stage, 'exporting', 'job must stay exporting before evidence');
  assert.equal(snapshot.context.jobs.byId['job-evidence-1']?.evidenceId, undefined, 'job must not hold evidence before evidence event');

  actor.send({ type: 'JOB/EVIDENCE_READY', jobId: 'job-evidence-1', evidenceId: 'evidence-1', evidenceCardId: 'card.evidence.job-evidence-1' });
  snapshot = actor.getSnapshot();
  assert.equal(snapshot.context.jobs.byId['job-evidence-1']?.stage, 'completed', 'job must become completed only after evidence');
  assert.equal(snapshot.context.jobs.byId['job-evidence-1']?.evidenceId, 'evidence-1', 'job must store evidence id on completion');

  const service = new RasedAgentOsService({
    rootDir: mkdtempSync(join(tmpdir(), 'rasid-evidence-required-')),
    now: () => new Date('2026-03-10T08:00:00.000Z'),
    fetchImpl: (async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {};

      if (url.endsWith('/api/v1/governance/runtime/registry')) {
        return jsonResponse(200, {
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
                input_schema_path: 'schemas/slides/tools/slides.build_deck.input.json',
                output_schema_path: 'schemas/slides/tools/slides.build_deck.output.json',
              },
            ],
          },
        });
      }

      if (url.endsWith('/api/v1/governance/runtime/evidence/create')) {
        return jsonResponse(201, {
          success: true,
          data: {
            evidence_id: 'evidence-required-1',
            status: 'open',
            created_at: '2026-03-10T08:00:00.000Z',
            context: {},
            summary: {},
            attachments: [],
            closure: null,
          },
        });
      }

      if (url.includes('/api/v1/governance/runtime/evidence/evidence-required-1/attach')) {
        return jsonResponse(200, {
          success: true,
          data: {
            evidence_id: 'evidence-required-1',
            status: 'open',
            created_at: '2026-03-10T08:00:00.000Z',
            context: {},
            summary: {},
            attachments: [{ kind: 'artifact' }],
            closure: null,
          },
        });
      }

      if (url.includes('/api/v1/governance/runtime/evidence/evidence-required-1/close')) {
        return jsonResponse(500, {
          success: false,
          error: 'evidence close failed',
        });
      }

      if (url === 'http://localhost:8005/api/v1/tools/execute') {
        return jsonResponse(200, {
          request_id: String(body.request_id ?? 'req'),
          tool_id: String(body.tool_id ?? 'slides.build_deck'),
          status: 'ok',
          refs: {
            artifact: {
              artifact_id: 'artifact-slide-01',
              kind: 'json',
              uri: join(tmpdir(), 'artifact-slide-01.json'),
            },
          },
          warnings: [],
        });
      }

      return jsonResponse(404, {
        status: 'failed',
        refs: {},
        failure: {
          code: 'NOT_MOCKED',
          message: `No mock for ${url}`,
        },
      });
    }) as unknown as typeof fetch,
  });

  const plan = await service.handleTool('rased.plan_action_graph', {
    request_id: 'req_plan_evidence',
    tool_id: 'rased.plan_action_graph',
    context,
    inputs: {
      intent_manifest: {
        goal: 'build slides',
        engine_targets: ['slides'],
        exports: ['pptx'],
        controls: {},
        risk_level: 'low',
      },
    },
    params: {
      deterministic: true,
    },
  });

  assert.equal(plan.status, 'ok', 'planning must succeed before execution');

  const executed = await service.handleTool('rased.execute_action_graph', {
    request_id: 'req_execute_evidence',
    tool_id: 'rased.execute_action_graph',
    context,
    inputs: {
      action_graph: plan.refs.action_graph,
    },
    params: {
      must_produce_evidence: true,
    },
  });

  assert.equal(executed.status, 'failed', 'execution must fail if evidence finalization fails');
  assert.notEqual(executed.failure?.code, undefined, 'failure code must be present');
  assert.equal((executed.refs as Record<string, unknown>).evidence_id, undefined, 'failed execution must not surface an evidence id');

  console.log('evidence-required:ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
