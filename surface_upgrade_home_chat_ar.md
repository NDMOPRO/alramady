# Surface Upgrade Evidence

## 1. What changed in Home UX
- تم تحويل [frontend/app/(dashboard)/home/page.tsx](C:/DATA_AI/rasid/frontend/app/(dashboard)/home/page.tsx) إلى سطح محادثة ملفات عربي بالكامل بدل صياغة مختلطة عربي/إنجليزي.
- أصبح Home يعرض محادثة تنفيذية عربية، كشف نوع الملف، بطاقات قرارات عربية على شكل أسئلة، سجل تنفيذ، ومخرجات قابلة للتنزيل أو الفتح من نفس السطح.
- تم إبقاء التنفيذ مربوطًا بالخدمات الحقيقية فقط، مع استمرار إصلاح مسار التوطين في [services/localization-service/src/services/translation-engine.service.ts](C:/DATA_AI/rasid/services/localization-service/src/services/translation-engine.service.ts) حتى لا يفشل زر التعريب داخل Home.

## 2. How drag/drop works
- Home يستخدم `react-dropzone` مباشرة مع `noClick: true` وزر عربي منفصل لاختيار الملف.
- تم إخفاء input الافتراضي حتى لا يظهر زر متصفح إنجليزي، واستبداله بتدفق عربي واضح: `اختيار ملف` أو `السحب والإفلات`.
- تم التحقق من الإسقاط الفعلي داخل المتصفح على `http://localhost/home` بحقن الملف الحقيقي `C:\DATA_AI\rasid\artifacts\settings\missing-settings-body.txt` في `input[type="file"]`.
- نتيجة التحقق في UI:
- `تم إسقاط الملف`
- `تم اكتشاف ملف نصي/مستندي`
- `تم فحص الملف missing-settings-body.txt بنجاح. النوع المكتشف هو txt وتم توليد إجراءات عربية مرتبطة بخدمات المنصة الحقيقية فقط.`

## 3. How dynamic Arabic action options are generated
- يتم تحديد نوع الملف داخل [frontend/lib/home/home-file-capabilities.ts](C:/DATA_AI/rasid/frontend/lib/home/home-file-capabilities.ts) عبر `detectFileKind()` ثم تُبنى الحزمة والإجراءات عبر `detectActions()`.
- تم تحويل كل عناوين ووصف بطاقات الإجراءات إلى صياغة عربية موجهة للمستخدم.
- أمثلة الإجراءات العربية الناتجة من Home فعليًا بعد إسقاط ملف نصي:
- `هل تريد تعريب الملف؟`
- `هل تريد تنسيق RTL؟`
- `هل تريد عرضًا من الملف؟`
- `هل تريد عرضًا ذكيًا من النص؟`
- أمثلة التوليد العربي حسب القدرات الفعلية في الملف [home-file-capabilities.ts](C:/DATA_AI/rasid/frontend/lib/home/home-file-capabilities.ts):
- البيانات: `هل تريد تحليلًا فوريًا؟` و`هل تريد تقريرًا؟` و`هل تريد عرض باوربوينت؟`
- الصور: `هل تريد مطابقته بصريًا؟` و`هل تريد مطابقته بصريًا بشكل صارم؟` و`هل تريد لوحة مؤشرات؟`
- التحويل: `إلى ماذا تريد تحويله؟ إلى إكسل` أو `إلى ماذا تريد تحويله؟ إلى CSV`

## 4. Which real APIs/services are used
- تحميل Home:
- `GET /api/v1/data/sources?page=1&limit=6`
- `GET /api/v1/reporting/reports?page=1&limit=1`
- `GET /api/v1/presentation/presentations?page=1&limit=1`
- `GET /api/v1/dashboard/dashboards?page=1&limit=1`
- الإجراءات العربية التي تم تشغيلها فعليًا من Home:
- `POST /api/v1/localization/translate/detect` عبر `localization-service`
- `POST /api/v1/localization/translate/text` عبر `localization-service`
- `POST /api/v1/presentation/ai/generate-from-text` عبر `presentation-service`
- `GET /api/v1/presentation/presentations/:id`
- `GET /api/v1/presentation/presentations/:id/export/pptx`
- العملاء الذين يغذي بهم Home هذه المسارات:
- [frontend/lib/api/localization.ts](C:/DATA_AI/rasid/frontend/lib/api/localization.ts)
- [frontend/lib/api/presentation.ts](C:/DATA_AI/rasid/frontend/lib/api/presentation.ts)
- [frontend/lib/api/conversion.ts](C:/DATA_AI/rasid/frontend/lib/api/conversion.ts)
- [frontend/lib/api/replication.ts](C:/DATA_AI/rasid/frontend/lib/api/replication.ts)

## 5. Which real outputs can be triggered from Home
- ناتج تعريب فعلي ظهر داخل محادثة Home:
- `{"نجاح":خاطئ,"خطأ":"لم يتم العثور على الطريق GET /api/v1/governance/settings","كود":"ROUTE_NOT_FOUND"}`
- ناتج عرض ذكي فعلي من Home:
- `presentation 82a01379-64c4-46ff-8cf4-ecfa7ca2806c`
- `6 شريحة`
- رابط تنزيل ملف باوربوينت فعلي من `presentation-service`
- إثبات API مباشر بعد التعريب:
- `/api/v1/localization/translate/text` أعاد `مرحبا بك في العالم`
- `/api/v1/presentation/ai/generate-from-text` أعاد `presentationId 436678df-e640-46d8-8e07-7fbe50a47421` و`slideCount 4`
- ما يزال Home قادرًا على تشغيل مخرجات حقيقية أخرى حسب نوع الملف:
- مجموعة بيانات فعلية
- تحليل فعلي
- تقرير PDF فعلي
- تحويلات ملفات فعلية
- تحليل بصري ومطابقة صارمة ولوحة مؤشرات

## 6. Motion/animation improvements applied
- Hero بخلفية متعددة الطبقات وظلال واضحة بقي كما هو مع نصوص عربية أصلية.
- Dropzone يبدّل حالته بصريًا عند السحب الفعلي مع ring وظل آمنين إنتاجيًا.
- بطاقات الإجراءات العربية تستخدم `transition-all duration-300` وارتفاعًا خفيفًا عند hover.
- رسائل التنفيذ داخل المحادثة تنتقل من `جارٍ التنفيذ` إلى `تم التعريب` أو `تم توليد العرض` بدل أي success وهمي.

## 7. Usability/navigation improvements applied
- لم يعد المستخدم بحاجة إلى كتابة أي prompt؛ Home يعرض القرار العربي المناسب فور إسقاط الملف.
- تم تحسين الوضوح الملاحي عبر قسم `الوصول الواضح` وروابط مباشرة إلى `البيانات` و`التحليل` و`التقارير` و`العروض` و`المكتبة`.
- تم تعريب المقاييس الجانبية إلى `مجموعات البيانات` و`التقارير` و`العروض` و`لوحات المؤشرات`.
- تم تعريب قسم `آخر مجموعات البيانات` وإزالة الصياغة الإنجليزية منه.
- زر `جلسة جديدة` يصفّر الجلسة الحالية فقط من دون `localStorage` أو fallback محلي.

## 8. Arabic/RTL implementation details
- السطح كله يعمل بـ `dir="rtl"` من الحاوية الأساسية في [home/page.tsx](C:/DATA_AI/rasid/frontend/app/(dashboard)/home/page.tsx).
- كل النصوص الظاهرة للمستخدم في Home أصبحت عربية افتراضيًا:
- العنوان الرئيسي
- عناوين البطاقات
- رسائل المحادثة
- النصوص الإرشادية
- بطاقات الخطوة التالية
- مؤشرات الحالة
- تم تعريب `WELCOME_MESSAGE` والـ chips والعناوين الجانبية وعناوين الإحصاءات.
- تم تعريب `HomeCapabilityAction.title/description/outputLabel/serviceLabel` في [home-file-capabilities.ts](C:/DATA_AI/rasid/frontend/lib/home/home-file-capabilities.ts).
- تم إخفاء input file الافتراضي وإعطاؤه `aria-label` عربيًا لتفادي أي زر متصفح إنجليزي ظاهر في التدفق الرئيسي.

## 9. Test proof
- `npm run type-check --prefix frontend`
- النتيجة: نجاح.
- `npx jest src/__tests__/translation-engine.test.ts --runInBand` داخل `services/localization-service`
- النتيجة: `13 passed`.
- Playwright على `http://localhost/home` بعد تسجيل دخول حقيقي عبر `/api/v1/governance/auth/login`.
- إثبات UI عربي بعد التحميل:
- `الصفحة الرئيسية تعمل كمركز تنفيذ حقيقي للمنصة`
- `محادثة الملفات الذكية`
- `السحب والإفلات أو اختيار ملف`
- `آخر مجموعات البيانات`
- إثبات UI عربي بعد إسقاط الملف الحقيقي:
- `هل تريد تعريب الملف؟`
- `هل تريد تنسيق RTL؟`
- `هل تريد عرضًا من الملف؟`
- `هل تريد عرضًا ذكيًا من النص؟`
- إثبات تنفيذ عربي فعلي من Home:
- الضغط على `هل تريد تعريب الملف؟`
- ظهور `جارٍ التنفيذ`
- ثم ظهور `تم التعريب`
- طلبات الشبكة الفعلية على المسار المعتمد بعد التوثيق:
- `POST /api/v1/localization/translate/detect => 200`
- `POST /api/v1/localization/translate/text => 200`
- `POST /api/v1/presentation/ai/generate-from-text => 201`

## 10. Before/after proof
- قبل هذا التعديل، كانت ترقية Home السابقة في [surface_upgrade_home_chat.md](C:/DATA_AI/rasid/surface_upgrade_home_chat.md) ما تزال تحمل نصوص UI ظاهرة مثل:
- `Smart File Chat`
- `Drag & Drop`
- `Guided actions`
- `Dataset / Reports / Presentations / Dashboards`
- بعد التعديل الحالي، تحقق Playwright من ظهور النصوص العربية البديلة فعليًا في Home:
- `محادثة الملفات الذكية`
- `السحب والإفلات أو اختيار ملف`
- `خيارات موجهة`
- `مجموعات البيانات / التقارير / العروض / لوحات المؤشرات`
- كما تحولت البطاقات الديناميكية من صيغ وصفية عامة إلى أسئلة عربية مباشرة مرتبطة بقدرات حقيقية:
- `هل تريد تعريب الملف؟`
- `هل تريد تنسيق RTL؟`
- `هل تريد عرضًا من الملف؟`
- `هل تريد عرضًا ذكيًا من النص؟`

## 11. Explicit status
- IMPLEMENTED
