# التقرير التقني التدقيقي
تاريخ الإنشاء: 2026-03-10T11:34:36.915Z
عدد المحركات الفعلي: 7
عدد الخدمات: 16
عدد الملفات محل الفحص: 619
عدد الدوال والطرق التقريبية: 10786
عدد واجهات API المرصودة: 1031

## RASED AI Engine
الخدمة: ai-service. الملفات المفحوصة: 106. الطرق المرصودة: 1999. واجهات API: 160.
المزايا المنفذة فعليًا:
تحليل النية: C:/DATA_AI/rasid/services/ai-service/src/services/rased-agent-os.service.ts#L220 | handleIntentParse(
بناء مخطط الأفعال: C:/DATA_AI/rasid/services/ai-service/src/services/rased-agent-os.service.ts#L222 | handlePlanActionGraph(
تنفيذ مخطط الأفعال: C:/DATA_AI/rasid/services/ai-service/src/services/rased-agent-os.service.ts#L224 | handleExecuteActionGraph(
مراقبة الواجهة: C:/DATA_AI/rasid/services/ai-service/src/services/rased-agent-os.service.ts#L226 | handleObserveUiState(
جولات الإرشاد: C:/DATA_AI/rasid/services/ai-service/src/services/rased-agent-os.service.ts#L230 | handleUiTourStart(
مركز التدريب: C:/DATA_AI/rasid/services/ai-service/src/services/rased-agent-os.service.ts#L236 | handleTrainingPackIngest(
البحث المعرفي: C:/DATA_AI/rasid/services/ai-service/src/services/rased-agent-os.service.ts#L242 | handleKnowledgeSearch(
التفضيلات: C:/DATA_AI/rasid/services/ai-service/src/services/rased-agent-os.service.ts#L246 | handlePreferenceSet(
القيود Guardrails: C:/DATA_AI/rasid/services/ai-service/src/services/rased-guardrails.service.ts#L85 | evaluate(
سجل الأفعال: C:/DATA_AI/rasid/services/ai-service/src/services/rased-action-registry.service.ts#L227 | RasedActionRegistryService
سجل الأحداث: C:/DATA_AI/rasid/services/ai-service/src/services/rased-event-schema-registry.service.ts#L79 | RasedEventSchemaRegistryService
الأدلة: C:/DATA_AI/rasid/services/ai-service/src/services/rased-agent-os.service.ts#L254 | handleEvidencePack(
المزايا الجزئية:
لا يوجد عناصر جزئية مرصودة ضمن هذا المحرك في المسح الحالي.
المزايا المفقودة ضمن قائمة التحقق الحالية:
لا يوجد عنصر مفقود ضمن القائمة الحالية لهذا المحرك.

## Strict Replication Engine
الخدمة: replication-service. الملفات المفحوصة: 129. الطرق المرصودة: 2576. واجهات API: 101.
المزايا المنفذة فعليًا:
خط الأنابيب الصارم: C:/DATA_AI/rasid/services/replication-service/src/strict/pipeline/strict-pipeline.ts#L116 | export class StrictPipeline
PixelDiff صفري: C:/DATA_AI/rasid/services/replication-service/src/strict/verify/pixel-diff.ts#L23 | pixel
التحقق البنيوي: C:/DATA_AI/rasid/services/replication-service/src/strict/verify/structural-equivalence.ts#L32 | structural
Evidence Pack: C:/DATA_AI/rasid/services/replication-service/src/strict/evidence/evidence-pack.ts#L15 | EvidencePackBuilder
سجل الأدوات الصارم: C:/DATA_AI/rasid/services/replication-service/src/strict/tools/registry.ts#L72 | executeTool
المزايا الجزئية:
مزرعة الرندر: C:/DATA_AI/rasid/services/replication-service/src/strict/render/farm-renderer.ts | class FarmRenderer
المزايا المفقودة ضمن قائمة التحقق الحالية:
لا يوجد عنصر مفقود ضمن القائمة الحالية لهذا المحرك.

## Slides Engine
الخدمة: presentation-service. الملفات المفحوصة: 88. الطرق المرصودة: 1615. واجهات API: 355.
المزايا المنفذة فعليًا:
Intent Parse للعروض: C:/DATA_AI/rasid/services/presentation-service/src/services/gamma-engine.service.ts#L62 | IntentManifest
Outline: C:/DATA_AI/rasid/services/presentation-service/src/services/gamma-engine.service.ts#L84 | Outline
Storyboard: C:/DATA_AI/rasid/services/presentation-service/src/services/gamma-engine.service.ts#L113 | StoryboardSlide
Template/Theme: C:/DATA_AI/rasid/services/presentation-service/src/services/gamma-engine.service.ts#L102 | ThemeTokens
Infinite Control: C:/DATA_AI/rasid/services/presentation-service/src/services/slides-infinite-control.service.ts#L165 | buildControlManifest
Tool Contracts: C:/DATA_AI/rasid/services/presentation-service/src/services/slides-tool-contracts.ts#L568 | SLIDES_TOOL_DEFINITIONS
المزايا الجزئية:
لا يوجد عناصر جزئية مرصودة ضمن هذا المحرك في المسح الحالي.
المزايا المفقودة ضمن قائمة التحقق الحالية:
لا يوجد عنصر مفقود ضمن القائمة الحالية لهذا المحرك.

## Excel Engine
الخدمة: excel-service. الملفات المفحوصة: 101. الطرق المرصودة: 1813. واجهات API: 116.
المزايا المنفذة فعليًا:
Blank Table Canvas: C:/DATA_AI/rasid/services/excel-service/src/services/excel-ultra-engine.service.ts#L41 | TableRef
Batch Ingest: C:/DATA_AI/rasid/services/excel-service/src/services/excel-ultra-engine.service.ts#L1858 | data.ingest.batch
T-IR: C:/DATA_AI/rasid/services/excel-service/src/services/excel-ultra-engine.service.ts#L1865 | expr.tir.apply
SVM Recalc: C:/DATA_AI/rasid/services/excel-service/src/services/excel-ultra-engine.service.ts#L1866 | excel.svm.recalc
Diff Engine: C:/DATA_AI/rasid/services/excel-service/src/services/excel-ultra-engine.service.ts#L1867 | compare.dataset_diff
Excel Tool Contracts: C:/DATA_AI/rasid/services/excel-service/src/services/excel-tool-contracts.ts#L323 | EXCEL_TOOL_DEFINITIONS
المزايا الجزئية:
لا يوجد عناصر جزئية مرصودة ضمن هذا المحرك في المسح الحالي.
المزايا المفقودة ضمن قائمة التحقق الحالية:
لا يوجد عنصر مفقود ضمن القائمة الحالية لهذا المحرك.

## Dashboard Engine
الخدمة: dashboard-service. الملفات المفحوصة: 72. الطرق المرصودة: 795. واجهات API: 137.
المزايا المنفذة فعليًا:
Intent Parse للوحات: C:/DATA_AI/rasid/services/dashboard-service/src/services/dashboard-ultra-engine.service.ts#L45 | DashboardActionContext
Widget Catalog: C:/DATA_AI/rasid/services/dashboard-service/src/services/dashboard-ultra-engine.service.ts#L18 | WidgetKind
D-IR Plan: C:/DATA_AI/rasid/services/dashboard-service/src/services/dashboard-ultra-engine.service.ts#L891 | dashboard_ir
Data Binding: C:/DATA_AI/rasid/services/dashboard-service/src/services/dashboard-ultra-engine.service.ts#L1474 | dashboard.bind_data
Publish/Share: C:/DATA_AI/rasid/services/dashboard-service/src/services/dashboard-ultra-engine.service.ts#L1392 | dashboard.publish
Dashboard Tool Contracts: C:/DATA_AI/rasid/services/dashboard-service/src/services/dashboard-tool-contracts.ts#L259 | DASHBOARD_TOOL_DEFINITIONS
المزايا الجزئية:
لا يوجد عناصر جزئية مرصودة ضمن هذا المحرك في المسح الحالي.
المزايا المفقودة ضمن قائمة التحقق الحالية:
لا يوجد عنصر مفقود ضمن القائمة الحالية لهذا المحرك.

## Report Engine
الخدمة: reporting-service. الملفات المفحوصة: 68. الطرق المرصودة: 936. واجهات API: 105.
المزايا المنفذة فعليًا:
Intent Parse للتقارير: C:/DATA_AI/rasid/services/reporting-service/src/services/report-ultra-engine.service.ts#L2113 | report.intent_parse
DOC-IR: C:/DATA_AI/rasid/services/reporting-service/src/services/report-ultra-engine.service.ts#L88 | DocRef
Literal Hash: C:/DATA_AI/rasid/services/reporting-service/src/services/report-ultra-engine.service.ts#L37 | literal
Content Trace: C:/DATA_AI/rasid/services/reporting-service/src/services/report-ultra-engine.service.ts#L197 | content_trace
Governance: C:/DATA_AI/rasid/services/reporting-service/src/services/report-ultra-engine.service.ts#L679 | classification
Report Tool Contracts: C:/DATA_AI/rasid/services/reporting-service/src/services/report-tool-contracts.ts#L341 | REPORT_TOOL_DEFINITIONS
المزايا الجزئية:
لا يوجد عناصر جزئية مرصودة ضمن هذا المحرك في المسح الحالي.
المزايا المفقودة ضمن قائمة التحقق الحالية:
لا يوجد عنصر مفقود ضمن القائمة الحالية لهذا المحرك.

## LCT Engine
الخدمة: conversion-service. الملفات المفحوصة: 55. الطرق المرصودة: 1052. واجهات API: 57.
المزايا المنفذة فعليًا:
Orchestrator Any→Any: C:/DATA_AI/rasid/services/conversion-service/src/services/lct-ultra-engine.service.ts#L2063 | lct.orch.any_to_any
Modality Detect: C:/DATA_AI/rasid/services/conversion-service/src/services/lct-ultra-engine.service.ts#L46 | Modality
ASR Ensemble: C:/DATA_AI/rasid/services/conversion-service/src/services/lct-ultra-engine.service.ts#L104 | transcript
Arabic Typeset: C:/DATA_AI/rasid/services/conversion-service/src/services/lct-ultra-engine.service.ts#L29 | ArabicMode
Verifier/Ops Gate: C:/DATA_AI/rasid/services/conversion-service/src/services/lct-ultra-engine.service.ts#L144 | exact
LCT Tool Contracts: C:/DATA_AI/rasid/services/conversion-service/src/services/lct-tool-contracts.ts#L387 | LCT_TOOL_DEFINITIONS
المزايا الجزئية:
لا يوجد عناصر جزئية مرصودة ضمن هذا المحرك في المسح الحالي.
المزايا المفقودة ضمن قائمة التحقق الحالية:
لا يوجد عنصر مفقود ضمن القائمة الحالية لهذا المحرك.

## الأكواد الموضعية أو الآثار غير المكتملة
لم يُرصد TODO أو FIXME أو stub داخل مسارات runtime المفحوصة.
