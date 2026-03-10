import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RuntimeRegistryService } from '../../services/governance-service/src/services/runtime-registry.service.ts';
import { executeSlidesTool } from '../../services/presentation-service/src/services/gamma-engine.service.ts';
import { executeExcelTool } from '../../services/excel-service/src/services/excel-ultra-engine.service.ts';
import { executeDashboardTool } from '../../services/dashboard-service/src/services/dashboard-ultra-engine.service.ts';
import { executeReportTool } from '../../services/reporting-service/src/services/report-ultra-engine.service.ts';
import { executeLctTool } from '../../services/conversion-service/src/services/lct-ultra-engine.service.ts';
import { initStrictEngine, executeTool as executeStrictTool } from '../../services/replication-service/src/strict/index.ts';
import { RasedAgentOsService } from '../../services/ai-service/src/services/rased-agent-os.service.ts';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const routeFiles: Record<string, string> = {
  'presentation-service': resolve(rootDir, 'services/presentation-service/src/routes/tools.routes.ts'),
  'excel-service': resolve(rootDir, 'services/excel-service/src/routes/tools.routes.ts'),
  'dashboard-service': resolve(rootDir, 'services/dashboard-service/src/routes/tools.routes.ts'),
  'reporting-service': resolve(rootDir, 'services/reporting-service/src/routes/tools.routes.ts'),
  'conversion-service': resolve(rootDir, 'services/conversion-service/src/routes/tools.routes.ts'),
  'replication-service': resolve(rootDir, 'services/replication-service/src/routes/tools.routes.ts'),
  'ai-service': resolve(rootDir, 'services/ai-service/src/routes/rased.routes.ts'),
};

async function expectReject(label: string, run: () => Promise<unknown>) {
  let rejected = false;
  try {
    await run();
  } catch {
    rejected = true;
  }

  assert.equal(rejected, true, `${label} must reject invalid ToolEnvelope payloads`);
}

async function main() {
  const registry = new RuntimeRegistryService(rootDir);
  const tools = registry.listTools();

  assert.ok(tools.length > 0, 'runtime registry must expose at least one tool');

  for (const tool of tools) {
    assert.ok(tool.tool_id.length > 0, 'tool_id must be present');
    assert.ok(tool.execute_url.endsWith('/api/v1/tools/execute'), `${tool.tool_id} must use the unified execute endpoint`);
    assert.ok(tool.input_schema_path.length > 0 && existsSync(tool.input_schema_path), `${tool.tool_id} input schema must exist`);
    assert.ok(tool.output_schema_path && existsSync(tool.output_schema_path), `${tool.tool_id} output schema must exist`);
    assert.ok(routeFiles[tool.service] && existsSync(routeFiles[tool.service]), `${tool.tool_id} route source must exist for ${tool.service}`);
  }

  initStrictEngine();
  await expectReject('slides.execute', async () => { await executeSlidesTool({} as never); });
  await expectReject('excel.execute', async () => { await executeExcelTool({} as never); });
  await expectReject('dashboard.execute', async () => { await executeDashboardTool({} as never); });
  await expectReject('report.execute', async () => { await executeReportTool({} as never); });
  await expectReject('conversion.execute', async () => { await executeLctTool({} as never); });
  await expectReject('replication.execute', async () => { await executeStrictTool({} as never); });

  const rased = new RasedAgentOsService({ rootDir: resolve(rootDir, '.tmp-rased-tool-schema') });
  await expectReject('ai.execute', async () => { await rased.handleTool('rased.intent_parse', {} as never); });

  console.log(`tool-schema-validate:ok (${tools.length} tools)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
