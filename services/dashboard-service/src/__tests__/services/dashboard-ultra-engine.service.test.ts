import '../setup';
import { createHash } from 'crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as XLSX from 'xlsx';
import {
  executeDashboardTool,
  getArtifact,
  getDashboard,
  getEvidence,
  listDashboardTools,
  resetDashboardUltraEngine,
} from '../../services/dashboard-ultra-engine.service.js';

const context = {
  workspace_id: 'workspace-1',
  user_id: 'user-1',
  mode: 'AUTO' as const,
  arabic_mode: 'ELITE' as const,
  locale: 'ar-SA',
};

function makeAsset(assetId: string, filePath: string, mime: string) {
  const buffer = readFileSync(filePath);
  return {
    asset_id: assetId,
    uri: filePath,
    mime,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}

describe('dashboard ultra engine service', () => {
  beforeEach(() => {
    resetDashboardUltraEngine();
  });

  it('executes the dashboard engine end-to-end with real exports and evidence', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'rasid-dash-ultra-'));
    const csvPath = join(tempDir, 'sales.csv');
    const xlsxPath = join(tempDir, 'targets.xlsx');
    writeFileSync(csvPath, 'date,region,revenue,orders\n2026-01-31,East,1200,12\n2026-02-28,West,1800,18\n2026-03-31,North,1400,14\n', 'utf8');

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['date', 'region', 'target'],
      ['2026-01-31', 'East', 1100],
      ['2026-02-28', 'West', 1750],
      ['2026-03-31', 'North', 1500],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Targets');
    XLSX.writeFile(workbook, xlsxPath);

    const intent = await executeDashboardTool({
      request_id: 'dash-1',
      tool_id: 'dashboard.intent_parse',
      context,
      inputs: {
        prompt: 'أنشئ لوحة تنفيذية للمبيعات مع KPI واتجاهات واستثناءات',
        assets: [
          makeAsset('asset_csv', csvPath, 'text/csv'),
          makeAsset('asset_xlsx', xlsxPath, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
        ],
      },
      params: {
        strict_import: false,
        pages_hint: 4,
      },
    });
    const intentRef = intent.refs.intent as { dataset_refs: Array<{ dataset_id: string }>; page_count: number };
    expect(intentRef.dataset_refs.length).toBe(2);
    expect(intentRef.page_count).toBe(4);

    const catalog = await executeDashboardTool({
      request_id: 'dash-2',
      tool_id: 'dashboard.catalog_search',
      context,
      inputs: { query: 'kpi executive' },
      params: { catalog: 'kpi_card_catalog', top_k: 10 },
    });
    const catalogItems = catalog.refs.items as Array<{ item_id: string }>;
    expect(catalogItems).toHaveLength(10);

    const plan = await executeDashboardTool({
      request_id: 'dash-3',
      tool_id: 'dashboard.plan',
      context,
      inputs: { intent: intent.refs.intent as any },
      params: {},
    });

    const build = await executeDashboardTool({
      request_id: 'dash-4',
      tool_id: 'dashboard.build',
      context,
      inputs: { dashboard_ir_plan: plan.refs.dashboard_ir_plan as any },
      params: {},
    });
    const dashboardRef = build.refs.dashboard as { dashboard_id: string; page_count: number };

    const bind = await executeDashboardTool({
      request_id: 'dash-5',
      tool_id: 'dashboard.bind_data',
      context,
      inputs: {
        dashboard: dashboardRef,
        datasets: intentRef.dataset_refs,
        tir_steps: [{ op: 'derive', column: 'revenue_with_tax', source: 'revenue', multiplier: 1.15 }],
        mir_measures: [{ name: 'revenue_total', op: 'sum', column: 'revenue' }],
      },
      params: {},
    });
    expect((bind.refs.dashboard as { dashboard_id: string }).dashboard_id).toBe(dashboardRef.dashboard_id);

    const dashboard = getDashboard(dashboardRef.dashboard_id)!;
    dashboard.ir.pages[0].widgets[1].bbox = { ...dashboard.ir.pages[0].widgets[0].bbox };

    const qaFail = await executeDashboardTool({
      request_id: 'dash-6',
      tool_id: 'dashboard.qa_validate',
      context,
      inputs: { dashboard: dashboardRef },
      params: { must_pass_all: true },
    });
    expect((qaFail.refs.pass as boolean)).toBe(false);

    const qaFix = await executeDashboardTool({
      request_id: 'dash-7',
      tool_id: 'dashboard.qa_autofix',
      context,
      inputs: {
        dashboard: dashboardRef,
        issues: qaFail.refs.issues as any,
      },
      params: {},
    });
    expect((qaFix.refs.fix_log as Array<Record<string, unknown>>).length).toBeGreaterThan(0);

    const qaPass = await executeDashboardTool({
      request_id: 'dash-8',
      tool_id: 'dashboard.qa_validate',
      context,
      inputs: { dashboard: dashboardRef },
      params: { must_pass_all: true },
    });
    expect((qaPass.refs.pass as boolean)).toBe(true);

    const preview = await executeDashboardTool({
      request_id: 'dash-9',
      tool_id: 'dashboard.render_preview',
      context,
      inputs: { dashboard: dashboardRef },
      params: { dpi: 160 },
    });
    const previewArtifacts = preview.refs.renders as Array<{ artifact_id: string; uri: string }>;
    expect(previewArtifacts.length).toBe(4);
    expect(existsSync(previewArtifacts[0].uri)).toBe(true);

    const htmlExport = await executeDashboardTool({
      request_id: 'dash-10',
      tool_id: 'dashboard.export',
      context,
      inputs: { dashboard: dashboardRef },
      params: { export_kind: 'html' },
    });
    const pdfExport = await executeDashboardTool({
      request_id: 'dash-11',
      tool_id: 'dashboard.export',
      context,
      inputs: { dashboard: dashboardRef },
      params: { export_kind: 'pdf' },
    });
    const pptxExport = await executeDashboardTool({
      request_id: 'dash-12',
      tool_id: 'dashboard.export',
      context,
      inputs: { dashboard: dashboardRef },
      params: { export_kind: 'pptx' },
    });
    const docxExport = await executeDashboardTool({
      request_id: 'dash-13',
      tool_id: 'dashboard.export',
      context,
      inputs: { dashboard: dashboardRef },
      params: { export_kind: 'docx' },
    });
    const xlsxExport = await executeDashboardTool({
      request_id: 'dash-14',
      tool_id: 'dashboard.export',
      context,
      inputs: { dashboard: dashboardRef },
      params: { export_kind: 'xlsx' },
    });
    const htmlArtifact = htmlExport.refs.artifact as { artifact_id: string; uri: string };
    const pdfArtifact = pdfExport.refs.artifact as { artifact_id: string; uri: string };
    const pptxArtifact = pptxExport.refs.artifact as { artifact_id: string; uri: string };
    const docxArtifact = docxExport.refs.artifact as { artifact_id: string; uri: string };
    const xlsxArtifact = xlsxExport.refs.artifact as { artifact_id: string; uri: string };
    [htmlArtifact, pdfArtifact, pptxArtifact, docxArtifact, xlsxArtifact].forEach(artifact => {
      expect(existsSync(artifact.uri)).toBe(true);
    });

    const publish = await executeDashboardTool({
      request_id: 'dash-15',
      tool_id: 'dashboard.publish',
      context,
      inputs: {
        dashboard: dashboardRef,
        share_policy: { visibility: 'workspace', access: 'view' },
        permissions: { can_export: true, can_comment: true },
      },
      params: {},
    });
    const publishRef = publish.refs.link_ref as { artifact_id: string; uri: string };
    expect(existsSync(publishRef.uri)).toBe(true);

    const parity = await executeDashboardTool({
      request_id: 'dash-16',
      tool_id: 'dashboard.parity_verify',
      context,
      inputs: {
        dashboard: dashboardRef,
        artifact: htmlExport.refs.artifact as any,
      },
      params: {},
    });
    expect((parity.refs.pass as boolean)).toBe(true);

    const evidence = await executeDashboardTool({
      request_id: 'dash-17',
      tool_id: 'dashboard.evidence_pack',
      context,
      inputs: {
        dashboard: dashboardRef,
        artifacts: [
          htmlExport.refs.artifact as any,
          pdfExport.refs.artifact as any,
          pptxExport.refs.artifact as any,
          docxExport.refs.artifact as any,
          xlsxExport.refs.artifact as any,
        ],
        qa_report: qaPass.refs as any,
        parity_report: parity.refs as any,
      },
      params: {},
    });
    const evidenceId = evidence.refs.evidence_id as string;
    expect(getEvidence(evidenceId)?.artifact_ids.length).toBe(5);
    expect(getArtifact(htmlArtifact.artifact_id)?.render_manifest_uri).toBeTruthy();
    expect(listDashboardTools()).toHaveLength(12);
  });

  it('rejects malformed requests by contract', async () => {
    await expect(executeDashboardTool({
      request_id: 'dash-bad',
      tool_id: 'dashboard.export',
      context,
      inputs: {},
      params: { export_kind: 'pdf' },
    } as any)).rejects.toThrow('dashboard');
  });
});
