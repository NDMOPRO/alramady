# MASTER EXECUTION PROMPT — برنامج تنفيذ منصة راصد 100% وفق “كتاب المواصفات الجامع”
# (صارم/أمري/مضاد للتحايل) — جاهز للنسخ للمنفذ مباشرة — ينفع لكل المراحل
# =================================================================================================
# هذا النص = عقد إلزامي. أي مخالفة = FAIL فوري. ممنوع الاجتهاد/التفسير/التحسين غير المطلوب.
# ممنوع أي كود وهمي/ديمو/ادعاء. ممنوع “تم” بدون أدلة مكتوبة ومخرجات فعلية للأوامر.

================================================================================
A) INPUTS (املأها فقط — لا تغيّر أي شيء آخر)
================================================================================
REPO_ROOT: <مسار الريبو>
SPEC_BOOK: <مسار كتاب المواصفات الجامع داخل الريبو>  مثال: كتاب_المواصفات_الجامع/rased_master_book.md
TARGET_COMMIT_OR_BRANCH: <commit hash أو branch>
WORKSPACE_PROFILE: <saas | dedicated | sovereign>   (للتكوين فقط)

================================================================================
B) ABSOLUTE NON-NEGOTIABLE RULES (لا نقاش)
================================================================================
B1) لا كود وهمي:
- MUST NOT: TODO / FIXME / STUB / MOCK / PLACEHOLDER / DEMO / not implemented / later.
- MUST NOT: إرجاع status=ok أو “Completed” بدون Artifact فعلي محفوظ + Evidence Pack مغلق.
- MUST NOT: تحويل Editable outputs إلى صور (إلا الصور الطبيعية كأصول فقط).

B2) لا ادعاء:
- MUST NOT تقول “تم/Completed/جاهز” إلا إذا كل Gates PASS + الأدلة محفوظة.
- إذا لا تستطيع تشغيل أوامر التحقق/الاختبارات → MUST FAIL وتذكر السبب فقط.

B3) لا أسئلة:
- MUST NOT تسأل العميل أي سؤال.
- أي غموض يُحل بالـDefaults المذكورة في SPEC_BOOK.
- إذا لا يوجد Default واضح → MUST FAIL وتذكر التعارض مع اسم القسم داخل SPEC_BOOK.

B4) STRICT = 1 تعريف فقط:
- أي وضع STRICT في أي محرك/مسار = PixelDiff == 0.0 (لا epsilon) + StructuralEQ pass.
- ممنوع تمرير threshold من العميل/الواجهة/الذكاء الاصطناعي. أي محاولة = 422.

B5) Governance/Policy:
- كل تنفيذ MUST يخضع RBAC/RLS/Guardrails.
- MUST NOT bypass أو override صامت (لا rewrite_prompt ولا swap_action ولا override_tool ولا bypass_policy).

B6) Canvas-First:
- MUST Canvas واحد (صفحة /home) + Focus Stage داخل نفس الصفحة.
- MUST NOT فتح صفحات محركات كRoutes مستقلة (يتم تحويلها Views/Focus داخل Canvas).

================================================================================
C) REQUIRED GLOBAL DELIVERABLES (يجب أن تظهر في الريبو أثناء التنفيذ)
================================================================================
C1) EVIDENCE PACK لكل مهمة:
- كل Task_ID له مجلد: /EVIDENCE/<TASK_ID>/ يحتوي مخرجات فعلية للأوامر + diff patch + scans.

C2) Audit Reports (بعد كل مرحلة كبرى + في النهاية):
- /AUDIT/<AUDIT_ID>/report_ar_simple.md
- /AUDIT/<AUDIT_ID>/report_en_technical.md
- coverage_matrix.csv + inventories (api/tool/model/ui)

C3) Golden Corpus:
- /golden_corpus/inputs + runner script
- CI يمنع الدمج إذا corpus fail

C4) CI Gates:
- ممنوع دمج أي PR بدون PASS لكل gates:
  - Forbidden tokens scan
  - Tool schema validation
  - Evidence required gate
  - Strict enforce gate (threshold=0)
  - No silent override
  - Golden corpus pass

================================================================================
D) ONE-SCRIPT GATE (إجباري) — يجب إنشاؤه أولاً ثم استخدامه في كل خطوة
================================================================================
أنت MUST تنشئ سكربت بوابة واحد ثم تستخدمه لكل مهمة:
- FILE: scripts/ci/task_gate.mjs
- الغرض: تشغيل (install/build/typecheck/lint/tests) + scans + حفظ Evidence + PASS/FAIL exit code.
- MUST أن ينتج: /EVIDENCE/<TASK_ID>/… (ملفات الأدلة)

بعد إنشائه، كل مهمة MUST تنتهي بهذا الأمر (بدون استثناء):
node scripts/ci/task_gate.mjs --task-id "<TASK_ID>" --title "<TASK_TITLE>" --spec-book "<SPEC_BOOK>" --sections "<SPEC_SECTIONS>" [--docker true|false]

إذا لم يرجع ExitCode=0 → المهمة FAIL ولا تنتقل لغيرها.

================================================================================
E) REQUIRED “ANTI-CHEAT” SCANS (MUST) — تنفذها task_gate تلقائيًا
================================================================================
E1) Forbidden tokens:
- TODO|FIXME|STUB|MOCK|PLACEHOLDER|DEMO|not implemented|return true;|return ok
E2) No silent override:
- rewrite_prompt|sanitize_prompt|override_tool|swap_action|bypass_policy|disable_guardrails|skip_rbac
E3) STRICT enforce:
- strict pipelines must hardcode threshold=0; reject overrides.
E4) UI truthfulness:
- لا Completed بدون evidence_id + artifact_ids (اختبار UI إلزامي).

================================================================================
F) FINAL RESPONSE FORMAT (في كل Task) — ممنوع أي شرح خارج هذا القالب
================================================================================
1) TASK_ID + TASK_TITLE
2) FILES CHANGED (paths فقط)
3) GATE RESULT:
   - PASS/FAIL + مسار EVIDENCE/<TASK_ID>/SUMMARY.txt
4) FINAL:
   - PASS فقط إذا ExitCode=0
   - otherwise FAIL

================================================================================
G) التنفيذ الكامل = مراحل (Phases) — أوامر تنفيذية (لا جدول زمني)
================================================================================
ملاحظة: كل Phase = مجموعة Tasks. كل Task = PASS عبر task_gate + ثم Audit بعد phase.

--------------------------------------------
PHASE-0: BASELINE LOCK + إدخال أدوات البوابات (مطلوب أولاً)
--------------------------------------------
TASKS:
P0-01: Baseline snapshot
- أوامر: build/typecheck/lint/tests + docker compose إن وجد
- ناتج: docs/integration/baseline_report.md + EVIDENCE/P0-01

P0-02: Create scripts/ci/task_gate.mjs (السكربت الإجباري)
- MUST ينتج Evidence pack ويعيد PASS/FAIL
- MUST يفشل على forbidden tokens
- MUST يسجل git diff/status
- ناتج: EVIDENCE/P0-02

P0-03: Add CI workflow to run:
- node scripts/ci/task_gate.mjs for PR
- golden corpus runner (سيأتي لاحقاً)
- ناتج: EVIDENCE/P0-03

DONE PHASE-0:
- task_gate موجود ويعمل ويولّد Evidence
- CI يمنع الدمج عند فشل gates

--------------------------------------------
PHASE-1: FRONTEND KERNEL — Canvas FSM (XState) + Provider + IDs
--------------------------------------------
TASKS:
P1-01: Add XState + implement Root Parallel Machine (كما في SPEC_BOOK: STATE MACHINE SPEC)
- files: frontend/state/…
- wrap /home with provider
- add data-rased-id: header.bar sidebar.toggle composer.input composer.send chat.stream focus.stage

P1-02: FSM unit tests + modal guard + reduce motion rules
DONE PHASE-1:
- FSM PASS tests
- لا route change
- Evidence موجود

--------------------------------------------
PHASE-2: CANVAS UX — Cards + Dropzone + Focus Stage + Sidebar Contract + Overlays
--------------------------------------------
TASKS:
P2-01: Refactor RasidCommandCenter → Card Stream (File/Actions/Plan/Run/Preview/Result/Evidence/Diff)
P2-02: Dropzone داخل chat.stream + Actions تظهر ≤300ms
P2-03: Focus Stage داخل نفس الصفحة + Back/Preview/Export/Share
P2-04: Sidebar hidden/peek/full + pin + tabs + auto-open rules
P2-05: Overlays (Palette/Reader/Tour/Modal) + One blocking modal invariant
P2-06: UI Truthfulness tests (Playwright/RTL): no Completed without evidence_id

DONE PHASE-2:
- سيناريو Drop→Actions→Select→Plan/Run→Preview→Result→Evidence يعمل
- Focus داخل نفس الصفحة
- Modal يمنع NAV/FOCUS
- Evidence شرط completed

--------------------------------------------
PHASE-3: TOOL RUNTIME — ToolEnvelope + Runtime Registry + Tool Router في كل خدمة
--------------------------------------------
TASKS:
P3-01: governance-service: /registry/tools (+ tool metadata: perms, evidence_required, schemas)
P3-02: لكل service engine: POST /api/v1/tools/execute (validate schema; route tool_id)
P3-03: ai-service: remove hardcoded endpoint mapping; fetch registry runtime; execute tools ديناميكيًا
P3-04: Contract tests: invalid schema→422, tool missing→404, RBAC→403

DONE PHASE-3:
- كل تنفيذ عبر ToolEnvelope فقط
- Registry runtime هو مصدر الحقيقة
- orchestrator ديناميكي
- Evidence gating جاهز للربط

--------------------------------------------
PHASE-4: EVIDENCE PACK — خدمة موحدة + Viewer + منع “Done” بدون Evidence
--------------------------------------------
TASKS:
P4-01: governance evidence API: create/attach/close + immutability
P4-02: engines attach: renders/diffs/hashes/action_graph
P4-03: ai-service: لا completed بدون evidence close
P4-04: frontend: EvidenceCard + Evidence Viewer
P4-05: tests: success بدون evidence => FAIL

DONE PHASE-4:
- Evidence mandatory platform-wide

--------------------------------------------
PHASE-5: STRICT FINAL — PixelDiff==0 + StructuralEQ + Repair Loop + Diff Reports
--------------------------------------------
TASKS:
P5-01: replication-service/rendering-environment: strict threshold hard 0 + رفض overrides
P5-02: Dual gates + repair loop deterministic
P5-03: Diff reports: JSON + heatmap images
P5-04: tests: threshold!=0 => 422; PixelDiff must equal 0.0

DONE PHASE-5:
- STRICT نهائي لا يقبل أي عتبة غير صفرية

--------------------------------------------
PHASE-6: GOLDEN CORPUS + Anti-Cheat Harness (CI STOPPER)
--------------------------------------------
TASKS:
P6-01: golden_corpus/inputs (pdf, image_table, excel_bundle, …)
P6-02: runner script يشغّل tools عبر registry + asserts: artifacts+evidence+strict gates
P6-03: CI job يمنع الدمج إذا corpus fail
P6-04: UI e2e anti-cheat: Completed بدون evidence => FAIL

DONE PHASE-6:
- PR لا يمر بدون corpus pass

================================================================================
H) BUSINESS ENGINES — تنفيذ المحركات وفق SPEC_BOOK (كل محرك = Phase)
================================================================================
ملاحظة صارمة: لكل محرك أدناه:
- يجب تنفيذ “Non-negotiables” ثم بقية الأقسام **بالترتيب كما في SPEC_BOOK**
- بعد كل محرك: نفّذ PROMPT-AUDIT (تقرير عربي/إنجليزي + Coverage Matrix) ويجب أن يخرج status YES وليس PARTIAL.

--------------------------------------------
PHASE-7: LCT ENGINE (Localization/Conversion/Transcription)
--------------------------------------------
TASKS:
LCT-01: any→any عبر CDR + tool schemas
LCT-02: LOCALIZE_PRO_100 (termbase/style/LQA=0/Arabic ELITE/layout QA)
LCT-03: TRANSCRIBE_STRICT_100 (ensemble+alignment+exactness+verifierOps internal)
LCT-04: evidence + exports + parity
LCT-05: tests: no unresolved spans; no best-effort
DONE:
- gates pass + audit coverage YES

--------------------------------------------
PHASE-8: SLIDES ENGINE (Gamma-class+) + Template-Lock + LITERAL/SMART
--------------------------------------------
TASKS:
SLD-01: template_extract + template-lock compliance report
SLD-02: LITERAL mode hash in/out + SMART content_trace
SLD-03: infographic catalog + swap variants + search
SLD-04: data picker from library (excel table → chart/table)
SLD-05: export pptx + render parity + evidence
SLD-06: tests: openxml valid + editable (no raster text)
DONE:
- audit coverage YES

--------------------------------------------
PHASE-9: EXCEL ENGINE (Drag Columns) + PowerQuery IR + Scale
--------------------------------------------
TASKS:
XLS-01: ingestion (many files/folders) + preflight
XLS-02: column map + drag/drop + joins suggestions
XLS-03: expression engine + power query IR (T-IR) + recipes
XLS-04: cleaning + compare + diff reports
XLS-05: exports xlsx + lineage
XLS-06: scale streaming + performance
DONE:
- audit coverage YES

--------------------------------------------
PHASE-10: DASHBOARD ENGINE (Live) + Widgets + Alerts + Exports
--------------------------------------------
TASKS:
DSH-01: live dashboards + multi-pages + binding/refresh/drill
DSH-02: widget catalog + infinite variants + search
DSH-03: alerts/anomaly widgets
DSH-04: share/permissions + audit
DSH-05: exports pdf/pptx/docx/html parity + evidence
DONE:
- audit coverage YES

--------------------------------------------
PHASE-11: REPORT ENGINE (DOCX) + Templates (Design+Writing) + Governance
--------------------------------------------
TASKS:
RPT-01: DOC-IR + bindings
RPT-02: literal vs smart + hash/trace
RPT-03: writing templates + addressing
RPT-04: approvals + classification + audit
RPT-05: exports parity + evidence
DONE:
- audit coverage YES

--------------------------------------------
PHASE-12: RASED AI ENGINE (Agent OS + Training Center + Tours + Playbooks)
--------------------------------------------
TASKS:
AI-01: truthfulness contract (no done without evidence)
AI-02: planner deterministic + tool-only execution
AI-03: training center (packs/playbooks/evals)
AI-04: guided tours (data-rased-id) + modes
AI-05: tests: deterministic plan + tour gating + no silent override
DONE:
- audit coverage YES

--------------------------------------------
PHASE-13: SECURITY/GOVERNANCE FINAL (RLS/RBAC/Guardrails/Search/RAG)
--------------------------------------------
TASKS:
SEC-01: RLS enforced + policy wrappers + immutable logs
SEC-02: no silent override proofs + tests
SEC-03: search primary Postgres GIN (ES optional) + ACL on RAG
SEC-04: tests: cross-tenant leak red-team
DONE:
- audit coverage YES

================================================================================
I) FINAL CLOSURE — “لا مجال للتحايل”
================================================================================
FINAL TASK: FINAL-AUDIT
- شغّل PROMPT-AUDIT على scope=all
- يجب أن ينتج:
  - coverage_matrix.csv: كل المتطلبات YES (0 PARTIAL/NO/UNKNOWN)
  - inventories كاملة
  - evidence index كامل
- إذا أي بند PARTIAL/NO/UNKNOWN => FAIL ولا إغلاق.

================================================================================
J) ماذا يرسل المنفذ في كل Phase؟
================================================================================
في كل Task:
- يلتزم قالب الرد (F)
- يرفق مسار EVIDENCE/<TASK_ID>/SUMMARY.txt
بعد كل Phase:
- يشغّل PROMPT-AUDIT ويضع الناتج داخل /AUDIT/<AUDIT_ID>/

# END MASTER EXECUTION PROMPT
