# Rasid Embedded Assistant

## 1. Where the assistant was added in each surface
- Home: [frontend/app/(dashboard)/home/page.tsx](C:/DATA_AI/rasid/frontend/app/(dashboard)/home/page.tsx):1026
- Data: [frontend/app/(dashboard)/data/page.tsx](C:/DATA_AI/rasid/frontend/app/(dashboard)/data/page.tsx):161
- Analysis: [frontend/app/(dashboard)/analysis/page.tsx](C:/DATA_AI/rasid/frontend/app/(dashboard)/analysis/page.tsx):348
- Reports: [frontend/app/(dashboard)/reports/page.tsx](C:/DATA_AI/rasid/frontend/app/(dashboard)/reports/page.tsx):415
- Presentations: [frontend/app/(dashboard)/presentations/page.tsx](C:/DATA_AI/rasid/frontend/app/(dashboard)/presentations/page.tsx):235
- Library: [frontend/app/(dashboard)/library/page.tsx](C:/DATA_AI/rasid/frontend/app/(dashboard)/library/page.tsx):379
- Settings: [frontend/app/(dashboard)/settings/page.tsx](C:/DATA_AI/rasid/frontend/app/(dashboard)/settings/page.tsx):272
- Shared component: [frontend/components/assistant/EmbeddedRasidAssistant.tsx](C:/DATA_AI/rasid/frontend/components/assistant/EmbeddedRasidAssistant.tsx)

## 2. How surface context is detected
- كل صفحة تمرر `surfaceId`, `surfaceName`, `route`, و`contextSummary` و`contextItems` إلى المكوّن المضمن.
- كل صفحة تبني `actions` من state الحي الخاص بها فقط: counts, current selection, latest entity, current mode.
- مطابقة نية المستخدم تتم داخل [frontend/components/assistant/EmbeddedRasidAssistant.tsx](C:/DATA_AI/rasid/frontend/components/assistant/EmbeddedRasidAssistant.tsx) عبر `normalizeArabicText`, `findMatchingAction`, `isCapabilityPrompt`, و`isContextPrompt`.
- لا يوجد `localStorage`, `Map`, أو scripted answer لتوليد السياق؛ الرد يعتمد على حالة السطح الحالية والـ handlers الحقيقية الممررة من الصفحة.

## 3. What real actions are supported per surface
- Home: تحديث المؤشرات، بدء جلسة جديدة، فتح آخر مجموعة بيانات، وتمرير أول إجراءات Home الديناميكية الحقيقية إن وُجد ملف.
- Data: تحديث مجموعات البيانات، فتح أحدث مجموعة، فتح الاستيراد المتقدم، فتح المكتبة.
- Analysis: تحديث السطح، تشغيل التحليل على `datasetId` الحالي، فتح Surface البيانات.
- Reports: تحديث التقارير، إنشاء وبناء التقرير الحالي، إعادة بناء التقرير المحدد، تصدير PDF، حفظ الجدولة.
- Presentations: تحديث العروض، توليد العرض الحالي، إنشاء عرض فارغ، فتح أحدث عرض.
- Library: تحديث المكتبة، قراءة أحدث أصل، فتح الأصل المحدد عبر الرابط الموقّع، فتح Surface البيانات.
- Settings: تحديث الإعدادات المدعومة، قراءة أول مستخدم، تصدير سجل التدقيق.

## 4. How Arabic interaction is implemented
- كل النصوص الظاهرة في المساعد عربية افتراضيًا داخل المكوّن المضمن.
- placeholders, titles, buttons, prompts, action labels, result messages كلها عربية.
- تم تعريب ما بقي ظاهرًا في `Presentations` ضمن موضع المساعد نفسه مثل `Surface 5: Presentations` إلى `مساحة العروض التقديمية` و`Source Generator` إلى `توليد من المصدر` و`AI Generator` إلى `توليد ذكي`.

## 5. How RTL is handled
- المكوّن المضمن يضبط `dir="rtl"` على الجذر نفسه.
- الإدماج في الصفحات السبع بقي داخل أسطح أصلًا تعمل بـ `dir="rtl"`.
- تخطيط الرسائل, الأزرار, الشرائح النصية, وحقل الإدخال داخل المساعد مبني بمحاذاة يمين ومسارات عربية فقط.

## 6. What APIs/services the assistant uses
- Shared API path fix:
  - [frontend/lib/api/client.ts](C:/DATA_AI/rasid/frontend/lib/api/client.ts)
  - [frontend/next.config.js](C:/DATA_AI/rasid/frontend/next.config.js)
  - [docker-compose.yml](C:/DATA_AI/rasid/docker-compose.yml)
  - [docker-compose.override.yml](C:/DATA_AI/rasid/docker-compose.override.yml)
- Home:
  - `GET /api/v1/data/sources`
  - `GET /api/v1/reporting/reports`
  - `GET /api/v1/presentation/presentations`
  - `GET /api/v1/dashboard/dashboards`
- Data:
  - `GET /api/v1/data/sources`
- Analysis:
  - `GET /api/v1/dashboard/dashboards`
  - `GET /api/v1/data/sources`
  - `POST /api/v1/dashboard/analyze-data`
- Reports:
  - `GET /api/v1/reporting/reports`
  - `GET /api/v1/data/sources`
  - `POST /api/v1/reporting/reports`
  - `POST /api/v1/reporting/reports/:id/build`
  - `POST /api/v1/reporting/reports/:id/schedule`
  - `GET /api/v1/reporting/reports/:id/export/pdf`
- Presentations:
  - `GET /api/v1/presentation/presentations`
  - `POST /api/v1/presentation/source/from-text`
  - `POST /api/v1/presentation/ai/generate-from-text`
  - `POST /api/v1/presentation/presentations`
- Library:
  - `GET /api/v1/library/assets`
  - `GET /api/v1/library/folders/tree`
  - `GET /api/v1/library/assets/:id`
- Settings:
  - `GET /api/v1/governance/users`
  - `GET /api/v1/governance/users/:id`
  - `GET /api/v1/governance/audit`
  - `GET /api/v1/governance/audit/export`

## 7. Test proof
- `npm run type-check --prefix frontend` passed on 2026-03-09.
- Docker runtime fix applied and frontend rebuilt with:
  - `docker compose up -d --build frontend`
- Real auth proof:
  - `POST /api/v1/governance/auth/login`
  - login success for `admin@rasid.demo` on 2026-03-09
- Playwright proof after real login and token storage:
  - `/home` assistant refreshed and returned `البيانات 52`, `التقارير 15`, `العروض 17`
  - `/data` assistant refreshed and returned `المجموع الحالي 52 مجموعة، والمعروض الآن 10`
  - `/analysis` assistant refreshed and returned `عدد المجموعات المتاحة الآن 8 وعدد لوحات المؤشرات 7`
  - `/reports` assistant refreshed and returned `يوجد الآن 12 تقرير و12 مصدر متاح`
  - `/presentations` assistant refreshed and returned `يوجد الآن 17 عرض بإجمالي 34 شريحة`
  - `/library` assistant refreshed and returned `يوجد الآن 6 أصل ظاهر و0 مجلد`
  - `/settings` assistant refreshed and returned `يوجد الآن 2 مستخدم و480 سجل تدقيق`
- Presence proof:
  - فتح المساعد وظهور `rasid-input-*` نجح على السطوح السبعة عبر Playwright.

## 8. Before/after proof
- قبل التعديل:
  - لم يكن هناك أي `EmbeddedRasidAssistant` في السطوح السبعة.
  - الـ frontend container كان يوجّه rewrites إلى `http://localhost:80` من داخل الحاوية، ما سبب `ECONNREFUSED` و`500`.
  - المتصفح كان يصطدم أولًا بـ CORS ثم proxy failure عند طلب `/api/v1/*`.
- بعد التعديل:
  - المكوّن المضمن أضيف فعليًا إلى الصفحات السبع في المواضع المذكورة في القسم 1.
  - مسار المتصفح أصبح same-origin عبر `BASE_URL=""` داخل المتصفح.
  - مسار Next server داخل الحاوية أصبح `INTERNAL_API_URL=http://gateway:80`.
  - بعد تسجيل الدخول الحقيقي، نجح تنفيذ أمر تحديث حقيقي واحد على الأقل داخل كل سطح عبر المساعد المضمن.

## 9. Explicit status
IMPLEMENTED
