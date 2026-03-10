# كتاب المواصفات الجامع — منصة راصد

> **Build:** 2026-03-09 23:18:54

> **Source:** rased_v2_2.zip


## الفهرس

1. [Single Master Spec — مواصفات المنصة العالمية (ملف واحد)](#sec-01)
2. [وثيقة المتطلبات الكاملة للمنصة (World‑Class Requirements)](#sec-02)
3. [وثيقة الصرامة والتنفيذ الحقيقي (Implementation Integrity & Anti‑Cheating Requirements)](#sec-03)
4. [ملحق 3: Tool Registry v3 — عقد التسجيل الموحد للأدوات (قابل للتوسع)](#sec-04)
5. [ملحق 4: Traceability Matrix — ربط المتطلبات بالأدوات والاختبارات](#sec-05)
6. [12 Critical Tool Schemas (JSON Schema مختصرة)](#sec-06)
7. [Strict Plus Tool Schemas (12 + 6)](#sec-07)
8. [ملحق 1: Permission Matrix (RBAC/ABAC) — مصفوفة الصلاحيات الدقيقة](#sec-08)
9. [ملحق 2: Action Graph Templates (JSON) — قوالب تشغيل جاهزة](#sec-09)
10. [World-Class Upgrade Blueprint (محركات المنصة — تفعيل + رفع المستوى العالمي)](#sec-10)
11. [SPEC — Strict Replication 1:1 Pixel-Perfect (100%) + Functional Strict (LIVE)](#sec-11)
12. [ULTIMATE STRICT 1:1 — PixelPerfect + Functional Replication (NO EXCEPTIONS)](#sec-12)
13. [ULTIMATE STRICT 1:1 — PixelPerfect + Functional + Editable (Single Implementer Spec)](#sec-13)
14. [PRESENTATION ENGINE SPEC — World-Class AI Slides (Gamma-Class) + Arabic ELITE + Canvas-First](#sec-14)
15. [ADDENDUM — Presentation Engine (Gamma-Class) — إلزامات إضافية (بدون تكرار السابق)](#sec-15)
16. [ADDENDUM ULTIMATE — Presentation Engine “Infinite Control + Infinite Options” (Canvas-One, AI-First, NO CHEATING)](#sec-16)
17. [EXCEL ENGINE SPEC — Ultra-Scale “Drag Columns Like LEGO” + PowerQuery IR + SVM + AI Analyst (NO CHEATING)](#sec-17)
18. [DASHBOARD ENGINE SPEC — Ultra-Scale KPI + Infinite Widgets + AI-First Builder (STRICT Import 1:1 Optional) — NO CHEATING](#sec-18)
19. [REPORT ENGINE SPEC — World-Class AI Reports (DOCX/PDF/HTML) + Arabic ELITE + Data-Bound + Governance (NO CHEATING)](#sec-19)
20. [LCT ENGINE SPEC — التعريب + التحويل Any→Any + التفريغ (صوت/فيديو/صور/PDF) — محرك واحد (NO EXCEPTIONS / NO CHEATING)](#sec-20)
21. [RASED CANVAS UX SPEC — “Canvas واحد” يدير كل المحركات (Chat + Dynamic Stage + Ultra-Premium Motion)](#sec-21)
22. [STATE MACHINE SPEC — RASED CANVAS (Frontend-Ready) — مستخرج ومُقفل من تصميم ZIP + عقود التنفيذ](#sec-22)
23. [RASED AI ENGINE SPEC — “راصد الذكي” (القلب النابض) | Agent OS + Training Center + Guided Tours + Full Platform Control (NO CHEATING)](#sec-23)
24. [APPENDICES PACK — “NO-MISS” ADDENDA (NORMATIVE / EXECUTION-DIRECTIVE)](#sec-24)
25. [README — حزمة مواصفات راصد (v2.2 — مصححة)](#sec-25)


---

<a id="sec-01"></a>
# Single Master Spec — مواصفات المنصة العالمية (ملف واحد)
> Generated: 2026-03-08T23:02:57.356134+00:00
>
> هذا الملف يجمع **وثيقة المتطلبات الأساسية** + **كل الملحقات** + **حزم الـSchemas** في مرجع واحد “لا يترك مجالًا للاجتهاد”.

## الفهرس
- [1) المتطلبات الأساسية](#1-المتطلبات-الأساسية)
- [2) ملحق 1: الصلاحيات](#2-ملحق-1-الصلاحيات)
- [3) ملحق 2: قوالب التشغيل](#3-ملحق-2-قوالب-التشغيل)
- [4) ملحق 3: Tool Registry v3](#4-ملحق-3-tool-registry-v3)
- [5) ملحق 4: Traceability Matrix](#5-ملحق-4-traceability-matrix)
- [6) ملحق 5: Tool Schemas (Strict Plus)](#6-ملحق-5-tool-schemas-strict-plus)
- [7) ملحق 6: World-Class Upgrade Blueprint](#7-ملحق-6-world-class-upgrade-blueprint)

---


## تعريفات واجبة التنفيذ (Non-negotiable Contracts)
> هذه البنود **شرط تسليم/قبول**. أي تنفيذ لا يحققها يُعتبر **غير مطابق** للمواصفات.

- [ ] **Canvas واحد فقط**: لا صفحات متعددة كواجهة أساسية؛ Canvas + Panel جانبي واحد قابل للإخفاء.
- [ ] **Any-to-Any عبر CDR**: أي تحويل يتم عبر CDR-Design/CDR-Data (لا مسارات خاصة لكل صيغة).
- [ ] **STRICT = Pixel-Perfect**: تسليم STRICT يتطلب PixelDiff = 0 (أو ε ثابت مُعتمد) داخل Farm حتمية.
- [ ] **Triple Verification Gate**: Pixel + Structural/Editability + Drift/Determinism قبل اعتماد نتيجة STRICT.
- [ ] **Deterministic Rendering Farm إلزامي**: DPI + sRGB + anti-aliasing + engine fingerprint + GPU/CPU parity + seed lock.
- [ ] **Root-cause Repair Loop**: Diagnose → Targeted Repair → Re-render → Re-verify حتى pass أو downgrade مُدار.
- [ ] **Never-Fail Delivery**: لا يُعاد “فشل” للمستخدم؛ دائمًا Artifact نهائي مع تحذيرات مختصرة عند downgrade.
- [ ] **Degrade Policy مُقيد**: يُسمح فقط بـ(بديل خط) و(Selective Rasterize لعنصر زخرفي صغير) و(Synthetic data للداشبورد) وفق صلاحيات وسياسات.
- [ ] **Fonts Vault + Embedding**: توفير/رفع الخطوط + full glyph embedding في STRICT (أو سياسة مؤسسة) + إخطار قبل التسليم عند الاستبدال.
- [ ] **Arabic ELITE**: shaping/bidi/line breaks/metrics lock + RTL للجداول/المحاور/الفلاتر دون “قلب اتجاه” سطحي.
- [ ] **Editable Coverage**: النصوص TextRuns، الجداول Structured، المخططات Data-bound (أو Placeholder/Synthetic binding)؛ ممنوع “شرائح كلها صور” تلقائيًا.
- [ ] **Image/Table → Excel 1-Click**: استخراج grid/merges/styles + XLSX editable + Pixel Gate على النتيجة.
- [ ] **Excel SVM Determinism**: Formula DAG + deterministic recalc + drift tolerance (مثلاً 1e-6) + pivot/CF/freeze/chart anchors.
- [ ] **Expressions via IR**: GUI Blocks → T-IR/M-IR → Preview → Apply → Export (M/DAX)؛ ممنوع تنفيذ تحويلات “غير مُسجلة” خارج IR.
- [ ] **Tool Registry + Schemas إلزامي**: أي Tool بدون input/output schemas + required permissions + determinism/fidelity guarantees **غير قابل للتشغيل**.
- [ ] **All execution via Action Runtime**: ممنوع bypass؛ كل خطوة تُسجل كـAction مع idempotency + cache + retries.
- [ ] **RBAC/ABAC كامل**: Roles/Groups + Object ACL + Row/Column security + permission binding لكل Action/Tool.
- [ ] **Audit + Lineage + Repro Pack**: سجل تدقيق + نسب بيانات + بصمات نسخ + إعادة إنتاج النتائج 1:1.
- [ ] **SLO/Observability**: Logs/Metrics/Traces لكل Action + SLOs للـSTRICT/لوحات/Preview + canary + golden regression قبل أي نشر.

---


## 1) المتطلبات الأساسية
<a id="1-المتطلبات-الأساسية"></a>

# وثيقة المتطلبات الكاملة للمنصة (World‑Class Requirements)
> نسخة متطلبات تنفيذية — بدون أي تقسيمات زمنية أو أولوية  
> Generated: 2026-03-08T22:52:41.462655Z

هذه الوثيقة هي **مرجع المتطلبات الوحيد** لبناء منصة عالمية تعتمد على **Canvas واحد** و**ذكاء اصطناعي يقود التنفيذ**، وتقدم:
- **مطابقة بصرية STRICT 100% (Pixel‑Perfect)** عند التحويل بين الصيغ (Any‑to‑Any).
- مخرجات **قابلة للتعديل** (Editable) قدر الإمكان مع سياسات Degrade منضبطة (Never‑Fail).
- محرك Excel/بيانات متقدم (Expressions + Power Query + DAX + SVM).
- محرك تحليل عميق + توليد لوحات وتقارير وعروض بضغطة واحدة.
- نظام مستخدمين/مجموعات/صلاحيات/حَوْكمة/تدقيق/مركز تدريب/إعدادات وتخصيص كامل.
- واجهة Premium + Motion + بساطة قصوى: Canvas + Panel جانبي واحد.

---

## 0) المصطلحات (Glossary)
- **Canvas**: واجهة العمل الوحيدة لعرض/تحرير/بناء التصميم والبيانات والنتائج.
- **STRICT Visual Replication**: التزام بصري 100% (Pixel‑0 أو ε ثابت داخل Farm) مع محاذاة مطلقة (Absolute layout) وعدم تدفق (No reflow).
- **Editable**: النص نص، الجدول جدول، المخطط مخطط مرتبط ببيانات… وليس صورة شاملة.
- **Any‑to‑Any**: أي مصدر (PDF/صورة/Word/Excel/PPT…) إلى أي هدف (PPTX/DOCX/XLSX/Dashboard/…).
- **CDR‑Design**: تمثيل داخلي موحد للتصميم (7 طبقات) يضمن الدقة والتحكم والقياس.
- **CDR‑Data**: تمثيل داخلي موحد للبيانات (جداول/أنواع/إحصاءات/روابط/Lineage).
- **SVM (Spreadsheet Virtual Machine)**: محرك تنفيذ Excel داخلي (Formula DAG/LET/LAMBDA/Recalc determinism…).
- **IR**: Intermediate Representation للعمليات:
  - **T‑IR** لتحويلات البيانات (Power Query‑like).
  - **M‑IR** لمقاييس/Measures (DAX‑like).
- **Deterministic Rendering Farm**: بيئة تصيير ثابتة لضمان/اختبار التطابق البصري.
- **Triple Verification Gate**: بوابات قبول STRICT: Pixel + Structural + Drift (للصيغ/الحساب/float).
- **Never‑Fail**: المنصة لا تُرجع “فشل” للمستخدم؛ دائمًا تُسلم نتيجة مع تحذيرات/خفض مُدار.
- **Degrade**: خفض مُدار (مثل بديل خط أو Rasterize عنصر زخرفي صغير أو Synthetic data للداشبورد).

---

## 1) الهدف والوعود (Product Constitution)
### 1.1 الوعود غير القابلة للتنازل
1) **STRICT 100% بصريًا**: الناتج مطابق بصريًا للمصدر ضمن Farm حتمية (Deterministic).  
2) **Editable Coverage عالي**: المحافظة على قابلية التحرير للمحتوى الأساسي (نص/جداول/بيانات/مخططات) قدر الإمكان.  
3) **Never‑Fail**: أي عملية تعيد Artifact نهائي (PPTX/DOCX/XLSX/Dashboard/…).
4) **Canvas واحد**: لا صفحات متعددة؛ فقط Canvas + Panel جانبي واحد قابل للإخفاء.
5) **AI‑First**: كل شيء يمكن طلبه من Canvas بالوصف الطبيعي، مع وضعين: Auto / Guided.

### 1.2 سياسات خفض مُدارة (Degrade Policy)
- **مسموح**:
  - بديل خط عند غياب الخط الأصلي مع إخطار قبل التسليم.
  - Rasterize **عنصر زخرفي صغير فقط** كحل أخير لتحقيق Pixel‑Perfect (لا يشمل النص/الجداول/البيانات).
  - Synthetic/Placeholder data للداشبورد عند غياب البيانات.
- **غير مسموح**:
  - تسليم “شرائح كلها صور” إذا كان الهدف Editable (إلا إذا طلب المستخدم صراحة “صورة فقط”).

### 1.3 معايير قبول STRICT (Acceptance Criteria)
- **Pixel Gate**: PixelDiff = 0 (أو ε ثابت مُعتمد) ضمن نفس Farm ونفس fingerprint.  
- **Structural Gate**: تحقق قابلية التحرير (نص/جداول/مخططات) ونِسَب تغطية قابلة للقياس.  
- **Drift Gate**: للـExcel/BI: تطابق النتائج الحسابية ضمن tolerance ثابت (مثلاً 1e‑6) + كشف drift في floating‑point.  
- **Determinism Gate**: GPU/CPU parity + anti‑aliasing lock + seed lock + fingerprint ثابت.

---

## 2) نطاق المنصة (Scope)
### 2.1 المدخلات (Inputs)
- PDF (نصي/متجه/ممسوح Scan)
- صور (PNG/JPG/WebP) بما فيها صور جداول وتقارير
- PPTX / DOCX / XLSX / CSV
- ZIP/Folder (حزم ملفات)
- موصلات (Integrations): Google Drive / OneDrive / SharePoint / S3 / DBs / BI (قابلة للتوسع)

### 2.2 المخرجات (Outputs)
- PowerPoint (PPTX) editable
- Word (DOCX) editable (Layout‑absolute في STRICT)
- Excel (XLSX) editable (جداول + صيغ + Pivot/CF قدر الإمكان)
- Dashboards (Web) حيّة (Filters/Drill/Export/Refresh)
- PDF / PNG للمعاينة/التصدير
- Recipes/Workflows (وصفات تحويل وتحليل قابلة للمشاركة)

---

## 3) تجربة المستخدم (UI/UX) — Canvas واحد
### 3.1 الشاشة الرئيسية
- Canvas مركزي لعرض/تحرير:
  - تصميم (شرائح/صفحات/لوحات)
  - بيانات (جداول/أعمدة/علاقات)
  - نتائج (Dashboards/Reports/Decks)
- Panel جانبي واحد قابل للإخفاء:
  - Library (ملفات/نتائج/وصفات)
  - Projects / Workspaces
  - Brand & Preferences
  - Templates (Slides/Dashboards/Reports)
  - History (مختصر) + عمليات محفوظة

### 3.2 أوامر موحدة (Command Bar)
- إدخال نصي + دعم ملفات + أوامر سريعة:
  - “حوّل هذا PDF إلى PPTX 1:1 editable”
  - “استخرج الجدول من هذه الصورة إلى Excel editable”
  - “حلل هذه الملفات واصنع Dashboard + عرض تقديمي”
  - “ادمج الأعمدة X,Y,Z عبر 200 ملف”

### 3.3 وضعين تشغيل
- **Auto Mode**: تنفيذ كامل تلقائيًا.
- **Guided Mode**: أسئلة قصيرة خطوة‑بخطوة عند الغموض (سؤال واحد في كل مرة).

### 3.4 Premium UI + Motion
- انتقالات سلسة، drag previews، progress overlays على Canvas.
- تصميم Premium (typography/padding/shadows) + Dark/Light.
- قابلية تخصيص: حجم خطوط، كثافة UI، اختصارات لوحة المفاتيح.

---

## 4) معمارية النظام (Architecture Requirements)
### 4.1 Kernel ثابت
- Action Graph Runtime (تنفيذ كل العمليات كـActions)
- Tool Registry (تسجيل الأدوات بعقود Input/Output/Policies)
- Policy Engine (أمان/خصوصية/مسموح/محظور)
- Audit & Lineage (سجل تدقيق + نسب بيانات/نتائج)
- Cache + Artifact Store + Metadata Store

### 4.2 Engines (محركات قابلة للتركيب)
1) Strict Replication Engine
2) Deterministic Rendering Farm
3) Arabic Typography Engine (BASIC/PRO/ELITE)
4) Excel/SVM Engine
5) Expressions Engine (T‑IR/M‑IR) + GUI Blocks
6) Data/Lakehouse Engine (Columnar + Query + Materialized Views)
7) Insight Engine (Relationship discovery + profiling + narrative)
8) Dashboard Engine (Interactive + bindings + synthetic data)
9) Reports Engine (Scheduling + diff + publish)
10) Presentation Engine (Generator + motion + infographic)
11) Translation Engine (حفظ التصميم أثناء الترجمة)
12) Training Center Engine (تعلم/تمارين/مختبر)

---

## 5) محرك STRICT Replication (Pixel‑Perfect 100%)
### 5.1 مبادئ التنفيذ
- Native extraction أولًا (PDF DOM) قبل OCR.
- CDR‑Design absolute + no reflow.
- Exporters deterministic‑friendly.
- Triple Verification Gate + Repair loop موجه بالأسباب (Root‑cause repair).

### 5.2 Pipeline عام (Any Input → Any Output)
1) Ingest + Extract (DOM/segments)
2) Build CDR‑Design (+ CDR‑Data إذا جداول/مخططات)
3) Fonts plan + Arabic shaping (حسب arabic_mode)
4) Quantize geometry (EMU/pixel snapping)
5) Export target (PPTX/DOCX/XLSX/Dashboard)
6) Render source + render target في Farm
7) Verify gates
8) Diagnose causes
9) Repair loop حتى pass أو Degrade policy
10) Deliver artifact + warnings مختصرة

### 5.3 متطلبات OCR/الرؤية
- OCR يُستخدم فقط عندما النص غير متاح Native.
- دعم استخراج جداول من صور مع merges/borders/styles.
- حفظ ثقة OCR لكل خلية، وتفعيل Guided mode عند تدني الثقة.

---

## 6) Deterministic Rendering Farm (حتمية التصيير)
### 6.1 متطلبات
- قفل: DPI، colorspace=sRGB، anti‑aliasing، font pack، engine versions.
- توفير fingerprint لكل render.
- تحقق parity GPU/CPU.
- Stateless workers + queue + backpressure + retries.
- دعم multi‑page وpage ranges.

### 6.2 مخرجات
- RenderRef لكل صفحة/شريحة/لوحة.
- Diff heatmaps داخلية (لا تظهر للمستخدم إلا عند الطلب أو في الـAdmin).

---

## 7) Arabic Typography Engine (تعريب ELITE)
### 7.1 مستويات
- BASIC: RTL + shaping أساسي.
- PROFESSIONAL: line breaks + baseline + spacing مضبوط.
- ELITE: justification/kashida عند الحاجة، دعم mixed scripts، أرقام عربية/لاتينية حسب السياق، اتجاه الجداول/المخططات/المحاور/الفلاتر.

### 7.2 متطلبات صارمة
- Metrics lock: قياس glyphs ثابت متطابق مع محرك التصيير.
- منع auto‑fit وإعادة التدفق في STRICT.

---

## 8) Fonts Vault (مكتبة خطوط عالمية)
### 8.1 خصائص
- تخزين خطوط المنظمة + خطوط خاصة بالمستخدم/العميل.
- ترخيص/وصف/معلومات مصدر الخط (Metadata).
- Embedding: full glyph embedding في STRICT (أو subset إذا سياسة المؤسسة تسمح).
- Font substitution: اختيار أقرب خط عبر metrics parity + تغطية glyphs.

### 8.2 سلوك “غياب الخط” (Never‑Fail)
- استمرار التنفيذ مع بديل.
- إشعار قبل التسليم: الخط الأصلي، البديل، التأثير المتوقع.

---

## 9) Image/Table → Excel Editable (1‑Click Table Engine)
### 9.1 متطلبات
- استخراج grid + merges + borders + fills + font styles + alignment.
- كتابة القيم في خلايا Excel قابلة للتعديل.
- Render XLSX ومقارنته بالصورة ضمن Pixel Gate.
- إصلاح widths/heights/padding عبر repair loop.

### 9.2 مخرجات
- XLSX editable + table_range + quality metrics (داخلي).

---

## 10) Excel Engine + SVM (Spreadsheet Virtual Machine)
### 10.1 متطلبات SVM
- Formula DAG + deterministic recalc.
- دعم LET/LAMBDA (نطاق مستهدف قابل للتوسع).
- Pivot reconstruction + pivot geometry lock.
- Conditional formatting clone.
- Freeze panes/filters.
- Chart anchor mapping (ربط الرسم بالخلايا).
- Drift checks: مقارنة نتائج الحساب مع tolerance ثابتة.

### 10.2 مخرجات
- XLSX editable مطابق بصريًا في STRICT (حسب نوع المحتوى).
- Model snapshots لإعادة التشغيل (Repro packs).

---

## 11) Expressions Engine (Power Query + DAX) بواجهة مبسطة
### 11.1 Transform IR (T‑IR)
- عمليات: select/rename/filter/derive/split/merge/group/join/pivot/unpivot/sort/cast.
- Preview execution سريع (sample) ثم apply على كامل البيانات.
- تصدير Power Query (M) تلقائيًا.

### 11.2 Metric IR (M‑IR)
- إنشاء Measures/Calculated columns.
- قوالب Time intelligence.
- تصدير DAX تلقائيًا.

### 11.3 GUI Blocks
- Blocks بسيطة مع خصائص واضحة، تتحول إلى IR.
- Undo/redo كامل + وصف Recipe قابل للمشاركة.

---

## 12) Data/Lakehouse Engine (بيانات ضخمة عالمية)
### 12.1 التخزين والمعالجة
- تحويل كل البيانات إلى columnar (Arrow/Parquet) داخليًا.
- محرك استعلام تحليلي مدمج + محرك أداء عالي للتوسع.
- Materialized views + incremental refresh.
- إدارة أحمال: resource reservation + circuit breakers + parallel DAG optimizer.

### 12.2 Catalog وفهرسة الأعمدة
- Column fingerprints + semantic embeddings.
- بحث أعمدة بالوصف الطبيعي.
- اقتراح joins/keys تلقائيًا.

---

## 13) Insight Engine (تحليل عميق + ربط ذكي)
### 13.1 قدرات إلزامية
- Profiling (stats/anomalies/trends)
- Relationship discovery (joins/keys)
- Entity resolution (dedupe/merge)
- KPI suggestions + metric synthesis
- Insight Graph كمخرج موحد

### 13.2 تحويل insight إلى نتائج مباشرة
- Insight → Dashboard plan → Dashboard حي
- Insight → Storyboard → Slides deck
- Insight → Report (Word/PDF) + Diff reports بين فترات

---

## 14) Dashboard Engine (لوحات حيّة)
### 14.1 متطلبات تفاعل
- Filters (global + per‑visual)
- Cross‑filtering
- Drill down / drill through
- Export (PDF/PPTX/PNG/CSV)
- Refresh/incremental refresh
- Saved states + share links (حسب ACL)

### 14.2 عند غياب البيانات (حسب قرار المنتج)
- توليد Synthetic dataset مطابق لشكل اللوحة.
- ربط جميع visuals بالبيانات التجريبية لتعمل فورًا.
- Hook لاستبدال المصدر لاحقًا (mapping placeholder→real).

---

## 15) Reports Engine (تقارير + جدولة + فروقات)
### 15.1 المتطلبات
- مصمم تقارير (Layouts + tables + charts)
- Scheduling (حسب workspace policies)
- Diff report: مقارنة تقريرين/فترتين مع إبراز التغيرات
- Publish pipeline: draft→review→publish
- تحويل التقرير إلى Dashboard أو Slides بضغطة واحدة

---

## 16) Presentation Engine (يتجاوز Gamma عالميًا)
### 16.1 مولّد عروض Data‑First
- توليد من: وصف/ملف/بيانات/Insights/Report/Dashboard.
- Storyboard + smart layouts + brand kit.
- Motion plan + animations على العناصر (اختياري).
- Non‑linear / Zoomable decks (اختياري).
- Speaker notes + ملخصات متعددة الأساليب.

### 16.2 Strict vs Pro
- STRICT: لا تغيير تصميم المصدر.
- PRO: تحسين/إبداع/إعادة تصميم ضمن قواعد brand + جودة.

---

## 17) Translation Engine (ترجمة مع الحفاظ على التصميم)
### 17.1 متطلبات
- ترجمة النصوص مع الحفاظ على layout قدر الإمكان.
- عند تجاوز طول النص: قواعد إعادة توزيع “غير STRICT” إلا إذا طلب المستخدم STRICT.
- دعم العربية ELITE في الترجمة.

---

## 18) AI Orchestrator (ذكاء اصطناعي في كل مكان)
### 18.1 مبادئ
- AI لا ينفذ مباشرة؛ ينفذ عبر Tool Registry + Action Graph.
- Plan → (Guided questions عند الحاجة) → Execute → Deliver.
- RAG مع عزل كامل لكل workspace/tenant (no data leakage).

### 18.2 قدرات أساسية
- فهم الأوامر النصية وتحويلها إلى graphs.
- اقتراح أفضل مسار (STRICT/PRO/Degrade) وفق السياسات.
- شرح مختصر للمستخدم: ماذا تم إنجازه + تحذيرات فقط.
- Prompt gallery + recipes جاهزة + توصيات تلقائية.

### 18.3 السلامة والحَوْكمة
- Policy binding لكل Action (PII, connectors, export rules).
- Audit trail كامل للأوامر والأدوات المستدعاة.

---

## 19) Library / Projects / Versioning (مكتبة المستخدم)
### 19.1 كائنات أساسية
- Workspace → Project → Assets → Artifacts (Deck/Report/Dashboard/Table/Recipe).
- Versioning لكل Artifact + restore/rollback.
- Tags + Search + Favorites.

### 19.2 تفضيلات المستخدم والـBrand Kit
- Fonts/palettes/logo/spacing presets.
- Learn from edits (اختياري) لتثبيت تفضيلات شخصية.

---

## 20) Training Center (مركز تدريب/مختبر)
### 20.1 المتطلبات
- Tutorials داخل Canvas (guided overlays).
- أمثلة جاهزة (PDF→PPTX strict، صورة جدول→Excel…).
- Sandbox datasets.
- Prompt academy + Recipes library.
- تقييم بسيط: “هل وصلت Pixel‑Perfect؟” + قياس جودة التحليل.

---

## 21) الحسابات والهوية (Auth)
### 21.1 التسجيل وتسجيل الدخول
- Email + Password
- Social login (اختياري) OAuth
- SSO للمؤسسات (SAML/OIDC) (اختياري لكن مفضل عالميًا)
- MFA (OTP/WebAuthn) (قابل للتفعيل من إعدادات المؤسسة)

### 21.2 استرجاع كلمة المرور
- Reset link + expiration
- منع brute force + rate limits
- إشعارات أمنية عند تغيير كلمة مرور

### 21.3 إدارة الجلسات
- Tokens + refresh
- Device/session list + revoke
- Idle timeout policy per org

---

## 22) الأعضاء/المجموعات/الصلاحيات (RBAC/ABAC) — أدق تفصيل
### 22.1 النطاق الهرمي
- Organization
- Workspace
- Project
- Asset/Artifact/Recipe
- Connector/Data source
- Tool/Feature

### 22.2 مفاهيم
- **Roles**: أدوار جاهزة (Owner/Admin/Editor/Viewer/Analyst/Operator…).
- **Groups**: مجموعات تُسند لها أدوار أو صلاحيات دقيقة.
- **Permissions**: صلاحيات “إجراء” (Action) + صلاحيات “كائن” (Object) + صلاحيات “بيانات” (Row/Column).

### 22.3 أمثلة صلاحيات دقيقة (Must‑Have)
- تحويل STRICT (تشغيل/منع)
- السماح بـDegrade rasterize
- رفع خطوط / تعديل Font Vault
- استخدام موصلات محددة
- تصدير إلى صيغ محددة
- رؤية/تعديل Dashboards
- نشر/مشاركة links
- تشغيل Schedules
- إنشاء/تعديل Recipes
- استخدام DAX/M transformations
- إدارة مفاتيح API/webhooks
- إدارة سياسات retention والنسخ الاحتياطي

### 22.4 Row/Column Level Security (للبيانات)
- إخفاء أعمدة حساسة لمجموعات محددة.
- فلترة صفوف حسب دور/قسم.
- سياسات masking وتسجيل الوصول.

---

## 23) الإعدادات (Settings) — منصة كاملة
### 23.1 إعدادات المستخدم
- اللغة/المنطقة
- Arabic mode default
- UI density + shortcuts
- Notifications
- Preferences/brand personal

### 23.2 إعدادات Workspace/Org
- Font vault + licensing metadata
- Brand kits الافتراضية
- سياسات STRICT/PRO
- سياسات Degrade
- Data retention + backups
- Allowed exports
- Connectors enable/disable
- Quotas/limits + concurrency
- MFA enforcement
- Audit logs access

---

## 24) الإدارة (Admin Console)
- إدارة المستخدمين/المجموعات/الأدوار
- إدارة السياسات
- إدارة الموصلات والاعتمادات
- مراقبة الأحمال والأداء
- مراقبة معدلات نجاح STRICT (Pixel‑0 rates)
- إدارة النسخ الاحتياطي/الاستعادة
- إدارة مفاتيح API + Webhooks
- إدارة Marketplace/Plugins (إن وجد)

---

## 25) التكاملات (Integrations)
- Storage: Drive/OneDrive/SharePoint/S3
- Databases: Postgres/MySQL/SQL Server/BigQuery/Snowflake…
- BI: Power BI / Looker / Tableau (قابل للتوسع)
- Webhooks: إشعارات عند اكتمال تحويل/تقرير/تحديث

---

## 26) API/SDK/Plugins (قابل للتوسع)
- Tool SDK (JS/Python) لتسجيل أدوات جديدة.
- OpenAPI auto‑docs لأفعال Actions.
- Rate limiting + scopes.
- Plugin isolation + sandbox.

---

## 27) الأمان والخصوصية (Security & Privacy)
- TLS in transit + encryption at rest
- Tenant isolation
- Secrets vault للموصلات
- Audit logs غير قابلة للتلاعب (WORM optional)
- سياسات تصدير بيانات
- Data residency / Sovereign mode (اختياري)
- حماية prompt injection + sandboxed retrieval

---

## 28) Observability & SLOs
- Logs/Metrics/Traces لكل Action
- SLOs:
  - زمن تحويل STRICT (حسب حجم الملف)
  - زمن بناء dashboard
  - زمن preview للـExpressions
  - زمن البحث في الكتالوج
- Circuit breakers + backpressure
- Canary tests + golden sets (regression)

---

## 29) ضمان الجودة (QA) + Regression
- Golden corpus: ملفات PDF/صور/Excel معيارية.
- اختبار Pixel‑Perfect على farm قبل أي نشر.
- اختبار Structural/drift.
- منع release عند تدهور metrics.
- Repro packs لإعادة إنتاج نتيجة قديمة 1:1.

---

## 30) متطلبات “عدم ترك مجال للتفكير” (Executable Requirements)
### 30.1 كل ميزة تُنفذ عبر Actions
- لا يوجد مسار “خارج runtime”.  
- كل أداة لها schema input/output + policies + failure classes + recovery.

### 30.2 كل تحويل STRICT يمر بـTriple Gate + Repair loop
- لا تسليم “STRICT” قبل pass.
- إن تعذر pass: يتم downgrade وفق policy مع تحذير.

### 30.3 أي Dashboard بدون بيانات = synthetic bind إلزامي
- الداشبورد يجب أن يكون “حي” فورًا.

### 30.4 كل عمليات البيانات/الإكسل تُدار بالـIR
- GUI blocks → IR → preview → apply → export (M/DAX اختياري).

---

## 31) ملاحق (References داخلية)
- Tool Registry (v2/v3)
- JSON Schemas للأدوات الحرجة
- قوالب Action Graph القياسية (PDF→PPTX strict، صورة جدول→Excel…)

---

# نهاية الوثيقة

---

## 2) ملحق 1: الصلاحيات
<a id="2-ملحق-1-الصلاحيات"></a>

# ملحق 1: Permission Matrix (RBAC/ABAC) — مصفوفة الصلاحيات الدقيقة
> Generated: 2026-03-08T22:57:58.868027+00:00


هذا الملحق يضيف طبقة **صلاحيات دقيقة قابلة للتنفيذ** فوق وثيقة المتطلبات الأساسية، بحيث لا يترك أي مجال للاجتهاد عند التنفيذ.

---

## 1) مبادئ الحوكمة
### 1.1 نموذج صلاحيات هجين
- **RBAC**: أدوار + مجموعات (Roles/Groups) بصلاحيات افتراضية.
- **ABAC**: شروط ديناميكية (Attribute-based) مثل تصنيف البيانات، الوقت، مصدر الطلب، سياسة المؤسسة.
- **Object-level ACL**: صلاحيات على كائنات محددة (ملف/مشروع/لوحة…).
- **Row/Column-level Security**: إخفاء أعمدة/صفوف حسب المجموعة/المستخدم.

### 1.2 تسميات صلاحيات موحدة (Naming Convention)
صيغة إلزامية:
- `perm.<domain>.<resource>.<action>`
أمثلة:
- `perm.convert.strict.run`
- `perm.export.pptx`
- `perm.fonts.vault.manage`
- `perm.data.model.relationships.edit`
- `perm.dashboard.publish`
- `perm.admin.audit.read`

### 1.3 نطاقات (Scopes) إلزامية
كل صلاحية تُطبّق على واحد أو أكثر من هذه النطاقات:
- `org` / `workspace` / `project` / `asset` / `artifact` / `recipe` / `connector` / `tool` / `dataset` / `dashboard`

---

## 2) كائنات النظام (Objects) التي يجب أن تدعم ACL
- Organization
- Workspace
- Project
- Asset (input files)
- Artifact (outputs: pptx/docx/xlsx/dashboard/pdf/png)
- Dataset (CDR-Data / Lakehouse tables)
- Semantic Model
- Dashboard
- Report Schedule
- Recipe (IR workflows)
- Connector (Drive/S3/DB/BI)
- Font Pack (Font Vault)
- Template/Brand Kit

كل كائن يدعم:
- `owner`
- `acl`: (user_id أو group_id) -> (role / permissions)
- `classification`: public/internal/confidential/restricted
- `retention_policy_id`
- `versioning_policy_id`

---

## 3) الأدوار الافتراضية (Default Roles)
> يمكن للمؤسسة إضافة أدوار جديدة، لكن يجب أن تبقى هذه الأدوار الافتراضية.

- **OrgOwner**: المالك الأعلى (كل شيء)
- **OrgAdmin**: إدارة المؤسسة والسياسات
- **WorkspaceAdmin**: إدارة مساحة العمل
- **DataAdmin**: إدارة المصادر/النماذج/الأمان على البيانات
- **SecurityAuditor**: قراءة سجلات التدقيق فقط
- **Operator**: تشغيل عمليات تحويل/جداول/جدولة وفق قيود
- **Analyst**: تحليل/لوحات/مقاييس/وصفات
- **Designer**: العروض/التصميم/القوالب/الهوية
- **Editor**: تعديل محتوى ضمن الصلاحيات
- **Viewer**: عرض فقط

---

## 4) الصلاحيات (Permissions) — قائمة إلزامية
### 4.1 إدارة الهوية والحسابات
- `perm.auth.user.invite`
- `perm.auth.user.disable`
- `perm.auth.user.mfa.enforce`
- `perm.auth.session.revoke`
- `perm.auth.sso.manage`

### 4.2 المجموعات والأدوار
- `perm.rbac.group.create`
- `perm.rbac.group.delete`
- `perm.rbac.group.members.manage`
- `perm.rbac.role.create`
- `perm.rbac.role.permissions.edit`
- `perm.rbac.assign.role`

### 4.3 إدارة السياسات (Policy Engine)
- `perm.policy.view`
- `perm.policy.edit`
- `perm.policy.export_rules.edit`
- `perm.policy.degrade_rules.edit`
- `perm.policy.data_residency.edit`
- `perm.policy.retention.edit`

### 4.4 المكتبة/المشاريع
- `perm.library.asset.upload`
- `perm.library.asset.delete`
- `perm.library.asset.share`
- `perm.project.create`
- `perm.project.delete`
- `perm.project.settings.edit`
- `perm.artifact.version.rollback`

### 4.5 STRICT Conversion
- `perm.convert.strict.run`
- `perm.convert.strict.view_internal_metrics` (Admin/Auditor فقط)
- `perm.convert.degrade.font_substitution.allow`
- `perm.convert.degrade.rasterize_decorative.allow`
- `perm.convert.never_fail.override_policy` (OrgOwner/OrgAdmin فقط)

### 4.6 Fonts Vault
- `perm.fonts.vault.view`
- `perm.fonts.vault.upload`
- `perm.fonts.vault.delete`
- `perm.fonts.vault.manage` (licensing metadata/embedding policy)
- `perm.fonts.vault.org_default.set`

### 4.7 Data/Lakehouse
- `perm.data.ingest`
- `perm.data.catalog.read`
- `perm.data.catalog.write`
- `perm.data.query.run`
- `perm.data.model.create`
- `perm.data.model.relationships.edit`
- `perm.data.model.measures.edit`
- `perm.data.security.row_level.manage`
- `perm.data.security.column_level.manage`
- `perm.data.export.raw.allow`

### 4.8 Expressions (Power Query / DAX)
- `perm.expr.tir.create`
- `perm.expr.tir.apply`
- `perm.expr.mir.create`
- `perm.expr.mir.apply`
- `perm.expr.export.powerquery`
- `perm.expr.export.dax`

### 4.9 Dashboards & Reports
- `perm.dashboard.create`
- `perm.dashboard.edit`
- `perm.dashboard.publish`
- `perm.dashboard.share_link`
- `perm.dashboard.export`
- `perm.dashboard.refresh`
- `perm.dashboard.synthetic_data.allow`

- `perm.report.create`
- `perm.report.edit`
- `perm.report.schedule.create`
- `perm.report.schedule.manage`
- `perm.report.diff.generate`

### 4.10 Slides/Presentations
- `perm.slides.generate`
- `perm.slides.edit`
- `perm.slides.brand.apply`
- `perm.slides.translate`
- `perm.slides.motion.enable`
- `perm.slides.export`

### 4.11 Integrations / Connectors
- `perm.connector.create`
- `perm.connector.edit`
- `perm.connector.delete`
- `perm.connector.secrets.manage`
- `perm.connector.use`
- `perm.connector.data_source.approve`

### 4.12 Admin/Audit/Observability
- `perm.admin.audit.read`
- `perm.admin.audit.export`
- `perm.admin.observability.view`
- `perm.admin.slo.manage`
- `perm.admin.keys.manage` (API keys / webhooks)
- `perm.admin.plugins.manage`

---

## 5) مصفوفة الأدوار (Role → Permissions)
> هذه المصفوفة “Baseline” إلزامية. يمكن تضييقها لكن لا يُنصح بتوسيعها بدون Policy review.

### 5.1 OrgOwner
- كل الصلاحيات (Super-set)

### 5.2 OrgAdmin
- كل صلاحيات الإدارة والسياسات + إدارة المستخدمين/المجموعات/الموصلات + الوصول لسجلات التدقيق
- لا يملك افتراضيًا صلاحيات تصدير بيانات خام بدون `perm.data.export.raw.allow` (ABAC قد يمنع)

### 5.3 WorkspaceAdmin
- إدارة مشاريع/مكتبة/أعضاء داخل Workspace
- تشغيل STRICT، لكن لا يغير سياسات المؤسسة العالمية

### 5.4 DataAdmin
- إدارة Lakehouse + Catalog + Semantic Model + RLS/CLS
- إدارة موصلات البيانات داخل Workspace
- إنشاء/تعديل Measures + نشر Dashboards

### 5.5 SecurityAuditor
- `perm.admin.audit.read`, `perm.admin.observability.view`
- لا تعديل ولا تشغيل تحويلات

### 5.6 Operator
- تشغيل تحويلات/جدولة/تنفيذ workflows
- ممنوع عليه تغيير السياسات أو إدارة أسرار الموصلات

### 5.7 Analyst
- ingest/query/model/measures/dashboards/reports/recipes ضمن Workspace
- ممنوع عليه إدارة المستخدمين/السياسات/الأسرار

### 5.8 Designer
- slides/templates/brand/motion/translation
- access محدود للبيانات (حسب ABAC)

### 5.9 Editor
- تعديل artifacts داخل مشروع/كائنات مُخوّل بها
- لا إدارة بيانات عميقة ولا سياسات

### 5.10 Viewer
- عرض فقط + تنزيل حسب سياسة التصدير

---

## 6) ABAC — شروط ديناميكية إلزامية
### 6.1 تصنيف البيانات (Data Classification)
- confidential/restricted تمنع:
  - مشاركة link خارجي
  - تصدير raw data
  - استخدام موصلات غير معتمدة
- internal يسمح بنطاق أوسع

### 6.2 سياق الطلب (Request Context)
- IP allowlist / geo policy
- وقت التشغيل (Business hours)
- جهاز موثوق (Device posture)
- مستوى MFA

### 6.3 سياسات STRICT/Degrade
- السماح بـ rasterize decorative فقط إذا:
  - المستخدم يملك `perm.convert.degrade.rasterize_decorative.allow`
  - وpolicy المؤسسة تسمح به
- السماح بـ synthetic data فقط إذا:
  - `perm.dashboard.synthetic_data.allow`

---

## 7) ربط الصلاحيات بالأدوات (Tool Binding)
- كل Action عند التشغيل يجب أن يعلن:
  - `required_permissions[]`
  - `scope`
  - `object_refs[]`
- Policy engine يتحقق قبل التنفيذ.

---

## 8) اختبارات قبول (Permission Tests)
- user بدون `perm.export.pptx` لا يستطيع التصدير
- user بدون `perm.convert.strict.run` لا يستطيع تشغيل STRICT
- group-based RLS يخفي الأعمدة/الصفوف
- restricted dataset يمنع share link خارجي

---

# نهاية الملحق 1

---

## 3) ملحق 2: قوالب التشغيل
<a id="3-ملحق-2-قوالب-التشغيل"></a>

# ملحق 2: Action Graph Templates (JSON) — قوالب تشغيل جاهزة
> Generated: 2026-03-08T22:57:58.868027+00:00


هذا الملحق يقدّم قوالب JSON جاهزة لتشغيل السيناريوهات الأساسية من Canvas.
**الهدف**: تنفيذ بدون اجتهاد — كل قالب يستخدم أدوات مسجلة (Tool IDs) ويحدد سياسة STRICT/Degrade وAuto/Guided.

---

## 0) مواصفات قالب Action Graph
- `graph_id`: معرف
- `policies`: strict/never_fail/degrade/ar_mode/render_profile
- `nodes[]`: كل Node يمثل Tool action
- `deliver`: ما الذي يُسلم للمستخدم + رسائل التحذير المختصرة

---

## 1) PDF → PPTX STRICT 1:1 Editable (Pixel-0)
```json
{
  "graph_id": "tmpl.pdf_to_pptx.strict.v1",
  "policies": {
    "strict_visual": true,
    "never_fail": true,
    "arabic_mode": "ELITE",
    "mode": "AUTO",
    "degrade": {
      "allow_font_substitution": true,
      "allow_element_rasterize": true,
      "max_rasterized_elements": 2
    },
    "render_profile": { "dpi": 300, "colorspace": "sRGB", "page_range": { "from": 1, "to": 5 } }
  },
  "nodes": [
    { "id": "n1", "tool_id": "extract.pdf_dom", "inputs": { "pdf_asset": "$in.asset_pdf" } },
    { "id": "n2", "tool_id": "cdr.build_design_from_pdf", "inputs": { "pdf_dom": "$out.n1.pdf_dom" } },
    { "id": "n3", "tool_id": "fonts.embed_full_glyph", "inputs": { "font_plan": "$out.n2.font_plan", "embed_policy": { "embed_all_glyphs": true } } },
    { "id": "n4", "tool_id": "repair.quantize_geometry", "inputs": { "cdr_design": "$out.n2.cdr_design", "quantization_profile": { "emu_snap": 8, "snap_text_baselines": true } } },
    { "id": "n5", "tool_id": "export.pptx_from_cdr", "inputs": { "cdr_design": "$out.n4.cdr_design", "font_plan": "$out.n3.font_plan" } },
    { "id": "n6", "tool_id": "render.pdf_to_png", "inputs": { "pdf_asset": "$in.asset_pdf", "render_profile": "$policy.render_profile" } },
    { "id": "n7", "tool_id": "render.pptx_to_png", "inputs": { "pptx_artifact": "$out.n5.artifact", "render_profile": "$policy.render_profile" } },
    { "id": "n8", "tool_id": "verify.pixel_diff", "inputs": { "source_render": "$out.n6.renders[0]", "target_render": "$out.n7.renders[0]", "threshold": 0 } },
    { "id": "n9", "tool_id": "verify.structural_equivalence", "inputs": {
      "artifact": "$out.n5.artifact",
      "cdr_design": "$out.n4.cdr_design",
      "requirements": { "require_text_editable": true, "require_tables_structured": true, "allow_decorative_raster": true, "max_rasterized_elements": 2 }
    } }
  ],
  "deliver": {
    "artifact": "$out.n5.artifact",
    "warnings": ["$out.n2.warnings", "$out.n9.warnings"]
  }
}
```

---

## 2) صورة جدول → Excel Editable (1-Click)
```json
{
  "graph_id": "tmpl.image_table_to_xlsx.strict.v1",
  "policies": {
    "strict_visual": true,
    "never_fail": true,
    "arabic_mode": "ELITE",
    "mode": "GUIDED"
  },
  "nodes": [
    { "id": "n1", "tool_id": "extract.image_segments", "inputs": { "image_asset": "$in.asset_img" } },
    { "id": "n2", "tool_id": "cdr.build_table_from_image", "inputs": { "image_segments": "$out.n1.image_segments", "table_region_id": "$in.table_region_id" } },
    { "id": "n3", "tool_id": "export.xlsx_from_table_cdr", "inputs": { "cdr_data": "$out.n2.cdr_data", "style_source": "$out.n2.cdr_design" } }
  ],
  "deliver": { "artifact": "$out.n3.artifact" }
}
```

---

## 3) وصف نصي → اختيار أعمدة → جدول + Dashboard (Guided)
```json
{
  "graph_id": "tmpl.nl_to_dashboard.guided.v1",
  "policies": { "mode": "GUIDED", "never_fail": true },
  "nodes": [
    { "id": "n1", "tool_id": "orch.intent_parse", "inputs": { "prompt": "$in.prompt", "assets": "$in.assets" } },
    { "id": "n2", "tool_id": "catalog.search_columns", "inputs": { "query": "$out.n1.intent.column_query" } },
    { "id": "n3", "tool_id": "orch.guided_questions", "when": "(count($out.n2.columns) == 0)", "inputs": { "ambiguity": "no_columns_found" } },
    { "id": "n4", "tool_id": "query.run_federated", "inputs": { "query": "$out.n1.intent.query_plan" } },
    { "id": "n5", "tool_id": "model.build_semantic", "inputs": { "cdr_data": "$out.n4.result_table" } },
    { "id": "n6", "tool_id": "insight.profile_dataset", "inputs": { "cdr_data": "$out.n4.result_table" } },
    { "id": "n7", "tool_id": "insight.build_insight_graph", "inputs": { "model": "$out.n5.semantic_model", "profile": "$out.n6.profile" } },
    { "id": "n8", "tool_id": "insight.graph_to_dashboard_plan", "inputs": { "insight_graph": "$out.n7.insight_graph" } },
    { "id": "n9", "tool_id": "gen.dashboard_from_plan", "inputs": { "plan": "$out.n8.plan", "model": "$out.n5.semantic_model" } }
  ],
  "deliver": { "dashboard": "$out.n9.dashboard" }
}
```

---

# نهاية الملحق 2

---

## 4) ملحق 3: Tool Registry v3
<a id="4-ملحق-3-tool-registry-v3"></a>

# ملحق 3: Tool Registry v3 — عقد التسجيل الموحد للأدوات (قابل للتوسع)
> Generated: 2026-03-08T22:57:58.868027+00:00


هذا الملحق يعرّف **شكل Tool Registry** الذي يعتمد عليه الـAI Orchestrator لتخطيط وتنفيذ كل شيء من Canvas، ويضمن:
- حتمية التنفيذ (Determinism)
- هدف الدقة (Fidelity Target)
- ضمانات التحرير (Editable Guarantees)
- الصلاحيات المطلوبة (Permission Binding)
- سياسات STRICT/Degrade/Never-Fail

---

## 1) Registry Contract (JSON)
```json
{
  "registry_version": "3.0",
  "generated": "2026-03-08T22:57:58.868027+00:00",
  "entry_contract": {
    "tool_id": "string",
    "version": "semver",
    "capabilities": [
      "string"
    ],
    "determinism_level": "HARD|SOFT|NONE",
    "fidelity_target": "PIXEL_0|PIXEL_EPS|STRUCT_ONLY|N/A",
    "editable_guarantee": {
      "text": "required|best_effort|none",
      "tables": "required|best_effort|none",
      "charts": "required|best_effort|none",
      "decorative_raster_allowed": "boolean"
    },
    "arabic_support": "BASIC|PROFESSIONAL|ELITE",
    "required_permissions": [
      "perm.*"
    ],
    "resource_profile": {
      "cpu": "string",
      "gpu": "string",
      "ram": "string",
      "timeout_s": "int"
    },
    "failure_classes": [
      "F1_*",
      "F2_*"
    ],
    "schemas": {
      "input": "url/path",
      "output": "url/path"
    }
  },
  "core_policies": {
    "strict_triple_gate": true,
    "never_fail": true,
    "deterministic_render_farm": true,
    "font_vault_required": true
  },
  "tools_example": [
    {
      "tool_id": "cdr.build_design_from_pdf",
      "version": "1.0.0",
      "capabilities": [
        "strict_replication",
        "cdr_design",
        "pdf_native"
      ],
      "determinism_level": "HARD",
      "fidelity_target": "PIXEL_0",
      "editable_guarantee": {
        "text": "required",
        "tables": "best_effort",
        "charts": "best_effort",
        "decorative_raster_allowed": true
      },
      "arabic_support": "ELITE",
      "required_permissions": [
        "perm.convert.strict.run"
      ],
      "resource_profile": {
        "cpu": "high",
        "gpu": "none",
        "ram": "high",
        "timeout_s": 600
      },
      "failure_classes": [
        "F2_PDF_FEATURE_UNSUPPORTED",
        "F1_FONT_MISSING"
      ],
      "schemas": {
        "input": "Tool-Schemas-Strict-Plus.md#cdr.build_design_from_pdf-input",
        "output": "Tool-Schemas-Strict-Plus.md#cdr.build_design_from_pdf-output"
      }
    }
  ]
}
```

---

## 2) قواعد إلزامية
1) أي Tool بدون `schemas.input/output` غير صالح للتشغيل.
2) أي Tool يدّعي `PIXEL_0` يجب أن يثبت `determinism_level=HARD` ويعمل فقط داخل Farm.
3) أي Tool يتعامل مع بيانات يجب أن يحدد `required_permissions` ويخضع لـPolicy engine.
4) أي Tool قد يستخدم Degrade يجب أن يصرح به صراحة.

---

# نهاية الملحق 3

---

## 5) ملحق 4: Traceability Matrix
<a id="5-ملحق-4-traceability-matrix"></a>

# ملحق 4: Traceability Matrix — ربط المتطلبات بالأدوات والاختبارات
> Generated: 2026-03-08T22:57:58.868027+00:00


هذا الملحق يمنع “انحراف التنفيذ عن الهدف” عبر ربط كل متطلب بـ:
- أدوات (Tools)
- بوابات قبول (Gates)
- اختبارات Regression/Golden
- صلاحيات (Permissions)

---

## 1) STRICT Visual Replication
| Requirement ID | النص | Tools | Gates/Tests | Permissions |
|---|---|---|---|---|
| R-STR-001 | Pixel-Perfect STRICT (PixelDiff=0/ε ثابت) | render.* + verify.pixel_diff + repair.loop_controller | Golden set pixel tests | perm.convert.strict.run |
| R-STR-002 | Dual/Triple Gate (Pixel + Structural + Drift) | verify.pixel_diff + verify.structural_equivalence + drift.* | CI gates | perm.convert.strict.run |
| R-STR-003 | Determinism (AA lock + GPU/CPU parity) | render.validate_determinism | Farm canary tests | perm.admin.observability.view |
| R-STR-004 | Never-Fail مع Degrade مضبوط | degrade.* + orch.delivery_pack | downgrade unit tests | perm.convert.degrade.* |
| R-STR-005 | Font embedding full glyph (STRICT) | fonts.embed_full_glyph | font regression | perm.fonts.vault.manage |

---

## 2) Image/Table → Excel Editable
| Requirement ID | النص | Tools | Gates/Tests | Permissions |
|---|---|---|---|---|
| R-TBL-001 | صورة جدول → XLSX editable | cdr.build_table_from_image + export.xlsx_from_table_cdr | Pixel gate + OCR confidence tests | perm.data.ingest |
| R-TBL-002 | merges/borders/styles preserved | cdr.table_semantics_infer (subsystem) | golden images | perm.data.ingest |

---

## 3) Excel/SVM + Expressions
| Requirement ID | النص | Tools | Gates/Tests | Permissions |
|---|---|---|---|---|
| R-XLS-001 | SVM deterministic recalc | xlsx.svm_execute (to be added) | drift gate | perm.data.model.measures.edit |
| R-IR-001 | GUI blocks → T-IR | expr.gui_to_tir + expr.tir_validate | preview tests | perm.expr.tir.create |
| R-IR-002 | GUI measures → M-IR → DAX | expr.gui_to_mir + expr.mir_to_dax | measure tests | perm.expr.export.dax |

---

## 4) Dashboards / Reports / Slides
| Requirement ID | النص | Tools | Gates/Tests | Permissions |
|---|---|---|---|---|
| R-DSH-001 | Dashboard حي (filters/drill/export) | gen.dashboard_from_plan + export.dashboard_publish | interaction tests | perm.dashboard.publish |
| R-DSH-002 | Synthetic data عند غياب البيانات | degrade.dashboard_synthetic_data | smoke tests | perm.dashboard.synthetic_data.allow |
| R-RPT-001 | Scheduling + diff reports | report.schedule.* + report.diff.* (to be added) | scheduler tests | perm.report.schedule.create |
| R-SLD-001 | Slides generator premium + brand + motion | gen.slides_from_storyboard + slides.motion.* (to be added) | visual QA | perm.slides.motion.enable |

---

# نهاية الملحق 4

---

## 6) ملحق 5: Tool Schemas (Strict Plus)
<a id="6-ملحق-5-tool-schemas-strict-plus"></a>

# Strict Plus Tool Schemas (12 + 6)

> Generated: 2026-03-08T22:41:58.073382Z

هذا الملف يضم **نسخة مطوّرة** من الـ12 أدوات الحرجة + **6 أدوات** لسد الفجوات الأساسية (dual gate structural، hashes، determinism parity، font embed strict، MIR/DAX).

## Common definitions (v2)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/common.json",
  "title": "Common Definitions",
  "type": "object",
  "$defs": {
    "UUID": {
      "type": "string",
      "pattern": "^[0-9a-fA-F-]{16,64}$"
    },
    "ISODateTime": {
      "type": "string",
      "format": "date-time"
    },
    "Locale": {
      "type": "string",
      "minLength": 2,
      "maxLength": 16
    },
    "ArabicMode": {
      "type": "string",
      "enum": [
        "BASIC",
        "PROFESSIONAL",
        "ELITE"
      ]
    },
    "Mode": {
      "type": "string",
      "enum": [
        "AUTO",
        "GUIDED"
      ]
    },
    "FontPolicy": {
      "type": "string",
      "enum": [
        "PROVIDED",
        "ALLOW_UPLOAD",
        "FALLBACK_ALLOWED"
      ]
    },
    "Severity": {
      "type": "string",
      "enum": [
        "info",
        "warning",
        "error"
      ]
    },
    "Warnings": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "code",
          "message",
          "severity"
        ],
        "properties": {
          "code": {
            "type": "string",
            "minLength": 2,
            "maxLength": 64
          },
          "message": {
            "type": "string",
            "minLength": 1,
            "maxLength": 2000
          },
          "severity": {
            "$ref": "#/$defs/Severity"
          }
        },
        "additionalProperties": false
      },
      "default": []
    },
    "ActionContext": {
      "type": "object",
      "required": [
        "workspace_id",
        "user_id",
        "locale",
        "strict_visual",
        "never_fail",
        "arabic_mode",
        "mode",
        "font_policy"
      ],
      "properties": {
        "workspace_id": {
          "type": "string",
          "minLength": 3,
          "maxLength": 128
        },
        "user_id": {
          "type": "string",
          "minLength": 3,
          "maxLength": 128
        },
        "locale": {
          "$ref": "#/$defs/Locale"
        },
        "strict_visual": {
          "type": "boolean"
        },
        "never_fail": {
          "type": "boolean"
        },
        "arabic_mode": {
          "$ref": "#/$defs/ArabicMode"
        },
        "mode": {
          "$ref": "#/$defs/Mode"
        },
        "font_policy": {
          "$ref": "#/$defs/FontPolicy"
        }
      },
      "additionalProperties": true
    },
    "AssetRef": {
      "type": "object",
      "required": [
        "asset_id",
        "uri",
        "mime",
        "sha256",
        "size_bytes"
      ],
      "properties": {
        "asset_id": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128
        },
        "uri": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        "mime": {
          "type": "string",
          "minLength": 3,
          "maxLength": 128
        },
        "sha256": {
          "type": "string",
          "pattern": "^[0-9a-fA-F]{64}$"
        },
        "size_bytes": {
          "type": "integer",
          "minimum": 0
        },
        "page_count": {
          "type": "integer",
          "minimum": 1
        }
      },
      "additionalProperties": false
    },
    "PdfDomRef": {
      "type": "object",
      "required": [
        "pdf_dom_id"
      ],
      "properties": {
        "pdf_dom_id": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128
        }
      },
      "additionalProperties": false
    },
    "ImageSegRef": {
      "type": "object",
      "required": [
        "seg_id",
        "regions"
      ],
      "properties": {
        "seg_id": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128
        },
        "regions": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "region_id",
              "kind",
              "bbox"
            ],
            "properties": {
              "region_id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 128
              },
              "kind": {
                "type": "string",
                "enum": [
                  "background",
                  "text",
                  "logo",
                  "table",
                  "chart",
                  "figure",
                  "photo",
                  "unknown"
                ]
              },
              "bbox": {
                "type": "object",
                "required": [
                  "x",
                  "y",
                  "w",
                  "h"
                ],
                "properties": {
                  "x": {
                    "type": "number"
                  },
                  "y": {
                    "type": "number"
                  },
                  "w": {
                    "type": "number",
                    "minimum": 0
                  },
                  "h": {
                    "type": "number",
                    "minimum": 0
                  }
                },
                "additionalProperties": false
              }
            },
            "additionalProperties": true
          }
        }
      },
      "additionalProperties": false
    },
    "CdrDesignRef": {
      "type": "object",
      "required": [
        "cdr_design_id",
        "page_count"
      ],
      "properties": {
        "cdr_design_id": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128
        },
        "page_count": {
          "type": "integer",
          "minimum": 1
        }
      },
      "additionalProperties": false
    },
    "CdrDataRef": {
      "type": "object",
      "required": [
        "cdr_data_id",
        "table_count"
      ],
      "properties": {
        "cdr_data_id": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128
        },
        "table_count": {
          "type": "integer",
          "minimum": 0
        }
      },
      "additionalProperties": false
    },
    "FontPlan": {
      "type": "object",
      "required": [
        "fonts"
      ],
      "properties": {
        "fonts": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "family",
              "status"
            ],
            "properties": {
              "family": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "status": {
                "type": "string",
                "enum": [
                  "available",
                  "embedded",
                  "substituted",
                  "missing"
                ]
              },
              "substitute_family": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "embed_subset": {
                "type": "boolean",
                "default": true
              }
            },
            "additionalProperties": false
          }
        }
      },
      "additionalProperties": true
    },
    "ArtifactRef": {
      "type": "object",
      "required": [
        "artifact_id",
        "kind",
        "uri"
      ],
      "properties": {
        "artifact_id": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128
        },
        "kind": {
          "type": "string",
          "enum": [
            "pptx",
            "docx",
            "xlsx",
            "dashboard",
            "pdf",
            "png",
            "json"
          ]
        },
        "uri": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        }
      },
      "additionalProperties": false
    },
    "RenderProfile": {
      "type": "object",
      "required": [
        "dpi",
        "colorspace"
      ],
      "properties": {
        "dpi": {
          "type": "integer",
          "minimum": 72,
          "maximum": 1200
        },
        "colorspace": {
          "type": "string",
          "enum": [
            "sRGB"
          ]
        },
        "page_range": {
          "type": "object",
          "properties": {
            "from": {
              "type": "integer",
              "minimum": 1
            },
            "to": {
              "type": "integer",
              "minimum": 1
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "RenderRef": {
      "type": "object",
      "required": [
        "render_id",
        "uri",
        "dpi",
        "colorspace",
        "engine_fingerprint",
        "fingerprint"
      ],
      "properties": {
        "render_id": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128
        },
        "uri": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        "dpi": {
          "type": "integer",
          "minimum": 72,
          "maximum": 1200
        },
        "colorspace": {
          "type": "string",
          "enum": [
            "sRGB"
          ]
        },
        "engine_fingerprint": {
          "type": "string",
          "minLength": 6,
          "maxLength": 256
        },
        "fingerprint": {
          "$ref": "#/$defs/HashBundle"
        }
      },
      "additionalProperties": false
    },
    "DiffRef": {
      "type": "object",
      "required": [
        "diff_id",
        "pixel_diff",
        "ssim",
        "edge_diff",
        "pass",
        "pixel_threshold"
      ],
      "properties": {
        "diff_id": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128
        },
        "pixel_diff": {
          "type": "number",
          "minimum": 0
        },
        "ssim": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "edge_diff": {
          "type": "number",
          "minimum": 0
        },
        "heatmap_uri": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        "pass": {
          "type": "boolean"
        },
        "pixel_threshold": {
          "type": "number",
          "minimum": 0
        }
      },
      "additionalProperties": false
    },
    "CauseType": {
      "type": "string",
      "enum": [
        "text_metrics",
        "baseline_shift",
        "kerning",
        "stroke_width",
        "fill_color",
        "crop_offset",
        "vector_approx",
        "missing_font",
        "unknown"
      ]
    },
    "DiffCause": {
      "type": "object",
      "required": [
        "cause_type",
        "severity",
        "confidence"
      ],
      "properties": {
        "element_id": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        },
        "cause_type": {
          "$ref": "#/$defs/CauseType"
        },
        "severity": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "confidence": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "suggested_fix": {
          "type": "string",
          "enum": [
            "adjust_text_metrics",
            "adjust_strokes",
            "adjust_crops",
            "quantize_geometry",
            "substitute_font",
            "rasterize_element",
            "none"
          ]
        }
      },
      "additionalProperties": false
    },
    "HashBundle": {
      "type": "object",
      "required": [
        "layout_hash",
        "structural_hash",
        "typography_hash"
      ],
      "properties": {
        "layout_hash": {
          "type": "string",
          "minLength": 16,
          "maxLength": 256
        },
        "structural_hash": {
          "type": "string",
          "minLength": 16,
          "maxLength": 256
        },
        "typography_hash": {
          "type": "string",
          "minLength": 16,
          "maxLength": 256
        },
        "perceptual_hash": {
          "type": "string",
          "minLength": 16,
          "maxLength": 256
        },
        "pixel_hash": {
          "type": "string",
          "minLength": 16,
          "maxLength": 256
        }
      },
      "additionalProperties": false
    },
    "ArtifactDomRef": {
      "type": "object",
      "required": [
        "artifact_dom_id",
        "kind"
      ],
      "properties": {
        "artifact_dom_id": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128
        },
        "kind": {
          "type": "string",
          "enum": [
            "pptx",
            "docx",
            "xlsx",
            "dashboard"
          ]
        }
      },
      "additionalProperties": false
    },
    "DeterminismCheck": {
      "type": "object",
      "required": [
        "anti_aliasing_policy",
        "gpu_cpu_parity",
        "float_norm_policy",
        "random_seed_locked"
      ],
      "properties": {
        "anti_aliasing_policy": {
          "type": "string",
          "enum": [
            "locked"
          ]
        },
        "gpu_cpu_parity": {
          "type": "string",
          "enum": [
            "validated",
            "not_validated"
          ]
        },
        "float_norm_policy": {
          "type": "string",
          "enum": [
            "locked"
          ]
        },
        "random_seed_locked": {
          "type": "boolean"
        }
      },
      "additionalProperties": false
    }
  }
}
```

## cdr.build_design_from_pdf
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/cdr.build_design_from_pdf.input.json",
  "title": "Build CDR-Design from PDF DOM - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "cdr.build_design_from_pdf"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "pdf_dom"
      ],
      "properties": {
        "pdf_dom": {
          "$ref": "common.defs.schema.json#/$defs/PdfDomRef"
        },
        "page_range": {
          "$ref": "common.defs.schema.json#/$defs/RenderProfile/properties/page_range"
        },
        "hints": {
          "type": "object",
          "properties": {
            "prefer_native_text": {
              "type": "boolean",
              "default": true
            },
            "detect_tables": {
              "type": "boolean",
              "default": true
            },
            "detect_charts": {
              "type": "boolean",
              "default": true
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/cdr.build_design_from_pdf.output.json",
  "title": "Build CDR-Design from PDF DOM - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "cdr.build_design_from_pdf"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "cdr_design",
        "font_plan"
      ],
      "properties": {
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "font_plan": {
          "$ref": "common.defs.schema.json#/$defs/FontPlan"
        },
        "element_map": {
          "type": "object",
          "properties": {
            "elements": {
              "type": "array",
              "items": {
                "type": "object",
                "required": [
                  "element_id",
                  "kind",
                  "page",
                  "bbox"
                ],
                "properties": {
                  "element_id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                  },
                  "kind": {
                    "type": "string",
                    "enum": [
                      "text",
                      "shape",
                      "path",
                      "image",
                      "table",
                      "chart",
                      "group",
                      "background"
                    ]
                  },
                  "page": {
                    "type": "integer",
                    "minimum": 1
                  },
                  "bbox": {
                    "$ref": "common.defs.schema.json#/$defs/ImageSegRef/properties/regions/items/properties/bbox"
                  }
                },
                "additionalProperties": false
              }
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## cdr.build_table_from_image
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/cdr.build_table_from_image.input.json",
  "title": "Build CDR-Table (Design+Data) from Image Segments - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "cdr.build_table_from_image"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "image_segments",
        "table_region_id"
      ],
      "properties": {
        "image_segments": {
          "$ref": "common.defs.schema.json#/$defs/ImageSegRef"
        },
        "table_region_id": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        },
        "ocr_profile": {
          "type": "object",
          "properties": {
            "language_hint": {
              "type": "string",
              "enum": [
                "ar",
                "en",
                "auto"
              ],
              "default": "auto"
            },
            "min_confidence": {
              "type": "number",
              "minimum": 0,
              "maximum": 1,
              "default": 0.7
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/cdr.build_table_from_image.output.json",
  "title": "Build CDR-Table (Design+Data) from Image Segments - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "cdr.build_table_from_image"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "cdr_design",
        "cdr_data",
        "table_quality"
      ],
      "properties": {
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "cdr_data": {
          "$ref": "common.defs.schema.json#/$defs/CdrDataRef"
        },
        "table_quality": {
          "type": "object",
          "required": [
            "grid_confidence",
            "ocr_confidence"
          ],
          "properties": {
            "grid_confidence": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "ocr_confidence": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "merged_cells_detected": {
              "type": "boolean"
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## export.pptx_from_cdr
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/export.pptx_from_cdr.input.json",
  "title": "Export PPTX from CDR-Design - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "export.pptx_from_cdr"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "cdr_design",
        "font_plan"
      ],
      "properties": {
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "font_plan": {
          "$ref": "common.defs.schema.json#/$defs/FontPlan"
        },
        "theme": {
          "type": "object",
          "properties": {
            "theme_id": {
              "type": "string"
            }
          },
          "additionalProperties": true
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/export.pptx_from_cdr.output.json",
  "title": "Export PPTX from CDR-Design - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "export.pptx_from_cdr"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "artifact"
      ],
      "properties": {
        "artifact": {
          "$ref": "common.defs.schema.json#/$defs/ArtifactRef"
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## export.xlsx_from_table_cdr
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/export.xlsx_from_table_cdr.input.json",
  "title": "Export XLSX (Editable Table) from CDR-Data + Table Styles - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "export.xlsx_from_table_cdr"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "cdr_data"
      ],
      "properties": {
        "cdr_data": {
          "$ref": "common.defs.schema.json#/$defs/CdrDataRef"
        },
        "style_source": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "sheet_name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 31,
          "default": "Sheet1"
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/export.xlsx_from_table_cdr.output.json",
  "title": "Export XLSX (Editable Table) from CDR-Data + Table Styles - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "export.xlsx_from_table_cdr"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "artifact"
      ],
      "properties": {
        "artifact": {
          "$ref": "common.defs.schema.json#/$defs/ArtifactRef"
        },
        "table_range": {
          "type": "string",
          "pattern": "^[A-Z]{1,3}[0-9]{1,7}:[A-Z]{1,3}[0-9]{1,7}$"
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## render.pdf_to_png
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/render.pdf_to_png.input.json",
  "title": "Render PDF to PNG (Deterministic Farm) - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "render.pdf_to_png"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "pdf_asset",
        "render_profile"
      ],
      "properties": {
        "pdf_asset": {
          "$ref": "common.defs.schema.json#/$defs/AssetRef"
        },
        "render_profile": {
          "$ref": "common.defs.schema.json#/$defs/RenderProfile"
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/render.pdf_to_png.output.json",
  "title": "Render PDF to PNG (Deterministic Farm) - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "render.pdf_to_png"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "renders"
      ],
      "properties": {
        "renders": {
          "type": "array",
          "items": {
            "$ref": "common.defs.schema.json#/$defs/RenderRef"
          },
          "minItems": 1
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## render.pptx_to_png
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/render.pptx_to_png.input.json",
  "title": "Render PPTX to PNG (Deterministic Farm) - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "render.pptx_to_png"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "pptx_artifact",
        "render_profile"
      ],
      "properties": {
        "pptx_artifact": {
          "$ref": "common.defs.schema.json#/$defs/ArtifactRef"
        },
        "render_profile": {
          "$ref": "common.defs.schema.json#/$defs/RenderProfile"
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/render.pptx_to_png.output.json",
  "title": "Render PPTX to PNG (Deterministic Farm) - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "render.pptx_to_png"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "renders"
      ],
      "properties": {
        "renders": {
          "type": "array",
          "items": {
            "$ref": "common.defs.schema.json#/$defs/RenderRef"
          },
          "minItems": 1
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## verify.pixel_diff
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/verify.pixel_diff.input.json",
  "title": "Verify Pixel Diff Between Two Renders - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "verify.pixel_diff"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "source_render",
        "target_render"
      ],
      "properties": {
        "source_render": {
          "$ref": "common.defs.schema.json#/$defs/RenderRef"
        },
        "target_render": {
          "$ref": "common.defs.schema.json#/$defs/RenderRef"
        },
        "threshold": {
          "type": "number",
          "minimum": 0,
          "default": 0
        },
        "ignore_regions": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "page",
              "bbox"
            ],
            "properties": {
              "page": {
                "type": "integer",
                "minimum": 1
              },
              "bbox": {
                "$ref": "common.defs.schema.json#/$defs/ImageSegRef/properties/regions/items/properties/bbox"
              }
            },
            "additionalProperties": false
          },
          "default": []
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/verify.pixel_diff.output.json",
  "title": "Verify Pixel Diff Between Two Renders - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "verify.pixel_diff"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "diff"
      ],
      "properties": {
        "diff": {
          "$ref": "common.defs.schema.json#/$defs/DiffRef"
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## diagnose.diff_attribution
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/diagnose.diff_attribution.input.json",
  "title": "Diagnose Root Causes for Diff - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "diagnose.diff_attribution"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "diff",
        "cdr_design"
      ],
      "properties": {
        "diff": {
          "$ref": "common.defs.schema.json#/$defs/DiffRef"
        },
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "max_causes": {
          "type": "integer",
          "minimum": 1,
          "maximum": 500,
          "default": 50
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/diagnose.diff_attribution.output.json",
  "title": "Diagnose Root Causes for Diff - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "diagnose.diff_attribution"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "causes"
      ],
      "properties": {
        "causes": {
          "type": "array",
          "items": {
            "$ref": "common.defs.schema.json#/$defs/DiffCause"
          },
          "minItems": 0
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## repair.quantize_geometry
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/repair.quantize_geometry.input.json",
  "title": "Quantize Geometry to EMU/Pixels Grid - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "repair.quantize_geometry"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "cdr_design",
        "quantization_profile"
      ],
      "properties": {
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "quantization_profile": {
          "type": "object",
          "required": [
            "emu_snap"
          ],
          "properties": {
            "emu_snap": {
              "type": "integer",
              "minimum": 1,
              "default": 8
            },
            "snap_text_baselines": {
              "type": "boolean",
              "default": true
            },
            "snap_strokes": {
              "type": "boolean",
              "default": true
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/repair.quantize_geometry.output.json",
  "title": "Quantize Geometry to EMU/Pixels Grid - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "repair.quantize_geometry"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "cdr_design"
      ],
      "properties": {
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## repair.adjust_text_metrics
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/repair.adjust_text_metrics.input.json",
  "title": "Repair Text Metrics Based on Diagnosed Causes - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "repair.adjust_text_metrics"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "cdr_design",
        "causes"
      ],
      "properties": {
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "causes": {
          "type": "array",
          "items": {
            "$ref": "common.defs.schema.json#/$defs/DiffCause"
          }
        },
        "strategy": {
          "type": "string",
          "enum": [
            "baseline_first",
            "kerning_first",
            "lineheight_first",
            "auto"
          ],
          "default": "auto"
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/repair.adjust_text_metrics.output.json",
  "title": "Repair Text Metrics Based on Diagnosed Causes - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "repair.adjust_text_metrics"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "cdr_design"
      ],
      "properties": {
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "applied_fixes": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "element_id",
              "fix"
            ],
            "properties": {
              "element_id": {
                "type": "string"
              },
              "fix": {
                "type": "string"
              }
            },
            "additionalProperties": false
          }
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## repair.loop_controller
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/repair.loop_controller.input.json",
  "title": "Repair Loop Controller (Export+Render+Verify+Repair) - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "repair.loop_controller"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "initial_cdr_design",
        "source_render",
        "export_tool",
        "render_tool",
        "render_profile",
        "targets"
      ],
      "properties": {
        "initial_cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "source_render": {
          "$ref": "common.defs.schema.json#/$defs/RenderRef"
        },
        "export_tool": {
          "type": "string",
          "enum": [
            "export.pptx_from_cdr",
            "export.docx_from_cdr",
            "export.xlsx_layout_from_cdr"
          ]
        },
        "render_tool": {
          "type": "string",
          "enum": [
            "render.pptx_to_png",
            "render.docx_to_png",
            "render.xlsx_to_png"
          ]
        },
        "render_profile": {
          "$ref": "common.defs.schema.json#/$defs/RenderProfile"
        },
        "targets": {
          "type": "object",
          "required": [
            "pixel_threshold",
            "max_iterations"
          ],
          "properties": {
            "pixel_threshold": {
              "type": "number",
              "minimum": 0,
              "default": 0
            },
            "max_iterations": {
              "type": "integer",
              "minimum": 1,
              "maximum": 200,
              "default": 25
            }
          },
          "additionalProperties": false
        },
        "degrade_policy": {
          "type": "object",
          "properties": {
            "allow_font_substitution": {
              "type": "boolean",
              "default": true
            },
            "allow_element_rasterize": {
              "type": "boolean",
              "default": true
            },
            "max_rasterized_elements": {
              "type": "integer",
              "minimum": 0,
              "maximum": 50,
              "default": 2
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/repair.loop_controller.output.json",
  "title": "Repair Loop Controller (Export+Render+Verify+Repair) - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "repair.loop_controller"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "final_artifact",
        "final_cdr_design",
        "final_diff",
        "iterations",
        "degraded"
      ],
      "properties": {
        "final_artifact": {
          "$ref": "common.defs.schema.json#/$defs/ArtifactRef"
        },
        "final_cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "final_diff": {
          "$ref": "common.defs.schema.json#/$defs/DiffRef"
        },
        "iterations": {
          "type": "integer",
          "minimum": 0
        },
        "degraded": {
          "type": "boolean"
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## expr.gui_to_tir
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/expr.gui_to_tir.input.json",
  "title": "Convert Expression GUI Events to Transform IR (T-IR) - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "expr.gui_to_tir"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "ui_events",
        "dataset"
      ],
      "properties": {
        "ui_events": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "required": [
              "op",
              "ts"
            ],
            "properties": {
              "op": {
                "type": "string",
                "enum": [
                  "select_columns",
                  "rename_column",
                  "filter",
                  "derive_column",
                  "split_column",
                  "merge_columns",
                  "group_by",
                  "join",
                  "pivot",
                  "unpivot",
                  "sort",
                  "cast_type"
                ]
              },
              "ts": {
                "$ref": "common.defs.schema.json#/$defs/ISODateTime"
              },
              "args": {
                "type": "object",
                "additionalProperties": true
              }
            },
            "additionalProperties": false
          }
        },
        "dataset": {
          "$ref": "common.defs.schema.json#/$defs/CdrDataRef"
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/expr.gui_to_tir.output.json",
  "title": "Convert Expression GUI Events to Transform IR (T-IR) - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "expr.gui_to_tir"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "tir",
        "tir_ref"
      ],
      "properties": {
        "tir": {
          "type": "object",
          "required": [
            "tir_id",
            "version",
            "steps"
          ],
          "properties": {
            "tir_id": {
              "type": "string",
              "minLength": 8,
              "maxLength": 128
            },
            "version": {
              "type": "string",
              "enum": [
                "1.0"
              ]
            },
            "steps": {
              "type": "array",
              "minItems": 1,
              "items": {
                "type": "object",
                "required": [
                  "step_id",
                  "op"
                ],
                "properties": {
                  "step_id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 64
                  },
                  "op": {
                    "type": "string",
                    "enum": [
                      "select_columns",
                      "rename_column",
                      "filter",
                      "derive_column",
                      "split_column",
                      "merge_columns",
                      "group_by",
                      "join",
                      "pivot",
                      "unpivot",
                      "sort",
                      "cast_type"
                    ]
                  },
                  "depends_on": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "default": []
                  },
                  "params": {
                    "type": "object",
                    "additionalProperties": true
                  }
                },
                "additionalProperties": false
              }
            }
          },
          "additionalProperties": false
        },
        "tir_ref": {
          "type": "object",
          "required": [
            "tir_id"
          ],
          "properties": {
            "tir_id": {
              "type": "string"
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## fonts.embed_full_glyph
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/fonts.embed_full_glyph.input.json",
  "title": "Embed Full Glyph Fonts (Strict) - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "fonts.embed_full_glyph"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "font_plan",
        "embed_policy"
      ],
      "properties": {
        "font_plan": {
          "$ref": "common.defs.schema.json#/$defs/FontPlan"
        },
        "embed_policy": {
          "type": "object",
          "properties": {
            "embed_all_glyphs": {
              "type": "boolean",
              "default": true
            },
            "subset_if_large": {
              "type": "boolean",
              "default": false
            },
            "max_subset_size_bytes": {
              "type": "integer",
              "minimum": 1024,
              "default": 5000000
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/fonts.embed_full_glyph.output.json",
  "title": "Embed Full Glyph Fonts (Strict) - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "fonts.embed_full_glyph"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "font_plan"
      ],
      "properties": {
        "font_plan": {
          "$ref": "common.defs.schema.json#/$defs/FontPlan"
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## render.validate_determinism
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/render.validate_determinism.input.json",
  "title": "Validate Deterministic Rendering (Parity) - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "render.validate_determinism"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "renders",
        "checks"
      ],
      "properties": {
        "renders": {
          "type": "array",
          "minItems": 2,
          "items": {
            "$ref": "common.defs.schema.json#/$defs/RenderRef"
          }
        },
        "checks": {
          "$ref": "common.defs.schema.json#/$defs/DeterminismCheck"
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/render.validate_determinism.output.json",
  "title": "Validate Deterministic Rendering (Parity) - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "render.validate_determinism"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "pass",
        "check_report"
      ],
      "properties": {
        "pass": {
          "type": "boolean"
        },
        "check_report": {
          "type": "object",
          "required": [
            "gpu_cpu_parity",
            "anti_aliasing_policy",
            "random_seed_locked"
          ],
          "properties": {
            "gpu_cpu_parity": {
              "type": "boolean"
            },
            "anti_aliasing_policy": {
              "type": "boolean"
            },
            "random_seed_locked": {
              "type": "boolean"
            },
            "notes": {
              "type": "string",
              "maxLength": 2000
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## verify.structural_equivalence
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/verify.structural_equivalence.input.json",
  "title": "Verify Structural/Editability Equivalence (Dual Gate) - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "verify.structural_equivalence"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "artifact",
        "cdr_design",
        "requirements"
      ],
      "properties": {
        "artifact": {
          "$ref": "common.defs.schema.json#/$defs/ArtifactRef"
        },
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "requirements": {
          "type": "object",
          "properties": {
            "require_text_editable": {
              "type": "boolean",
              "default": true
            },
            "require_tables_structured": {
              "type": "boolean",
              "default": true
            },
            "allow_decorative_raster": {
              "type": "boolean",
              "default": true
            },
            "max_rasterized_elements": {
              "type": "integer",
              "minimum": 0,
              "default": 2
            },
            "element_count_tolerance": {
              "type": "integer",
              "minimum": 0,
              "default": 0
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/verify.structural_equivalence.output.json",
  "title": "Verify Structural/Editability Equivalence (Dual Gate) - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "verify.structural_equivalence"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "pass",
        "report",
        "structural_hashes"
      ],
      "properties": {
        "pass": {
          "type": "boolean"
        },
        "structural_hashes": {
          "$ref": "common.defs.schema.json#/$defs/HashBundle"
        },
        "report": {
          "type": "object",
          "required": [
            "editable_text_ratio",
            "structured_table_ratio",
            "rasterized_elements"
          ],
          "properties": {
            "editable_text_ratio": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "structured_table_ratio": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "rasterized_elements": {
              "type": "integer",
              "minimum": 0
            },
            "missing_elements": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "default": []
            },
            "notes": {
              "type": "string",
              "maxLength": 2000
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## hash.compute_cdr_hashes
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/hash.compute_cdr_hashes.input.json",
  "title": "Compute Hashes for CDR (Layout/Structural/Typography) - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "hash.compute_cdr_hashes"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "cdr_design"
      ],
      "properties": {
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "include_perceptual": {
          "type": "boolean",
          "default": true
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/hash.compute_cdr_hashes.output.json",
  "title": "Compute Hashes for CDR (Layout/Structural/Typography) - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "hash.compute_cdr_hashes"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "hashes"
      ],
      "properties": {
        "hashes": {
          "$ref": "common.defs.schema.json#/$defs/HashBundle"
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## expr.gui_to_mir
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/expr.gui_to_mir.input.json",
  "title": "Convert Expression GUI Events to Metric IR (M-IR) - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "expr.gui_to_mir"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "ui_events",
        "semantic_model"
      ],
      "properties": {
        "ui_events": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "required": [
              "op",
              "ts"
            ],
            "properties": {
              "op": {
                "type": "string",
                "enum": [
                  "create_measure",
                  "create_calc_column",
                  "time_intelligence",
                  "format_measure"
                ]
              },
              "ts": {
                "$ref": "common.defs.schema.json#/$defs/ISODateTime"
              },
              "args": {
                "type": "object",
                "additionalProperties": true
              }
            },
            "additionalProperties": false
          }
        },
        "semantic_model": {
          "$ref": "common.defs.schema.json#/$defs/UUID"
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/expr.gui_to_mir.output.json",
  "title": "Convert Expression GUI Events to Metric IR (M-IR) - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "expr.gui_to_mir"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "mir",
        "mir_ref"
      ],
      "properties": {
        "mir": {
          "type": "object",
          "required": [
            "mir_id",
            "version",
            "measures"
          ],
          "properties": {
            "mir_id": {
              "type": "string",
              "minLength": 8,
              "maxLength": 128
            },
            "version": {
              "type": "string",
              "enum": [
                "1.0"
              ]
            },
            "measures": {
              "type": "array",
              "minItems": 1,
              "items": {
                "type": "object",
                "required": [
                  "name",
                  "expression"
                ],
                "properties": {
                  "name": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                  },
                  "expression": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 4000
                  },
                  "format": {
                    "type": "string",
                    "maxLength": 128
                  },
                  "depends_on": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "default": []
                  }
                },
                "additionalProperties": false
              }
            }
          },
          "additionalProperties": false
        },
        "mir_ref": {
          "type": "object",
          "required": [
            "mir_id"
          ],
          "properties": {
            "mir_id": {
              "type": "string"
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## expr.mir_to_dax
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/expr.mir_to_dax.input.json",
  "title": "Translate Metric IR (M-IR) to DAX - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "expr.mir_to_dax"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "mir"
      ],
      "properties": {
        "mir": {
          "type": "object",
          "required": [
            "mir_id",
            "version",
            "measures"
          ],
          "properties": {
            "mir_id": {
              "type": "string",
              "minLength": 8,
              "maxLength": 128
            },
            "version": {
              "type": "string",
              "enum": [
                "1.0"
              ]
            },
            "measures": {
              "type": "array",
              "minItems": 1,
              "items": {
                "type": "object",
                "required": [
                  "name",
                  "expression"
                ],
                "properties": {
                  "name": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                  },
                  "expression": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 4000
                  },
                  "format": {
                    "type": "string",
                    "maxLength": 128
                  },
                  "depends_on": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "default": []
                  }
                },
                "additionalProperties": false
              }
            }
          },
          "additionalProperties": false
        },
        "dax_dialect": {
          "type": "string",
          "enum": [
            "powerbi",
            "ssas"
          ],
          "default": "powerbi"
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/expr.mir_to_dax.output.json",
  "title": "Translate Metric IR (M-IR) to DAX - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "expr.mir_to_dax"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "dax_code",
        "measure_map"
      ],
      "properties": {
        "dax_code": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200000
        },
        "measure_map": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "name",
              "dax"
            ],
            "properties": {
              "name": {
                "type": "string"
              },
              "dax": {
                "type": "string"
              }
            },
            "additionalProperties": false
          }
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

---

## 7) ملحق 6: World-Class Upgrade Blueprint
<a id="7-ملحق-6-world-class-upgrade-blueprint"></a>

# World-Class Upgrade Blueprint (محركات المنصة — تفعيل + رفع المستوى العالمي)

> Generated: 2026-03-08T22:46:44.032698Z

هذا المستند يركّز على **تفعيل** و**تعميق** كل محرك حتى يصل لمستوى عالمي في:  
1) **المطابقة البصرية STRICT (Pixel-0)**، 2) **الفعالية على بيانات ضخمة**، 3) **ذكاء AI عملي**، 4) **عروض/تقارير/لوحات Premium**.

---

## 1) Strict Replication Engine — رفع المطابقة إلى معيار عالمي

### 1.1 Governance of Visual Parity (حكم المطابقة)
- بوابة فرق البكسل (Pixel Difference Gate) + عتبة تفاوت قابلة للضبط.
- إلزامية اجتياز **اختبار مقارنة البكسل + اختبار تشابه التجزئة الهيكلية**.
- دعم مقارنة ترتيب تقييم الصيغ (formula evaluation) + مقارنة Floating-point drift.
- محرك كشف الفروقات والانحراف (Diff & Drift Engine).

### 1.2 Deterministic Rendering Farm (إلزامي)
- قفل DPI + sRGB + anti-aliasing + بصمة محرك التصيير.
- تحقق GPU/CPU parity + floating-point normalization policy.
- عمال Render بدون حالة (stateless workers) + صفوف أولوية للمهام.

### 1.3 Root-cause driven repair loop
- Attribution: يحدد سبب الفرق (text metrics / baseline / crop / stroke…)
- Targeted fixes + quantization (EMU/pixel snapping) قبل أي إصلاح.
- Degrade آخر حل: rasterize عنصر زخرفي صغير فقط (لا يمس النص/الجدول/البيانات).

---

## 2) Data/Lakehouse Engine — “Extreme data” واقعية

### 2.1 Columnar + Embedded analytics
- Columnar Arrow memory.
- Embedded analytical engine (DuckDB-class).
- Real-time engine (ClickHouse-class).
- Pre-aggregation + Materialized views.
- Billion-row support.
- Incremental refresh.

### 2.2 Performance governors
- Workload prediction + resource reservation.
- Parallel DAG optimizer.
- Circuit breaker (3-state) + backpressure.
- Caching strategy + cache invalidation strategy.
- Queue-based ingestion + enterprise-scale batch conversion.

---

## 3) Excel Engine — من “ملف” إلى “آلة تنفيذ”

### 3.1 Spreadsheet Virtual Machine (SVM)
- Formula DAG.
- LET / LAMBDA.
- Pivot geometry lock.
- Conditional formatting clone.
- Freeze panes.
- Chart anchor mapping.
- Streaming pivot reconstruction.

### 3.2 GUI Expressions (Power Query + DAX) بطريقة مبسطة
- Transform IR (T-IR) + Metric IR (M-IR).
- GUI Blocks: filter/derive/join/group/pivot/measure…
- Preview execution على sample ثم apply على كامل البيانات.
- تصدير تلقائي إلى Power Query (M) + DAX.

### 3.3 Auto formatting & Arabic Excel polish
- تثبيت صف العناوين تلقائيًا.
- تلوين رؤوس الأعمدة بألوان احترافية.
- اختيار خطوط احترافية مناسبة + خطوط عربية احترافية.
- ضبط عرض الأعمدة تلقائيًا حسب المحتوى.
- اتجاه RTL تلقائيًا + تنسيق أرقام عربي عند الحاجة.

---

## 4) Dashboard Engine — حي + قابل للمقارنة + سريع

### 4.1 Builder محترف
- دعم Drill Down.
- فلاتر عامة للوحة بالكامل.
- Full Manual Override Dashboard.
- Auto Dashboard mode.
- تحويل أي Dashboard إلى تقرير.

### 4.2 Observability + SLAs/SLOs
- لوحات مراقبة (Observability dashboards).
- تحديد أهداف مستوى الخدمة (SLOs) لزمن تحميل اللوحة، توليد التقرير، تحديث الشريحة.
- محاكاة عشرات آلاف المستخدمين المتزامنين للداشبورد.

---

## 5) Reports Engine — جدولة + مقارنة + تحديث حي

- جدولة التقارير + مصمم تقارير.
- مقارنة نسختين/فترتين/تقارير متعددة + إصدار تقرير فروقات.
- عند إنشاء Dashboard يقترح تقريرًا وعرضًا مطابقين.
- عند قرب اجتماع/نشر دوري يقترح تحديث النسخة وتجهيز العرض.

---

## 6) Presentation & Infographic Engine — يتجاوز Gamma فعليًا

- شرائح ذكية للمحتوى الديناميكي (charts/diagrams/illustrations).
- عروض غير خطية قابلة للتقريب والتكبير.
- انتقالات سينمائية + دعم Animations على العناصر.
- إدراج رسوم بيانية تفاعلية في الشرائح.
- مكتبة كاملة من شرائح البيانات + تحويل جداول البيانات إلى شرائح متحركة.
- توليد speaker notes + تلخيص/توسيع/إعادة صياغة.
- تطبيق Brand kit (ألوان/خطوط/شعارات) + مطابقة تصميم عرض مع آخر بنقرة واحدة.
- ترجمة إلى 100+ لغة (مع الحفاظ على التصميم).

---

## 7) AI Engine — “يساعد ولا يتحكم” لكن ينفّذ بذكاء

- AI متوافق مع MCP للاستعلام عن المقاييس مباشرة دون مغادرة المنصة.
- تحويل الأوامر النصية إلى تحليلات/تقارير/لوحات/عروض.
- وضعان دائمًا: Auto (زر واحد) + Guided (أسئلة حد أدنى).
- RAG محايد مع عزل تام لكل منتج (product isolation).

---

## 8) Module Isolation & Governance (Enterprise-grade)
- منع الترابط الخفي بين الوحدات.
- ترقية قاعدة بيانات وحدة واحدة دون تأثير على البقية.
- Audit trail + execution snapshots + policy binding.

---

## 9) What to implement next (بدون ترتيب زمني)
- Triple Verification Gate (pixel + structural hash + semantic consistency).
- Diff & Drift Engine موحّد (design + data + formulas).
- SVM كـ core engine مع deterministic recalc + drift checks.
- Conversion Matrix عالمي (any-to-any) مبني على CDR singularity.

---


---

<a id="sec-02"></a>
# وثيقة المتطلبات الكاملة للمنصة (World‑Class Requirements)
> نسخة متطلبات تنفيذية — بدون أي تقسيمات زمنية أو أولوية  
> Generated: 2026-03-08T22:52:41.462655Z

هذه الوثيقة هي **مرجع المتطلبات الوحيد** لبناء منصة عالمية تعتمد على **Canvas واحد** و**ذكاء اصطناعي يقود التنفيذ**، وتقدم:
- **مطابقة بصرية STRICT 100% (Pixel‑Perfect)** عند التحويل بين الصيغ (Any‑to‑Any).
- مخرجات **قابلة للتعديل** (Editable) قدر الإمكان مع سياسات Degrade منضبطة (Never‑Fail).
- محرك Excel/بيانات متقدم (Expressions + Power Query + DAX + SVM).
- محرك تحليل عميق + توليد لوحات وتقارير وعروض بضغطة واحدة.
- نظام مستخدمين/مجموعات/صلاحيات/حَوْكمة/تدقيق/مركز تدريب/إعدادات وتخصيص كامل.
- واجهة Premium + Motion + بساطة قصوى: Canvas + Panel جانبي واحد.

---

## 0) المصطلحات (Glossary)
- **Canvas**: واجهة العمل الوحيدة لعرض/تحرير/بناء التصميم والبيانات والنتائج.
- **STRICT Visual Replication**: التزام بصري 100% (Pixel‑0 أو ε ثابت داخل Farm) مع محاذاة مطلقة (Absolute layout) وعدم تدفق (No reflow).
- **Editable**: النص نص، الجدول جدول، المخطط مخطط مرتبط ببيانات… وليس صورة شاملة.
- **Any‑to‑Any**: أي مصدر (PDF/صورة/Word/Excel/PPT…) إلى أي هدف (PPTX/DOCX/XLSX/Dashboard/…).
- **CDR‑Design**: تمثيل داخلي موحد للتصميم (7 طبقات) يضمن الدقة والتحكم والقياس.
- **CDR‑Data**: تمثيل داخلي موحد للبيانات (جداول/أنواع/إحصاءات/روابط/Lineage).
- **SVM (Spreadsheet Virtual Machine)**: محرك تنفيذ Excel داخلي (Formula DAG/LET/LAMBDA/Recalc determinism…).
- **IR**: Intermediate Representation للعمليات:
  - **T‑IR** لتحويلات البيانات (Power Query‑like).
  - **M‑IR** لمقاييس/Measures (DAX‑like).
- **Deterministic Rendering Farm**: بيئة تصيير ثابتة لضمان/اختبار التطابق البصري.
- **Triple Verification Gate**: بوابات قبول STRICT: Pixel + Structural + Drift (للصيغ/الحساب/float).
- **Never‑Fail**: المنصة لا تُرجع “فشل” للمستخدم؛ دائمًا تُسلم نتيجة مع تحذيرات/خفض مُدار.
- **Degrade**: خفض مُدار (مثل بديل خط أو Rasterize عنصر زخرفي صغير أو Synthetic data للداشبورد).

---

## 1) الهدف والوعود (Product Constitution)
### 1.1 الوعود غير القابلة للتنازل
1) **STRICT 100% بصريًا**: الناتج مطابق بصريًا للمصدر ضمن Farm حتمية (Deterministic).  
2) **Editable Coverage عالي**: المحافظة على قابلية التحرير للمحتوى الأساسي (نص/جداول/بيانات/مخططات) قدر الإمكان.  
3) **Never‑Fail**: أي عملية تعيد Artifact نهائي (PPTX/DOCX/XLSX/Dashboard/…).
4) **Canvas واحد**: لا صفحات متعددة؛ فقط Canvas + Panel جانبي واحد قابل للإخفاء.
5) **AI‑First**: كل شيء يمكن طلبه من Canvas بالوصف الطبيعي، مع وضعين: Auto / Guided.

### 1.2 سياسات خفض مُدارة (Degrade Policy)
- **مسموح**:
  - بديل خط عند غياب الخط الأصلي مع إخطار قبل التسليم.
  - Rasterize **عنصر زخرفي صغير فقط** كحل أخير لتحقيق Pixel‑Perfect (لا يشمل النص/الجداول/البيانات).
  - Synthetic/Placeholder data للداشبورد عند غياب البيانات.
- **غير مسموح**:
  - تسليم “شرائح كلها صور” إذا كان الهدف Editable (إلا إذا طلب المستخدم صراحة “صورة فقط”).

### 1.3 معايير قبول STRICT (Acceptance Criteria)
- **Pixel Gate**: PixelDiff = 0 (أو ε ثابت مُعتمد) ضمن نفس Farm ونفس fingerprint.  
- **Structural Gate**: تحقق قابلية التحرير (نص/جداول/مخططات) ونِسَب تغطية قابلة للقياس.  
- **Drift Gate**: للـExcel/BI: تطابق النتائج الحسابية ضمن tolerance ثابت (مثلاً 1e‑6) + كشف drift في floating‑point.  
- **Determinism Gate**: GPU/CPU parity + anti‑aliasing lock + seed lock + fingerprint ثابت.

---

## 2) نطاق المنصة (Scope)
### 2.1 المدخلات (Inputs)
- PDF (نصي/متجه/ممسوح Scan)
- صور (PNG/JPG/WebP) بما فيها صور جداول وتقارير
- PPTX / DOCX / XLSX / CSV
- ZIP/Folder (حزم ملفات)
- موصلات (Integrations): Google Drive / OneDrive / SharePoint / S3 / DBs / BI (قابلة للتوسع)

### 2.2 المخرجات (Outputs)
- PowerPoint (PPTX) editable
- Word (DOCX) editable (Layout‑absolute في STRICT)
- Excel (XLSX) editable (جداول + صيغ + Pivot/CF قدر الإمكان)
- Dashboards (Web) حيّة (Filters/Drill/Export/Refresh)
- PDF / PNG للمعاينة/التصدير
- Recipes/Workflows (وصفات تحويل وتحليل قابلة للمشاركة)

---

## 3) تجربة المستخدم (UI/UX) — Canvas واحد
### 3.1 الشاشة الرئيسية
- Canvas مركزي لعرض/تحرير:
  - تصميم (شرائح/صفحات/لوحات)
  - بيانات (جداول/أعمدة/علاقات)
  - نتائج (Dashboards/Reports/Decks)
- Panel جانبي واحد قابل للإخفاء:
  - Library (ملفات/نتائج/وصفات)
  - Projects / Workspaces
  - Brand & Preferences
  - Templates (Slides/Dashboards/Reports)
  - History (مختصر) + عمليات محفوظة

### 3.2 أوامر موحدة (Command Bar)
- إدخال نصي + دعم ملفات + أوامر سريعة:
  - “حوّل هذا PDF إلى PPTX 1:1 editable”
  - “استخرج الجدول من هذه الصورة إلى Excel editable”
  - “حلل هذه الملفات واصنع Dashboard + عرض تقديمي”
  - “ادمج الأعمدة X,Y,Z عبر 200 ملف”

### 3.3 وضعين تشغيل
- **Auto Mode**: تنفيذ كامل تلقائيًا.
- **Guided Mode**: أسئلة قصيرة خطوة‑بخطوة عند الغموض (سؤال واحد في كل مرة).

### 3.4 Premium UI + Motion
- انتقالات سلسة، drag previews، progress overlays على Canvas.
- تصميم Premium (typography/padding/shadows) + Dark/Light.
- قابلية تخصيص: حجم خطوط، كثافة UI، اختصارات لوحة المفاتيح.

---

## 4) معمارية النظام (Architecture Requirements)
### 4.1 Kernel ثابت
- Action Graph Runtime (تنفيذ كل العمليات كـActions)
- Tool Registry (تسجيل الأدوات بعقود Input/Output/Policies)
- Policy Engine (أمان/خصوصية/مسموح/محظور)
- Audit & Lineage (سجل تدقيق + نسب بيانات/نتائج)
- Cache + Artifact Store + Metadata Store

### 4.2 Engines (محركات قابلة للتركيب)
1) Strict Replication Engine
2) Deterministic Rendering Farm
3) Arabic Typography Engine (BASIC/PRO/ELITE)
4) Excel/SVM Engine
5) Expressions Engine (T‑IR/M‑IR) + GUI Blocks
6) Data/Lakehouse Engine (Columnar + Query + Materialized Views)
7) Insight Engine (Relationship discovery + profiling + narrative)
8) Dashboard Engine (Interactive + bindings + synthetic data)
9) Reports Engine (Scheduling + diff + publish)
10) Presentation Engine (Generator + motion + infographic)
11) Translation Engine (حفظ التصميم أثناء الترجمة)
12) Training Center Engine (تعلم/تمارين/مختبر)

---

## 5) محرك STRICT Replication (Pixel‑Perfect 100%)
### 5.1 مبادئ التنفيذ
- Native extraction أولًا (PDF DOM) قبل OCR.
- CDR‑Design absolute + no reflow.
- Exporters deterministic‑friendly.
- Triple Verification Gate + Repair loop موجه بالأسباب (Root‑cause repair).

### 5.2 Pipeline عام (Any Input → Any Output)
1) Ingest + Extract (DOM/segments)
2) Build CDR‑Design (+ CDR‑Data إذا جداول/مخططات)
3) Fonts plan + Arabic shaping (حسب arabic_mode)
4) Quantize geometry (EMU/pixel snapping)
5) Export target (PPTX/DOCX/XLSX/Dashboard)
6) Render source + render target في Farm
7) Verify gates
8) Diagnose causes
9) Repair loop حتى pass أو Degrade policy
10) Deliver artifact + warnings مختصرة

### 5.3 متطلبات OCR/الرؤية
- OCR يُستخدم فقط عندما النص غير متاح Native.
- دعم استخراج جداول من صور مع merges/borders/styles.
- حفظ ثقة OCR لكل خلية، وتفعيل Guided mode عند تدني الثقة.

---

## 6) Deterministic Rendering Farm (حتمية التصيير)
### 6.1 متطلبات
- قفل: DPI، colorspace=sRGB، anti‑aliasing، font pack، engine versions.
- توفير fingerprint لكل render.
- تحقق parity GPU/CPU.
- Stateless workers + queue + backpressure + retries.
- دعم multi‑page وpage ranges.

### 6.2 مخرجات
- RenderRef لكل صفحة/شريحة/لوحة.
- Diff heatmaps داخلية (لا تظهر للمستخدم إلا عند الطلب أو في الـAdmin).

---

## 7) Arabic Typography Engine (تعريب ELITE)
### 7.1 مستويات
- BASIC: RTL + shaping أساسي.
- PROFESSIONAL: line breaks + baseline + spacing مضبوط.
- ELITE: justification/kashida عند الحاجة، دعم mixed scripts، أرقام عربية/لاتينية حسب السياق، اتجاه الجداول/المخططات/المحاور/الفلاتر.

### 7.2 متطلبات صارمة
- Metrics lock: قياس glyphs ثابت متطابق مع محرك التصيير.
- منع auto‑fit وإعادة التدفق في STRICT.

---

## 8) Fonts Vault (مكتبة خطوط عالمية)
### 8.1 خصائص
- تخزين خطوط المنظمة + خطوط خاصة بالمستخدم/العميل.
- ترخيص/وصف/معلومات مصدر الخط (Metadata).
- Embedding: full glyph embedding في STRICT (أو subset إذا سياسة المؤسسة تسمح).
- Font substitution: اختيار أقرب خط عبر metrics parity + تغطية glyphs.

### 8.2 سلوك “غياب الخط” (Never‑Fail)
- استمرار التنفيذ مع بديل.
- إشعار قبل التسليم: الخط الأصلي، البديل، التأثير المتوقع.

---

## 9) Image/Table → Excel Editable (1‑Click Table Engine)
### 9.1 متطلبات
- استخراج grid + merges + borders + fills + font styles + alignment.
- كتابة القيم في خلايا Excel قابلة للتعديل.
- Render XLSX ومقارنته بالصورة ضمن Pixel Gate.
- إصلاح widths/heights/padding عبر repair loop.

### 9.2 مخرجات
- XLSX editable + table_range + quality metrics (داخلي).

---

## 10) Excel Engine + SVM (Spreadsheet Virtual Machine)
### 10.1 متطلبات SVM
- Formula DAG + deterministic recalc.
- دعم LET/LAMBDA (نطاق مستهدف قابل للتوسع).
- Pivot reconstruction + pivot geometry lock.
- Conditional formatting clone.
- Freeze panes/filters.
- Chart anchor mapping (ربط الرسم بالخلايا).
- Drift checks: مقارنة نتائج الحساب مع tolerance ثابتة.

### 10.2 مخرجات
- XLSX editable مطابق بصريًا في STRICT (حسب نوع المحتوى).
- Model snapshots لإعادة التشغيل (Repro packs).

---

## 11) Expressions Engine (Power Query + DAX) بواجهة مبسطة
### 11.1 Transform IR (T‑IR)
- عمليات: select/rename/filter/derive/split/merge/group/join/pivot/unpivot/sort/cast.
- Preview execution سريع (sample) ثم apply على كامل البيانات.
- تصدير Power Query (M) تلقائيًا.

### 11.2 Metric IR (M‑IR)
- إنشاء Measures/Calculated columns.
- قوالب Time intelligence.
- تصدير DAX تلقائيًا.

### 11.3 GUI Blocks
- Blocks بسيطة مع خصائص واضحة، تتحول إلى IR.
- Undo/redo كامل + وصف Recipe قابل للمشاركة.

---

## 12) Data/Lakehouse Engine (بيانات ضخمة عالمية)
### 12.1 التخزين والمعالجة
- تحويل كل البيانات إلى columnar (Arrow/Parquet) داخليًا.
- محرك استعلام تحليلي مدمج + محرك أداء عالي للتوسع.
- Materialized views + incremental refresh.
- إدارة أحمال: resource reservation + circuit breakers + parallel DAG optimizer.

### 12.2 Catalog وفهرسة الأعمدة
- Column fingerprints + semantic embeddings.
- بحث أعمدة بالوصف الطبيعي.
- اقتراح joins/keys تلقائيًا.

---

## 13) Insight Engine (تحليل عميق + ربط ذكي)
### 13.1 قدرات إلزامية
- Profiling (stats/anomalies/trends)
- Relationship discovery (joins/keys)
- Entity resolution (dedupe/merge)
- KPI suggestions + metric synthesis
- Insight Graph كمخرج موحد

### 13.2 تحويل insight إلى نتائج مباشرة
- Insight → Dashboard plan → Dashboard حي
- Insight → Storyboard → Slides deck
- Insight → Report (Word/PDF) + Diff reports بين فترات

---

## 14) Dashboard Engine (لوحات حيّة)
### 14.1 متطلبات تفاعل
- Filters (global + per‑visual)
- Cross‑filtering
- Drill down / drill through
- Export (PDF/PPTX/PNG/CSV)
- Refresh/incremental refresh
- Saved states + share links (حسب ACL)

### 14.2 عند غياب البيانات (حسب قرار المنتج)
- توليد Synthetic dataset مطابق لشكل اللوحة.
- ربط جميع visuals بالبيانات التجريبية لتعمل فورًا.
- Hook لاستبدال المصدر لاحقًا (mapping placeholder→real).

---

## 15) Reports Engine (تقارير + جدولة + فروقات)
### 15.1 المتطلبات
- مصمم تقارير (Layouts + tables + charts)
- Scheduling (حسب workspace policies)
- Diff report: مقارنة تقريرين/فترتين مع إبراز التغيرات
- Publish pipeline: draft→review→publish
- تحويل التقرير إلى Dashboard أو Slides بضغطة واحدة

---

## 16) Presentation Engine (يتجاوز Gamma عالميًا)
### 16.1 مولّد عروض Data‑First
- توليد من: وصف/ملف/بيانات/Insights/Report/Dashboard.
- Storyboard + smart layouts + brand kit.
- Motion plan + animations على العناصر (اختياري).
- Non‑linear / Zoomable decks (اختياري).
- Speaker notes + ملخصات متعددة الأساليب.

### 16.2 Strict vs Pro
- STRICT: لا تغيير تصميم المصدر.
- PRO: تحسين/إبداع/إعادة تصميم ضمن قواعد brand + جودة.

---

## 17) Translation Engine (ترجمة مع الحفاظ على التصميم)
### 17.1 متطلبات
- ترجمة النصوص مع الحفاظ على layout قدر الإمكان.
- عند تجاوز طول النص: قواعد إعادة توزيع “غير STRICT” إلا إذا طلب المستخدم STRICT.
- دعم العربية ELITE في الترجمة.

---

## 18) AI Orchestrator (ذكاء اصطناعي في كل مكان)
### 18.1 مبادئ
- AI لا ينفذ مباشرة؛ ينفذ عبر Tool Registry + Action Graph.
- Plan → (Guided questions عند الحاجة) → Execute → Deliver.
- RAG مع عزل كامل لكل workspace/tenant (no data leakage).

### 18.2 قدرات أساسية
- فهم الأوامر النصية وتحويلها إلى graphs.
- اقتراح أفضل مسار (STRICT/PRO/Degrade) وفق السياسات.
- شرح مختصر للمستخدم: ماذا تم إنجازه + تحذيرات فقط.
- Prompt gallery + recipes جاهزة + توصيات تلقائية.

### 18.3 السلامة والحَوْكمة
- Policy binding لكل Action (PII, connectors, export rules).
- Audit trail كامل للأوامر والأدوات المستدعاة.

---

## 19) Library / Projects / Versioning (مكتبة المستخدم)
### 19.1 كائنات أساسية
- Workspace → Project → Assets → Artifacts (Deck/Report/Dashboard/Table/Recipe).
- Versioning لكل Artifact + restore/rollback.
- Tags + Search + Favorites.

### 19.2 تفضيلات المستخدم والـBrand Kit
- Fonts/palettes/logo/spacing presets.
- Learn from edits (اختياري) لتثبيت تفضيلات شخصية.

---

## 20) Training Center (مركز تدريب/مختبر)
### 20.1 المتطلبات
- Tutorials داخل Canvas (guided overlays).
- أمثلة جاهزة (PDF→PPTX strict، صورة جدول→Excel…).
- Sandbox datasets.
- Prompt academy + Recipes library.
- تقييم بسيط: “هل وصلت Pixel‑Perfect؟” + قياس جودة التحليل.

---

## 21) الحسابات والهوية (Auth)
### 21.1 التسجيل وتسجيل الدخول
- Email + Password
- Social login (اختياري) OAuth
- SSO للمؤسسات (SAML/OIDC) (اختياري لكن مفضل عالميًا)
- MFA (OTP/WebAuthn) (قابل للتفعيل من إعدادات المؤسسة)

### 21.2 استرجاع كلمة المرور
- Reset link + expiration
- منع brute force + rate limits
- إشعارات أمنية عند تغيير كلمة مرور

### 21.3 إدارة الجلسات
- Tokens + refresh
- Device/session list + revoke
- Idle timeout policy per org

---

## 22) الأعضاء/المجموعات/الصلاحيات (RBAC/ABAC) — أدق تفصيل
### 22.1 النطاق الهرمي
- Organization
- Workspace
- Project
- Asset/Artifact/Recipe
- Connector/Data source
- Tool/Feature

### 22.2 مفاهيم
- **Roles**: أدوار جاهزة (Owner/Admin/Editor/Viewer/Analyst/Operator…).
- **Groups**: مجموعات تُسند لها أدوار أو صلاحيات دقيقة.
- **Permissions**: صلاحيات “إجراء” (Action) + صلاحيات “كائن” (Object) + صلاحيات “بيانات” (Row/Column).

### 22.3 أمثلة صلاحيات دقيقة (Must‑Have)
- تحويل STRICT (تشغيل/منع)
- السماح بـDegrade rasterize
- رفع خطوط / تعديل Font Vault
- استخدام موصلات محددة
- تصدير إلى صيغ محددة
- رؤية/تعديل Dashboards
- نشر/مشاركة links
- تشغيل Schedules
- إنشاء/تعديل Recipes
- استخدام DAX/M transformations
- إدارة مفاتيح API/webhooks
- إدارة سياسات retention والنسخ الاحتياطي

### 22.4 Row/Column Level Security (للبيانات)
- إخفاء أعمدة حساسة لمجموعات محددة.
- فلترة صفوف حسب دور/قسم.
- سياسات masking وتسجيل الوصول.

---

## 23) الإعدادات (Settings) — منصة كاملة
### 23.1 إعدادات المستخدم
- اللغة/المنطقة
- Arabic mode default
- UI density + shortcuts
- Notifications
- Preferences/brand personal

### 23.2 إعدادات Workspace/Org
- Font vault + licensing metadata
- Brand kits الافتراضية
- سياسات STRICT/PRO
- سياسات Degrade
- Data retention + backups
- Allowed exports
- Connectors enable/disable
- Quotas/limits + concurrency
- MFA enforcement
- Audit logs access

---

## 24) الإدارة (Admin Console)
- إدارة المستخدمين/المجموعات/الأدوار
- إدارة السياسات
- إدارة الموصلات والاعتمادات
- مراقبة الأحمال والأداء
- مراقبة معدلات نجاح STRICT (Pixel‑0 rates)
- إدارة النسخ الاحتياطي/الاستعادة
- إدارة مفاتيح API + Webhooks
- إدارة Marketplace/Plugins (إن وجد)

---

## 25) التكاملات (Integrations)
- Storage: Drive/OneDrive/SharePoint/S3
- Databases: Postgres/MySQL/SQL Server/BigQuery/Snowflake…
- BI: Power BI / Looker / Tableau (قابل للتوسع)
- Webhooks: إشعارات عند اكتمال تحويل/تقرير/تحديث

---

## 26) API/SDK/Plugins (قابل للتوسع)
- Tool SDK (JS/Python) لتسجيل أدوات جديدة.
- OpenAPI auto‑docs لأفعال Actions.
- Rate limiting + scopes.
- Plugin isolation + sandbox.

---

## 27) الأمان والخصوصية (Security & Privacy)
- TLS in transit + encryption at rest
- Tenant isolation
- Secrets vault للموصلات
- Audit logs غير قابلة للتلاعب (WORM optional)
- سياسات تصدير بيانات
- Data residency / Sovereign mode (اختياري)
- حماية prompt injection + sandboxed retrieval

---

## 28) Observability & SLOs
- Logs/Metrics/Traces لكل Action
- SLOs:
  - زمن تحويل STRICT (حسب حجم الملف)
  - زمن بناء dashboard
  - زمن preview للـExpressions
  - زمن البحث في الكتالوج
- Circuit breakers + backpressure
- Canary tests + golden sets (regression)

---

## 29) ضمان الجودة (QA) + Regression
- Golden corpus: ملفات PDF/صور/Excel معيارية.
- اختبار Pixel‑Perfect على farm قبل أي نشر.
- اختبار Structural/drift.
- منع release عند تدهور metrics.
- Repro packs لإعادة إنتاج نتيجة قديمة 1:1.

---

## 30) متطلبات “عدم ترك مجال للتفكير” (Executable Requirements)
### 30.1 كل ميزة تُنفذ عبر Actions
- لا يوجد مسار “خارج runtime”.  
- كل أداة لها schema input/output + policies + failure classes + recovery.

### 30.2 كل تحويل STRICT يمر بـTriple Gate + Repair loop
- لا تسليم “STRICT” قبل pass.
- إن تعذر pass: يتم downgrade وفق policy مع تحذير.

### 30.3 أي Dashboard بدون بيانات = synthetic bind إلزامي
- الداشبورد يجب أن يكون “حي” فورًا.

### 30.4 كل عمليات البيانات/الإكسل تُدار بالـIR
- GUI blocks → IR → preview → apply → export (M/DAX اختياري).

---

## 31) ملاحق (References داخلية)
- Tool Registry (v2/v3)
- JSON Schemas للأدوات الحرجة
- قوالب Action Graph القياسية (PDF→PPTX strict، صورة جدول→Excel…)

---

# نهاية الوثيقة


---

<a id="sec-03"></a>
# وثيقة الصرامة والتنفيذ الحقيقي (Implementation Integrity & Anti‑Cheating Requirements)
> نسخة مستقلة من المتطلبات العامة — إلزامية على كل الفرق/الموردين/الذكاء الاصطناعي  
> Generated: 2026-03-08T23:44:13.406775+00:00

هذه الوثيقة تُعرّف **قواعد منع “التنفيذ الوهمي”**، وتفرض **بوابات كشف الغش**، وتُلزم بأن:
- أي ميزة/محرك يُعلن “تم” يجب أن يكون **حقيقيًا، مكتملًا، قابلًا للتشغيل**.
- الاختبارات **فعلية** + **أدلة** (صور/لقطات/تقارير آلية) + **قابلة لإعادة الإنتاج**.
- لا يُسمح بإعلانات كاذبة (“تم التنفيذ”)، ولا “ديمو”، ولا بيانات ثابتة تُقدَّم كبيانات حقيقية.
- التنفيذ يتم **دفعة واحدة** قدر الإمكان، وبأقل أسئلة (Auto-first)، ولا يُسأل المستخدم إلا عند غموض يمنع نتيجة صحيحة.

> **لغة الإلزام**: الكلمات MUST/SHALL = إلزامية، SHOULD = مفضلة، MAY = اختيارية.

---

## 0) التعاريف
- **Code Fake / تنفيذ وهمي**: أي كود/مسار يُظهر نجاحًا دون أن ينفذ الوظيفة فعليًا (stubs، mocks في الإنتاج، TODO، return ثابت، screenshots مزيفة، بيانات ثابتة تُعرض كحقيقية…).
- **Anti‑Cheating Gate**: بوابة آلية تمنع دمج/نشر أي تغيير يحقق “شكل الميزة” دون “حقيقتها”.
- **Evidence Pack**: حزمة أدلة آلية تُرفق مع كل Release/Feature: (نتائج اختبارات + لقطات + baseline diffs + fingerprints).
- **Truthful Status**: لا يُذكر “تم” إلا بعد نجاح البوابات المطلوبة كاملةً.

---

## 1) مبادئ غير قابلة للتفاوض (Non‑negotiable Principles)
- MUST: **لا نجاح صوري**: أي نجاح يجب أن ينتج Artifact/Output قابل للاستخدام الحقيقي.
- MUST: **لا Mock في الإنتاج**: أي mock/fixture في runtime production ممنوع إلا في اختبار/بيئة اختبار صريحة.
- MUST: **لا بيانات ثابتة تُعرض كحقيقية**: أي بيانات غير حقيقية يجب أن تُوسم بوضوح “Synthetic/Test” وتُفصل عن الإنتاج.
- MUST: **لا ادّعاء**: أي رسالة/واجهة/AI Response يجب أن تعكس الحالة الفعلية بعد البوابات.
- MUST: **Reproducible**: كل نتيجة يجب أن يمكن إعادة إنتاجها بنفس المدخلات (Repro Pack).
- MUST: **Auto-first**: النظام يتخذ قرارات افتراضية صحيحة؛ لا يسأل المستخدم إلا عند الحاجة الحقيقية.

---

## 2) سياسة “لا كود وهمي” (No Dummy Code Policy)
### 2.1 ممنوعات إلزامية (Forbidden)
- TODO/FIXME/XXX في المسارات التنفيذية (runtime).
- `NotImplemented`, `pass`, أو return ثابت يزعم نجاحًا.
- واجهات API تعيد success دون أثر حقيقي (no side effects).
- “Demo mode” في الإنتاج (feature flags يجب أن تكون OFF افتراضيًا في prod).
- “Stub render”, “fake verification”, “skip gate” لأي بوابة STRICT/إنتاج.

### 2.2 مسموحات مضبوطة (Allowed)
- Mocks/fixtures فقط داخل:
  - مسارات الاختبار (unit/integration/e2e)
  - أو بيئة sandbox معلّمة بشكل صريح.
- بيانات اختبار:
  - MUST أن تكون منفصلة عن بيانات العملاء
  - MUST أن تُزال/تُعطَّل في production builds
  - MUST أن تُوسم بوضوح.

### 2.3 بوابة كشف الكود الوهمي (Anti‑Dummy Gate)
CI MUST يفشل إذا وجد في production scope:
- كلمات/أنماط: `TODO`, `FIXME`, `NOT IMPLEMENTED`, `stub`, `fake`, `mock` (خارج test dirs)
- endpoints بدون implementation
- feature flags تُشغّل “demo/simulated” في prod

> هذه البوابة تُطبق عبر:
- Static scan (grep rules + AST rules)
- Dependency scan (منع “mocking libs” في runtime bundles)
- Runtime smoke check (يشغل المسارات الأساسية ويتأكد من outputs)

---

## 3) سياسة “لا ادّعاء” للذكاء الاصطناعي (AI Truthfulness Contract)
### 3.1 قواعد الرسائل/الواجهة
- MUST: أي رسالة “تم التحويل/تم إنشاء الداشبورد/تم التحليل” لا تظهر إلا بعد:
  - نجاح تنفيذ الـAction Graph فعليًا
  - وتسجيل artifact_id + fingerprints
- MUST: إظهار تحذير واضح إذا حصل downgrade (مثل بديل خط أو rasterize decorative أو بيانات synthetic).
- MUST: أي تفسير/شرح (Explain) يعتمد على logs/lineage وليس تخمين.

### 3.2 منع “هلوسة التنفيذ” (Execution Hallucination Guard)
- النظام MUST يعتمد على **Execution Snapshot** من Action Runtime كمصدر الحقيقة.
- UI/AI MUST لا يقرأ “النية” كحقيقة؛ الحقيقة = status من runtime + evidence pack.

---

## 4) الاختبارات الإلزامية (Testing Requirements)
### 4.1 أنواع الاختبارات (MUST)
- Unit tests: لكل محرك/مكوّن منطقي.
- Integration tests: pipeline كاملة بين أدوات متعددة.
- E2E tests: من Canvas (رفع ملف) حتى artifact النهائي + فتحه/معاينته.
- Regression tests (Golden sets): مجموعة ملفات مرجعية لا يُسمح بكسرها.
- Performance tests: latency/throughput/concurrency مع SLOs.

### 4.2 اختبارات خاصة بالمطابقة STRICT (MUST)
- Pixel tests:
  - Render source + render target (farm) ثم PixelDiff
  - Heatmap محفوظة
- Structural/Editability tests:
  - النص = TextRuns (ليس صور)
  - الجدول = cells structured
- Determinism tests:
  - نفس input مرتين = نفس fingerprint
  - GPU/CPU parity (أو تفعيل بيئة موحدة تمنع التباين)
- Drift tests (Excel/SVM):
  - نتائج الصيغ ضمن tolerance ثابت
  - مقارنة intermediate steps عند الحاجة

---

## 5) الأدلة (Evidence Pack) — إلزامي مع كل تسليم
كل Feature/Release MUST ينتج Evidence Pack تلقائيًا، يتضمن:
1) **Test report** (unit/integration/e2e/regression)
2) **Screenshots / Renders**:
   - قبل/بعد (source/target) للـSTRICT
   - لقطات Dashboard (صفحة كاملة + حالات فلترة)
3) **Diff Artifacts**:
   - Pixel heatmap
   - Structural report
   - Drift report (للصيغ)
4) **Fingerprints**:
   - engine_fingerprint
   - layout/struct/typography hashes
5) **Repro Pack**:
   - tool versions
   - render farm image id
   - font pack ids
   - policies used
   - request_id/action graph snapshot

> MUST: لا يُسمح بتسليم ميزة دون Evidence Pack محفوظ ومتاح للمراجعة.

---

## 6) بوابات النشر (Release Gates) — منع الغش قبل الوصول للإنتاج
### 6.1 Gate‑0: Build Integrity
- build succeeds
- dependency & license checks succeed
- no forbidden patterns (Section 2.3)

### 6.2 Gate‑1: Test Integrity
- all tests pass
- flaky test detector: أي اختبار غير مستقر يُوقف الدمج حتى يُصلح

### 6.3 Gate‑2: STRICT Fidelity Integrity (للمزايا ذات STRICT)
- golden corpus pass
- PixelDiff pass
- structural/editability pass
- determinism pass

### 6.4 Gate‑3: Runtime Smoke (Production‑like)
- تشغيل سيناريوهات حرجة على بيئة تشبه الإنتاج
- التحقق من إنشاء artifacts فعلية + إمكانية فتحها

### 6.5 Gate‑4: Observability & Audit
- logs/metrics/traces موجودة
- audit entries تُكتب
- lineage موجودة

> MUST: أي Gate fail = لا دمج ولا نشر.

---

## 7) سياسة “التنفيذ دفعة واحدة” وتقليل الأسئلة (One‑Shot Execution Policy)
### 7.1 Auto‑First Defaults (MUST)
- النظام MUST يختار defaults صحيحة بدون سؤال:
  - page_range الافتراضي (مثل أول 5 صفحات عند طلب اختبار)
  - arabic_mode الافتراضي = ELITE للغة العربية
  - font fallback = أقرب خط مع إشعار
  - synthetic data = فقط عند عدم توفر بيانات وبصلاحية واضحة

### 7.2 أسئلة الحد الأدنى (Guided Mode)
- يجوز السؤال ONLY إذا:
  - لا يمكن إنتاج نتيجة صحيحة بدون معلومة (مثل تحديد منطقة الجدول إن فشل الكشف)
  - يوجد تعارض واضح (مصدران للبيانات مختلفان)
- MUST: سؤال واحد في كل مرة، بصيغة قصيرة، مع خيارات جاهزة.

### 7.3 “لا تقل تم” قبل التسليم الحقيقي
- UI/AI MUST لا يقول “تم التنفيذ” إلا بعد:
  - artifact موجود
  - بوابات القبول المطلوبة pass
  - evidence pack تم حفظه

---

## 8) سياسة “لا ديمو ولا بيانات ثابتة” (No Demo/No Static Data)
### 8.1 في الإنتاج
- MUST: منع أي “demo dataset” من الظهور كمخرجات افتراضية.
- MUST: أي بيانات غير حقيقية يجب أن تكون:
  - موسومة “Synthetic/Test”
  - قابلة للاستبدال بسهولة
  - غير مشاركة خارج workspace بدون تصريح

### 8.2 الاستثناء الوحيد المسموح (إذا وُجد)
- Synthetic data للداشبورد عند غياب البيانات:
  - MUST أن تُذكر صراحة للمستخدم (وسم واضح)
  - MUST أن تكون قابلة للاستبدال بمصدر حقيقي بنقرة واحدة
  - MUST أن لا تُستخدم في تقارير “Production claims”

---

## 9) متطلبات التوثيق (Documentation Requirements)
- MUST: كل Tool لديه:
  - input/output schemas
  - required_permissions
  - failure classes + recovery path
- MUST: كل Action Graph template لديه:
  - policies + gates + degrade rules
- MUST: كل Release لديه changelog مرتبط بالأدلة (Evidence Pack IDs)

---

## 10) اختبارات كشف الغش (Anti‑Cheating Test Suite) — إلزامي
هذه مجموعة اختبارات MUST تُنفذ دائمًا:
1) **Fake-success test**: endpoint يرجع ok لكن بدون output => يجب أن يفشل الاختبار.
2) **No‑mock production test**: وجود mock dependency في prod bundle => fail.
3) **Pixel gate bypass test**: محاولة تعطيل verify.pixel_diff => fail.
4) **Static data masquerade test**: dashboard يستخدم dataset ثابت غير موسوم => fail.
5) **Editable‑as‑image test**: نص/جدول خرج صورة => fail.
6) **Truthful status test**: UI claims done بدون artifact_id => fail.
7) **Repro test**: نفس input مرتين داخل farm => fingerprints identical.

---

## 11) تعريف “Done” (Definition of Done) — إلزامي
الميزة تعتبر DONE فقط إذا:
- الكود كامل، لا TODO/FIXME، لا stubs
- الاختبارات المطلوبة pass (Unit/Integration/E2E/Regression)
- Evidence Pack موجود ومرفق
- Observability/Audit/Lineage مفعلة
- الوثائق (schemas/templates) محدثة
- لا ادّعاء في UI/AI؛ الرسائل مرتبطة بنتائج runtime

---

# نهاية الوثيقة


---

<a id="sec-04"></a>
# ملحق 3: Tool Registry v3 — عقد التسجيل الموحد للأدوات (قابل للتوسع)
> Generated: 2026-03-08T22:57:58.868027+00:00


هذا الملحق يعرّف **شكل Tool Registry** الذي يعتمد عليه الـAI Orchestrator لتخطيط وتنفيذ كل شيء من Canvas، ويضمن:
- حتمية التنفيذ (Determinism)
- هدف الدقة (Fidelity Target)
- ضمانات التحرير (Editable Guarantees)
- الصلاحيات المطلوبة (Permission Binding)
- سياسات STRICT/Degrade/Never-Fail

---

## 1) Registry Contract (JSON)
```json
{
  "registry_version": "3.0",
  "generated": "2026-03-08T22:57:58.868027+00:00",
  "entry_contract": {
    "tool_id": "string",
    "version": "semver",
    "capabilities": [
      "string"
    ],
    "determinism_level": "HARD|SOFT|NONE",
    "fidelity_target": "PIXEL_0|PIXEL_EPS|STRUCT_ONLY|N/A",
    "editable_guarantee": {
      "text": "required|best_effort|none",
      "tables": "required|best_effort|none",
      "charts": "required|best_effort|none",
      "decorative_raster_allowed": "boolean"
    },
    "arabic_support": "BASIC|PROFESSIONAL|ELITE",
    "required_permissions": [
      "perm.*"
    ],
    "resource_profile": {
      "cpu": "string",
      "gpu": "string",
      "ram": "string",
      "timeout_s": "int"
    },
    "failure_classes": [
      "F1_*",
      "F2_*"
    ],
    "schemas": {
      "input": "url/path",
      "output": "url/path"
    }
  },
  "core_policies": {
    "strict_triple_gate": true,
    "never_fail": true,
    "deterministic_render_farm": true,
    "font_vault_required": true
  },
  "tools_example": [
    {
      "tool_id": "cdr.build_design_from_pdf",
      "version": "1.0.0",
      "capabilities": [
        "strict_replication",
        "cdr_design",
        "pdf_native"
      ],
      "determinism_level": "HARD",
      "fidelity_target": "PIXEL_0",
      "editable_guarantee": {
        "text": "required",
        "tables": "best_effort",
        "charts": "best_effort",
        "decorative_raster_allowed": true
      },
      "arabic_support": "ELITE",
      "required_permissions": [
        "perm.convert.strict.run"
      ],
      "resource_profile": {
        "cpu": "high",
        "gpu": "none",
        "ram": "high",
        "timeout_s": 600
      },
      "failure_classes": [
        "F2_PDF_FEATURE_UNSUPPORTED",
        "F1_FONT_MISSING"
      ],
      "schemas": {
        "input": "Tool-Schemas-Strict-Plus.md#cdr.build_design_from_pdf-input",
        "output": "Tool-Schemas-Strict-Plus.md#cdr.build_design_from_pdf-output"
      }
    }
  ]
}
```

---

## 2) قواعد إلزامية
1) أي Tool بدون `schemas.input/output` غير صالح للتشغيل.
2) أي Tool يدّعي `PIXEL_0` يجب أن يثبت `determinism_level=HARD` ويعمل فقط داخل Farm.
3) أي Tool يتعامل مع بيانات يجب أن يحدد `required_permissions` ويخضع لـPolicy engine.
4) أي Tool قد يستخدم Degrade يجب أن يصرح به صراحة.

---

# نهاية الملحق 3


---

<a id="sec-05"></a>
# ملحق 4: Traceability Matrix — ربط المتطلبات بالأدوات والاختبارات
> Generated: 2026-03-08T22:57:58.868027+00:00


هذا الملحق يمنع “انحراف التنفيذ عن الهدف” عبر ربط كل متطلب بـ:
- أدوات (Tools)
- بوابات قبول (Gates)
- اختبارات Regression/Golden
- صلاحيات (Permissions)

---

## 1) STRICT Visual Replication
| Requirement ID | النص | Tools | Gates/Tests | Permissions |
|---|---|---|---|---|
| R-STR-001 | Pixel-Perfect STRICT (PixelDiff=0/ε ثابت) | render.* + verify.pixel_diff + repair.loop_controller | Golden set pixel tests | perm.convert.strict.run |
| R-STR-002 | Dual/Triple Gate (Pixel + Structural + Drift) | verify.pixel_diff + verify.structural_equivalence + drift.* | CI gates | perm.convert.strict.run |
| R-STR-003 | Determinism (AA lock + GPU/CPU parity) | render.validate_determinism | Farm canary tests | perm.admin.observability.view |
| R-STR-004 | Never-Fail مع Degrade مضبوط | degrade.* + orch.delivery_pack | downgrade unit tests | perm.convert.degrade.* |
| R-STR-005 | Font embedding full glyph (STRICT) | fonts.embed_full_glyph | font regression | perm.fonts.vault.manage |

---

## 2) Image/Table → Excel Editable
| Requirement ID | النص | Tools | Gates/Tests | Permissions |
|---|---|---|---|---|
| R-TBL-001 | صورة جدول → XLSX editable | cdr.build_table_from_image + export.xlsx_from_table_cdr | Pixel gate + OCR confidence tests | perm.data.ingest |
| R-TBL-002 | merges/borders/styles preserved | cdr.table_semantics_infer (subsystem) | golden images | perm.data.ingest |

---

## 3) Excel/SVM + Expressions
| Requirement ID | النص | Tools | Gates/Tests | Permissions |
|---|---|---|---|---|
| R-XLS-001 | SVM deterministic recalc | xlsx.svm_execute (to be added) | drift gate | perm.data.model.measures.edit |
| R-IR-001 | GUI blocks → T-IR | expr.gui_to_tir + expr.tir_validate | preview tests | perm.expr.tir.create |
| R-IR-002 | GUI measures → M-IR → DAX | expr.gui_to_mir + expr.mir_to_dax | measure tests | perm.expr.export.dax |

---

## 4) Dashboards / Reports / Slides
| Requirement ID | النص | Tools | Gates/Tests | Permissions |
|---|---|---|---|---|
| R-DSH-001 | Dashboard حي (filters/drill/export) | gen.dashboard_from_plan + export.dashboard_publish | interaction tests | perm.dashboard.publish |
| R-DSH-002 | Synthetic data عند غياب البيانات | degrade.dashboard_synthetic_data | smoke tests | perm.dashboard.synthetic_data.allow |
| R-RPT-001 | Scheduling + diff reports | report.schedule.* + report.diff.* (to be added) | scheduler tests | perm.report.schedule.create |
| R-SLD-001 | Slides generator premium + brand + motion | gen.slides_from_storyboard + slides.motion.* (to be added) | visual QA | perm.slides.motion.enable |

---

# نهاية الملحق 4


---

<a id="sec-06"></a>
# 12 Critical Tool Schemas (JSON Schema مختصرة)

> Generated: 2026-03-08T22:38:06.047474Z

هذه العقود **جاهزة للتنفيذ**: لكل أداة يوجد **Input schema** و **Output schema**.

## Common definitions

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/common.json",
  "title": "Common Definitions",
  "type": "object",
  "$defs": {
    "UUID": {
      "type": "string",
      "pattern": "^[0-9a-fA-F-]{16,64}$"
    },
    "ISODateTime": {
      "type": "string",
      "format": "date-time"
    },
    "Locale": {
      "type": "string",
      "minLength": 2,
      "maxLength": 16
    },
    "ArabicMode": {
      "type": "string",
      "enum": [
        "BASIC",
        "PROFESSIONAL",
        "ELITE"
      ]
    },
    "Mode": {
      "type": "string",
      "enum": [
        "AUTO",
        "GUIDED"
      ]
    },
    "FontPolicy": {
      "type": "string",
      "enum": [
        "PROVIDED",
        "ALLOW_UPLOAD",
        "FALLBACK_ALLOWED"
      ]
    },
    "Severity": {
      "type": "string",
      "enum": [
        "info",
        "warning",
        "error"
      ]
    },
    "Warnings": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "code",
          "message",
          "severity"
        ],
        "properties": {
          "code": {
            "type": "string",
            "minLength": 2,
            "maxLength": 64
          },
          "message": {
            "type": "string",
            "minLength": 1,
            "maxLength": 2000
          },
          "severity": {
            "$ref": "#/$defs/Severity"
          }
        },
        "additionalProperties": false
      },
      "default": []
    },
    "ActionContext": {
      "type": "object",
      "required": [
        "workspace_id",
        "user_id",
        "locale",
        "strict_visual",
        "never_fail",
        "arabic_mode",
        "mode",
        "font_policy"
      ],
      "properties": {
        "workspace_id": {
          "type": "string",
          "minLength": 3,
          "maxLength": 128
        },
        "user_id": {
          "type": "string",
          "minLength": 3,
          "maxLength": 128
        },
        "locale": {
          "$ref": "#/$defs/Locale"
        },
        "strict_visual": {
          "type": "boolean"
        },
        "never_fail": {
          "type": "boolean"
        },
        "arabic_mode": {
          "$ref": "#/$defs/ArabicMode"
        },
        "mode": {
          "$ref": "#/$defs/Mode"
        },
        "font_policy": {
          "$ref": "#/$defs/FontPolicy"
        }
      },
      "additionalProperties": true
    },
    "AssetRef": {
      "type": "object",
      "required": [
        "asset_id",
        "uri",
        "mime",
        "sha256",
        "size_bytes"
      ],
      "properties": {
        "asset_id": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128
        },
        "uri": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        "mime": {
          "type": "string",
          "minLength": 3,
          "maxLength": 128
        },
        "sha256": {
          "type": "string",
          "pattern": "^[0-9a-fA-F]{64}$"
        },
        "size_bytes": {
          "type": "integer",
          "minimum": 0
        },
        "page_count": {
          "type": "integer",
          "minimum": 1
        }
      },
      "additionalProperties": false
    },
    "PdfDomRef": {
      "type": "object",
      "required": [
        "pdf_dom_id"
      ],
      "properties": {
        "pdf_dom_id": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128
        }
      },
      "additionalProperties": false
    },
    "ImageSegRef": {
      "type": "object",
      "required": [
        "seg_id",
        "regions"
      ],
      "properties": {
        "seg_id": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128
        },
        "regions": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "region_id",
              "kind",
              "bbox"
            ],
            "properties": {
              "region_id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 128
              },
              "kind": {
                "type": "string",
                "enum": [
                  "background",
                  "text",
                  "logo",
                  "table",
                  "chart",
                  "figure",
                  "photo",
                  "unknown"
                ]
              },
              "bbox": {
                "type": "object",
                "required": [
                  "x",
                  "y",
                  "w",
                  "h"
                ],
                "properties": {
                  "x": {
                    "type": "number"
                  },
                  "y": {
                    "type": "number"
                  },
                  "w": {
                    "type": "number",
                    "minimum": 0
                  },
                  "h": {
                    "type": "number",
                    "minimum": 0
                  }
                },
                "additionalProperties": false
              }
            },
            "additionalProperties": true
          }
        }
      },
      "additionalProperties": false
    },
    "CdrDesignRef": {
      "type": "object",
      "required": [
        "cdr_design_id",
        "page_count"
      ],
      "properties": {
        "cdr_design_id": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128
        },
        "page_count": {
          "type": "integer",
          "minimum": 1
        }
      },
      "additionalProperties": false
    },
    "CdrDataRef": {
      "type": "object",
      "required": [
        "cdr_data_id",
        "table_count"
      ],
      "properties": {
        "cdr_data_id": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128
        },
        "table_count": {
          "type": "integer",
          "minimum": 0
        }
      },
      "additionalProperties": false
    },
    "FontPlan": {
      "type": "object",
      "required": [
        "fonts"
      ],
      "properties": {
        "fonts": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "family",
              "status"
            ],
            "properties": {
              "family": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "status": {
                "type": "string",
                "enum": [
                  "available",
                  "embedded",
                  "substituted",
                  "missing"
                ]
              },
              "substitute_family": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "embed_subset": {
                "type": "boolean",
                "default": true
              }
            },
            "additionalProperties": false
          }
        }
      },
      "additionalProperties": true
    },
    "ArtifactRef": {
      "type": "object",
      "required": [
        "artifact_id",
        "kind",
        "uri"
      ],
      "properties": {
        "artifact_id": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128
        },
        "kind": {
          "type": "string",
          "enum": [
            "pptx",
            "docx",
            "xlsx",
            "dashboard",
            "pdf",
            "png",
            "json"
          ]
        },
        "uri": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        }
      },
      "additionalProperties": false
    },
    "RenderProfile": {
      "type": "object",
      "required": [
        "dpi",
        "colorspace"
      ],
      "properties": {
        "dpi": {
          "type": "integer",
          "minimum": 72,
          "maximum": 1200
        },
        "colorspace": {
          "type": "string",
          "enum": [
            "sRGB"
          ]
        },
        "page_range": {
          "type": "object",
          "properties": {
            "from": {
              "type": "integer",
              "minimum": 1
            },
            "to": {
              "type": "integer",
              "minimum": 1
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "RenderRef": {
      "type": "object",
      "required": [
        "render_id",
        "uri",
        "dpi",
        "colorspace",
        "engine_fingerprint"
      ],
      "properties": {
        "render_id": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128
        },
        "uri": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        "dpi": {
          "type": "integer",
          "minimum": 72,
          "maximum": 1200
        },
        "colorspace": {
          "type": "string",
          "enum": [
            "sRGB"
          ]
        },
        "engine_fingerprint": {
          "type": "string",
          "minLength": 6,
          "maxLength": 256
        }
      },
      "additionalProperties": false
    },
    "DiffRef": {
      "type": "object",
      "required": [
        "diff_id",
        "pixel_diff",
        "ssim",
        "edge_diff"
      ],
      "properties": {
        "diff_id": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128
        },
        "pixel_diff": {
          "type": "number",
          "minimum": 0
        },
        "ssim": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "edge_diff": {
          "type": "number",
          "minimum": 0
        },
        "heatmap_uri": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        }
      },
      "additionalProperties": false
    },
    "CauseType": {
      "type": "string",
      "enum": [
        "text_metrics",
        "baseline_shift",
        "kerning",
        "stroke_width",
        "fill_color",
        "crop_offset",
        "vector_approx",
        "missing_font",
        "unknown"
      ]
    },
    "DiffCause": {
      "type": "object",
      "required": [
        "cause_type",
        "severity",
        "confidence"
      ],
      "properties": {
        "element_id": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        },
        "cause_type": {
          "$ref": "#/$defs/CauseType"
        },
        "severity": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "confidence": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "suggested_fix": {
          "type": "string",
          "enum": [
            "adjust_text_metrics",
            "adjust_strokes",
            "adjust_crops",
            "quantize_geometry",
            "substitute_font",
            "rasterize_element",
            "none"
          ]
        }
      },
      "additionalProperties": false
    }
  }
}
```

## cdr.build_design_from_pdf

### Input schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/cdr.build_design_from_pdf.input.json",
  "title": "Build CDR-Design from PDF DOM - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "cdr.build_design_from_pdf"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "pdf_dom"
      ],
      "properties": {
        "pdf_dom": {
          "$ref": "common.defs.schema.json#/$defs/PdfDomRef"
        },
        "page_range": {
          "$ref": "common.defs.schema.json#/$defs/RenderProfile/properties/page_range"
        },
        "hints": {
          "type": "object",
          "properties": {
            "prefer_native_text": {
              "type": "boolean",
              "default": true
            },
            "detect_tables": {
              "type": "boolean",
              "default": true
            },
            "detect_charts": {
              "type": "boolean",
              "default": true
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```

### Output schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/cdr.build_design_from_pdf.output.json",
  "title": "Build CDR-Design from PDF DOM - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "cdr.build_design_from_pdf"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "cdr_design",
        "font_plan"
      ],
      "properties": {
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "font_plan": {
          "$ref": "common.defs.schema.json#/$defs/FontPlan"
        },
        "element_map": {
          "type": "object",
          "properties": {
            "elements": {
              "type": "array",
              "items": {
                "type": "object",
                "required": [
                  "element_id",
                  "kind",
                  "page",
                  "bbox"
                ],
                "properties": {
                  "element_id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                  },
                  "kind": {
                    "type": "string",
                    "enum": [
                      "text",
                      "shape",
                      "path",
                      "image",
                      "table",
                      "chart",
                      "group",
                      "background"
                    ]
                  },
                  "page": {
                    "type": "integer",
                    "minimum": 1
                  },
                  "bbox": {
                    "$ref": "common.defs.schema.json#/$defs/ImageSegRef/properties/regions/items/properties/bbox"
                  }
                },
                "additionalProperties": false
              }
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## cdr.build_table_from_image

### Input schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/cdr.build_table_from_image.input.json",
  "title": "Build CDR-Table (Design+Data) from Image Segments - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "cdr.build_table_from_image"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "image_segments",
        "table_region_id"
      ],
      "properties": {
        "image_segments": {
          "$ref": "common.defs.schema.json#/$defs/ImageSegRef"
        },
        "table_region_id": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        },
        "ocr_profile": {
          "type": "object",
          "properties": {
            "language_hint": {
              "type": "string",
              "enum": [
                "ar",
                "en",
                "auto"
              ],
              "default": "auto"
            },
            "min_confidence": {
              "type": "number",
              "minimum": 0,
              "maximum": 1,
              "default": 0.7
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```

### Output schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/cdr.build_table_from_image.output.json",
  "title": "Build CDR-Table (Design+Data) from Image Segments - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "cdr.build_table_from_image"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "cdr_design",
        "cdr_data",
        "table_quality"
      ],
      "properties": {
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "cdr_data": {
          "$ref": "common.defs.schema.json#/$defs/CdrDataRef"
        },
        "table_quality": {
          "type": "object",
          "required": [
            "grid_confidence",
            "ocr_confidence"
          ],
          "properties": {
            "grid_confidence": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "ocr_confidence": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "merged_cells_detected": {
              "type": "boolean"
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## export.pptx_from_cdr

### Input schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/export.pptx_from_cdr.input.json",
  "title": "Export PPTX from CDR-Design - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "export.pptx_from_cdr"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "cdr_design",
        "font_plan"
      ],
      "properties": {
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "font_plan": {
          "$ref": "common.defs.schema.json#/$defs/FontPlan"
        },
        "theme": {
          "type": "object",
          "properties": {
            "theme_id": {
              "type": "string"
            }
          },
          "additionalProperties": true
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```

### Output schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/export.pptx_from_cdr.output.json",
  "title": "Export PPTX from CDR-Design - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "export.pptx_from_cdr"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "artifact"
      ],
      "properties": {
        "artifact": {
          "$ref": "common.defs.schema.json#/$defs/ArtifactRef"
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## export.xlsx_from_table_cdr

### Input schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/export.xlsx_from_table_cdr.input.json",
  "title": "Export XLSX (Editable Table) from CDR-Data + Table Styles - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "export.xlsx_from_table_cdr"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "cdr_data"
      ],
      "properties": {
        "cdr_data": {
          "$ref": "common.defs.schema.json#/$defs/CdrDataRef"
        },
        "style_source": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "sheet_name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 31,
          "default": "Sheet1"
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```

### Output schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/export.xlsx_from_table_cdr.output.json",
  "title": "Export XLSX (Editable Table) from CDR-Data + Table Styles - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "export.xlsx_from_table_cdr"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "artifact"
      ],
      "properties": {
        "artifact": {
          "$ref": "common.defs.schema.json#/$defs/ArtifactRef"
        },
        "table_range": {
          "type": "string",
          "pattern": "^[A-Z]{1,3}[0-9]{1,7}:[A-Z]{1,3}[0-9]{1,7}$"
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## render.pdf_to_png

### Input schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/render.pdf_to_png.input.json",
  "title": "Render PDF to PNG (Deterministic Farm) - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "render.pdf_to_png"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "pdf_asset",
        "render_profile"
      ],
      "properties": {
        "pdf_asset": {
          "$ref": "common.defs.schema.json#/$defs/AssetRef"
        },
        "render_profile": {
          "$ref": "common.defs.schema.json#/$defs/RenderProfile"
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```

### Output schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/render.pdf_to_png.output.json",
  "title": "Render PDF to PNG (Deterministic Farm) - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "render.pdf_to_png"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "renders"
      ],
      "properties": {
        "renders": {
          "type": "array",
          "items": {
            "$ref": "common.defs.schema.json#/$defs/RenderRef"
          },
          "minItems": 1
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## render.pptx_to_png

### Input schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/render.pptx_to_png.input.json",
  "title": "Render PPTX to PNG (Deterministic Farm) - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "render.pptx_to_png"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "pptx_artifact",
        "render_profile"
      ],
      "properties": {
        "pptx_artifact": {
          "$ref": "common.defs.schema.json#/$defs/ArtifactRef"
        },
        "render_profile": {
          "$ref": "common.defs.schema.json#/$defs/RenderProfile"
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```

### Output schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/render.pptx_to_png.output.json",
  "title": "Render PPTX to PNG (Deterministic Farm) - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "render.pptx_to_png"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "renders"
      ],
      "properties": {
        "renders": {
          "type": "array",
          "items": {
            "$ref": "common.defs.schema.json#/$defs/RenderRef"
          },
          "minItems": 1
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## verify.pixel_diff

### Input schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/verify.pixel_diff.input.json",
  "title": "Verify Pixel Diff Between Two Renders - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "verify.pixel_diff"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "source_render",
        "target_render"
      ],
      "properties": {
        "source_render": {
          "$ref": "common.defs.schema.json#/$defs/RenderRef"
        },
        "target_render": {
          "$ref": "common.defs.schema.json#/$defs/RenderRef"
        },
        "threshold": {
          "type": "number",
          "minimum": 0,
          "default": 0
        },
        "ignore_regions": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "page",
              "bbox"
            ],
            "properties": {
              "page": {
                "type": "integer",
                "minimum": 1
              },
              "bbox": {
                "$ref": "common.defs.schema.json#/$defs/ImageSegRef/properties/regions/items/properties/bbox"
              }
            },
            "additionalProperties": false
          },
          "default": []
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```

### Output schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/verify.pixel_diff.output.json",
  "title": "Verify Pixel Diff Between Two Renders - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "verify.pixel_diff"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "diff"
      ],
      "properties": {
        "diff": {
          "$ref": "common.defs.schema.json#/$defs/DiffRef"
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## diagnose.diff_attribution

### Input schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/diagnose.diff_attribution.input.json",
  "title": "Diagnose Root Causes for Diff - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "diagnose.diff_attribution"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "diff",
        "cdr_design"
      ],
      "properties": {
        "diff": {
          "$ref": "common.defs.schema.json#/$defs/DiffRef"
        },
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "max_causes": {
          "type": "integer",
          "minimum": 1,
          "maximum": 500,
          "default": 50
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```

### Output schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/diagnose.diff_attribution.output.json",
  "title": "Diagnose Root Causes for Diff - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "diagnose.diff_attribution"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "causes"
      ],
      "properties": {
        "causes": {
          "type": "array",
          "items": {
            "$ref": "common.defs.schema.json#/$defs/DiffCause"
          },
          "minItems": 0
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## repair.quantize_geometry

### Input schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/repair.quantize_geometry.input.json",
  "title": "Quantize Geometry to EMU/Pixels Grid - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "repair.quantize_geometry"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "cdr_design",
        "quantization_profile"
      ],
      "properties": {
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "quantization_profile": {
          "type": "object",
          "required": [
            "emu_snap"
          ],
          "properties": {
            "emu_snap": {
              "type": "integer",
              "minimum": 1,
              "default": 8
            },
            "snap_text_baselines": {
              "type": "boolean",
              "default": true
            },
            "snap_strokes": {
              "type": "boolean",
              "default": true
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```

### Output schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/repair.quantize_geometry.output.json",
  "title": "Quantize Geometry to EMU/Pixels Grid - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "repair.quantize_geometry"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "cdr_design"
      ],
      "properties": {
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## repair.adjust_text_metrics

### Input schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/repair.adjust_text_metrics.input.json",
  "title": "Repair Text Metrics Based on Diagnosed Causes - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "repair.adjust_text_metrics"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "cdr_design",
        "causes"
      ],
      "properties": {
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "causes": {
          "type": "array",
          "items": {
            "$ref": "common.defs.schema.json#/$defs/DiffCause"
          }
        },
        "strategy": {
          "type": "string",
          "enum": [
            "baseline_first",
            "kerning_first",
            "lineheight_first",
            "auto"
          ],
          "default": "auto"
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```

### Output schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/repair.adjust_text_metrics.output.json",
  "title": "Repair Text Metrics Based on Diagnosed Causes - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "repair.adjust_text_metrics"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "cdr_design"
      ],
      "properties": {
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "applied_fixes": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "element_id",
              "fix"
            ],
            "properties": {
              "element_id": {
                "type": "string"
              },
              "fix": {
                "type": "string"
              }
            },
            "additionalProperties": false
          }
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## repair.loop_controller

### Input schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/repair.loop_controller.input.json",
  "title": "Repair Loop Controller (Export+Render+Verify+Repair) - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "repair.loop_controller"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "initial_cdr_design",
        "source_render",
        "export_tool",
        "render_tool",
        "render_profile",
        "targets"
      ],
      "properties": {
        "initial_cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "source_render": {
          "$ref": "common.defs.schema.json#/$defs/RenderRef"
        },
        "export_tool": {
          "type": "string",
          "enum": [
            "export.pptx_from_cdr",
            "export.docx_from_cdr",
            "export.xlsx_layout_from_cdr"
          ]
        },
        "render_tool": {
          "type": "string",
          "enum": [
            "render.pptx_to_png",
            "render.docx_to_png",
            "render.xlsx_to_png"
          ]
        },
        "render_profile": {
          "$ref": "common.defs.schema.json#/$defs/RenderProfile"
        },
        "targets": {
          "type": "object",
          "required": [
            "pixel_threshold",
            "max_iterations"
          ],
          "properties": {
            "pixel_threshold": {
              "type": "number",
              "minimum": 0,
              "default": 0
            },
            "max_iterations": {
              "type": "integer",
              "minimum": 1,
              "maximum": 200,
              "default": 25
            }
          },
          "additionalProperties": false
        },
        "degrade_policy": {
          "type": "object",
          "properties": {
            "allow_font_substitution": {
              "type": "boolean",
              "default": true
            },
            "allow_element_rasterize": {
              "type": "boolean",
              "default": true
            },
            "max_rasterized_elements": {
              "type": "integer",
              "minimum": 0,
              "maximum": 50,
              "default": 2
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```

### Output schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/repair.loop_controller.output.json",
  "title": "Repair Loop Controller (Export+Render+Verify+Repair) - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "repair.loop_controller"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "final_artifact",
        "final_cdr_design",
        "final_diff",
        "iterations",
        "degraded"
      ],
      "properties": {
        "final_artifact": {
          "$ref": "common.defs.schema.json#/$defs/ArtifactRef"
        },
        "final_cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "final_diff": {
          "$ref": "common.defs.schema.json#/$defs/DiffRef"
        },
        "iterations": {
          "type": "integer",
          "minimum": 0
        },
        "degraded": {
          "type": "boolean"
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## expr.gui_to_tir

### Input schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/expr.gui_to_tir.input.json",
  "title": "Convert Expression GUI Events to Transform IR (T-IR) - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "expr.gui_to_tir"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "ui_events",
        "dataset"
      ],
      "properties": {
        "ui_events": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "required": [
              "op",
              "ts"
            ],
            "properties": {
              "op": {
                "type": "string",
                "enum": [
                  "select_columns",
                  "rename_column",
                  "filter",
                  "derive_column",
                  "split_column",
                  "merge_columns",
                  "group_by",
                  "join",
                  "pivot",
                  "unpivot",
                  "sort",
                  "cast_type"
                ]
              },
              "ts": {
                "$ref": "common.defs.schema.json#/$defs/ISODateTime"
              },
              "args": {
                "type": "object",
                "additionalProperties": true
              }
            },
            "additionalProperties": false
          }
        },
        "dataset": {
          "$ref": "common.defs.schema.json#/$defs/CdrDataRef"
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```

### Output schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/expr.gui_to_tir.output.json",
  "title": "Convert Expression GUI Events to Transform IR (T-IR) - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "expr.gui_to_tir"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "tir",
        "tir_ref"
      ],
      "properties": {
        "tir": {
          "type": "object",
          "required": [
            "tir_id",
            "version",
            "steps"
          ],
          "properties": {
            "tir_id": {
              "type": "string",
              "minLength": 8,
              "maxLength": 128
            },
            "version": {
              "type": "string",
              "enum": [
                "1.0"
              ]
            },
            "steps": {
              "type": "array",
              "minItems": 1,
              "items": {
                "type": "object",
                "required": [
                  "step_id",
                  "op"
                ],
                "properties": {
                  "step_id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 64
                  },
                  "op": {
                    "type": "string",
                    "enum": [
                      "select_columns",
                      "rename_column",
                      "filter",
                      "derive_column",
                      "split_column",
                      "merge_columns",
                      "group_by",
                      "join",
                      "pivot",
                      "unpivot",
                      "sort",
                      "cast_type"
                    ]
                  },
                  "depends_on": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "default": []
                  },
                  "params": {
                    "type": "object",
                    "additionalProperties": true
                  }
                },
                "additionalProperties": false
              }
            }
          },
          "additionalProperties": false
        },
        "tir_ref": {
          "type": "object",
          "required": [
            "tir_id"
          ],
          "properties": {
            "tir_id": {
              "type": "string"
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```


---

<a id="sec-07"></a>
# Strict Plus Tool Schemas (12 + 6)

> Generated: 2026-03-08T22:41:58.073382Z

هذا الملف يضم **نسخة مطوّرة** من الـ12 أدوات الحرجة + **6 أدوات** لسد الفجوات الأساسية (dual gate structural، hashes، determinism parity، font embed strict، MIR/DAX).

## Common definitions (v2)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/common.json",
  "title": "Common Definitions",
  "type": "object",
  "$defs": {
    "UUID": {
      "type": "string",
      "pattern": "^[0-9a-fA-F-]{16,64}$"
    },
    "ISODateTime": {
      "type": "string",
      "format": "date-time"
    },
    "Locale": {
      "type": "string",
      "minLength": 2,
      "maxLength": 16
    },
    "ArabicMode": {
      "type": "string",
      "enum": [
        "BASIC",
        "PROFESSIONAL",
        "ELITE"
      ]
    },
    "Mode": {
      "type": "string",
      "enum": [
        "AUTO",
        "GUIDED"
      ]
    },
    "FontPolicy": {
      "type": "string",
      "enum": [
        "PROVIDED",
        "ALLOW_UPLOAD",
        "FALLBACK_ALLOWED"
      ]
    },
    "Severity": {
      "type": "string",
      "enum": [
        "info",
        "warning",
        "error"
      ]
    },
    "Warnings": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "code",
          "message",
          "severity"
        ],
        "properties": {
          "code": {
            "type": "string",
            "minLength": 2,
            "maxLength": 64
          },
          "message": {
            "type": "string",
            "minLength": 1,
            "maxLength": 2000
          },
          "severity": {
            "$ref": "#/$defs/Severity"
          }
        },
        "additionalProperties": false
      },
      "default": []
    },
    "ActionContext": {
      "type": "object",
      "required": [
        "workspace_id",
        "user_id",
        "locale",
        "strict_visual",
        "never_fail",
        "arabic_mode",
        "mode",
        "font_policy"
      ],
      "properties": {
        "workspace_id": {
          "type": "string",
          "minLength": 3,
          "maxLength": 128
        },
        "user_id": {
          "type": "string",
          "minLength": 3,
          "maxLength": 128
        },
        "locale": {
          "$ref": "#/$defs/Locale"
        },
        "strict_visual": {
          "type": "boolean"
        },
        "never_fail": {
          "type": "boolean"
        },
        "arabic_mode": {
          "$ref": "#/$defs/ArabicMode"
        },
        "mode": {
          "$ref": "#/$defs/Mode"
        },
        "font_policy": {
          "$ref": "#/$defs/FontPolicy"
        }
      },
      "additionalProperties": true
    },
    "AssetRef": {
      "type": "object",
      "required": [
        "asset_id",
        "uri",
        "mime",
        "sha256",
        "size_bytes"
      ],
      "properties": {
        "asset_id": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128
        },
        "uri": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        "mime": {
          "type": "string",
          "minLength": 3,
          "maxLength": 128
        },
        "sha256": {
          "type": "string",
          "pattern": "^[0-9a-fA-F]{64}$"
        },
        "size_bytes": {
          "type": "integer",
          "minimum": 0
        },
        "page_count": {
          "type": "integer",
          "minimum": 1
        }
      },
      "additionalProperties": false
    },
    "PdfDomRef": {
      "type": "object",
      "required": [
        "pdf_dom_id"
      ],
      "properties": {
        "pdf_dom_id": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128
        }
      },
      "additionalProperties": false
    },
    "ImageSegRef": {
      "type": "object",
      "required": [
        "seg_id",
        "regions"
      ],
      "properties": {
        "seg_id": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128
        },
        "regions": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "region_id",
              "kind",
              "bbox"
            ],
            "properties": {
              "region_id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 128
              },
              "kind": {
                "type": "string",
                "enum": [
                  "background",
                  "text",
                  "logo",
                  "table",
                  "chart",
                  "figure",
                  "photo",
                  "unknown"
                ]
              },
              "bbox": {
                "type": "object",
                "required": [
                  "x",
                  "y",
                  "w",
                  "h"
                ],
                "properties": {
                  "x": {
                    "type": "number"
                  },
                  "y": {
                    "type": "number"
                  },
                  "w": {
                    "type": "number",
                    "minimum": 0
                  },
                  "h": {
                    "type": "number",
                    "minimum": 0
                  }
                },
                "additionalProperties": false
              }
            },
            "additionalProperties": true
          }
        }
      },
      "additionalProperties": false
    },
    "CdrDesignRef": {
      "type": "object",
      "required": [
        "cdr_design_id",
        "page_count"
      ],
      "properties": {
        "cdr_design_id": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128
        },
        "page_count": {
          "type": "integer",
          "minimum": 1
        }
      },
      "additionalProperties": false
    },
    "CdrDataRef": {
      "type": "object",
      "required": [
        "cdr_data_id",
        "table_count"
      ],
      "properties": {
        "cdr_data_id": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128
        },
        "table_count": {
          "type": "integer",
          "minimum": 0
        }
      },
      "additionalProperties": false
    },
    "FontPlan": {
      "type": "object",
      "required": [
        "fonts"
      ],
      "properties": {
        "fonts": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "family",
              "status"
            ],
            "properties": {
              "family": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "status": {
                "type": "string",
                "enum": [
                  "available",
                  "embedded",
                  "substituted",
                  "missing"
                ]
              },
              "substitute_family": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "embed_subset": {
                "type": "boolean",
                "default": true
              }
            },
            "additionalProperties": false
          }
        }
      },
      "additionalProperties": true
    },
    "ArtifactRef": {
      "type": "object",
      "required": [
        "artifact_id",
        "kind",
        "uri"
      ],
      "properties": {
        "artifact_id": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128
        },
        "kind": {
          "type": "string",
          "enum": [
            "pptx",
            "docx",
            "xlsx",
            "dashboard",
            "pdf",
            "png",
            "json"
          ]
        },
        "uri": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        }
      },
      "additionalProperties": false
    },
    "RenderProfile": {
      "type": "object",
      "required": [
        "dpi",
        "colorspace"
      ],
      "properties": {
        "dpi": {
          "type": "integer",
          "minimum": 72,
          "maximum": 1200
        },
        "colorspace": {
          "type": "string",
          "enum": [
            "sRGB"
          ]
        },
        "page_range": {
          "type": "object",
          "properties": {
            "from": {
              "type": "integer",
              "minimum": 1
            },
            "to": {
              "type": "integer",
              "minimum": 1
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "RenderRef": {
      "type": "object",
      "required": [
        "render_id",
        "uri",
        "dpi",
        "colorspace",
        "engine_fingerprint",
        "fingerprint"
      ],
      "properties": {
        "render_id": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128
        },
        "uri": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        "dpi": {
          "type": "integer",
          "minimum": 72,
          "maximum": 1200
        },
        "colorspace": {
          "type": "string",
          "enum": [
            "sRGB"
          ]
        },
        "engine_fingerprint": {
          "type": "string",
          "minLength": 6,
          "maxLength": 256
        },
        "fingerprint": {
          "$ref": "#/$defs/HashBundle"
        }
      },
      "additionalProperties": false
    },
    "DiffRef": {
      "type": "object",
      "required": [
        "diff_id",
        "pixel_diff",
        "ssim",
        "edge_diff",
        "pass",
        "pixel_threshold"
      ],
      "properties": {
        "diff_id": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128
        },
        "pixel_diff": {
          "type": "number",
          "minimum": 0
        },
        "ssim": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "edge_diff": {
          "type": "number",
          "minimum": 0
        },
        "heatmap_uri": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        "pass": {
          "type": "boolean"
        },
        "pixel_threshold": {
          "type": "number",
          "minimum": 0
        }
      },
      "additionalProperties": false
    },
    "CauseType": {
      "type": "string",
      "enum": [
        "text_metrics",
        "baseline_shift",
        "kerning",
        "stroke_width",
        "fill_color",
        "crop_offset",
        "vector_approx",
        "missing_font",
        "unknown"
      ]
    },
    "DiffCause": {
      "type": "object",
      "required": [
        "cause_type",
        "severity",
        "confidence"
      ],
      "properties": {
        "element_id": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        },
        "cause_type": {
          "$ref": "#/$defs/CauseType"
        },
        "severity": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "confidence": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "suggested_fix": {
          "type": "string",
          "enum": [
            "adjust_text_metrics",
            "adjust_strokes",
            "adjust_crops",
            "quantize_geometry",
            "substitute_font",
            "rasterize_element",
            "none"
          ]
        }
      },
      "additionalProperties": false
    },
    "HashBundle": {
      "type": "object",
      "required": [
        "layout_hash",
        "structural_hash",
        "typography_hash"
      ],
      "properties": {
        "layout_hash": {
          "type": "string",
          "minLength": 16,
          "maxLength": 256
        },
        "structural_hash": {
          "type": "string",
          "minLength": 16,
          "maxLength": 256
        },
        "typography_hash": {
          "type": "string",
          "minLength": 16,
          "maxLength": 256
        },
        "perceptual_hash": {
          "type": "string",
          "minLength": 16,
          "maxLength": 256
        },
        "pixel_hash": {
          "type": "string",
          "minLength": 16,
          "maxLength": 256
        }
      },
      "additionalProperties": false
    },
    "ArtifactDomRef": {
      "type": "object",
      "required": [
        "artifact_dom_id",
        "kind"
      ],
      "properties": {
        "artifact_dom_id": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128
        },
        "kind": {
          "type": "string",
          "enum": [
            "pptx",
            "docx",
            "xlsx",
            "dashboard"
          ]
        }
      },
      "additionalProperties": false
    },
    "DeterminismCheck": {
      "type": "object",
      "required": [
        "anti_aliasing_policy",
        "gpu_cpu_parity",
        "float_norm_policy",
        "random_seed_locked"
      ],
      "properties": {
        "anti_aliasing_policy": {
          "type": "string",
          "enum": [
            "locked"
          ]
        },
        "gpu_cpu_parity": {
          "type": "string",
          "enum": [
            "validated",
            "not_validated"
          ]
        },
        "float_norm_policy": {
          "type": "string",
          "enum": [
            "locked"
          ]
        },
        "random_seed_locked": {
          "type": "boolean"
        }
      },
      "additionalProperties": false
    }
  }
}
```

## cdr.build_design_from_pdf
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/cdr.build_design_from_pdf.input.json",
  "title": "Build CDR-Design from PDF DOM - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "cdr.build_design_from_pdf"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "pdf_dom"
      ],
      "properties": {
        "pdf_dom": {
          "$ref": "common.defs.schema.json#/$defs/PdfDomRef"
        },
        "page_range": {
          "$ref": "common.defs.schema.json#/$defs/RenderProfile/properties/page_range"
        },
        "hints": {
          "type": "object",
          "properties": {
            "prefer_native_text": {
              "type": "boolean",
              "default": true
            },
            "detect_tables": {
              "type": "boolean",
              "default": true
            },
            "detect_charts": {
              "type": "boolean",
              "default": true
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/cdr.build_design_from_pdf.output.json",
  "title": "Build CDR-Design from PDF DOM - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "cdr.build_design_from_pdf"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "cdr_design",
        "font_plan"
      ],
      "properties": {
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "font_plan": {
          "$ref": "common.defs.schema.json#/$defs/FontPlan"
        },
        "element_map": {
          "type": "object",
          "properties": {
            "elements": {
              "type": "array",
              "items": {
                "type": "object",
                "required": [
                  "element_id",
                  "kind",
                  "page",
                  "bbox"
                ],
                "properties": {
                  "element_id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                  },
                  "kind": {
                    "type": "string",
                    "enum": [
                      "text",
                      "shape",
                      "path",
                      "image",
                      "table",
                      "chart",
                      "group",
                      "background"
                    ]
                  },
                  "page": {
                    "type": "integer",
                    "minimum": 1
                  },
                  "bbox": {
                    "$ref": "common.defs.schema.json#/$defs/ImageSegRef/properties/regions/items/properties/bbox"
                  }
                },
                "additionalProperties": false
              }
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## cdr.build_table_from_image
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/cdr.build_table_from_image.input.json",
  "title": "Build CDR-Table (Design+Data) from Image Segments - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "cdr.build_table_from_image"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "image_segments",
        "table_region_id"
      ],
      "properties": {
        "image_segments": {
          "$ref": "common.defs.schema.json#/$defs/ImageSegRef"
        },
        "table_region_id": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        },
        "ocr_profile": {
          "type": "object",
          "properties": {
            "language_hint": {
              "type": "string",
              "enum": [
                "ar",
                "en",
                "auto"
              ],
              "default": "auto"
            },
            "min_confidence": {
              "type": "number",
              "minimum": 0,
              "maximum": 1,
              "default": 0.7
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/cdr.build_table_from_image.output.json",
  "title": "Build CDR-Table (Design+Data) from Image Segments - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "cdr.build_table_from_image"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "cdr_design",
        "cdr_data",
        "table_quality"
      ],
      "properties": {
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "cdr_data": {
          "$ref": "common.defs.schema.json#/$defs/CdrDataRef"
        },
        "table_quality": {
          "type": "object",
          "required": [
            "grid_confidence",
            "ocr_confidence"
          ],
          "properties": {
            "grid_confidence": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "ocr_confidence": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "merged_cells_detected": {
              "type": "boolean"
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## export.pptx_from_cdr
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/export.pptx_from_cdr.input.json",
  "title": "Export PPTX from CDR-Design - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "export.pptx_from_cdr"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "cdr_design",
        "font_plan"
      ],
      "properties": {
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "font_plan": {
          "$ref": "common.defs.schema.json#/$defs/FontPlan"
        },
        "theme": {
          "type": "object",
          "properties": {
            "theme_id": {
              "type": "string"
            }
          },
          "additionalProperties": true
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/export.pptx_from_cdr.output.json",
  "title": "Export PPTX from CDR-Design - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "export.pptx_from_cdr"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "artifact"
      ],
      "properties": {
        "artifact": {
          "$ref": "common.defs.schema.json#/$defs/ArtifactRef"
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## export.xlsx_from_table_cdr
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/export.xlsx_from_table_cdr.input.json",
  "title": "Export XLSX (Editable Table) from CDR-Data + Table Styles - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "export.xlsx_from_table_cdr"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "cdr_data"
      ],
      "properties": {
        "cdr_data": {
          "$ref": "common.defs.schema.json#/$defs/CdrDataRef"
        },
        "style_source": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "sheet_name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 31,
          "default": "Sheet1"
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/export.xlsx_from_table_cdr.output.json",
  "title": "Export XLSX (Editable Table) from CDR-Data + Table Styles - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "export.xlsx_from_table_cdr"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "artifact"
      ],
      "properties": {
        "artifact": {
          "$ref": "common.defs.schema.json#/$defs/ArtifactRef"
        },
        "table_range": {
          "type": "string",
          "pattern": "^[A-Z]{1,3}[0-9]{1,7}:[A-Z]{1,3}[0-9]{1,7}$"
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## render.pdf_to_png
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/render.pdf_to_png.input.json",
  "title": "Render PDF to PNG (Deterministic Farm) - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "render.pdf_to_png"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "pdf_asset",
        "render_profile"
      ],
      "properties": {
        "pdf_asset": {
          "$ref": "common.defs.schema.json#/$defs/AssetRef"
        },
        "render_profile": {
          "$ref": "common.defs.schema.json#/$defs/RenderProfile"
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/render.pdf_to_png.output.json",
  "title": "Render PDF to PNG (Deterministic Farm) - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "render.pdf_to_png"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "renders"
      ],
      "properties": {
        "renders": {
          "type": "array",
          "items": {
            "$ref": "common.defs.schema.json#/$defs/RenderRef"
          },
          "minItems": 1
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## render.pptx_to_png
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/render.pptx_to_png.input.json",
  "title": "Render PPTX to PNG (Deterministic Farm) - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "render.pptx_to_png"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "pptx_artifact",
        "render_profile"
      ],
      "properties": {
        "pptx_artifact": {
          "$ref": "common.defs.schema.json#/$defs/ArtifactRef"
        },
        "render_profile": {
          "$ref": "common.defs.schema.json#/$defs/RenderProfile"
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/render.pptx_to_png.output.json",
  "title": "Render PPTX to PNG (Deterministic Farm) - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "render.pptx_to_png"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "renders"
      ],
      "properties": {
        "renders": {
          "type": "array",
          "items": {
            "$ref": "common.defs.schema.json#/$defs/RenderRef"
          },
          "minItems": 1
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## verify.pixel_diff
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/verify.pixel_diff.input.json",
  "title": "Verify Pixel Diff Between Two Renders - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "verify.pixel_diff"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "source_render",
        "target_render"
      ],
      "properties": {
        "source_render": {
          "$ref": "common.defs.schema.json#/$defs/RenderRef"
        },
        "target_render": {
          "$ref": "common.defs.schema.json#/$defs/RenderRef"
        },
        "threshold": {
          "type": "number",
          "minimum": 0,
          "default": 0
        },
        "ignore_regions": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "page",
              "bbox"
            ],
            "properties": {
              "page": {
                "type": "integer",
                "minimum": 1
              },
              "bbox": {
                "$ref": "common.defs.schema.json#/$defs/ImageSegRef/properties/regions/items/properties/bbox"
              }
            },
            "additionalProperties": false
          },
          "default": []
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/verify.pixel_diff.output.json",
  "title": "Verify Pixel Diff Between Two Renders - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "verify.pixel_diff"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "diff"
      ],
      "properties": {
        "diff": {
          "$ref": "common.defs.schema.json#/$defs/DiffRef"
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## diagnose.diff_attribution
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/diagnose.diff_attribution.input.json",
  "title": "Diagnose Root Causes for Diff - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "diagnose.diff_attribution"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "diff",
        "cdr_design"
      ],
      "properties": {
        "diff": {
          "$ref": "common.defs.schema.json#/$defs/DiffRef"
        },
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "max_causes": {
          "type": "integer",
          "minimum": 1,
          "maximum": 500,
          "default": 50
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/diagnose.diff_attribution.output.json",
  "title": "Diagnose Root Causes for Diff - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "diagnose.diff_attribution"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "causes"
      ],
      "properties": {
        "causes": {
          "type": "array",
          "items": {
            "$ref": "common.defs.schema.json#/$defs/DiffCause"
          },
          "minItems": 0
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## repair.quantize_geometry
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/repair.quantize_geometry.input.json",
  "title": "Quantize Geometry to EMU/Pixels Grid - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "repair.quantize_geometry"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "cdr_design",
        "quantization_profile"
      ],
      "properties": {
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "quantization_profile": {
          "type": "object",
          "required": [
            "emu_snap"
          ],
          "properties": {
            "emu_snap": {
              "type": "integer",
              "minimum": 1,
              "default": 8
            },
            "snap_text_baselines": {
              "type": "boolean",
              "default": true
            },
            "snap_strokes": {
              "type": "boolean",
              "default": true
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/repair.quantize_geometry.output.json",
  "title": "Quantize Geometry to EMU/Pixels Grid - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "repair.quantize_geometry"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "cdr_design"
      ],
      "properties": {
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## repair.adjust_text_metrics
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/repair.adjust_text_metrics.input.json",
  "title": "Repair Text Metrics Based on Diagnosed Causes - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "repair.adjust_text_metrics"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "cdr_design",
        "causes"
      ],
      "properties": {
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "causes": {
          "type": "array",
          "items": {
            "$ref": "common.defs.schema.json#/$defs/DiffCause"
          }
        },
        "strategy": {
          "type": "string",
          "enum": [
            "baseline_first",
            "kerning_first",
            "lineheight_first",
            "auto"
          ],
          "default": "auto"
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/repair.adjust_text_metrics.output.json",
  "title": "Repair Text Metrics Based on Diagnosed Causes - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "repair.adjust_text_metrics"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "cdr_design"
      ],
      "properties": {
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "applied_fixes": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "element_id",
              "fix"
            ],
            "properties": {
              "element_id": {
                "type": "string"
              },
              "fix": {
                "type": "string"
              }
            },
            "additionalProperties": false
          }
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## repair.loop_controller
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/repair.loop_controller.input.json",
  "title": "Repair Loop Controller (Export+Render+Verify+Repair) - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "repair.loop_controller"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "initial_cdr_design",
        "source_render",
        "export_tool",
        "render_tool",
        "render_profile",
        "targets"
      ],
      "properties": {
        "initial_cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "source_render": {
          "$ref": "common.defs.schema.json#/$defs/RenderRef"
        },
        "export_tool": {
          "type": "string",
          "enum": [
            "export.pptx_from_cdr",
            "export.docx_from_cdr",
            "export.xlsx_layout_from_cdr"
          ]
        },
        "render_tool": {
          "type": "string",
          "enum": [
            "render.pptx_to_png",
            "render.docx_to_png",
            "render.xlsx_to_png"
          ]
        },
        "render_profile": {
          "$ref": "common.defs.schema.json#/$defs/RenderProfile"
        },
        "targets": {
          "type": "object",
          "required": [
            "pixel_threshold",
            "max_iterations"
          ],
          "properties": {
            "pixel_threshold": {
              "type": "number",
              "minimum": 0,
              "default": 0
            },
            "max_iterations": {
              "type": "integer",
              "minimum": 1,
              "maximum": 200,
              "default": 25
            }
          },
          "additionalProperties": false
        },
        "degrade_policy": {
          "type": "object",
          "properties": {
            "allow_font_substitution": {
              "type": "boolean",
              "default": true
            },
            "allow_element_rasterize": {
              "type": "boolean",
              "default": true
            },
            "max_rasterized_elements": {
              "type": "integer",
              "minimum": 0,
              "maximum": 50,
              "default": 2
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/repair.loop_controller.output.json",
  "title": "Repair Loop Controller (Export+Render+Verify+Repair) - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "repair.loop_controller"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "final_artifact",
        "final_cdr_design",
        "final_diff",
        "iterations",
        "degraded"
      ],
      "properties": {
        "final_artifact": {
          "$ref": "common.defs.schema.json#/$defs/ArtifactRef"
        },
        "final_cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "final_diff": {
          "$ref": "common.defs.schema.json#/$defs/DiffRef"
        },
        "iterations": {
          "type": "integer",
          "minimum": 0
        },
        "degraded": {
          "type": "boolean"
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## expr.gui_to_tir
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/expr.gui_to_tir.input.json",
  "title": "Convert Expression GUI Events to Transform IR (T-IR) - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "expr.gui_to_tir"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "ui_events",
        "dataset"
      ],
      "properties": {
        "ui_events": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "required": [
              "op",
              "ts"
            ],
            "properties": {
              "op": {
                "type": "string",
                "enum": [
                  "select_columns",
                  "rename_column",
                  "filter",
                  "derive_column",
                  "split_column",
                  "merge_columns",
                  "group_by",
                  "join",
                  "pivot",
                  "unpivot",
                  "sort",
                  "cast_type"
                ]
              },
              "ts": {
                "$ref": "common.defs.schema.json#/$defs/ISODateTime"
              },
              "args": {
                "type": "object",
                "additionalProperties": true
              }
            },
            "additionalProperties": false
          }
        },
        "dataset": {
          "$ref": "common.defs.schema.json#/$defs/CdrDataRef"
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/expr.gui_to_tir.output.json",
  "title": "Convert Expression GUI Events to Transform IR (T-IR) - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "expr.gui_to_tir"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "tir",
        "tir_ref"
      ],
      "properties": {
        "tir": {
          "type": "object",
          "required": [
            "tir_id",
            "version",
            "steps"
          ],
          "properties": {
            "tir_id": {
              "type": "string",
              "minLength": 8,
              "maxLength": 128
            },
            "version": {
              "type": "string",
              "enum": [
                "1.0"
              ]
            },
            "steps": {
              "type": "array",
              "minItems": 1,
              "items": {
                "type": "object",
                "required": [
                  "step_id",
                  "op"
                ],
                "properties": {
                  "step_id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 64
                  },
                  "op": {
                    "type": "string",
                    "enum": [
                      "select_columns",
                      "rename_column",
                      "filter",
                      "derive_column",
                      "split_column",
                      "merge_columns",
                      "group_by",
                      "join",
                      "pivot",
                      "unpivot",
                      "sort",
                      "cast_type"
                    ]
                  },
                  "depends_on": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "default": []
                  },
                  "params": {
                    "type": "object",
                    "additionalProperties": true
                  }
                },
                "additionalProperties": false
              }
            }
          },
          "additionalProperties": false
        },
        "tir_ref": {
          "type": "object",
          "required": [
            "tir_id"
          ],
          "properties": {
            "tir_id": {
              "type": "string"
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## fonts.embed_full_glyph
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/fonts.embed_full_glyph.input.json",
  "title": "Embed Full Glyph Fonts (Strict) - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "fonts.embed_full_glyph"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "font_plan",
        "embed_policy"
      ],
      "properties": {
        "font_plan": {
          "$ref": "common.defs.schema.json#/$defs/FontPlan"
        },
        "embed_policy": {
          "type": "object",
          "properties": {
            "embed_all_glyphs": {
              "type": "boolean",
              "default": true
            },
            "subset_if_large": {
              "type": "boolean",
              "default": false
            },
            "max_subset_size_bytes": {
              "type": "integer",
              "minimum": 1024,
              "default": 5000000
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/fonts.embed_full_glyph.output.json",
  "title": "Embed Full Glyph Fonts (Strict) - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "fonts.embed_full_glyph"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "font_plan"
      ],
      "properties": {
        "font_plan": {
          "$ref": "common.defs.schema.json#/$defs/FontPlan"
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## render.validate_determinism
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/render.validate_determinism.input.json",
  "title": "Validate Deterministic Rendering (Parity) - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "render.validate_determinism"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "renders",
        "checks"
      ],
      "properties": {
        "renders": {
          "type": "array",
          "minItems": 2,
          "items": {
            "$ref": "common.defs.schema.json#/$defs/RenderRef"
          }
        },
        "checks": {
          "$ref": "common.defs.schema.json#/$defs/DeterminismCheck"
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/render.validate_determinism.output.json",
  "title": "Validate Deterministic Rendering (Parity) - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "render.validate_determinism"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "pass",
        "check_report"
      ],
      "properties": {
        "pass": {
          "type": "boolean"
        },
        "check_report": {
          "type": "object",
          "required": [
            "gpu_cpu_parity",
            "anti_aliasing_policy",
            "random_seed_locked"
          ],
          "properties": {
            "gpu_cpu_parity": {
              "type": "boolean"
            },
            "anti_aliasing_policy": {
              "type": "boolean"
            },
            "random_seed_locked": {
              "type": "boolean"
            },
            "notes": {
              "type": "string",
              "maxLength": 2000
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## verify.structural_equivalence
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/verify.structural_equivalence.input.json",
  "title": "Verify Structural/Editability Equivalence (Dual Gate) - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "verify.structural_equivalence"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "artifact",
        "cdr_design",
        "requirements"
      ],
      "properties": {
        "artifact": {
          "$ref": "common.defs.schema.json#/$defs/ArtifactRef"
        },
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "requirements": {
          "type": "object",
          "properties": {
            "require_text_editable": {
              "type": "boolean",
              "default": true
            },
            "require_tables_structured": {
              "type": "boolean",
              "default": true
            },
            "allow_decorative_raster": {
              "type": "boolean",
              "default": true
            },
            "max_rasterized_elements": {
              "type": "integer",
              "minimum": 0,
              "default": 2
            },
            "element_count_tolerance": {
              "type": "integer",
              "minimum": 0,
              "default": 0
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/verify.structural_equivalence.output.json",
  "title": "Verify Structural/Editability Equivalence (Dual Gate) - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "verify.structural_equivalence"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "pass",
        "report",
        "structural_hashes"
      ],
      "properties": {
        "pass": {
          "type": "boolean"
        },
        "structural_hashes": {
          "$ref": "common.defs.schema.json#/$defs/HashBundle"
        },
        "report": {
          "type": "object",
          "required": [
            "editable_text_ratio",
            "structured_table_ratio",
            "rasterized_elements"
          ],
          "properties": {
            "editable_text_ratio": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "structured_table_ratio": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "rasterized_elements": {
              "type": "integer",
              "minimum": 0
            },
            "missing_elements": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "default": []
            },
            "notes": {
              "type": "string",
              "maxLength": 2000
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## hash.compute_cdr_hashes
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/hash.compute_cdr_hashes.input.json",
  "title": "Compute Hashes for CDR (Layout/Structural/Typography) - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "hash.compute_cdr_hashes"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "cdr_design"
      ],
      "properties": {
        "cdr_design": {
          "$ref": "common.defs.schema.json#/$defs/CdrDesignRef"
        },
        "include_perceptual": {
          "type": "boolean",
          "default": true
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/hash.compute_cdr_hashes.output.json",
  "title": "Compute Hashes for CDR (Layout/Structural/Typography) - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "hash.compute_cdr_hashes"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "hashes"
      ],
      "properties": {
        "hashes": {
          "$ref": "common.defs.schema.json#/$defs/HashBundle"
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## expr.gui_to_mir
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/expr.gui_to_mir.input.json",
  "title": "Convert Expression GUI Events to Metric IR (M-IR) - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "expr.gui_to_mir"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "ui_events",
        "semantic_model"
      ],
      "properties": {
        "ui_events": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "required": [
              "op",
              "ts"
            ],
            "properties": {
              "op": {
                "type": "string",
                "enum": [
                  "create_measure",
                  "create_calc_column",
                  "time_intelligence",
                  "format_measure"
                ]
              },
              "ts": {
                "$ref": "common.defs.schema.json#/$defs/ISODateTime"
              },
              "args": {
                "type": "object",
                "additionalProperties": true
              }
            },
            "additionalProperties": false
          }
        },
        "semantic_model": {
          "$ref": "common.defs.schema.json#/$defs/UUID"
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/expr.gui_to_mir.output.json",
  "title": "Convert Expression GUI Events to Metric IR (M-IR) - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "expr.gui_to_mir"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "mir",
        "mir_ref"
      ],
      "properties": {
        "mir": {
          "type": "object",
          "required": [
            "mir_id",
            "version",
            "measures"
          ],
          "properties": {
            "mir_id": {
              "type": "string",
              "minLength": 8,
              "maxLength": 128
            },
            "version": {
              "type": "string",
              "enum": [
                "1.0"
              ]
            },
            "measures": {
              "type": "array",
              "minItems": 1,
              "items": {
                "type": "object",
                "required": [
                  "name",
                  "expression"
                ],
                "properties": {
                  "name": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                  },
                  "expression": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 4000
                  },
                  "format": {
                    "type": "string",
                    "maxLength": 128
                  },
                  "depends_on": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "default": []
                  }
                },
                "additionalProperties": false
              }
            }
          },
          "additionalProperties": false
        },
        "mir_ref": {
          "type": "object",
          "required": [
            "mir_id"
          ],
          "properties": {
            "mir_id": {
              "type": "string"
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## expr.mir_to_dax
### Input schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/expr.mir_to_dax.input.json",
  "title": "Translate Metric IR (M-IR) to DAX - Input",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "context",
    "inputs",
    "params"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "expr.mir_to_dax"
    },
    "context": {
      "$ref": "common.defs.schema.json#/$defs/ActionContext"
    },
    "inputs": {
      "type": "object",
      "required": [
        "mir"
      ],
      "properties": {
        "mir": {
          "type": "object",
          "required": [
            "mir_id",
            "version",
            "measures"
          ],
          "properties": {
            "mir_id": {
              "type": "string",
              "minLength": 8,
              "maxLength": 128
            },
            "version": {
              "type": "string",
              "enum": [
                "1.0"
              ]
            },
            "measures": {
              "type": "array",
              "minItems": 1,
              "items": {
                "type": "object",
                "required": [
                  "name",
                  "expression"
                ],
                "properties": {
                  "name": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                  },
                  "expression": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 4000
                  },
                  "format": {
                    "type": "string",
                    "maxLength": 128
                  },
                  "depends_on": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "default": []
                  }
                },
                "additionalProperties": false
              }
            }
          },
          "additionalProperties": false
        },
        "dax_dialect": {
          "type": "string",
          "enum": [
            "powerbi",
            "ssas"
          ],
          "default": "powerbi"
        }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
### Output schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/expr.mir_to_dax.output.json",
  "title": "Translate Metric IR (M-IR) to DAX - Output",
  "type": "object",
  "required": [
    "request_id",
    "tool_id",
    "status"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "tool_id": {
      "const": "expr.mir_to_dax"
    },
    "status": {
      "type": "string",
      "enum": [
        "ok",
        "degraded",
        "failed"
      ]
    },
    "refs": {
      "type": "object",
      "required": [
        "dax_code",
        "measure_map"
      ],
      "properties": {
        "dax_code": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200000
        },
        "measure_map": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "name",
              "dax"
            ],
            "properties": {
              "name": {
                "type": "string"
              },
              "dax": {
                "type": "string"
              }
            },
            "additionalProperties": false
          }
        }
      },
      "additionalProperties": false
    },
    "warnings": {
      "$ref": "common.defs.schema.json#/$defs/Warnings"
    },
    "quality": {
      "type": "object",
      "additionalProperties": true
    },
    "failure": {
      "type": "object",
      "properties": {
        "class": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```


---

<a id="sec-08"></a>
# ملحق 1: Permission Matrix (RBAC/ABAC) — مصفوفة الصلاحيات الدقيقة
> Generated: 2026-03-08T22:57:58.868027+00:00


هذا الملحق يضيف طبقة **صلاحيات دقيقة قابلة للتنفيذ** فوق وثيقة المتطلبات الأساسية، بحيث لا يترك أي مجال للاجتهاد عند التنفيذ.

---

## 1) مبادئ الحوكمة
### 1.1 نموذج صلاحيات هجين
- **RBAC**: أدوار + مجموعات (Roles/Groups) بصلاحيات افتراضية.
- **ABAC**: شروط ديناميكية (Attribute-based) مثل تصنيف البيانات، الوقت، مصدر الطلب، سياسة المؤسسة.
- **Object-level ACL**: صلاحيات على كائنات محددة (ملف/مشروع/لوحة…).
- **Row/Column-level Security**: إخفاء أعمدة/صفوف حسب المجموعة/المستخدم.

### 1.2 تسميات صلاحيات موحدة (Naming Convention)
صيغة إلزامية:
- `perm.<domain>.<resource>.<action>`
أمثلة:
- `perm.convert.strict.run`
- `perm.export.pptx`
- `perm.fonts.vault.manage`
- `perm.data.model.relationships.edit`
- `perm.dashboard.publish`
- `perm.admin.audit.read`

### 1.3 نطاقات (Scopes) إلزامية
كل صلاحية تُطبّق على واحد أو أكثر من هذه النطاقات:
- `org` / `workspace` / `project` / `asset` / `artifact` / `recipe` / `connector` / `tool` / `dataset` / `dashboard`

---

## 2) كائنات النظام (Objects) التي يجب أن تدعم ACL
- Organization
- Workspace
- Project
- Asset (input files)
- Artifact (outputs: pptx/docx/xlsx/dashboard/pdf/png)
- Dataset (CDR-Data / Lakehouse tables)
- Semantic Model
- Dashboard
- Report Schedule
- Recipe (IR workflows)
- Connector (Drive/S3/DB/BI)
- Font Pack (Font Vault)
- Template/Brand Kit

كل كائن يدعم:
- `owner`
- `acl`: (user_id أو group_id) -> (role / permissions)
- `classification`: public/internal/confidential/restricted
- `retention_policy_id`
- `versioning_policy_id`

---

## 3) الأدوار الافتراضية (Default Roles)
> يمكن للمؤسسة إضافة أدوار جديدة، لكن يجب أن تبقى هذه الأدوار الافتراضية.

- **OrgOwner**: المالك الأعلى (كل شيء)
- **OrgAdmin**: إدارة المؤسسة والسياسات
- **WorkspaceAdmin**: إدارة مساحة العمل
- **DataAdmin**: إدارة المصادر/النماذج/الأمان على البيانات
- **SecurityAuditor**: قراءة سجلات التدقيق فقط
- **Operator**: تشغيل عمليات تحويل/جداول/جدولة وفق قيود
- **Analyst**: تحليل/لوحات/مقاييس/وصفات
- **Designer**: العروض/التصميم/القوالب/الهوية
- **Editor**: تعديل محتوى ضمن الصلاحيات
- **Viewer**: عرض فقط

---

## 4) الصلاحيات (Permissions) — قائمة إلزامية
### 4.1 إدارة الهوية والحسابات
- `perm.auth.user.invite`
- `perm.auth.user.disable`
- `perm.auth.user.mfa.enforce`
- `perm.auth.session.revoke`
- `perm.auth.sso.manage`

### 4.2 المجموعات والأدوار
- `perm.rbac.group.create`
- `perm.rbac.group.delete`
- `perm.rbac.group.members.manage`
- `perm.rbac.role.create`
- `perm.rbac.role.permissions.edit`
- `perm.rbac.assign.role`

### 4.3 إدارة السياسات (Policy Engine)
- `perm.policy.view`
- `perm.policy.edit`
- `perm.policy.export_rules.edit`
- `perm.policy.degrade_rules.edit`
- `perm.policy.data_residency.edit`
- `perm.policy.retention.edit`

### 4.4 المكتبة/المشاريع
- `perm.library.asset.upload`
- `perm.library.asset.delete`
- `perm.library.asset.share`
- `perm.project.create`
- `perm.project.delete`
- `perm.project.settings.edit`
- `perm.artifact.version.rollback`

### 4.5 STRICT Conversion
- `perm.convert.strict.run`
- `perm.convert.strict.view_internal_metrics` (Admin/Auditor فقط)
- `perm.convert.degrade.font_substitution.allow`
- `perm.convert.degrade.rasterize_decorative.allow`
- `perm.convert.never_fail.override_policy` (OrgOwner/OrgAdmin فقط)

### 4.6 Fonts Vault
- `perm.fonts.vault.view`
- `perm.fonts.vault.upload`
- `perm.fonts.vault.delete`
- `perm.fonts.vault.manage` (licensing metadata/embedding policy)
- `perm.fonts.vault.org_default.set`

### 4.7 Data/Lakehouse
- `perm.data.ingest`
- `perm.data.catalog.read`
- `perm.data.catalog.write`
- `perm.data.query.run`
- `perm.data.model.create`
- `perm.data.model.relationships.edit`
- `perm.data.model.measures.edit`
- `perm.data.security.row_level.manage`
- `perm.data.security.column_level.manage`
- `perm.data.export.raw.allow`

### 4.8 Expressions (Power Query / DAX)
- `perm.expr.tir.create`
- `perm.expr.tir.apply`
- `perm.expr.mir.create`
- `perm.expr.mir.apply`
- `perm.expr.export.powerquery`
- `perm.expr.export.dax`

### 4.9 Dashboards & Reports
- `perm.dashboard.create`
- `perm.dashboard.edit`
- `perm.dashboard.publish`
- `perm.dashboard.share_link`
- `perm.dashboard.export`
- `perm.dashboard.refresh`
- `perm.dashboard.synthetic_data.allow`

- `perm.report.create`
- `perm.report.edit`
- `perm.report.schedule.create`
- `perm.report.schedule.manage`
- `perm.report.diff.generate`

### 4.10 Slides/Presentations
- `perm.slides.generate`
- `perm.slides.edit`
- `perm.slides.brand.apply`
- `perm.slides.translate`
- `perm.slides.motion.enable`
- `perm.slides.export`

### 4.11 Integrations / Connectors
- `perm.connector.create`
- `perm.connector.edit`
- `perm.connector.delete`
- `perm.connector.secrets.manage`
- `perm.connector.use`
- `perm.connector.data_source.approve`

### 4.12 Admin/Audit/Observability
- `perm.admin.audit.read`
- `perm.admin.audit.export`
- `perm.admin.observability.view`
- `perm.admin.slo.manage`
- `perm.admin.keys.manage` (API keys / webhooks)
- `perm.admin.plugins.manage`

---

## 5) مصفوفة الأدوار (Role → Permissions)
> هذه المصفوفة “Baseline” إلزامية. يمكن تضييقها لكن لا يُنصح بتوسيعها بدون Policy review.

### 5.1 OrgOwner
- كل الصلاحيات (Super-set)

### 5.2 OrgAdmin
- كل صلاحيات الإدارة والسياسات + إدارة المستخدمين/المجموعات/الموصلات + الوصول لسجلات التدقيق
- لا يملك افتراضيًا صلاحيات تصدير بيانات خام بدون `perm.data.export.raw.allow` (ABAC قد يمنع)

### 5.3 WorkspaceAdmin
- إدارة مشاريع/مكتبة/أعضاء داخل Workspace
- تشغيل STRICT، لكن لا يغير سياسات المؤسسة العالمية

### 5.4 DataAdmin
- إدارة Lakehouse + Catalog + Semantic Model + RLS/CLS
- إدارة موصلات البيانات داخل Workspace
- إنشاء/تعديل Measures + نشر Dashboards

### 5.5 SecurityAuditor
- `perm.admin.audit.read`, `perm.admin.observability.view`
- لا تعديل ولا تشغيل تحويلات

### 5.6 Operator
- تشغيل تحويلات/جدولة/تنفيذ workflows
- ممنوع عليه تغيير السياسات أو إدارة أسرار الموصلات

### 5.7 Analyst
- ingest/query/model/measures/dashboards/reports/recipes ضمن Workspace
- ممنوع عليه إدارة المستخدمين/السياسات/الأسرار

### 5.8 Designer
- slides/templates/brand/motion/translation
- access محدود للبيانات (حسب ABAC)

### 5.9 Editor
- تعديل artifacts داخل مشروع/كائنات مُخوّل بها
- لا إدارة بيانات عميقة ولا سياسات

### 5.10 Viewer
- عرض فقط + تنزيل حسب سياسة التصدير

---

## 6) ABAC — شروط ديناميكية إلزامية
### 6.1 تصنيف البيانات (Data Classification)
- confidential/restricted تمنع:
  - مشاركة link خارجي
  - تصدير raw data
  - استخدام موصلات غير معتمدة
- internal يسمح بنطاق أوسع

### 6.2 سياق الطلب (Request Context)
- IP allowlist / geo policy
- وقت التشغيل (Business hours)
- جهاز موثوق (Device posture)
- مستوى MFA

### 6.3 سياسات STRICT/Degrade
- السماح بـ rasterize decorative فقط إذا:
  - المستخدم يملك `perm.convert.degrade.rasterize_decorative.allow`
  - وpolicy المؤسسة تسمح به
- السماح بـ synthetic data فقط إذا:
  - `perm.dashboard.synthetic_data.allow`

---

## 7) ربط الصلاحيات بالأدوات (Tool Binding)
- كل Action عند التشغيل يجب أن يعلن:
  - `required_permissions[]`
  - `scope`
  - `object_refs[]`
- Policy engine يتحقق قبل التنفيذ.

---

## 8) اختبارات قبول (Permission Tests)
- user بدون `perm.export.pptx` لا يستطيع التصدير
- user بدون `perm.convert.strict.run` لا يستطيع تشغيل STRICT
- group-based RLS يخفي الأعمدة/الصفوف
- restricted dataset يمنع share link خارجي

---

# نهاية الملحق 1


---

<a id="sec-09"></a>
# ملحق 2: Action Graph Templates (JSON) — قوالب تشغيل جاهزة
> Generated: 2026-03-08T22:57:58.868027+00:00


هذا الملحق يقدّم قوالب JSON جاهزة لتشغيل السيناريوهات الأساسية من Canvas.
**الهدف**: تنفيذ بدون اجتهاد — كل قالب يستخدم أدوات مسجلة (Tool IDs) ويحدد سياسة STRICT/Degrade وAuto/Guided.

---

## 0) مواصفات قالب Action Graph
- `graph_id`: معرف
- `policies`: strict/never_fail/degrade/ar_mode/render_profile
- `nodes[]`: كل Node يمثل Tool action
- `deliver`: ما الذي يُسلم للمستخدم + رسائل التحذير المختصرة

---

## 1) PDF → PPTX STRICT 1:1 Editable (Pixel-0)
```json
{
  "graph_id": "tmpl.pdf_to_pptx.strict.v1",
  "policies": {
    "strict_visual": true,
    "never_fail": true,
    "arabic_mode": "ELITE",
    "mode": "AUTO",
    "degrade": {
      "allow_font_substitution": true,
      "allow_element_rasterize": true,
      "max_rasterized_elements": 2
    },
    "render_profile": { "dpi": 300, "colorspace": "sRGB", "page_range": { "from": 1, "to": 5 } }
  },
  "nodes": [
    { "id": "n1", "tool_id": "extract.pdf_dom", "inputs": { "pdf_asset": "$in.asset_pdf" } },
    { "id": "n2", "tool_id": "cdr.build_design_from_pdf", "inputs": { "pdf_dom": "$out.n1.pdf_dom" } },
    { "id": "n3", "tool_id": "fonts.embed_full_glyph", "inputs": { "font_plan": "$out.n2.font_plan", "embed_policy": { "embed_all_glyphs": true } } },
    { "id": "n4", "tool_id": "repair.quantize_geometry", "inputs": { "cdr_design": "$out.n2.cdr_design", "quantization_profile": { "emu_snap": 8, "snap_text_baselines": true } } },
    { "id": "n5", "tool_id": "export.pptx_from_cdr", "inputs": { "cdr_design": "$out.n4.cdr_design", "font_plan": "$out.n3.font_plan" } },
    { "id": "n6", "tool_id": "render.pdf_to_png", "inputs": { "pdf_asset": "$in.asset_pdf", "render_profile": "$policy.render_profile" } },
    { "id": "n7", "tool_id": "render.pptx_to_png", "inputs": { "pptx_artifact": "$out.n5.artifact", "render_profile": "$policy.render_profile" } },
    { "id": "n8", "tool_id": "verify.pixel_diff", "inputs": { "source_render": "$out.n6.renders[0]", "target_render": "$out.n7.renders[0]", "threshold": 0 } },
    { "id": "n9", "tool_id": "verify.structural_equivalence", "inputs": {
      "artifact": "$out.n5.artifact",
      "cdr_design": "$out.n4.cdr_design",
      "requirements": { "require_text_editable": true, "require_tables_structured": true, "allow_decorative_raster": true, "max_rasterized_elements": 2 }
    } }
  ],
  "deliver": {
    "artifact": "$out.n5.artifact",
    "warnings": ["$out.n2.warnings", "$out.n9.warnings"]
  }
}
```

---

## 2) صورة جدول → Excel Editable (1-Click)
```json
{
  "graph_id": "tmpl.image_table_to_xlsx.strict.v1",
  "policies": {
    "strict_visual": true,
    "never_fail": true,
    "arabic_mode": "ELITE",
    "mode": "GUIDED"
  },
  "nodes": [
    { "id": "n1", "tool_id": "extract.image_segments", "inputs": { "image_asset": "$in.asset_img" } },
    { "id": "n2", "tool_id": "cdr.build_table_from_image", "inputs": { "image_segments": "$out.n1.image_segments", "table_region_id": "$in.table_region_id" } },
    { "id": "n3", "tool_id": "export.xlsx_from_table_cdr", "inputs": { "cdr_data": "$out.n2.cdr_data", "style_source": "$out.n2.cdr_design" } }
  ],
  "deliver": { "artifact": "$out.n3.artifact" }
}
```

---

## 3) وصف نصي → اختيار أعمدة → جدول + Dashboard (Guided)
```json
{
  "graph_id": "tmpl.nl_to_dashboard.guided.v1",
  "policies": { "mode": "GUIDED", "never_fail": true },
  "nodes": [
    { "id": "n1", "tool_id": "orch.intent_parse", "inputs": { "prompt": "$in.prompt", "assets": "$in.assets" } },
    { "id": "n2", "tool_id": "catalog.search_columns", "inputs": { "query": "$out.n1.intent.column_query" } },
    { "id": "n3", "tool_id": "orch.guided_questions", "when": "(count($out.n2.columns) == 0)", "inputs": { "ambiguity": "no_columns_found" } },
    { "id": "n4", "tool_id": "query.run_federated", "inputs": { "query": "$out.n1.intent.query_plan" } },
    { "id": "n5", "tool_id": "model.build_semantic", "inputs": { "cdr_data": "$out.n4.result_table" } },
    { "id": "n6", "tool_id": "insight.profile_dataset", "inputs": { "cdr_data": "$out.n4.result_table" } },
    { "id": "n7", "tool_id": "insight.build_insight_graph", "inputs": { "model": "$out.n5.semantic_model", "profile": "$out.n6.profile" } },
    { "id": "n8", "tool_id": "insight.graph_to_dashboard_plan", "inputs": { "insight_graph": "$out.n7.insight_graph" } },
    { "id": "n9", "tool_id": "gen.dashboard_from_plan", "inputs": { "plan": "$out.n8.plan", "model": "$out.n5.semantic_model" } }
  ],
  "deliver": { "dashboard": "$out.n9.dashboard" }
}
```

---

# نهاية الملحق 2


---

<a id="sec-10"></a>
# World-Class Upgrade Blueprint (محركات المنصة — تفعيل + رفع المستوى العالمي)

> Generated: 2026-03-08T22:46:44.032698Z

هذا المستند يركّز على **تفعيل** و**تعميق** كل محرك حتى يصل لمستوى عالمي في:  
1) **المطابقة البصرية STRICT (Pixel-0)**، 2) **الفعالية على بيانات ضخمة**، 3) **ذكاء AI عملي**، 4) **عروض/تقارير/لوحات Premium**.

---

## 1) Strict Replication Engine — رفع المطابقة إلى معيار عالمي

### 1.1 Governance of Visual Parity (حكم المطابقة)
- بوابة فرق البكسل (Pixel Difference Gate) + عتبة تفاوت قابلة للضبط.
- إلزامية اجتياز **اختبار مقارنة البكسل + اختبار تشابه التجزئة الهيكلية**.
- دعم مقارنة ترتيب تقييم الصيغ (formula evaluation) + مقارنة Floating-point drift.
- محرك كشف الفروقات والانحراف (Diff & Drift Engine).

### 1.2 Deterministic Rendering Farm (إلزامي)
- قفل DPI + sRGB + anti-aliasing + بصمة محرك التصيير.
- تحقق GPU/CPU parity + floating-point normalization policy.
- عمال Render بدون حالة (stateless workers) + صفوف أولوية للمهام.

### 1.3 Root-cause driven repair loop
- Attribution: يحدد سبب الفرق (text metrics / baseline / crop / stroke…)
- Targeted fixes + quantization (EMU/pixel snapping) قبل أي إصلاح.
- Degrade آخر حل: rasterize عنصر زخرفي صغير فقط (لا يمس النص/الجدول/البيانات).

---

## 2) Data/Lakehouse Engine — “Extreme data” واقعية

### 2.1 Columnar + Embedded analytics
- Columnar Arrow memory.
- Embedded analytical engine (DuckDB-class).
- Real-time engine (ClickHouse-class).
- Pre-aggregation + Materialized views.
- Billion-row support.
- Incremental refresh.

### 2.2 Performance governors
- Workload prediction + resource reservation.
- Parallel DAG optimizer.
- Circuit breaker (3-state) + backpressure.
- Caching strategy + cache invalidation strategy.
- Queue-based ingestion + enterprise-scale batch conversion.

---

## 3) Excel Engine — من “ملف” إلى “آلة تنفيذ”

### 3.1 Spreadsheet Virtual Machine (SVM)
- Formula DAG.
- LET / LAMBDA.
- Pivot geometry lock.
- Conditional formatting clone.
- Freeze panes.
- Chart anchor mapping.
- Streaming pivot reconstruction.

### 3.2 GUI Expressions (Power Query + DAX) بطريقة مبسطة
- Transform IR (T-IR) + Metric IR (M-IR).
- GUI Blocks: filter/derive/join/group/pivot/measure…
- Preview execution على sample ثم apply على كامل البيانات.
- تصدير تلقائي إلى Power Query (M) + DAX.

### 3.3 Auto formatting & Arabic Excel polish
- تثبيت صف العناوين تلقائيًا.
- تلوين رؤوس الأعمدة بألوان احترافية.
- اختيار خطوط احترافية مناسبة + خطوط عربية احترافية.
- ضبط عرض الأعمدة تلقائيًا حسب المحتوى.
- اتجاه RTL تلقائيًا + تنسيق أرقام عربي عند الحاجة.

---

## 4) Dashboard Engine — حي + قابل للمقارنة + سريع

### 4.1 Builder محترف
- دعم Drill Down.
- فلاتر عامة للوحة بالكامل.
- Full Manual Override Dashboard.
- Auto Dashboard mode.
- تحويل أي Dashboard إلى تقرير.

### 4.2 Observability + SLAs/SLOs
- لوحات مراقبة (Observability dashboards).
- تحديد أهداف مستوى الخدمة (SLOs) لزمن تحميل اللوحة، توليد التقرير، تحديث الشريحة.
- محاكاة عشرات آلاف المستخدمين المتزامنين للداشبورد.

---

## 5) Reports Engine — جدولة + مقارنة + تحديث حي

- جدولة التقارير + مصمم تقارير.
- مقارنة نسختين/فترتين/تقارير متعددة + إصدار تقرير فروقات.
- عند إنشاء Dashboard يقترح تقريرًا وعرضًا مطابقين.
- عند قرب اجتماع/نشر دوري يقترح تحديث النسخة وتجهيز العرض.

---

## 6) Presentation & Infographic Engine — يتجاوز Gamma فعليًا

- شرائح ذكية للمحتوى الديناميكي (charts/diagrams/illustrations).
- عروض غير خطية قابلة للتقريب والتكبير.
- انتقالات سينمائية + دعم Animations على العناصر.
- إدراج رسوم بيانية تفاعلية في الشرائح.
- مكتبة كاملة من شرائح البيانات + تحويل جداول البيانات إلى شرائح متحركة.
- توليد speaker notes + تلخيص/توسيع/إعادة صياغة.
- تطبيق Brand kit (ألوان/خطوط/شعارات) + مطابقة تصميم عرض مع آخر بنقرة واحدة.
- ترجمة إلى 100+ لغة (مع الحفاظ على التصميم).

---

## 7) AI Engine — “يساعد ولا يتحكم” لكن ينفّذ بذكاء

- AI متوافق مع MCP للاستعلام عن المقاييس مباشرة دون مغادرة المنصة.
- تحويل الأوامر النصية إلى تحليلات/تقارير/لوحات/عروض.
- وضعان دائمًا: Auto (زر واحد) + Guided (أسئلة حد أدنى).
- RAG محايد مع عزل تام لكل منتج (product isolation).

---

## 8) Module Isolation & Governance (Enterprise-grade)
- منع الترابط الخفي بين الوحدات.
- ترقية قاعدة بيانات وحدة واحدة دون تأثير على البقية.
- Audit trail + execution snapshots + policy binding.

---

## 9) What to implement next (بدون ترتيب زمني)
- Triple Verification Gate (pixel + structural hash + semantic consistency).
- Diff & Drift Engine موحّد (design + data + formulas).
- SVM كـ core engine مع deterministic recalc + drift checks.
- Conversion Matrix عالمي (any-to-any) مبني على CDR singularity.


---

<a id="sec-11"></a>
# SPEC — Strict Replication 1:1 Pixel-Perfect (100%) + Functional Strict (LIVE)
**وثيقة تنفيذية فنية موجهة للمنفّذ** — لا تترك مجالًا للاجتهاد
Version: 1.0 (ULTIMATE STRICT)
لغة الإلزام: MUST / SHALL / MUST NOT / SHOULD / MAY (وفق RFC2119)
---
## 0) الهدف النهائي (Non-negotiable)
هذه المواصفة تُعرّف وضع تشغيل واحد اسمه **ULTIMATE STRICT 1:1**.
**ULTIMATE STRICT 1:1** يعني:
1) **PixelDiff MUST = 0** (صفر اختلاف بكسل) لكل صفحة/شريحة/لقطة مرجعية ضمن Farm حتمية.
2) **النتيجة MUST تكون Live/Functional/Editable** حسب نوع المصدر (Dashboard/Slide/Report/Spreadsheet).
3) **لا يُسمح بأي إخراج Static Image** كبديل نهائي للمحتوى (No output may remain a static image).
4) أي تنفيذ لا يحقق (1)+(2)+(3) MUST يُعتبر **FAILED STRICT** ولا يحق له ادعاء “1:1”.
> ملاحظة: هذه الوثيقة لا تصف وضع PRO/ADAPTIVE. هذه الوثيقة تصف STRICT فقط.
> يمكن للمنتج تقديم fallback للمستخدم (Never-Fail)، لكن fallback MUST NOT يُوسم “STRICT 1:1”.
---
## 1) التعاريف (Definitions)
- **Source Render**: صورة مرجعية ناتجة عن تصيير المدخل داخل Farm الحتمية.
- **Target Render**: صورة مرجعية ناتجة عن تصيير المخرج داخل Farm الحتمية.
- **PixelDiff**: مقارنة RGBA byte-wise بعد Normalization (تفاصيل قسم 6).
- **CDR** (Canonical Design Representation): تمثيل داخلي وحيد للتصميم + البيانات (7-layer model).
- **USE** (Universal Structural Equivalence): محرك تحقق يعبر الصيغ ويضمن تكافؤ الهيكل.
- **Functional Strict**: تحويل “شكل” إلى “نظام حي” (Dashboard/Excel/Slides/Report) وليس Bitmap.
- **Determinism**: نفس input + نفس policies + نفس versions => نفس fingerprints + نفس output renders.
- **Drift**: فرق حسابي/قياسي (خصوصًا Excel/BI) ضمن tolerance. في STRICT: drift MUST = 0 للنتائج النهائية، و≤1e-6 فقط للعمليات التي لا يمكن حسمها تمثيليًا (إن وُجدت) ويجب توثيقها كاستثناء مؤسسي (default: ممنوع).
---
## 2) نطاق التحويل (Any-to-Any)
### 2.1 Inputs MUST
- PDF: نص/متجه/صور/Scan.
- Image: PNG/JPG/WebP/TIFF (بما في ذلك لقطات شاشة dashboards، صور تقارير، صور جداول).
- DOCX / PPTX / XLSX / HTML (DOM) كمدخل اختياري.
### 2.2 Outputs MUST
- PPTX: Editable slides + Master mapping + Theme mapping + Live chart binding.
- DOCX: Editable multi-page absolute layout + sections + TOC + data-bound tables.
- XLSX: Structured sheets + formulas + DAG preserved + pivots + CF + deterministic recalc.
- Dashboard: Interactive filtering + cross-filter + drill + export + live refresh + permission-aware.
- PNG/PDF: فقط كـExport/Preview؛ لا يُعد “ناتج STRICT” بذاته.
---
## 3) معادلة النجاح (Definition of STRICT Success)
ULTIMATE STRICT SUCCESS =
**Pixel Parity (PixelDiff=0)**
AND **Structural Parity (hash equality + element count/bbox/ratios)**
AND **Functional Parity (live system)**
AND **Determinism (render/build parity + GPU/CPU parity validated)**
AND **No Static Output** (لا طبقات “صورة” تمثل المحتوى).
إذا فشل أي شرط => **STRICT FAIL**.
---
## 4) المعمارية الإلزامية (Mandatory Architecture)
### 4.1 Reverse Visual Engineering Pipeline (MUST)
1) Ingest
2) Extract (PDF object model / High-res bitmap parser / Vector asset extractor / SVG reconstruction)
3) Layout graph reconstruction
4) Constraint matrix preservation + constraint solver
5) Build CDR (7 layers)
6) CDR-to-any-format transformation engine
7) Export fidelity validation
8) Deterministic rendering farm (source + target)
9) Dual/Triple verification gate
10) Automated rejection on threshold breach
11) Evidence pack + audit + event emission
### 4.2 STRICT Mode Isolation (MUST)
- Strict engine SHALL run in dedicated processing cluster.
- No cross-module mutation guarantee (strict pipelines MUST be pure w.r.t shared state).
- Zero runtime mutation policy for strict rendering.
---
## 5) CDR — Canonical Design Representation (7-Layer) (MUST)
CDR MUST be versioned + snapshotable.
### 5.1 Canonical Unit Normalization (MUST)
- Canonical unit MUST be **EMU**.
- Conversions pt/px/mm MUST be deterministic and recorded per artifact.
- RTL/LTR mirroring math engine MUST be implemented (not “flip direction”).
### 5.2 Top-Level CDR Schema (MUST)
`cdr_design` MUST include:
- `version`
- `pages[]`
- `assets[]` (images/fonts/vectors)
- `layout_graph` (serialized)
- `constraint_matrix` (serialized)
- `fingerprints`:
  - `layout_hash`
  - `structural_hash`
  - `typography_hash`
  - `perceptual_hash` (optional but MUST for regression)
- `immutable_layout_lock_flag` = true in STRICT
### 5.3 Page (MUST)
- `page_index`
- `page_size_emu`
- `background_layers[]`
- `layers[]` with stable z-index order
### 5.4 Layer (MUST)
- `z_index`
- `transform_matrix` (full)
- `rotation`
- `opacity`
- `blend_mode`
- `elements[]`
### 5.5 Element Types (MUST)
كل عنصر MUST يحتوي:
- `element_id`
- `kind` (text/path/shape/image/table/chart/group/container/smartart/…)
- `bbox_emu` (Component bounding-box extractor)
- `transform_matrix`
- `z_index` (داخل layer)
- `clipping_overflow_rules`
- `padding_ratio` / `margin_ratio` / `whitespace_ratio` (للتحقق)
#### 5.5.1 Typography (MUST)
Typography metric extractor MUST extract and preserve:
- font family, size, weight
- kerning table preservation
- line-height ratio preservation
- letter-spacing
- baseline alignment preservation
- text wrapping equivalence logic
- RTL shaping logic (Professional Typography Engine)
- glyph integrity validation
Font embedding system MUST support **full glyph embedding**.
Font fallback prohibition rule MUST be enforced in STRICT.
Glyph vectorization fallback engine MUST exist (لكن استخدامها MUST NOT يحول النص إلى غير قابل للتحرير في strict output؛ أي fallback يجب أن ينتج نصًا قابلًا للتحرير في الصيغة الهدف أو يعد FAIL STRICT).
#### 5.5.2 Geometry (MUST)
- border radius preservation
- stroke width preservation
- Z-index layer preservation
- rotation/transform preservation
- opacity/shadow vector preservation
- smartart geometry reconstruction (إذا ينطبق)
#### 5.5.3 Images (MUST)
- image DPI normalization engine
- color space consistency enforcement (sRGB lock)
- resolution normalization logic
- high DPI scaling control
- anti-aliasing consistency policy
- clipping/masks preservation
- no static-output rule: الصور الأصلية (photographs/logos) مسموحة كـassets، لكن MUST NOT تُستخدم لتسوية عناصر يجب أن تكون مكونات حيّة (جدول/نص/مخطط/لوحة).
#### 5.5.4 Tables (MUST)
Grid detection and reconstruction engine MUST:
- detect grid, merges
- merged cell geometry preservation
- row height preservation
- column pixel-width preservation
- freeze pane preservation logic (XLSX)
- conditional formatting rule extraction and recreation
- pivot table geometry preservation (إن وجدت)
- table -> structured dataset binding (Functional strict)
#### 5.5.5 Charts (MUST)
Professional Chart Engine MUST:
- chart type detection
- axis scaling inference
- tick interval preservation
- legend offset preservation
- color mapping extraction & consistency
- tooltip logic, drill support
- RTL axis inversion support
- chart data-binding preservation engine
- live data re-binding validator
---
## 6) Deterministic Rendering Farm (MUST)
هذه هي “الحقيقة” التي يُقاس عليها 1:1.
### 6.1 Environment-independent rendering engine (MUST)
- OS image pinned by hash
- PDF renderer pinned by version+hash
- DOCX/PPTX/XLSX renderers pinned by version+hash
- deterministic random seed enforcement
- floating-point normalization policy
- memory-stable rendering pipeline
- build determinism enforcement
### 6.2 GPU vs CPU rendering parity validation (MUST)
- MUST validate parity on canary corpus.
- If parity cannot be guaranteed: farm MUST force single path (CPU-only or GPU-only) and lock it.
### 6.3 Render Outputs (MUST)
Each render MUST output:
- raw PNG RGBA (8-bit) + metadata
- engine_fingerprint
- render_config_hash
- pixel_hash (byte hash of normalized RGBA)
- perceptual_hash (for drift detection)
- timestamps + audit binding
---
## 7) Image & PDF Normalization (MUST)
### 7.1 High-resolution bitmap parser (MUST)
- decode image
- apply EXIF orientation
- convert to sRGB (ICC to sRGB)
- normalize alpha (premultiplied policy locked)
- unify gamma
- ensure deterministic raster pipeline
### 7.2 PDF object model extractor (MUST)
- extract text, vectors, images, fonts
- preserve transforms
- preserve clipping/overflow
---
## 8) Pixel Diff Engine — 100% (MUST)
### 8.1 Compare Requirements
- Dimensions MUST match exactly before comparison.
- No resampling allowed at compare time.
- Comparison MUST be strict RGBA byte-wise after normalization.
### 8.2 PixelDiff Definition
PixelDiff = (عدد البكسلات التي تختلف بأي قناة RGBA) / (إجمالي البكسلات)
**STRICT MUST**: PixelDiff == 0.
أي فرق => fail.
### 8.3 Sub-pixel precision support
- Sub-pixel rendering precision support MUST exist in layout/quantization to prevent drift.
- Any mention of “≤0.1%” is NOT accepted in ULTIMATE STRICT. That threshold may exist only in PRO mode (out of scope).
---
## 9) Structural Hash + Perceptual Hash + Layout Entropy (MUST)
### 9.1 Structural hash generator (MUST)
- Must hash:
  - element kinds + counts
  - bbox_emu values (quantized)
  - z-order
  - transforms
  - typography metrics
  - table grid geometry
  - chart specs
- Layout hash equality enforcement MUST hold for strict outputs (within deterministic quantization).
### 9.2 Perceptual hash generator (MUST)
- Used for regression drift detection (not for acceptance in strict—acceptance is PixelDiff=0).
### 9.3 Density/Hierarchy/Whitespace analyzers (MUST)
- density distribution analyzer
- hierarchy weight analyzer
- whitespace ratio preservation logic
- spacing ratio preservation engine
- container padding ratio preservation
- margin ratio preservation
- nested layout hierarchy preservation
- composite element grouping preservation
- element count preservation validator
These MUST be computed and stored; acceptance uses them as additional reject signals (if any mismatch, FAIL STRICT even if PixelDiff=0 due to accidental overlay tricks).
---
## 10) STRICT Mode Switches (MUST)
The pipeline MUST provide and enforce:
- Layout snapping disable switch (STRICT)
- Auto-spacing disable switch (STRICT)
- Auto-hierarchy rebalance disable switch (STRICT)
- Beautification engine isolation switch
- Immutable layout lock flag (true)
---
## 11) Universal Structural Equivalence (USE) Engine (MUST)
USE MUST validate cross-format equivalence:
- PDF -> PPTX -> PDF round-trip consistency (where applicable)
- PPTX -> DOCX layout absolute consistency
- XLSX -> dashboard binding consistency
- screenshot-to-PPT reconstruction validator
- PDF-to-BI reconstruction validator
- Excel-to-dashboard reconstruction validator
- Dashboard-to-PPT reconstruction validator
- Image-to-dashboard reconstruction validator
Acceptance rule:
- USE MUST PASS alongside PixelDiff for STRICT claim.
---
## 12) Constraint Solver & Layout Reconstruction (MUST)
- Layout graph reconstruction engine MUST rebuild container hierarchy and alignments.
- Constraint matrix preservation engine MUST preserve constraints.
- Constraint solver MUST produce deterministic solution (no random tie-breakers).
- Directional Deterministic Equivalence validator MUST ensure RTL/LTR transforms are mathematically correct.
---
## 13) Spreadsheet Strict 1:1 (XLSX) (MUST)
Excel Reconstruction MUST produce:
- structured sheets
- editable formulas
- formula dependency DAG preserved
- numeric precision enforcement deviation MUST be 0 in strict outputs; if an institutional exception exists, max deviation MUST be ≤ 1e-6 AND must be explicitly enabled in policy and reflected in evidence pack
- spreadsheet recalculation determinism engine
- spreadsheet virtual machine (SVM)
- pivot tables recreated
- conditional formatting recreated
- freeze panes preserved
- merged cell geometry preserved
- column pixel-width and row height preserved
---
## 14) Functional Strict Addendum (MUST) — LIVE SYSTEM
### 14.1 No output may remain a static image (MUST)
If source represents:
- Dashboard => output MUST be live dashboard
- Slide => output MUST be editable presentation
- Report => output MUST be editable report
- Spreadsheet => output MUST be structured workbook
### 14.2 Dashboard Functional Requirements (MUST)
- interactive filtering
- cross-filter behavior
- drill-down capability
- export capability
- live refresh capability
- permission-aware rendering
- all filters/legends/drill indicators reconstructed as real logic/components
Data binding engine MUST allow:
- placeholder data -> real dataset mapping
- auto schema suggestion
- column matching inference
- measure detection inference
- aggregation preservation
- time intelligence auto-detection
- KPI recalculation with new data
### 14.3 Presentation Functional Requirements (MUST)
- editable slides
- master slide mapping
- slide-level theme mapping
- editable text fields
- structured layout zones
- live chart binding + dynamic refresh
### 14.4 Report Functional Requirements (MUST)
- editable multi-page layout
- structured sections
- TOC generation
- data-binding for tables
- live recalculation support
- export-ready compliance
### 14.5 Excel Functional Requirements (MUST)
- live recalc enabled (SVM)
- dependency graph preserved
- pivots & CF recreated
- exportable + governed + versionable
---
## 15) Multi-format Export Fidelity Validator (MUST)
- Each exporter MUST run post-export validation:
  - structural equivalence scoring
  - density deviation scoring
  - hierarchy preservation scoring
  - component integrity validation
  - data-binding verification
  - cross-format regression testing
If any validation fails => FAIL STRICT.
---
## 16) Rendering Regression Harness + Test Suites (MUST)
- Rendering regression test harness
- Structural regression test suite
- Pixel regression test suite
- Cross-format round-trip validation engine
- Any-to-any format transformation validation matrix
### 16.1 Golden Corpus (MUST)
The corpus MUST include:
- Arabic/English/mixed typography
- gradients, shadows, opacity, masks
- icons/vectors/SVG
- scanned PDFs
- table screenshots with merges
- dashboard screenshots with filters/legends/drill cues
- Excel files with formulas/pivots/CF
STRICT acceptance in CI:
- PixelDiff=0 for every strict case.
- Structural gate pass.
- Determinism pass (fingerprints identical).
- Drift pass (0 or policy-defined).
---
## 17) Threshold Enforcement Engine (MUST)
- Hard reject below limits:
  - PixelDiff != 0 => reject strict
  - Structural hash mismatch => reject strict
  - Determinism mismatch => reject strict
  - Functional parity missing => reject strict
- Automated rejection on threshold breach MUST occur before any “success” message.
---
## 18) Audit, Events, Evidence Pack (MUST)
### 18.1 Evidence Pack (MUST)
Each STRICT run MUST store:
- source renders + target renders
- pixel hashes + engine fingerprints
- PixelDiff report (must be 0)
- structural hash report
- USE report
- drift report (if XLSX/BI involved)
- full action graph snapshot
- tool versions + farm image id + font snapshot id
- performance envelope report
### 18.2 Audit log binding (MUST)
- Every strict render MUST write immutable audit entry.
- Event emission on render completion MUST be emitted.
---
## 19) Performance Envelope (MUST)
- Performance envelope validator under STRICT mode MUST exist.
- Stress-test suite for 10K concurrent strict renders MUST pass within defined SLOs.
- Memory-stable rendering pipeline MUST avoid nondeterministic memory effects.
- Isolation of strict engine within dedicated processing cluster MUST be maintained.
---
## 20) Anti-cheating (MUST)
- It is forbidden to:
  - bypass pixel gate
  - bypass structural gate
  - bypass determinism gate
  - return “success” without evidence pack
  - present placeholder/static outputs as functional
- Build determinism enforcement MUST ensure deterministic build artifact hash equality.
- Zero runtime mutation policy MUST be enforced.
---
## 21) Minimal-Question Execution (MUST)
- STRICT pipelines MUST run end-to-end automatically.
- User questions MUST be limited to cases where a required input is missing and cannot be inferred (e.g., ambiguous table region).
- The system MUST NOT claim STRICT success unless all gates passed and evidence pack stored.
---
## 22) أدوات إلزامية (Tooling Checklist)
Implementer MUST implement and wire (at minimum):
- PDF object model extractor
- High-resolution bitmap parser
- Vector asset extractor + SVG structural reconstruction
- DOCX layout object extractor
- PPTX slide master extractor
- HTML DOM structural extractor
- CDR engine (7-layer) + serialization
- Constraint solver
- Structural hash generator + layout hash equality enforcement
- Perceptual hash generator
- Pixel diff engine (exact, PixelDiff=0)
- Rendering determinism validator + build determinism enforcement
- GPU vs CPU parity validation
- Typography metric extractor + kerning/line-height/baseline preservation
- Font embedding (full glyph) + fallback prohibition
- Grid detection & reconstruction (tables)
- Chart engines (axis/ticks/legend/color binding)
- Excel engines (SVM, DAG, pivots, CF, freeze panes, widths/heights)
- USE engine + cross-format validation matrix
- Rendering regression harness + pixel/structural test suites
- Audit + event emission + evidence pack generator
- Strict engine cluster isolation + performance envelope validator
---
# END — هذه الوثيقة تُستخدم كمرجع تنفيذ STRICT 1:1 Pixel-Perfect 100% + Functional Strict.


---

<a id="sec-12"></a>
# ULTIMATE STRICT 1:1 — PixelPerfect + Functional Replication (NO EXCEPTIONS)
**وثيقة تنفيذية فنية موجهة للمنفّذ** — لا تترك مجالًا للاجتهاد
**Strict Claim Gate:** PixelDiff == 0 (صفر اختلاف بكسل) داخل Farm حتمية
**NO EXCEPTIONS:** لا عتبات، لا Approx، لا “قريب”، لا خروج مبكر، لا Raster للـCore، لا Overlay خداعي
Language of enforcement: MUST / SHALL / MUST NOT / SHOULD / MAY
---
## 0) التعريف النهائي (Non-Negotiable Definition)
### 0.1 تعريف STRICT_1TO1 (الوحيد المسموح)
STRICT_1TO1 SHALL mean:
1) **PixelPerfect**: `PixelDiff(SourceRender, TargetRender) MUST == 0` لكل صفحة/شريحة/لقطة.
2) **Functional Strict**: التحويل ليس “نسخ صورة”، بل **إعادة بناء هيكل حي**:
   - Image/PDF → **Dashboard حي** (filters/drill/export/refresh)
   - Image/PDF → **Presentation حي** (editable text/shapes/master/theme/charts)
   - Image/PDF → **Word report حي** (editable layout + sections + TOC + tables)
   - Image/PDF → **Excel model حي** (structured cells + formulas + pivots + CF + recalc)
3) **Core MUST remain live**: النص/الجداول/المخططات/المؤشرات/الفلاتر MUST تكون مكوّنات حية (ليس صور).
4) **Truthfulness**: النظام MUST NOT يصرّح “STRICT SUCCESS” إلا بعد اجتياز كل البوابات وتخزين Evidence Pack.
> ملاحظة إلزامية: يمكن للمنتج تقديم مخرجات غير STRICT (fallback) لكي “لا يفشل المستخدم”، لكن تلك المخرجات MUST NOT تُوسم STRICT_1TO1 مطلقًا.
---
## 1) نطاق الإدخال/الإخراج (Any-to-Any via CDR)
### 1.1 Inputs MUST support
- PDF: نص/متجه/صور/Scan.
- Images: PNG/JPG/WebP/TIFF (بما فيها dashboards/screenshots/infographics/tables/reports).
- Office/HTML (اختياري): PPTX/DOCX/XLSX/HTML DOM.
### 1.2 Outputs MUST support
- PPTX (Editable).
- DOCX (Editable + Absolute layout in STRICT).
- XLSX (Editable structured workbook).
- Dashboard (Web interactive).
- PNG/PDF (Preview/Export فقط — ليست Strict output بذاتها).
---
## 2) بوابات القبول (STRICT Gates) — لا نجاح بدونها
STRICT_SUCCESS = PASS(A) ∧ PASS(B) ∧ PASS(C) ∧ PASS(D) ∧ EvidencePackStored
### Gate A — Deterministic Farm Validation (MUST)
قبل أي مقارنة:
- fixed DPI
- fixed viewport size
- deterministic Chromium rendering (لـHTML/Dashboard snapshots)
- fixed font set + consistent hinting
- fixed anti-aliasing configuration
- deterministic GPU/CPU rendering mode (أو forced single path)
- deterministic random seed
- floating-point normalization policy
- memory-stable rendering pipeline
**Fail => STOP STRICT**.
### Gate B — PixelPerfect (MUST)
- `success = (PixelDiff == 0)`
- أي PixelDiff>0 => MUST trigger Optimization/Repair loop; MUST NOT return success.
- SSIM/LPIPS/Perceptual metrics MAY تُستخدم فقط كإشارة توجيه للـoptimization، **ولا يجوز أن تنهي التحقق بنجاح**.
### Gate C — Structural & Live Components (MUST)
- Layout graph exists + serialized
- Container hierarchy exists (nested layout preserved)
- Clipping/overflow preserved
- Padding/margin ratios preserved
- Composite grouping preserved
- Charts => data-bound charts (أو reconstructed synthetic binding — موضح في قسم 10)
- Tables => structured datasets/cells
- Filters/legends/drill indicators => functional components
### Gate D — Determinism & Mutation (MUST)
- نفس input + نفس policies + نفس versions => نفس fingerprints (build + render + CDR).
- No runtime mutation allowed in STRICT pipeline.
- Detect “single node mutation” must flag diff hotspot.
- structuredClone graph identity preserved (CDR graph equivalence tests).
---
## 3) المبدأ المركزي: CDR هو الطريق الوحيد (MUST)
كل التحويلات MUST تمر عبر:
**Ingest → Extract → Build CDR → Export → Render(Target) → Verify(Pixel/Structure) → Repair Loop → Re-export → Re-verify**
ممنوع:
- مسارات خاصة per format خارج CDR
- “shortcuts” تتجاوز الـgates
- أي tool بلا Schema/Policy/Permissions
---
## 4) Reverse Visual Engineering Pipeline (MUST)
### 4.1 Stages (يجب تنفيذها كما هي)
1) **Ingest**: hash, classify, normalize input.
2) **Extract**:
   - PDF object model extractor
   - SVG structural reconstruction
   - High-resolution bitmap parser (للصور)
   - DOCX layout object extractor
   - PPTX slide master/theme extractor
   - HTML DOM structural extractor
3) **Layout Graph Reconstruction**:
   - container hierarchy inference
   - alignment/spacing inference
   - grid detection (tables, dashboards)
4) **Constraint Solver**:
   - constraint matrix preservation
   - deterministic solver (no random tie-breakers)
5) **CDR Build**:
   - versioned snapshots
   - immutable layout lock flag = true
6) **CDR-to-Any Transformation**
7) **Export Fidelity Validator**
8) **Deterministic Rendering (Source + Target)**
9) **Threshold Enforcement Engine (hard reject below limits)**
10) **Audit + Evidence Pack**
---
## 5) CDR Specification (7-Layer) — Implementation Contract
> CDR MUST be serializable, versioned, snapshot-able, and hashable deterministically.
### 5.1 Canonical Units & Quantization (MUST)
- Canonical unit = EMU
- deterministic conversions pt/px/mm with recorded policy id
- quantization profile must be explicit (emu_snap, baseline_snap, stroke_snap)
### 5.2 Top-Level (MUST)
`cdr_design`:
- version
- pages[]
- assets[] (fonts/images/vectors)
- layout_graph (serialized)
- constraint_matrix (serialized)
- fingerprints:
  - layout_hash
  - structural_hash
  - typography_hash
  - render_intent_hash
- immutable_layout_lock_flag = true
### 5.3 Page/Layer/Element (MUST)
- stable z-order
- full transform matrices
- clipping & overflow rules
- padding_ratio / margin_ratio / whitespace_ratio recorded for validation
### 5.4 Typography Engine Contract (MUST)
Typography must preserve:
- font metric enforcement
- kerning table preservation
- line-height ratio preservation
- letter spacing
- baseline alignment enforcement
- text wrapping equivalence logic
- RTL shaping logic (professional Arabic mode)
- glyph integrity validation
- identical font rendering inside farm
**Font fallback prohibition rule (STRICT)**:
- If required font not available in Fonts Vault snapshot => STRICT FAIL (with “required_fonts[]” list).
- Strict MUST NOT silently substitute.
### 5.5 Tables Contract (MUST)
- grid geometry preserved (rows/cols/merges)
- cell paddings preserved
- borders/fills/colors preserved
- structured dataset binding exists
- XLSX: col widths/row heights preserved + freeze panes + CF + pivots if present
### 5.6 Charts Contract (MUST)
- declarative chart specification
- axis scale validation + tick interval preservation
- legend logic + color mapping consistency
- tooltip logic + drill support + export consistency
- RTL axis inversion support
- data binding is mandatory (see Section 10)
---
## 6) Deterministic Rendering Farm (Source of Truth) (MUST)
### 6.1 Farm Immutability (MUST)
- OS/container pinned by hash
- renderers pinned by version+hash
- fonts snapshot pinned
- GPU pool separation (if GPU used)
- deterministic chromium flags pinned
- deterministic build artifact hash equality enforced
### 6.2 Render Output (MUST)
For each page:
- normalized RGBA PNG (8-bit) + metadata
- engine_fingerprint
- render_config_hash
- pixel_hash (hash of normalized bytes)
---
## 7) PixelDiff Engine (Exact) (MUST)
### 7.1 Normalization pipeline (MUST)
- decode
- apply EXIF orientation
- ICC→sRGB lock
- alpha premultiplication normalization
- gamma stabilization
- ensure identical dimensions (no resample at compare-time)
### 7.2 Compare rule (MUST)
- strict RGBA byte-wise compare after normalization
- PixelDiff = count(pixels with any channel difference) / total_pixels
- STRICT MUST: PixelDiff == 0
- heatmap generated on any mismatch + diff hotspot attribution
---
## 8) PixelPerfect Enforcement Phase (MUST)
هذه المرحلة تُقفل أي “التفاف”:
- The system MUST NOT return success until PixelDiff==0 under the controlled rendering environment.
- All validation MUST run inside the deterministic rendering container.
- SSIM/LPIPS MAY guide optimization; MUST NOT terminate validation successfully.
---
## 9) Optimization Loop Control (MUST) — الوصول لـ PixelDiff==0
### 9.1 Success function (MUST)
`isPerfect = (pixelDiffCount === 0)` فقط.
أي flag/score آخر MUST NOT يمنح “perfect”.
### 9.2 ممنوعات الخروج المبكر (MUST NOT)
- MUST NOT exit because SSIM ≥ threshold
- MUST NOT exit on “plateau” إذا PixelDiff>0
- MUST NOT treat explicit 0 as falsy in config defaults (use nullish semantics; explicit 0 must be preserved)
### 9.3 Parameter Optimization (MUST)
Optimization MUST adjust (iteratively) حتى PixelDiff==0:
- element position (x,y)
- element width/height
- container dimensions
- margins/padding
- font size
- line height
- letter spacing
- alignment
- grid snapping
- baseline offsets
- stroke widths
- crop/mask offsets
### 9.4 Root-Cause Attribution (MUST)
لكل hotspot:
- map diff region → candidate elements by bbox intersection
- element toggling (render without element) to confirm attribution
- per-layer re-render
- text probes (kerning/lineheight/baseline)
- alpha edge probes (clipping/masks)
Outputs: causes[] + suggested_fix[] + deterministic patch plan.
### 9.5 Repair Application Order (MUST)
1) geometry quantization (emu_snap)
2) baseline/line-height/bbox repairs
3) kerning/letter-spacing
4) stroke repairs
5) crop/mask edge snapping
6) vector sampling precision increase
7) chart/table geometry refinement
Repeat until PixelDiff==0 (no exceptions).
---
## 10) Functional Strict (STRUCTURE → LIVE SYSTEM) (MUST)
Strict replication is NOT image-to-image copying.
The goal is **Structural Functional Equivalence** with PixelPerfect.
### 10.1 Mandatory component conversions (MUST)
- detected visual elements → live components
- charts → data-bound charts
- KPIs → live metric objects
- tables → structured datasets
- filters → functional filter components
- legends → interactive legend controls
- drill indicators → real drill-down logic
- grouping → layout container hierarchy
### 10.2 Data binding engine (MUST)
- placeholder data → real dataset mapping
- auto schema suggestion
- column matching inference
- measure detection inference
- aggregation logic preservation
- time intelligence auto-detection
- KPI recalculation with new data
### 10.3 Chart Data Binding when source is image/PDF (MUST)
- If underlying data present (PDF vectors/tables): MUST extract and bind.
- If underlying data not present (pure screenshot):
  - MUST reconstruct a synthetic dataset that **exactly reproduces chart geometry** (so PixelDiff==0),
  - MUST label binding as `synthetic_reconstructed`,
  - MUST support later rebinding to real dataset with schema matching (without breaking layout).
---
## 11) Image Inputs — STRICT handling without breaking “Live Core”
### 11.1 Segmentation & Classification (MUST)
Split image into regions:
- text
- table
- chart
- icon/vector-like
- photo/logo (true raster content)
- background/gradients
Each region MUST have confidence + bbox + mask.
### 11.2 Reconstruction rule (MUST)
- text/table/chart regions MUST be rebuilt as live components.
- photo/logo regions MAY remain as image assets (because they are intrinsically raster).
- background gradients MUST be recreated using supported primitives; if not representable, STRICT FAIL (no raster fallback for core/background in STRICT).
### 11.3 Table from Image → XLSX (MUST)
- grid detection (lines/edges; merges inference)
- per-cell OCR (language auto; Arabic shaping aware)
- style extraction (fills/borders/alignment/font guess but must resolve fonts in vault)
- build structured cells + merges
- render XLSX in farm → verify PixelDiff==0 → repair widths/heights/paddings until 0
### 11.4 Dashboard from Image (MUST)
- infer layout containers (header/sidebar/cards/table/chart blocks)
- infer interactions (filters from UI patterns; legends; drill cues)
- build live dashboard components
- snapshot render in farm → PixelDiff==0 → repair layout/typography until 0
---
## 12) Arabic Professional Mode (STRICT_ARABIC) (MUST)
> هذا وضع منفصل عن “ترجمة النص”. وهو يضمن أن RTL ليس مجرد flip.
- Professional Arabic mode SHALL override generic translation engines.
- typography engine MUST handle bidi, shaping, justification, mixed scripts.
- identical font rendering in farm MUST be ensured.
- Any deviation that breaks determinism is forbidden.
---
## 13) Universal Structural Equivalence (USE) Engine (MUST)
USE validates cross-format equivalence:
- image→dashboard validator
- screenshot→PPT validator
- PDF→BI validator
- Excel→dashboard validator
- dashboard→PPT validator
- cross-format round-trip checks where applicable
**USE MUST PASS** alongside Pixel gate for STRICT claim.
---
## 14) Multi-Format Export Fidelity Validator (MUST)
Every exporter MUST run post-export checks:
- structural equivalence scoring
- density deviation scoring
- hierarchy preservation scoring
- component integrity validation
- data-binding verification
- export parity validation
Fail => STRICT FAIL.
---
## 15) Anti-Cheating & Hard-Reject (MUST)
- hard failure on fidelity breach policy
- no bypass of dual fidelity gates
- no runtime mutation allowed
- deterministic builds only
- STRICT_REPLICATION SHALL override all adaptive engines
Deviation requires Constitutional Amendment.
---
## 16) Required Test Suites (MUST) — إثبات “فعليًا 1:1”
### 16.1 Golden Corpus (MUST)
Corpus includes:
- Arabic/English/mixed typography
- gradients/shadows/opacity/masks
- icons/vectors/SVG
- scanned PDFs
- table screenshots with merges
- dashboard screenshots with filters/legends/drill cues
- Excel files with formulas/pivots/CF
### 16.2 E2E PixelPerfect Suite (MUST)
- Dashboard layout types → PixelDiff==0
- Table layout types → PixelDiff==0
- Document layout types → PixelDiff==0
- Arabic RTL cases → PixelDiff==0
- Multi-page cases → PixelDiff==0
- Cross-layout mismatch sanity → PixelDiff>0 (to validate detector)
- Single node mutation detection → hotspot localized
- structuredClone graph identity → equal
- 5 sequential renders of same graph → all PixelDiff==0
### 16.3 Regression Harness (MUST)
- pixel regression test suite
- structural regression test suite
- cross-format validation matrix
### 16.4 SSIM/LPIPS Bypass Prevention (MUST)
- Tests MUST assert: SSIM cannot mark perfect unless PixelDiff==0.
- plateau exit cannot mark perfect unless PixelDiff==0.
- config defaults must preserve explicit 0 thresholds (no `||` behavior).
---
## 17) Evidence Pack (MUST) — شرط إعلان النجاح
Each STRICT run MUST store:
- source renders + target renders
- pixel hashes + engine fingerprints
- PixelDiff report (must be 0)
- structural hash report
- USE report
- drift report (إذا XLSX/BI)
- full action graph snapshot
- tool versions + farm image id + font snapshot id
- audit log binding + event emission
No EvidencePack => MUST NOT claim STRICT success.
---
## 18) AI Operator Mode (MUST)
AI must operate via:
**Plan → Preview → Approval → Execute → Audit**
- cannot bypass Policy Engine
- can propose drift repair suggestion, trigger workflow, create KPIs, generate snapshots
- must remain truthful: no “done” without gates+evidence
---
# END OF SPEC — STRICT_1TO1 = PixelDiff==0 + Live Structure. No exceptions. No ambiguity.


---

<a id="sec-13"></a>
# ULTIMATE STRICT 1:1 — PixelPerfect + Functional + Editable (Single Implementer Spec)
**وثيقة تنفيذية فنية واحدة** (Single Source of Truth) — **لا تترك مجالًا للاجتهاد أو “ابتكار” المنفّذ**
**STRICT CLAIM = PixelDiff == 0** (صفر اختلاف بكسل) داخل Farm حتمية + **Functional + Editable**
**NO APPROX / NO 99.9999 / NO THRESHOLDS / NO DEMO / NO CLAIMS WITHOUT PROOF**
> **قاعدة هذه الوثيقة**: أي سلوك/قرار غير مذكور هنا صراحةً = **ممنوع**.
> أي تعديل على النص = **غير مسموح** إلا عبر “Amendment” رسمي موقع (خارج نطاق التنفيذ).
> الكلمات MUST/SHALL/MUST NOT إلزامية 100%.
---
## 0) التعريف النهائي الذي لا يقبل أي التباس
### 0.1 تعريف STRICT_1TO1_100 (الوحيد المعتمد)
النتيجة تُعتبر STRICT_1TO1_100 فقط إذا تحقق **كل** ما يلي:
1) **PixelPerfect**:
   لكل صفحة/شريحة/لقطة:
   `PixelDiff(SourceRender, TargetRender) MUST == 0`
   **بدون أي عتبة**. أي PixelDiff>0 = FAIL.
2) **Functional/Live** (ليس Bitmap):
   - تحويل Dashboard/لقطة Dashboard → **Dashboard حي** (filters/drill/cross-filter/export/refresh).
   - تحويل تقرير → **Word Report حي** (Editable layout + sections + TOC + tables).
   - تحويل جداول → **Excel حي** (structured cells + formulas + recalc + pivots + CF).
   - تحويل شرائح/تصميم → **PPTX حي** (editable text/shapes + master/theme + data-bound charts).
3) **Editable Core 100%**:
   - كل نص مرئي MUST يكون TextRuns (ليس صورة)
   - كل جدول مرئي MUST يكون Table/Cells structured
   - كل مخطط مرئي MUST يكون Chart data-bound (بيانات حقيقية أو Synthetic مُعاد بناؤها)
   - كل فلتر/تفاعل في dashboard MUST يكون منطق حي (ليس صورة)
   - الصور الطبيعية (صور أشخاص/شعارات/خامات) مسموحة كـAssets لأنها “جوهرها raster”، لكن MUST تكون قابلة للتحرير بالمعنى الوظيفي (crop/replace/position/mask) ولا تستخدم لتمثيل نص/جدول/مخطط/فلتر.
4) **Determinism**:
   نفس المدخل + نفس السياسات + نفس إصدارات المحركات + نفس Font snapshot + نفس Farm image
   => MUST ينتج نفس Renders (pixel_hash identical) ونفس Fingerprints.
5) **Evidence Pack إلزامي**:
   لا يُسمح بإعلان SUCCESS قبل تخزين Evidence Pack كامل (Section 13).
> **ممنوع**:
> - أي “تقريب”، أي “overlay خداعي”، أي “Rasterize للـCore”، أي “عتبة 0.1%”.
> - أي ادّعاء “تم” أو “STRICT” بدون Evidence Pack وPass للبوابات.
---
## 1) نطاق التحويل (Any → Any) — إلزامي
### 1.1 Inputs (MUST)
- PDF: نص/متجه/صور/Scan.
- Image: PNG/JPG/WebP/TIFF (screenshots, infographics, tables, dashboards, reports).
- PPTX/DOCX/XLSX/HTML DOM (optional but MUST إذا تم تفعيلها في المنتج).
### 1.2 Outputs (MUST)
- PPTX / DOCX / XLSX / Dashboard (Live + Editable).
- PNG/PDF (Preview/Export فقط؛ ليست “Strict Output”).
---
## 2) البنية الإلزامية (Architecture — MUST)
### 2.1 Execution Control Layer (ECL / Action Runtime)
- **كل شيء** يُنفّذ عبر Action Runtime فقط.
- لا يوجد “مسار خاص” bypass.
- كل Tool مسجل في Tool Registry ويملك:
  - Input/Output JSON Schemas
  - required_permissions
  - determinism_level
  - fidelity_target = PIXEL_0
  - failure classes
- أي Tool بدون schema = **غير قابل للتشغيل**.
### 2.2 Strict Engine Isolation
- Strict pipelines تعمل في Dedicated cluster (strict pool).
- لا تفاعل مع shared mutable state.
- Zero runtime mutation policy على strict pool.
---
## 3) خط الأنابيب الإلزامي (Pipeline — MUST)
**لا يُسمح بأي تغيير على هذا الترتيب**:
1) Ingest (hash + classify + policy bind)
2) Extract (PDF DOM / Image normalize+segments / Office DOM)
3) Build Layout Graph + Constraint Matrix
4) Build CDR (7 layers) + Hashes
5) Export Target (PPTX/DOCX/XLSX/Dashboard)
6) Render Source داخل Farm
7) Render Target داخل Farm
8) Verify Gates (Determinism → Structural → Pixel)
9) Diagnose Root Causes (إذا Fail)
10) Apply Targeted Repair (على CDR فقط)
11) Re-export → Re-render → Re-verify (loop)
12) إذا PASS: Evidence Pack → Deliver (Strict badge)
13) إذا لم PASS: هذه حالة BUG في التنفيذ (غير مقبولة). لا يوجد “close enough”.
---
## 4) Deterministic Rendering Farm — مرجع الحقيقة (MUST)
### 4.1 ثوابت الحتمية (MUST)
- OS/container image pinned by hash
- PDF renderer pinned by hash
- Office renderers pinned by hash (PPTX/DOCX/XLSX)
- Dashboard snapshot renderer pinned (Chromium pinned + flags pinned)
- Font snapshot pinned (Font Vault snapshot id)
- sRGB lock (ICC→sRGB)
- Anti-aliasing policy locked
- Random seed locked
- Floating-point normalization locked
- CPU/GPU parity validated OR force single path (CPU-only or GPU-only)
### 4.2 Render Outputs (MUST)
لكل صفحة/شريحة/لوحة:
- PNG RGBA 8-bit normalized
- engine_fingerprint
- render_config_hash
- pixel_hash (hash of normalized RGBA bytes)
- perceptual_hash (for regression only, never for acceptance)
---
## 5) PixelDiff — تعريف فني صارم (MUST)
### 5.1 Normalization (MUST)
قبل المقارنة، على المصدر والهدف:
1) decode → RGBA 8-bit
2) apply EXIF orientation (images)
3) ICC profile → sRGB IEC61966-2.1
4) alpha normalization:
   - convert to premultiplied alpha (policy locked)
   - deterministic rounding rules
5) gamma stabilization (sRGB curve locked)
6) enforce identical dimensions:
   - ممنوع resample عند المقارنة
   - إذا الأبعاد مختلفة => FAIL
### 5.2 PixelDiff (MUST)
- PixelDiff = count(pixels where ANY channel RGBA differs) / total_pixels
- STRICT MUST: PixelDiff == 0
- أي اختلاف → produce heatmap + hotspot list.
---
## 6) CDR (Canonical Design Representation) — عقد بيانات إلزامي 7 طبقات
> هذا القسم “يغلق” باب الاجتهاد: المنفّذ MUST يطبق الحقول والمعاني كما هي.
### 6.1 Canonical Units
- Canonical = EMU
- MUST store conversion policy id
- MUST store dpi_reference (default 300)
### 6.2 CDR-Design Top-level (MUST)
cdr_design:
- version: "1.x"
- immutable_layout_lock_flag: true
- pages[]: Page
- assets[]: Asset (images/fonts/vectors)
- layout_graph: serialized graph
- constraint_matrix: serialized constraints
- fingerprints:
  - layout_hash
  - structural_hash
  - typography_hash
  - render_intent_hash
### 6.3 Page (MUST)
- page_id
- index (1..N)
- size_emu {w,h}
- background_spec
- layers[] ordered by z_index
### 6.4 Layer (MUST)
- layer_id
- z_index stable
- transform_matrix (2x3)
- opacity 0..1
- blend_mode (declared; if unsupported by target, MUST be reconstructed exactly using supported primitives; otherwise FAIL STRICT)
- elements[] ordered
### 6.5 Element (MUST)
Common fields:
- element_id
- kind: text|shape|path|image|group|table|chart|container|clip_group|background_fragment
- bbox_emu {x,y,w,h}
- transform_matrix (2x3)
- opacity
- z_index
- clipping_overflow_rules
- constraints:
  - no_reflow: true
  - lock_aspect?: bool
  - snap_baseline?: bool
- ratios:
  - padding_ratio
  - margin_ratio
  - whitespace_ratio
#### 6.5.1 TextElement (MUST)
- text (unicode)
- direction: RTL|LTR|AUTO
- alignment: start|center|end|justify
- baseline_offset_emu
- line_height (ratio or absolute)
- wrap: none|word|char (STRICT defaults none with fixed bbox unless source is flow text)
- auto_fit: MUST false
- runs[]: TextRun
- shaping:
  - arabic_mode: BASIC|PROFESSIONAL|ELITE
  - bidi_runs[]
  - glyph_positions_emu[] (ELITE requires explicit glyph positioning)
- paint: fill + outline(optional)
TextRun (MUST):
- range {start,end}
- font_family
- font_weight
- font_style
- font_size_emu
- letter_spacing_emu
- kerning_enabled
- color RGBA
- script: arabic|latin|number|mixed
**Font fallback prohibition (STRICT)**:
- MUST NOT substitute to a “similar” font.
- If exact font not found:
  - For PDF: MUST extract embedded font program & embed it (full glyph embedding).
  - For Image: MUST reconstruct required glyph outlines into an embedded font subset (FontSynth) so rendered glyphs match exactly.
- If FontSynth cannot be built to produce PixelDiff==0 => FAIL STRICT.
#### 6.5.2 Shape/Path (MUST)
- geometry: rounded_rect|ellipse|line|polygon|custom_path
- path_data (for custom_path; canonicalized)
- stroke: width_emu, color, join, cap, dash[]
- fill: solid|gradient|pattern + params
- effects: shadow/glow/blur MUST be represented exactly using target-supported primitives; else FAIL STRICT.
#### 6.5.3 ImageElement (MUST)
- asset_ref
- crop: left/top/right/bottom (0..1) + offsets_emu
- mask: none|rect|rounded_rect|custom_path
- sampling: nearest|bilinear (must match farm policy)
- color_profile normalized to sRGB
- alpha_mode normalized
- exif_orientation_applied MUST true
#### 6.5.4 TableElement (MUST)
- grid: rows, cols, row_heights_emu[], col_widths_emu[]
- cells[]: CellSpec
- style: borders/fills/fonts/alignments
- rtl: bool
- binding: table_id (CDR-Data)
CellSpec (MUST):
- r,c
- merge {row_span,col_span}
- value (string|number|date)
- format
- style_ref or inline style
#### 6.5.5 ChartElement (MUST)
- chart_kind
- encoding: axes/legend/ticks/gridlines styles
- style: colors/fonts
- data_binding:
  - table_id
  - mappings x/y/series/category
  - binding_kind: extracted|reconstructed_synthetic
- interaction:
  - tooltip fields
  - drill mapping
- RTL axis inversion support MUST be implemented.
**No-data case**:
- If input is screenshot with no raw data:
  - MUST reconstruct a synthetic dataset whose rendered chart matches the screenshot exactly (PixelDiff==0) AND is still a real chart bound to data.
### 6.6 CDR-Data (MUST)
- tables[]:
  - table_id
  - columns[] {name,type,stats,fingerprint}
  - row_source_ref (columnar store pointer)
- lineage_ref (immutable)
- semantic_model_ref (for dashboards/measures)
---
## 7) Arabic ELITE — عقد تنضيد عربي حتمي (MUST)
- MUST use Unicode Bidirectional Algorithm (UAX#9) deterministically.
- MUST use shaping engine (e.g., HarfBuzz class) with pinned version & shaping config.
- MUST compute:
  - glyph ids
  - glyph advances
  - glyph offsets
  - baseline offsets
  - line breaks
  - justification (kashida) only if source does it and must reproduce exactly
- MUST store glyph_positions_emu in CDR for ELITE.
- MUST render identical inside farm (same font program + hinting policy).
---
## 8) Image Inputs — STRICT reconstruction without any “التفاف” (MUST)
### 8.1 Image segmentation (MUST)
- Must classify regions: background | text | table | chart | icon/vector-like | photo/logo | UI-controls
- Must output bbox + mask + confidence per region
### 8.2 Reconstruction rule (MUST)
- text regions → TextElement (FontSynth if needed)
- table regions → TableElement + CDR-Data + XLSX cells if target is XLSX
- chart regions → ChartElement bound to (extracted or reconstructed_synthetic) data
- UI-controls regions (filters/legends/drill cues) → real Dashboard components (not pictures)
- photo/logo regions → ImageElement (still “editable” by crop/replace/move/mask)
### 8.3 Table-from-image algorithm (MUST, deterministic)
Input: normalized image region
1) Detect grid lines:
   - edge detection (Canny pinned params)
   - morphological closing/opening pinned params
   - Hough line detection pinned params
2) Build grid:
   - cluster lines into rows/cols
   - infer cell boundaries
   - infer merges:
     - if internal lines missing across spans
     - validate by pixel continuity test
3) Estimate paddings:
   - measure whitespace margins inside each cell (histogram of non-background pixels)
4) OCR per cell:
   - run OCR ensemble (at least 2 engines pinned versions)
   - produce candidates with confidence
5) Semantic gate for OCR (MUST):
   - render candidate text with FontSynth into cell
   - compare cell region PixelDiff MUST == 0
   - if not 0, iterate candidate selection / font synth / glyph adjustment until 0
   - If cannot reach 0 => FAIL STRICT
6) Style extraction:
   - fill colors via k-means palette pinned
   - borders thickness via line profile measure
   - font size estimation via glyph bbox metrics
7) Build TableElement + CDR-Data + Export XLSX
8) Render XLSX and compare full region PixelDiff==0
### 8.4 Chart-from-image algorithm (MUST)
Goal: real chart + data binding + PixelDiff==0
1) Detect chart type (classifier pinned)
2) Detect plot area, axes, ticks, gridlines, legend
3) Extract geometry:
   - map pixel coordinates to chart coordinate system
4) Reconstruct dataset:
   - solve inverse problem by optimization:
     - variables: series values (and categories)
     - objective: minimize PixelDiff between rendered chart and source chart region
     - constraint: deterministic optimizer (seed locked), monotonic convergence required
     - termination: PixelDiff==0 only
5) Bind chart to dataset, render, verify PixelDiff==0
6) Build tooltip fields + drill mapping (synthetic if needed) but must exist and work.
### 8.5 Dashboard-from-image algorithm (MUST)
1) Detect layout containers (header/sidebar/main/cards/plots/table)
2) Detect controls (dropdowns, date pickers, chips, checkboxes)
3) Map controls to functional filters:
   - each control must have dataset field binding
4) Build dashboard components:
   - cards bound to measures
   - charts bound to dataset
   - tables bound to dataset
5) Render dashboard snapshot in farm and enforce PixelDiff==0
6) Interaction tests:
   - apply filter → visible state changes must match expected (functional gate)
   - export works (PDF/PNG/CSV as per policy)
---
## 9) PDF Inputs — STRICT reconstruction (MUST)
- MUST parse PDF object model:
  - text objects
  - vector paths
  - images
  - embedded fonts
  - xforms/clips
- MUST rebuild exact layout graph + constraints
- MUST embed extracted fonts (full glyph embedding)
- MUST export via CDR without reflow
- MUST verify PixelDiff==0 between PDF render and target render
---
## 10) Exporters — قواعد STRICT لكل صيغة (MUST)
### 10.1 PPTX (MUST)
- absolute positions
- no auto-fit
- embed fonts (full glyph)
- preserve z-order
- preserve clipping/masks
- charts must be data-bound
- master/theme mapping must be preserved/deduced deterministically
### 10.2 DOCX (MUST)
- absolute layout using anchored shapes/textboxes
- no reflow allowed
- embedded fonts
- page breaks deterministic
- tables structured and editable
### 10.3 XLSX (MUST)
- table content: structured cells with exact row/col sizes + merges + styles
- formulas preserved or reconstructed
- pivot/CF/freeze panes preserved when present
- deterministic recalc through SVM (Section 11)
### 10.4 Dashboard (MUST)
- interactive filters/cross-filter/drill/export/refresh
- permission-aware rendering
- snapshot render must match PixelDiff==0
---
## 11) Spreadsheet Virtual Machine (SVM) — STRICT (MUST)
- Build formula dependency DAG deterministically
- Deterministic recalculation engine
- Numeric precision: exact for integers; floats must match deterministic rounding policy; if any drift occurs => FAIL STRICT
- Support LET/LAMBDA subset coverage MUST be declared and fully implemented for supported functions
- Pivot reconstruction deterministic
- Conditional formatting rules deterministic
- Freeze panes preserved
- Chart anchors mapped deterministically
- Drift gate: results must match between:
  - SVM result
  - rendered spreadsheet visual
  - exported dashboard measures (if bound)
---
## 12) Repair Loop — Root-cause only (MUST)
No random tweaking.
### 12.1 Diagnose (MUST)
- map heatmap → candidate elements by bbox intersection
- element toggling renders
- per-layer renders
- text probes (baseline, kerning, line-height)
- alpha edge probes (masks/clips)
- color delta probes (gradients)
Output: causes[] with confidence + suggested_fix.
### 12.2 Apply Fixes (MUST order)
1) quantize geometry (EMU snap, baseline snap)
2) text baseline & bbox & line-height
3) kerning & letter spacing
4) strokes
5) crop/mask offsets
6) vector path sampling precision
7) table/grid geometry refinement
8) chart dataset optimization (inverse reconstruction)
Stop only at PixelDiff==0.
---
## 13) Evidence Pack — شرط إعلان النجاح (MUST)
For each STRICT run store:
- source renders (all pages)
- target renders (all pages)
- PixelDiff report per page (must show 0)
- heatmaps (must be empty or not generated if pass, but store pixel_hash anyway)
- structural hashes (layout/typography/structural)
- determinism report (same input rerun equals)
- functional tests report (dash filters/drill/export; excel recalc)
- full action graph snapshot
- tool versions + farm image id + font snapshot id
- audit log entry ids
No Evidence Pack => MUST NOT claim success.
---
## 14) CI/CD Gates — منع أي “تقريب” أو ادعاء (MUST)
- Golden corpus MUST include:
  - PDFs (arabic/english/mixed, gradients, masks)
  - images (tables, dashboards, infographics, low-res)
  - excel with formulas/pivots/CF
- Gates:
  - Anti-dummy code scan (no stubs in runtime)
  - Pixel gate (PixelDiff==0)
  - Structural gate
  - Determinism gate
  - Functional gate
  - Performance envelope check
Fail => no merge/no release.
---
## 15) Tooling — Tool Registry + Schemas + Templates (MUST)
> هذا القسم يجعل المواصفة “آلة تنفيذ” وليس نصًا.
### 15.1 Tool Registry Contract (MUST)
- Tool must declare:
  - tool_id, version
  - determinism_level (HARD required for PIXEL_0)
  - fidelity_target = PIXEL_0
  - editable_guarantee
  - required_permissions
  - input/output schema refs
### 15.2 Action Graph Templates (MUST)
- provide immutable templates for:
  - pdf→pptx strict
  - pdf→docx strict
  - pdf→xlsx strict
  - image(table)→xlsx strict
  - image(dashboard)→dashboard strict
  - image(report)→docx strict
  - any→any strict
---
# APPENDIX A — Common JSON Schema Definitions (Draft 2020-12)
~~~json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://strict.local/schemas/common.json",
  "title": "Common Definitions",
  "$defs": {
    "ISODateTime": { "type": "string", "format": "date-time" },
    "ArabicMode": { "type": "string", "enum": ["BASIC", "PROFESSIONAL", "ELITE"] },
    "Mode": { "type": "string", "enum": ["AUTO", "GUIDED"] },
    "FontPolicy": { "type": "string", "enum": ["PROVIDED", "ALLOW_UPLOAD", "FALLBACK_ALLOWED"] },
    "Severity": { "type": "string", "enum": ["info", "warning", "error"] },
    "Warnings": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["code", "message", "severity"],
        "properties": {
          "code": { "type": "string", "minLength": 2, "maxLength": 64 },
          "message": { "type": "string", "minLength": 1, "maxLength": 2000 },
          "severity": { "$ref": "#/$defs/Severity" }
        },
        "additionalProperties": false
      },
      "default": []
    },
    "ActionContext": {
      "type": "object",
      "required": ["workspace_id", "user_id", "locale", "strict_visual", "arabic_mode", "mode", "font_policy"],
      "properties": {
        "workspace_id": { "type": "string", "minLength": 3, "maxLength": 128 },
        "user_id": { "type": "string", "minLength": 3, "maxLength": 128 },
        "locale": { "type": "string", "minLength": 2, "maxLength": 16 },
        "strict_visual": { "type": "boolean" },
        "arabic_mode": { "$ref": "#/$defs/ArabicMode" },
        "mode": { "$ref": "#/$defs/Mode" },
        "font_policy": { "$ref": "#/$defs/FontPolicy" }
      },
      "additionalProperties": true
    },
    "AssetRef": {
      "type": "object",
      "required": ["asset_id", "uri", "mime", "sha256", "size_bytes"],
      "properties": {
        "asset_id": { "type": "string", "minLength": 8, "maxLength": 128 },
        "uri": { "type": "string", "minLength": 1, "maxLength": 2048 },
        "mime": { "type": "string", "minLength": 3, "maxLength": 128 },
        "sha256": { "type": "string", "pattern": "^[0-9a-fA-F]{64}$" },
        "size_bytes": { "type": "integer", "minimum": 0 },
        "page_count": { "type": "integer", "minimum": 1 }
      },
      "additionalProperties": false
    },
    "PdfDomRef": {
      "type": "object",
      "required": ["pdf_dom_id"],
      "properties": { "pdf_dom_id": { "type": "string", "minLength": 8, "maxLength": 128 } },
      "additionalProperties": false
    },
    "ImageSegRef": {
      "type": "object",
      "required": ["seg_id", "regions"],
      "properties": {
        "seg_id": { "type": "string", "minLength": 8, "maxLength": 128 },
        "regions": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["region_id", "kind", "bbox"],
            "properties": {
              "region_id": { "type": "string", "minLength": 1, "maxLength": 128 },
              "kind": { "type": "string", "enum": ["background","text","logo","table","chart","figure","photo","ui_control","unknown"] },
              "bbox": {
                "type": "object",
                "required": ["x","y","w","h"],
                "properties": {
                  "x": { "type": "number" },
                  "y": { "type": "number" },
                  "w": { "type": "number", "minimum": 0 },
                  "h": { "type": "number", "minimum": 0 }
                },
                "additionalProperties": false
              },
              "mask_uri": { "type": "string", "maxLength": 2048 },
              "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
            },
            "additionalProperties": true
          }
        }
      },
      "additionalProperties": false
    },
    "CdrDesignRef": {
      "type": "object",
      "required": ["cdr_design_id", "page_count"],
      "properties": {
        "cdr_design_id": { "type": "string", "minLength": 8, "maxLength": 128 },
        "page_count": { "type": "integer", "minimum": 1 }
      },
      "additionalProperties": false
    },
    "CdrDataRef": {
      "type": "object",
      "required": ["cdr_data_id", "table_count"],
      "properties": {
        "cdr_data_id": { "type": "string", "minLength": 8, "maxLength": 128 },
        "table_count": { "type": "integer", "minimum": 0 }
      },
      "additionalProperties": false
    },
    "FontPlan": {
      "type": "object",
      "required": ["fonts"],
      "properties": {
        "fonts": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["family", "status"],
            "properties": {
              "family": { "type": "string", "minLength": 1, "maxLength": 256 },
              "status": { "type": "string", "enum": ["available", "embedded", "synthesized", "missing"] },
              "font_program_uri": { "type": "string", "maxLength": 2048 },
              "embed_all_glyphs": { "type": "boolean", "default": true }
            },
            "additionalProperties": false
          }
        }
      },
      "additionalProperties": false
    },
    "ArtifactRef": {
      "type": "object",
      "required": ["artifact_id", "kind", "uri"],
      "properties": {
        "artifact_id": { "type": "string", "minLength": 8, "maxLength": 128 },
        "kind": { "type": "string", "enum": ["pptx","docx","xlsx","dashboard","pdf","png","json"] },
        "uri": { "type": "string", "minLength": 1, "maxLength": 2048 }
      },
      "additionalProperties": false
    },
    "RenderProfile": {
      "type": "object",
      "required": ["dpi", "colorspace"],
      "properties": {
        "dpi": { "type": "integer", "minimum": 72, "maximum": 1200 },
        "colorspace": { "type": "string", "enum": ["sRGB"] },
        "page_range": {
          "type": "object",
          "properties": {
            "from": { "type": "integer", "minimum": 1 },
            "to": { "type": "integer", "minimum": 1 }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "HashBundle": {
      "type": "object",
      "required": ["layout_hash", "structural_hash", "typography_hash", "pixel_hash"],
      "properties": {
        "layout_hash": { "type": "string", "minLength": 16, "maxLength": 256 },
        "structural_hash": { "type": "string", "minLength": 16, "maxLength": 256 },
        "typography_hash": { "type": "string", "minLength": 16, "maxLength": 256 },
        "pixel_hash": { "type": "string", "minLength": 16, "maxLength": 256 },
        "perceptual_hash": { "type": "string", "minLength": 16, "maxLength": 256 }
      },
      "additionalProperties": false
    },
    "RenderRef": {
      "type": "object",
      "required": ["render_id", "uri", "dpi", "colorspace", "engine_fingerprint", "fingerprint"],
      "properties": {
        "render_id": { "type": "string", "minLength": 8, "maxLength": 128 },
        "uri": { "type": "string", "minLength": 1, "maxLength": 2048 },
        "dpi": { "type": "integer", "minimum": 72, "maximum": 1200 },
        "colorspace": { "type": "string", "enum": ["sRGB"] },
        "engine_fingerprint": { "type": "string", "minLength": 6, "maxLength": 256 },
        "fingerprint": { "$ref": "#/$defs/HashBundle" }
      },
      "additionalProperties": false
    },
    "DiffRef": {
      "type": "object",
      "required": ["diff_id", "pixel_diff", "pass"],
      "properties": {
        "diff_id": { "type": "string", "minLength": 8, "maxLength": 128 },
        "pixel_diff": { "type": "number", "minimum": 0 },
        "pass": { "type": "boolean" },
        "heatmap_uri": { "type": "string", "maxLength": 2048 }
      },
      "additionalProperties": false
    },
    "DeterminismCheck": {
      "type": "object",
      "required": ["anti_aliasing_policy", "gpu_cpu_parity", "float_norm_policy", "random_seed_locked"],
      "properties": {
        "anti_aliasing_policy": { "type": "string", "enum": ["locked"] },
        "gpu_cpu_parity": { "type": "string", "enum": ["validated", "forced_single_path"] },
        "float_norm_policy": { "type": "string", "enum": ["locked"] },
        "random_seed_locked": { "type": "boolean" }
      },
      "additionalProperties": false
    }
  }
}
~~~
# APPENDIX B — Tool Schemas (Input/Output) — الحد الأدنى الإلزامي للتنفيذ
> كل Tool أدناه MUST يطبق كما هو. لا تغيّر schemas. لا تغيّر أسماء الحقول.
## B1) extract.pdf_dom
~~~json
{
  "$id": "https://strict.local/schemas/extract.pdf_dom.input.json",
  "type": "object",
  "required": ["request_id","tool_id","context","inputs","params"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "extract.pdf_dom" },
    "context": { "$ref": "common.json#/$defs/ActionContext" },
    "inputs": {
      "type": "object",
      "required": ["pdf_asset"],
      "properties": { "pdf_asset": { "$ref": "common.json#/$defs/AssetRef" } },
      "additionalProperties": false
    },
    "params": { "type": "object" }
  },
  "additionalProperties": false
}
~~~
~~~json
{
  "$id": "https://strict.local/schemas/extract.pdf_dom.output.json",
  "type": "object",
  "required": ["request_id","tool_id","status","refs"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "extract.pdf_dom" },
    "status": { "type": "string", "enum": ["ok","failed"] },
    "refs": {
      "type": "object",
      "required": ["pdf_dom"],
      "properties": { "pdf_dom": { "$ref": "common.json#/$defs/PdfDomRef" } },
      "additionalProperties": false
    },
    "warnings": { "$ref": "common.json#/$defs/Warnings" }
  },
  "additionalProperties": false
}
~~~
## B2) extract.image_segments
~~~json
{
  "$id": "https://strict.local/schemas/extract.image_segments.input.json",
  "type": "object",
  "required": ["request_id","tool_id","context","inputs","params"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "extract.image_segments" },
    "context": { "$ref": "common.json#/$defs/ActionContext" },
    "inputs": {
      "type": "object",
      "required": ["image_asset"],
      "properties": { "image_asset": { "$ref": "common.json#/$defs/AssetRef" } },
      "additionalProperties": false
    },
    "params": { "type": "object" }
  },
  "additionalProperties": false
}
~~~
~~~json
{
  "$id": "https://strict.local/schemas/extract.image_segments.output.json",
  "type": "object",
  "required": ["request_id","tool_id","status","refs"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "extract.image_segments" },
    "status": { "type": "string", "enum": ["ok","failed"] },
    "refs": {
      "type": "object",
      "required": ["image_segments"],
      "properties": { "image_segments": { "$ref": "common.json#/$defs/ImageSegRef" } },
      "additionalProperties": false
    },
    "warnings": { "$ref": "common.json#/$defs/Warnings" }
  },
  "additionalProperties": false
}
~~~
## B3) cdr.build_design_from_pdf
~~~json
{
  "$id": "https://strict.local/schemas/cdr.build_design_from_pdf.input.json",
  "type": "object",
  "required": ["request_id","tool_id","context","inputs","params"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "cdr.build_design_from_pdf" },
    "context": { "$ref": "common.json#/$defs/ActionContext" },
    "inputs": {
      "type": "object",
      "required": ["pdf_dom"],
      "properties": { "pdf_dom": { "$ref": "common.json#/$defs/PdfDomRef" } },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "properties": {
        "page_range": { "$ref": "common.json#/$defs/RenderProfile/properties/page_range" }
      },
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
~~~
~~~json
{
  "$id": "https://strict.local/schemas/cdr.build_design_from_pdf.output.json",
  "type": "object",
  "required": ["request_id","tool_id","status","refs"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "cdr.build_design_from_pdf" },
    "status": { "type": "string", "enum": ["ok","failed"] },
    "refs": {
      "type": "object",
      "required": ["cdr_design","font_plan"],
      "properties": {
        "cdr_design": { "$ref": "common.json#/$defs/CdrDesignRef" },
        "font_plan": { "$ref": "common.json#/$defs/FontPlan" }
      },
      "additionalProperties": false
    },
    "warnings": { "$ref": "common.json#/$defs/Warnings" }
  },
  "additionalProperties": false
}
~~~
## B4) cdr.build_design_from_image
~~~json
{
  "$id": "https://strict.local/schemas/cdr.build_design_from_image.input.json",
  "type": "object",
  "required": ["request_id","tool_id","context","inputs","params"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "cdr.build_design_from_image" },
    "context": { "$ref": "common.json#/$defs/ActionContext" },
    "inputs": {
      "type": "object",
      "required": ["image_segments"],
      "properties": { "image_segments": { "$ref": "common.json#/$defs/ImageSegRef" } },
      "additionalProperties": false
    },
    "params": { "type": "object" }
  },
  "additionalProperties": false
}
~~~
~~~json
{
  "$id": "https://strict.local/schemas/cdr.build_design_from_image.output.json",
  "type": "object",
  "required": ["request_id","tool_id","status","refs"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "cdr.build_design_from_image" },
    "status": { "type": "string", "enum": ["ok","failed"] },
    "refs": {
      "type": "object",
      "required": ["cdr_design","font_plan"],
      "properties": {
        "cdr_design": { "$ref": "common.json#/$defs/CdrDesignRef" },
        "font_plan": { "$ref": "common.json#/$defs/FontPlan" }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
~~~
## B5) cdr.build_table_from_image
~~~json
{
  "$id": "https://strict.local/schemas/cdr.build_table_from_image.input.json",
  "type": "object",
  "required": ["request_id","tool_id","context","inputs","params"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "cdr.build_table_from_image" },
    "context": { "$ref": "common.json#/$defs/ActionContext" },
    "inputs": {
      "type": "object",
      "required": ["image_segments","table_region_id"],
      "properties": {
        "image_segments": { "$ref": "common.json#/$defs/ImageSegRef" },
        "table_region_id": { "type": "string" }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "properties": {
        "min_ocr_confidence": { "type": "number", "minimum": 0, "maximum": 1, "default": 0.95 }
      },
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
~~~
~~~json
{
  "$id": "https://strict.local/schemas/cdr.build_table_from_image.output.json",
  "type": "object",
  "required": ["request_id","tool_id","status","refs"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "cdr.build_table_from_image" },
    "status": { "type": "string", "enum": ["ok","failed"] },
    "refs": {
      "type": "object",
      "required": ["cdr_design","cdr_data"],
      "properties": {
        "cdr_design": { "$ref": "common.json#/$defs/CdrDesignRef" },
        "cdr_data": { "$ref": "common.json#/$defs/CdrDataRef" }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
~~~
## B6) fonts.embed_full_glyph
~~~json
{
  "$id": "https://strict.local/schemas/fonts.embed_full_glyph.input.json",
  "type": "object",
  "required": ["request_id","tool_id","context","inputs","params"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "fonts.embed_full_glyph" },
    "context": { "$ref": "common.json#/$defs/ActionContext" },
    "inputs": {
      "type": "object",
      "required": ["font_plan"],
      "properties": { "font_plan": { "$ref": "common.json#/$defs/FontPlan" } },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "required": ["embed_all_glyphs"],
      "properties": { "embed_all_glyphs": { "type": "boolean", "const": true } },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
~~~
~~~json
{
  "$id": "https://strict.local/schemas/fonts.embed_full_glyph.output.json",
  "type": "object",
  "required": ["request_id","tool_id","status","refs"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "fonts.embed_full_glyph" },
    "status": { "type": "string", "enum": ["ok","failed"] },
    "refs": {
      "type": "object",
      "required": ["font_plan"],
      "properties": { "font_plan": { "$ref": "common.json#/$defs/FontPlan" } },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
~~~
## B7) export.pptx_from_cdr / export.docx_from_cdr / export.xlsx_from_table_cdr / export.dashboard_from_cdr
~~~json
{
  "$id": "https://strict.local/schemas/export.pptx_from_cdr.input.json",
  "type": "object",
  "required": ["request_id","tool_id","context","inputs","params"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "export.pptx_from_cdr" },
    "context": { "$ref": "common.json#/$defs/ActionContext" },
    "inputs": {
      "type": "object",
      "required": ["cdr_design","font_plan"],
      "properties": {
        "cdr_design": { "$ref": "common.json#/$defs/CdrDesignRef" },
        "font_plan": { "$ref": "common.json#/$defs/FontPlan" }
      },
      "additionalProperties": false
    },
    "params": { "type": "object" }
  },
  "additionalProperties": false
}
~~~
~~~json
{
  "$id": "https://strict.local/schemas/export.pptx_from_cdr.output.json",
  "type": "object",
  "required": ["request_id","tool_id","status","refs"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "export.pptx_from_cdr" },
    "status": { "type": "string", "enum": ["ok","failed"] },
    "refs": {
      "type": "object",
      "required": ["artifact"],
      "properties": { "artifact": { "$ref": "common.json#/$defs/ArtifactRef" } },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
~~~
~~~json
{
  "$id": "https://strict.local/schemas/export.docx_from_cdr.input.json",
  "type": "object",
  "required": ["request_id","tool_id","context","inputs","params"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "export.docx_from_cdr" },
    "context": { "$ref": "common.json#/$defs/ActionContext" },
    "inputs": {
      "type": "object",
      "required": ["cdr_design","font_plan"],
      "properties": {
        "cdr_design": { "$ref": "common.json#/$defs/CdrDesignRef" },
        "font_plan": { "$ref": "common.json#/$defs/FontPlan" }
      },
      "additionalProperties": false
    },
    "params": { "type": "object" }
  },
  "additionalProperties": false
}
~~~
~~~json
{
  "$id": "https://strict.local/schemas/export.docx_from_cdr.output.json",
  "type": "object",
  "required": ["request_id","tool_id","status","refs"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "export.docx_from_cdr" },
    "status": { "type": "string", "enum": ["ok","failed"] },
    "refs": {
      "type": "object",
      "required": ["artifact"],
      "properties": { "artifact": { "$ref": "common.json#/$defs/ArtifactRef" } },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
~~~
~~~json
{
  "$id": "https://strict.local/schemas/export.xlsx_from_table_cdr.input.json",
  "type": "object",
  "required": ["request_id","tool_id","context","inputs","params"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "export.xlsx_from_table_cdr" },
    "context": { "$ref": "common.json#/$defs/ActionContext" },
    "inputs": {
      "type": "object",
      "required": ["cdr_data","style_source"],
      "properties": {
        "cdr_data": { "$ref": "common.json#/$defs/CdrDataRef" },
        "style_source": { "$ref": "common.json#/$defs/CdrDesignRef" }
      },
      "additionalProperties": false
    },
    "params": { "type": "object" }
  },
  "additionalProperties": false
}
~~~
~~~json
{
  "$id": "https://strict.local/schemas/export.xlsx_from_table_cdr.output.json",
  "type": "object",
  "required": ["request_id","tool_id","status","refs"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "export.xlsx_from_table_cdr" },
    "status": { "type": "string", "enum": ["ok","failed"] },
    "refs": {
      "type": "object",
      "required": ["artifact"],
      "properties": { "artifact": { "$ref": "common.json#/$defs/ArtifactRef" } },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
~~~
~~~json
{
  "$id": "https://strict.local/schemas/export.dashboard_from_cdr.input.json",
  "type": "object",
  "required": ["request_id","tool_id","context","inputs","params"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "export.dashboard_from_cdr" },
    "context": { "$ref": "common.json#/$defs/ActionContext" },
    "inputs": {
      "type": "object",
      "required": ["cdr_design","cdr_data"],
      "properties": {
        "cdr_design": { "$ref": "common.json#/$defs/CdrDesignRef" },
        "cdr_data": { "$ref": "common.json#/$defs/CdrDataRef" }
      },
      "additionalProperties": false
    },
    "params": { "type": "object" }
  },
  "additionalProperties": false
}
~~~
~~~json
{
  "$id": "https://strict.local/schemas/export.dashboard_from_cdr.output.json",
  "type": "object",
  "required": ["request_id","tool_id","status","refs"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "export.dashboard_from_cdr" },
    "status": { "type": "string", "enum": ["ok","failed"] },
    "refs": {
      "type": "object",
      "required": ["artifact"],
      "properties": { "artifact": { "$ref": "common.json#/$defs/ArtifactRef" } },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
~~~
## B8) render.* (pdf/pptx/docx/xlsx/dashboard → png)
~~~json
{
  "$id": "https://strict.local/schemas/render.any_to_png.input.json",
  "type": "object",
  "required": ["request_id","tool_id","context","inputs","params"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "type": "string", "enum": ["render.pdf_to_png","render.pptx_to_png","render.docx_to_png","render.xlsx_to_png","render.dashboard_to_png"] },
    "context": { "$ref": "common.json#/$defs/ActionContext" },
    "inputs": {
      "type": "object",
      "required": ["source","render_profile"],
      "properties": {
        "source": { "type": "object" },
        "render_profile": { "$ref": "common.json#/$defs/RenderProfile" }
      },
      "additionalProperties": true
    },
    "params": { "type": "object" }
  },
  "additionalProperties": false
}
~~~
~~~json
{
  "$id": "https://strict.local/schemas/render.any_to_png.output.json",
  "type": "object",
  "required": ["request_id","tool_id","status","refs"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "type": "string" },
    "status": { "type": "string", "enum": ["ok","failed"] },
    "refs": {
      "type": "object",
      "required": ["renders"],
      "properties": {
        "renders": { "type": "array", "minItems": 1, "items": { "$ref": "common.json#/$defs/RenderRef" } }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
~~~
## B9) verify.pixel_diff (STRICT=0)
~~~json
{
  "$id": "https://strict.local/schemas/verify.pixel_diff.input.json",
  "type": "object",
  "required": ["request_id","tool_id","context","inputs","params"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "verify.pixel_diff" },
    "context": { "$ref": "common.json#/$defs/ActionContext" },
    "inputs": {
      "type": "object",
      "required": ["source_render","target_render"],
      "properties": {
        "source_render": { "$ref": "common.json#/$defs/RenderRef" },
        "target_render": { "$ref": "common.json#/$defs/RenderRef" }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "required": ["threshold"],
      "properties": { "threshold": { "type": "number", "const": 0 } },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
~~~
~~~json
{
  "$id": "https://strict.local/schemas/verify.pixel_diff.output.json",
  "type": "object",
  "required": ["request_id","tool_id","status","refs"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "verify.pixel_diff" },
    "status": { "type": "string", "enum": ["ok","failed"] },
    "refs": {
      "type": "object",
      "required": ["diff"],
      "properties": { "diff": { "$ref": "common.json#/$defs/DiffRef" } },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
~~~
## B10) verify.structural_equivalence
~~~json
{
  "$id": "https://strict.local/schemas/verify.structural_equivalence.input.json",
  "type": "object",
  "required": ["request_id","tool_id","context","inputs","params"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "verify.structural_equivalence" },
    "context": { "$ref": "common.json#/$defs/ActionContext" },
    "inputs": {
      "type": "object",
      "required": ["artifact","cdr_design"],
      "properties": {
        "artifact": { "$ref": "common.json#/$defs/ArtifactRef" },
        "cdr_design": { "$ref": "common.json#/$defs/CdrDesignRef" }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "required": ["require_text_editable","require_tables_structured","require_charts_bound"],
      "properties": {
        "require_text_editable": { "type": "boolean", "const": true },
        "require_tables_structured": { "type": "boolean", "const": true },
        "require_charts_bound": { "type": "boolean", "const": true }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
~~~
~~~json
{
  "$id": "https://strict.local/schemas/verify.structural_equivalence.output.json",
  "type": "object",
  "required": ["request_id","tool_id","status","refs"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "verify.structural_equivalence" },
    "status": { "type": "string", "enum": ["ok","failed"] },
    "refs": {
      "type": "object",
      "required": ["pass","hashes"],
      "properties": {
        "pass": { "type": "boolean" },
        "hashes": { "$ref": "common.json#/$defs/HashBundle" }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
~~~
## B11) render.validate_determinism
~~~json
{
  "$id": "https://strict.local/schemas/render.validate_determinism.input.json",
  "type": "object",
  "required": ["request_id","tool_id","context","inputs","params"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "render.validate_determinism" },
    "context": { "$ref": "common.json#/$defs/ActionContext" },
    "inputs": {
      "type": "object",
      "required": ["renders","checks"],
      "properties": {
        "renders": { "type": "array", "minItems": 2, "items": { "$ref": "common.json#/$defs/RenderRef" } },
        "checks": { "$ref": "common.json#/$defs/DeterminismCheck" }
      },
      "additionalProperties": false
    },
    "params": { "type": "object" }
  },
  "additionalProperties": false
}
~~~
~~~json
{
  "$id": "https://strict.local/schemas/render.validate_determinism.output.json",
  "type": "object",
  "required": ["request_id","tool_id","status","refs"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "render.validate_determinism" },
    "status": { "type": "string", "enum": ["ok","failed"] },
    "refs": {
      "type": "object",
      "required": ["pass"],
      "properties": { "pass": { "type": "boolean" } },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
~~~
## B12) diagnose.diff_attribution + repair.quantize_geometry + repair.adjust_text_metrics + repair.loop_controller
~~~json
{
  "$id": "https://strict.local/schemas/diagnose.diff_attribution.input.json",
  "type": "object",
  "required": ["request_id","tool_id","context","inputs","params"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "diagnose.diff_attribution" },
    "context": { "$ref": "common.json#/$defs/ActionContext" },
    "inputs": {
      "type": "object",
      "required": ["diff","cdr_design"],
      "properties": {
        "diff": { "$ref": "common.json#/$defs/DiffRef" },
        "cdr_design": { "$ref": "common.json#/$defs/CdrDesignRef" }
      },
      "additionalProperties": false
    },
    "params": { "type": "object" }
  },
  "additionalProperties": false
}
~~~
~~~json
{
  "$id": "https://strict.local/schemas/diagnose.diff_attribution.output.json",
  "type": "object",
  "required": ["request_id","tool_id","status","refs"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "diagnose.diff_attribution" },
    "status": { "type": "string", "enum": ["ok","failed"] },
    "refs": {
      "type": "object",
      "required": ["patch_plan"],
      "properties": {
        "patch_plan": { "type": "object", "required": ["fixes"], "properties": { "fixes": { "type": "array" } }, "additionalProperties": true }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
~~~
~~~json
{
  "$id": "https://strict.local/schemas/repair.quantize_geometry.input.json",
  "type": "object",
  "required": ["request_id","tool_id","context","inputs","params"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "repair.quantize_geometry" },
    "context": { "$ref": "common.json#/$defs/ActionContext" },
    "inputs": {
      "type": "object",
      "required": ["cdr_design"],
      "properties": { "cdr_design": { "$ref": "common.json#/$defs/CdrDesignRef" } },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "required": ["emu_snap"],
      "properties": { "emu_snap": { "type": "integer", "minimum": 1, "default": 8 } },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
~~~
~~~json
{
  "$id": "https://strict.local/schemas/repair.quantize_geometry.output.json",
  "type": "object",
  "required": ["request_id","tool_id","status","refs"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "repair.quantize_geometry" },
    "status": { "type": "string", "enum": ["ok","failed"] },
    "refs": {
      "type": "object",
      "required": ["cdr_design"],
      "properties": { "cdr_design": { "$ref": "common.json#/$defs/CdrDesignRef" } },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
~~~
~~~json
{
  "$id": "https://strict.local/schemas/repair.adjust_text_metrics.input.json",
  "type": "object",
  "required": ["request_id","tool_id","context","inputs","params"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "repair.adjust_text_metrics" },
    "context": { "$ref": "common.json#/$defs/ActionContext" },
    "inputs": {
      "type": "object",
      "required": ["cdr_design","patch_plan"],
      "properties": {
        "cdr_design": { "$ref": "common.json#/$defs/CdrDesignRef" },
        "patch_plan": { "type": "object" }
      },
      "additionalProperties": false
    },
    "params": { "type": "object" }
  },
  "additionalProperties": false
}
~~~
~~~json
{
  "$id": "https://strict.local/schemas/repair.adjust_text_metrics.output.json",
  "type": "object",
  "required": ["request_id","tool_id","status","refs"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "repair.adjust_text_metrics" },
    "status": { "type": "string", "enum": ["ok","failed"] },
    "refs": {
      "type": "object",
      "required": ["cdr_design"],
      "properties": { "cdr_design": { "$ref": "common.json#/$defs/CdrDesignRef" } },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
~~~
~~~json
{
  "$id": "https://strict.local/schemas/repair.loop_controller.input.json",
  "type": "object",
  "required": ["request_id","tool_id","context","inputs","params"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "repair.loop_controller" },
    "context": { "$ref": "common.json#/$defs/ActionContext" },
    "inputs": {
      "type": "object",
      "required": ["source_render","initial_cdr_design","export_kind","render_kind"],
      "properties": {
        "source_render": { "$ref": "common.json#/$defs/RenderRef" },
        "initial_cdr_design": { "$ref": "common.json#/$defs/CdrDesignRef" },
        "export_kind": { "type": "string", "enum": ["pptx","docx","xlsx","dashboard"] },
        "render_kind": { "type": "string", "enum": ["pptx","docx","xlsx","dashboard"] }
      },
      "additionalProperties": false
    },
    "params": {
      "type": "object",
      "required": ["max_iterations"],
      "properties": { "max_iterations": { "type": "integer", "minimum": 1, "default": 50 } },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
~~~
~~~json
{
  "$id": "https://strict.local/schemas/repair.loop_controller.output.json",
  "type": "object",
  "required": ["request_id","tool_id","status","refs"],
  "properties": {
    "request_id": { "type": "string" },
    "tool_id": { "const": "repair.loop_controller" },
    "status": { "type": "string", "enum": ["ok","failed"] },
    "refs": {
      "type": "object",
      "required": ["final_artifact","final_diff"],
      "properties": {
        "final_artifact": { "$ref": "common.json#/$defs/ArtifactRef" },
        "final_diff": { "$ref": "common.json#/$defs/DiffRef" }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
~~~
# APPENDIX C — Algorithms (Deterministic Pseudocode) — لا تغيير
## C1) PixelDiff Exact
~~~text
function Normalize(image):
  rgba = DecodeToRGBA8(image)
  rgba = ApplyEXIFOrientation(rgba)
  rgba = ConvertICCToSRGB(rgba)      # fixed transform
  rgba = NormalizeAlphaPremultiply(rgba, policy="premultiplied")
  rgba = StabilizeGamma(rgba, curve="sRGB")
  return rgba
function PixelDiffExact(src, tgt):
  A = Normalize(src)
  B = Normalize(tgt)
  assert A.width == B.width and A.height == B.height
  for i in 0..(A.len-1):
    if A[i] != B[i]: return FAIL with heatmap
  return PASS
~~~
## C2) EMU↔PX Quantization (STRICT)
~~~text
# canonical mapping (for a pinned renderer in farm):
px = round( (emu / EMU_PER_INCH) * DPI )
emu = round( (px / DPI) * EMU_PER_INCH )
QuantizeEMU(emu, emu_snap):
  return round(emu / emu_snap) * emu_snap
~~~
## C3) Image Table Grid Detection (STRICT)
~~~text
Input: normalized table image region R
1) edges = Canny(R, pinned_params)
2) lines = Hough(edges, pinned_params)
3) horiz = cluster(lines where angle~0)
   vert  = cluster(lines where angle~90)
4) infer row boundaries from horiz, col boundaries from vert
5) merges:
   if interior line missing across expected span AND pixel continuity test passes => merged cell
6) produce grid + merges + confidence
7) if confidence < 0.99 => FAIL STRICT (no questions allowed)
~~~
## C4) Chart Data Reconstruction (STRICT)
~~~text
Input: chart screenshot region
Goal: Find dataset D such that RenderChart(D, spec) pixel-matches screenshot
1) spec = DetectChartSpec(region)   # pinned model
2) initialize D with deterministic seed
3) repeat:
     img = RenderChart(D, spec) in farm
     if PixelDiffExact(img, region) == PASS: return D
     grad = EstimateGradient(diff)   # deterministic numeric
     D = Update(D, grad)             # deterministic optimizer
   forever (no max iterations in STRICT)
~~~
---
# END


---

<a id="sec-14"></a>
# PRESENTATION ENGINE SPEC — World-Class AI Slides (Gamma-Class) + Arabic ELITE + Canvas-First
**وثيقة تنفيذية فنية موجهة للمنفّذ مباشرة** — صياغة أمرية إلزامية (MUST/SHALL/MUST NOT)
**الهدف**: محرك توليد عروض تقديمية لا يقل كفاءة عن أقوى محركات السوق (Gamma-class) في: السرعة، السهولة، الذكاء، جودة التصميم، الإنفوجرافيك، التحكم، التصدير، ودعم العربية.
**قاعدة**: أي سلوك غير مذكور صراحةً هنا = **ممنوع**. أي تعديل/تبسيط/إهمال = **غير مسموح**.
---
## 0) تعريف المنتج (Non-Negotiable)
### 0.1 تعريف “SlideEngine SUCCESS” (شرط قبول)
يُعتبر المحرك ناجحًا فقط إذا حقق **كل** ما يلي:
1) **سهولة Gamma-Class**:
   - MUST إنشاء عرض كامل من وصف واحد في Canvas خلال تدفق واحد (one-pass) بدون أسئلة.
   - MUST السماح بالتحكم الكامل عبر “Parameters” قابلة للتعديل بدل الأسئلة.
   - MUST دعم “Guided controls” كـUI knobs، وليس أسئلة متتابعة (لا حوار طويل).
2) **جودة احترافية Premium**:
   - MUST يخرج تصميمًا احترافيًا جاهزًا للعرض (Executive-ready) مع:
     - Grid متسق
     - توازن مساحات/هوامش
     - تسلسل بصري واضح
     - تناسق Typography
     - ألوان عالية التباين ومناسبة للـBrand
     - عدم تراكب عناصر/قصّ نصوص/تشوهات
3) **تحكم كامل**:
   - MUST دعم تطبيق Theme/Brand/Fonts/Colors قبل وبعد التوليد.
   - MUST تمكين إضافة/حذف/إعادة ترتيب شرائح مع إعادة ضبط التصميم تلقائيًا بدون كسر التناسق.
   - MUST تحويل صورة/صفحة PDF إلى شريحة Editable عبر “STRICT REPLICATION ENGINE” السابق (كميزة داخل المحرك).
4) **Arabic ELITE**:
   - MUST دعم العربية ELITE (bidi+shaping+metrics lock+RTL layout) بنفس صرامة محرك العربية في المنصة.
   - MUST عدم الاكتفاء بقلب الاتجاه.
5) **Editable حقيقي**:
   - MUST أن تكون الشرائح قابلة للتعديل بالكامل: نصوص + أشكال + جداول + مخططات + أيقونات + صور.
   - MUST منع “شرائح صور” كناتج افتراضي.
   - يسمح بالصور فقط للصور الطبيعية (صور أشخاص/شعارات/خامات)، وتبقى قابلة للتحرير (crop/replace/mask).
6) **تصدير عالي الجودة**:
   - MUST تصدير PPTX مطابق للمعاينة داخل Farm rendering (RenderParity).
   - MUST تضمين الخطوط/أو توثيقها وفق سياسة الخطوط.
7) **Evidence Pack + Anti-Cheating**:
   - MUST عدم إعلان “تم” إلا بعد بناء الملف فعليًا + اجتياز QA gates + تخزين Evidence Pack (لقطات + تقارير).
---
## 1) UX / UI (Canvas-First) — بدون صفحات كثيرة
### 1.1 واجهة واحدة إلزامية
- Canvas واحد لكتابة الطلب، معاينة الشرائح، والتعديل.
- Panel جانبي واحد قابل للإخفاء يحتوي:
  - Library (assets: صور/ملفات/جداول/شعارات/أيقونات)
  - Themes/Brand Kits
  - Slide Navigator (قائمة الشرائح)
  - Blocks (Infographics/Charts/Tables/Layouts)
  - History/Versions
### 1.2 أوامر المستخدم (Must support)
المحرك MUST يقبل:
- وصف عام: “أنشئ عرض عن …”
- وصف مع مخرجات: “10 شرائح، أسلوب رسمي، لغة عربية، مع مخططات من ملف Excel”
- أوامر تعديل: “أضف شريحة مقارنة”، “حوّل الشريحة 4 إلى إنفوجرافيك”، “استبدل Theme إلى …”
- أوامر إدراج صارم: “حوّل هذه الصورة إلى شريحة Editable مطابقة 1:1” (يستخدم Strict Engine).
- أوامر بيانات: “ابنِ مخطط مبيعات من هذا الجدول، واصنع شريحة KPI”.
### 1.3 “بدون أسئلة”
- النظام MUST لا يسأل المستخدم أثناء التوليد الافتراضي.
- كل “سؤال محتمل” MUST يتحول إلى:
  - Default قرار صريح في السياسات (Auto-Defaults)، أو
  - Control Parameter في UI (slider/dropdown/toggle) يمكن للمستخدم تغييره قبل/بعد التوليد.
- ONLY EXCEPTION: إذا الملف تالف/غير قابل للقراءة (I/O error)؛ عندها تُعاد رسالة خطأ تقنية واضحة.
---
## 2) أوضاع التشغيل (MUST)
### 2.1 AUTO Mode (default)
- توليد عرض كامل “one pass”:
  - Outline → Storyboard → Layout → Assets → Slides → QA Fix → Export.
- لا حوار.
### 2.2 CONTROLLED Mode (بدون أسئلة أيضًا)
- المستخدم يحدد knobs قبل التنفيذ:
  - slide_count
  - tone (formal/neutral/creative)
  - density (sparse/standard/dense)
  - theme_id / brand_kit_id
  - language (ar/en/mixed)
  - infographic_level (low/med/high)
  - motion_level (none/basic/cinematic)
  - chart_style (minimal/boardroom/data-heavy)
  - icon_pack (brand/default)
  - citations (on/off)
- ثم تشغيل واحد.
---
## 3) Inputs / Data / Assets (MUST)
### 3.1 مصادر الإدخال
- نص/Prompt
- ملفات: PDF/Images/PPTX/DOCX/XLSX/CSV
- جداول من محرك البيانات/الإكسل
- روابط/مستندات داخل مساحة العمل (RAG داخلي مع عزل tenant)
### 3.2 سياسة الأصول
- MUST يدعم:
  - رفع صور/شعارات/أيقونات SVG/PNG
  - مكتبة أيقونات (vector) قابلة للتلوين
  - تحويل الأيقونات إلى أشكال PPTX (paths) للحفاظ على التحرير
- MUST إدارة حقوق/ترخيص assets (metadata).
---
## 4) المخرجات (Outputs) — PPTX هو الأصل
### 4.1 PPTX MUST
- Master slides + theme mapping
- Slide layouts متعددة
- Fonts embedded/subset وفق سياسة المؤسسة
- Charts data-bound
- Tables structured
- Editable shapes/icons
- Speaker notes (اختياري لكنه MUST إذا تم تفعيل setting)
### 4.2 Export Parity MUST
- Render PPTX داخل Farm ومقارنته بمعاينة المنصة:
  - MUST تطابق بصري (RenderParity) ضمن نفس Farm.
  - لا تُستخدم PixelDiff==0 هنا كـStrict replication، بل كـParity (نفس الناتج المرئي بين “preview renderer” و”pptx renderer”).
  - أي اختلاف مرئي يُعتبر BUG ويمنع “Done”.
---
## 5) المعمارية (Engines & Modules) — إلزامي
### 5.1 Modules MUST
1) Intent Parser (SlidesIntent)
2) Research/RAG Engine (Workspace-scoped)
3) Outline Engine
4) Storyboard Engine
5) Layout Engine (Grid/Constraints)
6) Theme/Brand Engine
7) Infographic Engine
8) Chart/Table Engine (Data-bound)
9) Media Engine (images/icons)
10) Arabic ELITE Typography Engine
11) Motion/Animation Engine (optional level)
12) QA Validator + Auto-Fix
13) PPTX Exporter + RenderParity verifier
14) Evidence Pack + Audit logger
15) Strict Import Adapter (يربط محرك المطابقة الحرفية السابق لإدراج شرائح من صورة/PDF)
### 5.2 Tool Registry / Action Runtime
- كل Module MUST يُعرض كـTools داخل Tool Registry مع Schemas (Section 12).
- كل تنفيذ MUST يكون Action Graph (plan → execute → evidence).
- MUST منع أي تنفيذ غير مسجل.
---
## 6) Design System (Premium) — قواعد إلزامية
### 6.1 Grid & Spacing
- MUST استخدام Grid ثابت لكل عرض:
  - margins ثابتة
  - baseline grid للنصوص
  - spacing tokens (4/8/12/16/24/32…)
- MUST منع:
  - تراكب عناصر
  - قص نص
  - عناصر خارج safe area
### 6.2 Typography
- MUST اعتماد scale:
  - Title / Section / Body / Caption / Data labels
- MUST دعم:
  - Arabic fonts + Latin fallback ضمن Vault
  - line-height مناسب
  - kerning/tracking
- MUST “Arabic ELITE” إذا اللغة عربية أو mixed.
### 6.3 Color
- MUST تطبيق Brand palette إن وجدت.
- MUST تحقق contrast (WCAG-class) للقراءة.
- MUST توحيد ألوان المخططات (series palette) عبر العرض.
### 6.4 Icons & Illustrations
- MUST vector icons editable (path shapes).
- MUST دعم recolor مطابق للTheme.
- MUST دعم “style coherence” (stroke width, corner radius, shadows).
### 6.5 Motion (اختياري لكنه MUST عند تفعيل motion_level)
- Basic: fade/slide in minimal
- Cinematic: scene-based transitions مع الحفاظ على readability
- MUST عدم استخدام motion يسبب تشويش أو يقطع المحتوى.
- MUST عدم كسر PPTX compatibility.
---
## 7) Infographic Engine (MUST) — مولد مخططات/إنفوجرافيك
### 7.1 Infographic Blocks MUST support
- Timeline (horizontal/vertical)
- Process flow (steps)
- Pyramid / funnel
- SWOT
- 2x2 matrix
- Comparison table + callouts
- KPI cards grid
- Org chart
- Map (إذا بيانات) أو placeholder stylized
- Diagram (boxes/arrows)
- Quote slide
- Image + caption slide
- Section divider slides
- Data summary slide (top metrics)
### 7.2 Block Contract
كل Block MUST:
- يُنتج shapes/text editable
- يتبع grid
- يتبع theme tokens
- يدعم RTL عند العربية
- يقبل data bindings (اختياري) للمخططات/الجداول
---
## 8) Chart/Table Engine (MUST) — بيانات حقيقية
### 8.1 Charts MUST
- bar/line/area/pie/scatter/combo
- axis/ticks/gridlines styles
- legend placement
- data labels (optional)
- series color mapping consistent
- data binding to:
  - Excel table داخل PPTX
  - أو semantic model داخل المنصة
- MUST دعم:
  - Arabic axis labels + RTL behaviors
  - formatting numbers (%, currency, thousands)
### 8.2 Tables MUST
- structured table editable
- header styles
- zebra stripes (optional)
- auto fit داخل grid (لكن لا يقطع النص)
- RTL tables إذا عربية
---
## 9) “Insert Slide from Image/PDF” (MUST) — استخدام محرك STRICT السابق
### 9.1 Strict Import
- MUST دعم أمر: “أدخل شريحة من هذه الصورة/PDF مطابقة 1:1 Editable”
- MUST يمر عبر Strict Replication Engine:
  - Image/PDF → CDR → PPTX slide editable
- MUST إدراج الشريحة داخل deck مع:
  - option: keep original strict styling
  - option: map to current theme tokens (إذا طلب المستخدم صراحة)
### 9.2 No compromise
- إذا المستخدم طلب “مطابقة 1:1”:
  - MUST يستخدم strict pipeline
  - MUST لا “يعيد تصميم”
  - MUST لا يقرب
---
## 10) Arabic ELITE (MUST)
- MUST:
  - bidi shaping + glyph metrics lock
  - RTL layout for blocks/tables/charts
  - mixed Arabic/English handling
  - Arabic numerals options (٠١٢٣ أو 0123) وفق setting
- MUST عدم قلب الاتجاه فقط.
- MUST اختبار عربي ضمن Golden corpus.
---
## 11) QA Gates (MUST) — يمنع أي إخراج غير احترافي
### 11.1 Layout QA MUST
- no overlaps
- no out-of-bounds elements
- safe area respected
- text not clipped
- consistent alignment
- consistent spacing
### 11.2 Typography QA MUST
- minimum font sizes (configurable)
- line-height sane
- no orphan lines
- Arabic shaping correct
- no missing glyphs
### 11.3 Brand/Theme QA MUST
- palette compliance
- font compliance
- logo placement rules (if defined)
### 11.4 Data QA MUST
- charts bound to data
- tables have consistent column widths
- formatting applied
### 11.5 Export Parity QA MUST
- render preview vs render pptx must match (RenderParity gate)
### 11.6 Auto-Fix MUST
- إن فشل QA:
  - MUST تطبيق auto-fix deterministic (no random)
  - MUST إعادة فحص QA
  - MUST لا يُعلن done قبل pass
---
## 12) Tool Schemas (MUST) — الحد الأدنى الإلزامي للتنفيذ
> هذه الـSchemas تُلزم التنفيذ عبر Action Runtime.
> المنفّذ MUST يطبقها حرفيًا. لا يغير أسماء الحقول ولا semantics.
### 12.1 Common defs (مختصر)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://slides.local/schemas/common.json",
  "$defs": {
    "ActionContext": {
      "type": "object",
      "required": ["workspace_id","user_id","locale","mode","arabic_mode","brand_kit_id"],
      "properties": {
        "workspace_id": {"type":"string"},
        "user_id": {"type":"string"},
        "locale": {"type":"string"},
        "mode": {"type":"string","enum":["AUTO","CONTROLLED"]},
        "arabic_mode": {"type":"string","enum":["BASIC","PROFESSIONAL","ELITE"]},
        "brand_kit_id": {"type":"string"}
      },
      "additionalProperties": true
    },
    "AssetRef": {
      "type":"object",
      "required":["asset_id","uri","mime","sha256"],
      "properties":{
        "asset_id":{"type":"string"},
        "uri":{"type":"string"},
        "mime":{"type":"string"},
        "sha256":{"type":"string"}
      },
      "additionalProperties":false
    },
    "DeckRef": {
      "type":"object",
      "required":["deck_id","slide_count"],
      "properties":{"deck_id":{"type":"string"},"slide_count":{"type":"integer","minimum":1}},
      "additionalProperties":false
    },
    "ArtifactRef": {
      "type":"object",
      "required":["artifact_id","kind","uri"],
      "properties":{
        "artifact_id":{"type":"string"},
        "kind":{"type":"string","enum":["pptx","png","json"]},
        "uri":{"type":"string"}
      },
      "additionalProperties":false
    }
  }
}


---

<a id="sec-15"></a>
# ADDENDUM — Presentation Engine (Gamma-Class) — إلزامات إضافية (بدون تكرار السابق)
**هذا الملحق يُضاف حرفيًا إلى مواصفة محرك العروض السابقة** ويُغلق كل نقاط الالتباس التي ذكرتها الآن:
1) إلزام “نوعية التنفيذ” (Engineering Quality Contract) بدون ترك خيار للمنفّذ.
2) دعم “قالب المستخدم” (Template-Lock) لتوليد العرض بنفس القالب.
3) وضعان صارمان للمحتوى: **LITERAL 1:1** (نص المستخدم حرفيًا) و **SMART** (تحليل + صياغة + توليد محتوى).
4) فهم قوي للطلب من نص واحد بدون أسئلة (Auto-first) مع وثائق إثبات (Evidence + Anti-cheating).
> **قاعدة**: أي سلوك غير منصوص عليه هنا أو في المواصفة الأساسية = ممنوع.
> **لا أسئلة**: النظام لا يسأل المستخدم أثناء التوليد إلا عند خطأ I/O (ملف تالف) أو رفض سياسة/صلاحيات.
---
## 1) ENGINEERING QUALITY CONTRACT (إلزام نوعية التنفيذ — لا اجتهاد)
### 1.1 تنفيذ “Production-Grade” إلزامي (MUST)
- MUST بناء النظام كمجموعة خدمات/وحدات واضحة، كل وحدة لها:
  - Contract (Schema) + Tests + Metrics + Evidence output.
- MUST الاعتماد على **OpenXML/PPTX specification** مباشرةً لإنشاء PPTX (لا GUI automation).
- MUST تكون كل المخرجات **PPTX حقيقية** قابلة للفتح في PowerPoint.
- MUST دعم deterministic builds:
  - نفس commit + نفس inputs + نفس configs => نفس artifacts hashes (قدر الإمكان) ونفس render parity.
### 1.2 ممنوعات مطلقة (MUST NOT)
- MUST NOT استخدام stubs/mocks/TODO/FIXME في مسارات الإنتاج.
- MUST NOT ادعاء “تم التصدير/تم البناء” بدون وجود artifact فعلي محفوظ.
- MUST NOT استخدام بيانات ثابتة أو Demo data على أنها بيانات حقيقية.
- MUST NOT إسقاط QA gates أو تعطيلها.
- MUST NOT إعادة صياغة محتوى المستخدم في وضع LITERAL.
- MUST NOT إدراج صور لتغطية نص/جدول/مخطط بدل توليدها كعناصر Editable.
### 1.3 بوابات قبول هندسية (Release Gates — MUST)
كل Merge/Release MUST يمر بالبوابات التالية (فشل أي بوابة = منع الدمج/النشر):
1) **Anti-Dummy Gate**: فحص static يمنع TODO/stub/mock في runtime.
2) **Unit/Integration/E2E**: كلها MUST pass.
3) **Golden Deck Corpus**: مجموعة حالات مرجعية (Arabic/Infographics/Tables/Charts/Templates) MUST pass.
4) **RenderParity Gate**: معاينة المنصة vs Render PPTX في Farm MUST تتطابق (انظر 1.5).
5) **Arabic ELITE Gate**: حالات عربية MUST pass (bidi/shaping/metrics).
6) **Evidence Pack Gate**: Evidence pack MUST يُنتج تلقائيًا لكل build مرشّح للنشر.
### 1.4 اختبارات “كشف الغش” إلزامية (Anti-Cheating Test Suite — MUST)
- Fake-success test: أي endpoint يرجع ok بدون artifact => FAIL.
- PPTX validity test: فتح الملف + تحقق من OpenXML parts => FAIL إذا غير صحيح.
- Editable test: وجود نص كصورة/جدول كصورة => FAIL.
- Template-lock test: عند تفعيل القالب، يجب أن تكون tokens/layouts مطابقة للقالب => FAIL.
- LITERAL test: أي حرف زائد/ناقص => FAIL (انظر Section 3).
- RenderParity test: اختلاف مرئي => FAIL.
### 1.5 Render Parity (إلزام تحقق التصدير) — MUST
- MUST وجود “Deterministic Render Farm” لعرض:
  1) Preview renderer (داخل المنصة)
  2) PPTX renderer (PowerPoint/Office headless pinned)
- MUST مقارنة الناتجين بصريًا (PixelDiff/Parity).
  - **RenderParity MUST == PASS** قبل “DONE”.
  - الهدف هنا تطابق “المعاينة مع ملف PPTX” (ليس strict replication للمدخل).
---
## 2) TEMPLATE-LOCK (توليد العرض على قالب المستخدم — إلزامي)
### 2.1 إدخال القالب (MUST)
المستخدم قد يزوّد:
- PPTX template (ملف)
- أو Theme/Brand kit محفوظ
- أو Deck سابق له
المحرك MUST يدعم:
- `UseTemplate(template_asset_id)` قبل التوليد
- أو `ApplyTemplateToExistingDeck(deck_id, template_id)` بعد التوليد
### 2.2 استخراج القالب (Template Extraction Engine — MUST)
من PPTX template MUST استخراج وحفظ:
- Slide masters + layouts
- Placeholder maps (title/body/chart/table/image zones)
- Typography tokens:
  - font families (Arabic/Latin)
  - sizes scale
  - line heights
  - weights
  - paragraph styles
- Color tokens:
  - palette
  - chart series palettes
  - background/foreground pairs
- Spacing tokens:
  - margins
  - grid columns
  - baseline grid
  - corner radius
  - shadows parameters
- Component styles:
  - KPI cards
  - tables header styles
  - chart theme
  - icon stroke widths
- “Do-Not-Change Rules” (إذا وُجدت): logo placement, header/footer rules, safe areas
### 2.3 Template-Lock Enforcement (MUST)
عند تفعيل القالب:
- MUST استخدام Layouts من القالب أولًا (layout selection constrained to template).
- MUST الالتزام بـTokens حرفيًا (fonts/colors/spacing).
- MUST رفض أي “تصميم من الصفر” خارج القالب.
- MUST أن تكون الأيقونات/الأشكال متسقة مع أسلوب القالب (stroke/rounding/shadow).
- MUST حفظ “Template Compliance Report” داخل Evidence Pack.
---
## 3) CONTENT FIDELITY MODES (وضعان إلزاميان للمحتوى)
### 3.1 MODE_LITERAL_1TO1 (محتوى المستخدم حرفيًا — بدون حرف زيادة/نقصان)
#### 3.1.1 تعريف الوضع (MUST)
- المدخل النصي المستخدم `user_text` MUST يُستخدم حرفيًا 1:1:
  - نفس الحروف
  - نفس الترتيب
  - نفس علامات الترقيم
  - نفس الأسطر/الفقرات (line breaks)
- MUST NOT:
  - إعادة صياغة
  - تلخيص
  - إضافة كلمات
  - حذف كلمات
  - تصحيح إملائي تلقائي
- الاستثناء الوحيد: **Normalization غير مرئية** لحفظ Unicode فقط:
  - MUST تطبق Unicode normalization form ثابت (مثلاً NFC) بشرط ألا يغيّر النص المقروء.
  - MUST توثق هذه السياسة وتثبتها بالاختبارات.
#### 3.1.2 توزيع النص على الشرائح (MUST)
إذا النص لا يتسع في شريحة واحدة:
- MUST إنشاء شرائح إضافية تلقائيًا وفق خوارزمية تقسيم حتمية:
  1) لا تقسيم داخل كلمة.
  2) التقسيم يتم على حدود paragraph ثم sentence ثم bullet ثم space.
  3) الحفاظ على كل حرف.
- MUST الحفاظ على readability دون كسر الحروف العربية (no glyph clipping).
#### 3.1.3 إثبات 1:1 (MUST)
- MUST توليد “Literal Diff Report”:
  - compute exact hash of `user_text`
  - compute hash of extracted text from deck (using PPTX text extractor pinned)
  - MUST يكونان متساويين
- أي اختلاف => FAIL LITERAL MODE.
### 3.2 MODE_SMART (تحليل + صياغة + توليد محتوى احترافي)
#### 3.2.1 تعريف الوضع (MUST)
- النظام MUST:
  - يحلل طلب المستخدم
  - يستنتج outline/storyboard
  - يكتب محتوى احترافي مناسب للجمهور والهدف
- MUST عدم اختراع حقائق غير مدعومة إذا كان الطلب يتضمن بيانات/أرقام:
  - إذا لا يوجد مصدر بيانات داخل workspace => MUST وضع placeholders واضحة “بيانات مطلوبة” أو استخدام بيانات synthetic **موسومة** فقط إذا المستخدم فعّل ذلك صراحة.
- MUST إخراج “Content Trace”:
  - mapping: (slide_id → مصدر/سبب/فقرة من المدخل أو من ملفات المستخدم)
  - لأغراض الثقة ومنع الادعاء.
#### 3.2.2 أسلوب المحتوى (MUST)
- MUST دعم tones:
  - formal / neutral / creative
- MUST دعم audience:
  - executives / technical / sales / training
- MUST دعم length control:
  - sparse / standard / dense
- MUST إخراج speaker notes إذا setting=on.
---
## 4) INTENT UNDERSTANDING (فهم الطلب من نص واحد — بدون أسئلة)
### 4.1 Intent Manifest (MUST)
المحرك MUST يحول أي prompt إلى JSON intent كامل (لا نقص):
- topic
- objective (inform/pitch/report/training)
- audience
- language (ar/en/mixed)
- slide_count
- tone
- density
- infographic_level
- motion_level
- template_id (optional)
- content_fidelity_mode: literal|smart
- constraints:
  - must_include[]
  - must_not_include[]
  - brand_kit_id
  - export_targets (pptx/pdf/images)
- data_sources:
  - asset refs (excel/csv)
  - semantic model refs
- strict_insert_requests[] (assets to convert into strict editable slides)
إذا user لم يحدد قيمة:
- MUST ملؤها تلقائيًا وفق Defaults ثابتة ومعلنة:
  - language auto-detect
  - slide_count default = 10
  - tone default = formal إذا سياق business
  - density default = standard
  - infographic_level default = med
  - motion_level default = none
### 4.2 Intent Quality Gate (MUST)
قبل التوليد:
- MUST validate intent completeness:
  - لا حقل فارغ
  - لا تعارض منطقي (مثلاً literal + “أعد صياغة”)
- MUST إذا تعارض:
  - يطبق Rule: **literal mode يغلب أي طلب صياغة**
  - ويُسجل Warning (لا سؤال).
---
## 5) DECK PLANNING (Outline/Storyboard) — إلزام حتمي
### 5.1 Outline Engine (MUST)
- MUST يولد Outline كهيكل أقسام وشرائح:
  - cover
  - agenda
  - sections
  - conclusion
  - appendix (if needed)
- MUST يدعم:
  - “report style” (نتائج/تحليل/توصيات)
  - “pitch style” (problem/solution/market/traction)
  - “training style” (objectives/lessons/quizzes)
### 5.2 Storyboard Engine (MUST)
كل شريحة MUST تُوصف بـ:
- layout_kind (from template if template-lock)
- content_spec (text/table/chart/infographic blocks)
- data_bindings (if any)
- rtl_policy
- accessibility constraints (min font size)
---
## 6) INFOGRAPHIC / TABLE / CHART INSERTION (أوامر دقيقة — MUST)
المحرك MUST يدعم أوامر تعديل بعد التوليد بدون كسر العرض:
- AddSlide(kind=timeline|swot|matrix|kpi|diagram|table|chart|image_caption|quote|section_divider)
- ReplaceSlide(slide_index, new_kind)
- ConvertSlideToInfographic(slide_index, block_type)
- AddChart(slide_index, from_table=asset_ref, mapping=…)
- AddTable(slide_index, from_data=…, style=template_tokens)
- AddSlideFromImageStrict(asset_id, slide_index)  ← يستخدم Strict Replication Engine
- ReThemeDeck(theme_id) (إذا لم يكن template-lock أو إذا user requested)
---
## 7) ARABIC ELITE (إلزامي داخل محرك العروض)
- MUST تطبيق نفس Arabic ELITE engine:
  - bidi + shaping + metrics lock
  - RTL layout for tables/axes/blocks
  - mixed scripts
- MUST منع:
  - قصّ glyphs
  - انكسار أسطر غير صحيح
  - تكدس/تداخل بسبب RTL
---
## 8) PPTX OBJECT MODEL CONTRACT (ممنوع الاختصار — MUST)
المنفّذ MUST يبني PPTX وفق هذا النموذج:
- masters/layouts موجودة ومستخدمة
- كل نص = shape text runs (لا تحويل إلى صورة)
- كل icon = vector paths (shape) قابلة للتلوين
- كل chart = chart part + embedded workbook part (data-bound)
- كل table = structured shapes أو native table object (عند الإمكان) مع خلايا قابلة للتعديل
- كل صورة = image part مع mask/crop editable
- animations (إن فعلت) MUST تكون PowerPoint-compatible ولا تكسر render parity
---
## 9) QA & AUTOFIX (إلزامي قبل “DONE”)
### 9.1 QA Rules MUST
- no overlaps
- no clipping
- safe area respected
- consistent spacing tokens
- consistent typography scale
- contrast OK
- template compliance OK (if template-lock)
- Arabic ELITE pass
### 9.2 Autofix MUST (deterministic)
- MUST إصلاح تلقائي بدون عشوائية:
  - shrink text within safe min
  - split slide if needed
  - adjust layout frames
  - rotate/abbrev labels deterministically
- MUST إعادة QA حتى pass.
---
## 10) EVIDENCE PACK (شرط إعلان النجاح)
كل عملية export MUST تولد Evidence Pack:
- preview renders (farm)
- pptx renders (farm)
- render parity diff report
- template compliance report
- literal diff report (إذا literal mode)
- arabic shaping report (checks)
- QA report + autofix steps
- artifact_id + hashes
- full action graph snapshot
لا Evidence Pack => MUST NOT say “Done”.
---
## 11) SLIDES ENGINE TOOL SCHEMAS (إلزامية — تضاف إلى Tool Registry)
> هذه الأدوات **مضافة** إلى ما في المواصفة السابقة (لا تستبدلها).
### 11.1 slides.intent_manifest_build (MUST)
- Input: prompt + assets + template_id(optional) + mode(literal|smart)
- Output: intent_manifest JSON (complete)
### 11.2 slides.template_extract (MUST)
- Input: template_pptx asset
- Output: theme_tokens + layout_catalog + compliance_rules
### 11.3 slides.generate_outline (MUST)
- Input: intent_manifest
- Output: outline
### 11.4 slides.generate_storyboard (MUST)
- Input: outline + theme_tokens
- Output: storyboard
### 11.5 slides.build_deck (MUST)
- Input: storyboard + assets + theme_tokens
- Output: deck_ref
### 11.6 slides.apply_content_mode_literal (MUST)
- Input: user_text + deck_ref
- Output: literal_applied_deck_ref + literal_hash_report
### 11.7 slides.apply_content_mode_smart (MUST)
- Input: sources + deck_ref
- Output: smart_content_deck_ref + content_trace
### 11.8 slides.insert_strict_slide_from_asset (MUST)
- Input: asset(pdf/image) + target_index
- Output: updated deck_ref
- Behavior: MUST call Strict Replication Engine (STRICT_1TO1_100) and insert editable slide.
### 11.9 slides.qa_validate / slides.qa_autofix (MUST)
- Output: pass boolean + issues + fix log
### 11.10 slides.export_pptx + slides.render_parity_verify (MUST)
- MUST verify parity before success
### 11.11 slides.evidence_pack (MUST)
- MUST store evidence and return evidence_id
> **تنبيه إلزامي**: أي tool هنا MUST يُعرّف له JSON schema input/output في Tool Registry بنفس أسلوب schemas السابقة (common defs + request_id/tool_id/context/inputs/params).
---
## 12) “DONE” — تعريف نهائي (ممنوع تجاوزه)
المحرك MUST NOT يعتبر نفسه انتهى إلا إذا:
- intent_manifest مكتمل
- (template-lock) template compliance pass
- (literal) literal text hash match
- (smart) content_trace موجود
- QA pass
- PPTX exported
- RenderParity pass
- Evidence pack stored
- ثم فقط يرسل UI/AI رسالة “تم”.
---
# END OF ADDENDUM


---

<a id="sec-16"></a>
# ADDENDUM ULTIMATE — Presentation Engine “Infinite Control + Infinite Options” (Canvas-One, AI-First, NO CHEATING)
**ملحق إلزامي يُضاف حرفيًا إلى مواصفة محرك العروض السابقة + ملحقها**
**الهدف**: رفع المحرك إلى مستوى عالمي “Gamma-class+” في السهولة والذكاء والتحكم والخيارات غير المحدودة، مع إبقاء UX بسيطًا (Canvas واحد) وعدم إغراق المستخدم بخيارات مرة واحدة.
**قاعدة صارمة**: أي سلوك غير منصوص عليه هنا = **ممنوع**. لا “ابتكار” من المنفّذ.
---
## 0) Non-Negotiable Expansion (بدون تنازل)
### 0.1 مبادئ لا تقبل الاستثناء
1) **AI يمكنه توليد كل شيء تلقائيًا** (Auto) إذا اختار المستخدم “اتركه للذكاء الاصطناعي”.
2) **المستخدم يمكنه التحكم بكل شيء** (Control) لكن عبر Controls ذكية متدرجة (Progressive) وليست صفحة إعدادات ضخمة.
3) **أي تعديل من المستخدم MUST ينتج معاينة فورية** + قابلية الرجوع (Undo/Version).
4) **Infinite Options** لا تعني “قائمة لا نهائية”؛ تعني:
   - Library Packs + Parametric Generators + Search + Suggestion Engine
   - وتُعرض الخيارات تدريجيًا حسب السياق.
5) **لا كود وهمي / لا ديمو / لا ادعاء**:
   - لا تُعرض خيارات “غير منفذة” أو “قيد التطوير”.
   - لا يُقال “تم” إلا بعد Artifact حقيقي + Evidence.
---
## 1) CONTROL MANIFEST (نموذج تحكم موحد) — MUST
### 1.1 قرار كل إعداد: Auto أو Fixed (بدون أسئلة)
كل إعداد/خيار MUST يُمثل بـ:
- `mode: "auto" | "fixed"`
- إذا auto: AI يختار ضمن سياسات ثابتة.
- إذا fixed: يُطبق حرفيًا.
### 1.2 قائمة الإعدادات الإلزامية (MUST support)
> لا تُعرض كلها دفعة واحدة، لكنها MUST متاحة عبر “Search Controls” + “Context Drawer”.
**Deck-level**
- fidelity_mode: `literal_1to1 | smart`
- language: `ar | en | mixed`
- slide_count: 1..200
- slide_size: `16:9 | 4:3 | A4 | custom(w,h)`
- slide_resolution_hint: `standard | hi_dpi` (للمعاينة/الصور)
- theme_source: `auto | brand_kit | template_pptx | existing_deck`
- palette: `auto | fixed(palette_id)`
- fonts: `auto | fixed(ar_font, latin_font, mono_font)`
- background_style: `auto | solid | gradient | image | pattern`
- tone: `formal | neutral | creative`
- density: `sparse | standard | dense`
- infographic_level: `low | med | high`
- motion_level: `none | basic | cinematic`
- numbering_style: `off | slide_x_of_y | section_based | custom`
- toc_index: `off | on` + style
- header_footer_rules: `auto | fixed(ruleset_id)`
- citations: `off | on(style)` (إن فعّل)
- export_targets: `{pptx, google_slides, pdf, html}`
**Slide-level / Element-level**
- layout_variant
- infographic_variant
- table_style_variant
- chart_style_variant
- icon_style_variant
- image_treatment (crop/mask/duotone/blur-bg)
- RTL policies per slide
### 1.3 تفضيلات المستخدم (Preferences) — MUST
- لكل مستخدم MUST وجود `user_prefs` تشمل:
  - default fidelity_mode
  - default language
  - default slide_size
  - default tone/density/infographic_level/motion_level
  - default fonts/palette/background
  - default numbering/TOC/header style
  - default export targets
- MUST وجود مفتاح:
  - `prefs_enabled: true|false`
  - إذا true: تُطبق تلقائيًا على أي deck جديد، إلا إذا user ثبّت خيارًا Fixed.
---
## 2) UX: Progressive Controls (خيارات ديناميكية ذكية) — MUST
### 2.1 لا “صفحة إعدادات” كبيرة
- MUST عدم عرض 30+ خيارًا دفعة واحدة.
- MUST تقديم واجهتين فقط:
  1) **Command Bar** (نص + أوامر)
  2) **Context Drawer** يظهر خيارات حسب ما حدده المستخدم (deck/slide/element)
### 2.2 Control Surfacing Policy (إظهار الخيارات حسب السياق) — MUST
عند كل حالة:
- إذا لم يحدد المستخدم أي عنصر: تظهر **Deck Controls الأساسية فقط** (5–9 خيارات).
- إذا حدد شريحة: تظهر **Slide Controls** (5–9).
- إذا حدد عنصر: تظهر **Element Controls** (5–9).
- كل ما هو غير ظاهر MUST متاح عبر:
  - **Search Controls** (بحث فوري عن أي خيار باسم/وصف)
  - **More** (يفتح مجموعة صغيرة متدرجة، لا قائمة ضخمة).
### 2.3 Smart Defaults (بدون أسئلة) — MUST
- النظام MUST يختار defaults صريحة:
  - إذا prompt business ولم يحدد tone: formal
  - إذا العربية detected: arabic_mode=ELITE
  - إذا template موجود: template-lock ON
  - إذا لم يحدد slide_count: 10
- لا “أسئلة” أثناء التوليد.
### 2.4 Preview After Every Change — MUST
- أي تغيير (theme, color, font, infographic swap, chart swap, table edit) MUST ينتج:
  - preview render محدث
  - في ≤ X ثوانٍ (SLO يحدد في سياسة الأداء، لكن لا يجوز “بدون معاينة”)
---
## 3) LITERAL vs SMART (وضعان إلزاميان للمحتوى) — توسعة صارمة
### 3.1 LITERAL_1TO1 (Strict Text Fidelity) — MUST
- MUST استخدام نص المستخدم حرفيًا 1:1:
  - no rewrite, no fix, no summarize
- MUST توزيع النص على شرائح deterministically دون فقد حرف.
- MUST إصدار:
  - `literal_hash_in` = hash(text_input_normalized)
  - `literal_hash_out` = hash(extracted_text_from_pptx)
  - MUST equality أو FAIL.
### 3.2 SMART (High-Intelligence Content) — MUST
- MUST تحليل intent بذكاء (قسم 4) وإنتاج:
  - outline/storyboard
  - صياغة احترافية
  - اقتراحات infographics/charts/tables
- MUST عدم اختراع بيانات:
  - إذا data غير موجود: إما يطلب user إدخال مصدر (عبر Data Picker) أو ينتج placeholders موسومة، ولا يُدعي أنها حقيقية.
---
## 4) INTENT UNDERSTANDING (تحليل الطلب النصي بقوة) — MUST
### 4.1 Intent Manifest MUST be complete from 1 prompt
- MUST إنتاج `intent_manifest.json` متكامل (لا نقص) يتضمن:
  - objective (report/pitch/training/executive update)
  - audience (exec/technical/sales/general)
  - required slides (types + must_include)
  - constraints (literal/smart, template lock, brand)
  - data needs (metrics, tables, charts)
  - language rules (arabic/mixed)
  - export targets
### 4.2 Disambiguation بدون أسئلة (MUST)
- أي غموض MUST يحل بسياسة ثابتة:
  - إذا user كتب “تقرير”: objective=report
  - إذا ذكر KPI: يضيف KPI slide
  - إذا ذكر “مقارنة”: يضيف comparison slide
- ممنوع سؤال المستخدم “هل تقصد…؟” في التدفق الافتراضي.
### 4.3 “Control-First Not Questions” (MUST)
إذا كان هناك خيار مؤثر:
- MUST يظهر كـControl toggle في Context Drawer مع default.
- وليس كسؤال حواري.
---
## 5) INFINITE OPTIONS SYSTEM (خيارات لا نهائية بدون فوضى) — MUST
> التنفيذ MUST يبنى كنظام “مولد + مكتبات + بحث + توصية”، وليس كقائمة ثابتة.
### 5.1 Catalog Architecture (MUST)
المنفّذ MUST يبني Catalogs منفصلة:
- `layout_catalog`
- `infographic_catalog`
- `chart_skin_catalog`
- `table_style_catalog`
- `icon_pack_catalog`
- `motion_preset_catalog`
- `header_footer_catalog`
- `background_catalog`
كل Catalog MUST:
- versioned
- searchable (tags + embeddings داخلية)
- supports filters (rtl-ready, density, tone, brand compatibility)
- returns “top N” suggestions
### 5.2 Minimum Library Size (MUST)
حتى لا تكون “تنظير”، هذه حدود دنيا إلزامية:
- Layout templates ≥ 300
- Infographic blocks ≥ 250
- Table styles ≥ 200
- Chart skins ≥ 150
- Icon packs ≥ 50 (vector)
- Motion presets ≥ 80
- Header/footer presets ≥ 120
- Background presets ≥ 200
- **AND** مولد Parametric Variations يعطي ≥ 10x لكل أصل
=> إجمالي Variants MUST ≥ 50,000 (قابل للتوسع).
### 5.3 Parametric Generator (MUST)
بدل “قائمة لا تنتهي”:
- كل أصل في Catalog MUST يدعم Parameters:
  - spacing_scale
  - corner_radius
  - stroke_width
  - shadow_depth
  - palette mapping
  - typography scale
  - rtl mirroring rules
=> ينتج Variants حقيقية قابلة للتطبيق فورًا.
### 5.4 Suggestion UX (MUST)
عند اختيار عنصر/شريحة:
- يظهر **Suggestion Strip** (8–12 خيارًا) + زر “More like this”
- زر “More like this” MUST يولد Variants جديدة (parametric + nearest neighbors)
- زر “Different direction” MUST يقفز إلى عائلة أخرى (different cluster)
---
## 6) ELEMENT-LEVEL TRANSFORMATIONS (تغيير لا نهائي على عنصر محدد) — MUST
### 6.1 Element Targeting (MUST)
- عند ضغط المستخدم على عنصر:
  - MUST يظهر شريط “Transform”
  - MUST يدعم:
    - Replace style
    - Replace layout container
    - Convert to infographic
    - Swap icon pack
    - Change chart type
    - Change table style
    - Change background treatment
    - Change animation preset
    - Change typography scale locally
### 6.2 Transform Rules (MUST)
- التغيير MUST:
  - يحافظ على grid
  - يحافظ على عدم القص/التداخل
  - يعيد QA تلقائيًا
  - ينتج Preview فورًا
### 6.3 Infographic Swap (MUST)
إذا المستخدم لم يعجبه infographic:
- MUST زر: “بدّل الإنفوجرافيك”
- ينتج:
  - 12 بديل فوري
  - + “More like this”
  - + “Simpler / More data-heavy”
- MUST يحافظ على المحتوى (literal محتوى لا يتغير)
### 6.4 Table Swap / Chart Swap (MUST)
- Table: style-only swap + layout-aware resize
- Chart: type swap (bar↔line↔area↔combo…) مع الحفاظ على bindings
- MUST عدم إسقاط البيانات أو تحويلها لصورة.
---
## 7) DATA PICKER داخل العروض (Excel/Library → Table/Chart) — MUST
### 7.1 Select Table from Library (MUST)
المستخدم MUST يستطيع:
- اختيار ملف Excel من المكتبة
- اختيار Sheet
- اختيار Table range أو Named table
- اختيار Columns
- تطبيق شروط/filters (بأوامر بسيطة أو UI)
- ثم إدراج:
  - Table slide
  - Chart slide
  - KPI slide
### 7.2 Transformations (MUST)
- أي شروط/تحويلات MUST تمر عبر IR engine (T-IR) في المنصة:
  - filter, group, join, pivot, derive column…
- MUST Preview للبيانات قبل الإدراج.
### 7.3 Binding (MUST)
- PPTX chart MUST يكون مرتبطًا بالdata داخل الـdeck (embedded workbook) أو semantic model داخل المنصة.
- عند تحديث المصدر:
  - MUST إعادة تحديث الشرائح (refresh) مع الحفاظ على التصميم.
---
## 8) DASHBOARD-LIKE SLIDES (لوحات مؤشرات داخل العرض) — MUST
### 8.1 KPI/Filters on Slides (MUST)
- المحرك MUST يدعم “Dashboard slide” داخل PPTX:
  - KPI cards
  - mini charts
  - table
  - slicer-like filters (داخل المنصة + في HTML export)
- في PPTX:
  - تُحاكى الفلاتر كـcontrols داخل HTML export + داخل منصة العرض
  - داخل PPTX نفسه: تعتمد على hyperlinks/sections أو شرائح حالات (state slides) إذا لزم (لكن MUST تبقى editable).
### 8.2 Slide States Generator (MUST)
- إذا المستخدم طلب فلاتر متعددة:
  - MUST إنشاء “states”:
    - state_1, state_2…
  - مع navigation واضح
  - ويظل كل شيء editable.
---
## 9) MEDIA & CONNECTORS (صور/فيديو + ربط خارجي) — MUST
### 9.1 Integrations (MUST)
- MUST دعم ربط خارجي للـAssets:
  - Google Drive / OneDrive / SharePoint / S3 (على مستوى المنصة)
- داخل محرك العروض:
  - MUST إدراج صورة/فيديو من:
    - library
    - connector picker
  - مع caching + metadata
### 9.2 Video in Presentation (MUST)
- MUST دعم إدراج فيديو:
  - embed video داخل PPTX (media part) إن أمكن
  - أو link mode إذا سياسة المؤسسة تمنع embedding
- MUST دعم:
  - poster frame (thumbnail)
  - start time (optional)
  - playback settings (on click/auto) ضمن حدود PPTX
- HTML export MUST يدعم تشغيل الفيديو مباشرة.
---
## 10) PREVIEW READER (قارئ العرض) — MUST
### 10.1 Preview UX (MUST)
- MUST وجود “Presentation Reader”:
  - يفتح كـOverlay أو نافذة جديدة (ليس صفحة إعدادات)
  - يعرض الشرائح full-screen
  - يدعم transitions/motion (حسب motion_level)
  - يدعم RTL بشكل صحيح
- MUST تحديث preview بعد كل تغيير.
### 10.2 Export Preview Parity (MUST)
- MUST مقارنة:
  - Reader render
  - PPTX render
  - PDF render
  - HTML render
- أي اختلاف مرئي كبير = BUG (منع done).
---
## 11) EXPORT MATRIX (PPTX / Google Slides / PDF / HTML) — MUST
### 11.1 PPTX (MUST)
- OpenXML صحيح
- editable
- embedded fonts (حسب policy)
- charts bound
- tables structured
### 11.2 Google Slides (MUST)
- MUST تصدير:
  - إما: إنشاء Slides عبر Google Slides API
  - أو: رفع PPTX وتحويله إلى Google Slides (إذا متاح في سياسات Google Drive API)
- MUST نفس layout قدر الإمكان
- MUST حفظ قيود التحويل داخل evidence (ما الذي تغيّر إن وجد)
### 11.3 PDF (MUST)
- render PDF من deck
- يحافظ على الجودة
- RTL صحيح
### 11.4 HTML (MUST)
- MUST تصدير deck كـHTML player:
  - animations
  - interactions (filters/states)
  - video playback
- MUST يكون self-contained أو مع assets served via CDN policy.
### 11.5 Export Done Rule (MUST)
- لا “تم التصدير” إلا بعد:
  - artifacts موجودة فعليًا
  - parity checks pass
  - evidence stored
---
## 12) PERFORMANCE & CACHING (بدون بطء) — MUST
- MUST caching keyed by:
  - intent_manifest hash
  - template_id hash
  - theme_tokens hash
  - deck version id
  - data bindings signature
- MUST incremental re-render:
  - إذا تغير عنصر واحد: لا تعيد بناء كل deck
- MUST page-level parallel render في farm
---
## 13) NO-CHEATING (إلزامي داخل محرك العروض)
- MUST منع أي خيار غير منفذ من الظهور.
- MUST منع “demo templates” إلا إذا موسومة وطلبها المستخدم.
- MUST logs/audit لكل تغيير.
- MUST evidence pack لكل export.
- MUST لا claim “Gamma-class” بدون:
  - corpus tests + parity tests + Arabic tests.
---
## 14) TOOLS (Schemas إلزامية جديدة) — MUST
> هذه أدوات إضافية يجب تسجيلها في Tool Registry (بنفس نموذج request_id/tool_id/context/inputs/params).
> المنفّذ MUST يكتب schemas كاملة لها كما فعلنا سابقًا — لا تغيير في semantics.
**MUST Tools**
- slides.control_manifest_build
- slides.preferences_get / slides.preferences_set
- slides.catalog_search (layout/infographic/table/chart/icon/motion/header/background)
- slides.variant_generate (more like this / different direction)
- slides.element_transform (apply variant to element)
- slides.data_picker_browse (select excel/sheet/range/columns)
- slides.data_binding_apply (bind to table/chart/kpi)
- slides.media_import (drive/onedrive/s3 + local)
- slides.video_embed (pptx media part/link + poster)
- slides.preview_render (reader frames)
- slides.reader_launch (open overlay)
- slides.export_google_slides
- slides.export_pdf
- slides.export_html
- slides.parity_matrix_verify (reader vs exports)
- slides.evidence_pack_export (extends existing)
> **قاعدة**: كل tool MUST يملك:
> - input schema
> - output schema
> - required_permissions
> - deterministic behavior (no random without pinned seed)
> - evidence hooks
---
# END — هذا الملحق يغلق “Infinite control + Infinite options” بدون فوضى، وبـPreview/Exports/Data/Video/Template/Preferences.


---

<a id="sec-17"></a>
# EXCEL ENGINE SPEC — Ultra-Scale “Drag Columns Like LEGO” + PowerQuery IR + SVM + AI Analyst (NO CHEATING)
**وثيقة تنفيذية فنية موجهة للمنفّذ مباشرة** — صياغة أمرية إلزامية (MUST/SHALL/MUST NOT)
**نطاق المحرك**: استيعاب/فهم/تنظيف/توحيد/دمج/تقسيم/تحويل/تحليل/تجميل/تصدير أي بيانات (Excel/CSV/PDF/صور/…)، مع واجهة “جدول فارغ” + سحب وإفلات أعمدة من أي ملف/ورقة/جدول، ودعم ملايين/مليارات السجلات عبر Columnar Lakehouse.
**قاعدة صارمة**: أي سلوك غير منصوص عليه هنا = **ممنوع**. أي “تقريب/ديمو/ادعاء” = **مرفوض**. لا يُقال “تم” إلا بعد تنفيذ حقيقي + اختبارات + Evidence.
---
## 0) Non-Negotiable (تعريف النجاح)
### 0.1 Definition of SUCCESS
المحرك يُعتبر ناجحًا فقط إذا حقق **كل** ما يلي:
1) **Canvas واحد + جدول فارغ كمدخل**
   - MUST يبدأ المستخدم من “Blank Table Canvas” (جدول فارغ) يمكنه أن يبنيه بالسحب والإفلات من مكتبة الملفات/الأوراق/الأعمدة.
2) **Cross-File Column Drag & Drop**
   - MUST تمكين سحب عمود من أي ملف/أي ورقة/أي جدول وإفلاته داخل الجدول النهائي.
   - MUST دعم أعمدة ضخمة (ملايين/مليارات صفوف) بدون تجميد UI عبر Virtualization + Streaming.
3) **Power Query-Like بدون كود + Expression Engine**
   - MUST توفير Blocks UI تتحول إلى Transform IR (T-IR) وتنفيذها deterministically.
   - MUST دعم Expressions/Calculations بواجهة مبسطة + خيار كتابة Expression لمن يريد.
   - MUST تصدير التحويلات إلى Power Query (M) عند الطلب.
4) **SVM (Spreadsheet Virtual Machine) — Excel حقيقي**
   - MUST وجود محرك تنفيذ صيغ deterministically (Formula DAG + Recalc) + دعم Pivot/CF/Frozen panes/Charts anchors ضمن نطاق تغطية مُعلن ومطبق بالكامل.
5) **AI Analyst قوي (ليس مساعد بسيط)**
   - MUST يفهم سياق البيانات ويقترح تلقائيًا: تنظيف/توحيد/دمج/مفاتيح ربط/KPIs/مقارنات/Root-cause/تنبؤ.
   - MUST يعمل في وضعين دائمين:
     - Smart Mode (زر واحد “حلل كل شيء”)
     - Pro Mode (تحكم كامل بدون حوار طويل).
6) **No-Cheating / No Dummy / No Claims**
   - MUST NOT أي كود وهمي أو stubs أو ديمو أو بيانات ثابتة تُعرض كحقيقية.
   - MUST Evidence Pack لكل عملية تصدير/تحويل كبيرة.
---
## 1) UX — Canvas واحد + Controls ذكية متدرجة (بدون فوضى)
### 1.1 الشاشات المسموحة (MUST)
- شاشة واحدة فقط: **Data Canvas**
  - وسط الشاشة: **Result Table** (جدول النتائج) + Tabs للأوراق داخل نفس الملف الناتج.
  - يسار/يمين: Panel واحد قابل للإخفاء:
    - Library (الملفات/المجلدات/المصادر)
    - Column Map (خريطة الأعمدة والعلاقات)
    - Operations (Blocks) حسب السياق
    - Recipes (سجل العمليات)
    - QA/Quality (جودة البيانات)
    - Export
### 1.2 Progressive Controls (MUST)
- MUST عدم عرض خيارات كثيرة دفعة واحدة.
- MUST عرض 5–9 خيارات فقط حسب السياق:
  - إذا لم يحدد المستخدم شيئًا: يظهر “Import / Analyze / Build Table / Export”.
  - إذا حدد عمودًا: تظهر عمليات العمود فقط.
  - إذا حدد جدولًا: تظهر عمليات الجداول فقط.
  - إذا حدد علاقة: تظهر عمليات الربط/Join فقط.
- MUST توفير “Search Controls” للعثور على أي عملية بالاسم بدل قوائم ضخمة.
### 1.3 Preview دائم (MUST)
- كل عملية (rename/split/join/filter/pivot/…) MUST تُحدث:
  - Preview جزء (Sample) فورًا
  - ثم Apply كامل عبر Job Queue (خلفية) مع Progress
- MUST أن UI لا يتجمد أبدًا؛ أي عملية ثقيلة MUST تتحول إلى Job.
---
## 2) Operating Modes — Smart / Pro (MUST)
### 2.1 Smart Mode (زر واحد)
زر: **Analyze Everything**
ينفذ deterministically:
1) Preflight
2) اكتشاف الجداول داخل كل Sheet
3) توحيد أسماء الأعمدة المتشابهة (AI)
4) تنظيف أساسي (nulls/duplicates/typos/format)
5) اقتراح دمج (Smart Join Suggestions)
6) بناء “Unified Master Table” (إن أمكن)
7) KPIs + Summary Table + Suggested Charts
8) إنتاج:
   - Result Table
   - Quality Report
   - Suggested Dashboards/Slides/Reports (كروابط/Plans)
> Smart Mode MUST لا يسأل المستخدم؛ قراراته تُسجل وتُعرض كمقترحات قابلة للتعديل.
### 2.2 Pro Mode (تحكم كامل)
- المستخدم يحدد:
  - keys للربط
  - نوع join
  - الأعمدة المطلوبة
  - قواعد التنظيف
  - قواعد التوحيد
  - عمليات T-IR خطوة بخطوة
- Pro Mode MUST يبقى في Canvas واحد بدون صفحات إضافية.
---
## 3) Universal Data Intake (MUST) — ليس Excel فقط
### 3.1 Sources MUST
- Excel: xlsx/xlsm (بدون ماكرو تنفيذ)
- CSV/TXT
- PDF (جداول/تقارير)
- Images (صور جداول/تقارير)
- Google Sheets (connector)
- DBs (Postgres/MySQL/SQL Server… connectors)
- ZIP/Folder upload
### 3.2 Extraction Rules (MUST)
- Excel:
  - MUST قراءة جميع الشيتات تلقائيًا
  - MUST اكتشاف الجداول حتى لو غير منسقة (range detection)
  - MUST تجاهل صفوف غير مهمة (عناوين/ملاحظات) وفق خوارزمية pinned
- PDF/Images:
  - MUST استخدام محرك “Strict Table Extraction” (من منظومة المطابقة) عندما يكتشف جدولًا
  - MUST إخراج Table structured + Style mapping
---
## 4) Data Model (مغلق — يمنع الاجتهاد)
### 4.1 Canonical Storage (MUST)
- MUST تحويل كل البيانات داخليًا إلى Columnar:
  - Arrow in-memory + Parquet on-disk
- MUST وجود Catalog:
  - file → sheet → table → column lineage
  - column fingerprints + stats + semantic tags
- MUST وجود Semantic Graph:
  - entities, keys, relationships, time dimensions
### 4.2 Dataset Identifiers (MUST)
كل كيان MUST له معرف:
- asset_id (file)
- sheet_id
- table_id
- column_id
- dataset_id (نتيجة)
- recipe_id (سير عمل)
---
## 5) Data Ingestion Module (MUST) — Preflight قبل الاستيراد
### 5.1 Drag&Drop Batch Ingest (MUST)
- MUST دعم سحب:
  - ملفات متعددة دفعة واحدة
  - مجلد كامل
  - ZIP يحتوي ملفات
- MUST:
  - لا يعلق UI
  - يعرض progress + ETA (اختياري) لكن بدون وعود كاذبة
### 5.2 Preflight Scan (MUST)
قبل إدخال البيانات إلى lakehouse:
- MUST عرض ملخص:
  - عدد الشيتات/الجداول
  - عدد الصفوف/الأعمدة
  - نسبة الفراغات
  - أعمدة حساسة (PII) detected
  - أعمدة متكررة
  - احتمالات الربط عبر الملفات
- MUST بناء “Content Map”:
  - خريطة كل ملف → شيت → جداول → أعمدة
---
## 6) Column Intelligence System (MUST) — قلب المحرك
### 6.1 Unified Column Catalog (MUST)
- MUST عرض قائمة موحدة لكل الأعمدة عبر كل الملفات.
- لكل Column:
  - source lineage
  - null ratio
  - unique count
  - type inference
  - semantic label (AI)
  - sensitivity label (PII)
### 6.2 AI Column Unification (MUST)
- MUST توحيد أسماء الأعمدة المتشابهة حتى لو اختلف الاسم/اللغة:
  - Customer_ID / رقم العميل / Client No → “customer_id”
- MUST produce:
  - `column_synonym_groups[]` مع confidence
- MUST عدم تطبيق التوحيد تلقائيًا في Pro mode إلا إذا user وافق (toggle).
  Smart mode يطبقه ويترك undo.
### 6.3 Column Map (Visualization) (MUST)
- MUST واجهة “خريطة الأعمدة”:
  - Nodes = columns
  - Edges = suggested relationships / identical semantics
- MUST يسمح بالسحب لإنشاء علاقة أو دمج.
---
## 7) Table Operations (MUST) — دمج/تقسيم/تجميع
### 7.1 Joins (MUST)
- MUST دعم: inner/left/right/full/semi/anti
- MUST دعم composite keys
- MUST Smart Join Suggestions:
  - يقترح أفضل keys تلقائيًا عبر scoring (Section 16)
### 7.2 Union / Append (MUST)
- MUST دمج جداول متشابهة عبر:
  - schema alignment
  - column unification mapping
  - missing columns handling (null fill)
- MUST حفظ lineage لكل صف.
### 7.3 Group/Aggregate (MUST)
- MUST عمليات:
  - sum/avg/count/distinct_count/min/max/std
- MUST pivot/unpivot
- MUST إنشاء “Summary Tables” بضغطة زر.
### 7.4 Split (MUST)
- Split by:
  - column criteria
  - time period
  - category
- MUST “Smart Split”:
  - يقترح أفضل تقسيم وفق توزيع البيانات.
---
## 8) Column Operations (MUST) — كل ما يلزم
### 8.1 Rename (MUST)
- rename فردي/جماعي
- enforce naming standard (snake_case)
- keep original display name as alias
### 8.2 Split Column (MUST)
- split by delimiter
- split by regex (pro)
- split date into y/m/d
- split full name into first/last (AI)
- MUST preview + apply
### 8.3 Merge Columns (MUST)
- merge with format template
- conditional merge
- numeric merge rules
### 8.4 Clean Text (MUST)
- trim spaces
- normalize unicode
- remove symbols
- casing
- spelling corrections (controlled, with audit)
- normalize city names (رياض/Riyadh) via mapping table
### 8.5 Type/Format (MUST)
- detect & convert:
  - dates
  - currency
  - percent
  - IDs (keep as string)
- MUST not corrupt IDs (leading zeros preserved).
### 8.6 Derived Columns (MUST)
- create column from expression
- create column from T-IR step
---
## 9) Expression Engine + Power Query (T-IR) (MUST)
### 9.1 Transform IR (T-IR) (MUST)
- كل عملية UI MUST تتحول إلى T-IR step:
  - select/rename/filter/sort/cast/derive/join/group/pivot/unpivot/split/merge/dedupe/impute
- MUST preview سريع على sample
- MUST apply كامل على lakehouse
### 9.2 Export to Power Query M (MUST عند الطلب)
- MUST translate T-IR إلى M (للعمليات المدعومة)
- إذا خطوة غير قابلة للترجمة:
  - MUST تمييزها “non-exportable”
  - MUST لا يدعي التصدير الكامل
### 9.3 Determinism (MUST)
- T-IR execution MUST يكون deterministic:
  - stable sort rules
  - stable join collision rules
  - pinned locale rules for parsing numbers/dates
---
## 10) Excel SVM (Spreadsheet Virtual Machine) (MUST)
### 10.1 Core (MUST)
- build formula dependency DAG
- deterministic recalc engine
- stable rounding policy
- support:
  - common functions set (معلن كقائمة) MUST implemented بالكامل
  - LET/LAMBDA subset coverage MUST declared and implemented
- MUST detect circular refs
### 10.2 Pivot/CF/Charts (MUST)
- pivot reconstruction deterministic
- conditional formatting rules
- freeze panes/filters
- charts anchored to cells
- any unsupported feature MUST:
  - be rejected as unsupported (not “pretend”)
  - or translated to supported equivalent deterministically
---
## 11) Massive Scale (MUST) — ملايين/مليارات بدون تجميد
### 11.1 Execution Engine (MUST)
- MUST تنفيذ استعلامات وتحويلات عبر:
  - Arrow + embedded analytical engine (DuckDB-class)
  - optional distributed engine (ClickHouse-class) عند scale
- MUST support:
  - incremental refresh
  - materialized views
  - partitioning by time/entity
  - streaming ingestion
### 11.2 UI Virtualization (MUST)
- result table must be virtualized:
  - no full load
  - fetch windowed rows
- all operations run async with progress.
---
## 12) Data Cleaning Suite (MUST)
- deduplicate (exact + fuzzy)
- missing values detection + imputation suggestions
- outlier detection (domain aware)
- logical constraints (age>120 invalid)
- standardize units (currency/date/timezone)
- quality score 0–100 لكل ملف/جدول
MUST produce:
- Quality Report (مقاييس + توصيات + ما تم تطبيقه)
---
## 13) Comparison Engine (MUST) — ملف/جدول/عمود
### 13.1 Compare Types (MUST)
- compare two files (all sheets)
- compare two tables
- compare two columns
- compare two datasets across time
- detect: added/removed/changed rows
- cell-level diff for XLSX when needed
### 13.2 Diff Output (MUST)
- highlight diffs
- generate “Diff Table”
- generate “Diff Report” (Word/PDF optional)
- allow export diff to xlsx/csv
---
## 14) KPI + Dashboard-in-Excel + Output Integrations (MUST)
### 14.1 KPI Suggestions (MUST)
- propose KPIs by dataset type:
  - growth, MoM/YoY, churn, conversion, anomaly
- detect sudden drops/spikes
- root cause suggestions with supporting columns
### 14.2 Create Dashboard Sheet (MUST)
- MUST allow user:
  - add sheet “Dashboard”
  - drag KPI cards/charts/tables onto it
- MUST support:
  - slicers/filters (within platform + exported artifacts as supported)
- MUST export:
  - to XLSX (charts/tables)
  - to Dashboard engine (web)
  - to Slides engine (charts as slide blocks)
  - to Report engine (Word)
---
## 15) Collaboration + Governance (MUST)
- share dataset/table with team
- comments on cell/column/table
- review/approval workflow (optional but if enabled MUST enforce)
- permissions per:
  - workspace/project/dataset/recipe/export
- row/column level security for sensitive data
---
## 16) AI Layer (MUST) — “شريك تحليلي مستقل”
### 16.1 AI Understanding Layer (MUST)
بعد ingest:
- classify file domain (finance/hr/sales/ops)
- detect entity keys
- detect time dimension
- detect sensitive columns
- build knowledge graph
- produce executive summary (1 صفحة)
### 16.2 Proactive AI (MUST)
- suggest joins
- suggest cleaning
- suggest KPIs
- suggest comparisons
- warn about data issues
### 16.3 Conversational Query (MUST)
User prompts like:
- “ما أعلى منطقة مبيعات؟”
- “قارن 2023 و2024”
- “استخرج العملاء الذين انخفض إنفاقهم”
MUST result in:
- generated T-IR steps
- generated result table
- optional chart
- textual explanation with confidence + lineage
### 16.4 Predictive & What-If (MUST)
- forecasting for time series (when applicable)
- scenario simulation (“ماذا لو”)
- MUST label confidence + assumptions
- MUST not invent inputs
---
## 17) Operation Memory (Recipes) (MUST)
- every operation is logged as:
  - T-IR recipe + metadata
- recipes can be:
  - replayed on new files
  - edited
  - versioned
- MUST support “Apply recipe to folder monthly” (scheduler is platform module)
---
## 18) Formatting & Beautification (Excel Output) (MUST)
- professional formatting:
  - header row freeze
  - filters on
  - consistent styles
  - auto column width
  - number/date/currency formats
- Arabic formatting:
  - RTL sheets
  - Arabic fonts
  - Arabic numerals option
- Must generate:
  - cover sheet
  - summary sheet
  - index sheet (TOC) optional but if enabled MUST be correct
---
## 19) Exports (MUST)
- export to:
  - XLSX (full)
  - CSV (selected tables)
  - Parquet (for lakehouse)
  - PDF report (via report engine)
  - Slides deck (via slides engine)
  - Web dashboard (via dashboard engine)
- MUST include lineage metadata in exports (hidden sheet or sidecar JSON).
---
## 20) Anti-Cheating / Integrity (MUST)
- no dummy code
- no mock outputs
- no “done” without artifact + evidence
- tests MUST include screenshots/renders where applicable (table render, dashboard preview, export preview)
- build determinism required for strict claims
---
# APPENDIX A — Tools (Schemas) — Minimum Critical Set (MUST implement)
> جميع الأدوات MUST تستخدم شكل موحد: request_id/tool_id/context/inputs/params + output {status, refs, warnings, failure}.
> Draft: JSON Schema 2020-12.
> ملاحظة: هذه مجموعة حد أدنى “تشغيلية” تغطي قلب المحرك. أي توسعة لاحقة MUST تتبع نفس النمط.
## A0) common.defs.schema.json
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://excel.local/schemas/common.json",
  "$defs": {
    "ISODateTime": {"type":"string","format":"date-time"},
    "Mode": {"type":"string","enum":["SMART","PRO"]},
    "ArabicMode": {"type":"string","enum":["BASIC","PROFESSIONAL","ELITE"]},
    "ActionContext": {
      "type":"object",
      "required":["workspace_id","user_id","mode","arabic_mode","locale"],
      "properties":{
        "workspace_id":{"type":"string","minLength":3,"maxLength":128},
        "user_id":{"type":"string","minLength":3,"maxLength":128},
        "mode":{"$ref":"#/$defs/Mode"},
        "arabic_mode":{"$ref":"#/$defs/ArabicMode"},
        "locale":{"type":"string","minLength":2,"maxLength":16}
      },
      "additionalProperties":true
    },
    "AssetRef": {
      "type":"object",
      "required":["asset_id","uri","mime","sha256","size_bytes"],
      "properties":{
        "asset_id":{"type":"string","minLength":8,"maxLength":128},
        "uri":{"type":"string","minLength":1,"maxLength":2048},
        "mime":{"type":"string","minLength":3,"maxLength":128},
        "sha256":{"type":"string","pattern":"^[0-9a-fA-F]{64}$"},
        "size_bytes":{"type":"integer","minimum":0}
      },
      "additionalProperties":false
    },
    "DatasetRef": {
      "type":"object",
      "required":["dataset_id","row_count_est","column_count"],
      "properties":{
        "dataset_id":{"type":"string","minLength":8,"maxLength":128},
        "row_count_est":{"type":"integer","minimum":0},
        "column_count":{"type":"integer","minimum":0}
      },
      "additionalProperties":false
    },
    "TableRef": {
      "type":"object",
      "required":["table_id","dataset_id","name"],
      "properties":{
        "table_id":{"type":"string","minLength":8,"maxLength":128},
        "dataset_id":{"type":"string","minLength":8,"maxLength":128},
        "name":{"type":"string","minLength":1,"maxLength":256}
      },
      "additionalProperties":false
    },
    "ColumnRef": {
      "type":"object",
      "required":["column_id","table_id","name","dtype"],
      "properties":{
        "column_id":{"type":"string","minLength":8,"maxLength":128},
        "table_id":{"type":"string","minLength":8,"maxLength":128},
        "name":{"type":"string","minLength":1,"maxLength":256},
        "dtype":{"type":"string","enum":["string","int","float","bool","date","datetime","currency","percent","json","unknown"]}
      },
      "additionalProperties":false
    },
    "RecipeRef": {
      "type":"object",
      "required":["recipe_id","kind","version"],
      "properties":{
        "recipe_id":{"type":"string","minLength":8,"maxLength":128},
        "kind":{"type":"string","enum":["TIR","COMPARE","CLEAN","FORMAT"]},
        "version":{"type":"string","minLength":1,"maxLength":32}
      },
      "additionalProperties":false
    },
    "ArtifactRef": {
      "type":"object",
      "required":["artifact_id","kind","uri"],
      "properties":{
        "artifact_id":{"type":"string","minLength":8,"maxLength":128},
        "kind":{"type":"string","enum":["xlsx","csv","parquet","pdf","pptx","dashboard","json"]},
        "uri":{"type":"string","minLength":1,"maxLength":2048}
      },
      "additionalProperties":false
    },
    "Warnings": {
      "type":"array",
      "items":{
        "type":"object",
        "required":["code","message","severity"],
        "properties":{
          "code":{"type":"string","minLength":2,"maxLength":64},
          "message":{"type":"string","minLength":1,"maxLength":2000},
          "severity":{"type":"string","enum":["info","warning","error"]}
        },
        "additionalProperties":false
      },
      "default":[]
    }
  }
}


---

<a id="sec-18"></a>
# DASHBOARD ENGINE SPEC — Ultra-Scale KPI + Infinite Widgets + AI-First Builder (STRICT Import 1:1 Optional) — NO CHEATING
**وثيقة تنفيذية فنية موجهة للمنفّذ مباشرة** — صياغة أمرية إلزامية (MUST/SHALL/MUST NOT)
**هدف المحرك**: إنشاء لوحات مؤشرات/تحكم عالمية (Enterprise-grade) بواجهة بسيطة (Canvas واحد) مع:
- آلاف العناصر/الـKPIs/المرئيات (Widgets) + Variants غير محدودة عبر Catalog + Parametric Generators
- ربط حي بأي مصدر بيانات (ملفات/قاعدة بيانات/موصلات) + عمليات Transform (T-IR) + Measures (M-IR)
- توليد من نص (Auto) أو سحب وإفلات (Pro) أو إدخال صورة/PDF لاستنساخ لوحة 1:1 (STRICT Import)
- مشاركة وصلاحيات دقيقة + إصدار/نسخ + Audit + Evidence
- تصدير: Web/Link (حي) + PDF + PPTX + DOCX + XLSX + HTML Player
- لا كود وهمي/لا ديمو/لا ادعاء بدون دليل وتنفيذ فعلي.
> **قاعدة**: أي سلوك غير منصوص عليه هنا = ممنوع.
> **لا أسئلة**: المحرك لا يسأل المستخدم أثناء البناء/التوليد. أي اختيار يُدار عبر Defaults أو Controls.
> **لا ادّعاء**: لا “تم” إلا بعد Artifact/Link حي + اختبارات + Evidence.
---
## 0) Non-Negotiable (تعريف النجاح)
### 0.1 DashboardEngine SUCCESS (شرط قبول)
المحرك يُعتبر ناجحًا فقط إذا حقق **كل** الآتي:
1) **Canvas واحد**: لوحة واحدة + Panel واحد قابل للإخفاء (لا صفحات إعدادات كثيرة).
2) **Live Dashboard**: الناتج Web dashboard حي:
   - filters / cross-filter / drill / export / refresh / bookmarks
3) **Data-Bound**: كل visual يعتمد على بيانات حقيقية من مكتبة المستخدم/موصلات/قاعدة بيانات/semantic model.
4) **Infinite Options بدون فوضى**:
   - Catalogs + Parametric Generators + Search + Suggestion Strip
   - بدون عرض آلاف الخيارات دفعة واحدة.
5) **Exports حقيقية**: PDF/PPTX/DOCX/XLSX/HTML تصدر فعليًا وتُراجع بالـParity gates.
6) **Security & Sharing**: RBAC/ABAC + Row/Column security + Share links controlled + Audit.
7) **Scale**: ملايين/مليارات سجلات بدون تجميد UI (virtualization + async jobs + caching).
8) **No-Cheating**: لا stubs/demos/outputs ثابتة تُعرض كحقيقة، ولا “done” بدون Evidence Pack.
---
## 1) UX (Canvas-First) — بسيطة جدًا لكن قوية
### 1.1 واجهات مسموحة فقط (MUST)
- **Dashboard Canvas** (المساحة الرئيسية): grid + widgets + guides.
- **Side Panel واحد** (قابل للإخفاء) يضم:
  - Library (Datasets/Files/Connectors)
  - Widget Picker (Search + Categories)
  - Data Picker (Tables/Columns/Measures)
  - Filters & Parameters
  - Styles/Theme/Brand
  - Pages/Navigator
  - History/Versions
  - Share/Publish
  - Export
- **Preview Reader** (Overlay / نافذة): تشغيل اللوحة كقارئ حي مع تفاعل.
### 1.2 Progressive Controls (MUST)
- MUST عدم عرض خيارات كثيرة دفعة واحدة.
- MUST عرض 5–9 Controls حسب السياق:
  - لا شيء محدد → Dashboard-level controls
  - صفحة محددة → Page-level controls
  - عنصر محدد → Element-level controls
- MUST وجود **Search Controls** لإظهار أي خيار بالبحث (لا قوائم مطولة).
- MUST وجود **Suggestion Strip** (8–12 خيارًا) عند تحديد عنصر:
  - “More like this” + “Different direction” + “Simpler / More data-heavy”.
### 1.3 معاينة بعد كل تغيير (MUST)
- أي تغيير (تبديل visual، تغيير binding، تغيير theme، filter، drill config…) MUST ينتج:
  - Preview سريع (sample) فورًا
  - ثم Apply job على كامل البيانات (async) مع progress
- UI MUST لا يتجمد.
---
## 2) Modes (MUST) — Auto / Pro بدون حوار
### 2.1 AUTO (default)
- المستخدم يكتب وصفًا واحدًا أو يرفع ملفات ثم:
  - النظام يولد لوحة كاملة (pages + visuals + filters + measures) دون أسئلة.
- كل قرار Auto يُسجل كـDecision داخل Plan (قابل للتعديل عبر Controls).
### 2.2 PRO
- المستخدم يبني عبر drag&drop:
  - يسحب widgets
  - يسحب columns/measures إلى visual
  - يضبط joins/filters/aggregations
- لا حوار طويل. كل شيء Controls.
---
## 3) Inputs / Sources (MUST)
### 3.1 Supported Sources
- Files: XLSX/CSV/TXT
- Documents: PDF (tables), Images (table/dashboard screenshots)
- Connectors: Drive/OneDrive/SharePoint/S3 + DBs (Postgres/MySQL/SQL Server/BigQuery/Snowflake…) (إذا المنصة توفرها)
- Semantic Model / Lakehouse tables
### 3.2 Universal Intake Rule
- أي مصدر MUST يتحول إلى:
  - Columnar storage (Arrow/Parquet)
  - Catalog stats
  - Lineage metadata
  - Semantic tags
---
## 4) Outputs (MUST)
### 4.1 Live Web Dashboard
- URL/Link داخل workspace (مع share policy)
- Multi-page dashboards supported
- Refresh + incremental refresh supported
### 4.2 Exports (MUST)
- PDF
- PPTX (deck من صفحات اللوحة + KPIs + snapshots/links)
- DOCX (report style + tables + commentary)
- XLSX (export tables/measures + pivot-ready extracts)
- HTML Player (self-contained أو served assets وفق policy)
- PNG snapshots (لكل صفحة/visual)
**لا يُقال “تم التصدير” إلا بعد artifacts موجودة فعليًا + parity gates + evidence.**
---
## 5) Core Architecture (MUST) — Modules
### 5.1 Mandatory Modules
1) **Dashboard Intent Parser** (prompt → intent_manifest)
2) **Widget Catalog + Parametric Generator**
3) **Dashboard IR (D-IR)**: تمثيل داخلي موحد (layout + widgets + bindings + interactions)
4) **Layout/Grid Engine** (deterministic)
5) **Data Binding Engine** (columns/measures/joins/filters)
6) **Transform Engine (T-IR)** (PowerQuery-like)
7) **Measures Engine (M-IR)** (DAX-like; أو equivalent)
8) **Query Engine** (columnar + caching + materialized views)
9) **Interaction Engine** (filters/cross-filter/drill/bookmarks)
10) **Rendering Engine** (Preview + Export render)
11) **Deterministic Rendering Farm** (for snapshots/parity)
12) **Publish/Share Engine** (RBAC/ABAC + RLS/CLS)
13) **Versioning & Audit** (immutable logs)
14) **QA Validator + Auto-Fix** (layout/data/performance/security)
15) **Evidence Pack Generator**
16) **STRICT Import Adapter** (image/pdf → dashboard 1:1 functional when requested)
### 5.2 All Execution via Action Runtime (MUST)
- كل خطوة = Action
- كل Tool = Schema input/output
- كل نتيجة = ArtifactRef/LinkRef + fingerprints
---
## 6) Dashboard IR (D-IR) — “مغلق” يمنع الاجتهاد
> المنفّذ MUST يبني D-IR كما هو. أي نقص = رفض.
### 6.1 Top-level
`dashboard_ir` MUST include:
- version
- dashboard_id
- pages[]
- theme_tokens
- dataset_bindings[]
- semantic_model_ref
- global_filters[]
- parameters[]
- interactions[]
- fingerprints:
  - layout_hash
  - binding_hash
  - interaction_hash
### 6.2 Page
- page_id, index, name
- grid_spec (columns/rows/gutters/margins)
- widgets[] ordered by z-index
- navigation (optional)
### 6.3 Widget (Union)
Common:
- widget_id
- kind: kpi | chart | table | pivot | text | image | icon | slicer | filter_panel | map | gauge | bullet | sparkline | heatmap | treemap | waterfall | funnel | timeline | boxplot | scatter | combo | cards_grid | narrative | embed | video
- bbox (x,y,w,h) in grid units
- z_index
- style_ref (tokenized)
- data_binding_ref (optional)
- interaction_bindings (optional)
Chart widget MUST include:
- chart_kind (bar/line/area/pie/scatter/combo/…)
- encodings (x/y/series/size/color)
- axes/legend settings
- formatting
Table widget MUST include:
- columns[]
- sort/filter
- conditional formatting rules
KPI widget MUST include:
- value measure
- trend measure (optional)
- threshold rules
- formatting
Slicer widget MUST include:
- field binding
- selection state
- sync policy (global/page)
---
## 7) Infinite Widgets (Catalog System) — بدون فوضى
### 7.1 Catalogs (MUST)
- widget_catalog
- chart_skin_catalog
- table_style_catalog
- kpi_card_catalog
- filter_ui_catalog
- map_style_catalog
- icon_pack_catalog
- page_layout_catalog
كل Catalog MUST:
- versioned
- searchable (tags + embeddings)
- filterable (rtl_ready, density, industry, brand compatibility)
- returns top N
### 7.2 Minimum Library Size (MUST)
حدود دنيا إلزامية لتجنب “محرك فارغ”:
- KPI cards ≥ 400
- Charts ≥ 250 (types × skins)
- Tables ≥ 200
- Filters/Slicers ≥ 120
- Layout pages ≥ 200
- Icon packs ≥ 50 (vector)
- Themes ≥ 100
- **Parametric Variations ≥ 100×** لكل أصل
=> Total variants MUST ≥ 100,000 (قابل للتوسع).
### 7.3 Parametric Generator (MUST)
كل Visual MUST يدعم parameters:
- density
- spacing_scale
- corner_radius
- stroke_width
- shadow_depth
- palette mapping
- typography scale
- rtl mirroring rules
ويولد Variants فورية عبر:
- `variant_generate(widget_id, policy)`.
### 7.4 Suggestion UX (MUST)
- عند تحديد widget:
  - show 8–12 variants + “More like this” + “Different direction”
- “More like this” يولد variants من نفس العائلة (nearest neighbors)
- “Different direction” يقفز إلى cluster مختلف.
---
## 8) Data Binding (MUST) — من المكتبة إلى الـWidget
### 8.1 Data Picker (MUST)
المستخدم MUST يستطيع:
- اختيار dataset/table
- اختيار columns
- اختيار measures
- اختيار join keys (Pro) أو قبول Auto suggestions (Auto)
- تطبيق filters و transforms (T-IR)
### 8.2 Transform IR (T-IR) (MUST)
- أي عملية تنظيف/فلترة/تجميع/دمج MUST تُسجل T-IR:
  - select/rename/filter/derive/join/group/pivot/unpivot/sort/cast/dedupe/impute
- MUST preview على sample ثم apply job على كامل البيانات.
### 8.3 Measures IR (M-IR) (MUST)
- إنشاء measures: sum/avg/count/distinct/growth/MoM/YoY/rolling
- time intelligence templates
- MUST exportable (إذا النظام يدعم) أو على الأقل محفوظة كـM-IR قابلة للتنفيذ.
### 8.4 Smart Joins (MUST)
- Auto mode MUST يقترح join keys عبر scoring:
  - uniqueness, null_rate, type compatibility, overlap
- Pro mode يسمح للمستخدم بتحديد keys يدويًا.
---
## 9) Interactions (MUST) — حيّة
### 9.1 Must Support
- Global filters
- Page filters
- Widget filters
- Cross-filter
- Drill-down / Drill-through
- Bookmarks (states)
- What-if parameters
- Alerts (threshold notifications) (إذا platform يدعم)
### 9.2 Determinism
- تفاعل same state MUST ينتج نفس query results (with cache determinism policy).
---
## 10) Strict Import 1:1 (Image/PDF → Dashboard) — عند الطلب
> هذا مسار خاص يُستخدم فقط عندما المستخدم يطلب “مطابقة 1:1” للوحة من صورة/PDF.
### 10.1 STRICT_DASHBOARD_1TO1_100 (MUST)
إذا المستخدم طلب strict replication:
- MUST بناء dashboard حي مطابق بصريًا للمرجع:
  - Snapshot render of dashboard MUST match source render with PixelDiff==0 داخل Farm
- MUST أن تكون المكونات functional:
  - filters/drill/export/refresh MUST موجودة ومربوطة (حتى لو ببيانات reconstructed_synthetic)
- MUST عدم استخدام صور لتغطية النص/الجدول/المخطط/الكروت.
### 10.2 Data reconstruction rule
- إذا المدخل Screenshot ولا توجد بيانات أصلية:
  - MUST reconstruct synthetic dataset بحيث visuals match exactly
  - MUST tag dataset as `reconstructed_synthetic`
  - MUST support later rebinding to real dataset via schema matching
  - MUST label synthetic بوضوح في metadata (لا يُخدع المستخدم)
---
## 11) Real-Time + Incremental Refresh (MUST)
- MUST incremental refresh by partitions (time/entity)
- MUST materialized views للمرئيات الثقيلة
- MUST caching:
  - query cache
  - render cache
  - widget result cache
- MUST background jobs:
  - refresh schedule
  - heavy transforms
- UI MUST لا يتجمد.
---
## 12) Sharing / Permissions / Governance (MUST)
### 12.1 Share types
- share link:
  - view-only
  - comment
  - edit
- embed link (policy controlled)
- export permissions separate
### 12.2 RBAC/ABAC + RLS/CLS
- MUST enforce:
  - roles/groups
  - object ACL on dashboard/page
  - row-level security
  - column-level security (mask/hide)
- MUST audit:
  - who viewed/edited/exported
  - changes log
### 12.3 Versioning (MUST)
- every save = version
- rollback supported
- diff between versions supported (layout/bindings)
---
## 13) QA Gates (MUST) — يمنع أي إخراج ضعيف
### 13.1 Layout QA
- no overlaps
- no clipping
- safe area respected
- consistent spacing/grid
### 13.2 Data QA
- all widgets have valid bindings
- joins validated
- measures validated
- null handling consistent
- sensitivity policy enforced
### 13.3 Interaction QA
- filters work
- cross-filter works
- drill works
- bookmarks restore state deterministically
### 13.4 Performance QA
- query latency within SLO
- render latency within SLO
- concurrency within SLO
### 13.5 Export QA + Parity
- exported PDF/PPTX/DOCX/XLSX/HTML must render correctly
- preview vs export parity verified in Farm
### 13.6 Auto-Fix (MUST)
- إذا QA fail:
  - MUST deterministic auto-fix
  - MUST re-run QA until pass
  - MUST NOT claim done before pass
---
## 14) Exports (MUST) — حقيقية
### 14.1 PDF Export
- page-by-page render
- RTL correct
- high DPI
### 14.2 PPTX Export
- convert pages to slides:
  - editable text where applicable (optional policy)
  - charts optionally embedded as images + data table attachments (policy)
- MUST include links back to live dashboard
### 14.3 DOCX Export
- report narrative + tables + charts snapshots + captions
- editable sections + TOC if enabled
### 14.4 XLSX Export
- export selected tables/measures
- include lineage sheet (hidden or visible)
- pivot-ready optional
### 14.5 HTML Export
- interactive player
- supports filters/bookmarks/video (if used)
---
## 15) Evidence Pack (MUST) — شرط إعلان النجاح
كل publish/export MUST ينتج Evidence Pack:
- preview renders
- export renders (pdf/html/pptx snapshots)
- parity reports
- QA reports
- interaction test logs
- dataset lineage ids
- action graph snapshot
- artifact ids / link ids
No Evidence Pack => MUST NOT say “Done”.
---
## 16) AI Engine (MUST) — “محلل + مصمم لوحة”
### 16.1 AI Roles (MUST)
- Analyst: metrics + joins + insights
- Auditor: data quality + anomalies
- Designer: layout + styling
- Executive summarizer: 1-page summary
### 16.2 Auto Dashboard Generation (MUST)
From a prompt:
- infer objective (exec ops/sales/finance)
- infer primary KPIs
- infer dimensions/time
- propose pages:
  - Overview
  - Trends
  - Breakdown
  - Exceptions
- choose visuals deterministically
- bind to datasets via semantic model
### 16.3 Proactive suggestions (MUST)
- suggest joins
- suggest KPIs
- suggest anomalies
- suggest filters
- suggest storytelling order
### 16.4 No Hallucination Rule (MUST)
- MUST not invent numbers
- if data missing:
  - either request dataset selection via Data Picker (control)
  - or create synthetic only if explicitly allowed and labeled
---
# APPENDIX A — Tool Schemas (Minimum Critical Set) (MUST)
> كل Tool MUST يستخدم شكل موحد: request_id/tool_id/context/inputs/params.
> Draft 2020-12.
> **ملاحظة**: هذه “مجموعة حد أدنى تشغيلية” تغلق المحرك وتمنع الاجتهاد.
## A0) common.json
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://dash.local/schemas/common.json",
  "$defs": {
    "Mode": { "type": "string", "enum": ["AUTO","PRO"] },
    "ArabicMode": { "type": "string", "enum": ["BASIC","PROFESSIONAL","ELITE"] },
    "ActionContext": {
      "type":"object",
      "required":["workspace_id","user_id","mode","arabic_mode","locale"],
      "properties":{
        "workspace_id":{"type":"string"},
        "user_id":{"type":"string"},
        "mode":{"$ref":"#/$defs/Mode"},
        "arabic_mode":{"$ref":"#/$defs/ArabicMode"},
        "locale":{"type":"string"}
      },
      "additionalProperties":true
    },
    "AssetRef": {
      "type":"object",
      "required":["asset_id","uri","mime","sha256"],
      "properties":{
        "asset_id":{"type":"string"},
        "uri":{"type":"string"},
        "mime":{"type":"string"},
        "sha256":{"type":"string","pattern":"^[0-9a-fA-F]{64}$"}
      },
      "additionalProperties":false
    },
    "DatasetRef": {
      "type":"object",
      "required":["dataset_id"],
      "properties":{"dataset_id":{"type":"string"}},
      "additionalProperties":false
    },
    "DashboardRef": {
      "type":"object",
      "required":["dashboard_id","page_count"],
      "properties":{"dashboard_id":{"type":"string"},"page_count":{"type":"integer","minimum":1}},
      "additionalProperties":false
    },
    "ArtifactRef": {
      "type":"object",
      "required":["artifact_id","kind","uri"],
      "properties":{
        "artifact_id":{"type":"string"},
        "kind":{"type":"string","enum":["pdf","pptx","docx","xlsx","html","png","json"]},
        "uri":{"type":"string"}
      },
      "additionalProperties":false
    },
    "Warnings": {
      "type":"array",
      "items":{
        "type":"object",
        "required":["code","message","severity"],
        "properties":{
          "code":{"type":"string"},
          "message":{"type":"string"},
          "severity":{"type":"string","enum":["info","warning","error"]}
        },
        "additionalProperties":false
      },
      "default":[]
    }
  }
}


---

<a id="sec-19"></a>
# REPORT ENGINE SPEC — World-Class AI Reports (DOCX/PDF/HTML) + Arabic ELITE + Data-Bound + Governance (NO CHEATING)
**وثيقة تنفيذية فنية موجهة للمنفّذ مباشرة** — صياغة أمرية إلزامية (MUST/SHALL/MUST NOT)
**هدف المحرك**: إنشاء تقارير احترافية (حكومية/تجارية/إدارية/تحليل بيانات) من نص/بيانات/ملفات، مع:
- تحرير كامل (DOCX Editable) + تصدير PDF/HTML + دمج جداول/مخططات/ملخصات/ملاحق
- نبرات/أساليب كتابة متعددة + قوالب “تصميم + صياغة” + تفضيلات المستخدم
- تكامل بيانات كامل (Excel Engine + Dashboard Engine + Slides Engine + Data Lakehouse)
- تصنيف/حوكمة/صلاحيات/موافقات/سجل تدقيق
- عدم اختلاق بيانات + عدم ادعاء + Evidence Pack إلزامي لكل تسليم/تصدير
> **قاعدة صارمة**: أي سلوك غير منصوص عليه هنا = ممنوع. أي “ديمو/كود وهمي/ادعاء تم” = مرفوض.
> **لا أسئلة**: التدفق الافتراضي لا يسأل المستخدم. أي اختيار يتم عبر Defaults أو Controls متدرجة (Progressive) داخل Canvas واحد.
> **اللغة**: دعم العربية ELITE إلزامي (bidi+shaping+metrics lock) — ليس مجرد قلب اتجاه.
---
## 0) Non-Negotiable (تعريف النجاح)
### 0.1 ReportEngine SUCCESS (شرط قبول)
المحرك ناجح فقط إذا حقق **كل** التالي:
1) **Canvas واحد**: إنشاء/تعديل التقرير داخل واجهة واحدة + Panel واحد قابل للإخفاء (لا صفحات كثيرة).
2) **DOCX Editable حقيقي**: الناتج الرئيسي MUST يكون DOCX قابل للتعديل بالكامل (نص/عناوين/جداول/أشكال/مخططات/هوامش/فهرس).
3) **Data-Bound**: الجداول/المخططات/الأرقام MUST تكون مربوطة بمصادر بيانات فعلية أو Placeholder موسوم (لا اختلاق).
4) **Arabic ELITE**: دعم عربي احترافي (line breaking, justification, mixed scripts, RTL tables, numbering).
5) **Templates تشمل التصميم + الصياغة**: القالب ليس فقط ألوان/خطوط؛ بل أسلوب كتابة ونبرة وعبارات افتتاح/ختام وتنسيق فقرات ومصطلحات.
6) **Classification + Governance**: تصنيف الوثيقة + سياسة مشاركة + صلاحيات + سجل تدقيق + نسخ + اعتماد.
7) **Exports حقيقية**: PDF/HTML/PPTX/XLSX تصدر فعليًا مع “Render Parity” وEvidence.
8) **No-Cheating**: لا “تم” إلا بعد artifact فعلي + QA gates + Evidence Pack.
---
## 1) UX / UI (Canvas-First) — بسيطة جدًا
### 1.1 واجهات مسموحة فقط (MUST)
- **Report Canvas**: محرر مستند + Outline navigator + blocks.
- **Side Panel واحد** (قابل للإخفاء):
  - Library (مصادر/ملفات/جداول/قوالب)
  - Styles & Templates (design + writing)
  - Data Picker (datasets/tables/columns/measures)
  - Blocks (sections, tables, charts, KPI cards, callouts, appendices)
  - Citations & References (إذا مفعّل)
  - Governance (classification/approvals/permissions)
  - Export
  - History/Versions
### 1.2 Progressive Controls (MUST)
- MUST عدم عرض خيارات كثيرة دفعة واحدة.
- MUST عرض 5–9 خيارات حسب السياق:
  - لا شيء محدد → report-level controls
  - قسم محدد → section controls
  - فقرة/جدول/مخطط محدد → element controls
- MUST توفير “Search Controls” للبحث عن أي خيار بدل قوائم ضخمة.
### 1.3 Preview after every change (MUST)
- أي تعديل كبير MUST ينتج:
  - Preview سريع داخل canvas (layout preview)
  - Preview “Reader” (PDF/HTML preview overlay) عند الطلب أو auto حسب setting
- لا تجميد واجهة. أي render ثقيل MUST job بالخلفية.
---
## 2) Operating Modes (MUST) — Auto / Controlled بدون حوار
### 2.1 AUTO (default)
من Prompt واحد (أو مع مصادر بيانات) يُنتج:
- Intent Manifest → Outline → Narrative Plan → Data Bindings → DOCX Build → QA → Export/Evidence
بدون أسئلة.
### 2.2 CONTROLLED (بدون أسئلة)
المستخدم يضبط knobs قبل التنفيذ (في Panel):
- report_type (executive/technical/audit/government memo)
- language (ar/en/mixed)
- tone (formal/neutral/persuasive/urgent)
- fidelity_mode (literal_1to1 | smart)
- template_id (design+writing)
- add_sections (toc/executive_summary/findings/recommendations/appendix)
- citation_mode (off/on + style)
- sensitivity_classification (public/internal/confidential/restricted)
- export_targets (docx/pdf/html/pptx)
ثم تشغيل واحد.
---
## 3) Content Fidelity Modes (مغلقة)
### 3.1 MODE_LITERAL_1TO1 (نص المستخدم حرفيًا)
- MUST تضمين نص المستخدم حرفيًا 1:1:
  - لا زيادة حرف/لا نقصان حرف/لا إعادة صياغة/لا تصحيح تلقائي
- MUST الحفاظ على فواصل الأسطر/الفقرات
- MUST إن احتاج توزيع عبر صفحات: يتم فقط عبر page breaks/section breaks دون تغيير النص
- MUST إنتاج:
  - `literal_hash_in`
  - `literal_hash_out` (من استخراج نص DOCX)
  MUST equality أو FAIL.
### 3.2 MODE_SMART (تحليل + كتابة احترافية)
- MUST تحليل الطلب + البيانات + الهدف + الجمهور
- MUST كتابة محتوى احترافي وفق tone + template writing style
- MUST عدم اختلاق حقائق:
  - إذا رقم/قياس غير متوفر: MUST placeholder موسوم “بيانات مطلوبة” أو استخدام Synthetic فقط إذا policy تسمح وبوسم واضح
- MUST إنتاج “Content Trace”:
  - كل ادعاء/رقم مرتبط بمصدر: dataset/table/column/rowset أو فقرة من وثيقة في المكتبة
---
## 4) Template System (Design + Writing) — إلزامي
### 4.1 Template Types (MUST)
- **Brand Kit**: ألوان/خطوط/شعار/هوامش
- **Report Template**: Layout + Styles + Numbering + Headers/Footers + TOC style
- **Writing Template**: نبرة/أسلوب/مصطلحات/صيغ مخاطبة/افتتاح/ختام/صياغة توصيات
### 4.2 Template Extraction (MUST)
من DOCX template MUST استخراج:
- Styles (Heading 1..n, Body, Caption, Table styles)
- Numbering & bullets schemes
- Page setup (margins, paper size, RTL)
- Headers/footers (with rules)
- TOC configuration
- Cover page structure
- Writing ruleset:
  - greeting patterns (مثل: “سعادة/معالي/الأستاذة…”)
  - tone lexicon
  - forbidden phrases
  - preferred terminology mapping (ar/en)
### 4.3 Template-Lock (MUST)
إذا user فعّل template-lock:
- MUST الالتزام بالـstyles والـwriting rules حرفيًا
- MUST عدم إدخال Style جديد غير موجود
- MUST Report Compliance Report داخل Evidence Pack
---
## 5) Addressing & Persona (مخاطبة أشخاص/جهات) — MUST
### 5.1 Audience & Recipient Model (MUST)
المحرك MUST يدعم:
- recipient_title (معالي/سعادة/الأستاذ/الأستاذة/CEO…)
- recipient_name (اختياري)
- organization_name
- department
- tone_profile
- formality_level
### 5.2 Salutation/Closing Rules (MUST)
- MUST اختيار افتتاح/ختام وفق:
  - اللغة
  - النبرة
  - قالب الكتابة
  - سياق المؤسسة (حكومي/تجاري)
- MUST عدم استخدام عبارات غير مناسبة ثقافيًا في العربية.
- MUST حفظ “writing signature blocks” كقوالب قابلة لإعادة الاستخدام.
---
## 6) Document IR (DOC-IR) — عقد بيانات مغلق
> المنفّذ MUST يبني DOC-IR لتوحيد البناء/التحقق/التصدير ومنع الاجتهاد.
### 6.1 Top-level DOC-IR (MUST)
doc_ir:
- version
- doc_id
- locale, arabic_mode
- page_setup (paper_size, margins, rtl)
- template_refs (brand, report, writing)
- sections[] (ordered)
- global_fields (date, author, classification, recipients)
- references[] (optional)
- data_bindings[] (tables/charts/kpis)
- fingerprints:
  - layout_hash
  - style_hash
  - writing_hash
  - binding_hash
### 6.2 Section (MUST)
section:
- section_id, index, title
- kind: cover|toc|executive_summary|body|findings|recommendations|appendix|glossary|references|signoff
- blocks[] ordered
- header/footer overrides (optional)
- numbering scheme (optional)
### 6.3 Block (Union) (MUST)
block:
- block_id
- kind: heading|paragraph|bullets|table|chart|kpi_cards|figure|callout|quote|code|appendix_table|signature|page_break
- style_ref
- content (typed)
- data_binding_ref (optional)
- rtl_policy (auto/force_rtl)
---
## 7) Data Binding Engine (Reports) — MUST
### 7.1 Data Picker (MUST)
المستخدم MUST يستطيع:
- اختيار dataset/table/columns
- تحديد filters/joins/transforms (T-IR)
- اختيار measures (M-IR)
- preview sample قبل إدراج block
### 7.2 Blocks Data-Bound (MUST)
- Table block:
  - structured table in DOCX with TableStyle
  - supports column selection/order
  - supports conditional formatting (limited set, declared)
- Chart block:
  - embed chart with data workbook or vector chart representation (policy)
  - must reflect current filtered dataset
- KPI cards:
  - measure + threshold + trend
### 7.3 Refresh (MUST)
- عند تحديث البيانات/الوصفات:
  - MUST تحديث التقرير (refresh)
  - MUST version new output
  - MUST سجل lineage للـrefresh
---
## 8) “Import from PDF/Image” (STRICT Insert) — عند الطلب
- إذا user أدخل صفحة PDF أو صورة تقرير ويطلب “مطابقة 1:1 إلى Word”:
  - MUST استخدام Strict Replication Engine (STRICT_1TO1_100) لمسار PDF/Image → DOCX Editable
  - MUST لا يعتمد على صورة كبديل للمحتوى النصي/الجداول
  - MUST يخضع لPixelDiff==0 ضمن Farm للحالة STRICT (كما في مواصفة المطابقة)
---
## 9) Citations / References (اختياري لكن مضبوط)
- إذا citation_mode=on:
  - MUST استخراج مصادر الأرقام/الادعاءات من:
    - datasets lineage
    - الملفات داخل المكتبة
  - MUST إدراج References section
  - MUST link each claim to source_id
- MUST منع اختلاق المصادر.
---
## 10) Classification / Governance / Approvals (MUST)
### 10.1 Document Classification (MUST)
- each report MUST have classification:
  - public/internal/confidential/restricted
- MUST enforce export/share policy by classification.
### 10.2 Approvals Workflow (MUST إذا enabled)
- states: draft → review → approved → published
- role-based permissions for transitions
- must record:
  - who approved
  - timestamp
  - diff summary
### 10.3 Versioning & Diff (MUST)
- every save/export = version
- rollback supported
- diff:
  - text diff
  - table diff
  - chart diff
  - template compliance diff
### 10.4 Audit Log (MUST)
- view/edit/export/share actions recorded immutably.
---
## 11) Exports (MUST) + Parity
### 11.1 DOCX Export (Primary)
- MUST produce valid OpenXML
- MUST be editable
- MUST embed fonts per policy (or provide font requirements list)
### 11.2 PDF Export
- MUST render from DOC-IR/DOCX in deterministic farm
- RTL correct
- headers/footers/TOC correct
### 11.3 HTML Export
- MUST produce HTML reader:
  - preserves layout as close as possible
  - supports interactive tables (sort/filter) optional
  - supports embedded charts (svg/canvas) policy
### 11.4 PPTX Export (Optional)
- MUST convert key sections to slides (executive summary/findings/KPIs)
- MUST include links back to report and data sources.
### 11.5 XLSX Export (Optional)
- MUST export underlying tables/measures to xlsx with lineage sheet.
### 11.6 Render Parity Gate (MUST)
- MUST verify preview reader vs exported PDF/HTML render parity in farm.
- Any mismatch = BUG → block “Done”.
---
## 12) QA Gates + Auto-Fix (MUST)
### 12.1 Layout QA
- no overflow
- no orphan headings
- TOC correct
- numbering correct
- margins/safe area respected
### 12.2 Arabic QA
- shaping correct
- bidi correct
- no clipped glyphs
- RTL tables correct
### 12.3 Data QA
- bindings valid
- measures computed
- missing data clearly labeled (no silent blanks)
- sensitivity policy applied (masking if needed)
### 12.4 Writing QA
- tone compliance per template
- forbidden phrases not used
- recipient addressing correct
### 12.5 Auto-Fix (MUST deterministic)
- fix layout breaks (page breaks, keep-with-next)
- adjust table widths deterministically
- split long tables into continuation pages
- regenerate TOC
- rerun QA until pass
---
## 13) Evidence Pack (MUST) — شرط إعلان النجاح
For every export/publish:
- artifacts: docx/pdf/html (+ pptx/xlsx if requested)
- render snapshots (first page + key pages)
- QA reports (layout/arabic/data/writing)
- template compliance report
- literal diff report (if literal)
- content trace (if smart)
- action graph snapshot
- lineage ids + dataset signatures
No evidence => MUST NOT say “Done”.
---
## 14) AI Engine (MUST) — “كاتب + محلل + مدقق”
### 14.1 Roles (MUST)
- Report Writer (tone/style)
- Data Analyst (metrics/insights)
- Auditor (quality/anomalies)
- Executive Summarizer (one-page)
### 14.2 Data Storytelling (MUST)
في SMART:
- MUST ترتيب المحتوى: Context → Findings → Evidence → Impact → Recommendations
- MUST produce:
  - executive summary
  - numbered findings
  - recommendation table (owner, priority, timeline placeholders)
- MUST لا يختلق timelines إلا إذا user طلب placeholders.
### 14.3 Multi-Level Output (MUST)
- output_detail_level: brief | standard | deep | audit
- MUST adjust:
  - length
  - number of charts/tables
  - explanation depth
---
# APPENDIX A — Tool Schemas (Minimum Critical Set) (MUST)
> كل Tool MUST يتبع: request_id/tool_id/context/inputs/params → output {status, refs, warnings}.
> Draft: JSON Schema 2020-12.
> **ملاحظة**: هذه مجموعة حد أدنى “تشغيلية” — لا يجوز حذفها.
## A0) common.json
```json
{
  "$schema":"https://json-schema.org/draft/2020-12/schema",
  "$id":"https://report.local/schemas/common.json",
  "$defs":{
    "Mode":{"type":"string","enum":["AUTO","CONTROLLED"]},
    "ArabicMode":{"type":"string","enum":["BASIC","PROFESSIONAL","ELITE"]},
    "ActionContext":{
      "type":"object",
      "required":["workspace_id","user_id","mode","arabic_mode","locale"],
      "properties":{
        "workspace_id":{"type":"string"},
        "user_id":{"type":"string"},
        "mode":{"$ref":"#/$defs/Mode"},
        "arabic_mode":{"$ref":"#/$defs/ArabicMode"},
        "locale":{"type":"string"}
      },
      "additionalProperties":true
    },
    "AssetRef":{"type":"object","required":["asset_id","uri","mime","sha256"],"properties":{"asset_id":{"type":"string"},"uri":{"type":"string"},"mime":{"type":"string"},"sha256":{"type":"string","pattern":"^[0-9a-fA-F]{64}$"}},"additionalProperties":false},
    "DatasetRef":{"type":"object","required":["dataset_id"],"properties":{"dataset_id":{"type":"string"}},"additionalProperties":false},
    "DocRef":{"type":"object","required":["doc_id","version"],"properties":{"doc_id":{"type":"string"},"version":{"type":"integer","minimum":1}},"additionalProperties":false},
    "ArtifactRef":{"type":"object","required":["artifact_id","kind","uri"],"properties":{"artifact_id":{"type":"string"},"kind":{"type":"string","enum":["docx","pdf","html","pptx","xlsx","png","json"]},"uri":{"type":"string"}},"additionalProperties":false},
    "Warnings":{"type":"array","items":{"type":"object","required":["code","message","severity"],"properties":{"code":{"type":"string"},"message":{"type":"string"},"severity":{"type":"string","enum":["info","warning","error"]}},"additionalProperties":false},"default":[]}
  }
}


---

<a id="sec-20"></a>
# LCT ENGINE SPEC — التعريب + التحويل Any→Any + التفريغ (صوت/فيديو/صور/PDF) — محرك واحد (NO EXCEPTIONS / NO CHEATING)
**وثيقة تنفيذية فنية موجهة للمنفّذ مباشرة** — صياغة أمرية إلزامية (MUST/SHALL/MUST NOT)
**اسم المحرك**: LCT = Localization + Conversion + Transcription Engine
**الهدف**: “أعطني أي شيء” (PDF/صورة/فيديو/صوت/Word/Excel/PowerPoint/نص…) → “أعطني أي شيء” (PPTX/DOCX/XLSX/Dashboard/PDF/HTML/PNG/SRT/VTT/JSON…)
مع:
- **STRICT 1:1 بصري** عند التحويل/الاستنساخ (PixelDiff==0) داخل Farm حتمية
- **تعريب عالمي احترافي** (مصطلحات + سياق + أسلوب + RTL ELITE + حفظ التصميم)
- **تفريغ/نسخ/استخراج نص** بدقة **100% فعليًا** عبر بوابات تحقق + إعادة بناء + (عند الحاجة) **Human Verification Ops داخلي** بدون أسئلة للمستخدم
- **تكامل إلزامي** مع محركات: Strict Replication, Excel Engine, Slides Engine, Dashboard Engine, Report Engine
- **لا كود وهمي/لا ديمو/لا ادعاء**: لا “Done” إلا بعد artifacts حقيقية + gates + evidence.
> **قاعدة صارمة**: أي سلوك غير منصوص عليه هنا = **ممنوع**.
> **لا أسئلة للمستخدم**: المحرك لا يطرح أسئلة أثناء التنفيذ. أي نقص/غموض يُحل بسياسات افتراضية أو يُعالج داخليًا (VerifierOps).
> **100%** هنا = **Pass للبوابات الصفرية** (PixelDiff==0 / TranscriptExact==true / Terminology+LQA==0) قبل تسليم النتيجة.
---
## 0) التعريف النهائي للصرامة (Non-Negotiable)
### 0.1 ثلاث شارات نجاح (لا تُمنح إلا بالبوابات)
المحرك يدعم 3 “Claims” منفصلة. يمنع خلطها:
1) **CONVERT_STRICT_1TO1_100**
- التحويل/الاستنساخ البصري: `PixelDiff == 0` لكل صفحة/شريحة داخل Farm حتمية.
- الناتج MUST يكون Editable Core (نص/جداول/مخططات/عناصر) — ممنوع “كل شيء صورة”.
2) **LOCALIZE_PRO_100** (تعريب عالمي احترافي)
- ترجمة مصطلحية سياقية + التزام قالب/أسلوب + Arabic ELITE typesetting.
- **LQA==0** (لا أخطاء مصطلح/معنى/نبرة/اتساق/أسماء/أرقام/وحدات).
- Layout MUST يبقى محافظًا على التصميم (layout lock) مع إصلاحات هندسية لا تُفسد الترتيب.
3) **TRANSCRIBE_STRICT_100** (تفريغ/نسخ/استخراج نص 100%)
- transcript MUST يكون “Exact” وفق بوابات تحقق متعددة، و**لا يُسلّم** قبل الوصول للـExact.
- إذا لم تحقق النماذج الآلية Exact، MUST تُرسل المهمة تلقائيًا إلى **VerifierOps** الداخلي (تدقيق بشري داخل المنصة) للوصول إلى Exact **بدون سؤال المستخدم**.
- لا يُسمح بإرجاع “قريب” أو “confidence 0.97” كناتج نهائي. إما Exact أو لا تسليم.
> **ممنوع**: أي “99.9999” أو “قريب جدًا”.
> **Never-Fail للمستخدم** يتحقق داخليًا عبر VerifierOps وليس عبر تخفيض الدقة.
---
## 1) UX (Canvas-One) — محرك واحد في صفحة واحدة
### 1.1 واجهة واحدة فقط (MUST)
- Canvas واحد: drop أي ملف/رابط/تسجيل
- Panel واحد قابل للإخفاء:
  - Inputs (Library/Connectors)
  - Task (Convert / Localize / Transcribe / Extract Structured)
  - Outputs (PPTX/DOCX/XLSX/Dashboard/PDF/HTML/SRT/VTT/JSON)
  - Policies (STRICT claims toggles)
  - Preview Reader (overlay)
  - History/Versions
  - Share/Permissions/Classification
### 1.2 Progressive Controls (MUST)
- لا تُعرض خيارات كثيرة دفعة واحدة.
- يظهر فقط:
  - “ماذا تريد؟” (تحويل/تعريب/تفريغ/استخراج)
  - “إلى ماذا؟” (targets)
  - “شارات الصرامة” (3 toggles)
- أي خيار إضافي يظهر **حسب السياق** + عبر Search Controls.
---
## 2) Any→Any Conversion (MUST) — تحويل أي شيء إلى أي شيء
### 2.1 قاعدة ذهبية (MUST)
- كل التحويلات MUST تمر عبر **CDR** (Canonical Design/Data Representation) الخاص بالمنصة:
  - CDR-Design (layout + typography + vectors + images)
  - CDR-Data (tables + semantic bindings)
- ممنوع مسارات خاصة لكل صيغة bypass.
### 2.2 Supported Conversions (MUST)
المحرك MUST يدعم (على الأقل):
- PDF ↔ PPTX (Editable)
- PDF ↔ DOCX (Editable)
- Image ↔ XLSX (table-strict)
- Image ↔ PPTX (strict slide build)
- XLSX/CSV → Dashboard
- Dashboard → PPTX/DOCX/PDF/HTML
- Video/Audio → Transcript (DOCX/JSON/SRT/VTT) + optional “slides/report” outputs
### 2.3 CONVERT_STRICT_1TO1_100 Gate (MUST)
إذا تم اختيار CONVERT_STRICT_1TO1_100:
- MUST:
  1) Render Source داخل Farm
  2) Build CDR
  3) Export Target
  4) Render Target داخل Farm
  5) Verify PixelDiff==0
  6) Verify Structural/Editability gate
  7) Repair Loop حتى PixelDiff==0 (لا خروج مبكر)
- MUST NOT:
  - rasterize النص/الجداول/المخططات/المرئيات الأساسية
  - overlay خداعي لتغطية الفروقات
  - العتبات غير الصفرية
> صور الطبيعة (photos/logos) مسموحة كأصول فقط، وتبقى قابلة للتحرير (crop/replace/mask).
---
## 3) Professional Localization (LOCALIZE_PRO_100) — تعريب عالمي “ليس ترجمة نص فقط”
### 3.1 Localization Scope (MUST)
التعريب هنا يعني:
- ترجمة النصوص + المصطلحات + الأرقام/الوحدات + السياق الإداري
- إعادة بناء layout RTL ELITE
- تكييف الجداول/المخططات/المحاور/التسميات
- احترام القالب/النبرة (حكومي/تجاري/تنفيذي/تقني)
- حفظ التصميم قدر الإمكان دون تشويه (layout lock)
### 3.2 Terminology System (MUST)
- MUST وجود:
  - **Termbase** (مصطلحات عربية/إنجليزية) مع domains (مالي/حكومي/تقني…)
  - **Translation Memory** per tenant
  - **Style Guide** per tenant (tone, honorifics, formal phrases, forbidden phrases)
- MUST:
  - تطبيق المصطلحات بحرفية حيث تنطبق
  - منع الترجمة العشوائية للمصطلحات الحساسة
  - الحفاظ على أسماء الجهات/الأشخاص/الأرقام دون تغيير غير مصرح
### 3.3 Arabic ELITE Typesetting (MUST)
- MUST استخدام Arabic shaping/bidi pinned engine
- MUST حفظ:
  - line breaks
  - glyph metrics lock
  - punctuation rules
  - mixed scripts
- MUST تحويل:
  - charts axes RTL
  - legends RTL
  - table direction RTL
  - numbering style per policy (٠١٢٣ أو 0123)
### 3.4 Layout Lock + Repair (MUST)
- التعريب MUST لا “يكسر” التصميم:
  - ممنوع overflow/clipping
  - ممنوع تداخل عناصر
- MUST تنفيذ Layout Repair loop:
  1) text box resize rules deterministic
  2) font size stepdown deterministic
  3) reflow داخل حدود bbox فقط
  4) grid snap
- إذا لم يصل Layout إلى “No-Break QA” آليًا:
  - MUST يذهب إلى VerifierOps (داخلي) لعمل micro-adjustments
  - بدون سؤال المستخدم
### 3.5 LOCALIZE_PRO_100 QA Gates (MUST)
- Terminology compliance = 100%
- LQA = 0 أخطاء (مصطلح/معنى/اتساق/نبرة/أسماء/أرقام/وحدات)
- Layout QA pass (no overlap/no clip)
- Arabic ELITE pass
- Evidence Pack stored
- ثم فقط: “Localized Successfully”.
---
## 4) Transcription / Extraction (TRANSCRIBE_STRICT_100) — تفريغ 100% فعليًا
### 4.1 Modalities (MUST)
المحرك MUST يدعم التفريغ من:
- صور (OCR text)
- PDF (text + scanned OCR)
- Audio (ASR)
- Video (ASR + on-screen text OCR + embedded captions)
- Camera capture (صورة/فيديو) كـinput asset
### 4.2 Transcript Outputs (MUST)
- DOCX transcript
- JSON transcript (segments, speakers, timestamps, confidence fields for audit only)
- SRT/VTT subtitles
- “Screen text extraction” (on-screen overlays)
- “Comments extraction”:
  - إذا الفيديو يحتوي track captions/metadata/comments داخل الملف أو ضمن منصة موصلات: MUST استخراجها
  - إذا غير متوفر مصدر: MUST لا يدّعي وجودها
### 4.3 Speaker Diarization (MUST)
- MUST:
  - diarization
  - speaker labels
  - overlap handling
  - speaker consistency across file
- MUST دعم:
  - timestamps per word (forced alignment) عند strict
  - punctuation restoration pinned rules
### 4.4 TRANSCRIBE_STRICT_100 Gates (MUST)
النجاح 100% لا يتم عبر “confidence”، بل عبر gates:
1) **Multi-Engine Consensus**:
   - run ≥2 ASR engines pinned
   - اختلافات تُحدد تلقائيًا
2) **Forced Alignment Gate**:
   - transcript MUST align perfectly to audio (token→time)
3) **Round-Trip Validation Gate**:
   - validate numbers, names, acronyms via constrained decoding + glossary
4) **Video OCR Gate** (للفيديو/الشاشة):
   - extract on-screen text
   - compare with spoken text for contradictions (if relevant)
5) **Exactness Gate**:
   - إذا بقيت أي “uncertain spans” => MUST route to VerifierOps
6) **VerifierOps Completion Gate**:
   - final transcript MUST be exact (no uncertain markers)
ثم فقط: TRANSCRIBE_STRICT_100 success.
> ممنوع تسليم “best effort”. لا يوجد “تقريب”.
---
## 5) VerifierOps (Human Verification) — إلزامي لتحقيق 100% بدون سؤال المستخدم
### 5.1 سبب وجوده
- لتحقيق “100% بدون استثناء” في OCR/ASR/Localization، MUST وجود طبقة تدقيق بشرية داخلية.
### 5.2 قواعد التشغيل (MUST)
- يُستدعى VerifierOps تلقائيًا عند:
  - أي Gate fail في STRICT_100
  - أي uncertainty span > 0
  - أي Terminology/LQA violation
  - أي Layout break غير قابل للإصلاح الآلي
- VerifierOps MUST:
  - يعمل على واجهة “diff-based” (يشاهد فقط المناطق المتنازع عليها)
  - يوقع النتيجة (verifier_id + timestamp)
  - ينتج Evidence داخل pack
### 5.3 منع الأسئلة للمستخدم
- VerifierOps MUST NOT يتواصل مع المستخدم.
- إذا نقصت بيانات مصطلحات، MUST يستخدم termbase الافتراضية + style guide العام.
---
## 6) Evidence Pack (MUST) — شرط إعلان النجاح لكل شيء
كل عملية LCT MUST تولد Evidence Pack يحتوي:
- input fingerprints (sha256, mime, metadata)
- pipeline action graph snapshot
- tool versions + farm image id
- for conversion:
  - source render + target render
  - pixel_hashes + PixelDiff report (must 0 in strict)
  - structural/editability report
- for localization:
  - terminology compliance report
  - LQA report (must 0 errors)
  - RTL/Arabic shaping report
  - layout QA report
- for transcription:
  - diarization report
  - alignment report
  - unresolved spans list (must empty)
  - verifier ops proof (if used)
- artifacts refs (pptx/docx/xlsx/pdf/html/srt/vtt/json)
No Evidence => MUST NOT say “Done”.
---
## 7) Security / Classification / Sharing (MUST)
- كل output MUST يحمل:
  - classification (public/internal/confidential/restricted)
  - lineage (sources)
- RBAC/ABAC + object ACL + row/column security where applicable
- share links:
  - view-only / comment / edit
  - export permissions separate
- audit immutable لكل view/edit/export/share
---
## 8) Integration with Other Engines (MUST)
LCT MUST call:
- Strict Replication Engine:
  - image/pdf → pptx/docx/xlsx strict 1:1
- Excel Engine:
  - any structured data extraction → table canvas + transforms + exports
- Dashboard Engine:
  - dataset → dashboard + exports
- Slides Engine:
  - report/dataset → slides + strict inserted pages
- Report Engine:
  - datasets + narrative → docx/pdf
---
## 9) Anti-Cheating / Integrity (MUST)
- MUST NOT:
  - return “success” without artifacts stored
  - show demo outputs
  - silently degrade strict claims
  - claim extraction of unavailable “video comments”
- MUST enforce:
  - gates block merge/release
  - no stubs/mocks/TODO in runtime
  - deterministic builds where claims depend on parity
---
# APPENDIX A — Tool Schemas (Minimum Critical Set) (MUST implement)
> كل Tool MUST يستخدم النمط: request_id/tool_id/context/inputs/params → output {status, refs, warnings}.
> JSON Schema Draft 2020-12.
> **ملاحظة**: هذه الأدوات تربط كل المحركات كـOrchestrator واحد.
## A0) common.json
```json
{
  "$schema":"https://json-schema.org/draft/2020-12/schema",
  "$id":"https://lct.local/schemas/common.json",
  "$defs":{
    "Mode":{"type":"string","enum":["AUTO","PRO"]},
    "ArabicMode":{"type":"string","enum":["BASIC","PROFESSIONAL","ELITE"]},
    "StrictClaim":{
      "type":"string",
      "enum":["NONE","CONVERT_STRICT_1TO1_100","LOCALIZE_PRO_100","TRANSCRIBE_STRICT_100"]
    },
    "ActionContext":{
      "type":"object",
      "required":["workspace_id","user_id","mode","arabic_mode","locale"],
      "properties":{
        "workspace_id":{"type":"string"},
        "user_id":{"type":"string"},
        "mode":{"$ref":"#/$defs/Mode"},
        "arabic_mode":{"$ref":"#/$defs/ArabicMode"},
        "locale":{"type":"string"}
      },
      "additionalProperties":true
    },
    "AssetRef":{
      "type":"object",
      "required":["asset_id","uri","mime","sha256","size_bytes"],
      "properties":{
        "asset_id":{"type":"string"},
        "uri":{"type":"string","maxLength":2048},
        "mime":{"type":"string"},
        "sha256":{"type":"string","pattern":"^[0-9a-fA-F]{64}$"},
        "size_bytes":{"type":"integer","minimum":0}
      },
      "additionalProperties":false
    },
    "ArtifactRef":{
      "type":"object",
      "required":["artifact_id","kind","uri"],
      "properties":{
        "artifact_id":{"type":"string"},
        "kind":{"type":"string","enum":["pptx","docx","xlsx","dashboard","pdf","html","png","json","srt","vtt"]},
        "uri":{"type":"string","maxLength":2048}
      },
      "additionalProperties":false
    },
    "Warnings":{
      "type":"array",
      "items":{"type":"object","required":["code","message","severity"],"properties":{
        "code":{"type":"string"},
        "message":{"type":"string"},
        "severity":{"type":"string","enum":["info","warning","error"]}
      },"additionalProperties":false},
      "default":[]
    }
  }
}


---

<a id="sec-21"></a>
# RASED CANVAS UX SPEC — “Canvas واحد” يدير كل المحركات (Chat + Dynamic Stage + Ultra-Premium Motion)
**وثيقة واجهة مستخدم صارمة موجهة للمنفّذ مباشرة (MUST/SHALL/MUST NOT)**
**الهدف**: واجهة واحدة فقط (Canvas) تعمل كـChat + مساحة عمل ديناميكية تُظهر *كل النتائج/التحرير/المعاينة/التصدير* داخل نفس الشاشة بدون فتح صفحات.
**قاعدة صارمة**: أي سلوك غير منصوص عليه هنا = **ممنوع**. أي انتقال لصفحات/تشتيت = **مرفوض**.
---
## 0) مبادئ لا تقبل التفاوض (Non-Negotiable UX Principles)
1) **Canvas واحد فقط**: لا “صفحات أدوات”. لا “اذهب إلى صفحة الإكسل/اللوحات/التقارير”. كل شيء يظهر داخل Canvas.
2) **Chat هو القائد**: كل عملية تبدأ من رسالة/أمر داخل الشات أو Drag&Drop إلى الشات.
3) **Dynamic Context**: الخيارات لا تظهر إلا حسب سياق (نوع الملف + ما حدده المستخدم + المرحلة الحالية).
4) **Progressive Disclosure**: ممنوع إغراق المستخدم بخيارات مرة واحدة.
   - تظهر 3–7 إجراءات أساسية فقط.
   - الباقي عبر Search Controls/More.
5) **Inline Results (بدون Navigation)**: النتائج تُعرض كبطاقات داخل المحادثة، وتفتح “داخل نفس الشاشة” بوضع Focus Stage.
6) **Preview بعد كل تغيير**: كل تعديل ينتج Preview فورًا (Sample) ثم Preview كامل (Job).
7) **Ultra-Premium Motion**: الحركة يجب أن تكون “سينمائية وذكية” لكن **صادقة** (لا توهم بالإنجاز قبل التحقق).
8) **No-Cheating UI**: ممنوع أي عبارة “تم” أو “جاهز” قبل Evidence/Gates.
   كل نص تشويقي MUST يكون في صيغة “جارٍ…” أو “قيد التحقق…”.
---
## 1) الهيكل المرئي (Layout Contract)
### 1.1 عناصر ثابتة (MUST Always Exist)
A) **Header Bar (ثابت)**
- شعار/هوية “راصد” + حالة الاتصال
- زر إظهار/إخفاء Sidebar
- زر تبديل الوضع (light/dark)
- زر Command Palette (⌘/Ctrl+K)
- زر الحساب/الإشعارات (اختياري)
B) **Chat Stream (أساسي)**
- عرض الرسائل (User/Assistant/System)
- بطاقات الملفات/النتائج/التقدم (Cards) ضمن نفس الـStream
C) **Composer (ثابت أسفل)**
- حقل إدخال متعدد الأسطر
- زر إرسال
- زر إرفاق/Drag&Drop indicator
- زر ميكروفون (اختياري)
- زر “أوامر” (اختياري)
> لا أزرار كثيرة. أي زر إضافي MUST يظهر فقط إذا كان مفعلًا بالسياسة أو حسب السياق.
D) **Sidebar (اختياري/قابل للإخفاء)**
- يظهر/يختفي بدون تغيير صفحة.
- يحتوي: Library / Templates / History / Exports / Permissions (حسب السياق).
### 1.2 ممنوعات (MUST NOT)
- MUST NOT فتح صفحات جديدة لتجربة “محرك” معين.
- MUST NOT إظهار Tabs متعددة كتطبيقات منفصلة.
- MUST NOT عرض 20+ زر/خيار في نفس الوقت.
---
## 2) نموذج “البطاقات” (Card Model) — كل شيء يظهر كبطاقة
> كل نتيجة/عملية/تحرير/تصدير MUST تُعرض كبطاقة داخل Chat Stream.
### 2.1 أنواع البطاقات (MUST)
1) **FileCard**: ملف تم إسقاطه/رفعه
- اسم + نوع + حجم + صفحات/مدة (إن وجدت) + معاينة صغيرة
2) **ContextActionsCard**: إجراءات ديناميكية (Chips) تظهر بعد FileCard أو بعد أمر المستخدم
- 3–7 إجراءات فقط
- زر “More” يفتح Search Controls (ليس قائمة ضخمة)
3) **PlanCard**: “ما الذي سيحدث الآن” (خطة قصيرة)
- 3–6 خطوات max
- لا كلام طويل
4) **RunCard**: تقدم التنفيذ (Progress + مراحل)
- شريط تقدم + مراحل (Parsing → Building → Verifying → Exporting)
- لا يكتب “تم” قبل النهاية
5) **PreviewCard**: معاينة سريعة (Sample/Thumbnail)
- تظهر مبكرًا ثم تتطور لجودة أعلى
6) **ResultCard**: ناتج نهائي (Artifact)
- زر “Open in Focus”
- زر “Export”
- زر “Share” (حسب الصلاحيات)
- زر “Evidence” (اختياري للمؤسسات)
7) **EditorCard**: تحرير داخل الـCanvas (جدول/شريحة/لوحة/مستند)
- يفتح في Focus Stage (قسم 4)
8) **DiffCard**: فروقات (Comparison/PixelDiff/RowDiff)
- تظهر فقط عند طلب مقارنة أو عند فشل بوابة
9) **EvidenceCard**: إثبات (gates passed + evidence_id)
- يظهر تلقائيًا للمستخدم الإداري/المالك أو عند تفعيل “Evidence visibility”
10) **ShareCard**: مشاركة/صلاحيات
- يظهر فقط عند طلب share أو عند الحاجة
---
## 3) قواعد الظهور (When/What Appears) — صارمة
### 3.1 عند فتح الصفحة (Cold Start)
MUST يظهر:
- رسالة ترحيب قصيرة جدًا (1–2 سطر)
- 3 اقتراحات سريعة (chips) فقط: مثال: “حلل ملف” / “أنشئ لوحة” / “حوّل PDF”
- Drop Hint (خفيف جدًا): “اسحب ملفك هنا”
MUST NOT:
- أي لوحة إعدادات
- أي قائمة كبيرة
### 3.2 عند Drag&Drop ملف داخل Canvas
MUST:
1) يظهر **FileCard** فورًا
2) يظهر **ContextActionsCard** خلال ≤300ms
3) يتم تشغيل **Auto-Detect** في الخلفية
4) بعد auto-detect:
   - إذا اكتشف “جدول/بيانات” → يضيف Actions تخص Excel/Data/Dashboard
   - إذا اكتشف “عرض/شرائح/تصميم” → يضيف Actions تخص Slides/Convert/Localize
   - إذا “صوت/فيديو” → يضيف Actions تخص Transcribe/Translate/Subtitles/Report
5) يظهر **PlanCard** فقط بعد اختيار المستخدم إجراء أو بعد أمر صريح “حلل”/“حوّل”.
### 3.3 عند كتابة المستخدم أمر بدون ملف
MUST:
- تشغيل Intent Parse
- يظهر ContextActionsCard بناءً على intent:
  - “أنشئ تقرير” → Report actions
  - “أنشئ عرض” → Slides actions
  - “لوحة مؤشرات” → Dashboard actions
  - “حوّل/عرّب/فرّغ” → LCT actions
### 3.4 عند اختيار Action (مثل “حوّل إلى PPTX 1:1”)
MUST تظهر بالترتيب داخل stream:
1) PlanCard (قصير)
2) RunCard (Progress)
3) PreviewCard (مبكرًا)
4) ResultCard (بعد gates)
5) EvidenceCard (إذا policy تفعيل)
MUST NOT:
- إخفاء RunCard
- إظهار “Done” قبل Evidence/Gates
### 3.5 عند تحديد عنصر داخل Editor (جدول/مخطط/عنصر شريحة)
MUST:
- إظهار **Context Drawer** داخل Sidebar أو كـInline mini panel:
  - 5–9 خيارات فقط
  - Suggestions strip (8–12 variant cards)
  - زر Search للخيارات اللانهائية
MUST NOT:
- فتح نافذة منفصلة
- عرض “كل الخيارات” مرة واحدة
---
## 4) Focus Stage (عرض/تحرير داخل نفس الشاشة بدون صفحة)
### 4.1 تعريف Focus Stage
“Focus Stage” هو وضع داخل Canvas يجعل نتيجة واحدة (Deck/Table/Dashboard/Doc) تظهر بكامل المساحة **داخل نفس الصفحة**، بينما تبقى المحادثة موجودة كعمود جانبي أو مطوية.
### 4.2 قواعد فتح/إغلاق Focus Stage (MUST)
- فتح: زر “Open” داخل ResultCard/EditorCard أو أمر نصي “افتح”
- إغلاق: زر X أو Esc
- عند الفتح:
  - المحادثة تتحول إلى “Thread Rail” على الجانب (ضيق) أو تُطوى مع زر إظهار
  - لا route change / لا reload
### 4.3 داخل Focus Stage (MUST)
- Top bar مصغر:
  - اسم النتيجة
  - زر Back للعودة للـChat Stream
  - زر Preview (Reader)
  - زر Export
  - زر Share (حسب الصلاحيات)
- التعديل داخل stage:
  - selection → context tools تظهر تدريجيًا
  - preview after each change
---
## 5) Sidebar Contract (صارم)
### 5.1 حالات Sidebar (MUST)
- Hidden (افتراضي)
- Peek (عرض ضيق: Library/Search فقط)
- Full (عرض كامل: Library + Context tools)
### 5.2 متى يظهر Sidebar تلقائيًا (MUST)
- عند Drag&Drop ملفات متعددة: يفتح Peek ويعرض Library list
- عند اختيار Template/Brand: يفتح Full
- عند الدخول Focus Stage: يفتح Peek (للوصول السريع للبيانات/الأصول)
- عند Share/Permissions: يفتح Full على تبويب Governance
### 5.3 ممنوعات Sidebar
- MUST NOT يفتح صفحة جديدة
- MUST NOT يتحول إلى “لوحة إعدادات ضخمة”
- MUST NOT يعرض عناصر غير مرتبطة بالسياق الحالي
---
## 6) Command Palette + Search Controls (إلزامي لتجنب فوضى الخيارات)
### 6.1 Command Palette (⌘/Ctrl+K) MUST
- البحث عن:
  - actions (convert/localize/transcribe/analyze…)
  - tools (join, dedupe, pivot, infographic swap…)
  - artifacts (آخر النتائج)
  - templates (slides/report/dashboard)
- النتائج max 12 عنصر
- دعم العربية/الإنجليزية
### 6.2 Search Controls MUST
- أي خيار غير ظاهر في panel MUST يكون قابل للعثور عليه بالبحث.
---
## 7) Animation & Motion System (Ultra-Premium) — عقد صارم
> الهدف: “إبهار احترافي” بدون فوضى، وبدون كذب بصري.
### 7.1 Motion Tokens (MUST)
- durations:
  - micro: 120ms
  - short: 180ms
  - base: 240ms
  - long: 360ms
- easing:
  - default: easeOutCubic
  - emphasis: spring (stiffness 380, damping 32)
- reduce motion:
  - إذا user enabled “Reduce Motion” => تعطيل springs واستبدالها بـfade 180ms
### 7.2 Card Choreography (MUST)
- FileCard: drop-in (scale 0.98→1 + fade)
- ContextActionsCard: slide-up 12px + fade
- RunCard:
  - progress shimmer (خفيف) + stepper يتحرك بين المراحل
  - MUST عدم استخدام مؤثرات مبالغ فيها تستهلك GPU
- ResultCard: “success reveal”:
  - glow خفيف 1.5s ثم يثبت
  - لا confetti إلا في حالات user-triggered “Celebrate” ووفق policy
### 7.3 Focus Stage Transition (MUST)
- Expand-in-place:
  - البطاقة تتوسع لتصبح stage (shared layout animation)
  - لا قطع/قفز
  - 240–360ms
### 7.4 “Teaser Microcopy” (MUST be truthful)
أمثلة عبارات مسموحة أثناء التنفيذ (تظهر داخل RunCard بالتناوب):
- “نرتّب التفاصيل…”
- “نثبت التطابق…”
- “نراجع الدقة…”
- “نبني نسخة قابلة للتعديل…”
- “نجهّز المعاينة…”
- “نقفل بوابات التحقق…”
ممنوع:
- “تم” / “جاهز” / “اكتمل” قبل Evidence pass.
### 7.5 Delight Effects (مسموح لكن مضبوط)
- Background particles (خفيف) + gradient shifts ببطء
- Hover micro-lift للأزرار والبطاقات
- Skeleton loaders premium (لا تومض بعنف)
- Sound haptics: ممنوع افتراضيًا، MAY إذا user فعّله
---
## 8) State Machine (حتمي) — يمنع الالتباس
### 8.1 States MUST
- IDLE
- COMPOSING
- UPLOADING
- ANALYZING (intent/file detect)
- PLANNING
- RUNNING
- VERIFYING
- EXPORTING
- COMPLETED
- FAILED (مع Repair/Retry)
- NEEDS_VERIFIER_OPS (داخلي، لا يسأل المستخدم)
- CANCELLED
### 8.2 UI Mapping (MUST)
- UPLOADING: FileCard + upload bar
- PLANNING: PlanCard
- RUNNING: RunCard + PreviewCard
- VERIFYING: RunCard stage = “التحقق”
- COMPLETED: ResultCard + (EvidenceCard إن مفعّل)
- FAILED: DiffCard + Repair action (لا صفحة error منفصلة)
---
## 9) Context Rules: ماذا تقترح حسب نوع الملف؟ (Strict)
### 9.1 PDF
Actions (تظهر 3–7 فقط حسب intent):
- “حوّل إلى PowerPoint Editable 1:1”
- “حوّل إلى Word Editable 1:1”
- “استخرج الجداول إلى Excel”
- “عرّب الملف (PRO)”
- “حوّل إلى Dashboard”
- “تلخيص/تقرير تنفيذي”
### 9.2 صورة جدول
- “حوّل إلى Excel Editable 1:1”
- “نظف الجدول”
- “حوّله إلى Dashboard”
- “قارن مع ملف آخر”
- “عرّب المحتوى”
### 9.3 Excel/CSV
- “ابنِ جدول موحد بالسحب”
- “تنظيف شامل”
- “اقتراح دمج/Join”
- “مقارنة ملفات”
- “أنشئ Dashboard”
- “أنشئ تقرير”
- “أنشئ عرض”
### 9.4 فيديو/صوت
- “تفريغ 100% (SRT/DOCX)”
- “ترجمة/تعريب التفريغ”
- “تقرير من الفيديو”
- “عرض تقديمي من الفيديو”
- “استخراج نص الشاشة” (للفيديو)
---
## 10) سيناريوهات تنفيذ خطوة بخطوة (End-to-End) — بدون مجال أسئلة
> كل سيناريو أدناه هو “قصة UI” حرفية يجب أن ينفذها المنفّذ كما هي.
### Scenario A — PDF → PPTX Editable 1:1 (STRICT)
1) User drops PDF داخل الشات.
2) يظهر FileCard ثم ContextActionsCard (أول خيار: PPTX 1:1).
3) User يضغط “PPTX 1:1”.
4) يظهر PlanCard (4 خطوات: تحليل → بناء → تحقق → تصدير).
5) RunCard يبدأ:
   - مرحلة 1: “تحليل الملف”
   - مرحلة 2: “بناء الشرائح”
   - مرحلة 3: “التحقق Pixel=0”
   - مرحلة 4: “تصدير PPTX”
6) PreviewCard يظهر thumbnails للشرائح تدريجيًا.
7) عند اكتمال VERIFYING:
   - ResultCard يظهر (PPTX)
   - زر Open يفتح Focus Stage داخل نفس الصفحة
8) EvidenceCard يظهر (إذا مفعّل)
9) User يفتح الـPPTX داخل Focus Stage، يعدّل نصًا، preview يتحدث.
### Scenario B — صورة جدول → Excel Editable 1:1
1) User drops image.
2) ContextActionsCard يقترح “Excel 1:1”.
3) RunCard: اكتشاف grid → OCR → بناء XLSX → Render verify pixel=0
4) PreviewCard يظهر grid overlay (اختياري) ثم preview excel.
5) ResultCard: XLSX + زر “Open” يفتح جدول داخل Focus Stage مع أدوات الأعمدة.
6) User يسحب عمود جديد من ملف Excel آخر داخل نفس stage → يتولد join wizard داخل Drawer (بدون أسئلة نصية).
### Scenario C — 50 ملف Excel → جدول موحد + مقارنة
1) User يسحب 50 ملف.
2) Sidebar يفتح Peek ويعرض قائمة الملفات فقط.
3) ContextActionsCard يظهر: “Analyze Everything”.
4) User يضغط “Analyze Everything”.
5) RunCard: preflight → column map → join suggestions → unified table build.
6) في نهاية التشغيل:
   - ResultCard: “Unified Table”
   - ResultCard: “Quality Report”
7) User يكتب: “قارن ملف يناير وفبراير”:
   - يظهر DiffCard (added/removed/modified)
   - زر “Export Diff” ينتج XLSX.
### Scenario D — Dataset → Dashboard حي + مشاركة + تصدير PPTX
1) User يكتب: “ابنِ لوحة تنفيذية للمبيعات من هذه الملفات”.
2) Intent parse → PlanCard
3) RunCard يبني dashboard pages
4) ResultCard: Live Dashboard link
5) Open Focus Stage (dashboard editor)
6) User يحدد KPI card → تظهر variants 8–12 + “More like this”
7) User يضغط Share:
   - Sidebar Full يفتح Governance
   - يحدد view-only لمجموعة
8) Export:
   - PDF + PPTX
9) EvidenceCard يظهر مع parity checks.
### Scenario E — فيديو → تفريغ 100% + تعريب + تقرير + عرض
1) User يسحب فيديو
2) ContextActionsCard: “تفريغ 100%”
3) RunCard: ASR ensemble → alignment → verify exactness (VerifierOps داخلي إن لزم)
4) ResultCard: SRT + DOCX transcript
5) User يكتب: “عرّبه رسميًا وخلي النبرة حكومية”:
   - LOCALIZE_PRO_100
   - ResultCard: Arabic transcript + Arabic report docx
6) User يكتب: “اصنع عرض 10 شرائح”:
   - Slides engine
   - ResultCard: PPTX
7) كل النتائج تفتح داخل Focus Stage بدون صفحات.
---
## 11) منع التشتيت (Strict Anti-Clutter Rules)
- في أي لحظة:
  - لا يظهر أكثر من:
    - 1 Sidebar
    - 1 Focus Stage (اختياري)
    - 1 Suggestion strip
- أي نتائج متعددة تُكدّس كبطاقات قابلة للطي (Collapse).
- كل “تفاصيل متقدمة” خلف Search/More وليس visible افتراضيًا.
---
## 12) جودة التنفيذ (UI Engineering Quality — إلزامي)
- MUST 60fps في animations الأساسية
- MUST virtualized list للرسائل والنتائج
- MUST incremental rendering للمعاينات
- MUST graceful degradation عند الأجهزة الضعيفة:
  - تقليل particles
  - تقليل blur
  - تقليل motion (respect reduce-motion)
---
## 13) تعريف “Done” في واجهة Canvas (MUST)
الواجهة MUST لا تعرض “تم” إلا إذا:
- artifact موجود فعليًا
- gates passed
- evidence_id محفوظ (إذا policy مفعّل)
- ثم فقط تظهر “Completed” + ResultCard
---
# END — هذا المستند يغلق قواعد الواجهة والسلوك والسيناريوهات لحتمية التنفيذ بدون اجتهاد.


---

<a id="sec-22"></a>
# STATE MACHINE SPEC — RASED CANVAS (Frontend-Ready) — مستخرج ومُقفل من تصميم ZIP + عقود التنفيذ
**Normative / إلزامي (MUST/SHALL/MUST NOT)**
**الهدف:** تحويل مفهوم “Canvas واحد + Chat + Sidebar اختياري + Focus Stage + Preview Reader + Tours + Jobs” إلى **Finite State Machines** دقيقة (States + Events + Guards + Actions + Invariants) جاهزة للتطبيق في الواجهة.
> **تنفيذ إلزامي:**
> - الواجهة MUST تُنفّذ هذا الـState Chart حرفيًا باستخدام **XState** (مفضل) أو FSM مكافئ.
> - إذا لم تستخدم XState، MUST تُقدّم اختبارات “State Equivalence” تُثبت أن السلوك مطابق 1:1 لكل Transition.
---
## 0) استخراج نقاط مؤكدة من ZIP (عناصر/متغيرات حالة موجودة فعليًا في الواجهة)
> هذه نقاط مُلاحظة مباشرة من ملفات الواجهة داخل ZIP (Home.tsx / NavDesigns.tsx / DesignContext / ThemeContext / ParticleBackground):
- حالة Theme: `light | dark` + toggle.
- حالة Panel/Overlay: `isPanelOpen` (لوحة تصميم/تحكم) + toggle.
- حالة Navigation: `activePage` + `expandedItems[]` + `sidebarCollapsed`.
- حالة Chat: `messages[]` + `isTyping` + `inputText`.
- حالة Background Effects: Particle canvas animation.
**ملاحظة:** هذه الـStates تُعاد صياغتها هنا لتصبح “Production State Machine” للـCanvas الواحد.
---
## 1) مبادئ حاكمة (Invariants) — ممنوع كسرها
### 1.1 Invariants عامة (MUST)
1) **Single Canvas:** لا يوجد Route-level navigation لصفحات أدوات. أي “صفحة” تُعرض كـView داخل نفس الـCanvas.
2) **One Focus Stage:** لا يمكن فتح أكثر من Focus Stage واحد في نفس اللحظة.
3) **One Modal Overlay:** لا يمكن أن تكون أكثر من Overlay “Blocking Modal” مفتوحة في نفس اللحظة (مانع تفاعل).
4) **Sidebar لا يحجب Canvas:** Sidebar لا يُغطي كامل الشاشة إلا في Mobile Overlay Mode.
5) **No Dead-End Rule:** عند أي حالة (حتى فشل) MUST يظهر Next Valid Action (Retry / Repair / Export logs / Open evidence).
6) **Truthful UI:** ممنوع إظهار “Completed/Done” قبل استلام `evidence_id` و`artifact_ids` من الـAction Runtime.
### 1.2 Invariants للأداء (MUST)
- Chat stream MUST يكون Virtualized.
- Preview/Render MUST تكون Async jobs ولا تجمّد الـUI.
- Animations MUST احترام Reduce Motion.
---
## 2) Context Model (State Context) — شكل البيانات داخل FSM
> هذا هو الـ“Context” الذي MUST يملكه الـRoot Machine ويُحدّث عبر Actions.
```ts
type ThemeMode = "light" | "dark";
type SidebarMode = "hidden" | "peek" | "full";
type SidebarPin = "unpinned" | "pinned";
type ViewId = "chat" | "dashboards" | "dataLake" | "reports" | "library" | "settings" | { sub: string };
type Selection =
  | { kind: "none" }
  | { kind: "message"; messageId: string }
  | { kind: "card"; cardId: string }
  | { kind: "artifact"; artifactId: string }
  | { kind: "page"; pageId: string }
  | { kind: "widget"; widgetId: string }
  | { kind: "table"; tableId: string }
  | { kind: "column"; columnId: string }
  | { kind: "slide"; slideId: string }
  | { kind: "docBlock"; blockId: string };
type JobStage = "analyzing" | "planning" | "running" | "verifying" | "exporting" | "completed" | "failed";
type Job = {
  jobId: string;
  createdAt: number;
  stage: JobStage;
  progressPct: number;        // 0..100
  runCards: string[];         // ids of RunCards
  previewCards: string[];     // ids of PreviewCards
  resultCards: string[];      // ids of ResultCards
  evidenceId?: string;
  artifactIds?: string[];
  error?: { code: string; message: string; detail?: any };
};
type Attachment = {
  assetId: string;
  name: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
  pageCount?: number;
  durationSec?: number;
};
type Message = {
  id: string;
  author: "user" | "rased";
  text: string;
  createdAt: number;
  attachments?: Attachment[];
  cards?: string[];     // card ids (plan/run/preview/result/evidence/diff/share/editor)
};
type UIEffects = {
  reduceMotion: boolean;
  particlesEnabled: boolean;
  premiumMotionEnabled: boolean;
};
type NavState = {
  activeView: ViewId;
  expandedNavItems: string[];     // labels/ids
  sidebarCollapsed: boolean;      // compact nav
};
type SidebarState = {
  mode: SidebarMode;
  pin: SidebarPin;
  activeTab: "library" | "search" | "history" | "templates" | "exports" | "permissions" | "settings" | "context";
};
type FocusStageState =
  | { open: false }
  | {
      open: true;
      artifactId: string;
      artifactKind: "pptx" | "xlsx" | "docx" | "dashboard" | "pdf" | "html" | "video" | "audio" | "image" | "json";
      // stage UI mode:
      stageMode: "view" | "edit";
    };
type Overlays = {
  commandPaletteOpen: boolean;
  previewReaderOpen: boolean;
  tourOpen: boolean;
  blockingModalOpen: boolean;      // ManusDialog, Confirm, etc
  activeModal?: "manus" | "confirm" | "error" | "share" | "export";
};
type RasedCanvasContext = {
  theme: ThemeMode;
  uiEffects: UIEffects;
  nav: NavState;
  sidebar: SidebarState;
  focus: FocusStageState;
  overlays: Overlays;
  composer: {
    text: string;
    isComposing: boolean;
    isSending: boolean;
    dragOver: boolean;
  };
  conversation: {
    messages: Message[];
    isAssistantTyping: boolean;
  };
  selection: Selection;
  jobs: {
    byId: Record<string, Job>;
    activeJobIds: string[];   // ordered
  };
  dev: {
    designPanelOpen: boolean; // مستخرج من ZIP (isPanelOpen)
  };
};


---

<a id="sec-23"></a>
# RASED AI ENGINE SPEC — “راصد الذكي” (القلب النابض) | Agent OS + Training Center + Guided Tours + Full Platform Control (NO CHEATING)
**وثيقة تنفيذية فنية موجهة للمنفّذ مباشرة** — صياغة أمرية إلزامية (MUST/SHALL/MUST NOT)
**الغرض**: راصد ليس “شات بوت”. راصد هو **نظام تشغيل ذكي** داخل Canvas واحد يقود المستخدم ويُنفّذ كل أعمال المنصة عبر المحركات والأدوات، ويُدرّب نفسه عبر مركز تدريب ومعرفة، ويُقدّم إرشادًا حيًا داخل الواجهة (Guided Tours)، ويمنع أي ادعاء أو تنفيذ وهمي.
> **قاعدة صارمة**: أي سلوك غير منصوص عليه هنا = **ممنوع**.
> **No-Cheating**: راصد MUST NOT يدّعي تنفيذًا لم يحدث. MUST لا يقول “تم” إلا بعد Evidence/Gates من Action Runtime.
> **Canvas-First**: كل تفاعل/تحرير/نتيجة تظهر داخل Canvas الواحد (وفق مواصفة RASED CANVAS UX السابقة).
> **No-Page Navigation**: ممنوع فتح صفحات أدوات منفصلة.
> **No-Questions-by-default**: راصد لا يسأل المستخدم أسئلة متتابعة. كل شيء عبر Defaults أو Controls.
> **أمان وحقوق**: راصد لا ينفّذ عمليات خطرة (حذف/نشر/مشاركة عامة) إلا عبر “Explicit Command Gate” بدون حوار.
---
## 0) تعريف النجاح (Non-Negotiable Definition of SUCCESS)
راصد يُعتبر ناجحًا فقط إذا حقق **كل** التالي:
1) **Agentic Control حقيقي**:
   - MUST يستطيع تشغيل جميع محركات المنصة عبر Tool Registry/Action Runtime (تحويل/مطابقة/عروض/إكسل/لوحات/تقارير/LCT…).
   - MUST يستطيع تعديل الإعدادات، إنشاء قوالب، تشغيل وصفات، نشر/مشاركة (ضمن الصلاحيات).
2) **Truthfulness Contract** (منع الهلوسة):
   - MUST كل رسالة “نفذت” تتضمن references إلى `action_ids` + `artifact_ids` + `evidence_id`.
   - MUST لا يخلط “سأفعل” مع “فعلت”.
   - MUST أي توصية/نتيجة تُبنى على بيانات داخل Workspace فقط (لا اختلاق).
3) **Training Center**:
   - MUST وجود مركز تدريب كامل لراصد داخل المنصة:
     - Knowledge Packs (مستندات/سياسات/مصطلحات)
     - Playbooks (سيناريوهات تشغيل)
     - Skill Packs (مهارات لكل محرك)
     - Evaluation Harness (اختبارات قبول/سيناريوهات ذهبية)
     - Personalization (تفضيلات مستخدم/مؤسسة)
   - MUST يدعم التعلم/التحديث بدون كسر الحتمية والحوكمة.
4) **Guided Tours حيّة**:
   - MUST راصد يستطيع أن “يذهب” داخل الواجهة:
     - يفتح sidebar
     - يسلط الضوء على عنصر
     - يُظهر مؤشر/مؤثرات
     - يشرح خطوة بخطوة
     - ويستطيع (إذا مُصرح) تنفيذ النقرات/الإجراءات بدل المستخدم
   - MUST كل Tour مبني على `data-rased-id` وليس على selectors هشة.
5) **Context-Driven UI**:
   - MUST راصد يظهر فقط الخيارات المناسبة في الوقت المناسب (Progressive Disclosure).
   - MUST يخلق “Cards” داخل الشات (Plan/Run/Preview/Result/Evidence) وفق مواصفة الواجهة.
6) **No Dummy / No Demo**:
   - MUST لا يظهر “أزرار/ميزات” غير منفذة فعليًا.
   - MUST لا يطلق “Demo outputs” على أنها نتائج حقيقية.
---
## 1) شخصية راصد وسلوك اللغة (Behavior & Language)
### 1.1 اللغة والنبرة (MUST)
- اللغة الافتراضية: العربية.
- MUST يغيّر النبرة حسب إعداد المستخدم:
  - رسمي حكومي / تجاري / تقني / مبسط
- MUST يدعم أسلوب “مختصر جدًا” أو “تفصيلي” حسب preference.
### 1.2 عدم الإزعاج (MUST)
- MUST لا يطيل الشرح في الرسالة الأساسية.
- MUST يستخدم:
  - PlanCard مختصر
  - Progress RunCard
  - ثم يضع “تفاصيل” داخل collapsible card أو “Explain” عند الطلب.
### 1.3 عدم السؤال (MUST)
- MUST لا يسأل “هل تريد…؟” كسؤال حواري متكرر.
- أي اختيار MUST يكون:
  - Default policy أو
  - Control chips داخل ContextActionsCard أو
  - Command palette.
---
## 2) وضعيات راصد (Operating Modes)
### 2.1 AUTO Mode (default)
- راصد يستنتج intent ويبدأ تنفيذ خطة كاملة دون أسئلة.
- يعرض للمستخدم:
  - PlanCard (3–6 خطوات)
  - Controls مختصرة للتعديل (5–9)
  - ثم تشغيل.
### 2.2 CONTROLLED Mode
- المستخدم يحدد knobs قبل التنفيذ (بدون حوار):
  - strict claims, language, template, fidelity, export targets…
- ثم راصد ينفذ مرة واحدة.
### 2.3 TUTOR Mode (التدريب والإرشاد)
- راصد لا يكتفي بالنتيجة؛ بل:
  - يفتح Guided Tour
  - يشرح أين يضغط المستخدم
  - يضع أمثلة حيّة داخل canvas
- TUTOR Mode MUST لا يفرض نفسه إلا:
  - إذا user طلب “علمني/أرشدني” أو
  - إذا policy المؤسسة فعلت “Assistive Guidance”.
### 2.4 EXECUTOR Mode (التنفيذ بالنيابة)
- راصد ينفذ “بالنيابة” إجراءات UI داخل canvas (فتح/تحديد/تطبيق) ضمن صلاحيات.
- MUST يسجل كل خطوة في Action Runtime + Audit.
---
## 3) المعمارية الإلزامية (RASED Agent OS Architecture)
> راصد MUST يبنى كنظام متعدد الطبقات، وليس “prompt واحد”.
### 3.1 Mandatory Components (MUST)
1) **Intent Engine**
   - prompt+assets → `intent_manifest` كامل
2) **Policy Engine**
   - permissions + classifications + strict claims + risk gates
3) **Planner (Action Graph Builder)**
   - intent_manifest → `action_graph_plan` (deterministic)
4) **Executor (Action Runtime Client)**
   - يشغل الأدوات (tools) ويُتابع progress ويعالج retries
5) **Verifier (Gates Orchestrator)**
   - pixel gates / structural gates / lqa gates / transcript gates / parity gates
6) **Evidence Producer**
   - يجمع الأدلة ويُرجع `evidence_id` قبل أي “Done”
7) **Memory & Personalization**
   - user_prefs / org_prefs / templates / term packs / saved recipes
8) **Knowledge System (RAG داخلي)**
   - workspace scoped retrieval فقط
9) **Training Center**
   - packs/playbooks/skills/evaluations
10) **Guided Tour Engine**
   - spotlight, callouts, ghost cursor, stepper
11) **UI State Observer**
   - يقرأ حالة الـCanvas (ما المحدد؟ ما المفتوح؟ ما الموجود؟)
12) **Connector Manager (APIs)**
   - call external APIs عبر connectors آمنة + vault + allowlist
13) **Telemetry & Audit**
   - logs, metrics, traces, immutable audit
### 3.2 Determinism & Reproducibility (MUST)
- أي خطة تنفيذ MUST تكون deterministic:
  - نفس المدخلات + نفس السياسات + نفس versions => نفس action_graph
- أي مخرجات MUST تكون reproducible:
  - action_snapshot + tool_versions + inputs hashes.
---
## 4) عقد “الصدق” (Truthfulness Contract) — يمنع أي ادعاء
### 4.1 Response Types (MUST)
كل رسالة من راصد MUST تُصنف داخليًا:
- `advice_only` (إرشاد بدون تنفيذ)
- `plan_only` (خطة جاهزة)
- `executing` (جار التنفيذ)
- `executed` (تم التنفيذ)
### 4.2 Hard Rules (MUST)
- MUST NOT كتابة “تم/اكتمل/جاهز” إلا إذا:
  - `action_graph.status == completed`
  - و `evidence_id` موجود
  - و `artifacts[]` محفوظة
- MUST كل claim “أنشأت/حوّلت/صدّرت” يرفق:
  - `action_ids[]`
  - `artifact_ids[]`
  - `evidence_id`
- MUST عند الفشل:
  - يعرض “Repair Plan” + “Retry”
  - ولا يختلق نتيجة.
---
## 5) عقد التحكم بالواجهة (UI Control & Observation)
### 5.1 Stable UI IDs (MUST)
كل عنصر تفاعلي في الواجهة MUST يحمل:
- `data-rased-id="<semantic_id>"`
- أمثلة:
  - `composer.input`
  - `sidebar.toggle`
  - `library.file_list`
  - `canvas.focus.open`
  - `export.button`
  - `dashboard.widget.kpi.add`
  - `excel.column_map.open`
ممنوع الاعتماد على:
- CSS selectors
- DOM order
- النصوص المتغيرة
### 5.2 UI Actions Allowed (MUST)
راصد MUST يتحكم فقط عبر “UI Action API” داخل التطبيق:
- open/close sidebar
- select artifact/page/widget/column
- apply variant
- run export
- start preview reader
- highlight element (spotlight)
- show callout
- scroll to card
- open focus stage
- change control toggle/slider/select
- undo/redo (if exists)
ممنوع:
- OS-level automation
- clicking خارج حدود canvas
- تنفيذ غير مسجل في audit
### 5.3 UI State Snapshot (MUST)
التطبيق MUST يوفر snapshot API:
- selected entity (none/page/widget/slide/column/table)
- open panels
- artifacts list
- running jobs
- current focus stage (if any)
- permissions context
- active template/brand
راصد MUST يستخدم snapshot قبل كل خطوة لتفادي الأخطاء.
---
## 6) Guided Tours (إرشاد حي) — تنفيذ إلزامي
### 6.1 أنواع الإرشاد (MUST)
1) **Explain Mode**: يشرح فقط ويُظهر spotlight
2) **Coach Mode**: يشرح + يطلب من المستخدم تنفيذ click (step gating)
3) **Do It For Me Mode**: ينفذ UI actions بالنيابة + يشرح
### 6.2 عناصر الـTour (MUST)
- Spotlight على عنصر (data-rased-id)
- Callout bubble (نص قصير + زر Next)
- Ghost cursor path (اختياري)
- Stepper progress (1/7)
- “Try it” gating:
  - في Coach: لا ينتقل حتى يقوم المستخدم بالفعل المطلوب
- Auto-play:
  - في Executor: راصد ينفذ الفعل ثم ينتقل
### 6.3 قواعد العرض (MUST)
- لا يغطي tour أكثر من 25% من الشاشة
- لا يقطع المحادثة
- يمكن إيقافه في أي لحظة
- يحترم reduce-motion
### 6.4 توثيق التور (MUST)
كل tour MUST يُسجل:
- tour_id
- steps executed
- completion rate
- time per step
- user feedback (optional)
---
## 7) Training Center (مركز تدريب راصد) — إلزامي
> مركز التدريب ليس “صفحة شرح”. هو منظومة تُغذّي راصد بالمعرفة والسيناريوهات وتختبره.
### 7.1 مكونات مركز التدريب (MUST)
1) **Knowledge Packs**
   - مستندات المؤسسة
   - سياسات الحوكمة
   - مصطلحات/Termbase
   - Style guides (نبرة/صياغة)
   - قوالب (عروض/تقارير/لوحات)
2) **Skill Packs**
   - مهارة لكل محرك:
     - strict replication
     - slides
     - excel
     - dashboard
     - reports
     - lct
3) **Playbooks**
   - سيناريوهات تشغيل جاهزة (Action Graph templates)
4) **Evaluation Harness**
   - Golden corpora
   - Scenario replay
   - Pass/Fail rubrics
5) **Personalization**
   - user_prefs
   - org_prefs
6) **Certification**
   - لا يُسمح لراصد بتنفيذ “Features حساسة” إلا بعد اجتياز evaluation (policy-controlled)
### 7.2 Knowledge Ingestion Rules (MUST)
- knowledge ingestion MUST يكون:
  - tenant-scoped
  - versioned
  - auditable
- أي تحديث على knowledge pack MUST ينتج:
  - pack_version
  - change log
  - evaluation run suggested
### 7.3 Termbase & Style Guides (MUST)
- MUST دعم termbase:
  - ar/en
  - domains
  - preferred/forbidden terms
- MUST دعم style guide:
  - مخاطبة الجهات
  - جُمل افتتاح/ختام
  - لهجة حكومية/تجارية
---
## 8) Playbooks (سيناريوهات تنفيذ جاهزة) — إلزامي
### 8.1 تعريف Playbook (MUST)
playbook هو ملف قابل للتنفيذ:
- trigger: intent patterns
- steps: action_graph template
- validations: gates
- outputs: expected artifacts
- guided_tour: optional overlay steps
### 8.2 Playbook MUST support
- PDF → PPTX strict
- Image table → XLSX strict
- 50 xlsx → unify → dashboard → report → slides
- Video → transcript strict → localize → report
- Dataset → executive dashboard + share + exports
### 8.3 No questions rule inside playbooks
- MUST playbook يحدد كل defaults
- أي ambiguity يحل عبر policy
---
## 9) External APIs (Connectors) — راصد مرتبط بالـAPIs بشكل آمن
### 9.1 Connector Manager (MUST)
- جميع الاستدعاءات الخارجية MUST تمر عبر:
  - connector registry
  - secrets vault
  - domain allowlist
  - rate limits
  - audit logging
### 9.2 Data Safety (MUST)
- MUST عدم إرسال بيانات حساسة خارج المؤسسة إذا policy تمنع
- MUST احترام classification:
  - restricted → ممنوع خروج
  - confidential → allow only approved connectors
---
## 10) Risk Gates (عمليات خطرة) — بدون أسئلة لكن بحزم
### 10.1 Destructive Actions (MUST)
- delete dataset
- publish public link
- revoke permissions
- overwrite templates
هذه MUST require:
- explicit command token داخل الشات مثل:
  - `CONFIRM PUBLISH`
  - `CONFIRM DELETE`
لا يعتبر “سؤال”. بل شرط تنفيذ.
### 10.2 Audit (MUST)
أي فعل خطر MUST يسجل:
- user_id
- timestamp
- action_id
- before/after snapshot
---
## 11) Observability & Anti-Cheating (MUST)
- كل ActionGraph MUST ينتج:
  - logs/metrics/traces
  - progress stages
- راصد MUST يظهر RunCard بتقدم حقيقي (لا حركات وهمية)
- Evidence Pack MUST mandatory قبل “Completed”.
---
## 12) Tool Registry Contract for RASED (MUST)
راصد لا ينفذ شيئًا “داخل عقله”. ينفذ عبر Tools فقط.
### 12.1 Required Tools (Minimum Critical Set) (MUST)
- rased.intent_parse
- rased.plan_action_graph
- rased.execute_action_graph
- rased.observe_ui_state
- rased.ui_action.dispatch
- rased.ui_tour.start
- rased.ui_tour.step
- rased.ui_tour.end
- rased.training.pack.ingest
- rased.training.playbook.upsert
- rased.training.eval.run
- rased.knowledge.search
- rased.preference.get
- rased.preference.set
- rased.policy.check
- rased.connector.call
- rased.explain.trace
- rased.evidence.pack
> أي Tool بدون schema/permissions/determinism metadata = غير قابل للتشغيل.
---
# APPENDIX A — JSON Schemas (مختصرة لكن تشغيلية) — Tools حرجة لراصد
> Draft 2020-12. كل schema MUST يُطبق حرفيًا.
> كل طلب = request_id/tool_id/context/inputs/params.
> كل رد = status/refs/warnings.
## A0) common.json
```json
{
  "$schema":"https://json-schema.org/draft/2020-12/schema",
  "$id":"https://rased.local/schemas/common.json",
  "$defs":{
    "Mode":{"type":"string","enum":["AUTO","CONTROLLED","TUTOR","EXECUTOR"]},
    "ArabicMode":{"type":"string","enum":["BASIC","PROFESSIONAL","ELITE"]},
    "ActionContext":{
      "type":"object",
      "required":["workspace_id","user_id","mode","arabic_mode","locale"],
      "properties":{
        "workspace_id":{"type":"string","minLength":3,"maxLength":128},
        "user_id":{"type":"string","minLength":3,"maxLength":128},
        "mode":{"$ref":"#/$defs/Mode"},
        "arabic_mode":{"$ref":"#/$defs/ArabicMode"},
        "locale":{"type":"string","minLength":2,"maxLength":16}
      },
      "additionalProperties":true
    },
    "AssetRef":{
      "type":"object",
      "required":["asset_id","uri","mime","sha256"],
      "properties":{
        "asset_id":{"type":"string","minLength":8,"maxLength":128},
        "uri":{"type":"string","maxLength":2048},
        "mime":{"type":"string","maxLength":128},
        "sha256":{"type":"string","pattern":"^[0-9a-fA-F]{64}$"}
      },
      "additionalProperties":false
    },
    "ArtifactRef":{
      "type":"object",
      "required":["artifact_id","kind","uri"],
      "properties":{
        "artifact_id":{"type":"string","minLength":8,"maxLength":128},
        "kind":{"type":"string","enum":["pptx","docx","xlsx","dashboard","pdf","html","png","json","srt","vtt","link"]},
        "uri":{"type":"string","maxLength":2048}
      },
      "additionalProperties":false
    },
    "Warnings":{
      "type":"array",
      "items":{
        "type":"object",
        "required":["code","message","severity"],
        "properties":{
          "code":{"type":"string","minLength":2,"maxLength":64},
          "message":{"type":"string","minLength":1,"maxLength":2000},
          "severity":{"type":"string","enum":["info","warning","error"]}
        },
        "additionalProperties":false
      },
      "default":[]
    }
  }
}


---

<a id="sec-24"></a>
# APPENDICES PACK — “NO-MISS” ADDENDA (NORMATIVE / EXECUTION-DIRECTIVE)
# Applies on top of the Master Spec. If conflict exists, THIS PACK OVERRIDES.
================================================================================
A0) OVERRIDE RULES (APPLY TO ALL ENGINES / ALL WORKFLOWS)
================================================================================
A0.1 You SHALL NOT reinterpret this addenda. You SHALL implement it exactly.
A0.2 Any requirement using MUST/SHALL is hard-mandatory.
A0.3 Any “STRICT” mention in any UX MUST map to STRICT_PIXEL_LOCK_FINAL (defined below).
A0.4 If any gate fails → you SHALL STOP, return a failure report, and SHALL NOT export.
================================================================================
A1) CROSS-ENGINE “PROFESSIONAL ENGINES” REQUIREMENTS (MANDATORY BASELINE)
================================================================================
A1.1 Professional Layout Engine (baseline, used by every engine)
- You MUST implement a constraint-based layout system.
- You MUST implement a grid precision engine (supports sub-pixel math internally; final strict is pixel-locked).
- You MUST implement typography metric engine (font metrics, baselines, line boxes).
- You MUST implement: visual density analyzer, hierarchy scoring engine, white-space analyzer.
- You MUST implement accessibility compliance validator + color contrast validator.
- You MUST implement responsive logic (ONLY when a non-strict adaptive mode is explicitly enabled).
- You MUST implement Strict mode override capability (STRICT disables any adaptation/beautification).
A1.2 Professional Data Engine (baseline)
- You MUST implement semantic layer binding (entities, measures, dimensions).
- You MUST enforce metric registry + aggregation validation.
- You MUST enforce data types + unit normalization + null policy + numeric precision policy.
- You MUST provide query optimization layer + pre-aggregation support + scalable streaming support.
A1.3 Professional Chart Engine (baseline)
- You MUST define charts via declarative chart specification.
- You MUST preserve axis scale + tick interval logic + legend logic + color mapping consistency.
- You MUST support tooltip logic + drill support + export consistency.
- You MUST support RTL axis inversion support + density validation.
A1.4 Professional Typography Engine (baseline)
- You MUST enforce font metric equivalence, kerning preservation, line-height ratio preservation.
- You MUST enforce deterministic wrapping equivalence + baseline alignment.
- You MUST implement RTL shaping logic + glyph integrity validation.
A1.5 Professional Rendering Engine (baseline)
- You MUST enforce deterministic rendering.
- You MUST implement cross-format fidelity validation.
- You MUST implement: layout hash validation + structural hash validation.
- You MUST implement pixel threshold validation (STRICT uses PixelDiff==0.0).
- You MUST implement export parity validation.
- You MUST enforce “zero runtime mutation” in strict rendering.
A1.6 Professional Interaction Engine (baseline)
- You MUST support drag-based layout editing across the platform.
- You MUST support component-level locking.
- You MUST implement deterministic undo/redo stack.
- You MUST validate permissions before apply.
- You MUST provide preview-before-apply.
- You MUST emit events on every change.
A1.7 Professional Validation Engine (baseline)
- You MUST score structural equivalence + density deviation + hierarchy preservation.
- You MUST validate component integrity + data-binding verification.
- You MUST run cross-format regression testing on every export path.
A1.8 FUNCTIONAL EQUIVALENCE MANDATE (ABSOLUTE)
- If source represents a dashboard → output MUST be a LIVE dashboard (not static).
- If source represents a slide → output MUST be an EDITABLE presentation (not images).
- If source represents a report → output MUST be an EDITABLE report (not flattened).
- If source represents a spreadsheet → output MUST be a STRUCTURED workbook (not raster).
- No output may remain a static image.
- Artifacts MUST be: Editable, Data-bindable, Interactive (if applicable), Permission-aware, Exportable, Versionable, Governed.
================================================================================
A2) STRICT REPLICATION SUPREME UPGRADE (STRICT_PIXEL_LOCK_FINAL)
================================================================================
A2.1 Definitions
- STRICT_PIXEL_LOCK_FINAL := The only allowed “STRICT” acceptance profile.
- Strict replication SHALL mean: ANY_FORMAT → CDR_ABSOLUTE → TARGET_FORMAT (editable & functional).
A2.2 Strict Behavior Locks
- You MUST disable beautification.
- You MUST disable layout adaptation.
- You MUST lock CDR to ABSOLUTE coordinates.
- You MUST enforce DUAL FIDELITY GATE:
  Gate-1: STRUCTURAL_EQ (layout graph / element inventory / styles)
  Gate-2: PIXEL_LOCK_EQ (PixelDiff==0.0 exactly in locked render environment)
A2.3 Mandatory Preservation (no omissions)
- Font: mandatory font embedding OR glyph vectorization (no “missing font” silent substitution).
- Pivot geometry preservation.
- Conditional formatting replication.
- Freeze pane preservation.
- Column pixel width preservation.
- SmartArt geometry preservation.
- Chart axis spacing lock + chart density ratio lock.
- Legend offset preservation.
- KPI block alignment preservation.
- Clipping/overflow rules, container padding ratios, margin ratios, nested hierarchy, grouping hierarchy.
- Layout hash equality + structural hash equality + deterministic build artifact hash equality.
- Zero runtime mutation policy; hard failure on any fidelity breach.
A2.4 Strict Acceptance Criteria (final)
- PixelDiff MUST equal 0.0 (no epsilon) under the platform’s locked renderer profile.
- Structural hash MUST match (exact match policy) OR fail.
- Any failure MUST produce:
  (1) Diff report (visual + structural)
  (2) Root-cause classification (fonts / layout / raster / chart / RTL / etc.)
  (3) Repair attempt plan OR hard-fail if repair is impossible without breaking strict locks.
A2.5 Reconciliation Rule (anti-ambiguity)
- Any document mentioning “≤0.1% pixel deviation” SHALL be treated as:
  - Allowed ONLY as an INTERNAL heuristic inside D15 inference stage,
  - NEVER as final acceptance for STRICT_PIXEL_LOCK_FINAL.
================================================================================
A3) D15 — VISUAL REVERSE ENGINEERING ENGINE (VREE) (NEW MODULE)
================================================================================
A3.1 Purpose
- Convert Image/Screenshot/PDF pages into Layout Graph + Design Tokens + Component Inventory + Binding Hints.
A3.2 Capabilities (mandatory)
- Image → Layout Graph reconstruction.
- Screenshot → Editable Dashboard blueprint.
- Screenshot → Editable PPT blueprint.
- PDF → Live BI blueprint with binding hints.
- Chart type detection + axis scaling inference.
- Typography extraction/inference.
- Grid reconstruction + structural graph matching.
- Perceptual hash validation (INFERENCE QUALITY ONLY, not final STRICT gate).
A3.3 Output Contract
- Output MUST be CDR-compatible (feeds strict builder).
- Output MUST include confidence scores per:
  element type, bounds, font, color, chart inference, table structure.
A3.4 Quality heuristics (allowed internally, NOT final strict)
- Structural similarity scoring (used to drive repair loop).
- Density deviation scoring (used to drive layout refinement loop).
- Element preservation scoring (used to detect missing components early).
================================================================================
A4) D16 — ULTRA PREMIUM VISUAL SYSTEM (UPVS) (NEW MODULE)
================================================================================
A4.1 Purpose
- Enforce “Luxury-grade” motion + visual quality + minimal clutter while preserving determinism.
A4.2 Mandatory features
- Dynamic shadow depth engine.
- Deterministic motion physics layer (no randomness).
- Visual entropy scoring.
- Golden ratio autogrid + snapping (alignment primitive).
- Density equalization engine.
- Executive Minimal Mode.
- Focus Mode.
- Visual Quality Score (VQS).
A4.3 Mandatory quality rule
- Generated artifacts in NON-STRICT modes MUST score VQS ≥ 0.90.
- STRICT_PIXEL_LOCK_FINAL MUST bypass UPVS beautification entirely.
================================================================================
A5) M34 — UNIVERSAL INTERACTION ENGINE (UIL) (NEW MODULE)
================================================================================
A5.1 Constitutional definition
- Drag & Drop is NOT a feature; it is a platform-wide interaction primitive.
A5.2 Mandatory capabilities
- Object Drag Intelligence.
- Drop Target Resolution.
- Smart Action Preview (pre-flight: what will happen on drop).
- Permission check via ECL BEFORE apply.
- Deterministic Undo/Redo stack.
- Motion physics (deterministic).
- Interaction telemetry (latency, errors, drop outcomes).
- Golden Ratio Snap Alignment.
- Cross-module Drag Coverage.
A5.3 Cross-module drag must function across (mandatory set)
Users, Roles, Files, KPIs, Dashboards, Reports, Slides, Policies, Workflows, Templates, Metrics, Datasets.
A5.4 Interaction latency target
- Drag interaction latency MUST be < 50ms (P95) in standard profile.
================================================================================
A6) M35 — UNIVERSAL FILE INTELLIGENCE (FILE-AS-UNIVERSAL-OBJECT DOCTRINE)
================================================================================
A6.1 Every uploaded file becomes (mandatory)
- Versioned
- Indexed
- Semantic-extracted
- Queryable
- Lineage-linked
- Actionable
- AI-indexed
- Embeddable
A6.2 Massive file handling (mandatory)
- 5GB+ streaming support.
- Chunked upload.
- Parallel ingestion.
- Distributed parsing.
- Cold archive tier.
- Background indexing (module-isolated).
- Memory-adaptive loading.
- Progressive rendering for preview.
- No OLTP impact allowed.
================================================================================
A7) M37 — FILE SCALE ORCHESTRATOR (MASSIVE FILE ORCHESTRATION)
================================================================================
A7.1 Mandatory capabilities
- Distributed parsing cluster.
- GPU pool separation (AI vs parsing vs charts).
- Storage abstraction (object store neutrality).
- Auto-archiving.
- Streaming Excel processing.
- Partial PDF rendering.
- Smart prefetch.
- Archive retention governance.
- File sharding for large datasets.
A7.2 Concurrency/performance targets (mandatory)
- Support 10,000 concurrent conversions (target profile).
- Support multi-GB files via streaming.
- Strict rendering latency MUST be < 2x non-strict baseline.
- Reverse engineering target: < 30s per medium asset (profile-defined).
A7.3 Isolation targets (mandatory)
- DPC isolation preserved.
- No OLTP performance degradation.
- No tenant data leakage.
================================================================================
A8) M36 — COGNITIVE EXPERIENCE ENGINE (COGNITIVE UX DOCTRINE)
================================================================================
A8.1 Mandatory UX doctrines
- Goal-first navigation.
- Smart Steps Panel (AI-generated next steps per context).
- No Dead-End Rule (system must always present a next valid action).
- AI contextual suggestions (contextual, minimal, non-noisy).
- Executive Snapshot Mode.
- Meeting Freeze Mode.
- Data Storytelling Engine.
- Proactive Recommendation Engine.
A8.2 Goal Mode UX integration requirements
- AI-generated page/report/dashboard flows MUST be available as “guided steps”.
- Executive simplification mode MUST collapse complexity without hiding correctness.
================================================================================
A9) AI PLATFORM OPERATOR MODE (RASED EXECUTION CONTRACT)
================================================================================
A9.1 Mandatory operator pipeline
Plan → Preview → Approval → Execute → Audit
A9.2 Operator capabilities (minimum)
- Page creation.
- Report scheduling.
- Feature flag activation.
- Workflow trigger.
- Escalation trigger.
- KPI creation.
- Drift repair suggestion.
- Meeting snapshot generation.
A9.3 Absolute restriction
- AI cannot bypass Policy Engine.
A9.4 Tooling governance controls (mandatory)
- Kill-switch MUST exist and MUST hard-disable AI execution actions.
- Token budget MUST be enforced.
- Prompt injection guard MUST operate on:
  user text, file text, extracted OCR text, and retrieved RAG chunks.
- Tools MUST be isolated (no cross-tenant leakage; no privilege escalation).
================================================================================
A10) GUARDRails + RLS PIPELINE (MANDATORY SECURITY WRAPPER)
================================================================================
A10.1 Execution flow (mandatory)
Client → Auth(401) → Tenant RLS → Action Engine(K3 executeAction) → RBAC(K4 403) → Guardrails Evaluate →
[BLOCK / REQUIRE_CONFIRMATION / FLAG / PASS] → Handler → Audit Log → Response
A10.2 Guardrails are wrappers (mandatory)
- Guardrails MUST wrap execution and MUST NOT replace K4 RBAC.
- Guardrails MUST NOT silently rewrite prompts or swap handlers.
- Guardrails MUST log every evaluation immutably.
A10.3 Data model (mandatory)
- Tables:
  - mod_ai.guardrail_rules (RLS tenant_isolation enforced)
  - mod_ai.guardrail_evaluations (RLS tenant_isolation enforced, immutable log)
- Every evaluation MUST store full input_snapshot.
A10.4 Registered actions (mandatory)
- You MUST register guardrail actions via Action Registry.
- Every action MUST enforce required_permissions via RBAC.
A10.5 “No silent override exists” checks (mandatory CI grep gates)
- No rewrite/reformat/sanitize/transform.*prompt patterns.
- No override.*tool / swap.*action patterns.
- No external moderation calls via fetch/axios/etc inside guardrails module.
- No global runtime mutation.
================================================================================
A11) SDK + DEVELOPER PORTAL (MANDATORY)
================================================================================
A11.1 Deliverables (no TODO/no placeholders)
- JS SDK
- Python SDK
- Tool Builder (No-code)
- Action-as-API exposure
- OpenAPI auto-doc generation
- Sandbox
- API rate limiting
- API key rotation
- Webhooks
- Developer portal UI
================================================================================
A12) INFRASTRUCTURE + DEPLOYMENT DIRECTIVE (MANDATORY)
================================================================================
A12.1 Infrastructure artifacts (mandatory)
- Terraform/Pulumi
- Kubernetes manifests
- Helm charts
- Dockerfiles
- GPU pool separation
- DPC cluster isolation
- SaaS profile
- Dedicated profile
- Sovereign profile
- CI gates
- Deterministic builds ONLY
- Zero non-deterministic rendering behavior
- No runtime mutation allowed
A12.2 Deployment directive (Manus) (mandatory)
- Validate artifact integrity.
- Execute IaC exactly as delivered.
- Apply migrations.
- Deploy containers.
- Validate health checks.
- Validate performance envelope.
- Mark environment active ONLY after all validations pass.
- MUST NOT: modify architecture, patch code, adjust engines, rewrite configs.
- If conflict → STOP.
A12.3 Runtime network validation gate (mandatory evidence)
- You MUST provide proof for:
  - Pod-to-Pod networking
  - DNS resolution proof
  - NetworkPolicy enforcement proof (traffic blocked after default-deny)
================================================================================
A13) ACTION ENGINE (UNIFIED ACTION EXECUTION) — ADDENDUM
================================================================================
A13.1 Action input contract (mandatory)
- action: canonical verb (e.g., replication.strict_run, workflow.start, report.publish)
- id_object: target object id
- parameters: action parameters (format/destination/strict options/etc.)
A13.2 Action output contract (mandatory)
- id_execution
- execution status
- outputs/errors
- emitted events
A13.3 Performance target (AuthZ + Policy)
- P95 ≤ 200ms (initial target envelope)
A13.4 Heavy actions
- Heavy actions MUST be async with Polling + Webhooks.
A13.5 Failure modes (mandatory HTTP semantics)
- 401/403 for auth/authz
- 422 invalid parameters for object type
- 429 rate limit exceeded
A13.6 Safety
- Step Confirmation required for sensitive actions:
  deletion, external publish, export of sensitive data.
- Audit logging mandatory + least privilege.
================================================================================
A14) DUAL VERIFICATION & DIFF REPORTING (MANDATORY)
================================================================================
A14.1 Dual Accuracy Verification
Inputs:
- (A) rebuilt artifact + (B) original source + comparison settings
Outputs:
- Diff report:
  - Visual differences (Highlights/Heatmap)
  - Structural differences (missing/extra elements, coordinates, properties)
Formats:
- JSON Report + optional diff images + PASS/FAIL recommendation
Performance:
- Diff must not exceed 20%–40% of rebuild time budget
Safety:
- Diff report MUST NOT expose sensitive data as full text; only metadata/positions
Failure handling:
- If renderer mismatch suspected: enforce fixed render environment and report the deviation cause.
================================================================================
A15) GLOBAL SEARCH + RAG (ACL-GOVERNED) — ADDENDUM
================================================================================
A15.1 Search scope
- Query text + user context/role + scope (Docs/Objects)
A15.2 Outputs
- Ranked results + filters + (RAG) retrieved chunks for answering.
- JSON result format + valid resource URIs.
A15.3 Safety
- Search MUST obey ACL + field masking.
- RAG MUST prevent contextual leakage by applying policies to chunks before returning.
- Tests MUST include: permission tests + retrieval accuracy + prompt leak red-team prompts.
A15.4 Indexing constraint (mandatory)
- Full-text indexing MUST use PostgreSQL GIN.
- You MUST NOT require ElasticSearch or external search engines to be “core”.
================================================================================
A16) DASHBOARD ENGINE — “MISSING FEATURES” ADDENDUM
================================================================================
A16.1 Alerting & monitoring widgets (mandatory)
- Alert widgets
- Threshold alerts
- Anomaly alerts
- KPI tracking vs target
A16.2 Analytics UX (mandatory)
- Trend comparison
- Time intelligence
- Real-time update
- Event-based refresh
A16.3 Layout/performance UX (mandatory)
- Layout optimizer
- Executive mode
- Accessibility validation
- RTL responsive + Mobile responsive
- TV/Kiosk mode
- Embed link
- Role-based default dashboard
- Multi-dataset binding
- Lazy widget loading
================================================================================
A17) ELITE ARABIC PROFESSIONALIZATION — ADDENDUM
================================================================================
A17.1 Mandatory Arabic upgrades
- Executive Typography Engine.
- Advanced Kashida balancing.
- Domain lexicon registry per tenant.
- Financial Arabic conventions.
- Density parity enforcement.
- Directional deterministic equivalence validation (RTL must not break layout determinism).
A17.2 Strict Arabic rule
- Arabic Elite rendering overhead MUST be < 30% (target envelope).
- If overhead exceeds → fail profile compliance and produce optimization report.
================================================================================
A18) DESIGN QUALITY REINFORCEMENT LOOP — ADDENDUM (NON-STRICT ONLY)
================================================================================
A18.1 Mandatory loop (surpass Gamma-level)
- Generate candidate design.
- Compute:
  density, hierarchy entropy, alignment deviation, contrast ratio, visual tension.
- Auto-improve.
- Recompute.
- Select best version.
- If any score < 0.90 → auto-reset and repeat until pass or fail with explanation.
A18.2 Strict override
- STRICT_PIXEL_LOCK_FINAL MUST disable this loop entirely.
================================================================================
A19) CANVAS-FIRST UX — STRICT RULES (SIDEBAR / CONTEXT / DYNAMIC OPTIONS)
================================================================================
A19.1 Single canvas doctrine
- The user MUST operate inside one primary canvas.
- The system MUST NOT force navigation to multiple pages for core workflows.
- A sidebar MAY exist but MUST be hide/show and MUST never block canvas.
A19.2 Sidebar rules (mandatory)
- Sidebar default state MUST be collapsed on first load.
- Sidebar auto-expands ONLY when:
  (a) user explicitly opens it, OR
  (b) user drags a file near “library drop zone”, OR
  (c) user requests “show library/templates/history/settings”.
- Sidebar MUST support “pin” mode (user controlled).
- Sidebar MUST include (minimum):
  Library, Search, History/Lineage, Exports, Settings, Permissions/Sharing (if user has rights).
A19.3 Contextual options (mandatory)
- The canvas MUST show options based on:
  file type, detected content (table/chart/dashboard/slide), and current goal.
- Options MUST appear progressively:
  - Always show only the next 3–7 most relevant actions.
  - Reveal advanced options ONLY after user selects “Advanced/Pro”.
A19.4 Preview-first doctrine
- Every change MUST offer instant preview.
- Export MUST never occur before preview + final fidelity validation.
A19.5 “Smart Steps Panel” (M36) integration
- When user drops a file, system MUST generate:
  Goal-first recommended flow (3–6 steps), with clear approvals.
- No Dead-End Rule: if user cancels a step, system MUST propose alternative next action.
A19.6 Ultra-premium motion (deterministic)
- Animations MUST be deterministic and non-distracting.
- Motion physics MUST be consistent across sessions (no randomness).
- The system MUST display:
  progress micro-copy, delightful but minimal confirmations, and “what’s happening” hints,
  without introducing extra screens.
================================================================================
A20) “ENGINE CAPABILITY MAP” + AUDIT REPORTS (MANDATORY OUTPUTS)
================================================================================
A20.1 Engine capability map (mandatory artifact)
For EACH engine, you MUST produce:
- ENGINE NAME
- FILES
- METHODS
- APIS
- FEATURES IMPLEMENTED
A20.2 Cross-engine integration map (mandatory artifact)
- You MUST identify which engines communicate.
- You MUST list:
  service dependencies, shared modules, API calls between engines.
A20.3 Database models registry (mandatory artifact)
- You MUST list all DB models:
  model name, fields, relationships.
A20.4 TWO separate reports (mandatory)
REPORT 1 — TECHNICAL AUDIT REPORT (Arabic)
- # engines actual count
- implemented engines list
- # services
- # files
- # functions
- # APIs
- features fully implemented
- features partial
- features missing
- any placeholder code
- Every feature MUST reference:
  file path, method name, line number
REPORT 2 — PLATFORM FEATURE REPORT (Arabic)
- Summarize all platform capabilities clearly (product-level).
================================================================================
A21) MODULE BOUNDARIES + GOVERNANCE DOCUMENTATION RULE (MANDATORY)
================================================================================
For every module/feature, you MUST document in this exact structure:
1) Purpose
2) Architectural Role (Kernel / Module / Project layer)
3) Dependencies
4) Interaction with Action Engine
5) Interaction with Policy Engine
6) Events emitted and consumed
7) Configuration model
8) Activation model (feature toggle logic)
9) Extensibility model
10) Governance & risk considerations
11) Multi-tenant considerations
12) AI integration considerations (if applicable)
Boundary enforcement:
- Do not collapse modules into a monolith.
- No cross-module DB access.
- Database-per-module strictly enforced.
- All actions registered in Action Registry.
- All new events registered in Schema Registry.
- Deterministic doctrine preserved.
================================================================================
END OF APPENDICES PACK
================================================================================


---

<a id="sec-25"></a>
# README — حزمة مواصفات راصد (v2.2 — مصححة)
هذه الحزمة مبنية “بدون Placeholders” ومصححة:  
- تم استخراج **المواصفات النصية** من ملف المحادثة HTML عبر التقاط **بلوكات Markdown** التي تبدأ بعناوين المواصفات.
- تم منع أي تسرب لكود Python (مثل import os) داخل ملفات المواصفات.
- تم دمج المستندات العامة (Single Master Spec / Tool Registry / Traceability / Integrity …) من ملفات المنصة الموجودة في /mnt/data.

## الفهرس
- 00_مواصفات_عامة
- 01_محرك_المطابقة_الحرفية
- 02_محرك_العروض
- 03_محرك_الإكسل
- 04_محرك_لوحات_المؤشرات
- 05_محرك_التقارير
- 06_محرك_LCT
- 07_واجهة_الكامبوس
- 08_راصد_الذكي
- 09_ملاحق_مستخرجة_من_المرفقات
- 99_مرفقات_مرجعية_من_العميل

## ضمان الجودة داخل الحزمة
- يوجد فحص تلقائي يمنع وجود أسطر Python داخل ملفات المواصفات.
