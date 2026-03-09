## 1. real capabilities supported
- عرض المستخدمين فعليًا من `GET /api/v1/governance/users` مع فتح ملف كل مستخدم عبر `GET /api/v1/governance/users/:id`.
- تحديث المستخدم فعليًا من نفس السطح عبر `PATCH /api/v1/governance/users/:id`.
- عرض استخدام المستخدم ونشاطه عبر `GET /api/v1/governance/users/:id/usage` و`GET /api/v1/governance/audit/user/:id`.
- عرض الفرق وإنشاؤها وقراءة الأعضاء عبر `GET|POST /api/v1/governance/teamwork` و`GET /api/v1/governance/teamwork/:id/members`.
- إضافة عضو وإزالته فعليًا عبر `POST|DELETE /api/v1/governance/teamwork/:id/members`.
- إنشاء أعلام الميزات وتحديثها وتقييمها وتعطيلها لمستخدم محدد عبر `GET|POST|PUT /api/v1/governance/feature-flags` و`POST /api/v1/governance/feature-flags/:id/rules` و`GET /api/v1/governance/feature-flags/evaluate`.
- تصدير سجل التدقيق فعليًا عبر `GET /api/v1/governance/audit/export?format=csv`.

## 2. fine-grained controls supported
- تعطيل ميزة لمستخدم محدد مدعوم فعليًا: الواجهة تستدعي `addFeatureFlagRule()` ثم `evaluateFeatureFlag()` وتعرض النتيجة `نتيجة المستخدم المفتوح: معطلة`.
- تبديل حالة العلم بالكامل أو عكس القيمة الافتراضية مدعوم عبر `updateFeatureFlag()`.
- تعديل دور المستخدم وحالته مدعوم عبر `updateUser()`.
- إضافة المستخدم المفتوح إلى فريق أو إزالته من الفريق مدعوم فعليًا عبر `teamwork`.

## 3. user/group visibility supported
- بطاقة المستخدم تعرض الاسم والبريد والدور والحالة وآخر تحديث.
- نافذة ملف المستخدم تعرض مؤشرات الاستخدام الحقيقية: المشاريع، النشاط، مجموعات البيانات، لوحات المؤشرات، التقارير، العروض.
- حقل `filesTracked` ظاهر لكن ليس مدعومًا فعليًا؛ الباكند يعيد `availability.filesTracked=false` و`filesTracked=null`، والواجهة تعرض `غير مدعوم` بدل ادعاء كاذب.
- الفرق تعرض الاسم والوصف وتاريخ الإنشاء، ونافذة الأعضاء تعرض العدد الفعلي والأعضاء الحاليين من `teamwork`.

## 4. Rasid training/admin supported
- المدعوم فعليًا الآن داخل مركز راصد الإداري هو التحكم بسلوك راصد عبر `Feature Flags` وتقييم النتيجة على مستوى المستخدم المفتوح.
- غير المدعوم فعليًا ومثبت كحاجز حقيقي:
- ربط معرفة/مكتبة لتدريب راصد: لا يوجد route فعلي، والتحقق الخام أعاد `404` لمسار `/api/v1/governance/rasid-training/library/test`.
- تدريب راصد على الوصفات وسير العمل: لا يوجد route فعلي في `governance-service`.
- ملفات مستخدم user-scoped من Surface الإعدادات: لا يوجد route فعلي من نوع `/api/v1/governance/users/:id/files`.

## 5. services/APIs used
- الواجهة: [frontend/app/(dashboard)/settings/page.tsx](C:/DATA_AI/rasid/frontend/app/(dashboard)/settings/page.tsx)
- عميل الحوكمة: [frontend/lib/api/governance.ts](C:/DATA_AI/rasid/frontend/lib/api/governance.ts)
- تشغيل المستخدمين والاستخدام: [services/governance-service/src/index.ts](C:/DATA_AI/rasid/services/governance-service/src/index.ts)
- سجل التدقيق وسير العمل والحوكمة الأساسية: [services/governance-service/src/routes/governance.routes.ts](C:/DATA_AI/rasid/services/governance-service/src/routes/governance.routes.ts)
- الفرق: [services/governance-service/src/routes/teamwork.ts](C:/DATA_AI/rasid/services/governance-service/src/routes/teamwork.ts) و[services/governance-service/src/services/teamwork.ts](C:/DATA_AI/rasid/services/governance-service/src/services/teamwork.ts)
- أعلام الميزات: [services/governance-service/src/routes/feature-flags.ts](C:/DATA_AI/rasid/services/governance-service/src/routes/feature-flags.ts) و[services/governance-service/src/services/feature-flags.service.ts](C:/DATA_AI/rasid/services/governance-service/src/services/feature-flags.service.ts)

## 6. Arabic/RTL implementation
- الصفحة تعمل بـ `dir="rtl"` والنصوص التشغيلية والأزرار والرسائل عربية افتراضيًا.
- رسائل النجاح والتحذير والتعطيل والتصدير من الواجهة عربية: `تم تحديث المستخدم...`, `تم إنشاء الفريق...`, `تم تعطيل ... للمستخدم المفتوح.`, `تم تصدير السجل بحجم ...`.
- القدرات غير المدعومة تظهر كعوائق صريحة بالعربية داخل `مركز راصد الإداري` بدل إيهام المستخدم بتحكمات مزيفة.

## 7. raw verification results
- الملف الخام: [phase8_commands.txt](C:/DATA_AI/rasid/verification_run/raw_outputs/phase8_commands.txt)
- الملف الخام: [phase8_browser_results.json](C:/DATA_AI/rasid/verification_run/raw_outputs/phase8_browser_results.json)
- التحقق الخام من الـ API أثبت:
- `firstUser = home-test@rasid.demo`
- `teamMembers = 1` بعد إضافة المستخدم إلى فريق جديد عبر API
- `flagEvaluation = false` بعد إنشاء Rule خاصة بالمستخدم
- `auditExportBytes = 177528`
- `blockedTrainingRouteStatus = 404`
- التحقق من الواجهة أثبت:
- حفظ المستخدم: `تم تحديث المستخدم Home Test.`
- إنشاء الفريق من الواجهة: `تم إنشاء الفريق فريق المرحلة 8 1773068088846 فعليًا.`
- إضافة المستخدم المفتوح للفريق: `تمت إضافة Home Test إلى الفريق.`
- إزالة العضو: `تمت إزالة العضو.`
- تعطيل علم لمستخدم محدد: `تم تعطيل ui_phase8_flag_1773068182037 للمستخدم المفتوح.` مع ظهور `نتيجة المستخدم المفتوح: معطلة`
- تصدير التدقيق من الواجهة: `تم تصدير السجل بحجم 174 KB.`
- لا توجد اختبارات خدمة مخصصة داخل `services/governance-service` خارج `node_modules`، وهذه فجوة اختبار لكنها لم تمنع التحقق التشغيلي الحي.

## 8. defects fixed
- لا يوجد تدفق مزيف نشط في Surface الإعدادات ضمن النطاق الحالي، ولم يتطلب هذا الطور تعديل كود جديد.
- تم التثبت من أن عناصر التدريب غير المدعومة ليست أزرار حفظ شكلية؛ بل معروضة كعوائق صريحة ومسنودة بفشل route حقيقي `404`.
- تم التثبت من أن مؤشر `filesTracked` لا يدّعي دعماً غير موجود، لأن الواجهة تعرض `غير مدعوم` عندما يعيد الباكند `availability.filesTracked=false`.

## 9. phase status
- PASS
