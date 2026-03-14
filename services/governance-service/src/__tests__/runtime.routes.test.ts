import express from 'express';
import request from 'supertest';
import runtimeRoutes from '../routes/runtime.routes';
import { RuntimeRegistryService } from '../services/runtime-registry.service';
import { RuntimeEvidenceService } from '../services/runtime-evidence.service';

describe('governance runtime routes', () => {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/v1/governance/runtime', runtimeRoutes);
  app.use('/api/v1', runtimeRoutes);

  it('returns registry entries with execute urls and strict flags', async () => {
    const response = await request(app).get('/api/v1/governance/runtime/registry');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data.tools)).toBe(true);

    const strictTool = response.body.data.tools.find((entry: { tool_id: string }) => entry.tool_id === 'verify.pixel_diff');
    expect(strictTool).toBeTruthy();
    expect(strictTool.strict_profile).toBe('STRICT_PIXEL_LOCK_FINAL');
    expect(strictTool.execute_url).toMatch(/\/api\/v1\/tools\/execute$/);
  });

  it('serves registry aliases and individual tools', async () => {
    const tools = await request(app).get('/api/v1/registry/tools');
    expect(tools.status).toBe(200);
    expect(Array.isArray(tools.body.data.tools)).toBe(true);

    const single = await request(app).get('/api/v1/registry/tools/slides.build_deck');
    expect(single.status).toBe(200);
    expect(single.body.data.tool_id).toBe('slides.build_deck');

    const missing = await request(app).get('/api/v1/registry/tools/unknown.tool');
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('TOOL_NOT_FOUND');
  });

  it('returns runtime actions derived from the registry', async () => {
    const response = await request(app).get('/api/v1/registry/actions');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data.actions)).toBe(true);
    expect(response.body.data.actions.some((entry: { action: string }) => entry.action === 'slides.build_deck')).toBe(true);
  });

  it('falls back to the bundled registry when workspace schemas are unavailable', () => {
    const registry = new RuntimeRegistryService('C:/__missing_workspace_root__');
    const tools = registry.listTools();

    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some((entry) => entry.tool_id === 'slides.build_deck')).toBe(true);
  });

  it('normalizes bundled registry paths and uses internal service urls inside containers', () => {
    const previousServiceName = process.env.SERVICE_NAME;
    process.env.SERVICE_NAME = 'governance-service';

    try {
      const registry = new RuntimeRegistryService('C:/__missing_workspace_root__');
      const deckTool = registry.getTool('slides.build_deck');

      expect(deckTool).toBeTruthy();
      expect(deckTool?.execute_url).toBe('http://presentation-service:8005/api/v1/tools/execute');
      expect(deckTool?.input_schema_path).toMatch(/^schemas\//);
      expect(deckTool?.input_schema_path).not.toMatch(/^[A-Za-z]:/);
    } finally {
      if (previousServiceName === undefined) {
        delete process.env.SERVICE_NAME;
      } else {
        process.env.SERVICE_NAME = previousServiceName;
      }
    }
  });

  it('stores evidence records even when workspace root is unavailable', () => {
    const service = new RuntimeEvidenceService('C:/__missing_workspace_root__');
    const record = service.create({ workspace_id: 'fallback' }, { goal: 'fallback-evidence' });

    expect(record.evidence_id).toMatch(/^evidence_/);
    expect(service.read(record.evidence_id).summary.goal).toBe('fallback-evidence');
  });

  it('creates, attaches, and closes runtime evidence packs', async () => {
    const created = await request(app)
      .post('/api/v1/governance/runtime/evidence/create')
      .send({
        context: {
          workspace_id: 'workspace-01',
          user_id: 'user-01',
        },
        summary: {
          goal: 'strict-export',
        },
      });

    expect(created.status).toBe(201);
    const evidenceId = created.body.data.evidence_id;

    const attached = await request(app)
      .post(`/api/v1/governance/runtime/evidence/${evidenceId}/attach`)
      .send({
        attachment: {
          kind: 'artifact',
          artifact_id: 'artifact-01',
        },
      });

    expect(attached.status).toBe(200);
    expect(attached.body.data.attachments).toHaveLength(1);

    const closed = await request(app)
      .post(`/api/v1/governance/runtime/evidence/${evidenceId}/close`)
      .send({
        closure: {
          pass: true,
          artifact_ids: ['artifact-01'],
        },
      });

    expect(closed.status).toBe(200);
    expect(closed.body.data.status).toBe('closed');
    expect(closed.body.data.closure.pass).toBe(true);
  });

  it('rejects evidence mutation after close', async () => {
    const created = await request(app)
      .post('/api/v1/evidence/create')
      .send({
        context: {
          workspace_id: 'workspace-immutable',
          user_id: 'user-immutable',
        },
        summary: {
          goal: 'immutability-check',
        },
      });

    const evidenceId = created.body.data.evidence_id;

    const closed = await request(app)
      .post(`/api/v1/evidence/${evidenceId}/close`)
      .send({
        closure: {
          pass: true,
          artifact_ids: ['artifact-immutable'],
        },
      });

    expect(closed.status).toBe(200);

    const attachAfterClose = await request(app)
      .post(`/api/v1/evidence/${evidenceId}/attach`)
      .send({
        attachment: {
          kind: 'artifact',
          artifact_id: 'artifact-immutable',
        },
      });

    expect(attachAfterClose.status).toBe(409);
    expect(attachAfterClose.body.code).toBe('EVIDENCE_IMMUTABLE');
  });

  it('returns 422 on invalid evidence payloads', async () => {
    const response = await request(app)
      .post('/api/v1/evidence/create')
      .send({
        context: {
          workspace_id: 'workspace-bad',
        },
      });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('RUNTIME_SCHEMA_VALIDATION_FAILED');
  });
});
