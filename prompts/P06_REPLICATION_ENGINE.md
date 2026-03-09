# ⛔ P06 — محرك المطابقة الحرفية الهندسية الدقيقة ⛔
# ⛔ تنفيذ حرفي 1:1 — ممنوع تعديل أي مواصفة — ممنوع إضافة حرف أو حذف حرف ⛔

---

## أنت Claude Code — Autonomous Expert Engineer
**المسار:** `C:\DATA_AI\rasid` | **الخدمة:** `services/replication-service`
**البيئة:** 20/20 حاوية Docker | **الدخول:** admin / 1500

## ⛔ القانون المطلق
```
◆ لا mock — لا stub — لا TODO — لا Math.random() — لا بيانات وهمية
◆ كل وظيفة تُبنى → تُختبر بـ curl → تُثبت نجاحها → ثم تكمل
◆ إذا كان الكود موجوداً: اقرأه أولاً، أكمل ما ينقص فقط
◆ كل route: authMiddleware + tenantMiddleware إلزامي
◆ TypeScript strict — صفر errors
◆ ممنوع تعديل أي مواصفة — تنفيذ حرفي 1:1
◆ حدّث master_progress.json عند الانتهاء
◆ الخط: Tajawal — RTL — العربية
```

## ⛔ شرط ربط الصفحات — إلزامي
```
◆ كل مواصفة يجب أن تكون مرتبطة بصفحة واجهة مستخدم فعلية
◆ كل مواصفة يجب أن تُختبر فعلياً عبر الصفحة قبل التسليم
◆ الصفحة الرئيسية: /replication
```

---

# ═══════════════════════════════════════════════════════
# الجزء 1: المواصفات الحرفية من rasid — E06
# ═══════════════════════════════════════════════════════

# الوحدة E06 — المحرك السادس: محرك المطابقة الحرفية الهندسية الدقيقة
**الخدمة:** `services/replication-service` | **البنود الغير منفذة:** 60

## E06.01 — 6.1 المبدأ الأساسي
**(14 بند)**

- جميع محركات التحسين التلقائي تُعطل
- لا يُسمح بأي تحسين أو تجميل أو إعادة توزيع أو تقريب
- يتم إعادة بناء العلاقات الرياضية الأصلية بدقة هندسية
- المخرجات تُقبل فقط إذا بلغت درجة الدقة تسع وتسعين فاصلة تسعة من مئة
- إذا كانت الدقة أقل يُرفض التنفيذ ولا يوجد قبول جزئي
- منع تدهور الأداء وعدم كسر الحتمية وعدم خرق العزل
- تحكم دقيق تشغيلي لمنع تجاوز الموارد
- هيكل حوكمة هرمي واضح يمنع الفوضى
- تحديد سقف أعلى للموارد لكل Tenant
- نظام كشف الانحرافات المعمارية تلقائياً
- كشف الانحرافات البصرية تلقائياً
- المبدأ الأساسي
- تفعيل سياسات رؤية بيانات الأقسام عبر السحب والإفلات
- منافس لـ PowerPoint

## E06.02 — 6.3 مراحل المطابقة
**(10 بند)**

- تحديد الحدود فقط دون تفسير
- الإحداثيات المطلقة والأبعاد والطبقة والدوران والشفافية
- الحشو والهامش وارتفاع السطر وتباعد الأحرف
- حساب نسب الأعمدة والمسافات النسبية
- حساب نسبة المساحات البيضاء وتوزيع التباين
- الوضع الصارم اختياري ويخضع لسياسة الجهة
- مساعد وربط MCP
- وضع نسخ صارم مطابق رياضياً
- دعم وضع نسخ صارم مطابق رياضياً
- دعم وضع نسخ احترافي محسّن

## E06.03 — 6.4 مطابقة لوحات المؤشرات من صورة
**(3 بند)**

- الحفاظ على أبعاد حاويات العناصر ونفس الحشو
- إعادة ربط البيانات الحقيقية بالهيكل المستخرج
- تعطيل أي تجميل تلقائي للرسوم

## E06.04 — 6.5 قفل الطباعة
**(5 بند)**

- شرائح مقفلة لحماية المعلومات الأساسية وتحديثها مركزياً
- قفل الإحداثيات المطلقة للعناصر
- قفل هندسة الجداول المحورية
- قفل المعمارية والتكنولوجيا لضمان عدم الانحراف
- بوابة التحقق المزدوج

## E06.05 — 6.6 بوابة التحقق المزدوج
**(28 بند)**

- فحص فرق البكسل: الانحراف المسموح أقل من واحد على عشرة بالمئة
- فحص البصمة الهيكلية: التشابه يجب أن يبلغ تسع وتسعين فاصلة تسعة من ألف
- الفحصان إلزاميان معاً: نجاح أحدهما فقط غير كافٍ
- تحقق مزدوج: بكسل + بصمة هيكلية ≥ ‎0.999‎
- كشف أي اختلاف غير مقصود
- إعادة إنتاج بصري مطابق بنسبة شبه كاملة
- الحفاظ على الهوامش والمسافات
- الحفاظ على طبقات العناصر
- التحقق من عدم وجود فقد بيانات
- الحفاظ على بنية العناوين
- الحفاظ على نسب العرض والارتفاع
- إعادة إنتاج بصري مطابق بنسبة عالية
- إعادة إنتاج مطابق حرفياً 1:1 دون أي اختلاف بصري
- إعادة بناء رياضي للبنية الهيكلية للمستند
- انحراف بكسل لا يتجاوز ‎0.1%‎
- تطابق بصمة هيكلية ≥ ‎0.999‎
- تعطيل أي تحسينات تلقائية في الوضع الصارم
- الحفاظ على محاور لوحات المعلومات
- استنساخ القوالب الرئيسية للعروض التقديمية
- الحفاظ على هندسة SmartArt
- انحراف عددي لا يتجاوز ‎0.000001‎
- حفظ إحداثيات X/Y بشكل مطلق
- تعطيل أي إعادة توزيع أو تحسين
- انحراف عددي > ‎0.000001‎ مرفوض
- يحافظ على نفس geometry
- بوابة التحقق المزدوج
- الحفاظ على الروابط الداخلية
- تحديد مستوى النسخ المطابق لكل طلب



---


---

# ═══════════════════════════════════════════════════════
# الجزء 2: البنود الجزئية (EP) — منقولة حرفياً
# ═══════════════════════════════════════════════════════

## EP — المحرك السادس: محرك المطابقة الحرفية الهندسية الدقيقة (2 بند)

### 6.2 نطاق المطابقة

- ملفات Excel: إعادة إنتاج بدقة البكسل

### 6.6 بوابة التحقق المزدوج

- الحفاظ على هندسة أوراق Excel



---

# ═══════════════════════════════════════════════════════
# الجزء 3: مواصفات التطابق الحرفي — منقولة حرفياً من المرفق
# ═══════════════════════════════════════════════════════

مواصفات التطابق الحرفي

Canonical Design Representation (CDR) engine with full 7-layer structural model  
Absolute coordinate layout system (no auto-reflow)  
Layout graph reconstruction engine  
Constraint matrix preservation engine  
Structural hash generator  
Perceptual hash generator  
Pixel diff engine (sub-pixel precision ≤ 0.1%)  
Density distribution analyzer  
Hierarchy weight analyzer  
Typography metric extractor (font family, size, weight, kerning, line-height, letter-spacing)  
Font embedding system (full glyph embedding)  
Glyph vectorization fallback engine  
Baseline alignment preservation  
Grid detection and reconstruction engine  
Axis scaling inference engine  
Chart type detection engine  
Tick interval preservation logic  
Legend offset preservation logic  
Color mapping extraction engine  
Opacity and shadow vector preservation  
Border radius and stroke width preservation  
Z-index layer preservation  
Rotation and transform matrix preservation  
Image DPI normalization engine  
Raster-to-vector inference (where applicable)  
SmartArt geometry reconstruction engine  
Pivot table geometry preservation  
Conditional formatting rule extraction and recreation  
Freeze pane preservation logic  
Column pixel-width preservation  
Row height preservation  
Merged cell geometry preservation  
Formula dependency DAG preservation  
Numeric precision enforcement ≤ 0.000001 deviation  
Spreadsheet recalculation determinism engine  
Spreadsheet virtual machine (SVM)  
Canonical unit normalization system  
RTL/LTR layout mirroring math engine  
Directional Deterministic Equivalence validator  
Whitespace ratio preservation logic  
Spacing ratio preservation engine  
Element count preservation validator  
Component bounding-box extractor  
Sub-pixel rendering precision support  
Rendering determinism validator  
Build determinism enforcement  
Environment-independent rendering engine  
GPU vs CPU rendering parity validation  
Layout entropy comparison engine  
Visual drift detection engine  
High-resolution bitmap parser  
Vector asset extractor  
SVG structural reconstruction  
PDF object model extractor  
DOCX layout object extractor  
PPTX slide master extractor  
HTML DOM structural extractor  
Universal Structural Equivalence (USE) engine  
Reverse visual engineering pipeline  
Constraint solver for reconstructed layouts  
Layout snapping disable switch (STRICT mode)  
Auto-spacing disable switch (STRICT mode)  
Auto-hierarchy rebalance disable switch (STRICT mode)  
Beautification engine isolation switch  
STRICT mode dual verification gate  
Threshold enforcement engine (hard reject below limits)  
Layout graph serialization engine  
CDR-to-any-format transformation engine  
Multi-format export fidelity validator  
Rendering regression test harness  
Structural regression test suite  
Pixel regression test suite  
Cross-format round-trip validation engine  
Font fallback prohibition rule  
Deterministic random seed enforcement  
Floating-point normalization policy  
Memory-stable rendering pipeline  
Color space consistency enforcement (sRGB lock)  
Resolution normalization logic  
High DPI scaling control  
Anti-aliasing consistency policy  
Chart data-binding preservation engine  
Live data re-binding validator  
Immutable layout lock flag  
Versioned CDR snapshots  
Fidelity scoring engine (structural + pixel + density + hierarchy)  
Automated rejection on threshold breach  
Audit log binding for strict renders  
Event emission on render completion  
No cross-module mutation guarantee  
Isolation of strict engine within dedicated processing cluster  
Performance envelope validator under STRICT mode  
Stress-test suite for 10K concurrent strict renders  
Any-to-any format transformation validation matrix  
Image-to-dashboard reconstruction validator  
Screenshot-to-PPT reconstruction validator  
PDF-to-BI reconstruction validator  
Excel-to-dashboard reconstruction validator  
Dashboard-to-PPT reconstruction validator  
Font metric parity validator  
Kerning table preservation  
Line-height ratio preservation  
Text wrapping equivalence logic  
Clipping and overflow rule preservation  
Container padding ratio preservation  
Margin ratio preservation  
Nested layout hierarchy preservation  
Composite element grouping preservation  
Layout hash equality enforcement  
Deterministic build artifact hash equality  
Zero runtime mutation policy for strict rendering  
Hard failure on fidelity breach policy



ADDENDUM — FUNCTIONAL STRICT 1:1 REPLICATION (STRUCTURE → LIVE SYSTEM)

Strict Replication is NOT image-to-image copying.

Strict Replication SHALL mean:

Image → Fully Functional Dashboard  
Image → Fully Functional Presentation  
Image → Fully Functional Word Report  
Image → Fully Functional Excel Model  
Image → Fully Functional Structured Artifact  

The goal is Structural Functional Equivalence, not bitmap duplication.

---

MANDATORY FUNCTIONAL REQUIREMENTS

Structural layout reconstructed as editable layout graph  
All detected visual elements converted to live components  
All detected charts converted to data-bound charts  
All detected KPIs converted to live metric objects  
All detected tables converted to structured datasets  
All detected filters converted to functional filter components  
All detected legends converted to interactive legend controls  
All detected drill indicators converted to real drill-down logic  
All detected grouping converted to layout container hierarchy  

Data binding engine must allow:

Placeholder data → Real dataset mapping  
Auto schema suggestion  
Column matching inference  
Measure detection inference  
Aggregation logic preservation  
Time intelligence auto-detection  
KPI recalculation with new data  

Dashboard Reconstruction must produce:

Interactive filtering  
Cross-filter behavior  
Drill-down capability  
Export capability  
Live refresh capability  
Permission-aware rendering  

Presentation Reconstruction must produce:

Editable slides  
Master slide mapping  
Live chart binding  
Editable text fields  
Structured layout zones  
Slide-level theme mapping  
Dynamic data refresh  

Report Reconstruction must produce:

Editable multi-page layout  
Structured sections  
Table-of-contents generation  
Data binding for tables  
Live recalculation support  
Export-ready compliance  

Excel Reconstruction must produce:

Structured sheets  
Editable formulas  
Dependency graph preserved  
Pivot tables recreated  
Conditional formatting recreated  
Live recalculation enabled  

---

PROFESSIONAL ENGINE REQUIREMENTS (APPLIES TO EVERY ENGINE)

Professional Layout Engine must include:

Constraint-based layout system  
Grid precision engine  
Typography metric engine  
Visual density analyzer  
Hierarchy scoring engine  
White-space analyzer  
Accessibility compliance validator  
Color contrast validator  
Responsive logic (if enabled)  
Strict mode override capability  

Professional Data Engine must include:

Semantic layer binding  
Metric registry enforcement  
Aggregation validation  
Data type enforcement  
Unit normalization  
Null handling policy  
Precision enforcement  
Query optimization layer  
Pre-aggregation support  
Scalable streaming support  

Professional Chart Engine must include:

Declarative chart specification  
Axis scale validation  
Tick interval preservation  
Legend logic  
Color mapping consistency  
Tooltip logic  
Drill support  
Export consistency  
RTL axis inversion support  
Density validation  

Professional Typography Engine must include:

Font metric enforcement  
Kerning preservation  
Line-height ratio preservation  
Text wrapping equivalence  
Baseline alignment enforcement  
RTL shaping logic  
Glyph integrity validation  

Professional Rendering Engine must include:

Deterministic rendering  
Cross-format fidelity validation  
Layout hash validation  
Structural hash validation  
Pixel threshold validation  
Export parity validation  

Professional Interaction Engine must include:

Drag-based layout editing  
Component-level locking  
Undo/redo deterministic stack  
Permission validation  
Preview-before-apply  
Event emission on change  

Professional Validation Engine must include:

Structural equivalence scoring  
Density deviation scoring  
Hierarchy preservation scoring  
Component integrity validation  
Data-binding verification  
Cross-format regression testing  

---

FUNCTIONAL EQUIVALENCE MANDATE

If a source image represents:

A dashboard → result MUST be a live dashboard  
A slide → result MUST be editable presentation  
A report → result MUST be editable report  
A spreadsheet → result MUST be structured workbook  

No output may remain a static image.

All reconstructed artifacts must be:

Editable  
Data-bindable  
Interactive  
Permission-aware  
Exportable  
Versionable  
Governed  

Strict Replication success is defined as:

Functional parity + Structural parity + Data-binding capability

Failure to provide functional parity is considered incomplete implementation.

---

END OF ADDENDUM




---

# ═══════════════════════════════════════════════════════
# الجزء 4: Autonomous Intelligence Platform — Visual Replication
# ═══════════════════════════════════════════════════════

## 7. Visual Replication Engine

### Inputs
- Images
- Dashboards
- PDF
- PowerPoint

### Capabilities
- Layout detection
- Chart detection
- Text extraction
- Structural fingerprint
- Pixel comparison

Accuracy requirements:
Pixel difference ≤ 0.1%
Structural similarity ≥ 0.999

---

## 8. AI Insight Engine

---

## ⛔ شرط التسليم: كل بند منفذ + مرتبط بصفحة + مُختبر فعلياً عبر الصفحة ⛔
## ⛔ لا TODO — لا mock — لا placeholder — ابدأ التنفيذ الآن ⛔
