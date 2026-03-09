## 1. Surface name
Reports

## 2. Exact route
`/reports`

## 3. Exact user action performed in UI
تم فتح `/reports` ثم إنشاء تقرير من الواجهة باسم `UI Reports Surface 2026-03-09 10-26`، ثم إضافة قسمين، ثم تنفيذ `build`، ثم `export html`، ثم حفظ جدولة بريدية.

## 4. Exact API endpoint(s) invoked
`GET /api/v1/data/sources?page=1&limit=12`
`POST /api/v1/reporting/reports`
`POST /api/v1/reporting/reports/:id/sections`
`POST /api/v1/reporting/reports/:id/build`
`GET /api/v1/reporting/reports/:id/export/html`
`POST /api/v1/reporting/reports/:id/schedule`
`GET /api/v1/reporting/reports/:id`

## 5. Exact backend/service/module executed
`frontend/app/(dashboard)/reports/page.tsx`
`frontend/lib/api/reporting.ts`
`services/reporting-service/src/routes/reporting.routes.ts`
`services/reporting-service/src/services/report-builder.service.ts`
`services/reporting-service/src/services/template-engine.service.ts`
`services/reporting-service/src/services/scheduled-reports.service.ts`
`services/reporting-service/src/services/report-runtime-record.service.ts`

## 6. Exact real output produced
الواجهة أنشأت تقريرًا فعليًا مع `buildId 8622c457-912d-4b9b-8f7d-2e666643ec39` وتصدير HTML حقيقي. التحقق الحي الحالي في `verification_run/raw_outputs/phase5_commands.txt` أعاد أيضًا تقريرًا مبنيًا بالاسم `تقرير تحقق تكامل المنصة 1500` مع `reportBuildStatus = completed` و`reportHtmlBytes = 19523`.

## 7. Exact persisted result or returned business result
`surface_evidence_reports.md` يثبت حفظ `report_definitions.id = 19389535-c492-424d-8910-bb817f8abeb6` بالحالة `BUILT` مع `report_schedules` فعال و`report_build_outputs` بصيغتي `HTML` و`JSON`.

## 8. UI test proof
إثبات Playwright محفوظ في `surface_evidence_reports.md` ويؤكد تنزيل `UI Reports Surface 2026-03-09 10-26.html` وظهور رسالة `تم حفظ الجدولة عبر reporting-service.`
`npm run type-check --prefix frontend` نجح في `verification_run/raw_outputs/phase5_commands.txt`.

## 9. API test proof
`verification_run/raw_outputs/phase5_commands.txt` يحتوي على:
`reportsTotal = 20`
`reportId = 675384da-f8c3-464c-9d30-98faea5ea55f`
`reportBuildStatus = completed`
`reportHtmlBytes = 19523`

## 10. Integration test proof
`npm test --prefix services/reporting-service -- report-builder.service.test.ts scheduled-reports.service.test.ts --runInBand`
النتيجة الفعلية: `PASS` للحزمتين و`2 passed, 2 total`.

## 11. End-to-end test proof
`surface_evidence_reports.md` يثبت تسلسل الشبكة الحي:
`POST /api/v1/reporting/reports => 201`
`POST /api/v1/reporting/reports/:id/sections => 201`
`POST /api/v1/reporting/reports/:id/build => 200`
`GET /api/v1/reporting/reports/:id/export/html => 200`
`POST /api/v1/reporting/reports/:id/schedule => 201`

## 12. Before/after proof
قبل الإصلاح كان السطح يعتمد على تدفقات محلية من `localStorage` ومسار `/ai` غير المعتمد، كما كان `reporting-service` يفتح عملاء Prisma داخل الطلبات ما سبّب `P2037`.
بعد الإصلاح أزيلت التدفقات المحلية من `/reports` وربط البناء والجدولة والتصدير فقط عبر `reporting-service`، وتم توحيد Prisma في الخدمة وإصلاح تطبيع صيغة الجدولة حتى عاد البناء والتصدير الفعليان للعمل.

## 13. Explicit status
IMPLEMENTED
