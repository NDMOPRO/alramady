# Contextual Services Arabic

## 1. Which contextual services were added
- `Home`: كشف نوع الملف بعد الإسقاط وتوليد إجراءات عربية مرتبطة بالنوع بدل قائمة ثابتة.
- `Home`: عند ملف `CSV` تظهر إجراءات `تحليل فوري` و`تقرير` و`عرض باوربوينت` و`تحويل إلى إكسل` و`إضافة إلى البيانات`.
- `Home`: محرك القدرات في [home-file-capabilities.ts](/C:/DATA_AI/rasid/frontend/lib/home/home-file-capabilities.ts) يربط أيضًا أنواع `markdown/text/html/json/pdf/word/image` بخدمات التعريب و`RTL` والتحويل والمطابقة البصرية وإعادة بناء لوحة المؤشرات.
- `Data` route `/data`: إظهار الموصلات السحابية الفعلية من خدمة البيانات، مع بطاقة سياقية تنقل إلى أحدث `datasetId` لتشغيل الخدمات من نفس المصدر.
- `Data` route `/data/[id]`: إظهار أزرار تحليل وبناء تقرير وتوليد عرض وحفظ وصفة داخل المكتبة فقط عندما يكون نوع المجموعة قابلًا للتنفيذ.
- `Library` route `/library`: تشغيل الوصفة المحفوظة من نفس الصفحة وإعادة بناء تقرير فعلي من `datasetId` بدل حفظ بصري فقط.

## 2. Where and when they appear
- في [home/page.tsx](/C:/DATA_AI/rasid/frontend/app/(dashboard)/home/page.tsx) بعد إسقاط ملف أو اختياره، داخل قسم `الخطوة التالية`.
- في [data/page.tsx](/C:/DATA_AI/rasid/frontend/app/(dashboard)/data/page.tsx) بعد تحميل `/api/v1/data/sources` و`/api/v1/data/connectors/types`.
- في [data/[id]/page.tsx](/C:/DATA_AI/rasid/frontend/app/(dashboard)/data/[id]/page.tsx) بعد فتح مجموعة بيانات فعلية قابلة للتحليل.
- في [library/page.tsx](/C:/DATA_AI/rasid/frontend/app/(dashboard)/library/page.tsx) داخل قسم `الإجراءات وسير العمل المحفوظ` عند وجود وصفة محفوظة فعليًا.

## 3. What triggers them
- `Home`: `buildHomeFileBundle(files)` يفحص الامتداد و`mimeType` وعدد الملفات ويحدد `bundle.kind` و`actions`.
- `Data`: نجاح `GET /api/v1/data/sources?page=1&limit=10` يملأ أحدث مجموعة ويُفعّل فتح صفحة التفاصيل.
- `Data`: نجاح `GET /api/v1/data/connectors/types` يفعّل بطاقات Google Drive وOneDrive وDropbox وفق الأنواع الحية، وليس عبر قائمة ثابتة.
- `Data/[id]`: نوع المجموعة `csv/excel/json/jsonl/ndjson` يفعّل أزرار التحليل والتقرير والعرض والوصفة.
- `Library`: أصل JSON محفوظ بوسوم `library-action` أو `reusable` يفعّل زر `تشغيل الآن`.

## 4. Which real services/APIs they use
- `Home`:
- `GET /api/v1/data/sources`
- `GET /api/v1/reporting/reports`
- `GET /api/v1/presentation/presentations`
- `GET /api/v1/dashboard/dashboards`
- `POST /api/v1/data/import/single`
- `POST /api/v1/dashboard/analyze-data`
- `POST /api/v1/reporting/reports`
- `POST /api/v1/reporting/reports/:id/sections`
- `POST /api/v1/reporting/reports/:id/build`
- `GET /api/v1/reporting/reports/:id/export/pdf`
- `POST /api/v1/presentation/ai/generate-from-data`
- `Data`:
- `GET /api/v1/data/sources`
- `GET /api/v1/data/connectors/types`
- `GET /api/v1/data/connectors/auth/:type`
- `GET /api/v1/data/sources/:id`
- `GET /api/v1/data/sources/:id/rows`
- `POST /api/v1/dashboard/analyze-data`
- `POST /api/v1/presentation/ai/generate-from-data`
- `Library`:
- `GET /api/v1/library/assets`
- `GET /api/v1/library/assets/:id/download`
- `POST /api/v1/library/assets`
- `POST /api/v1/reporting/reports`
- `POST /api/v1/reporting/reports/:id/sections`
- `POST /api/v1/reporting/reports/:id/build`

## 5. Arabic UX behavior
- جميع نصوص `Home` و`Data` و`Library` المعنية في هذا المسار عربية.
- الخيارات تظهر كسلسلة قرارات قصيرة مثل `هل تريد تحليلًا فوريًا؟` و`هل تريد تقريرًا؟` و`احفظ آخر إجراء داخل المكتبة`.
- لا يُجبر المستخدم على كتابة أمر نصي قبل ظهور الإجراءات السياقية.
- الرسائل الراجعة بعد التنفيذ عربية وتصف نتيجة العمل الحقيقي لا نجاحًا وهميًا.

## 6. RTL details
- كل السطوح المتأثرة تستخدم `dir="rtl"` على الحاوية الرئيسية.
- بطاقات الإجراءات والمحادثة والمساعد المضمنة مصطفوفة يمينًا في [home/page.tsx](/C:/DATA_AI/rasid/frontend/app/(dashboard)/home/page.tsx) و[data/page.tsx](/C:/DATA_AI/rasid/frontend/app/(dashboard)/data/page.tsx) و[data/[id]/page.tsx](/C:/DATA_AI/rasid/frontend/app/(dashboard)/data/[id]/page.tsx) و[library/page.tsx](/C:/DATA_AI/rasid/frontend/app/(dashboard)/library/page.tsx).
- مكوّن [EmbeddedRasidAssistant.tsx](/C:/DATA_AI/rasid/frontend/components/assistant/EmbeddedRasidAssistant.tsx) يعمل بـ `dir="rtl"` ويطبع الرسائل والأوامر بالعربية.

## 7. Test proof
- `npm run type-check --prefix frontend` نجح.
- `npm test --prefix services/presentation-service -- --runInBand` نجح: `9 suites`, `127 tests`.
- API proof:
- `GET /api/v1/data/connectors/types` أعاد أنواعًا حية منها `google_drive`, `onedrive`, `dropbox`.
- `GET /api/v1/data/sources?page=1&limit=3` أعاد مجموعات حية منها `analysis-surface-20260309-094817`.
- UI proof عبر Playwright:
- `Home`: إسقاط ملف CSV باسم `home-contextual.csv` ولّد بطاقات ديناميكية `تحليل` و`تقرير` و`عرض` و`تحويل` و`إضافة إلى البيانات`.
- `Home`: الضغط على `هل تريد تحليلًا فوريًا؟` أنشأ Dataset فعليًا ورفع العداد إلى `54` وأظهر نتيجة `أعلى توصية رسم: margin حسب region`.
- `Data`: صفحة `/data` عرضت `53` مجموعة و`10` معروضة وفعّلت بطاقات الموصلات الحية بدون رسالة خطأ داخل الواجهة.
- `Data/[id]`: الضغط على `حلّل هذه المجموعة الآن` أعاد `أكمل محرك التحليل قراءة 4 صف وأعاد 8 توصية رسم`.
- `Data/[id]`: الضغط على `ابنِ تقريرًا من هذه البيانات` أعاد build فعليًا مع `buildId: 50464db0-e643-474a-8f86-f11833416a2a`.
- `Data/[id]`: الضغط على `احفظ آخر إجراء داخل المكتبة` حفظ وصفة JSON فعلية داخل المكتبة.
- `Data/[id]`: الضغط على `ولّد عرضًا من هذه البيانات` أعاد `Quarterly Business Performance Analysis` بعدد `6` شرائح.
- `Library`: الضغط على `تشغيل الآن` للوصفة المحفوظة أعاد `تم تشغيل الوصفة المحفوظة وبناء تقرير جديد من analysis-surface-20260309-094817`.

## 8. Before/after proof
- قبل التفعيل: `Home` كان ينتظر ملفًا ولا يعرض إجراءات.
- بعد التفعيل: `Home` عرض إجراءات عربية ديناميكية مباشرة بعد إسقاط CSV وربطها بمسارات تنفيذ حقيقية.
- قبل التفعيل: `Data` لا يملك مسارًا واضحًا من قائمة المصادر إلى التحليل/التقرير/العرض/الوصفة من نفس `datasetId`.
- بعد التفعيل: `/data/[id]` أصبح نقطة الخدمات السياقية الفعلية للمجموعة نفسها.
- قبل التفعيل: `Library` كانت تعرض الأصل/الوصفة فقط.
- بعد التفعيل: الوصفة المحفوظة تعيد تشغيل بناء تقرير فعلي من داخل المكتبة.
- ملاحظة تشغيلية مثبتة: `GET /api/v1/data/connectors/connections` ما يزال يعيد `500` وقت التشغيل الحالي، لكن [data/page.tsx](/C:/DATA_AI/rasid/frontend/app/(dashboard)/data/page.tsx) يعزل هذا الخلل ويعتمد على `GET /connectors/types` لإظهار القدرات السياقية السحابية بدون تلويث واجهة المستخدم برسالة خطأ.

## 9. Explicit status
- IMPLEMENTED
