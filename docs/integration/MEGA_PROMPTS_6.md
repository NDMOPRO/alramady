# 6 “MEGA PROMPTS” — كافية وحدها لتنفيذ كل ما نريد (بدون الرجوع لأي مستند آخر)
# (صارمة/أمرية/مضادة للتحايل/مناسبة لمشروعك القائم) — انسخ كل Prompt كما هو للمنفّذ
# =================================================================================================
# IMPORTANT: كل Prompt أدناه “Self-Contained”: يحتوي المتطلبات + بوابات كشف الغش + تعريف DONE.
# كل Prompt MUST يُنفّذ باستخدام نفس العقد الآتي (PROMPT-0A) + نفس سكربت البوابة task_gate.mjs.
# إذا فشل أي Gate أو أي Evidence ناقص => FAIL وتتوقف.

###################################################################################################
PROMPT-0A (العقد الإلزامي الثابت) — يُلصق فوق كل Prompt أدناه (لا تغيّر حرف)
###################################################################################################
أنت منفّذ Production. لا كود وهمي. لا ادعاء. لا أسئلة. لا تحايل.

- ممنوع: TODO/FIXME/STUB/MOCK/PLACEHOLDER/DEMO/not implemented
- ممنوع: status=ok/Completed بدون artifact فعلي + evidence_id
- ممنوع: أي Strict بعتبة ≠ 0.0 (STRICT = PixelDiff==0.0 فقط + StructuralEQ)
- ممنوع: bypass RBAC/RLS/Guardrails أو override صامت (rewrite_prompt/swap_action/override_tool/bypass_policy)
- ممنوع: صفحات أدوات/Routes جديدة — Canvas واحد + Focus Stage داخل نفس الصفحة فقط

شرط التنفيذ الوحيد:
1) نفّذ التعديل
2) شغّل:
   node scripts/ci/task_gate.mjs --task-id "<TASK_ID>" --title "<TASK_TITLE>" --spec-book "<SELF_CONTAINED>" --sections "<THIS_PROMPT>"
3) لا PASS إلا إذا ExitCode=0 + Evidence Pack كامل داخل /EVIDENCE/<TASK_ID>/

صيغة الرد (بدون شرح):
- TASK_ID + TASK_TITLE
- FILES CHANGED (paths)
- GATE RESULT: PASS/FAIL + /EVIDENCE/<TASK_ID>/SUMMARY.txt
- FINAL: PASS فقط إذا ExitCode=0

###################################################################################################
PROMPT-1 (FOUNDATION) — Canvas واحد + FSM + Cards + Focus + Sidebar + Tools + Evidence + Strict + CI
###################################################################################################
TASK_ID: FND-ALL
TASK_TITLE: FOUNDATION KERNEL (Canvas+Tools+Evidence+Strict+CI)
SELF_CONTAINED: THIS_PROMPT_ONLY
THIS_PROMPT: PROMPT-1

هدف هذا الـPrompt:
تأسيس “نواة المنصة” التي تمنع الغش وتوحد التشغيل وتجعل كل المحركات تعمل داخل Canvas واحد.

A) FRONTEND — Canvas واحد إلزامي
1) MUST اعتماد /home كـCanvas وحيد.
2) MUST إضافة XState وتنفيذ Root Parallel Machine:
   regions: themeAndEffects, navigation, sidebar, composer, conversation, selection, focusStage, overlays, jobs
3) MUST تحويل RasidCommandCenter إلى Card Stream:
   FileCard / ContextActionsCard / PlanCard / RunCard / PreviewCard / ResultCard / EvidenceCard / DiffCard
4) MUST Dropzone داخل chat.stream:
   - Actions تظهر ≤300ms (حتى لو “جار التحليل…”)
5) MUST Focus Stage داخل نفس الصفحة:
   - فتح/إغلاق بدون route change
   - back/preview/export/share
6) MUST Sidebar contract:
   hidden/peek/full + pin/unpin + tabs: library/context/history/templates/exports/permissions
7) MUST Overlays:
   command palette + preview reader + tour + modal
   - invariant: One blocking modal + One focus stage

B) BACKEND — ToolEnvelope + Runtime Registry (مصدر الحقيقة)
8) MUST توحيد كل تشغيل عبر ToolEnvelope:
   input: {request_id, tool_id, context, inputs, params}
   output: {status, refs, warnings}
9) MUST Governance يوفر Runtime Registry:
   GET /api/v1/registry/tools
   GET /api/v1/registry/tools/{tool_id}
   tool entry MUST: tool_id, service, endpoint, required_permissions, strict_supported, evidence_required, schema_paths
10) MUST كل service محرك يضيف endpoint موحد:
   POST /api/v1/tools/execute
   - validate schema
   - route tool_id إلى handlers الداخلية الحالية
11) MUST ai-service Orchestrator:
   - ممنوع mapping ثابت endpoints داخل الكود
   - MUST fetch registry runtime
   - MUST execute tools ديناميكيًا
   - MUST emit job events للواجهة: stage/progress/preview/result/evidence/fail

C) EVIDENCE PACK — شرط “لا Done بدون دليل”
12) MUST governance evidence API:
   POST /api/v1/evidence/create
   POST /api/v1/evidence/attach
   POST /api/v1/evidence/close
   - evidence immutable after close
13) MUST كل نجاح لأي tool:
   - يرفق artifacts + renders + diffs + hashes + action snapshot
   - لا يُسمح completed بدون evidence_id

D) STRICT LOCK GLOBAL
14) MUST تعريف strict النهائي:
   strict => threshold=0.0 hard enforced + StructuralEQ pass + PixelDiff==0.0
   - أي override = 422
15) MUST Diff reporting:
   - JSON diff + heatmap images (عند فشل strict)

E) CI ANTI-CHEAT (إجباري)
16) MUST إنشاء scripts/ci/task_gate.mjs (سكربت بوابة واحد) ويشمل:
   - install/build/typecheck/lint/tests
   - forbidden tokens scan
   - no silent override scan
   - git diff/status evidence
17) MUST إضافة CI job يمنع الدمج إذا task_gate FAIL
18) MUST إضافة Golden Corpus scaffold (فارغ الآن) + runner placeholder ممنوع (يعني ملف runner يُنفّذ فعليًا حتى لو corpus قليل)

F) TESTS (ممنوع PASS بدونها)
19) MUST FSM unit tests (modal guards + reduce motion + job lifecycle)
20) MUST Playwright E2E:
   - drop file → actions ≤300ms → select action (mock tool) → plan/run/result/evidence
   - UI MUST NOT show Completed without evidence

DONE (غير قابل للتفاوض):
- ExitCode=0 من task_gate
- UI Canvas يعمل بالـCards + Focus + Sidebar + Overlays
- Tool registry runtime شغال
- Evidence mandatory شغال
- Strict lock enforced عالميًا
- CI يمنع الدمج عند الفشل

###################################################################################################
PROMPT-2 (STRICT REPLICATION ENGINE) — PDF/Images → Editable PPTX/DOCX/XLSX/Dashboard (1:1 = 100%)
###################################################################################################
TASK_ID: ENG-STRICT
TASK_TITLE: STRICT REPLICATION 1:1 (PixelDiff=0 + Editable+Functional)
SELF_CONTAINED: THIS_PROMPT_ONLY
THIS_PROMPT: PROMPT-2

هدف المحرك:
أي PDF/صورة/لقطة شاشة → أي مخرج (PPTX/DOCX/XLSX/Dashboard/HTML/PDF) مع:
- Editable حقيقي (نص/جداول/مخططات عناصر لا صور)
- Functional equivalence (لو داشبورد → Live dashboard)
- Strict acceptance: PixelDiff==0.0 + StructuralEQ pass فقط

A) PIPELINE إلزامي
1) MUST مسار strict:
   ingest → build CDR_ABSOLUTE → export target → render source+target in farm → verify strict → repair loop → evidence
2) MUST CDR_ABSOLUTE يحتوي:
   - element inventory + bounds + styles + typography metrics + z-index + groups
   - tables structured + charts structured + images as assets
3) MUST ممنوع “تسطيح” النص/الجدول/المخطط كصورة

B) STRICT GATES (لا بديل)
4) MUST StructuralEQ:
   - نفس عدد العناصر وأنواعها وخصائصها الأساسية (type, bounds, fill/stroke, font, alignment)
5) MUST PixelDiff==0.0:
   - deterministic render environment
   - أي اختلاف = FAIL
6) MUST Repair Loop:
   - يعيد البناء/التصدير حتى pass أو fail مع تقرير سبب

C) FONTS POLICY (لا فشل)
7) MUST دعم fonts:
   - إذا الخط موجود: embed/subset
   - إذا غير موجود: MUST يعلن (قبل التسليم) أقرب خط + نسبة اختلاف metrics
   - strict still must pass PixelDiff==0.0 (إذا لم يمكن، MUST route إلى VerifierOps داخلي/إلى سياسة “glyph vectorization”)
8) MUST بديل إلزامي لحالات عدم توفر خط:
   - glyph vectorization للنصوص كمسارات (مع بقاء قابلية التحرير عبر حفظ النص الأصلي في metadata + editor reconstruction)
   - هذا الخيار MUST يكون تلقائيًا إذا strict مهدد

D) CHARTS/TABLES
9) MUST tables:
   - cells structured editable + borders + fills + padding + merge cells + rtl
10) MUST charts:
   - chart type + axis scale + ticks + legend positions + series palette deterministic

E) EXPORTS (مخارج)
11) MUST PPTX/DOCX/XLSX:
   - OpenXML valid + editable + render parity
12) MUST Dashboard:
   - output MUST be LIVE dashboard (not static image)
   - إذا لا بيانات: MUST inject synthetic data “clearly labeled” داخل model لكن لا تسليم كحقائق

F) TOOLS (ToolEnvelope) — MUST توفر أدوات:
13) MUST implement tools (أسماء إلزامية):
   - cdr.build
   - cdr.export
   - render.render_source
   - render.render_target
   - verify.structural_eq
   - verify.pixel_eq (threshold=0 only)
   - repair.loop
   - evidence.attach
14) MUST كل tool schema validation runtime

G) TESTS + ANTI-CHEAT
15) MUST golden strict test:
   - pdf→pptx strict: PixelDiff==0 + editable check (no raster text)
16) MUST fail tests:
   - attempt threshold!=0 => 422
   - attempt return ok without artifacts/evidence => FAIL
17) MUST output evidence:
   - source render + target render + diff report + hashes + openxml validation output

DONE:
- PASS strict gate for golden assets
- evidence_id exists لكل نجاح
- CI يمنع أي loosen strict

###################################################################################################
PROMPT-3 (LCT ENGINE) — Any→Any + تعريب عالمي + تفريغ 100% + VerifierOps
###################################################################################################
TASK_ID: ENG-LCT
TASK_TITLE: LCT (Localization + Conversion + Transcription) — PRO_100 + STRICT_100
SELF_CONTAINED: THIS_PROMPT_ONLY
THIS_PROMPT: PROMPT-3

A) CLAIMS (ثلاثة) — MUST
1) CONVERT_STRICT_1TO1_100:
   - إذا مفعّل: يستخدم محرك strict أعلاه (PixelDiff=0)
2) LOCALIZE_PRO_100:
   - termbase + translation memory + style guide
   - Arabic ELITE typesetting
   - LQA==0 + terminology compliance 100%
   - layout QA: no overlap/no clip
3) TRANSCRIBE_STRICT_100:
   - ASR ensemble (≥2 engines) + diarization + forced alignment
   - exactness gate: unresolved spans MUST be empty
   - إذا unresolved spans>0 => MUST VerifierOps داخلي (بدون سؤال المستخدم)
   - outputs: docx/json/srt/vtt + timestamps

B) ANY→ANY Conversion (non-strict allowed فقط إذا claim none)
4) MUST تحويل أي شيء لأي شيء عبر CDR:
   - PDF/Image/Office/Text/Audio/Video → CDR → targets
5) MUST منع ادعاء استخراج “تعليقات فيديو” إذا غير متوفر مصدر

C) Localization details (Arabic professional)
6) MUST RTL ELITE:
   - shaping/bidi + metrics lock + punctuation rules + mixed scripts
7) MUST preserve design layout (layout lock + repair loop)
8) MUST preflight:
   - إذا خط ناقص: يذكر أقرب خط + يطبق السياسة

D) Transcription strict
9) MUST diarization + overlap handling
10) MUST forced alignment passes
11) MUST on-screen OCR for video (optional but must if enabled)
12) MUST evidence pack: alignment report + unresolved empty

E) TOOLS (إلزامية)
13) MUST tools:
   - lct.orch.any_to_any
   - modality_detect
   - asr_ensemble_strict
   - forced_alignment
   - exactness_gate
   - verifier.ops.dispatch
   - termaware_translate
   - arabic_typeset_elite
   - lqa_gate_zero
   - evidence.pack

F) TESTS
14) MUST tests:
   - localize: termbase compliance + LQA==0
   - transcribe: unresolved empty before done
   - any success must include evidence_id

DONE:
- claims gates pass
- no best-effort outputs
- evidence mandatory

###################################################################################################
PROMPT-4 (SLIDES ENGINE) — Gamma-class+ + Template-Lock + LITERAL/SMART + Infographics + Parity
###################################################################################################
TASK_ID: ENG-SLIDES
TASK_TITLE: Slides Engine (Gamma+) — Deck Builder + Template Lock + Infinite Variants
SELF_CONTAINED: THIS_PROMPT_ONLY
THIS_PROMPT: PROMPT-4

A) GENERATION MODES
1) AUTO mode:
   prompt واحد → outline → storyboard → deck → QA → export
2) CONTROLLED mode:
   knobs: slide_count, tone, density, theme/brand, language, infographic_level, motion_level, chart_style, icon_pack

B) TEMPLATE-LOCK (إجباري)
3) MUST template extraction:
   masters/layouts/placeholders/tokens/do-not-change rules
4) MUST template compliance report
5) MUST refuse generating خارج القالب عند تفعيل lock

C) CONTENT MODES (صارمة)
6) MODE_LITERAL_1TO1:
   - النص EXACT (no add/remove/rewrite)
   - literal hash in/out must match
7) MODE_SMART:
   - content trace (no invented facts)
   - citations optional

D) INFOGRAPHICS + VARIANTS
8) MUST catalog blocks:
   timeline/process/swot/2x2/kpi grid/comparison/org chart/quote/section divider/diagram
9) MUST “swap infographic” بلا حدود عبر variants + search

E) DATA PICKER داخل الشرائح
10) MUST إدراج جدول/مخطط من مكتبة الإكسل:
    select file/sheet/table/columns + transforms + bind chart

F) STRICT INSERT
11) MUST إدراج شريحة من صورة/PDF عبر محرك strict (PixelDiff=0)

G) EXPORTS + PARITY
12) MUST PPTX export:
   - OpenXML valid
   - editable elements
13) MUST RenderParity:
   preview render vs pptx render match (farm)
14) MUST evidence includes parity report

H) TESTS
15) MUST tests:
   - pptx valid
   - editable checks (no raster text)
   - template lock compliance
   - literal hash equality
   - parity pass

DONE:
- deck generation + edits + swaps + exports all pass with evidence

###################################################################################################
PROMPT-5 (EXCEL ENGINE) — Drag Columns + Massive Scale + PowerQuery/Expr IR + Diff + Recipes
###################################################################################################
TASK_ID: ENG-EXCEL
TASK_TITLE: Excel Engine (Drag Columns) — Scale + T-IR + Cleaning + Compare + Export
SELF_CONTAINED: THIS_PROMPT_ONLY
THIS_PROMPT: PROMPT-5

A) CANVAS TABLE BUILDER
1) MUST جدول فارغ داخل Canvas:
   - drag/drop عمود من أي ملف/ورقة/جدول
2) MUST Column Map:
   - اكتشاف أعمدة متشابهة (semantic)
   - unify rename suggestions
3) MUST joins suggestions:
   - smart join keys + preview + apply

B) INGESTION
4) MUST ingest:
   - مئات/آلاف ملفات + مجلد كامل + zip
   - قراءة كل sheets + اكتشاف الجداول غير المنسقة
   - preflight summary: rows/cols/nulls/sensitive cols/duplicates
5) MUST streaming for big files (لا تجميد UI)

C) TRANSFORMS / IR
6) MUST Expression IR (T-IR):
   - expression editor + GUI builder
   - deterministic execution
7) MUST Power Query-like operations:
   - split/merge columns, normalize dates/currency, trim/replace, dedupe, pivot/unpivot
8) MUST Operation Memory (Recipes):
   - سجل خطوات قابل لإعادة التشغيل على ملفات جديدة

D) CLEANING + QUALITY
9) MUST cleaning suite:
   duplicates/nulls/outliers/spelling normalization/unit normalization
10) MUST quality score 0..100 + reasons

E) COMPARE/DIFF
11) MUST compare:
   file vs file, table vs table, column vs column
   outputs: diff table + colored indicators + report export

F) KPI + EXPORT
12) MUST KPIs suggestions + summary tables
13) MUST export:
   XLSX editable + lineage sheet + optionally dashboard/report/slides triggers

G) TESTS
14) MUST tests:
   - ingest 10 files merge
   - compare diff correctness
   - no hardcoded demo data
   - evidence mandatory

DONE:
- drag columns works + transforms + recipes + compare + export with evidence

###################################################################################################
PROMPT-6 (DASHBOARD + REPORTS + RASED AI TRAINING + SECURITY FINAL) — إغلاق المنصة بالكامل
###################################################################################################
TASK_ID: ENG-FINAL
TASK_TITLE: Dashboard+Reports+RasedAI+Security Closure
SELF_CONTAINED: THIS_PROMPT_ONLY
THIS_PROMPT: PROMPT-6

A) DASHBOARD (LIVE)
1) MUST live dashboards:
   - multi-page
   - binds to datasets
   - refresh scheduling + real-time update
   - drill/filters
2) MUST widgets catalog:
   - آلاف widgets عبر catalog + parametric variants + search
3) MUST alerts/anomaly widgets
4) MUST share/permissions:
   view/comment/edit + export permissions separate
5) MUST exports:
   pdf/pptx/docx/html/xlsx with parity + evidence

B) REPORTS (DOCX-first)
6) MUST report engine:
   - DOC-IR + data bindings
   - literal vs smart + hash/trace
   - writing templates (tone/addressing) + user/org prefs
   - approvals + classification + audit
   - exports pdf/html parity + evidence

C) RASED AI (AGENT OS)
7) MUST agent:
   intent→plan→execute عبر tools فقط
   truthfulness contract (no done without evidence)
8) MUST training center:
   packs/playbooks/evals + versioning + tenant scoped
9) MUST guided tours:
   explain/coach/do-it-for-me يعتمد data-rased-id فقط
10) MUST playbooks:
   PDF→PPTX strict
   Image→XLSX strict
   Dataset→Dashboard
   Video→Transcribe strict
   Dataset→Report→Slides

D) SECURITY/GOVERNANCE
11) MUST RBAC/RLS/Guardrails:
   - لا bypass
   - immutable logs
12) MUST Search/RAG ACL:
   - Postgres GIN primary
   - ES optional accelerator فقط (لا dependency core)
13) MUST leak tests:
   cross-tenant red team retrieval + access denied proofs

E) GOLDEN CORPUS FINAL
14) MUST golden runner:
   - يشغّل كل السيناريوهات
   - يمنع الدمج إذا أي fail
15) MUST PROMPT-AUDIT final:
   - coverage_matrix: كل المتطلبات YES (0 partial/no/unknown)

DONE:
- dashboards live + reports docx + rased training/tours + security + final audit YES

###################################################################################################
“كيف تعرف أنها كافية؟” (حُكم نهائي غير قابل للتحايل)
###################################################################################################
الحزمة تُعتبر منفذة بالكامل فقط إذا:
1) كل Tasks PASS عبر task_gate
2) Golden corpus PASS
3) PROMPT-AUDIT النهائي يخرج:
   coverage_matrix.csv = YES لكل المتطلبات (0 PARTIAL/NO/UNKNOWN)
4) لا forbidden tokens
5) strict everywhere = PixelDiff==0.0 فقط
6) لا “Completed” UI بدون evidence_id

# END OF 6 MEGA PROMPTS
