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
```
