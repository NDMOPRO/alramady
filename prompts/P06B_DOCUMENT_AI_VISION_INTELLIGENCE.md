# ⛔ P06-B — برومت مكمّل: Document AI + Vision Intelligence + التفريغ الاحترافي ⛔
# يعمل بالتكامل مع P06 (محرك المطابقة الحرفية) — لا تعارض
# الخدمة: services/replication-service (توسيع) + services/data-service (توسيع) + services/ai-service (توسيع)
# ⛔ تنفيذ حرفي — ترقية الخدمات الحالية — ليس نظام جديد ⛔

---

## الهوية والسياق

```
أنت Claude Code — Autonomous Expert Engineer
هذه ترقية للخدمات الحالية في المنصة — وليس بناء نظام جديد منفصل.

المنصة تحتوي بالفعل على خدمات تعمل في:
- تحليل البيانات
- إنشاء التقارير
- إنشاء الداشبورد
- التعامل مع ملفات Excel
- توليد العروض التقديمية
- بعض قدرات OCR
- بعض قدرات الترجمة

المطلوب: ترقية هذه الخدمات الحالية ورفع مستواها إلى أقصى مستوى احترافي
عبر تحسين المكونات الموجودة ودمج القدرات المتقدمة داخلها.

ممنوع إنشاء نظام منفصل أو إعادة بناء المنصة خارج بنيتها الحالية.
```

---

## ⛔ القانون المطلق — نفس قوانين P06

```
◆ لا mock — لا stub — لا TODO — لا Math.random() — لا بيانات وهمية
◆ كل وظيفة تُبنى → تُختبر بـ curl فعلياً → تُثبت نجاحها
◆ إذا كان الكود موجوداً: اقرأه أولاً، أكمل ما ينقص فقط
◆ كل route جديد: authMiddleware + tenantMiddleware إلزامي
◆ TypeScript strict — صفر errors
◆ ممنوع تعديل أي مواصفة — تنفيذ حرفي 1:1
◆ جميع التحسينات = امتداد للخدمات الموجودة وليس نظام منفصل
```

---

## العلاقة مع P06

```
P06 يُنفّذ: محرك المطابقة الحرفية الهندسية + CDR + STRICT Mode + الدستور SRC/PALC/AIPCE
P06-B يُنفّذ: طبقات الذكاء البصري + Document AI + التفريغ الاحترافي + نماذج AI المتقدمة

P06-B يغذّي P06 بـ:
- بيانات التحليل البصري المستخرجة
- بنية الوثائق المُكتشفة
- نتائج OCR المُصححة
- الجداول والرسوم المُستخرجة

P06 يستهلك مخرجات P06-B عبر Canonical IR ويُنتج الملفات النهائية.
```

---

# ╔═══════════════════════════════════════════════════════════════════╗
# ║ القسم 1: البنية المعمارية الأساسية — Document Intelligence     ║
# ║ تنفيذ حرفي لكل بند                                              ║
# ╚═══════════════════════════════════════════════════════════════════╝

## ARCH-B.01 — Document Intelligence Architecture

نفّذ حرفياً كترقية للخدمات الحالية:

```
Pipeline أساسي:

Document/Image/PDF
↓
Document Classification
↓
Layout Detection
↓
Region Segmentation
↓
OCR Engine
↓
Structure Reconstruction
↓
Semantic Understanding
↓
Output Reconstruction
```

**ملف:** `src/replication/document-ai/pipeline.ts`
Route: `POST /api/v1/replication/document-ai/process`

---

## ARCH-B.02 — Canonical Intermediate Representation

نفّذ حرفياً:

```
- Canonical Intermediate Representation (IR)
- Canonical Layout Graph (CLG)
- Scene Graph Engine
- Design Token Extraction Engine
- Constraint-based Layout Engine
- Deterministic Rendering Engine
- Closed-loop Optimization Pipeline
- Pixel Matching Engine
- Artifact Generation Engine
- Multimodal AI Pipeline
- Document Intelligence Architecture
- Localization Architecture
- Translation Intelligence Architecture
- Structured Data Pipeline
- Distributed Processing Architecture
- GPU Accelerated Inference Infrastructure
```

**ملفات:**
- `src/replication/document-ai/canonical-ir.ts`
- `src/replication/document-ai/canonical-layout-graph.ts`
- `src/replication/document-ai/scene-graph-engine.ts`
- `src/replication/document-ai/design-token-engine.ts`

---

# ╔═══════════════════════════════════════════════════════════════════╗
# ║ القسم 2: الذكاء البصري وتحليل الصور                            ║
# ╚═══════════════════════════════════════════════════════════════════╝

## VISION.01 — نماذج الذكاء البصري

نفّذ/ادمج حرفياً:

```
- Vision Transformers
- Convolutional Neural Networks
- Detectron2
- YOLO Document Models
- SAM Segmentation Models
- DiT (Document Image Transformer)
- Region Proposal Networks
- Semantic Segmentation
- Hierarchical Layout Parsing
- Spatial Layout Graph Modeling
- Reading Order Detection
- Subpixel Spatial Measurement
- Grid Detection Algorithms
- Symmetry Detection
- Edge Detection Algorithms
- Color Space Analysis (LAB / RGB)
- Gradient Detection Algorithms
- Shadow Detection Algorithms
- Transparency Detection
```

**ملف:** `src/replication/vision/vision-intelligence-engine.ts`
Route: `POST /api/v1/replication/vision/analyze`

---

## VISION.02 — تحليل تخطيط الوثائق

```
Layout Detection Networks:
- Detectron2
- LayoutLMv3
- DiT (Document Image Transformer)
- YOLOv8 document models

Hierarchical Layout Parsing:
- Page → Section → Container → Element
```

العناصر التي يجب اكتشافها:

```
- العناوين
- الفقرات
- الجداول
- الرسوم البيانية
- الصور
- الحواشي
- الهوامش
- القوائم
- الصناديق النصية
```

**ملف:** `src/replication/vision/layout-detection-engine.ts`

---

## VISION.03 — تقسيم الصفحة

```
تقنيات:
- Region proposal networks
- Graph segmentation
- Semantic segmentation

تقسيم الصفحة إلى:
- blocks
- columns
- sections
- containers
- paragraphs
```

**ملف:** `src/replication/vision/page-segmenter.ts`

---

## VISION.04 — تحليل واجهات المستخدم ولوحات التحكم

```
نماذج:
- Pix2Code
- Screen2Vec
- UIBERT
- DETR UI models

استخراج:
- Cards
- Filters
- Dropdowns
- KPI blocks
- Tables
- Charts
- Interactive elements
```

**ملف:** `src/replication/vision/ui-understanding-engine.ts`

---

## VISION.05 — اكتشاف الألوان والأنماط

```
- Palette extraction
- Gradient detection
- Shadow detection
- Border style detection
- Transparency detection

خوارزميات:
- K-means color clustering
- LAB color space analysis
- Edge-based gradient detection
```

**ملف:** `src/replication/vision/color-style-extractor.ts`

---

## VISION.06 — اكتشاف الخطوط بدقة

```
- Font recognition models
- Font embedding matching
- Neural font similarity models
- Glyph matching engines
- Font metric extraction

تقنيات:
- FontNet
- DeepFont
- Glyph CNN models
```

**ملف:** `src/replication/vision/font-recognition-engine.ts`

---

## VISION.07 — استخراج الأيقونات والعناصر الرسومية

```
- Icon Detection Models
- Shape Detection Algorithms
- Vector Reconstruction
- SVG Generation

خوارزميات:
- Potrace
- DiffVG
- VectorNet
- DeepSVG
- Im2Vec
- Vectorization pipelines
```

**ملف:** `src/replication/vision/icon-vector-reconstructor.ts`

---

## VISION.08 — نماذج الذكاء الاصطناعي متعددة الوسائط

```
نماذج ضرورية:
- Vision Transformers
- Diffusion vision models
- LayoutLM family
- SAM segmentation
```

**ملف:** `src/replication/vision/multimodal-engine.ts`

---

# ╔═══════════════════════════════════════════════════════════════════╗
# ║ القسم 3: OCR فائق الدقة — عربي وإنجليزي                        ║
# ╚═══════════════════════════════════════════════════════════════════╝

## OCR.01 — محرك OCR الأساسي

ترقية خدمة OCR الحالية بـ:

```
أفضل النماذج:
- TrOCR
- Donut OCR
- PaddleOCR advanced
- Microsoft OCR models
- Google Vision OCR

يدعم:
- Arabic OCR
- English OCR
- Mixed-language OCR
```

**ملف:** `src/replication/ocr/ocr-engine.ts` (ترقية الموجود)
Route: `POST /api/v1/replication/ocr/extract`

---

## OCR.02 — قدرات OCR المتقدمة

```
استخراج:
- Character bounding boxes
- Line segmentation
- Word segmentation
- Baseline detection
- Font size estimation
- Font weight estimation
- Kerning detection
- Character spacing detection
- Reading order
```

---

## OCR.03 — دعم العربية الاحترافي في OCR

```
معالجة:
- Arabic shaping
- ligatures
- diacritics
- Kashida detection
- RTL reading order

محركات دعم:
- ICU
- HarfBuzz
```

**ملف:** `src/replication/ocr/arabic-ocr-engine.ts`

---

## OCR.04 — تصحيح أخطاء OCR

```
تقنيات:
- Language model correction
- contextual correction
- spelling correction
- grammar correction

نماذج:
- Transformer language models
- BERT correction models
```

**ملف:** `src/replication/ocr/ocr-error-corrector.ts`

---

## OCR.05 — اكتشاف ترتيب القراءة

```
نماذج:
- Graph neural networks
- layout traversal algorithms
```

**ملف:** `src/replication/ocr/reading-order-detector.ts`

---

## OCR.06 — دعم اللغات المختلطة

```
اكتشاف:
- language switching
- bilingual lines
```

---

## OCR.07 — تقييم دقة OCR

```
مقاييس:
- Character Error Rate (CER)
- Word Error Rate (WER)
```

---

# ╔═══════════════════════════════════════════════════════════════════╗
# ║ القسم 4: تحسين جودة الصور قبل التحليل                          ║
# ╚═══════════════════════════════════════════════════════════════════╝

## IMG.01 — معالجة الصور

```
تقنيات:
- super resolution (ESRGAN, SwinIR)
- denoising
- deblurring
- contrast enhancement
- adaptive thresholding
- bilateral filtering
```

**ملف:** `src/replication/preprocessing/image-enhancer.ts`

---

## IMG.02 — تصحيح الانحراف

```
تقنيات:
- Hough transform
- geometric correction
```

**ملف:** `src/replication/preprocessing/deskew-engine.ts`

---

## IMG.03 — إزالة التشويش

```
تقنيات:
- adaptive thresholding
- bilateral filtering
```

---

## IMG.04 — استعادة النصوص المخفية

```
نماذج:
- inpainting models
- text recovery models
```

**ملف:** `src/replication/preprocessing/text-restoration-engine.ts`

---

# ╔═══════════════════════════════════════════════════════════════════╗
# ║ القسم 5: استخراج الجداول الاحترافي                              ║
# ╚═══════════════════════════════════════════════════════════════════╝

## TABLE.01 — محرك استخراج الجداول

ترقية خدمة Excel الحالية بـ:

```
نماذج:
- Table Transformer (TATR)
- DeepDeSRT
- PubTables
- Graph-based table parsing

استخراج:
- cell merge
- borders
- alignment
- cell padding
- background color
- formulas
- header hierarchy
```

**ملف:** `src/replication/tables/table-intelligence-engine.ts`
Route: `POST /api/v1/replication/tables/extract`

---

## TABLE.02 — الجداول المالية

```
دعم:
- currency
- totals
- subtotals
- formulas
```

---

# ╔═══════════════════════════════════════════════════════════════════╗
# ║ القسم 6: تحليل الرسوم البيانية                                  ║
# ╚═══════════════════════════════════════════════════════════════════╝

## CHART.01 — محرك فهم الرسوم البيانية

ترقية خدمة Dashboard الحالية بـ:

```
النماذج المستخدمة:
- ChartOCR
- ChartQA
- PlotQA
- DeepChart
- ChartReader

يجب استخراج:
- نوع المخطط
- محاور X و Y
- السلاسل
- الألوان
- القيم الرقمية
- gridlines
- legend
- axis scaling
- tick marks
```

**ملف:** `src/replication/charts/chart-intelligence-engine.ts`
Route: `POST /api/v1/replication/charts/extract`

---

# ╔═══════════════════════════════════════════════════════════════════╗
# ║ القسم 7: استخراج النماذج والقوائم والمعادلات                    ║
# ╚═══════════════════════════════════════════════════════════════════╝

## FORM.01 — استخراج النماذج

```
نماذج:
- Donut Form Parser
- LayoutLM forms

استخراج:
- labels
- values
- checkboxes
- radio buttons
- signatures
```

**ملف:** `src/replication/forms/form-understanding-engine.ts`

---

## LIST.01 — استخراج القوائم

```
كشف:
- bullet lists
- numbered lists
- nested lists
```

---

## MATH.01 — استخراج المعادلات

```
نماذج:
- MathPix
- LaTeX OCR models

المخرجات:
- LaTeX
- MathML
```

**ملف:** `src/replication/math/math-ocr-engine.ts`

---

# ╔═══════════════════════════════════════════════════════════════════╗
# ║ القسم 8: دعم PDF الذكي                                          ║
# ╚═══════════════════════════════════════════════════════════════════╝

## PDF.01 — معالجة PDF

```
أنواع PDF المدعومة:
- searchable PDF
- scanned PDF
- hybrid PDF

يجب دعم الثلاثة.
```

---

## PDF.02 — استخراج طبقات PDF

```
استخراج:
- text layer
- vector graphics
- images
- annotations
- embedded fonts
- font metrics
- glyph mapping
```

**ملف:** `src/replication/pdf/pdf-intelligence-engine.ts`
Route: `POST /api/v1/replication/pdf/extract`

---

# ╔═══════════════════════════════════════════════════════════════════╗
# ║ القسم 9: الفهم الدلالي للوثائق                                  ║
# ╚═══════════════════════════════════════════════════════════════════╝

## SEMANTIC.01 — فهم الوثائق دلالياً

```
نماذج:
- LayoutLM semantic
- BERT document models

تحليل:
- الكيانات (Named Entity Recognition)
- التواريخ
- الأرقام
- العناوين
- Semantic Embedding Models
- Knowledge Graph Integration
- Contextual Document Analysis
- Document Classification Models
- Topic Detection
```

**ملف:** `src/replication/semantic/semantic-understanding-engine.ts`

---

## SEMANTIC.02 — تصنيف الوثائق

```
نماذج التصنيف:
- Vision Transformers
- EfficientNet document classifiers
- Layout-aware classifiers

أنواع الوثائق:
- تقارير
- فواتير
- جداول
- كتب
- عروض تقديمية
- مستندات حكومية
- أوراق علمية
- dashboards
- forms
```

**ملف:** `src/replication/semantic/document-classifier.ts`

---

## SEMANTIC.03 — استخراج الميتاداتا

```
استخراج:
- authors
- titles
- dates
- document type
```

---

## SEMANTIC.04 — أنظمة المعرفة

```
- Knowledge Graph Systems
- Entity Linking
- Semantic Knowledge Integration
```

---

# ╔═══════════════════════════════════════════════════════════════════╗
# ║ القسم 10: التعريب الاحترافي — التقنيات التفصيلية               ║
# ║ (يُكمّل PALC من P06 — لا يعارضه)                               ║
# ╚═══════════════════════════════════════════════════════════════════╝

## TRANSL.01 — Translation Intelligence Architecture

ترقية خدمة الترجمة الحالية بـ:

```
طبقات النظام:

Source structure
↓
Semantic analysis
↓
Terminology enforcement
↓
Translation engine
↓
Arabic typography engine
↓
Layout preservation engine
↓
QA engine
```

**ملف:** `src/replication/localization/translation-intelligence-pipeline.ts`

---

## TRANSL.02 — محركات الترجمة العصبية

```
أفضل النماذج:
- Transformer NMT
- MarianMT
- mT5
- NLLB
- custom fine-tuned LLMs
```

---

## TRANSL.03 — الترجمة السياقية

```
يجب تمرير:
- نوع العنصر
- المجال
- السياق
- الجمهور
```

---

## TRANSL.04 — ذاكرة الترجمة

```
أنظمة:
- vector TM
- semantic retrieval
- fuzzy matching
```

**ملف:** `src/replication/localization/translation-memory.ts`

---

## TRANSL.05 — إدارة المصطلحات

```
- Terminology databases
- automatic term detection
- term locking
- Terminology Consistency Enforcement
```

**ملف:** `src/replication/localization/terminology-engine.ts`

---

## TRANSL.06 — الذكاء اللغوي

```
نماذج:
- BERT Arabic
- AraBERT
- multilingual embeddings
```

---

## TRANSL.07 — الطباعة العربية الاحترافية (تفصيل تقني)

```
يجب دعم:
- RTL layout
- Arabic shaping
- ligatures
- diacritics
- Kashida justification
- Arabic punctuation

محركات:
- HarfBuzz
- ICU
- OpenType shaping
```

---

## TRANSL.08 — محاذاة النصوص العربية

```
قواعد:
- mirrored UI
- reversed chart axes
- RTL table alignment
```

---

## TRANSL.09 — تكييف طول النص

```
خوارزميات:
- text fitting
- smart wrapping
- dynamic font scaling
- overflow detection
```

---

## TRANSL.10 — توطين الأرقام

```
سياسات:
- Arabic digits
- Indian digits
- thousands separators
- financial number formatting
```

---

## TRANSL.11 — توطين الوحدات

```
تحويل:
- currencies
- measurements
- percentages
```

---

## TRANSL.12 — فحص الجودة اللغوية

```
فحوصات:
- terminology consistency
- grammar
- punctuation
- number consistency
```

---

## TRANSL.13 — التحقق الدلالي

```
تقنيات:
- back translation
- embedding similarity
- semantic consistency checks
```

---

## TRANSL.14 — اختبار التعريب

```
اختبارات:
- overflow detection
- RTL validation
- UI mirroring
```

---

## TRANSL.15 — مقاييس جودة الترجمة

```
- BLEU Score
- COMET Score
- BERTScore
- Translation Quality Metrics
```

---

# ╔═══════════════════════════════════════════════════════════════════╗
# ║ القسم 11: إعادة بناء وتوليد الملفات                            ║
# ╚═══════════════════════════════════════════════════════════════════╝

## GEN.01 — إعادة بناء بنية الوثائق

```
تحويل النص المُستخرج إلى:
- paragraphs
- sections
- headings
- tables
- lists
```

---

## GEN.02 — توليد الملفات (ترقية المولدات الحالية)

```
صيغة JSON المُنظمة تشمل:
- text
- layout
- coordinates
- styles
- semantic tags

الصيغ المدعومة:
- PPTX (OpenXML SDK)
- XLSX (OpenXML Excel schema)
- DOCX
- HTML/CSS (Paged Media)
- PDF
- JSON structured
- Markdown

مع الحفاظ على:
- الخطوط
- الأحجام
- المسافات
- الألوان
```

---

## GEN.03 — توليد Dashboards

```
محركات:
- Vega-Lite
- Plotly schema
- Power BI JSON
- Tableau spec
```

---

## GEN.04 — اكتشاف التفاعل

```
Interaction Reverse Engineering:
- Filters
- slicers
- tooltips
- drilldowns

باستخدام:
- Interaction graphs
- UI behavior inference
```

---

## GEN.05 — ضبط القياسات بدقة

```
- Subpixel measurement
- Grid inference
- Layout symmetry detection
```

---

## GEN.06 — إعادة بناء الخطوط المفقودة

```
إذا لم يتوفر الخط:
- Neural Font Reconstruction
- توليد الخط عبر GAN
- font style transfer
- glyph generation
```

---

# ╔═══════════════════════════════════════════════════════════════════╗
# ║ القسم 12: مقارنة البكسل — Pixel Perfect Pipeline               ║
# ║ (يُكمّل ARCH.15 من P06)                                        ║
# ╚═══════════════════════════════════════════════════════════════════╝

## PIXEL.01 — مقارنة البكسل والمطابقة الحرفية

```
المقارنة باستخدام:
- SSIM
- LPIPS
- Pixel Diff
- Feature map comparison

Pixel-level Validation
Render-to-Image Comparison
Layout Adjustment Optimization
```

---

## PIXEL.02 — Closed-loop Optimization

```
Pipeline:
1. توليد الملف
2. إعادة تصييره صورة
3. مقارنة بالبكسل
4. تعديل layout
5. إعادة التوليد

حتى: PixelDiff == 0

معيار القبول النهائي:
  PixelPerfect = PixelDiff(original_render, generated_render) == 0
```

---

## PIXEL.03 — بيئة التصيير الحتمية

```
Deterministic Rendering يتطلب:
- نفس الخطوط
- نفس محرك الرسم
- نفس DPI
- نفس anti-aliasing
- containerized rendering (Docker)
- fixed rendering engine
```

---

## PIXEL.04 — Layout Solvers

```
محركات:
- Cassowary
- Kiwi constraint solver
```

---

# ╔═══════════════════════════════════════════════════════════════════╗
# ║ القسم 13: استخراج البيانات والمخرجات المنظمة                    ║
# ╚═══════════════════════════════════════════════════════════════════╝

## DATA-EX.01 — استخراج البيانات

```
- Structured Data Extraction
- Analytics-ready Dataset Generation
- Data Normalization
```

Route: `POST /api/v1/replication/extract-data`

---

## DATA-EX.02 — استخراج الأرقام

```
التعرف على:
- Arabic digits
- English digits
- financial formats
```

---

# ╔═══════════════════════════════════════════════════════════════════╗
# ║ القسم 14: نظام مراجعة الجودة الشامل                             ║
# ╚═══════════════════════════════════════════════════════════════════╝

## QA.01 — فحص الجودة

```
فحوصات:
- missing text detection
- duplicate detection
- broken sentences
- OCR corruption detection
- translation inconsistencies
- terminology violations
- broken layout
- clipping
- overflow
- misalignment
- missing visual elements
- incorrect table structure
- chart extraction errors
- RTL issues
- file generation regressions
```

---

## QA.02 — حلقة التصحيح التلقائي

```
pipeline:
OCR
↓
Language model correction
↓
Structure validation
↓
rebuild
↓
visual validation
```

---

## QA.03 — مقاييس الجودة

```
- CER (Character Error Rate)
- WER (Word Error Rate)
- BLEU
- COMET
- BERTScore
- Semantic similarity
- Visual similarity metrics
```

---

# ╔═══════════════════════════════════════════════════════════════════╗
# ║ القسم 15: البنية التحتية                                        ║
# ╚═══════════════════════════════════════════════════════════════════╝

## INFRA.01 — متطلبات البنية التحتية

```
- GPU Inference Infrastructure
- Distributed AI Processing
- Parallel Page Processing
- Scalable Cloud Architecture
- High-performance Rendering Systems
```

---

# ╔═══════════════════════════════════════════════════════════════════╗
# ║ القسم 16: ملخص النماذج المستخدمة                                ║
# ╚═══════════════════════════════════════════════════════════════════╝

## MODELS — أهم نماذج الذكاء الاصطناعي

```
Vision:
- Vision Transformers
- Detectron2
- SAM segmentation
- Convolutional Neural Networks

Document:
- LayoutLMv3
- Donut
- DiT

Charts:
- ChartOCR
- ChartQA
- PlotQA
- DeepChart
- ChartReader

Tables:
- Table Transformer
- PubTables
- DeepDeSRT

OCR:
- TrOCR
- PaddleOCR
- Donut OCR

Fonts:
- DeepFont
- FontNet
- Glyph CNN

Vector:
- Potrace
- DiffVG
- DeepSVG
- VectorNet
- Im2Vec

UI:
- Pix2Code
- Screen2Vec
- UIBERT
- DETR UI

Language:
- Transformer NMT
- mT5
- NLLB
- MarianMT

Arabic NLP:
- AraBERT
- Arabic GPT models
- BERT Arabic

Image Enhancement:
- ESRGAN
- SwinIR

Layout Solvers:
- Cassowary
- Kiwi constraint solver
```

---

# ╔═══════════════════════════════════════════════════════════════════╗
# ║ القسم 17: كل الـ Routes الإضافية (P06-B)                        ║
# ╚═══════════════════════════════════════════════════════════════════╝

```
# --- Document AI Pipeline ---
POST   /api/v1/replication/document-ai/process
POST   /api/v1/replication/document-ai/classify

# --- Vision ---
POST   /api/v1/replication/vision/analyze
POST   /api/v1/replication/vision/detect-layout
POST   /api/v1/replication/vision/detect-ui

# --- OCR ---
POST   /api/v1/replication/ocr/extract
POST   /api/v1/replication/ocr/extract-arabic
POST   /api/v1/replication/ocr/correct

# --- Preprocessing ---
POST   /api/v1/replication/preprocess/enhance
POST   /api/v1/replication/preprocess/deskew

# --- Tables ---
POST   /api/v1/replication/tables/extract

# --- Charts ---
POST   /api/v1/replication/charts/extract

# --- Forms ---
POST   /api/v1/replication/forms/extract

# --- PDF ---
POST   /api/v1/replication/pdf/extract

# --- Semantic ---
POST   /api/v1/replication/semantic/understand
POST   /api/v1/replication/semantic/classify

# --- Translation ---
POST   /api/v1/replication/localization/translate
POST   /api/v1/replication/localization/validate-quality

# --- Data Extraction ---
POST   /api/v1/replication/extract-data

# --- QA ---
POST   /api/v1/replication/qa/validate
```

---

# ╔═══════════════════════════════════════════════════════════════════╗
# ║ القسم 18: قائمة التحقق الإلزامية — P06-B                       ║
# ╚═══════════════════════════════════════════════════════════════════╝

```
☐ Document Intelligence Pipeline يعمل (classify → detect → segment → OCR → reconstruct)
☐ Canonical IR + Canonical Layout Graph + Scene Graph مُنفذة
☐ Design Token Extraction يعمل
☐ Vision Transformers / Detectron2 / LayoutLM مدمجة
☐ SAM segmentation يعمل
☐ Page segmentation يعمل (blocks, columns, sections, containers)
☐ UI Understanding يكتشف (Cards, Filters, KPI blocks, Charts)
☐ Color/Style extraction يعمل (palette, gradient, shadow, border, transparency)
☐ Font recognition يعمل (DeepFont style)
☐ Icon/Vector reconstruction يعمل (Potrace, DiffVG, DeepSVG)
☐ OCR يعمل بالعربية والإنجليزية والمختلط
☐ OCR يستخرج (bounding boxes, font size, weight, kerning, baseline)
☐ Arabic OCR يدعم (shaping, ligatures, diacritics, Kashida, RTL order)
☐ OCR error correction يعمل (language model)
☐ Reading order detection يعمل
☐ Image preprocessing يعمل (denoise, deskew, enhance, super-resolution)
☐ Table extraction يعمل (rows, columns, merged cells, headers, borders)
☐ Chart extraction يعمل (type, axes, scales, legend, series, values)
☐ Form extraction يعمل (labels, values, checkboxes)
☐ PDF يدعم (searchable, scanned, hybrid)
☐ PDF layer extraction يعمل (text, vectors, images, fonts)
☐ Semantic understanding يعمل (NER, classification, topics)
☐ Document classification يعمل
☐ Metadata extraction يعمل
☐ Translation Intelligence Pipeline يعمل
☐ Neural MT مدمج (Transformer NMT / mT5 / NLLB)
☐ Context-aware translation يعمل
☐ Translation memory يعمل
☐ Terminology engine يعمل (databases, locking, enforcement)
☐ Arabic typography يعمل (HarfBuzz/ICU, Kashida, ligatures, shaping)
☐ RTL mirroring يعمل (UI, tables, chart axes)
☐ Text fitting/wrapping/scaling يعمل
☐ Number localization يعمل (Arabic/English/Indian digits)
☐ Unit localization يعمل (currency, measurements)
☐ Translation QA يعمل (terminology, grammar, semantic, overflow)
☐ BLEU + COMET + BERTScore متاحة
☐ File generation يعمل (PPTX, XLSX, DOCX, HTML, PDF)
☐ Pixel validation loop يعمل (Generate → Render → Compare → Optimize)
☐ PixelDiff == 0 كمعيار قبول نهائي
☐ Deterministic rendering environment (Docker, fixed DPI, fixed fonts)
☐ Cassowary/Kiwi constraint solver مدمج
☐ Neural font reconstruction يعمل
☐ QA validation يكشف (missing text, overflow, misalignment, RTL issues)
☐ CER + WER monitoring يعمل
☐ GPU inference مدعوم
☐ جميع التحسينات مدمجة في الخدمات الحالية — لا نظام منفصل
☐ كل route مختبر بـ curl وينجح
☐ TypeScript strict — صفر errors
☐ لا TODO — لا mock — لا placeholder
☐ master_progress.json مُحدّث
```

---

## ⛔ ابدأ التنفيذ — اقرأ الخدمات الحالية → حدد أين تُدمج الترقيات → نفّذ ⛔
