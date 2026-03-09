# Surface Evidence Pack

## 1. Surface name
Data

## 2. Exact route
`/data`
`/data/:id`

## 3. Exact user action performed in UI
1. فتح `http://localhost/data` بجلسة مصادق عليها للمستخدم `admin`.
2. انتظار تحميل عدادات الصفحة وقائمة `مجموعات البيانات`.
3. رفع الملف `data-ui-upload-20260309-093524.csv` من مربع `رفع واستقبال البيانات`.
4. فتح مجموعة البيانات الجديدة من القائمة.
5. مراجعة تبويب `البيانات`.
6. فتح تبويب `إحصائيات الأعمدة`.
7. الضغط على `JSON` لتصدير المخرجات.

## 4. Exact API endpoint(s) invoked
```text
GET /api/v1/data/sources?page=1&limit=10
POST /api/v1/data/import/single
GET /api/v1/data/sources/04cd2779-dafa-4ec6-8954-c03dd6bfef22
GET /api/v1/data/sources/04cd2779-dafa-4ec6-8954-c03dd6bfef22/rows?page=1&limit=50
GET /api/v1/data/sources/04cd2779-dafa-4ec6-8954-c03dd6bfef22/statistics
GET /api/v1/data/sources/04cd2779-dafa-4ec6-8954-c03dd6bfef22/export/json
```

## 5. Exact backend/service/module executed
```text
GET /api/v1/data/sources
- services/data-service/src/routes/sources.routes.ts -> router.get('/')
- services/data-service/src/controllers/sources.controller.ts -> list()
- services/data-service/src/services/sources.service.ts -> listDatasets()

POST /api/v1/data/import/single
- services/data-service/src/routes/import.routes.ts -> router.post('/single')
- services/data-service/src/controllers/import.controller.ts -> importFile()
- services/data-service/src/controllers/import.controller.ts -> getImportMethod('csv')
- services/data-service/src/services/import.service.ts -> importCSV()
- services/data-service/src/services/import.service.ts -> insertDataset()
- services/data-service/src/services/import.service.ts -> insertColumns()
- services/data-service/src/services/import.service.ts -> insertRows()
- services/data-service/src/services/import.service.ts -> insertIngestionJob()
- services/data-service/src/services/import.service.ts -> indexElastic()

GET /api/v1/data/sources/:id
- services/data-service/src/routes/sources.routes.ts -> router.get('/:id')
- services/data-service/src/controllers/sources.controller.ts -> get()
- services/data-service/src/services/sources.service.ts -> getDataset()

GET /api/v1/data/sources/:id/rows
- services/data-service/src/routes/sources.routes.ts -> router.get('/:id/rows')
- services/data-service/src/controllers/sources.controller.ts -> getRows()
- services/data-service/src/services/sources.service.ts -> getDatasetRows()

GET /api/v1/data/sources/:id/statistics
- services/data-service/src/routes/sources.routes.ts -> router.get('/:id/statistics')
- services/data-service/src/controllers/sources.controller.ts -> statistics()
- services/data-service/src/services/sources.service.ts -> getStatistics()

GET /api/v1/data/sources/:id/export/json
- services/data-service/src/routes/sources.routes.ts -> router.get('/:id/export/json')
- services/data-service/src/controllers/sources.controller.ts -> exportJSON()
- services/data-service/src/services/sources.service.ts -> exportJSON()
```

## 6. Exact real output produced
```text
قبل رفع واجهة Data:
- عدادات الصفحة: 50 مجموعات بيانات / 10 معروضة الآن / 3 تنسيقات في الصفحة
- أعلى عنصر في القائمة: data-surface-api-20260309-093524

بعد رفع واجهة Data:
- رسالة الرفع: data-ui-upload-20260309-093524.csv: 3 صف، 3 عمود
- عدادات الصفحة: 51 مجموعات بيانات / 10 معروضة الآن / 3 تنسيقات في الصفحة
- أعلى عنصر في قائمة /data: data-ui-upload-20260309-093524 | csv | 3 صف | 3 عمود
- أعلى عنصر في الشريط الجانبي: data-ui-upload-20260309-093524 | CSV | 3 صف | 3 عمود

داخل /data/04cd2779-dafa-4ec6-8954-c03dd6bfef22:
- العنوان: data-ui-upload-20260309-093524
- تبويب البيانات: Riyadh / 15 / 0.42 ثم Jeddah / 11 / 0.35 ثم Abha / 7 / 0.28
- تبويب الإحصائيات:
  region -> 3 قيم فريدة / 0 قيم فارغة
  orders -> min 7 / max 15 / mean 11
  margin -> min 0.28 / max 0.42 / mean 0.35
- نتيجة التصدير: تم تصدير البيانات بصيغة JSON
```

## 7. Exact persisted result or returned business result
```text
رد API المباشر لرفع التكامل:
{
  "uploaded_id": "2a51de53-a87c-49a6-9916-5b037fad1274",
  "uploaded_name": "data-surface-api-20260309-093524",
  "uploaded_rows": 3,
  "uploaded_columns": 3,
  "detail_name": "data-surface-api-20260309-093524",
  "rows_first_city": "Riyadh",
  "stats_revenue_mean": 956.67,
  "stats_employees_max": 42,
  "search_total": 1
}

رد API المباشر لمجموعة واجهة Data:
{
  "ui_id": "04cd2779-dafa-4ec6-8954-c03dd6bfef22",
  "ui_name": "data-ui-upload-20260309-093524",
  "ui_rows": 3,
  "ui_columns": 3,
  "ui_margin_mean": 0.35,
  "ui_orders_min": 7,
  "ui_orders_max": 15
}

إثبات persistence من PostgreSQL:
name                             | row_count | actual_rows
data-surface-api-20260309-093524 | 3         | 3
data-ui-upload-20260309-093524   | 3         | 3
```

## 8. UI test proof
```text
Command:
npm run type-check --prefix frontend

Result:
tsc --noEmit -> PASS

Playwright UI proof:
- /data showed 51 / 10 / 3 after the UI upload
- upload feedback rendered: data-ui-upload-20260309-093524.csv: 3 صف، 3 عمود
- /data list and sidebar both moved data-ui-upload-20260309-093524 to the top
- /data/04cd2779-dafa-4ec6-8954-c03dd6bfef22 rendered the 3 data rows
- stats tab rendered live statistics from GET /statistics
- export toast rendered: تم تصدير البيانات بصيغة JSON
- screenshot: C:\DATA_AI\rasid\data-surface-after.png
- browser console errors after final state: 0
```

## 9. API test proof
```text
PowerShell result against live gateway:
{
  "list_before_total": 49,
  "list_before_first": "home-ui-upload-20260309",
  "uploaded_id": "2a51de53-a87c-49a6-9916-5b037fad1274",
  "uploaded_name": "data-surface-api-20260309-093524",
  "uploaded_rows": 3,
  "uploaded_columns": 3,
  "detail_name": "data-surface-api-20260309-093524",
  "detail_format": "CSV",
  "rows_total": 3,
  "rows_first_city": "Riyadh",
  "stats_total_rows": 3,
  "stats_revenue_mean": 956.67,
  "stats_employees_max": 42,
  "search_total": 1,
  "search_first": "data-surface-api-20260309-093524",
  "export_size": 216
}

Direct list result after UI upload:
{
  "top_dataset": "data-ui-upload-20260309-093524",
  "top_dataset_rows": 3,
  "top_dataset_columns": 3,
  "datasets_total": 51
}
```

## 10. Integration test proof
```text
1. POST /api/v1/data/import/single with data-surface-api-20260309-093524.csv -> dataset 2a51de53-a87c-49a6-9916-5b037fad1274
2. GET /api/v1/data/sources?page=1&limit=5&search=data-surface-api-20260309-093524 -> total=1
3. GET /api/v1/data/sources/2a51de53-a87c-49a6-9916-5b037fad1274/rows?page=1&limit=50 -> Riyadh / Jeddah / Dammam
4. GET /api/v1/data/sources/2a51de53-a87c-49a6-9916-5b037fad1274/statistics -> revenue mean 956.67, employees max 42
5. GET /api/v1/data/sources/2a51de53-a87c-49a6-9916-5b037fad1274/export/json -> file length 216 bytes
6. PostgreSQL verification -> both imported datasets persisted with row_count=3 and actual_rows=3
```

## 11. End-to-end test proof
```text
Playwright network trace from Data surface:
[GET] http://localhost/api/v1/data/sources?page=1&limit=10 => [200] OK
[POST] http://localhost/api/v1/data/import/single => [201] Created
[GET] http://localhost/api/v1/data/sources?page=1&limit=10 => [200] OK
[GET] http://localhost/api/v1/data/sources/04cd2779-dafa-4ec6-8954-c03dd6bfef22 => [200] OK
[GET] http://localhost/api/v1/data/sources/04cd2779-dafa-4ec6-8954-c03dd6bfef22/rows?page=1&limit=50 => [200] OK
[GET] http://localhost/api/v1/data/sources/04cd2779-dafa-4ec6-8954-c03dd6bfef22/statistics => [200] OK
[GET] http://localhost/api/v1/data/sources/04cd2779-dafa-4ec6-8954-c03dd6bfef22/export/json => [200] OK

Observed E2E business effect inside /data and /data/:id:
- dataset counter increased from 50 to 51
- new dataset data-ui-upload-20260309-093524 became first item in the main list and sidebar
- detail route rendered the imported rows without fallback data
- stats route section rendered backend-calculated min/max/mean values
- export produced data-ui-upload-20260309-093524.json with downloaded size 209 bytes
```

## 12. Before/after proof
```text
Before code change:
- frontend/app/(dashboard)/data/page.tsx imported useSourceLibraryStore and rendered counts/sidebar from local store only
- frontend/app/(dashboard)/data/page.tsx called addFiles(...) before any API result
- frontend/app/(dashboard)/data/page.tsx catch block returned fake success text: تم حفظه محلياً
- frontend/app/(dashboard)/data/page.tsx called getDataSources() even though /api/v1/data/sources is the datasets endpoint
- frontend/lib/api/data.ts used non-existent routes: /datasets/:id, /datasets/:id/rows, /datasets/:id/export, /datasets/:id/columns/:columnName/stats
- frontend/app/(dashboard)/data/[id]/page.tsx did not call the real statistics endpoint

After code change:
- frontend/app/(dashboard)/data/page.tsx removed SourceContextBanner and all useSourceLibraryStore dependencies from the accepted Data surface
- /data counts, main list, and sidebar now read only from live GET /api/v1/data/sources
- upload feedback now reports only real API success or real API error from POST /api/v1/data/import/single
- frontend/lib/api/data.ts now maps live routes: /sources, /sources/:id, /sources/:id/rows, /sources/:id/statistics, /sources/:id/export/*
- frontend/app/(dashboard)/data/[id]/page.tsx now calls the real statistics endpoint and renders its output

Before runtime state on /data:
- counters: 50 / 10 / 3
- top dataset: data-surface-api-20260309-093524

After runtime state on /data:
- counters: 51 / 10 / 3
- top dataset: data-ui-upload-20260309-093524
```

## 13. Explicit status
IMPLEMENTED
