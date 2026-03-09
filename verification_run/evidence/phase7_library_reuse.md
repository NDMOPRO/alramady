## 1. reusable entities supported
- أصول حقيقية محفوظة في المكتبة عبر [frontend/app/(dashboard)/library/page.tsx](C:/DATA_AI/rasid/frontend/app/(dashboard)/library/page.tsx) و[frontend/lib/api/library.ts](C:/DATA_AI/rasid/frontend/lib/api/library.ts).
- وصفات إجراءات قابلة لإعادة التشغيل من البيانات والتقارير والعروض وسير العمل عبر [frontend/lib/api/library-reuse.ts](C:/DATA_AI/rasid/frontend/lib/api/library-reuse.ts).
- ثيمات عروض محفوظة في `presentation-service` ثم مفهرسة كأصول JSON داخل المكتبة.
- تعريفات سير عمل محفوظة في `governance-service` ثم مفهرسة كأصول JSON داخل المكتبة.

## 2. actual persistence and retrieval paths
- رفع الأصل: `POST /api/v1/library/assets` -> [services/library-service/src/routes/library.routes.ts](C:/DATA_AI/rasid/services/library-service/src/routes/library.routes.ts) -> [services/library-service/src/services/asset-manager.service.ts](C:/DATA_AI/rasid/services/library-service/src/services/asset-manager.service.ts) -> MinIO + Prisma `libraryAsset`.
- قراءة الأصل والقائمة: `GET /api/v1/library/assets`, `GET /api/v1/library/assets/:id`, `GET /api/v1/library/assets/:id/download`.
- حفظ الثيم: `POST /api/v1/presentation/themes` -> `saveReusableRecipeAsset()` -> `POST /api/v1/library/assets`.
- إعادة استخدام الثيم: `GET /api/v1/library/assets/:id/download` -> `generatePresentationFromLibraryAsset()` -> `POST /api/v1/presentation/source/from-file` -> `PUT /api/v1/presentation/presentations/:id/theme`.
- حفظ وصفة التقرير من البيانات: [frontend/app/(dashboard)/data/[id]/page.tsx](C:/DATA_AI/rasid/frontend/app/(dashboard)/data/[id]/page.tsx) -> `saveReusableRecipeAsset()` -> `POST /api/v1/library/assets`.
- تشغيل وصفة التقرير من المكتبة: `GET /api/v1/library/assets/:id/download` -> `buildReportFromDataset()` -> `POST /api/v1/reporting/reports` ثم `POST /api/v1/reporting/reports/:id/sections` ثم `POST /api/v1/reporting/reports/:id/build`.
- حفظ سير العمل: `POST /api/v1/governance/workflows` -> `saveReusableRecipeAsset()` -> `POST /api/v1/library/assets`.
- إعادة استخدام سير العمل: `GET /api/v1/library/assets/:id/download` -> `createWorkflowDefinition()` -> `POST /api/v1/governance/workflows`.

## 3. reuse behavior across surfaces
- `Data -> Library -> Reports`: من صفحة مجموعة البيانات تم بناء تقرير حقيقي ثم حفظ وصفته في المكتبة، وبعدها شغّلت المكتبة نفس الوصفة وأنتجت تقريرًا جديدًا في `reporting-service`.
- `Library -> Data`: الأصل `phase7-audit-export.csv` رُفع إلى المكتبة ثم استُورد إلى `data-service` وأنتج Dataset فعليًا.
- `Library -> Presentations`: الأصل نفسه استُخدم لإنشاء عرض حقيقي بعد تفعيل ثيم محفوظ من المكتبة.
- `Library -> Settings`: من المكتبة تم إنشاء تعريف سير عمل فعلي ثم تشغيل وصفته مرة أخرى عبر `governance-service`.

## 4. theme/workflow save and reuse behavior
- الثيم لا يبقى محليًا فقط؛ يُنشأ سجل فعلي في `presentation-service` ثم يُخزن وصفه كأصل JSON موسوم `library-theme` داخل المكتبة.
- تفعيل الثيم يتم بقراءة الأصل المحفوظ من المكتبة ثم استخدامه في مسار التوليد الفعلي للعروض.
- سير العمل لا يبقى في حالة صفحة؛ يُنشأ أولًا عبر `POST /api/v1/governance/workflows` ثم تُحفظ وصفته كأصل `library-workflow`.
- إعادة تشغيل سير العمل تقرأ ملف الوصفة من المكتبة ثم تعيد استدعاء `governance-service` لإنشاء Workflow جديد.

## 5. Arabic/RTL UX
- الصفحة تعمل بـ `dir=\"rtl\"` في [frontend/app/(dashboard)/library/page.tsx](C:/DATA_AI/rasid/frontend/app/(dashboard)/library/page.tsx).
- نصوص الرفع، الثيمات، الوصفات، التشغيل، والمساعد موجهة بالعربية فقط.
- التحقق المرئي التفاعلي أظهر النصوص العربية نفسها أثناء الحفظ والتشغيل: `تم استيراد ...`, `تم إنشاء عرض ...`, `تم تشغيل وصفة سير العمل ...`.

## 6. raw verification results
- الملف الخام: [phase7_commands.txt](C:/DATA_AI/rasid/verification_run/raw_outputs/phase7_commands.txt)
- الملف الخام: [phase7_browser_results.json](C:/DATA_AI/rasid/verification_run/raw_outputs/phase7_browser_results.json)
- خط الأساس قبل تشغيل مسار إعادة الاستخدام: `datasets=60`, `reports=22`, `presentations=24`, `libraryAssets=16`.
- نتيجة الاستيراد من المكتبة إلى البيانات: `تم استيراد phase7-audit-export.csv إلى البيانات وإنشاء Dataset فعلي.`
- نتيجة إنشاء العرض من أصل المكتبة مع ثيم محفوظ: `تم إنشاء عرض من phase7-audit-export.csv ثم تطبيق الثيم ثيم إعادة استخدام المرحلة 7 1773067637764.`
- نتيجة تشغيل وصفة التقرير المحفوظة: `تم تشغيل الوصفة المحفوظة وبناء تقرير جديد من phase4-home-sample.`
- نتيجة إنشاء سير العمل ثم إعادة تشغيل وصفته: `تم إنشاء سير العمل سير اعتماد المرحلة 7 1773067687348 ثم حفظ وصفته داخل المكتبة.` و`تم تشغيل وصفة سير العمل سير اعتماد المرحلة 7 1773067687348 بنجاح.`
- العدادات بعد التشغيل: `datasets=61`, `reports=23`, `presentations=25`, `libraryAssets=18`.
- الثيم المفعل بعد التحقق: `الثيم النشط الآن هو ثيم إعادة استخدام المرحلة 7 1773067637764.`

## 7. defects fixed
- أصلحت خلل إعادة القراءة بعد الطفرات في [frontend/app/(dashboard)/library/page.tsx](C:/DATA_AI/rasid/frontend/app/(dashboard)/library/page.tsx): الرفع والحذف وحفظ الثيم وحفظ الوصفة وإنشاء سير العمل كانت تستدعي `loadAssets()` و`loadFolders()` بدون `force`، ما كان يسمح للكاش القصير بإظهار حالة قديمة بدل الحالة الحقيقية من `library-service`. أصبحت هذه المسارات تستخدم `loadAssets(true)` و`loadFolders(true)` بعد الطفرات.
- بعد الإصلاح ظهر الأصل المرفوع `phase7-audit-export.csv` مباشرة في القائمة، وظهرت أصول الثيم وسير العمل الجديدة فورًا وأصبحت قابلة للتشغيل من نفس الجلسة.

## 8. phase status
- PASS
