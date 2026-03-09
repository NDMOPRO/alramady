# Surface Evidence Pack

## 1. Surface name
Home

## 2. Exact route
`/home`

## 3. Exact user action performed in UI
1. فتح `http://localhost/home` بجلسة مصادق عليها للمستخدم `admin`.
2. انتظار تحميل بطاقات الإحصاء وقسم `أحدث مجموعات البيانات`.
3. رفع الملف `home-ui-upload-20260309.csv` من مربع `رفع سريع`.

## 4. Exact API endpoint(s) invoked
```text
GET /api/v1/data/sources?page=1&limit=8
GET /api/v1/reporting/reports?page=1&limit=1
GET /api/v1/presentation/presentations?page=1&limit=1
GET /api/v1/dashboard/dashboards?page=1&limit=1
POST /api/v1/data/import/single
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
- services/data-service/src/controllers/import.controller.ts -> getImportMethod('csv') -> importService.importCSV.bind(importService)
- services/data-service/src/services/import.service.ts -> importCSV()

GET /api/v1/reporting/reports
- services/reporting-service/src/routes/reporting.routes.ts -> router.get('/reports')
- services/reporting-service/src/routes/reporting.routes.ts -> prisma.reportDefinition.findMany()
- services/reporting-service/src/routes/reporting.routes.ts -> prisma.reportDefinition.count()

GET /api/v1/presentation/presentations
- services/presentation-service/src/routes/presentation.routes.ts -> router.get('/presentations')
- services/presentation-service/src/routes/presentation.routes.ts -> prisma.presentation.findMany()
- services/presentation-service/src/routes/presentation.routes.ts -> prisma.presentation.count()

GET /api/v1/dashboard/dashboards
- services/dashboard-service/src/routes/dashboard.routes.ts -> router.get('/dashboards')
- services/dashboard-service/src/routes/dashboard.routes.ts -> dashboardBuilder.listDashboards(...)
- services/dashboard-service/src/services/dashboard-builder.service.ts -> listDashboards()
```

## 6. Exact real output produced
```text
بطاقات Home بعد التحميل:
- مجموعة بيانات: 48 قبل رفع واجهة Home ثم 49 بعده
- تقرير: 9
- عرض: 7
- لوحة: 7

رسالة الرفع من Home:
home-ui-upload-20260309.csv: 2 صف، 3 عمود

قسم أحدث مجموعات البيانات بعد الرفع:
home-ui-upload-20260309 | CSV | 2 صف
home-surface-upload-20260309 | CSV | 3 صف
saudi_unis | CSV | 3 صف
```

## 7. Exact persisted result or returned business result
```text
رد API المباشر للرفع:
{
  "uploaded_id": "89c97abd-6850-4b25-9d7b-f65267e83334",
  "uploaded_name": "home-surface-upload-20260309",
  "uploaded_rows": 3,
  "uploaded_columns": 3,
  "listed_total": 1,
  "listed_name": "home-surface-upload-20260309"
}

إثبات persistence من PostgreSQL:
name                          | row_count | actual_rows
home-surface-upload-20260309  | 3         | 3
home-ui-upload-20260309       | 2         | 2
```

## 8. UI test proof
```text
Command:
npm run type-check --prefix frontend

Result:
tsc --noEmit -> PASS

Playwright UI proof on /home after Home upload:
- stats visible: 49 / 9 / 7 / 7
- success feedback visible: home-ui-upload-20260309.csv: 2 صف، 3 عمود
- dataset visible in UI list: home-ui-upload-20260309 | CSV · 2 صف
- screenshot: C:\DATA_AI\rasid\home-surface-after.png
- browser console errors after final state: 0
```

## 9. API test proof
```text
PowerShell result against live gateway:
{
  "datasets_total": 47,
  "first_dataset": "saudi_unis",
  "reports_total": 9,
  "first_report": "E2E Reports Test",
  "presentations_total": 7,
  "first_presentation": "Presentations Surface Test",
  "dashboards_total": 7,
  "first_dashboard": "Int Test Dashboard"
}
```

## 10. Integration test proof
```text
API upload integration test:
1. POST /api/v1/data/import/single with CSV file home-surface-upload-20260309.csv -> 201 Created
2. GET /api/v1/data/sources?page=1&limit=3&search=home-surface-upload-20260309 -> total=1, listed_name=home-surface-upload-20260309
3. PostgreSQL verification -> datasets row_count=3 and data_rows count=3
```

## 11. End-to-end test proof
```text
Playwright network trace from Home surface:
[GET] http://localhost/api/v1/data/sources?page=1&limit=8 => [200] OK
[GET] http://localhost/api/v1/reporting/reports?page=1&limit=1 => [200] OK
[GET] http://localhost/api/v1/presentation/presentations?page=1&limit=1 => [200] OK
[GET] http://localhost/api/v1/dashboard/dashboards?page=1&limit=1 => [200] OK
[POST] http://localhost/api/v1/data/import/single => [201] Created
[GET] http://localhost/api/v1/data/sources?page=1&limit=8 => [200] OK

Observed E2E business effect inside /home:
- dataset card increased from 48 to 49
- upload feedback rendered real row/column counts
- new dataset home-ui-upload-20260309 moved to top of Home recent datasets list
```

## 12. Before/after proof
```text
Before code change:
- frontend/app/(dashboard)/home/page.tsx wrote local source entries via useSourceLibraryStore.addFiles(...)
- frontend/app/(dashboard)/home/page.tsx catch block returned fake success text: تم حفظه محلياً
- frontend/lib/api/reporting.ts and frontend/lib/api/presentation.ts returned items.length instead of backend pagination.total
- frontend/lib/api/data.ts and frontend/lib/api/dashboard.ts sent pageSize instead of backend limit

After code change:
- frontend/app/(dashboard)/home/page.tsx removed local source store usage entirely
- Home recent list now comes from live GET /api/v1/data/sources
- upload feedback now reports only real API success or real API error
- Home reloads live counts and recent datasets after successful POST /api/v1/data/import/single
- frontend/lib/api/data.ts, frontend/lib/api/dashboard.ts, frontend/lib/api/reporting.ts, frontend/lib/api/presentation.ts now pass backend-compatible limit params and read backend totals

Before runtime state on Home:
- top recent dataset before UI upload: home-surface-upload-20260309
- dataset count before UI upload: 48

After runtime state on Home:
- top recent dataset after UI upload: home-ui-upload-20260309
- dataset count after UI upload: 49
```

## 13. Explicit status
IMPLEMENTED
