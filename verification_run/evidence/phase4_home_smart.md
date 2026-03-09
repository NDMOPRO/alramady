## 1. exact Home changes
- تم تثبيت التعديل في `C:\DATA_AI\rasid\frontend\app\(dashboard)\home\page.tsx`.
- `loadHomeData()` صار يعيد `HomeSnapshot` بدل تحديث الحالة فقط، حتى يعرض المساعد أرقام الخدمات الفعلية بعد التحديث من نفس الرد الحقيقي وليس من حالة قديمة.
- مخرج نجاح إنشاء مجموعة البيانات صار يفتح `/data/<datasetId>` مباشرة بدل التحويل العام إلى `/data`.
- لم يتم إبقاء أي fallback محلي أو local success path في Home؛ التنفيذ بقي مربوطًا فقط بعملاء API الحقيقيين الموجودة أصلًا في الصفحة.

## 2. drag/drop behavior
- Home يستخدم `react-dropzone` مع `accept` لأنواع CSV وXLS/XLSX وTXT وMarkdown وHTML وJSON وPDF وDOC/DOCX والصور.
- `onDropAccepted` يستدعي `handleAcceptedFiles()` ثم `buildHomeFileBundle()` لتوليد الحزمة العربية والخيارات الفعلية.
- زر `اختيار ملف` يستدعي `open()` من `useDropzone` لنفس مسار الإدخال، والسحب والإفلات والاختيار يمران بنفس المعالجة.
- تم التحقق من السطح في المتصفح برفع CSV ثم Markdown، وظهرت الرسائل العربية `تم إسقاط الملف` و`تم اكتشاف ملف بيانات` و`تم اكتشاف ملف نصي/مستندي`.

## 3. dynamic option generation
- المولد الفعلي هو `C:\DATA_AI\rasid\frontend\lib\home\home-file-capabilities.ts`.
- CSV يولد: `هل تريد تحليلًا فوريًا؟` و`هل تريد تقريرًا؟` و`هل تريد عرض باوربوينت؟` و`إلى ماذا تريد تحويله؟ إلى إكسل` و`هل تريد إضافته إلى البيانات؟`.
- Markdown يولد: `هل تريد تحويله إلى HTML؟` و`هل تريد تعريب الملف؟` و`هل تريد تنسيق RTL؟` و`هل تريد عرضًا من الملف؟` و`هل تريد عرضًا ذكيًا من النص؟`.
- التوليد يعتمد على نوع الملف المكتشف فعليًا، لا على قائمة ثابتة. نص المتصفح الخام أثبت تغير الخيارات بين `phase4-home-sample.csv` و`phase4-home-sample.md`.

## 4. real services used
- قراءة مؤشرات Home: `GET /api/v1/data/sources?page=1&limit=6` و`GET /api/v1/reporting/reports?page=1&limit=1` و`GET /api/v1/presentation/presentations?page=1&limit=1` و`GET /api/v1/dashboard/dashboards?page=1&limit=1`.
- CSV من Home: `POST /api/v1/data/import/single` ثم `GET /api/v1/data/sources/:id` ثم `POST /api/v1/dashboard/analyze-data`.
- Markdown من Home: `POST /api/v1/localization/translate/detect` ثم `POST /api/v1/localization/translate/text`.
- محركات التنفيذ المرتبطة مباشرة: `data-service`, `dashboard-service`, `localization-service`, مع بقاء `reporting-service`, `presentation-service`, `conversion-service`, و`replication-service` مربوطة من نفس Home حسب نوع الملف.

## 5. real outputs triggered
- من Home عبر CSV: ظهرت رسالة نجاح حقيقية في المتصفح بعنوان `نتيجة التحليل الذكي` وبداخلها `أعلى توصية رسم: orders حسب email` مع `3 صف` و`4 عمود` و`7 مؤشر` و`5 توصية رسم`.
- من Home عبر Markdown: ظهرت رسالة نجاح حقيقية بعنوان `تم التعريب` وبداخلها النص العربي `# ملخص الربع السنوي قدمت الشركة نموًا قويًا في الربع الأول. التركيز على التعريب والتقارير التنفيذية.`.
- المؤشرات في رأس الصفحة ارتفعت من `59` إلى `60` لمجموعات البيانات بعد تنفيذ CSV من Home، ما يثبت أن الناتج persisted في خدمة البيانات ثم عاد إلى Home.
- سجل الأوامر الخام في `C:\DATA_AI\rasid\verification_run\raw_outputs\phase4_commands.txt` يحتوي ناتج `POST /api/v1/data/import/single` مع dataset id فعلي وناتج `POST /api/v1/dashboard/analyze-data` وناتج `POST /api/v1/localization/translate/text`.

## 6. Arabic/RTL implementation
- الجذر في Home مضبوط على `dir="rtl"`.
- النصوص الظاهرة في Home عربية بالكامل: العنوان، رسائل الإسقاط، البطاقات الموجهة، المساعد، ورسائل التنفيذ.
- البطاقات الموجهة والمساعد الداخلي يعرضان الإجراءات والنتائج بالعربية الافتراضية.
- التحقق المتصفحي أظهر العبارات العربية نفسها في السطح بعد الرفع والتنفيذ.

## 7. motion/UX improvements
- Home يستخدم Hero متدرجًا عربيًا واضحًا مع بطاقات مؤشرات عالية التباين.
- حالة السحب النشطة تفعّل إبرازًا بصريًا مباشرًا `border-cyan-400 bg-cyan-50 shadow`.
- بطاقات الإجراءات تستعمل `transition-all duration-300` ورفع خفيف عند hover ومؤشر تحميل فعلي أثناء التنفيذ.
- إصلاح تحديث المؤشرات داخل المساعد أزال سلوكًا مضللًا كان قد يعرض أرقامًا قديمة بعد الضغط على `حدّث مؤشرات الصفحة الرئيسية`.

## 8. raw verification results
- ملف الأوامر الخام: `C:\DATA_AI\rasid\verification_run\raw_outputs\phase4_commands.txt`.
- من المتصفح بعد رفع CSV:
```text
تم إسقاط الملف
phase4-home-sample.csv (1 كيلوبايت)
تم اكتشاف ملف بيانات
هل تريد تحليلًا فوريًا؟
هل تريد تقريرًا؟
هل تريد عرض باوربوينت؟
إلى ماذا تريد تحويله؟ إلى إكسل
هل تريد إضافته إلى البيانات؟
```
- من المتصفح بعد تنفيذ تحليل CSV:
```text
جارٍ التنفيذ
يتم الآن تشغيل خدمة التحليل من الصفحة الرئيسية.
نتيجة التحليل الذكي
أعلى توصية رسم: orders حسب email
3 صف
4 عمود
7 مؤشر
5 توصية رسم
```
- من المتصفح بعد رفع Markdown:
```text
تم اكتشاف ملف نصي/مستندي
هل تريد تحويله إلى HTML؟
هل تريد تعريب الملف؟
هل تريد تنسيق RTL؟
هل تريد عرضًا من الملف؟
هل تريد عرضًا ذكيًا من النص؟
```
- من سجل الشبكة المتصفحي:
```text
[POST] http://localhost/api/v1/data/import/single => [201] Created
[GET] http://localhost/api/v1/data/sources/7f012551-e03d-4e2c-9765-522f88af2243 => [200] OK
[POST] http://localhost/api/v1/dashboard/analyze-data => [200] OK
[POST] http://localhost/api/v1/localization/translate/detect => [200] OK
[POST] http://localhost/api/v1/localization/translate/text => [200] OK
```

## 9. defects fixed
- خلل فعلي في Home: تحديث مؤشرات المساعد كان قد يعرض قيمًا قديمة بعد `loadHomeData()` بسبب الاعتماد على state مغلق داخل الـ closure. تم إصلاحه بإرجاع `HomeSnapshot` واستخدامه مباشرة في رسالة المساعد.
- خلل تنقلي فعلي في Home: نجاح إنشاء مجموعة البيانات كان يحول المستخدم إلى `/data` فقط. تم تغييره إلى `/data/<datasetId>` حتى يصبح Home سطح دخول ينقل مباشرة إلى الناتج الذي أنشأه.
- خلل تحقق مرحلي: سكربت التقاط الأوامر الخام كان يرسل حمولة توطين غير صحيحة. تم تصحيحها وإعادة تشغيل السجل الخام بنجاح.

## 10. phase status
PASS
