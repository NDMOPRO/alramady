# وثيقة حدود الوحدات والحوكمة


## RASED AI Engine

1) Purpose
طبقة التشغيل الذكية التي تخطط وتنفذ وتراقب وتوجّه الواجهة وتجمع الأدلة.

2) Architectural Role (Kernel / Module / Project layer)
Kernel

3) Dependencies
rased-tool-contracts, action registry, event registry, guardrails, frontend canvas APIs.

4) Interaction with Action Engine
يبني action graph ثم ينفذه عبر handleExecuteActionGraph ويؤرشف كل action_id.

5) Interaction with Policy Engine
يمر عبر RasedGuardrailsService وrased.policy.check قبل أي فعل حساس أو خارجي.

6) Events emitted and consumed
يصدر rased.action.requested وrased.guardrail.evaluated وrased.action.completed وrased.action.failed وrased.evidence.finalized ويستهلك حالة الواجهة من home/page.tsx.

7) Configuration model

rootDir, fetchImpl, now, preference scope, connector allowlist, strict defaults.

8) Activation model (feature toggle logic)

مفعل عبر /api/v1/ai/rased/* ويعمل فقط داخل Canvas أو API route.

9) Extensibility model

إضافة أدوات جديدة تتم عبر contracts + action registry + schema generator.

10) Governance & risk considerations

يتطلب guardrails, audit, evidence_id, explicit tokens للأفعال الحساسة.

11) Multi-tenant considerations

مفتاح العزل هو workspace_id/user_id في كل طلب وسجل وartifact.

12) AI integration considerations (if applicable)

تكامله AI مباشر لأنه المحرّك القائد لبقية المحركات.


## Strict Replication Engine

1) Purpose
إعادة بناء وتحويل صارم مع PixelDiff==0 وبنية قابلة للتحرير.

2) Architectural Role (Kernel / Module / Project layer)
Module

3) Dependencies
CDR store/builder, rendering farm, exporters, verification modules.

4) Interaction with Action Engine
يُستدعى كأداة ثقيلة من Action Runtime أو عبر LCT/RASED.

5) Interaction with Policy Engine
يعتمد على strict policy bind ولا يسمح بأي mutation أثناء strict.

6) Events emitted and consumed
يصدر نتائج التحقق والأدلة داخل evidence pack ويستهلك assets وrender profiles.

7) Configuration model

farm image, font snapshot, render dpi, repair iterations.

8) Activation model (feature toggle logic)

يعمل عبر strict pipeline وtool registry.

9) Extensibility model

إضافة صيغة جديدة تتطلب exporter + render path + verification hooks.

10) Governance & risk considerations

فشل أي gate يوقف التصدير ويُنتج diff report.

11) Multi-tenant considerations

يعزل jobs والأصول والأدلة حسب execution context.

12) AI integration considerations (if applicable)

تكامل AI غير مباشر عبر VREE/LCT/RASED.


## Slides Engine

1) Purpose
توليد وتحرير وتصدير عروض PPTX داخل Canvas مع قوالب وتحكم متدرج.

2) Architectural Role (Kernel / Module / Project layer)
Module

3) Dependencies
tool contracts, pptx generator, infinite control catalogs, data bindings.

4) Interaction with Action Engine
يُنفذ عبر slides.* tools أو عبر RASED action graph.

5) Interaction with Policy Engine
يخضع لصلاحيات التصدير والمشاركة والقوالب.

6) Events emitted and consumed
يستهلك datasets/templates ويصدر deck refs وartifacts وأدلة parity.

7) Configuration model

theme tokens, template lock, motion level, control manifest.

8) Activation model (feature toggle logic)

مفعل من Canvas ومن LCT/Report/Dashboard integrations.

9) Extensibility model

إضافة blocks/catalog variants وعقود جديدة دون تغيير الواجهة.

10) Governance & risk considerations

Evidence + parity + literal hash + template compliance.

11) Multi-tenant considerations

القوالب والتفضيلات والassets معزولة حسب workspace.

12) AI integration considerations (if applicable)

يستخدم AI في planning/content modes.


## Excel Engine

1) Purpose
استيعاب وتنظيف وتحويل وتحليل وتصدير الجداول المصممة كـworkbooks حقيقية.

2) Architectural Role (Kernel / Module / Project layer)
Module

3) Dependencies
ExcelJS, XLSX, mathjs, T-IR recipes, dataset models.

4) Interaction with Action Engine
يعمل عبر excel tools أو كتبعيات داخل dashboard/report/slides.

5) Interaction with Policy Engine
يطبق classification/exports ويحتفظ بالlineage.

6) Events emitted and consumed
يصدر dataset/table/recipe/artifact refs ويستهلك files/connectors.

7) Configuration model

mode, locale, arabic mode, preview rows, style level.

8) Activation model (feature toggle logic)

ينشط من Canvas أو من LCT/Strict table extraction.

9) Extensibility model

إضافة transforms أو exports تتم عبر contracts والوصفات.

10) Governance & risk considerations

lineage hidden sheet + quality report + audit.

11) Multi-tenant considerations

datasets والوصفات معزولة حسب workspace.

12) AI integration considerations (if applicable)

يوفر auto analyze وjoin suggestions وrecipes.


## Dashboard Engine

1) Purpose
بناء لوحات حيّة متعددة الصفحات مع widgets وتفاعلات وتصدير.

2) Architectural Role (Kernel / Module / Project layer)
Module

3) Dependencies
widget catalogs, datasets, exports, parity verification.

4) Interaction with Action Engine
يتلقى plan/build/bind/export عبر tools.

5) Interaction with Policy Engine
يطبق RLS/CLS/share policy قبل publish/export.

6) Events emitted and consumed
يصدر dashboard refs, export artifacts, parity reports, evidence.

7) Configuration model

mode, dpi, page layouts, filters, bindings.

8) Activation model (feature toggle logic)

ينشط من Canvas ومن Excel/Slides/Reports/LCT.

9) Extensibility model

إضافة widget أو catalog أو export path تتم عبر contracts.

10) Governance & risk considerations

share policy, audit, evidence pack, lazy loading.

11) Multi-tenant considerations

dashboards والروابط والdatasets معزولة.

12) AI integration considerations (if applicable)

يولّد dashboards ويقترح KPIs وjoins.


## Report Engine

1) Purpose
توليد تقارير DOCX/PDF/HTML قابلة للتحرير ومربوطة بالبيانات.

2) Architectural Role (Kernel / Module / Project layer)
Module

3) Dependencies
docx, pdfkit, templates, datasets, content generation.

4) Interaction with Action Engine
ينفذ outline/doc_ir/bind/export عبر tools أو من RASED/LCT.

5) Interaction with Policy Engine
يطبق classification وapproval workflow وshare/export restrictions.

6) Events emitted and consumed
يصدر docs/artifacts/content trace/evidence ويستهلك datasets/assets/templates.

7) Configuration model

template lock, fidelity mode, detail level, citation mode, classification.

8) Activation model (feature toggle logic)

ينشط من Canvas ومن dashboard/slides/lct.

9) Extensibility model

إضافة block أو export path أو writing template تتم عبر contracts.

10) Governance & risk considerations

literal diff, template compliance, audit, evidence.

11) Multi-tenant considerations

templates/style guides/data bindings معزولة.

12) AI integration considerations (if applicable)

كاتب ومحلل ومدقق داخل المسار الذكي.


## LCT Engine

1) Purpose
محرك التحويل والتعريب والتفريغ المتكامل بين كل الصيغ والمحركات.

2) Architectural Role (Kernel / Module / Project layer)
Module

3) Dependencies
pdf-parse, sharp, docx, strict tools, export adapters.

4) Interaction with Action Engine
يُستدعى عبر lct.orch.any_to_any أو من راصد مباشرة.

5) Interaction with Policy Engine
يطبق claims/classification/evidence gates قبل التسليم.

6) Events emitted and consumed
يصدر artifacts/transcripts/evidence ويستهلك assets متعددة الأنماط.

7) Configuration model

strict claims, fidelity mode, target language, templates, term packs.

8) Activation model (feature toggle logic)

ينشط من Canvas عند تحويل/تعريب/تفريغ.

9) Extensibility model

إضافة modality أو export adapter تتم عبر contracts.

10) Governance & risk considerations

exactness gates + verifier proof + no hallucination.

11) Multi-tenant considerations

term packs والأساليب والassets معزولة.

12) AI integration considerations (if applicable)

يعتمد على AI في ASR/OCR/localization orchestration.
