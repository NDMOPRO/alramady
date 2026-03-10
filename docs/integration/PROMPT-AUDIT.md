# PROMPT-AUDIT (MASTER) — تقرير تحليل المنصة “سطرًا سطرًا” + حصر المنفّذ/الناقص — نسختين (AR مبسّط + EN تقني)
# استخدمه كما هو في أي خطوة/فرع/إصدار. ممنوع تعديل نصه إلا حقول INPUTS.

========================
A) INPUTS (املأها فقط)
========================
AUDIT_ID: <مثال: AUDIT-2026-03-10>
REPO_ROOT: <مسار الريبو>
SPEC_BOOK_PATH: <مسار كتاب المواصفات الجامع داخل الريبو أو الملف المرفق>
TARGET_BRANCH_OR_COMMIT: <branch/commit hash>
SCOPE: <all | frontend | services | specific engines list>
OUTPUT_DIR: <افتراضي: /AUDIT/<AUDIT_ID>>

========================
B) ABSOLUTE RULES (NON-NEGOTIABLE)
========================
B1) ممنوع الادعاء:
- MUST NOT تقول “موجود/منفّذ” إلا إذا لديك **دليل كود**: (مسار ملف + أرقام أسطر + مقتطف كود صغير).
- إذا لم تجد الدليل: MUST تكتب “UNKNOWN” وليس “موجود”.
- إذا وجد دليل جزئي: MUST تكتب “PARTIAL” وتذكر ما الناقص تحديدًا.

B2) تحليل “سطرًا سطرًا” يعني:
- MUST فهرسة جميع ملفات الكود ضمن النطاق + استخراج:
  - الخدمات (services) + الـAPIs + الأدوات (tools) + النماذج (DB/models) + الأحداث (events) + الواجهات (frontend surfaces).
- MUST ربط كل بند في التقرير بموقعه في الكود (file path + line range).
- MUST عدم الاكتفاء بملخصات عامة.

B3) لا كود وهمي:
- MUST كشف: TODO/FIXME/STUB/MOCK/PLACEHOLDER/DEMO/not implemented
- MUST كشف أي “نجاح” يرجع ok بدون artifact/evidence
- MUST كشف hardcoded data الذي يُعرض كبيانات حقيقية

B4) مقارنة إلزامية مع SPEC_BOOK:
- MUST استخراج قائمة “المتطلبات” من SPEC_BOOK أو على الأقل أقسام المحركات الرئيسية.
- MUST إنتاج Matrix:
  Requirement → Implemented (YES/PARTIAL/NO/UNKNOWN) → Evidence → Notes → Owner module

B5) نسختان من التقرير:
- MUST إنتاج نسختين:
  1) عربي مبسّط (لغة بسيطة جدًا، لكن شامل)
  2) English technical (دقيق، مصطلحات هندسية، كامل)
- يجب أن يكون المحتوى “متكافئ” بين النسختين (نفس الحقائق).

B6) Evidence Pack إلزامي:
- MUST حفظ مخرجات كل أوامر الفحص والتحليل في OUTPUT_DIR/evidence/
- MUST التقرير يربط إلى ملفات evidence بدل الكلام.

========================
C) REQUIRED COMMANDS (MUST RUN) + EVIDENCE
========================
نفّذ كل التالي من REPO_ROOT واحفظ كل مخرجاته نصيًا في OUTPUT_DIR/evidence/ (كل أمر ملف مستقل):

C1) Environment
- node -v
- <pkgmgr> -v
- git rev-parse HEAD
- git status --porcelain
- git log -1 --oneline

C2) Build/Lint/Typecheck/Test (إذا موجود)
- <pkgmgr> install --frozen-lockfile (أو المكافئ)
- <pkgmgr> run build
- <pkgmgr> run typecheck (أو tsc -p ...)
- <pkgmgr> run lint
- <pkgmgr> test (jest/vitest/playwright إن وجد)

C3) Repo Inventory
- (إن توفر) rg --version
- rg -n "TODO|FIXME|STUB|MOCK|PLACEHOLDER|DEMO|not implemented" .
- rg -n "threshold|pixelDiff|isPerfect|strict" services/ packages/ frontend/
- rg -n "router|app\.|controller|@Controller|@Get|@Post|express|fastify|nestjs" services/
- rg -n "data-rased-id" frontend/
- rg -n "createMachine|xstate" frontend/

C4) Docker/Runtime (إذا موجود docker compose)
- docker compose up -d
- docker compose ps
- curl health endpoints (إن وجدت) أو على الأقل سجّل ps

========================
D) REQUIRED OUTPUT FILES (MUST CREATE)
========================
داخل OUTPUT_DIR أنشئ الملفات التالية (ممنوع تغيير الأسماء):

1) OUTPUT_DIR/report_ar_simple.md
2) OUTPUT_DIR/report_en_technical.md
3) OUTPUT_DIR/audit_index.json           (machine readable summary)
4) OUTPUT_DIR/coverage_matrix.csv        (requirements vs implementation)
5) OUTPUT_DIR/api_inventory.csv          (service, method, path, auth, handler_file, handler_lines)
6) OUTPUT_DIR/tool_inventory.csv         (tool_id, service, endpoint, perms, evidence_required, schema_file)
7) OUTPUT_DIR/model_inventory.csv        (db model/migration file + key fields + file/lines)
8) OUTPUT_DIR/ui_inventory.csv           (views, components, state machines, data-rased-id map)
9) OUTPUT_DIR/findings_security.md       (RBAC/RLS/guardrails/bypass scans)
10) OUTPUT_DIR/findings_anti_cheat.md    (placeholders, fake success, demo data, strict overrides)
11) OUTPUT_DIR/evidence/…                (كل مخرجات الأوامر)

========================
E) HOW TO BUILD THE INVENTORIES (MANDATORY METHODS)
========================

E1) Services Inventory (MUST)
- اكتب قائمة بكل service تحت services/
- لكل service:
  - language/framework
  - entrypoint file(s)
  - ports/config
  - docker references
  - dependencies
  - main responsibilities
- كل نقطة MUST مرجّعة إلى file+lines.

E2) API Inventory (MUST)
- لكل service:
  - استخرج كل route/endpoints (method + path)
  - اربطها بـ handler file + line range
  - حدّد auth requirements (401/403) إن وجدت
  - حدّد request/response shapes إن كانت موجودة (schemas/types)
- الناتج في api_inventory.csv + ملخص داخل التقريرين.

E3) Tool Inventory (MUST)
- إذا يوجد Tool Registry بالريبو:
  - استخرجه كما هو
- إذا لا يوجد Runtime Registry:
  - استخرج mapping من الكود (resolveEndpoint/tool router) واصنع tool_inventory.csv
- لكل tool:
  - tool_id
  - endpoint
  - required permissions
  - evidence_required
  - schemas location
- أي tool بدون schema أو permissions MUST يُوسم “NON-COMPLIANT”.

E4) Models/Data Inventory (MUST)
- استخرج جميع migrations/models/schemas
- اربط كل model بموقعه (file+lines)
- صنّف: governance, library, evidence, jobs, users, roles, datasets…

E5) UI Inventory (MUST)
- استخرج:
  - routes/views
  - canvas components
  - state machine (xstate/fsm)
  - overlays
  - sidebar tabs
  - data-rased-id coverage
- اي view خارج “Canvas واحد” MUST يُوسم “NON-COMPLIANT (Canvas-First)”.

E6) Spec Coverage Matrix (MUST)
- اقرأ SPEC_BOOK_PATH
- استخرج على الأقل “عناوين المحركات والمتطلبات الكبرى” كـRequirements:
  - Strict replication, Slides, Excel, Dashboard, Reports, LCT, Canvas UX, Rased AI, Evidence, Registry, Guardrails, RLS
- لكل requirement:
  - YES/PARTIAL/NO/UNKNOWN
  - Evidence: file+lines + link to evidence logs
  - Missing details: what exact files to change
- ضعها في coverage_matrix.csv + داخل التقريرين.

========================
F) REPORT STRUCTURE (MUST MATCH EXACTLY) — BOTH LANGUAGES
========================

F0) Cover
- Audit ID, commit hash, scope, spec book reference

F1) Executive Summary (short but factual)
- counts: services, endpoints, tools, models, ui views, tests
- top 10 gaps blocking spec compliance

F2) System Map
- architecture diagram text form (services + deps)
- event flows (if any)

F3) Implemented Capabilities (Inventory)
- كل وظيفة/ميزة موجودة فعليًا مع evidence pointers
- ممنوع “كلام عام”

F4) Missing / Partial / Unknown (Explicit)
- قائمة تفصيلية حسب المحرك/الوحدة
- لكل بند:
  - spec reference
  - exact missing behavior
  - exact probable code locations (where to implement)
  - risk if not fixed

F5) Anti-Cheating Findings
- placeholder tokens hits
- fake success patterns
- strict override risks
- demo/hardcoded data
- UI “done without evidence” risks

F6) Security/Governance Findings
- RBAC/RLS/guardrails
- bypass patterns
- external connector leaks risks

F7) Test Coverage & Gaps
- list test suites
- missing e2e/golden corpus
- what to add (concrete)

F8) Evidence Index
- قائمة كل ملفات OUTPUT_DIR/evidence/
- pointers to command outputs

F9) Appendices
- full inventories references (csv files)

========================
G) OUTPUT QUALITY RULES (MUST)
========================
G1) كل claim = MUST evidence link (file+lines) أو “UNKNOWN”.
G2) لا تستخدم كلمات: "probably", "maybe" إلا إذا موسومة UNKNOWN مع سبب.
G3) لا تحذف أي قسم. إذا لا ينطبق اكتب: “N/A” مع سبب.
G4) لا تختصر. التقرير يجب أن يكفي وحده كتحليل منصة “سطرًا سطرًا”.

========================
H) FINAL DELIVERY RULE
========================
لا تعتبر المهمة مكتملة إلا إذا:
- كل ملفات OUTPUT_DIR المذكورة موجودة
- report_ar_simple.md + report_en_technical.md مكتملان بنفس الهيكل
- inventories csv موجودة ومعبأة
- evidence folder يحتوي كل outputs

# END PROMPT-AUDIT
