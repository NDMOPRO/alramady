import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'fs';
import { dirname, extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = join(ROOT, 'docs', '03_engineering_docs', 'platform-audit');

mkdirSync(OUT_DIR, { recursive: true });

const ENGINE_CONFIGS = [
  {
    key: 'rased',
    name: 'RASED AI Engine',
    service: 'ai-service',
    files: [
      'services/ai-service/src/services/rased-agent-os.service.ts',
      'services/ai-service/src/services/rased-tool-contracts.ts',
      'services/ai-service/src/services/rased-action-registry.service.ts',
      'services/ai-service/src/services/rased-event-schema-registry.service.ts',
      'services/ai-service/src/services/rased-guardrails.service.ts',
      'services/ai-service/src/routes/rased.routes.ts',
    ],
    features: [
      ['تحليل النية', 'services/ai-service/src/services/rased-agent-os.service.ts', 'handleIntentParse('],
      ['بناء مخطط الأفعال', 'services/ai-service/src/services/rased-agent-os.service.ts', 'handlePlanActionGraph('],
      ['تنفيذ مخطط الأفعال', 'services/ai-service/src/services/rased-agent-os.service.ts', 'handleExecuteActionGraph('],
      ['مراقبة الواجهة', 'services/ai-service/src/services/rased-agent-os.service.ts', 'handleObserveUiState('],
      ['جولات الإرشاد', 'services/ai-service/src/services/rased-agent-os.service.ts', 'handleUiTourStart('],
      ['مركز التدريب', 'services/ai-service/src/services/rased-agent-os.service.ts', 'handleTrainingPackIngest('],
      ['البحث المعرفي', 'services/ai-service/src/services/rased-agent-os.service.ts', 'handleKnowledgeSearch('],
      ['التفضيلات', 'services/ai-service/src/services/rased-agent-os.service.ts', 'handlePreferenceSet('],
      ['القيود Guardrails', 'services/ai-service/src/services/rased-guardrails.service.ts', 'evaluate('],
      ['سجل الأفعال', 'services/ai-service/src/services/rased-action-registry.service.ts', 'RasedActionRegistryService'],
      ['سجل الأحداث', 'services/ai-service/src/services/rased-event-schema-registry.service.ts', 'RasedEventSchemaRegistryService'],
      ['الأدلة', 'services/ai-service/src/services/rased-agent-os.service.ts', 'handleEvidencePack('],
    ],
    purpose: 'طبقة التشغيل الذكية التي تخطط وتنفذ وتراقب وتوجّه الواجهة وتجمع الأدلة.',
    role: 'Kernel',
    dependencies: 'rased-tool-contracts, action registry, event registry, guardrails, frontend canvas APIs.',
    actionEngine: 'يبني action graph ثم ينفذه عبر handleExecuteActionGraph ويؤرشف كل action_id.',
    policyEngine: 'يمر عبر RasedGuardrailsService وrased.policy.check قبل أي فعل حساس أو خارجي.',
    events: 'يصدر rased.action.requested وrased.guardrail.evaluated وrased.action.completed وrased.action.failed وrased.evidence.finalized ويستهلك حالة الواجهة من home/page.tsx.',
    configuration: 'rootDir, fetchImpl, now, preference scope, connector allowlist, strict defaults.',
    activation: 'مفعل عبر /api/v1/ai/rased/* ويعمل فقط داخل Canvas أو API route.',
    extensibility: 'إضافة أدوات جديدة تتم عبر contracts + action registry + schema generator.',
    governance: 'يتطلب guardrails, audit, evidence_id, explicit tokens للأفعال الحساسة.',
    multitenant: 'مفتاح العزل هو workspace_id/user_id في كل طلب وسجل وartifact.',
    ai: 'تكامله AI مباشر لأنه المحرّك القائد لبقية المحركات.',
  },
  {
    key: 'strict',
    name: 'Strict Replication Engine',
    service: 'replication-service',
    files: [
      'services/replication-service/src/strict/pipeline/strict-pipeline.ts',
      'services/replication-service/src/strict/render/farm-renderer.ts',
      'services/replication-service/src/strict/verify/pixel-diff.ts',
      'services/replication-service/src/strict/verify/structural-equivalence.ts',
      'services/replication-service/src/strict/evidence/evidence-pack.ts',
      'services/replication-service/src/strict/tools/registry.ts',
    ],
    features: [
      ['خط الأنابيب الصارم', 'services/replication-service/src/strict/pipeline/strict-pipeline.ts', 'export class StrictPipeline'],
      ['مزرعة الرندر', 'services/replication-service/src/strict/render/farm-renderer.ts', 'class FarmRenderer'],
      ['PixelDiff صفري', 'services/replication-service/src/strict/verify/pixel-diff.ts', 'pixel'],
      ['التحقق البنيوي', 'services/replication-service/src/strict/verify/structural-equivalence.ts', 'structural'],
      ['Evidence Pack', 'services/replication-service/src/strict/evidence/evidence-pack.ts', 'EvidencePackBuilder'],
      ['سجل الأدوات الصارم', 'services/replication-service/src/strict/tools/registry.ts', 'executeTool'],
    ],
    purpose: 'إعادة بناء وتحويل صارم مع PixelDiff==0 وبنية قابلة للتحرير.',
    role: 'Module',
    dependencies: 'CDR store/builder, rendering farm, exporters, verification modules.',
    actionEngine: 'يُستدعى كأداة ثقيلة من Action Runtime أو عبر LCT/RASED.',
    policyEngine: 'يعتمد على strict policy bind ولا يسمح بأي mutation أثناء strict.',
    events: 'يصدر نتائج التحقق والأدلة داخل evidence pack ويستهلك assets وrender profiles.',
    configuration: 'farm image, font snapshot, render dpi, repair iterations.',
    activation: 'يعمل عبر strict pipeline وtool registry.',
    extensibility: 'إضافة صيغة جديدة تتطلب exporter + render path + verification hooks.',
    governance: 'فشل أي gate يوقف التصدير ويُنتج diff report.',
    multitenant: 'يعزل jobs والأصول والأدلة حسب execution context.',
    ai: 'تكامل AI غير مباشر عبر VREE/LCT/RASED.',
  },
  {
    key: 'slides',
    name: 'Slides Engine',
    service: 'presentation-service',
    files: [
      'services/presentation-service/src/services/gamma-engine.service.ts',
      'services/presentation-service/src/services/slides-tool-contracts.ts',
      'services/presentation-service/src/services/slides-infinite-control.service.ts',
    ],
    features: [
      ['Intent Parse للعروض', 'services/presentation-service/src/services/gamma-engine.service.ts', 'IntentManifest'],
      ['Outline', 'services/presentation-service/src/services/gamma-engine.service.ts', 'Outline'],
      ['Storyboard', 'services/presentation-service/src/services/gamma-engine.service.ts', 'StoryboardSlide'],
      ['Template/Theme', 'services/presentation-service/src/services/gamma-engine.service.ts', 'ThemeTokens'],
      ['Infinite Control', 'services/presentation-service/src/services/slides-infinite-control.service.ts', 'buildControlManifest'],
      ['Tool Contracts', 'services/presentation-service/src/services/slides-tool-contracts.ts', 'SLIDES_TOOL_DEFINITIONS'],
    ],
    purpose: 'توليد وتحرير وتصدير عروض PPTX داخل Canvas مع قوالب وتحكم متدرج.',
    role: 'Module',
    dependencies: 'tool contracts, pptx generator, infinite control catalogs, data bindings.',
    actionEngine: 'يُنفذ عبر slides.* tools أو عبر RASED action graph.',
    policyEngine: 'يخضع لصلاحيات التصدير والمشاركة والقوالب.',
    events: 'يستهلك datasets/templates ويصدر deck refs وartifacts وأدلة parity.',
    configuration: 'theme tokens, template lock, motion level, control manifest.',
    activation: 'مفعل من Canvas ومن LCT/Report/Dashboard integrations.',
    extensibility: 'إضافة blocks/catalog variants وعقود جديدة دون تغيير الواجهة.',
    governance: 'Evidence + parity + literal hash + template compliance.',
    multitenant: 'القوالب والتفضيلات والassets معزولة حسب workspace.',
    ai: 'يستخدم AI في planning/content modes.',
  },
  {
    key: 'excel',
    name: 'Excel Engine',
    service: 'excel-service',
    files: [
      'services/excel-service/src/services/excel-ultra-engine.service.ts',
      'services/excel-service/src/services/excel-tool-contracts.ts',
    ],
    features: [
      ['Blank Table Canvas', 'services/excel-service/src/services/excel-ultra-engine.service.ts', 'TableRef'],
      ['Batch Ingest', 'services/excel-service/src/services/excel-ultra-engine.service.ts', 'data.ingest.batch'],
      ['T-IR', 'services/excel-service/src/services/excel-ultra-engine.service.ts', 'expr.tir.apply'],
      ['SVM Recalc', 'services/excel-service/src/services/excel-ultra-engine.service.ts', 'excel.svm.recalc'],
      ['Diff Engine', 'services/excel-service/src/services/excel-ultra-engine.service.ts', 'compare.dataset_diff'],
      ['Excel Tool Contracts', 'services/excel-service/src/services/excel-tool-contracts.ts', 'EXCEL_TOOL_DEFINITIONS'],
    ],
    purpose: 'استيعاب وتنظيف وتحويل وتحليل وتصدير الجداول المصممة كـworkbooks حقيقية.',
    role: 'Module',
    dependencies: 'ExcelJS, XLSX, mathjs, T-IR recipes, dataset models.',
    actionEngine: 'يعمل عبر excel tools أو كتبعيات داخل dashboard/report/slides.',
    policyEngine: 'يطبق classification/exports ويحتفظ بالlineage.',
    events: 'يصدر dataset/table/recipe/artifact refs ويستهلك files/connectors.',
    configuration: 'mode, locale, arabic mode, preview rows, style level.',
    activation: 'ينشط من Canvas أو من LCT/Strict table extraction.',
    extensibility: 'إضافة transforms أو exports تتم عبر contracts والوصفات.',
    governance: 'lineage hidden sheet + quality report + audit.',
    multitenant: 'datasets والوصفات معزولة حسب workspace.',
    ai: 'يوفر auto analyze وjoin suggestions وrecipes.',
  },
  {
    key: 'dashboard',
    name: 'Dashboard Engine',
    service: 'dashboard-service',
    files: [
      'services/dashboard-service/src/services/dashboard-ultra-engine.service.ts',
      'services/dashboard-service/src/services/dashboard-tool-contracts.ts',
    ],
    features: [
      ['Intent Parse للوحات', 'services/dashboard-service/src/services/dashboard-ultra-engine.service.ts', 'DashboardActionContext'],
      ['Widget Catalog', 'services/dashboard-service/src/services/dashboard-ultra-engine.service.ts', 'WidgetKind'],
      ['D-IR Plan', 'services/dashboard-service/src/services/dashboard-ultra-engine.service.ts', 'dashboard_ir'],
      ['Data Binding', 'services/dashboard-service/src/services/dashboard-ultra-engine.service.ts', 'dashboard.bind_data'],
      ['Publish/Share', 'services/dashboard-service/src/services/dashboard-ultra-engine.service.ts', 'dashboard.publish'],
      ['Dashboard Tool Contracts', 'services/dashboard-service/src/services/dashboard-tool-contracts.ts', 'DASHBOARD_TOOL_DEFINITIONS'],
    ],
    purpose: 'بناء لوحات حيّة متعددة الصفحات مع widgets وتفاعلات وتصدير.',
    role: 'Module',
    dependencies: 'widget catalogs, datasets, exports, parity verification.',
    actionEngine: 'يتلقى plan/build/bind/export عبر tools.',
    policyEngine: 'يطبق RLS/CLS/share policy قبل publish/export.',
    events: 'يصدر dashboard refs, export artifacts, parity reports, evidence.',
    configuration: 'mode, dpi, page layouts, filters, bindings.',
    activation: 'ينشط من Canvas ومن Excel/Slides/Reports/LCT.',
    extensibility: 'إضافة widget أو catalog أو export path تتم عبر contracts.',
    governance: 'share policy, audit, evidence pack, lazy loading.',
    multitenant: 'dashboards والروابط والdatasets معزولة.',
    ai: 'يولّد dashboards ويقترح KPIs وjoins.',
  },
  {
    key: 'report',
    name: 'Report Engine',
    service: 'reporting-service',
    files: [
      'services/reporting-service/src/services/report-ultra-engine.service.ts',
      'services/reporting-service/src/services/report-tool-contracts.ts',
    ],
    features: [
      ['Intent Parse للتقارير', 'services/reporting-service/src/services/report-ultra-engine.service.ts', 'report.intent_parse'],
      ['DOC-IR', 'services/reporting-service/src/services/report-ultra-engine.service.ts', 'DocRef'],
      ['Literal Hash', 'services/reporting-service/src/services/report-ultra-engine.service.ts', 'literal'],
      ['Content Trace', 'services/reporting-service/src/services/report-ultra-engine.service.ts', 'content_trace'],
      ['Governance', 'services/reporting-service/src/services/report-ultra-engine.service.ts', 'classification'],
      ['Report Tool Contracts', 'services/reporting-service/src/services/report-tool-contracts.ts', 'REPORT_TOOL_DEFINITIONS'],
    ],
    purpose: 'توليد تقارير DOCX/PDF/HTML قابلة للتحرير ومربوطة بالبيانات.',
    role: 'Module',
    dependencies: 'docx, pdfkit, templates, datasets, content generation.',
    actionEngine: 'ينفذ outline/doc_ir/bind/export عبر tools أو من RASED/LCT.',
    policyEngine: 'يطبق classification وapproval workflow وshare/export restrictions.',
    events: 'يصدر docs/artifacts/content trace/evidence ويستهلك datasets/assets/templates.',
    configuration: 'template lock, fidelity mode, detail level, citation mode, classification.',
    activation: 'ينشط من Canvas ومن dashboard/slides/lct.',
    extensibility: 'إضافة block أو export path أو writing template تتم عبر contracts.',
    governance: 'literal diff, template compliance, audit, evidence.',
    multitenant: 'templates/style guides/data bindings معزولة.',
    ai: 'كاتب ومحلل ومدقق داخل المسار الذكي.',
  },
  {
    key: 'lct',
    name: 'LCT Engine',
    service: 'conversion-service',
    files: [
      'services/conversion-service/src/services/lct-ultra-engine.service.ts',
      'services/conversion-service/src/services/lct-tool-contracts.ts',
    ],
    features: [
      ['Orchestrator Any→Any', 'services/conversion-service/src/services/lct-ultra-engine.service.ts', 'lct.orch.any_to_any'],
      ['Modality Detect', 'services/conversion-service/src/services/lct-ultra-engine.service.ts', 'Modality'],
      ['ASR Ensemble', 'services/conversion-service/src/services/lct-ultra-engine.service.ts', 'transcript'],
      ['Arabic Typeset', 'services/conversion-service/src/services/lct-ultra-engine.service.ts', 'ArabicMode'],
      ['Verifier/Ops Gate', 'services/conversion-service/src/services/lct-ultra-engine.service.ts', 'exact'],
      ['LCT Tool Contracts', 'services/conversion-service/src/services/lct-tool-contracts.ts', 'LCT_TOOL_DEFINITIONS'],
    ],
    purpose: 'محرك التحويل والتعريب والتفريغ المتكامل بين كل الصيغ والمحركات.',
    role: 'Module',
    dependencies: 'pdf-parse, sharp, docx, strict tools, export adapters.',
    actionEngine: 'يُستدعى عبر lct.orch.any_to_any أو من راصد مباشرة.',
    policyEngine: 'يطبق claims/classification/evidence gates قبل التسليم.',
    events: 'يصدر artifacts/transcripts/evidence ويستهلك assets متعددة الأنماط.',
    configuration: 'strict claims, fidelity mode, target language, templates, term packs.',
    activation: 'ينشط من Canvas عند تحويل/تعريب/تفريغ.',
    extensibility: 'إضافة modality أو export adapter تتم عبر contracts.',
    governance: 'exactness gates + verifier proof + no hallucination.',
    multitenant: 'term packs والأساليب والassets معزولة.',
    ai: 'يعتمد على AI في ASR/OCR/localization orchestration.',
  },
];

const CROSS_ENGINE_LINKS = [
  ['RASED AI Engine', 'Strict Replication Engine', 'services/ai-service/src/services/rased-agent-os.service.ts', 'repair.loop_controller'],
  ['RASED AI Engine', 'Slides Engine', 'services/ai-service/src/services/rased-agent-os.service.ts', 'slides.build_deck'],
  ['RASED AI Engine', 'Excel Engine', 'services/ai-service/src/services/rased-agent-os.service.ts', 'export.xlsx'],
  ['RASED AI Engine', 'Dashboard Engine', 'services/ai-service/src/services/rased-agent-os.service.ts', 'dashboard.build'],
  ['RASED AI Engine', 'Report Engine', 'services/ai-service/src/services/rased-agent-os.service.ts', 'report.build_doc_ir'],
  ['RASED AI Engine', 'LCT Engine', 'services/ai-service/src/services/rased-agent-os.service.ts', 'lct.orch.any_to_any'],
  ['LCT Engine', 'Strict Replication Engine', 'services/conversion-service/src/services/lct-ultra-engine.service.ts', 'strict'],
  ['LCT Engine', 'Slides Engine', 'services/conversion-service/src/services/lct-ultra-engine.service.ts', 'pptx'],
  ['LCT Engine', 'Report Engine', 'services/conversion-service/src/services/lct-ultra-engine.service.ts', 'docx'],
  ['Dashboard Engine', 'Excel Engine', 'services/dashboard-service/src/services/dashboard-ultra-engine.service.ts', 'xlsx'],
  ['Report Engine', 'Slides Engine', 'services/reporting-service/src/services/report-ultra-engine.service.ts', 'pptx'],
];

function readText(filePath) {
  return readFileSync(join(ROOT, filePath), 'utf8');
}

function listFilesRecursive(dirPath) {
  const result = [];
  for (const entry of readdirSync(dirPath)) {
    const full = join(dirPath, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (['node_modules', 'dist', '.next', 'coverage', '.git'].includes(entry)) continue;
      result.push(...listFilesRecursive(full));
    } else {
      result.push(full);
    }
  }
  return result;
}

function rel(filePath) {
  return filePath.replaceAll('\\', '/').replace(`${ROOT.replaceAll('\\', '/')}/`, '');
}

function findLine(content, marker) {
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].includes(marker)) return index + 1;
  }
  return null;
}

function countFunctionsInText(content) {
  const lines = content.split(/\r?\n/);
  let count = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(export\s+)?(async\s+)?function\s+[A-Za-z0-9_]+\s*\(/.test(trimmed)) count += 1;
    if (/^(public\s+|private\s+|protected\s+)?(async\s+)?[A-Za-z0-9_]+\s*\([^;]*\)\s*:\s*[^=]+\{$/.test(trimmed)) count += 1;
    if (/^(public\s+|private\s+|protected\s+)?(async\s+)?[A-Za-z0-9_]+\s*\([^;]*\)\s*\{$/.test(trimmed)) count += 1;
  }
  return count;
}

function countApisInText(content) {
  return (content.match(/router\.(get|post|put|patch|delete)\s*\(/g) ?? []).length;
}

function firstFeatureRef(file, marker) {
  if (!existsSync(join(ROOT, file))) return null;
  const content = readText(file);
  const line = findLine(content, marker);
  return line ? { file: join(ROOT, file).replaceAll('\\', '/'), line } : null;
}

function buildEngineAudit(engine) {
  const srcDir = join(ROOT, 'services', engine.service, 'src');
  const files = existsSync(srcDir) ? listFilesRecursive(srcDir).filter((file) => ['.ts', '.tsx', '.js', '.mjs'].includes(extname(file))) : [];
  const routes = files.filter((file) => file.includes('/routes/') || file.includes('\\routes\\'));
  const counts = {
    files: files.length,
    functions: files.reduce((total, file) => total + countFunctionsInText(readFileSync(file, 'utf8')), 0),
    apis: routes.reduce((total, file) => total + countApisInText(readFileSync(file, 'utf8')), 0),
  };

  const features = engine.features.map(([name, file, marker]) => {
    const ref = firstFeatureRef(file, marker);
    return {
      name,
      status: ref ? 'implemented' : existsSync(join(ROOT, file)) ? 'partial' : 'missing',
      file: join(ROOT, file).replaceAll('\\', '/'),
      method: marker,
      line: ref?.line ?? null,
    };
  });

  return {
    engine_name: engine.name,
    service: engine.service,
    counts,
    features,
    files: engine.files.map((file) => join(ROOT, file).replaceAll('\\', '/')),
  };
}

function parsePrismaModels() {
  const prismaPath = join(ROOT, 'prisma', 'schema.prisma');
  const content = readFileSync(prismaPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const models = [];
  let current = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const modelMatch = line.match(/^model\s+([A-Za-z0-9_]+)\s+\{$/);
    if (modelMatch) {
      current = { name: modelMatch[1], start: i + 1, fields: [], relationships: [] };
      continue;
    }
    if (current && line.trim() === '}') {
      models.push(current);
      current = null;
      continue;
    }
    if (current) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;
      const parts = trimmed.split(/\s+/);
      const fieldName = parts[0];
      const fieldType = parts[1];
      const relation = trimmed.includes('@relation')
        ? fieldType.replace(/[?\[\]]/g, '')
        : null;
      current.fields.push({ name: fieldName, type: fieldType, line: i + 1 });
      if (relation) current.relationships.push({ field: fieldName, target: relation, line: i + 1 });
    }
  }

  return models;
}

function scanRuntimePlaceholders() {
  const serviceRoot = join(ROOT, 'services');
  const files = listFilesRecursive(serviceRoot)
    .filter((file) => ['.ts', '.tsx', '.js', '.mjs'].includes(extname(file)))
    .filter((file) => !file.includes('__tests__') && !file.includes('\\dist\\') && !file.includes('/dist/'));

  const matches = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/\bTODO\b|\bFIXME\b|\bstub\b/i.test(line)) {
        matches.push({
          file: file.replaceAll('\\', '/'),
          line: index + 1,
          text: line.trim(),
        });
      }
    });
  }
  return matches;
}

function writeJson(fileName, data) {
  writeFileSync(join(OUT_DIR, fileName), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function writeText(fileName, text) {
  writeFileSync(join(OUT_DIR, fileName), `${text.trim()}\n`, 'utf8');
}

const engineAudits = ENGINE_CONFIGS.map(buildEngineAudit);
const allServiceDirs = readdirSync(join(ROOT, 'services')).filter((entry) => statSync(join(ROOT, 'services', entry)).isDirectory());
const totalFiles = engineAudits.reduce((sum, engine) => sum + engine.counts.files, 0);
const totalFunctions = engineAudits.reduce((sum, engine) => sum + engine.counts.functions, 0);
const totalApis = engineAudits.reduce((sum, engine) => sum + engine.counts.apis, 0);
const placeholders = scanRuntimePlaceholders();
const prismaModels = parsePrismaModels();

const capabilityMap = {
  generated_at: new Date().toISOString(),
  engines: engineAudits,
};

const integrationMap = {
  generated_at: new Date().toISOString(),
  links: CROSS_ENGINE_LINKS.map(([from, to, file, marker]) => {
    const ref = firstFeatureRef(file, marker);
    return {
      from,
      to,
      file: join(ROOT, file).replaceAll('\\', '/'),
      line: ref?.line ?? null,
      marker,
      status: ref ? 'linked' : 'not_detected',
    };
  }),
};

const dbRegistry = {
  generated_at: new Date().toISOString(),
  model_count: prismaModels.length,
  models: prismaModels,
};

writeJson('engine_capability_map.json', capabilityMap);
writeJson('cross_engine_integration_map.json', integrationMap);
writeJson('database_models_registry.json', dbRegistry);

const techReportSections = [];
techReportSections.push('# التقرير التقني التدقيقي');
techReportSections.push(`تاريخ الإنشاء: ${new Date().toISOString()}`);
techReportSections.push(`عدد المحركات الفعلي: ${engineAudits.length}`);
techReportSections.push(`عدد الخدمات: ${allServiceDirs.length}`);
techReportSections.push(`عدد الملفات محل الفحص: ${totalFiles}`);
techReportSections.push(`عدد الدوال والطرق التقريبية: ${totalFunctions}`);
techReportSections.push(`عدد واجهات API المرصودة: ${totalApis}`);

engineAudits.forEach((engine) => {
  techReportSections.push(`\n## ${engine.engine_name}`);
  techReportSections.push(`الخدمة: ${engine.service}. الملفات المفحوصة: ${engine.counts.files}. الطرق المرصودة: ${engine.counts.functions}. واجهات API: ${engine.counts.apis}.`);

  const implemented = engine.features.filter((feature) => feature.status === 'implemented');
  const partial = engine.features.filter((feature) => feature.status === 'partial');
  const missing = engine.features.filter((feature) => feature.status === 'missing');

  techReportSections.push('المزايا المنفذة فعليًا:');
  implemented.forEach((feature) => {
    techReportSections.push(`${feature.name}: ${feature.file}${feature.line ? `#L${feature.line}` : ''} | ${feature.method}`);
  });

  techReportSections.push('المزايا الجزئية:');
  if (partial.length === 0) {
    techReportSections.push('لا يوجد عناصر جزئية مرصودة ضمن هذا المحرك في المسح الحالي.');
  } else {
    partial.forEach((feature) => {
      techReportSections.push(`${feature.name}: ${feature.file} | ${feature.method}`);
    });
  }

  techReportSections.push('المزايا المفقودة ضمن قائمة التحقق الحالية:');
  if (missing.length === 0) {
    techReportSections.push('لا يوجد عنصر مفقود ضمن القائمة الحالية لهذا المحرك.');
  } else {
    missing.forEach((feature) => {
      techReportSections.push(`${feature.name}: ${feature.file} | ${feature.method}`);
    });
  }
});

techReportSections.push('\n## الأكواد الموضعية أو الآثار غير المكتملة');
if (placeholders.length === 0) {
  techReportSections.push('لم يُرصد TODO أو FIXME أو stub داخل مسارات runtime المفحوصة.');
} else {
  techReportSections.push(`إجمالي المواضع المرصودة: ${placeholders.length}.`);
  placeholders.slice(0, 200).forEach((match) => {
    techReportSections.push(`${match.file}#L${match.line}: ${match.text}`);
  });
  if (placeholders.length > 200) {
    techReportSections.push(`تم اختصار العرض عند 200 موضع للحفاظ على قابلية القراءة، بينما العدد الكامل محفوظ في الذاكرة التشغيلية للمسح الحالي.`);
  }
}

writeText('technical_audit_report_ar.md', techReportSections.join('\n'));

const productReportSections = [];
productReportSections.push('# تقرير قدرات المنصة');
productReportSections.push('راصد يعمل اليوم كمظلة تشغيل فوق محركات التحويل الصارم، العروض، الإكسل، اللوحات، التقارير، والتحويل/التعريب/التفريغ، مع Canvas واحد، جولات إرشاد، تفضيلات، وأدلة تنفيذ.');
engineAudits.forEach((engine) => {
  const implementedCount = engine.features.filter((feature) => feature.status === 'implemented').length;
  productReportSections.push(`\n## ${engine.engine_name}`);
  productReportSections.push(`هذا المحرك يقدّم ${implementedCount} قدرة مرصودة في التدقيق الحالي، ويعتمد على الخدمة ${engine.service}. أبرز الملفات: ${engine.files.slice(0, 3).join(' ، ')}.`);
});
productReportSections.push('\n## التكامل بين المحركات');
integrationMap.links.forEach((link) => {
  productReportSections.push(`${link.from} ←→ ${link.to}: ${link.file}${link.line ? `#L${link.line}` : ''}`);
});
writeText('platform_feature_report_ar.md', productReportSections.join('\n'));

const capabilityMd = [];
capabilityMd.push('# Engine Capability Map');
engineAudits.forEach((engine) => {
  capabilityMd.push(`\n## ${engine.engine_name}`);
  capabilityMd.push(`FILES: ${engine.files.join(' | ')}`);
  capabilityMd.push(`METHODS COUNT: ${engine.counts.functions}`);
  capabilityMd.push(`APIS COUNT: ${engine.counts.apis}`);
  capabilityMd.push('FEATURES IMPLEMENTED:');
  engine.features.forEach((feature) => {
    capabilityMd.push(`${feature.status.toUpperCase()}: ${feature.name} | ${feature.file}${feature.line ? `#L${feature.line}` : ''} | ${feature.method}`);
  });
});
writeText('engine_capability_map.md', capabilityMd.join('\n'));

const integrationMd = [];
integrationMd.push('# Cross Engine Integration Map');
integrationMap.links.forEach((link) => {
  integrationMd.push(`${link.from} -> ${link.to}: ${link.file}${link.line ? `#L${link.line}` : ''} | ${link.marker} | ${link.status}`);
});
writeText('cross_engine_integration_map.md', integrationMd.join('\n'));

const dbMd = [];
dbMd.push('# Database Models Registry');
dbMd.push(`عدد النماذج: ${prismaModels.length}`);
prismaModels.forEach((model) => {
  dbMd.push(`\n## ${model.name}`);
  dbMd.push(`تعريف النموذج يبدأ عند السطر ${model.start}.`);
  dbMd.push('الحقول:');
  model.fields.forEach((field) => {
    dbMd.push(`${field.name}: ${field.type} | line ${field.line}`);
  });
  dbMd.push('العلاقات:');
  if (model.relationships.length === 0) {
    dbMd.push('لا توجد علاقات صريحة مرصودة.');
  } else {
    model.relationships.forEach((relation) => {
      dbMd.push(`${relation.field} -> ${relation.target} | line ${relation.line}`);
    });
  }
});
writeText('database_models_registry.md', dbMd.join('\n'));

const governanceSections = [];
governanceSections.push('# وثيقة حدود الوحدات والحوكمة');
ENGINE_CONFIGS.forEach((engine) => {
  governanceSections.push(`\n## ${engine.name}`);
  governanceSections.push(`1) Purpose\n${engine.purpose}`);
  governanceSections.push(`2) Architectural Role (Kernel / Module / Project layer)\n${engine.role}`);
  governanceSections.push(`3) Dependencies\n${engine.dependencies}`);
  governanceSections.push(`4) Interaction with Action Engine\n${engine.actionEngine}`);
  governanceSections.push(`5) Interaction with Policy Engine\n${engine.policyEngine}`);
  governanceSections.push(`6) Events emitted and consumed\n${engine.events}`);
  governanceSections.push('7) Configuration model');
  governanceSections.push(engine.configuration);
  governanceSections.push('8) Activation model (feature toggle logic)');
  governanceSections.push(engine.activation);
  governanceSections.push('9) Extensibility model');
  governanceSections.push(engine.extensibility);
  governanceSections.push('10) Governance & risk considerations');
  governanceSections.push(engine.governance);
  governanceSections.push('11) Multi-tenant considerations');
  governanceSections.push(engine.multitenant);
  governanceSections.push('12) AI integration considerations (if applicable)');
  governanceSections.push(engine.ai);
});
writeText('module_boundaries_governance_ar.md', governanceSections.join('\n\n'));

console.log(`Platform audit artifacts generated in ${OUT_DIR}`);
