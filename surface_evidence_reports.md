# Surface Evidence Pack

## 1. Surface name
Reports

## 2. Exact route
/reports

## 3. Exact user action performed in UI
على `/reports` تم إدخال الاسم `UI Reports Surface 2026-03-09 10-26` في `reports-name-input` مع بقاء مجموعة البيانات `analysis-surface-20260309-094817` محددة في `reports-dataset-select`، ثم تم الضغط على `reports-create-build`، ثم `reports-export-html`، ثم `reports-schedule-save`.

## 4. Exact API endpoint(s) invoked
من الواجهة الفعلية تم استدعاء `GET /api/v1/data/sources?page=1&limit=12` و`GET /api/v1/data/sources/35c425ab-6937-4fa1-995f-a9c17fd9632d` و`GET /api/v1/data/sources/35c425ab-6937-4fa1-995f-a9c17fd9632d/rows?page=1&limit=20` و`POST /api/v1/reporting/reports` و`POST /api/v1/reporting/reports/19389535-c492-424d-8910-bb817f8abeb6/sections` مرتين و`POST /api/v1/reporting/reports/19389535-c492-424d-8910-bb817f8abeb6/build` و`GET /api/v1/reporting/reports/19389535-c492-424d-8910-bb817f8abeb6/export/html` و`POST /api/v1/reporting/reports/19389535-c492-424d-8910-bb817f8abeb6/schedule` و`GET /api/v1/reporting/reports/19389535-c492-424d-8910-bb817f8abeb6`.

## 5. Exact backend/service/module executed
الواجهة نفذت عبر `frontend/app/(dashboard)/reports/page.tsx` و`frontend/lib/api/reporting.ts`. القراءة المساندة للبيانات نفذت عبر `services/data-service/src/routes/sources.routes.ts` و`services/data-service/src/services/sources.service.ts`. البناء والتعريف والتنزيل والجدولة نفذت عبر `services/reporting-service/src/routes/reporting.routes.ts` و`services/reporting-service/src/services/report-builder.service.ts` و`services/reporting-service/src/services/template-engine.service.ts` و`services/reporting-service/src/services/scheduled-reports.service.ts` و`services/reporting-service/src/services/report-runtime-record.service.ts`.

## 6. Exact real output produced
بناء الواجهة أنتج `buildId 8622c457-912d-4b9b-8f7d-2e666643ec39` مع قسمين فعليين. تصدير الواجهة أنتج ملف HTML حقيقي باسم `UI Reports Surface 2026-03-09 10-26.html` وتم تنزيله من المتصفح. سجل الصفحة بعد البناء عرض جدولًا فعليًا بصفوف `2026-01-01 Riyadh 1200 15 0.42` و`2026-01-02 Jeddah 980 11 0.35` و`2026-01-03 Dammam 760 9 0.31` و`2026-01-04 Riyadh 1420 18 0.46`. تحقق الـ API الحي أنتج أيضًا HTML بطول `1733` بايت وPDF بحجم `1788` بايت للتقرير `0d985577-6e55-48a8-8bba-fac6e0787793`.

## 7. Exact persisted result or returned business result
في PostgreSQL تم حفظ `report_definitions.id = 19389535-c492-424d-8910-bb817f8abeb6` بالحالة `BUILT`. وتم حفظ صف مرآة في `reports.id = 19389535-c492-424d-8910-bb817f8abeb6` بالنوع `definition`. وتم حفظ `report_build_outputs` للتقرير نفسه بصيغتي `HTML` بحجم `3062` بايت و`JSON` بالحالة `COMPLETED`. وتم حفظ `report_schedules.id = 851a47e3-a23f-4005-8820-f4b86035bce5` بالقيمة `cron_expression = 0 8 * * 1` والحالة `active`.

## 8. UI test proof
تم تشغيل Playwright على `http://localhost/reports` بعد حقن `rasid_token` و`rasid_refresh_token` و`rasid_user` في `localStorage`. النتيجة الراجعة من تنفيذ الواجهة كانت `href = http://localhost/reports` و`reportName = UI Reports Surface 2026-03-09 10-26` وظهور رسالة `تم حفظ الجدولة عبر reporting-service.` مع تنزيل ملف `UI Reports Surface 2026-03-09 10-26.html`.

## 9. API test proof
تم تنفيذ سلسلة API الحية عبر PowerShell للتقرير `0d985577-6e55-48a8-8bba-fac6e0787793` وانتهت بالقيم `BuildStatus = completed` و`BuildSectionCount = 2` و`DetailSections = 2` و`DetailOutputs = 1` و`ScheduleStatus = active` و`HtmlLength = 1733` و`PdfBytes = 1788`.

## 10. Integration test proof
تم تشغيل `npm test --prefix services/reporting-service -- report-builder.service.test.ts scheduled-reports.service.test.ts --runInBand` ونجحت الحزمتان `PASS src/__tests__/services/report-builder.service.test.ts` و`PASS src/__tests__/services/scheduled-reports.service.test.ts`.

## 11. End-to-end test proof
سجل طلبات Playwright بعد تنفيذ إجراءات الواجهة أظهر استدعاءات ناجحة بالحالات الصحيحة: `POST /api/v1/reporting/reports => 201`, `POST /api/v1/reporting/reports/19389535-c492-424d-8910-bb817f8abeb6/sections => 201` مرتين, `POST /api/v1/reporting/reports/19389535-c492-424d-8910-bb817f8abeb6/build => 200`, `GET /api/v1/reporting/reports/19389535-c492-424d-8910-bb817f8abeb6/export/html => 200`, `POST /api/v1/reporting/reports/19389535-c492-424d-8910-bb817f8abeb6/schedule => 201`, ثم `GET /api/v1/reporting/reports/19389535-c492-424d-8910-bb817f8abeb6 => 200`.

## 12. Before/after proof
قبل الإصلاح كان سجل `reporting-service` في `2026-03-09 07:18:22` يسجل `Failed to fetch data from source` لنفس `datasetId = 35c425ab-6937-4fa1-995f-a9c17fd9632d` مع الخطأ `Cannot read properties of undefined (reading 'findUnique')`. بعد الإصلاح صار السجل في `2026-03-09 07:23:12` يسجل `Data fetched successfully` لنفس المجموعة ثم `Report build completed` و`Report scheduled successfully` و`HTML export completed` و`PDF export completed`. كما أن `Select-String` على `frontend/app/(dashboard)/reports/page.tsx` لم يرجع أي تطابق لـ `localStorage` أو `replication-session-store` أو `replication-generated-output-store` أو `/ai?`.

## 13. Explicit status
IMPLEMENTED
