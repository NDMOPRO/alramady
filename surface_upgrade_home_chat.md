# Surface Upgrade Evidence

## 1. What changed in Home UX
- تم استبدال Home القديم بسطح `Smart File Chat` داخل [frontend/app/(dashboard)/home/page.tsx](C:/DATA_AI/rasid/frontend/app/(dashboard)/home/page.tsx) مع محادثة تنفيذية حقيقية، كشف نوع الملف، بطاقات إجراءات ديناميكية، وسجل رسائل نجاح/فشل ومخرجات قابلة للتنزيل أو الفتح.
- تم تحويل Home من hero ثابت + quick actions عامة إلى نقطة دخول تنفيذية تستطيع بدء الترجمة، RTL، بناء العرض، الاستيراد، التحليل، التقرير، التحويل، والتحليل البصري من نفس السطح.
- تم إصلاح مسار التعريب الفعلي المطلوب لـ Home داخل [services/localization-service/src/services/translation-engine.service.ts](C:/DATA_AI/rasid/services/localization-service/src/services/translation-engine.service.ts) لأن `translation_memory` كان يعطل `/translate/text` قبل إرجاع ناتج حقيقي.

## 2. How drag/drop works
- Home يستخدم `react-dropzone` مباشرة عبر `useDropzone` مع `accept` حقيقي للأنواع المدعومة و`maxFiles: 4`.
- إسقاط الملف أو اختياره يمر عبر `handleAcceptedFiles()` ثم `buildHomeFileBundle()` في [frontend/lib/home/home-file-capabilities.ts](C:/DATA_AI/rasid/frontend/lib/home/home-file-capabilities.ts).
- التحقق الفعلي تم من المتصفح على `http://localhost/home` بحقن الملف الحقيقي `C:\DATA_AI\rasid\artifacts\settings\missing-settings-body.txt` في `input[type="file"]` وظهر في UI:
- `تم إسقاط الملف`
- `تم اكتشاف ملف نصي/مستندي`
- `الملف missing-settings-body.txt من نوع txt وتم توليد إجراءات متوافقة مع خدمات المنصة الحقيقية.`

## 3. How dynamic action options are generated
- الملف يُصنّف حسب الامتداد و`mimeType` داخل `detectFileKind()` ثم تُبنى الحزمة والإجراءات عبر `detectActions()`.
- `txt/html/json/markdown` تولد: `تعريب المحتوى` و`تطبيق RTL` و`توليد عرض من الملف` و`عرض ذكي من النص`.
- `csv/xls/xlsx` تولد: `تحليل ذكي` و`إنشاء تقرير` و`توليد PowerPoint` ومسارات التحويل والاستيراد.
- `pdf/doc/docx` تولد تحويلات الملف + توليد عرض.
- `image` و`image-compare` تولد التحليل البصري وإعادة البناء والمطابقة الحرفية.
- في التحقق الفعلي ظهر على Home بعد إسقاط `missing-settings-body.txt` أربع بطاقات ديناميكية مرتبطة بالخدمات الحقيقية:
- `تعريب المحتوى`
- `تطبيق RTL`
- `توليد عرض من الملف`
- `عرض ذكي من النص`

## 4. Which real APIs/services are used
- تحميل الإحصاءات في أعلى Home:
- `GET /api/v1/data/sources?page=1&limit=6` عبر `data-service`
- `GET /api/v1/reporting/reports?page=1&limit=1` عبر `reporting-service`
- `GET /api/v1/presentation/presentations?page=1&limit=1` عبر `presentation-service`
- `GET /api/v1/dashboard/dashboards?page=1&limit=1` عبر `dashboard-service`
- إجراءات النص التي تم تشغيلها فعليًا من Home:
- `POST /api/v1/localization/translate/detect` عبر `localization-service`
- `POST /api/v1/localization/translate/text` عبر `localization-service`
- `POST /api/v1/localization/rtl/apply` عبر `localization-service`
- `POST /api/v1/presentation/ai/generate-from-text` عبر `presentation-service`
- `GET /api/v1/presentation/presentations/:id`
- `GET /api/v1/presentation/presentations/:id/export/pptx`
- العملاء الذين تم ربطهم/تصحيحهم لـ Home:
- [frontend/lib/api/localization.ts](C:/DATA_AI/rasid/frontend/lib/api/localization.ts)
- [frontend/lib/api/presentation.ts](C:/DATA_AI/rasid/frontend/lib/api/presentation.ts)
- [frontend/lib/api/conversion.ts](C:/DATA_AI/rasid/frontend/lib/api/conversion.ts)
- [frontend/lib/api/replication.ts](C:/DATA_AI/rasid/frontend/lib/api/replication.ts)

## 5. Which real outputs can be triggered from Home
- ناتج فعلي تم تشغيله من Home:
- نص عربي مترجم ظهر في المحادثة:
- `{\"نجاح\":خاطئ,\"خطأ\":\"لم يتم العثور على الطريق GET /api/v1/governance/settings\",\"كود\":\"ROUTE_NOT_FOUND\"}`
- ناتج RTL فعلي ظهر في المحادثة:
- `‏{\"success\":false,\"error\":\"Route GET /api/v1/governance/settings not found\",\"code\":\"ROUTE_NOT_FOUND\"}`
- عرض تقديمي فعلي من Home:
- `presentation 82a01379-64c4-46ff-8cf4-ecfa7ca2806c`
- `6 شريحة`
- رابط تنزيل `PPTX` blob + زر `فتح العرض`
- نواتج حقيقية أخرى يدعمها Home حسب نوع الملف من نفس السطح:
- `Dataset` حقيقي في `data-service`
- `Analysis` حقيقي في `dashboard-service`
- `Report PDF` حقيقي في `reporting-service`
- تحويلات `HTML/PDF/DOCX/XLSX/CSV`
- `Visual analysis` و`Dashboard reconstruction` و`Diff image`

## 6. Motion/animation improvements applied
- Hero بخلفية gradients متعددة الطبقات وظلال عميقة بدل رأس صفحة ثابت.
- Dropzone ينتقل بين حالات `idle/drag-active` مع `shadow ring` وحدود متحركة آمنة إنتاجيًا.
- بطاقات الإجراءات تستخدم `transition-all duration-300` ورفعًا خفيفًا عند hover.
- رسائل التنفيذ تضيف حالة loading spinner ثم تتحول إلى success/error bubble بدل تحديث صامت أو نجاح وهمي.
- أزرار المخرجات وروابط التنزيل تظهر بعد اكتمال التنفيذ الحقيقي فقط.

## 7. Usability/navigation improvements applied
- المستخدم لم يعد يحتاج كتابة prompt؛ Home يعرض الإجراء المناسب حسب الملف مباشرة.
- هناك شريط وصول واضح إلى `Data/Analysis/Reports/Presentations/Library`.
- آخر `Datasets` الحقيقية تظهر في الجانب لتقليل التنقل اليدوي.
- `جلسة جديدة` تنظف session UI الحالية فقط من دون `localStorage` أو fallback محلي.
- Home أصبح قادرًا على بدء ترجمة النص، تطبيق RTL، وإنشاء عرض حقيقي مباشرة بدل إجبار المستخدم على الانتقال أولًا إلى الأسطح الأخرى.

## 8. Test proof
- `npm run type-check --prefix frontend`
- النتيجة: نجاح.
- `npx jest src/__tests__/translation-engine.test.ts --runInBand` داخل `services/localization-service`
- النتيجة: `13 passed`.
- Playwright على `http://localhost/home`
- تم تسجيل الدخول فعليًا.
- تم إسقاط الملف الحقيقي `C:\DATA_AI\rasid\artifacts\settings\missing-settings-body.txt`.
- ظهر الكشف الديناميكي والبطاقات الأربع في الواجهة.
- تم تشغيل `تعريب المحتوى` و`تطبيق RTL` و`عرض ذكي من النص` من Home وظهرت المخرجات في UI.
- طلبات الشبكة الفعلية المرصودة من المتصفح تضمنت:
- `POST /api/v1/localization/translate/detect => 200`
- `POST /api/v1/localization/translate/text => 200`
- `POST /api/v1/localization/rtl/apply => 200`
- `POST /api/v1/presentation/ai/generate-from-text => 201`
- `GET /api/v1/presentation/presentations/82a01379-64c4-46ff-8cf4-ecfa7ca2806c/export/pptx => 200`
- API proof مباشر من الطرفية بعد الإصلاح:
- `/api/v1/localization/translate/text` أعاد `مرحبا بك في العالم`
- `/api/v1/presentation/ai/generate-from-text` أعاد `presentationId 436678df-e640-46d8-8e07-7fbe50a47421` و`slideCount 4`

## 9. Before/after proof
- قبل الترقية:
- Home كان سطحًا أبسط لا يعمل كتجربة محادثة تنفيذية، بلا كشف ملف ذكي، بلا سجل تنفيذ، وبلا ربط شامل بإجراءات الملف حسب النوع.
- `/api/v1/localization/translate/text` كان يفشل داخل Home بسبب خطأ حقيقي في `translation_memory.source_language`.
- بعد الترقية:
- Home يعرض `Smart File Chat` ويكشف الملف ويولد إجراءات متغيرة حسب القدرات الفعلية.
- الزر `تعريب المحتوى` أصبح يعمل فعليًا بعد إصلاح الاستعلامات إلى `translation_memory` باستخدام الأعمدة الحقيقية `source_text / translated_text / source_lang / target_lang`.
- سجلات `localization-service` بعد الإصلاح أثبتت:
- `Fuzzy translation memory search completed`
- `New translation memory entry created`
- `Translation completed`
- سجلات `presentation-service` أثبتت:
- `Presentation generated from text`
- `PPTX exported`

## 10. Explicit status
- IMPLEMENTED
