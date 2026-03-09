# 1. Content/identity controls supported
- المسار التشغيلي الحقيقي في `/settings` يدير اسم المنصة والشعار وعنوان الرأس ونص التذييل وعناصر `visualIdentity` عبر `AppearanceControlPanel`.
- الحفظ الفعلي يتم عبر `PUT /api/v1/dashboard/appearance` من [frontend/components/settings/AppearanceControlPanel.tsx] و[frontend/lib/api/appearance.ts].
- القراءة الفعلية تتم عبر `GET /api/v1/dashboard/appearance` و`GET /api/v1/dashboard/themes`.
- الوضع الفاتح/الداكن وتفضيل الثيم للمستخدم يحفظان فعليًا عبر `PATCH /api/v1/governance/users/:id` في `persistUserAppearancePreferences`.

## 2. User/group/permission controls supported
- إدارة المستخدمين الفعلية تعمل من `/settings` عبر `GET /api/v1/governance/users`, `GET /api/v1/governance/users/:id`, `PATCH /api/v1/governance/users/:id`, `GET /api/v1/governance/users/:id/usage`, `GET /api/v1/governance/audit/user/:id`.
- إدارة الفرق والمجموعات تعمل عبر `GET /api/v1/governance/teamwork`, `POST /api/v1/governance/teamwork`, `GET /api/v1/governance/teamwork/:id/members`, `POST /api/v1/governance/teamwork/:id/members`, `DELETE /api/v1/governance/teamwork/:id/members/:userId`.
- التحكم الصلاحي المدعوم فعليًا من هذا السطح هو تعديل `role/status` للمستخدم وتعطيل ميزات على مستوى مستخدم محدد بأعلام المزايا؛ مسار الأدوار المرجعي `/api/v1/governance/roles` ما زال غير صالح للاعتماد في هذا السطح.

## 3. Feature-level controls supported
- أعلام المزايا تعمل فعليًا عبر `GET /api/v1/governance/feature-flags`, `POST /api/v1/governance/feature-flags`, `PUT /api/v1/governance/feature-flags/:id`, `POST /api/v1/governance/feature-flags/:id/rules`, `GET /api/v1/governance/feature-flags/evaluate`.
- الواجهة تدعم إنشاء علم جديد، تفعيل/إيقاف، قلب القيمة الافتراضية، وتعطيل الميزة للمستخدم المفتوح مع تقييم فوري.

## 4. Import/export capabilities supported
- التصدير الإداري الحقيقي المتاح من `Settings` هو `GET /api/v1/governance/audit/export?format=csv` ويُستدعى من زر `settings-export-audit`.
- الاستيراد الإداري الحقيقي المتاح لراصد هو إدخال ملفات المعرفة إلى قواعد المعرفة عبر `POST /api/v1/ai/rag/knowledge-bases/:id/ingest` من نفس سطح `Settings`.
- لا يوجد bulk import/export شامل لكل بيانات المنصة من هذا السطح؛ هذا غير مفعّل ويظل خارج المسار النشط.

## 5. Rasid training/admin capabilities supported
- أضيفت إدارة قواعد المعرفة الحقيقية إلى `Settings` عبر `GET /api/v1/ai/rag/knowledge-bases`, `POST /api/v1/ai/rag/knowledge-bases`, `POST /api/v1/ai/rag/knowledge-bases/:id/ingest`, `POST /api/v1/ai/rag/knowledge-bases/:id/query`.
- أضيفت إدارة قوالب السلوك/سير العمل الحقيقية إلى `Settings` عبر `GET /api/v1/ai/prompts?category=workflow`, `POST /api/v1/ai/prompts`, `POST /api/v1/ai/prompts/:id/version`, `POST /api/v1/ai/prompts/:id/test`.
- القوالب تمثل تدريب السلوك الموجّه والتحكم بالسلوك النصي لراصد، وقواعد المعرفة تمثل ربط المعرفة المخصصة الفعلي.
- نشر نماذج fine-tuned أو registry/deploy عبر `/api/training/*` يظل محجوبًا لأن تلك الطبقة تعتمد جداول غير متاحة في schema الحالي لـ `ai-service`.

## 6. Services/APIs/modules used
- الواجهة: `frontend/app/(dashboard)/settings/page.tsx`, `frontend/components/settings/AppearanceControlPanel.tsx`, `frontend/lib/api/governance.ts`, `frontend/lib/api/appearance.ts`, `frontend/lib/api/rasid-admin.ts`.
- الحوكمة: `services/governance-service/src/index.ts`, `services/governance-service/src/routes/governance.routes.ts`, `services/governance-service/src/routes/teamwork.ts`, `services/governance-service/src/routes/feature-flags.ts`, `services/governance-service/src/services/teamwork.ts`, `services/governance-service/src/services/feature-flags.service.ts`, `services/governance-service/src/services/audit.service.ts`.
- الهوية البصرية: `services/dashboard-service/src/routes/dashboard.routes.ts`, `services/dashboard-service/src/services/platform-appearance.service.ts`, `services/dashboard-service/src/services/theme-engine.service.ts`.
- تدريب/إدارة راصد: `services/ai-service/src/routes/ai.routes.ts`, `services/ai-service/src/services/rag-engine.service.ts`, `services/ai-service/src/services/prompt-management.service.ts`.

## 7. Real output proof
- `GET /api/v1/ai/prompts?category=workflow` بعد الإصلاح أعاد:
  - `success: true`
  - `prompts[0].name: "سير عمل تقريري"`
  - `prompts[0].version: 1`
- `POST /api/v1/ai/prompts` ثم `POST /api/v1/ai/prompts/:id/version` ثم `POST /api/v1/ai/prompts/:id/test` أعادت:
  - إنشاء القالب `قالب تشغيل إداري`
  - إنشاء إصدار `2`
  - `renderedPrompt: "حوّل اعتماد هوية المنصة إلى خطوات عربية تنفيذية مع مخرجات ومخاطر."`
  - `tokensUsed: 613`
  - استجابة عربية تفصيلية حقيقية من النموذج
- `POST /api/v1/ai/rag/knowledge-bases` ثم `POST /api/v1/ai/rag/knowledge-bases/:id/ingest` ثم `POST /api/v1/ai/rag/knowledge-bases/:id/query` أعادت:
  - قاعدة معرفة `سياسات راصد الإدارية`
  - `chunkCount: 1`
  - `indexedCount: 1`
  - جواب عربي: `الخطوات المذكورة في الملف هي... [Source 1]`
  - مصدر فعلي `instruction_ar.txt`
- واجهة `/settings` أظهرت مباشرة:
  - `تم إنشاء قاعدة المعرفة واجهة معرفة إدارية.`
  - `تم تنفيذ الاستعلام على قاعدة المعرفة وإرجاع 1 مصدرًا.`
  - `تم اختبار القالب وإرجاع استجابة حقيقية باستهلاك 587 رمزًا.`

## 8. Test proof
- `npm run type-check --prefix frontend` مر بنجاح.
- `npx jest --config jest.config.ts src/__tests__/training-center.test.ts --runInBand` داخل `services/ai-service` مر بنجاح:
  - `Test Suites: 1 passed, 1 total`
  - `Tests: 27 passed, 27 total`
- تحقق واجهة فعلي عبر Playwright على `/settings`:
  - إنشاء قاعدة معرفة من الواجهة
  - استعلام قاعدة المعرفة من الواجهة
  - اختبار قالب سلوك من الواجهة

## 9. Before/after proof
- قبل الإصلاح:
  - `GET /api/v1/ai/prompts?category=workflow` كان يفشل بـ `DB_VALIDATION_ERROR` بسبب استخدام `tenant_id` بدل `tenantId` في `prompt-management.service.ts`.
  - `Settings` كان يعرض `مركز راصد الإداري` كتنبيه وصفي فقط مع `blockedCapabilities` من دون أي ربط فعلي لقواعد المعرفة أو القوالب.
  - اختبار `training-center.test.ts` لم يكن يعمل من `ai-service` بسبب إعداد Jest غير المتوافق مع `tsconfig` المحلي وتوقعات قديمة.
- بعد الإصلاح:
  - أضيفت مسارات قراءة فعلية لقواعد المعرفة إلى `ai.routes.ts`.
  - أصلحت `prompt-management.service.ts` و`rag-engine.service.ts` لاستخدام حقول Prisma الصحيحة مثل `tenantId`, `usageCount`, `isActive`, `indexName`, `createdBy`.
  - أضيف عميل `frontend/lib/api/rasid-admin.ts`.
  - صار `Settings` يقرأ ويُنشئ ويُصدر نسخ قوالب ويختبرها ويُنشئ قواعد معرفة ويستعلم عنها عبر backend حقيقي.
  - صار `training-center.test.ts` يمر بالكامل بعد تصحيح التهيئة والبيانات الاختبارية إلى UUIDs صحيحة وتوقعات الجودة المتوافقة مع الخدمة.

## 10. Explicit status:
IMPLEMENTED
