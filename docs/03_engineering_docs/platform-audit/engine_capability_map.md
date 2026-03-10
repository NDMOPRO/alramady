# Engine Capability Map

## RASED AI Engine
FILES: C:/DATA_AI/rasid/services/ai-service/src/services/rased-agent-os.service.ts | C:/DATA_AI/rasid/services/ai-service/src/services/rased-tool-contracts.ts | C:/DATA_AI/rasid/services/ai-service/src/services/rased-action-registry.service.ts | C:/DATA_AI/rasid/services/ai-service/src/services/rased-event-schema-registry.service.ts | C:/DATA_AI/rasid/services/ai-service/src/services/rased-guardrails.service.ts | C:/DATA_AI/rasid/services/ai-service/src/routes/rased.routes.ts
METHODS COUNT: 1999
APIS COUNT: 160
FEATURES IMPLEMENTED:
IMPLEMENTED: تحليل النية | C:/DATA_AI/rasid/services/ai-service/src/services/rased-agent-os.service.ts#L220 | handleIntentParse(
IMPLEMENTED: بناء مخطط الأفعال | C:/DATA_AI/rasid/services/ai-service/src/services/rased-agent-os.service.ts#L222 | handlePlanActionGraph(
IMPLEMENTED: تنفيذ مخطط الأفعال | C:/DATA_AI/rasid/services/ai-service/src/services/rased-agent-os.service.ts#L224 | handleExecuteActionGraph(
IMPLEMENTED: مراقبة الواجهة | C:/DATA_AI/rasid/services/ai-service/src/services/rased-agent-os.service.ts#L226 | handleObserveUiState(
IMPLEMENTED: جولات الإرشاد | C:/DATA_AI/rasid/services/ai-service/src/services/rased-agent-os.service.ts#L230 | handleUiTourStart(
IMPLEMENTED: مركز التدريب | C:/DATA_AI/rasid/services/ai-service/src/services/rased-agent-os.service.ts#L236 | handleTrainingPackIngest(
IMPLEMENTED: البحث المعرفي | C:/DATA_AI/rasid/services/ai-service/src/services/rased-agent-os.service.ts#L242 | handleKnowledgeSearch(
IMPLEMENTED: التفضيلات | C:/DATA_AI/rasid/services/ai-service/src/services/rased-agent-os.service.ts#L246 | handlePreferenceSet(
IMPLEMENTED: القيود Guardrails | C:/DATA_AI/rasid/services/ai-service/src/services/rased-guardrails.service.ts#L85 | evaluate(
IMPLEMENTED: سجل الأفعال | C:/DATA_AI/rasid/services/ai-service/src/services/rased-action-registry.service.ts#L227 | RasedActionRegistryService
IMPLEMENTED: سجل الأحداث | C:/DATA_AI/rasid/services/ai-service/src/services/rased-event-schema-registry.service.ts#L79 | RasedEventSchemaRegistryService
IMPLEMENTED: الأدلة | C:/DATA_AI/rasid/services/ai-service/src/services/rased-agent-os.service.ts#L254 | handleEvidencePack(

## Strict Replication Engine
FILES: C:/DATA_AI/rasid/services/replication-service/src/strict/pipeline/strict-pipeline.ts | C:/DATA_AI/rasid/services/replication-service/src/strict/render/farm-renderer.ts | C:/DATA_AI/rasid/services/replication-service/src/strict/verify/pixel-diff.ts | C:/DATA_AI/rasid/services/replication-service/src/strict/verify/structural-equivalence.ts | C:/DATA_AI/rasid/services/replication-service/src/strict/evidence/evidence-pack.ts | C:/DATA_AI/rasid/services/replication-service/src/strict/tools/registry.ts
METHODS COUNT: 2576
APIS COUNT: 101
FEATURES IMPLEMENTED:
IMPLEMENTED: خط الأنابيب الصارم | C:/DATA_AI/rasid/services/replication-service/src/strict/pipeline/strict-pipeline.ts#L116 | export class StrictPipeline
PARTIAL: مزرعة الرندر | C:/DATA_AI/rasid/services/replication-service/src/strict/render/farm-renderer.ts | class FarmRenderer
IMPLEMENTED: PixelDiff صفري | C:/DATA_AI/rasid/services/replication-service/src/strict/verify/pixel-diff.ts#L23 | pixel
IMPLEMENTED: التحقق البنيوي | C:/DATA_AI/rasid/services/replication-service/src/strict/verify/structural-equivalence.ts#L32 | structural
IMPLEMENTED: Evidence Pack | C:/DATA_AI/rasid/services/replication-service/src/strict/evidence/evidence-pack.ts#L15 | EvidencePackBuilder
IMPLEMENTED: سجل الأدوات الصارم | C:/DATA_AI/rasid/services/replication-service/src/strict/tools/registry.ts#L72 | executeTool

## Slides Engine
FILES: C:/DATA_AI/rasid/services/presentation-service/src/services/gamma-engine.service.ts | C:/DATA_AI/rasid/services/presentation-service/src/services/slides-tool-contracts.ts | C:/DATA_AI/rasid/services/presentation-service/src/services/slides-infinite-control.service.ts
METHODS COUNT: 1615
APIS COUNT: 355
FEATURES IMPLEMENTED:
IMPLEMENTED: Intent Parse للعروض | C:/DATA_AI/rasid/services/presentation-service/src/services/gamma-engine.service.ts#L62 | IntentManifest
IMPLEMENTED: Outline | C:/DATA_AI/rasid/services/presentation-service/src/services/gamma-engine.service.ts#L84 | Outline
IMPLEMENTED: Storyboard | C:/DATA_AI/rasid/services/presentation-service/src/services/gamma-engine.service.ts#L113 | StoryboardSlide
IMPLEMENTED: Template/Theme | C:/DATA_AI/rasid/services/presentation-service/src/services/gamma-engine.service.ts#L102 | ThemeTokens
IMPLEMENTED: Infinite Control | C:/DATA_AI/rasid/services/presentation-service/src/services/slides-infinite-control.service.ts#L165 | buildControlManifest
IMPLEMENTED: Tool Contracts | C:/DATA_AI/rasid/services/presentation-service/src/services/slides-tool-contracts.ts#L568 | SLIDES_TOOL_DEFINITIONS

## Excel Engine
FILES: C:/DATA_AI/rasid/services/excel-service/src/services/excel-ultra-engine.service.ts | C:/DATA_AI/rasid/services/excel-service/src/services/excel-tool-contracts.ts
METHODS COUNT: 1813
APIS COUNT: 116
FEATURES IMPLEMENTED:
IMPLEMENTED: Blank Table Canvas | C:/DATA_AI/rasid/services/excel-service/src/services/excel-ultra-engine.service.ts#L41 | TableRef
IMPLEMENTED: Batch Ingest | C:/DATA_AI/rasid/services/excel-service/src/services/excel-ultra-engine.service.ts#L1858 | data.ingest.batch
IMPLEMENTED: T-IR | C:/DATA_AI/rasid/services/excel-service/src/services/excel-ultra-engine.service.ts#L1865 | expr.tir.apply
IMPLEMENTED: SVM Recalc | C:/DATA_AI/rasid/services/excel-service/src/services/excel-ultra-engine.service.ts#L1866 | excel.svm.recalc
IMPLEMENTED: Diff Engine | C:/DATA_AI/rasid/services/excel-service/src/services/excel-ultra-engine.service.ts#L1867 | compare.dataset_diff
IMPLEMENTED: Excel Tool Contracts | C:/DATA_AI/rasid/services/excel-service/src/services/excel-tool-contracts.ts#L323 | EXCEL_TOOL_DEFINITIONS

## Dashboard Engine
FILES: C:/DATA_AI/rasid/services/dashboard-service/src/services/dashboard-ultra-engine.service.ts | C:/DATA_AI/rasid/services/dashboard-service/src/services/dashboard-tool-contracts.ts
METHODS COUNT: 795
APIS COUNT: 137
FEATURES IMPLEMENTED:
IMPLEMENTED: Intent Parse للوحات | C:/DATA_AI/rasid/services/dashboard-service/src/services/dashboard-ultra-engine.service.ts#L45 | DashboardActionContext
IMPLEMENTED: Widget Catalog | C:/DATA_AI/rasid/services/dashboard-service/src/services/dashboard-ultra-engine.service.ts#L18 | WidgetKind
IMPLEMENTED: D-IR Plan | C:/DATA_AI/rasid/services/dashboard-service/src/services/dashboard-ultra-engine.service.ts#L891 | dashboard_ir
IMPLEMENTED: Data Binding | C:/DATA_AI/rasid/services/dashboard-service/src/services/dashboard-ultra-engine.service.ts#L1474 | dashboard.bind_data
IMPLEMENTED: Publish/Share | C:/DATA_AI/rasid/services/dashboard-service/src/services/dashboard-ultra-engine.service.ts#L1392 | dashboard.publish
IMPLEMENTED: Dashboard Tool Contracts | C:/DATA_AI/rasid/services/dashboard-service/src/services/dashboard-tool-contracts.ts#L259 | DASHBOARD_TOOL_DEFINITIONS

## Report Engine
FILES: C:/DATA_AI/rasid/services/reporting-service/src/services/report-ultra-engine.service.ts | C:/DATA_AI/rasid/services/reporting-service/src/services/report-tool-contracts.ts
METHODS COUNT: 936
APIS COUNT: 105
FEATURES IMPLEMENTED:
IMPLEMENTED: Intent Parse للتقارير | C:/DATA_AI/rasid/services/reporting-service/src/services/report-ultra-engine.service.ts#L2113 | report.intent_parse
IMPLEMENTED: DOC-IR | C:/DATA_AI/rasid/services/reporting-service/src/services/report-ultra-engine.service.ts#L88 | DocRef
IMPLEMENTED: Literal Hash | C:/DATA_AI/rasid/services/reporting-service/src/services/report-ultra-engine.service.ts#L37 | literal
IMPLEMENTED: Content Trace | C:/DATA_AI/rasid/services/reporting-service/src/services/report-ultra-engine.service.ts#L197 | content_trace
IMPLEMENTED: Governance | C:/DATA_AI/rasid/services/reporting-service/src/services/report-ultra-engine.service.ts#L679 | classification
IMPLEMENTED: Report Tool Contracts | C:/DATA_AI/rasid/services/reporting-service/src/services/report-tool-contracts.ts#L341 | REPORT_TOOL_DEFINITIONS

## LCT Engine
FILES: C:/DATA_AI/rasid/services/conversion-service/src/services/lct-ultra-engine.service.ts | C:/DATA_AI/rasid/services/conversion-service/src/services/lct-tool-contracts.ts
METHODS COUNT: 1052
APIS COUNT: 57
FEATURES IMPLEMENTED:
IMPLEMENTED: Orchestrator Any→Any | C:/DATA_AI/rasid/services/conversion-service/src/services/lct-ultra-engine.service.ts#L2063 | lct.orch.any_to_any
IMPLEMENTED: Modality Detect | C:/DATA_AI/rasid/services/conversion-service/src/services/lct-ultra-engine.service.ts#L46 | Modality
IMPLEMENTED: ASR Ensemble | C:/DATA_AI/rasid/services/conversion-service/src/services/lct-ultra-engine.service.ts#L104 | transcript
IMPLEMENTED: Arabic Typeset | C:/DATA_AI/rasid/services/conversion-service/src/services/lct-ultra-engine.service.ts#L29 | ArabicMode
IMPLEMENTED: Verifier/Ops Gate | C:/DATA_AI/rasid/services/conversion-service/src/services/lct-ultra-engine.service.ts#L144 | exact
IMPLEMENTED: LCT Tool Contracts | C:/DATA_AI/rasid/services/conversion-service/src/services/lct-tool-contracts.ts#L387 | LCT_TOOL_DEFINITIONS
