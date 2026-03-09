# Surface Evidence Pack

## 1. Surface name
Analysis

## 2. Exact route
`/analysis`

## 3. Exact user action performed in UI
فتح `http://localhost/analysis` ثم اختيار مجموعة البيانات `analysis-surface-20260309-094817` ثم الضغط على زر `تشغيل التحليل`.

## 4. Exact API endpoint(s) invoked
`GET http://localhost/api/v1/dashboard/dashboards?page=1&limit=1`
`GET http://localhost/api/v1/data/sources?page=1&limit=8`
`POST http://localhost/api/v1/dashboard/analyze-data`

## 5. Exact backend/service/module executed
`C:\DATA_AI\rasid\frontend\app\(dashboard)\analysis\page.tsx`
`C:\DATA_AI\rasid\frontend\lib\api\dashboard.ts`
`C:\DATA_AI\rasid\frontend\lib\api\data.ts`
`C:\DATA_AI\rasid\services\dashboard-service\src\routes\auto-dashboard.routes.ts`
`C:\DATA_AI\rasid\services\dashboard-service\src\controllers\auto-dashboard.controller.ts`
`C:\DATA_AI\rasid\services\dashboard-service\src\services\auto-dashboard-generator.service.ts`
`C:\DATA_AI\rasid\services\data-service\src\routes\sources.routes.ts`

## 6. Exact real output produced
`POST /api/v1/dashboard/analyze-data` أعاد `success: true` مع `rowCount: 4`, `columnCount: 5`, `dateColumns: ["report_date"]`, `numericColumns: ["margin","orders","revenue"]`, `kpiRecommendations.length = 8`, `chartRecommendations.length = 8`.
الخرج الفعلي تضمن `إجمالي revenue`, `إجمالي orders`, `تطور margin عبر report_date`, `margin حسب region`, و`report_date` بنوع `date`.

## 7. Exact persisted result or returned business result
النتيجة التجارية المرتجعة من الـ API كانت تحليلًا حيًا للمجموعة `35c425ab-6937-4fa1-995f-a9c17fd9632d` المخزنة في جدول `datasets` مع صفوفها في `data_rows`.
قاعدة البيانات أعادت للمجموعة نفسها `row_count = 4`, `column_count = 5`, و`schema_json` يحتوي الأعمدة `report_date`, `region`, `revenue`, `orders`, `margin`.

## 8. UI test proof
تم تنفيذ Playwright على `http://localhost/analysis`.
بعد الضغط على `تشغيل التحليل` أظهرت الصفحة `بيانات متاحة: 8`, `لوحات موجودة: 7`, `توصيات رسوم: 8`, والمجموعة الحالية `analysis-surface-20260309-094817`.
ظهر في الصفحة `مؤشرات KPI المقترحة` و`توصيات الرسوم البيانية` و`بروفايل الأعمدة` مع القيم الحية `revenue = 4360`, `orders = 53`, و`report_date` بنوع `تاريخ`.

## 9. API test proof
تم تشغيل:
`Invoke-RestMethod -Method Post -Uri 'http://localhost/api/v1/dashboard/analyze-data' -Headers @{ Authorization = 'Bearer <token>' } -ContentType 'application/json' -Body '{"datasetId":"35c425ab-6937-4fa1-995f-a9c17fd9632d","preferredChartTypes":["line_chart","bar_chart","pie_chart"]}'`
والاستجابة الفعلية كانت `success: true` وأعادت `line_chart`, `bar_chart`, `pie_chart`, `scatter_plot`, `area_chart`, `gauge` مع بروفايل حي للبيانات.

## 10. Integration test proof
تم تشغيل:
`npm test --prefix services/dashboard-service -- auto-dashboard.controller.test.ts auto-dashboard-generator.service.test.ts --runInBand`
النتيجة الفعلية:
`PASS src/__tests__/services/auto-dashboard-generator.service.test.ts`
`PASS src/__tests__/controllers/auto-dashboard.controller.test.ts`
`Test Suites: 2 passed, 2 total`
`Tests: 3 passed, 3 total`

## 11. End-to-end test proof
سجل Playwright للشبكة بعد تنفيذ المستخدم في `/analysis` احتوى:
`[GET] http://localhost/api/v1/dashboard/dashboards?page=1&limit=1 => [200] OK`
`[GET] http://localhost/api/v1/data/sources?page=1&limit=8 => [200] OK`
`[POST] http://localhost/api/v1/dashboard/analyze-data => [200] OK`
وسجل الخدمة الحي أكد تنفيذ الاستعلامين:
`SELECT id, name, schema_json::text AS schema_json FROM datasets WHERE id = $1`
`SELECT data FROM data_rows WHERE dataset_id = $1 ORDER BY row_index ASC LIMIT 1000`

## 12. Before/after proof
قبل الإصلاح كان السجل الحي في `dashboard-service` يسجل:
`SELECT id, name, columns FROM datasets WHERE id = $1`
ثم يفشل بـ `PRISMA_P2010` و`column "columns" does not exist`.
بعد الإصلاح صار السجل الحي يسجل:
`SELECT id, name, schema_json::text AS schema_json FROM datasets WHERE id = $1`
و`SELECT data FROM data_rows WHERE dataset_id = $1 ORDER BY row_index ASC LIMIT 1000`
ثم عاد `/api/v1/dashboard/analyze-data` بنتيجة `success: true`، وأصبحت الصفحة تعرض بروفايلًا حيًا وتوصيات فعلية بدل الفشل.

## 13. Explicit status
IMPLEMENTED
