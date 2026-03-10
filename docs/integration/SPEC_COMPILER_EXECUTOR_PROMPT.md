# SPEC-COMPILER EXECUTOR — برومبت وحيد يغطي “كل التفاصيل” لكل محرك (Line-by-Line)
# (صارم/مضاد للتحايل/يولّد Tasks من كتاب المواصفات نفسه) — كافي وحده لتنفيذ كل شيء
# =================================================================================================
# لا تعدّل نص هذا البرومبت. فقط املأ INPUTS. أي مخالفة = FAIL.

================================================================================
A) INPUTS (املأها فقط)
================================================================================
TASK_ID: <مثال: SLIDES-ALL / EXCEL-ALL / DASH-ALL>
TASK_TITLE: <عنوان المرحلة/المحرك>
REPO_ROOT: <مسار الريبو>
SPEC_BOOK_PATH: <مسار كتاب المواصفات الجامع داخل الريبو>  مثال: كتاب_المواصفات_الجامع/rased_master_book.md
SPEC_SECTIONS: <قائمة عناوين الأقسام المطلوب تنفيذها حرفيًا داخل الكتاب> (Comma-separated)
ENGINE_SCOPE: <frontend|ai-service|governance-service|replication-service|excel-service|dashboard-service|reporting-service|presentation-service|localization-service|all>
DOCKER: <true|false>

================================================================================
B) ABSOLUTE RULES (NON-NEGOTIABLE)
================================================================================
B1) ممنوع الكود الوهمي:
- MUST NOT: TODO/FIXME/STUB/MOCK/PLACEHOLDER/DEMO/not implemented.
- MUST NOT: status=ok/Completed بدون artifact فعلي محفوظ + evidence_id.

B2) ممنوع الادعاء:
- MUST NOT تقول “تم/Completed” إلا بعد Evidence Pack + Gates PASS.
- إذا لا تستطيع تشغيل الأوامر/الاختبارات => FAIL.

B3) ممنوع الأسئلة:
- MUST NOT تسأل العميل.
- أي غموض يُحل بما هو موجود في SPEC_BOOK فقط.
- إذا تعارض داخل الكتاب => FAIL مع ذكر العناوين المتعارضة.

B4) STRICT تعريف واحد:
- STRICT = PixelDiff==0.0 (لا epsilon) + StructuralEQ PASS فقط.
- أي محاولة threshold!=0 => 422.

B5) Security/Policy:
- MUST تطبيق RBAC/RLS/Guardrails.
- MUST NOT bypass أو override صامت (rewrite_prompt/swap_action/override_tool/bypass_policy).

B6) لا تخطي:
- MUST تنفيذ كل MUST/SHALL/MUST NOT داخل SPEC_SECTIONS.
- MUST إنتاج Coverage Matrix يربط كل Requirement بسطر/ملف/دليل.
- أي Requirement بدون دليل => يُوسم NO أو PARTIAL، ولا يعتبر العمل مكتمل.

================================================================================
C) REQUIRED AUTOMATION (MANDATORY) — Gate Script + Evidence Pack
================================================================================
C1) MUST وجود وتشغيل:
node scripts/ci/task_gate.mjs --task-id "<TASK_ID>" --title "<TASK_TITLE>" --spec-book "<SPEC_BOOK_PATH>" --sections "<SPEC_SECTIONS>" --docker <DOCKER>

C2) MUST إنتاج:
EVIDENCE/<TASK_ID>/
  01_env.txt
  02_install.txt
  03_build.txt
  04_typecheck.txt
  05_lint.txt
  06_tests.txt
  07_docker_up.txt (if DOCKER=true)
  08_healthchecks.txt (if DOCKER=true)
  09_forbidden_scan.txt
  10_git_status.txt
  11_git_diff.patch
  12_artifact_hashes.txt
  13_policy_guardrails_proof.txt
  14_strict_proof.txt (if strict involved)
  15_ui_proof.txt (if UI involved)
  SUMMARY.txt  (PASS/FAIL only)

================================================================================
D) SPEC COMPILER (LINE-BY-LINE) — هذا هو الجزء الذي يجعل البرومبت “كافي وحده”
================================================================================
D1) اقرأ SPEC_BOOK_PATH بالكامل.
D2) استخرج فقط الأقسام المذكورة في SPEC_SECTIONS.
D3) من تلك الأقسام:
- MUST استخراج كل الجمل التي تحتوي MUST/SHALL/MUST NOT/REQUIRED/NO-… كـ Requirements ذرية.
- لكل Requirement أنشئ سجل (Atomic Requirement Record) بالشكل التالي:

REQ_RECORD = {
  req_id: "AUTO-<hash>",
  section_title: "<العنوان داخل الكتاب>",
  requirement_text: "<النص الحرفي للRequirement>",
  type: "MUST|SHALL|MUST_NOT",
  engine_scope: "<استنتاج: frontend|service|governance|ai|render|multi>",
  acceptance: "<كيف نعرف أنه تحقق: test/evidence/parity/pixel/etc>",
  expected_artifacts: "<إن وجد>",
  expected_tests: "<اسم test أو نوعه>",
}

D4) اكتب هذه السجلات إلى ملف:
AUDIT/<TASK_ID>/requirements_extracted.json
(هذا الملف MUST يكون شامل 100% لكل Requirements في الأقسام المطلوبة)

================================================================================
E) IMPLEMENTATION LOOP (MUST) — تنفيذ كل Requirement بدون إسقاط
================================================================================
لـكل REQ_RECORD:
E1) نفّذ التغيير minimal change لتحقيق requirement حرفيًا.
E2) أضف/عدّل Tests تحقق requirement (Unit/Integration/E2E حسب نوعه).
E3) أضف Evidence لازم (logs/exports/diffs/hashes).
E4) لا تنتقل للمتطلب التالي قبل:
- tests المتعلقة به PASS محليًا
- لا forbidden tokens
- لا bypass policy
- strict gates محترمة إن كانت متعلقة

================================================================================
F) COVERAGE MATRIX (المهم جدًا) — “يمنع التحايل” لأنه يربط كل سطر بدليل
================================================================================
بعد التنفيذ:
F1) أنشئ:
AUDIT/<TASK_ID>/coverage_matrix.csv
ويحتوي أعمدة إلزامية:
req_id, section_title, requirement_text, status(YES|PARTIAL|NO), code_refs(file:line-range), tests_refs, evidence_refs, notes

F2) قاعدة status:
- YES: يوجد كود + اختبار + Evidence يثبت.
- PARTIAL: يوجد كود لكن اختبار ناقص أو Evidence ناقص أو جزء من requirement غير منفذ.
- NO: غير منفذ.
- ممنوع UNKNOWN. أي شيء غير مثبت = NO/PARTIAL.

F3) أنشئ تقريران:
- AUDIT/<TASK_ID>/report_ar_simple.md (عربي مبسط شامل)
- AUDIT/<TASK_ID>/report_en_technical.md (English technical)

كل تقرير MUST يتضمن:
- counts (services/endpoints/tools/models/ui/tests)
- implemented (YES) list
- missing/partial list مع ماذا ينقص بالضبط
- anti-cheat findings (إن وجدت)
- strict proof summary (إن كان متعلق)
- links/refs إلى coverage_matrix.csv و evidence folder

================================================================================
G) STOP CONDITIONS (FAIL FAST)
================================================================================
- إذا task_gate.mjs فشل => STOP وارجع FAIL فقط.
- إذا coverage_matrix فيها أي NO أو PARTIAL => STOP (المحرك غير مكتمل).
- إذا ظهرت TODO/FIXME/STUB/MOCK/PLACEHOLDER => FAIL.
- إذا أي strict threshold != 0 => FAIL.
- إذا UI completed بدون evidence_id => FAIL.

================================================================================
H) FINAL OUTPUT (ممنوع أي شرح إضافي)
================================================================================
1) TASK_ID + TASK_TITLE
2) FILES CHANGED (paths فقط)
3) GATE RESULT:
   PASS/FAIL + EVIDENCE/<TASK_ID>/SUMMARY.txt
4) AUDIT OUTPUTS:
   - AUDIT/<TASK_ID>/requirements_extracted.json
   - AUDIT/<TASK_ID>/coverage_matrix.csv
   - AUDIT/<TASK_ID>/report_ar_simple.md
   - AUDIT/<TASK_ID>/report_en_technical.md
5) FINAL:
   PASS فقط إذا:
     - task_gate ExitCode=0
     - coverage_matrix: كل requirements YES (0 PARTIAL/NO)
   غير ذلك = FAIL

# END SPEC-COMPILER EXECUTOR PROMPT
