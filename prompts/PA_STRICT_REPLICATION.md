# ⛔ PA — دستور المطابقة الحرفية والمعمارية الصارمة ⛔
# ⛔ تنفيذ حرفي 1:1 — كل سطر = متطلب إلزامي ⛔

---

## أنت Claude Code — Autonomous Expert Engineer
**المسار:** `C:\DATA_AI\rasid`
**البيئة:** 20/20 حاوية Docker | **الدخول:** admin / 1500

## ⛔ القانون المطلق
```
◆ لا mock — لا stub — لا TODO — لا Math.random() — لا بيانات وهمية
◆ كل وظيفة تُبنى → تُختبر بـ curl → تُثبت نجاحها → ثم تكمل
◆ إذا كان الكود موجوداً: اقرأه أولاً، أكمل ما ينقص فقط
◆ كل route: authMiddleware + tenantMiddleware إلزامي
◆ TypeScript strict — صفر errors
◆ ممنوع تعديل أي مواصفة — تنفيذ حرفي 1:1
◆ كل مواصفة مرتبطة بصفحة واجهة مستخدم ومختبرة فعلياً
◆ الخط: Tajawal — RTL — العربية
```

## TOKEN
```bash
TOKEN=$(curl -s -X POST http://localhost/api/v1/governance/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin","password":"1500"}' | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken',''))")
```

---

# ═══════════════════════════════════════════════════════
# الجزء 1: مواصفات التطابق الحرفي — منقول حرفياً من الملف
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
# الجزء 2: Strict Replication Architecture — منقول حرفياً
# ═══════════════════════════════════════════════════════

TXD-STRICT-001:
When strict_replication=true,
all adaptive engines are disabled.
Only mathematical reconstruction allowed.

Pixel-Locked Rendering:
- كل عنصر يُخزن بإحداثيات مطلقة
- لا rounding
- لا snapping
- لا auto spacing
- لا design refinement loop
- لا تحسين density
- لا تحسين hierarchy
- كل شيء يجب أن يعاد بناءه كما هو

Mathematical Layout Fingerprint:
- نسبة المسافة بين كل عنصرين
- نسبة الخط إلى العرض
- نسبة padding إلى container
- نسبة المحاذاة إلى الصفحة
- علاقة كل عنصر بجاره
- LayoutGraphHash
- SpatialConstraintMatrix
- TypographyRatioMatrix
- أي اختلاف في أي معادلة → إعادة البناء

Hard Fidelity Gate:
If visual_diff_score < 0.999 → render rejected
ليس 0.95 — ليس 0.98 — بل 0.999+

7 طبقات Strict Replication:
- Visual Capture Layer
- Structural Reconstruction Engine
- Mathematical Layout Graph Engine
- Constraint Matrix Generator
- Deterministic Renderer
- Dual Fidelity Verification Engine
- Binary Output Lock

Visual Capture Layer:
A) Pixel Matrix Extraction: استخراج خريطة RGB كاملة، تخزينها بدقة 1px، إنشاء Pixel Hash
B) Edge & Boundary Detection: كشف bounding boxes، كشف خطوط grid، كشف alignment edges
C) Element Segmentation: فصل نص/صورة/أيقونة/جدول/رسم بياني/شكل — لا يتم تفسيرها فقط تحديد حدودها

Structural Reconstruction Engine:
لكل عنصر يتم تسجيل: X absolute position، Y absolute position، Width، Height، Z-index، Rotation، Opacity، Border width، Border radius، Shadow vector، Padding، Margin، Line height، Letter spacing، Font weight، Font size ratio to container
SpatialConstraintMatrix: مصفوفة رياضية تمثل العلاقات بين جميع العناصر
أي فرق لاحق = فشل

Absolute Coordinate CDR Mode:
CDR.layout_mode = ABSOLUTE_LOCKED
لا Grid adaptive — لا auto reflow — لا flex — لا constraint solving — لا responsive behavior

Typography Lock System:
Font exact match — Kerning preservation — Baseline preservation — Line-height preservation — Glyph shaping identical
إذا لم يتوفر نفس الخط: تحميل الخط الأصلي أو استخراج glyph outlines أو تحويل النص إلى vector path
لا يسمح بتبديل font مشابه

Dashboard Strict Reconstruction:
Chart Type Recognition — Axis Mapping Extraction — Data Point Estimation — Gridline Position Capture — Label Position Lock
نفس الأبعاد — نفس padding — نفس tick spacing — نفس bar width ratio — نفس legend alignment
لا يتم تحسين شكل الرسم

RTL Transformation في Strict Mode:
Mirror transformation رياضي — Recalculate X positions — Preserve relative spacing ratios — Preserve visual density — Preserve alignment symmetry
لا يسمح بإعادة توزيع

Deterministic Rendering Engine:
كل Render ينتج: Layout Fingerprint Hash، Pixel Hash، Typography Hash، Constraint Hash
ثم يتم مقارنته بـ Original Fingerprint

Dual Fidelity Verification:
1) Pixel Diff: Allowed difference ≤ 0.1%
2) Perceptual Structural Hash: يجب أن يكون ≥ 0.999
يقارن: توزيع الكتل، التباين، العلاقات البصرية، توزيع البياض

Binary Output Lock:
Output.status = LOCKED — Output.hash = Immutable
أي تعديل لاحق يعيد حساب كل البصمات

Definition of 1:1:
1:1 = PixelDiff == 0 عند تصيير الأصل والناتج في نفس Docker image، نفس DPI، نفس fonts، نفس renderer

Acceptance Gate:
لا يتم إرجاع نتيجة نجاح إلا عند تحقق PixelDiff==0. وإلا تعتبر فشل مع تقرير أسباب

Renderer Lock:
ثبّت بيئة التصيير (Docker) + احظر اختلافات OS/Fonts

Asset Policy:
إذا لم تتوفر fonts/icons/logos: يجب طلبها أو اعتبار 1:1 غير قابل للتحقق من raster فقط

Chart Policy:
لـ1:1: المخططات تُنتج كصورة/Vector مطابق، وليس إعادة رسم بمحرك مختلف

Localization Definition:
للتعريب: معيار القبول هو Layout-perfect + RTL correctness + No overflow، وليس Pixel-perfect

# ═══════════════════════════════════════════════════════
# الجزء 3: ANNEX F — Strict Replication Constitution — منقول حرفياً
# ═══════════════════════════════════════════════════════

ANNEX F — Strict Replication, Professional Arabic Localization & Advanced Presentation Empowerment Constitution
Classification: CONSTITUTIONAL EXTENSION
Authority Level: Equal to Part 10–21
Scope: Tier X + Presentation Engine v6
Status: EXECUTION-MANDATORY

F.1 STRICT REPLICATION CONSTITUTION (SRC)

SRC-001: The platform SHALL support execution_mode = STRICT_REPLICATION
SRC-002: When STRICT_REPLICATION is enabled, mathematical structural reconstruction only. No optimization permitted.
SRC-003: Output valid ONLY if fidelity score ≥ 0.999 across dual verification (pixel + structural).
SRC-004: If fidelity < 0.999, rendering rejected. Partial acceptance FORBIDDEN.
SRC-005: CDR.layout_mode = ABSOLUTE_LOCKED
SRC-006: All elements preserve: Absolute X/Y, exact width/height, exact margin/padding, Z-index, border radius, shadow vectors, opacity, rotation, line height, letter spacing, kerning pairs, baseline alignment.
SRC-007: Grid reflow, flex adaptation, constraint solving, density balancing, hierarchy re-ranking FORBIDDEN.
SRC-008: No rounding beyond 0.1px precision.
SRC-009: Dashboard reconstruction preserves: Widget container dimensions, KPI block alignment, Chart axis positioning, Gridline spacing, Tick interval distance, Legend offset, Bar width ratios, Pie slice start angle, Color mapping index order, Tooltip anchor position.
SRC-010: Chart reconstruction mathematically derived, not visually approximated.
SRC-011: Auto-chart beautification disabled in STRICT_REPLICATION.
SRC-012: XLSX replication preserves: Column widths (exact pixel), Row heights, Merged cell spans, Formula integrity, Named ranges, Conditional formatting rules, Cell padding, Border thickness, Freeze pane coordinates, Chart anchor offsets, Pivot layout geometry.
SRC-013: Formula recalculation matches source evaluation order and precision.
SRC-014: Numeric precision deviation beyond 0.000001 FORBIDDEN.
SRC-015: PPTX replication: Slide master cloned exactly, Theme mapping identical, Transition timing preserved, Animation trigger offsets preserved, Layer stacking unchanged, Text box auto-resize disabled, Slide aspect ratio identical.
SRC-016: Speaker notes preserved verbatim.
SRC-017: SmartArt reconstruction preserves node geometry and connector routing.
SRC-018: Font substitution FORBIDDEN in STRICT_REPLICATION.
SRC-019: If font unavailable: embed it, or vectorize glyph outlines. No fallback.
SRC-020: Kerning tables preserved.
SRC-021: RTL shaping preserves joining behavior identical to original glyph shaping.
SRC-022: Every output passes: Pixel Difference ≤ 0.1% AND Structural Hash ≥ 0.999.
SRC-023: Both tests mandatory. Passing one is insufficient.

F.2 PROFESSIONAL ARABIC LOCALIZATION CONSTITUTION (PALC)

PALC-001: Translation NOT literal unless explicitly requested.
PALC-002: Translation applies domain-aware semantic mapping.
PALC-003: Business terminology follows Modern Standard Arabic professional conventions.
PALC-004: Technical terms maintain internationally recognized terminology when culturally appropriate.
PALC-005: Tone adaptation follows professional Arabic communication standards.
PALC-006: Layout mirroring preserves proportional spacing ratios.
PALC-007: Axis inversion preserves visual tension balance.
PALC-008: KPI emphasis hierarchy remains visually equivalent post-transformation.
PALC-009: Grid mirroring recalculates relative constraints, not approximate.
PALC-010: Icon mirroring follows directional registry rules.
PALC-011: Arabic justification uses Kashida extension where typographically appropriate.
PALC-012: Baseline grid remains consistent across mixed LTR/RTL text.
PALC-013: Numeral system follows locale profile (Eastern/Western).
PALC-014: Line height recalculated per script density.
PALC-015: Ligature preservation mandatory.
PALC-016: Arabic output passes: Linguistic accuracy ≥ 0.98, Typography integrity ≥ 0.95, Visual hierarchy preservation ≥ 0.95, Cultural formatting correctness 100%. Failure triggers regeneration.

F.3 ADVANCED INFOGRAPHIC & PRESENTATION CREATOR EMPOWERMENT (AIPCE)

AIPCE-001: System provides: Hierarchy visual tuning panel, Density heatmap overlay, White-space analyzer, Emphasis mapping controls, Color harmony suggestions, Narrative flow graph.
AIPCE-002: User can: Drag-adjust hierarchy weight, Lock grid segments, Override AI layout decisions, Modify spacing mathematically, Snap to design ratios (Golden ratio, modular grid).
AIPCE-003: User editing does NOT degrade layout determinism.
AIPCE-004: Each manual change recomputes structural fingerprint.
AIPCE-005: Undo history non-destructive and branch-capable.
AIPCE-006: Template abstraction allows: Component isolation, Section cloning, Constraint inheritance, Cross-document synchronization.
AIPCE-007: AI assists but not overrides unless confirmed.
AIPCE-008: Suggestion confidence scores visible.
AIPCE-009: Users toggle: Strict mode, Professional mode, Hybrid mode.
AIPCE-010: Gamma-equivalent rapid generation: One-click outline → slides, One-click data → infographic, One-click PDF → editable presentation.
AIPCE-011: Generated output passes internal aesthetic scoring ≥ 0.90.

F.4 Composite Operating Modes:
STRICT_REPLICATION: Optimization Disabled, Strictness Absolute, Use Case 1:1 forensic replication
PROFESSIONAL_CREATION: Optimization Controlled, Strictness High, Use Case Premium creation
HYBRID: Optimization Partial, Strictness Balanced, Use Case Editable replication

F.5 Constitutional Enforcement:
F-ENF-001: STRICT_REPLICATION overrides all adaptive engines.
F-ENF-002: Professional Arabic mode overrides generic translation engines.
F-ENF-003: Infographic AI never degrades structural determinism.
F-ENF-004: No feature bypasses dual fidelity gates.

F.6 Final Mandate:
Mathematical 1:1 replication of dashboards, Excel files, presentations, PDFs, and images.
Professional Arabic localization exceeding directional mirroring.
Presentation creation and infographic editing exceeding Gamma-level.
Deterministic fidelity enforcement preventing approximate outputs.
Deviation requires Constitutional Amendment.

---

## ⛔ شرط التسليم: كل بند منفذ + مرتبط بصفحة + مُختبر فعلياً ⛔
## ⛔ ابدأ التنفيذ الآن ⛔
