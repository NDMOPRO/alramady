# Surface Library Reuse Hub Arabic

## 1. What reusable entities are supported
- الأصول الحقيقية المرفوعة إلى `library-service` والمخزنة في `MinIO`.
- ثيمات العروض المحفوظة فعليًا في `presentation-service` ثم المفهرسة كملفات JSON داخل المكتبة.
- وصفات الإجراءات الناجحة المحفوظة فعليًا في المكتبة مثل `generate-presentation-from-asset`.
- وصفات سير العمل المحفوظة فعليًا في المكتبة بعد إنشائها داخل `governance-service`.
- إعادة استخدام الأصل المحدد مباشرة لمسار البيانات أو العروض من داخل `/library`.

## 2. How assets are stored and reused
- الرفع من الواجهة العربية يتم عبر `POST /api/v1/library/assets` ثم يحفظ الأصل في PostgreSQL و`MinIO`.
- تحقق UI فعلي: رفع الملف الحقيقي `C:\Windows\System32\drivers\etc\hosts` من نفس الصفحة، وظهر في القائمة باسم `hosts` وعدّاد الأصول ارتفع من `6` إلى `7`.
- إعادة الاستخدام لمسار البيانات تتم عبر `GET /api/v1/library/assets/:id/download` ثم `POST /api/v1/data/import/single` من نفس السطح.
- تحقق UI فعلي: الأصل `ep_test.csv` أُعيد استخدامه من المكتبة، وظهرت الرسالة `تم استيراد ep_test.csv إلى البيانات وإنشاء Dataset فعلي.`
- تحقق API فعلي: `GET /api/v1/library/assets?page=1&limit=20` أعاد الأصل `hosts` والوصفات والثيمات المحفوظة مع `totalCount: 10`.

## 3. How themes are saved and reused
- حفظ الثيم يتم عبر `POST /api/v1/presentation/themes` لإنشاء سجل الثيم الحقيقي.
- بعد الإنشاء يُحفظ تمثيل JSON للثيم داخل المكتبة عبر `POST /api/v1/library/assets`.
- تفعيل الثيم في إعادة الاستخدام يتم باختيار وصفة الثيم ثم إنشاء العرض من الأصل عبر `POST /api/v1/presentation/source/from-file` ثم `PUT /api/v1/presentation/presentations/:id/theme`.
- تحقق UI فعلي: تم حفظ الثيم `ثيم مكتبة عربي 1344` وظهر العداد `الثيمات: 1` وظهر النص `الثيم النشط الآن هو ثيم مكتبة عربي 1344.`
- تحقق API فعلي من الشبكة: `POST /api/v1/presentation/themes => 201` ثم `POST /api/v1/library/assets => 201` ثم `PUT /api/v1/presentation/presentations/90db647c-c861-453e-a9e1-ec175ccb859f/theme => 200`.

## 4. How actions/workflows are saved and reused
- حفظ الإجراء الناجح يتم بتحويل آخر نجاح فعلي إلى وصفة JSON ثم رفعها إلى المكتبة عبر `POST /api/v1/library/assets`.
- إعادة تشغيل الوصفة يتم بقراءة أصل JSON الحقيقي من المكتبة عبر `GET /api/v1/library/assets/:id/download` ثم تنفيذ نفس API الحقيقي مرة أخرى.
- إنشاء سير العمل يتم عبر `POST /api/v1/governance/workflows` ثم حفظ وصفته داخل المكتبة عبر `POST /api/v1/library/assets`.
- تحقق UI فعلي: بعد حفظ وصفة العرض ارتفع العداد إلى `الوصفات: 1` ثم بعد إنشاء سير العمل `اعتماد أصل مكتبي 1345` صار `الوصفات: 2`.
- تحقق UI فعلي: تشغيل الوصفة المحفوظة أعاد تنفيذ مسار العرض وظهرت الرسالة `تم تشغيل الوصفة المحفوظة وإنشاء عرض جديد من ep_test.csv.`
- تحقق API فعلي من الشبكة: `POST /api/v1/governance/workflows => 201` ثم `POST /api/v1/library/assets => 201` ثم عند إعادة التشغيل `POST /api/v1/presentation/source/from-file => 201`.

## 5. Which services/APIs/persistence layers are used
- الواجهة: [page.tsx](/C:/DATA_AI/rasid/frontend/app/(dashboard)/library/page.tsx)
- عميل مكتبة وإعادة استخدام: [library.ts](/C:/DATA_AI/rasid/frontend/lib/api/library.ts) و[library-reuse.ts](/C:/DATA_AI/rasid/frontend/lib/api/library-reuse.ts)
- خدمة المكتبة: [library.routes.ts](/C:/DATA_AI/rasid/services/library-service/src/routes/library.routes.ts) و[asset-manager.service.ts](/C:/DATA_AI/rasid/services/library-service/src/services/asset-manager.service.ts)
- بوابة التشغيل الديناميكية: [nginx.conf](/C:/DATA_AI/rasid/services/gateway/nginx.conf)
- الخدمات المنفذة فعليًا: `library-service`, `presentation-service`, `governance-service`, `data-service`
- طبقات الحفظ الفعلية: PostgreSQL لسجلات المكتبة والعروض وسير العمل، و`MinIO` لملفات الأصول والوصفات والثيمات JSON.
- طلبات الشبكة المثبتة من الواجهة:
- `GET /api/v1/library/assets?page=1&limit=100 => 200`
- `GET /api/v1/library/assets/:id/download => 200`
- `POST /api/v1/data/import/single => 201`
- `POST /api/v1/presentation/themes => 201`
- `POST /api/v1/presentation/source/from-file => 201`
- `PUT /api/v1/presentation/presentations/:id/theme => 200`
- `POST /api/v1/governance/workflows => 201`
- `POST /api/v1/library/assets => 201`

## 6. Arabic/RTL UX implementation
- السطح بالكامل عربي افتراضيًا على المسار `/library`.
- التخطيط يعمل باتجاه `RTL` مع حقول وعناوين وأزرار عربية داخل صفحة المكتبة والمساعد المضمن.
- نصوص التوجيه والاستخدام وإعادة الاستخدام جميعها عربية فعلية مثل `استيراد إلى البيانات` و`إنشاء عرض من الأصل` و`إنشاء وحفظ سير عمل فعلي`.
- الواجهة تعرض مسارًا عربيًا مباشرًا لإعادة الاستخدام دون forcing المستخدم إلى أسطح أخرى يدويًا.

## 7. Test proof
- تحقق TypeScript: `npm run type-check --prefix frontend` نجح بعد التعديلات.
- تحقق خدمة المكتبة: `npm test --prefix services/library-service -- --runInBand` نجح بنتيجة `12 passed`.
- تحقق UI/E2E فعلي عبر Playwright:
- رفع أصل حقيقي وظهور `hosts` في القائمة مع تغير عداد الأصول إلى `7`.
- استيراد `ep_test.csv` إلى البيانات وظهور رسالة النجاح الفعلية.
- حفظ ثيم عربي ثم إنشاء عرض فعلي مع تطبيقه.
- حفظ وصفة عرض، إنشاء سير عمل، ثم إعادة تشغيل وصفة العرض من داخل المكتبة.
- تحقق شبكة الواجهة الفعلي أعاد مسارات `200/201` الحقيقية للخدمات الأربع المرتبطة بالسطح.

## 8. Before/after proof
- قبل التعديل في هذا المسار التشغيلي: كان الاستيراد من الأصل يفشل بسبب `minio` signed URL غير قابل للوصول من المتصفح، ثم ظهر `401` على `data-service` بجلسة قديمة، ثم ظهر `502` من `gateway` بعد إعادة إنشاء الحاويات.
- بعد التعديل:
- أضيف endpoint حقيقي للبث عبر `library-service` هو `GET /api/v1/library/assets/:id/download`.
- صار مسار إعادة الاستخدام في الواجهة يعتمد على endpoint التحميل الحقيقي بدل تنزيل signed URL مباشر.
- صار `gateway` يستخدم DNS ديناميكي للمسارات المعتمدة مباشرة من المكتبة.
- النتيجة المرئية النهائية من نفس الصفحة:
- الأصول `6 -> 7`
- الثيمات `0 -> 1`
- الوصفات `0 -> 2`
- الأصل المرفوع `hosts` أصبح محفوظًا فعليًا داخل المكتبة
- العرضان الجديدان ظهرا في `presentation-service` عبر `GET /api/v1/presentation/presentations?page=1&limit=10`

## 9. Explicit status
IMPLEMENTED
