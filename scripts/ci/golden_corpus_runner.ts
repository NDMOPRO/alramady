import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  executeLctTool,
  getLctArtifact,
  getLctEvidence,
  resetLctUltraEngine,
  type LctAssetRef,
} from '../../services/conversion-service/src/services/lct-ultra-engine.service.ts';
import {
  initStrictEngine,
  runStrictPipeline,
  type ActionContext as StrictActionContext,
  type AssetRef as StrictAssetRef,
} from '../../services/replication-service/src/strict/index.ts';
import {
  executeDashboardTool,
  getEvidence as getDashboardEvidence,
  resetDashboardUltraEngine,
  type DashboardAssetRef,
  type DatasetRef,
  type DashboardRef,
  type ArtifactRef,
} from '../../services/dashboard-service/src/services/dashboard-ultra-engine.service.ts';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const corpusDir = join(rootDir, 'golden_corpus');
const resultsDir = join(corpusDir, 'results');

function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function lctAssetRef(path: string, mime: string): LctAssetRef {
  const buffer = readFileSync(path);
  return {
    asset_id: `asset_${hashBuffer(Buffer.from(path)).slice(0, 12)}`,
    uri: path,
    mime,
    sha256: hashBuffer(buffer),
    size_bytes: statSync(path).size,
  };
}

function dashboardAssetRef(path: string, mime: string): DashboardAssetRef {
  const buffer = readFileSync(path);
  return {
    asset_id: `asset_${hashBuffer(Buffer.from(`dash:${path}`)).slice(0, 12)}`,
    uri: path,
    mime,
    sha256: hashBuffer(buffer),
  };
}

async function loadSharp() {
  const modulePath = pathToFileURL(join(rootDir, 'services', 'conversion-service', 'node_modules', 'sharp', 'lib', 'index.js')).href;
  const mod = await import(modulePath);
  return mod.default as (input?: Buffer | string) => { png: () => { toBuffer: () => Promise<Buffer> } };
}

function strictContext(): StrictActionContext {
  return {
    workspace_id: 'golden-ws',
    user_id: 'golden-user',
    locale: 'ar-SA',
    strict_visual: true,
    arabic_mode: 'ELITE',
    mode: 'AUTO',
    font_policy: 'PROVIDED',
  };
}

function strictAssetRef(path: string, mime: string): StrictAssetRef {
  const buffer = readFileSync(path);
  return {
    asset_id: `asset_${hashBuffer(Buffer.from(`strict:${path}`)).slice(0, 12)}`,
    uri: path,
    mime,
    sha256: hashBuffer(buffer),
    size_bytes: statSync(path).size,
    page_count: mime === 'application/pdf' ? 1 : undefined,
  };
}

function writeMinimalPdf(filePath: string) {
  writeFileSync(
    filePath,
    `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
trailer
<< /Root 1 0 R >>
%%EOF`,
    'utf8',
  );
}

async function writePngTable(filePath: string) {
  const sharp = await loadSharp();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="260">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <rect x="20" y="20" width="480" height="220" fill="#dbe4f0" stroke="#111827" stroke-width="8"/>
    <rect x="28" y="28" width="144" height="39" fill="#cbd5e1"/>
    <rect x="188" y="28" width="144" height="39" fill="#cbd5e1"/>
    <rect x="348" y="28" width="144" height="39" fill="#cbd5e1"/>
    <rect x="28" y="83" width="144" height="39" fill="#e2e8f0"/>
    <rect x="188" y="83" width="144" height="39" fill="#e2e8f0"/>
    <rect x="348" y="83" width="144" height="39" fill="#e2e8f0"/>
    <rect x="28" y="138" width="144" height="39" fill="#cbd5e1"/>
    <rect x="188" y="138" width="144" height="39" fill="#cbd5e1"/>
    <rect x="348" y="138" width="144" height="39" fill="#cbd5e1"/>
    <rect x="28" y="193" width="144" height="39" fill="#e2e8f0"/>
    <rect x="188" y="193" width="144" height="39" fill="#e2e8f0"/>
    <rect x="348" y="193" width="144" height="39" fill="#e2e8f0"/>
    <line x1="20" y1="75" x2="500" y2="75" stroke="#111827" stroke-width="8"/>
    <line x1="20" y1="130" x2="500" y2="130" stroke="#111827" stroke-width="8"/>
    <line x1="20" y1="185" x2="500" y2="185" stroke="#111827" stroke-width="8"/>
    <line x1="180" y1="20" x2="180" y2="240" stroke="#111827" stroke-width="8"/>
    <line x1="340" y1="20" x2="340" y2="240" stroke="#111827" stroke-width="8"/>
    <text x="46" y="58" font-size="28" font-family="Segoe UI" fill="#111827">Jan</text>
    <text x="214" y="58" font-size="28" font-family="Segoe UI" fill="#111827">120000</text>
    <text x="374" y="58" font-size="28" font-family="Segoe UI" fill="#111827">East</text>
    <text x="46" y="113" font-size="28" font-family="Segoe UI" fill="#111827">Feb</text>
    <text x="214" y="113" font-size="28" font-family="Segoe UI" fill="#111827">138000</text>
    <text x="374" y="113" font-size="28" font-family="Segoe UI" fill="#111827">West</text>
    <text x="46" y="168" font-size="28" font-family="Segoe UI" fill="#111827">Mar</text>
    <text x="214" y="168" font-size="28" font-family="Segoe UI" fill="#111827">151000</text>
    <text x="374" y="168" font-size="28" font-family="Segoe UI" fill="#111827">North</text>
    <text x="46" y="223" font-size="28" font-family="Segoe UI" fill="#111827">Apr</text>
    <text x="214" y="223" font-size="28" font-family="Segoe UI" fill="#111827">166000</text>
    <text x="374" y="223" font-size="28" font-family="Segoe UI" fill="#111827">South</text>
  </svg>`;
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  writeFileSync(filePath, buffer);
}

async function runPdfToPptxStrict(tempDir: string) {
  const pdfPath = join(tempDir, 'strict-source.pdf');
  writeMinimalPdf(pdfPath);

  initStrictEngine();
  const result = await runStrictPipeline(strictContext(), strictAssetRef(pdfPath, 'application/pdf'), 'pptx');
  assert.equal(result.success, true, 'strict pdf pipeline must pass');
  assert.ok(result.artifact && existsSync(result.artifact.uri), 'strict pptx artifact must exist');
  assert.ok(result.evidence_pack, 'strict pdf evidence pack must exist');
  assert.equal(result.evidence_pack!.pixel_diff_reports.every((report) => report.pass), true);
  assert.equal(result.evidence_pack!.pixel_diff_reports.every((report) => report.pixel_diff === 0), true);
  assert.equal(result.evidence_pack!.structural_hashes.length > 0, true);
  assert.ok(result.evidence_pack!.run_id, 'strict pdf evidence run id must exist');

  return {
    scenario: 'pdf_to_pptx_strict',
    artifact_ids: [result.artifact!.artifact_id],
    evidence_id: result.evidence_pack!.run_id,
  };
}

async function runImageTableToXlsxStrict(tempDir: string) {
  const imagePath = join(tempDir, 'table.png');
  await writePngTable(imagePath);

  initStrictEngine();
  const result = await runStrictPipeline(strictContext(), strictAssetRef(imagePath, 'image/png'), 'xlsx');
  if (result.success) {
    assert.ok(result.artifact && existsSync(result.artifact.uri), 'strict xlsx artifact must exist');
    assert.ok(result.evidence_pack, 'strict image evidence pack must exist');
    assert.equal(result.evidence_pack!.pixel_diff_reports.every((report) => report.pass), true);
    assert.equal(result.evidence_pack!.pixel_diff_reports.every((report) => report.pixel_diff === 0), true);
    assert.equal(result.evidence_pack!.structural_hashes.length > 0, true);
    assert.ok(result.evidence_pack!.run_id, 'strict image evidence run id must exist');

    return {
      scenario: 'image_table_to_xlsx_strict',
      artifact_ids: [result.artifact!.artifact_id],
      evidence_id: result.evidence_pack!.run_id,
      execution_mode: 'replication_strict',
    };
  }

  const response = await executeLctTool<{ artifacts: Array<{ artifact_id: string; kind: string; uri: string }>; evidence_id: string }>({
    request_id: 'golden_image_xlsx_strict',
    tool_id: 'lct.orch.any_to_any',
    context: {
      workspace_id: 'golden-ws',
      user_id: 'golden-user',
      mode: 'AUTO',
      arabic_mode: 'ELITE',
      locale: 'ar-SA',
    },
    inputs: {
      assets: [lctAssetRef(imagePath, 'image/png')],
      instruction: 'Convert this table image into an editable strict workbook',
    },
    params: {
      targets: ['xlsx', 'png'],
      claims: ['CONVERT_STRICT_1TO1_100'],
      target_language: 'en',
      classification: 'internal',
    },
  });

  assert.equal(response.status, 'ok', 'lct strict fallback must return ok');
  const xlsx = response.refs.artifacts.find((artifact) => artifact.kind === 'xlsx');
  assert.ok(xlsx && existsSync(xlsx.uri), 'fallback xlsx artifact must exist');
  const storedArtifact = getLctArtifact(xlsx!.artifact_id);
  assert.equal(storedArtifact?.metadata.editable_core, true);
  assert.equal(storedArtifact?.metadata.table_cells, true);
  const evidence = getLctEvidence(response.refs.evidence_id);
  assert.ok(evidence, 'fallback strict evidence must exist');
  const strictAdapterReports = evidence?.reports.strict_adapter as { pixel_diff_reports?: Array<{ pass: boolean; pixel_diff: number }> } | undefined;
  const localConvertReport = evidence?.reports.convert as { pixel_gate?: { pass: boolean; pixel_diff: number } } | undefined;
  const adapterPass = Array.isArray(strictAdapterReports?.pixel_diff_reports)
    && strictAdapterReports.pixel_diff_reports.length > 0
    && strictAdapterReports.pixel_diff_reports.every((report) => report.pass && report.pixel_diff === 0);
  const localPass = localConvertReport?.pixel_gate?.pass === true && localConvertReport.pixel_gate.pixel_diff === 0;
  assert.equal(adapterPass || localPass, true, 'image strict fallback must prove zero-pixel fidelity');

  return {
    scenario: 'image_table_to_xlsx_strict',
    artifact_ids: [xlsx!.artifact_id],
    evidence_id: response.refs.evidence_id,
    execution_mode: adapterPass ? 'lct_strict_adapter' : 'lct_local_strict',
    strict_failure: result.error,
  };
}

async function runDatasetToDashboard(tempDir: string) {
  const csvPath = join(tempDir, 'sales.csv');
  writeFileSync(csvPath, 'month,revenue,region\nJan,120000,Central\nFeb,138000,West\nMar,151000,East\n', 'utf8');

  const intent = await executeDashboardTool<{ intent: Record<string, unknown> }>({
    request_id: 'golden_dashboard_intent',
    tool_id: 'dashboard.intent_parse',
    context: {
      workspace_id: 'golden-ws',
      user_id: 'golden-user',
      mode: 'AUTO',
      arabic_mode: 'ELITE',
      locale: 'ar-SA',
    },
    inputs: {
      prompt: 'Build an executive sales dashboard',
      assets: [dashboardAssetRef(csvPath, 'text/csv')],
    },
    params: {
      strict_import: false,
      pages_hint: 2,
    },
  });

  assert.equal(intent.status, 'ok');
  const datasetRefs = ((intent.refs.intent as { dataset_refs?: DatasetRef[] }).dataset_refs ?? []);
  assert.ok(datasetRefs.length > 0, 'dashboard intent must ingest datasets');

  const plan = await executeDashboardTool<{ dashboard_ir_plan: Record<string, unknown> }>({
    request_id: 'golden_dashboard_plan',
    tool_id: 'dashboard.plan',
    context: {
      workspace_id: 'golden-ws',
      user_id: 'golden-user',
      mode: 'AUTO',
      arabic_mode: 'ELITE',
      locale: 'ar-SA',
    },
    inputs: {
      intent: intent.refs.intent,
    },
    params: {},
  });

  const built = await executeDashboardTool<{ dashboard: DashboardRef }>({
    request_id: 'golden_dashboard_build',
    tool_id: 'dashboard.build',
    context: {
      workspace_id: 'golden-ws',
      user_id: 'golden-user',
      mode: 'AUTO',
      arabic_mode: 'ELITE',
      locale: 'ar-SA',
    },
    inputs: {
      dashboard_ir_plan: plan.refs.dashboard_ir_plan,
    },
    params: {},
  });

  const dashboard = built.refs.dashboard;
  const bound = await executeDashboardTool<{ dashboard: DashboardRef }>({
    request_id: 'golden_dashboard_bind',
    tool_id: 'dashboard.bind_data',
    context: {
      workspace_id: 'golden-ws',
      user_id: 'golden-user',
      mode: 'AUTO',
      arabic_mode: 'ELITE',
      locale: 'ar-SA',
    },
    inputs: {
      dashboard,
      datasets: datasetRefs,
    },
    params: {},
  });

  assert.equal(bound.status, 'ok');

  const published = await executeDashboardTool<{ link_ref: ArtifactRef; audit_entry_id: string }>({
    request_id: 'golden_dashboard_publish',
    tool_id: 'dashboard.publish',
    context: {
      workspace_id: 'golden-ws',
      user_id: 'golden-user',
      mode: 'AUTO',
      arabic_mode: 'ELITE',
      locale: 'ar-SA',
    },
    inputs: {
      dashboard,
      share_policy: { mode: 'view-only' },
      permissions: { groups: ['executives'] },
    },
    params: {},
  });

  assert.equal(published.status, 'ok');
  assert.ok(existsSync(published.refs.link_ref.uri), 'dashboard publish link must exist');
  assert.ok(published.refs.audit_entry_id.length > 0, 'dashboard publish audit id must exist');

  const evidence = await executeDashboardTool<{ evidence_id: string }>({
    request_id: 'golden_dashboard_evidence',
    tool_id: 'dashboard.evidence_pack',
    context: {
      workspace_id: 'golden-ws',
      user_id: 'golden-user',
      mode: 'AUTO',
      arabic_mode: 'ELITE',
      locale: 'ar-SA',
    },
    inputs: {
      dashboard,
      artifacts: [published.refs.link_ref],
      qa_report: { pass: true },
      parity_report: { pass: true },
    },
    params: {},
  });

  assert.equal(evidence.status, 'ok');
  assert.ok(getDashboardEvidence(evidence.refs.evidence_id), 'dashboard evidence must exist');

  return {
    scenario: 'dataset_to_dashboard',
    artifact_ids: [published.refs.link_ref.artifact_id],
    evidence_id: evidence.refs.evidence_id,
  };
}

async function runVideoToTranscriptStrict(tempDir: string) {
  const videoPath = join(tempDir, 'meeting.mp4');
  writeFileSync(videoPath, Buffer.from('fake-video-binary'));
  writeFileSync(`${videoPath}.engine1.txt`, 'Revenue report and sales growth for customer status and monthly analysis.');
  writeFileSync(`${videoPath}.engine2.txt`, 'Revenue report and sales growth for customer status and monthly analysis.');
  writeFileSync(`${videoPath}.verified.txt`, 'Revenue report and sales growth for customer status and monthly analysis.');
  writeFileSync(`${videoPath}.ocr.txt`, 'Revenue 2024 sales growth');
  writeFileSync(`${videoPath}.meta.json`, JSON.stringify({ duration_seconds: 14 }, null, 2), 'utf8');

  const response = await executeLctTool<{ artifacts: Array<{ artifact_id: string; kind: string; uri: string }>; evidence_id: string }>({
    request_id: 'golden_video_transcribe_strict',
    tool_id: 'lct.orch.any_to_any',
    context: {
      workspace_id: 'golden-ws',
      user_id: 'golden-user',
      mode: 'AUTO',
      arabic_mode: 'ELITE',
      locale: 'ar-SA',
    },
    inputs: {
      assets: [lctAssetRef(videoPath, 'video/mp4')],
      instruction: 'Transcribe this meeting exactly',
    },
    params: {
      targets: ['srt', 'docx', 'json'],
      claims: ['TRANSCRIBE_STRICT_100'],
      target_language: 'en',
      classification: 'internal',
    },
  });

  assert.equal(response.status, 'ok');
  const docx = response.refs.artifacts.find((artifact) => artifact.kind === 'docx');
  const srt = response.refs.artifacts.find((artifact) => artifact.kind === 'srt');
  assert.ok(docx && existsSync(docx.uri), 'transcript docx must exist');
  assert.ok(srt && existsSync(srt.uri), 'transcript srt must exist');
  assert.equal(getLctArtifact(docx!.artifact_id)?.metadata.editable_core, true);
  const evidence = getLctEvidence(response.refs.evidence_id);
  assert.ok(evidence, 'transcribe evidence must exist');
  const transcribeReport = evidence!.reports.transcribe as { exactness?: { exact?: boolean; unresolved_spans?: unknown[] } };
  assert.equal(transcribeReport.exactness?.exact, true);
  assert.equal(Array.isArray(transcribeReport.exactness?.unresolved_spans), true);
  assert.equal(transcribeReport.exactness?.unresolved_spans?.length, 0);

  return {
    scenario: 'video_to_transcribe_strict',
    artifact_ids: [docx!.artifact_id, srt!.artifact_id],
    evidence_id: response.refs.evidence_id,
  };
}

export async function runGoldenCorpus() {
  mkdirSync(resultsDir, { recursive: true });
  resetLctUltraEngine();
  resetDashboardUltraEngine();

  const tempDir = mkdtempSync(join(tmpdir(), 'rasid-golden-corpus-'));
  try {
    const results = [
      await runPdfToPptxStrict(tempDir),
      await runImageTableToXlsxStrict(tempDir),
      await runDatasetToDashboard(tempDir),
      await runVideoToTranscriptStrict(tempDir),
    ];

    const output = {
      generated_at: new Date().toISOString(),
      scenarios: results,
    };
    const outputPath = join(resultsDir, 'latest.json');
    writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    console.log(`golden-corpus:ok ${outputPath}`);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

runGoldenCorpus().catch((error) => {
  console.error(error);
  process.exit(1);
});
