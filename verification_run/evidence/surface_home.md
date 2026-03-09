## 1. Surface name
Home

## 2. Exact route
`/home`

## 3. Exact user action performed in UI
تم فتح `/home` بجلسة مصادق عليها، ثم إسقاط الملف `phase4-home-sample.csv` داخل منطقة السحب والإفلات، ثم اختيار إجراء `تحليل` من الخيارات العربية الديناميكية.

## 4. Exact API endpoint(s) invoked
`GET /api/v1/data/sources?page=1&limit=8`
`GET /api/v1/reporting/reports?page=1&limit=1`
`GET /api/v1/presentation/presentations?page=1&limit=1`
`GET /api/v1/dashboard/dashboards?page=1&limit=1`
`POST /api/v1/data/import/single`
`POST /api/v1/dashboard/analyze-data`

## 5. Exact backend/service/module executed
`frontend/app/(dashboard)/home/page.tsx`
`frontend/lib/api/data.ts`
`frontend/lib/api/reporting.ts`
`frontend/lib/api/presentation.ts`
`frontend/lib/api/dashboard.ts`
`services/data-service/src/routes/import.routes.ts`
`services/data-service/src/services/import.service.ts`
`services/dashboard-service/src/routes/auto-dashboard.routes.ts`
`services/dashboard-service/src/services/auto-dashboard-generator.service.ts`

## 6. Exact real output produced
السطح عرض القيم الحية `60` مجموعات بيانات و`20` تقارير و`24` عروض و`7` لوحات. بعد إسقاط `phase4-home-sample.csv` ظهرت خيارات عربية ديناميكية تخص التحليل والتقرير والعرض والتحويل، ثم أعاد التحليل نتيجة فعلية تضمنت `3 صف` و`4 عمود` وتوصية رسم `orders حسب email`.

## 7. Exact persisted result or returned business result
الرفع الحي حفظ المجموعة `phase4-home-sample` في `datasets` بالمعرّف `7f012551-e03d-4e2c-9765-522f88af2243`. مخرجات `verification_run/raw_outputs/phase5_commands.txt` تؤكد `datasetName = phase4-home-sample` و`datasetRowsReturned = 3` و`datasetTotalRows = 3`.

## 8. UI test proof
`npm run type-check --prefix frontend` نجح داخل `verification_run/raw_outputs/phase5_commands.txt`.
إثبات Playwright الحي محفوظ في `verification_run/evidence/phase4_home_smart.md` وفي الصورة `C:\DATA_AI\rasid\home-surface-after.png`.

## 9. API test proof
`verification_run/raw_outputs/phase5_commands.txt` يحتوي على:
`datasetsTotal = 60`
`datasetId = 7f012551-e03d-4e2c-9765-522f88af2243`
`datasetName = phase4-home-sample`
`analysisChartCount = 1`
`analysisKpiCount = 1`

## 10. Integration test proof
`npm test --prefix services/data-service -- reading.service.test.ts mixed-files.service.test.ts --runInBand`
النتيجة الفعلية: `PASS` لحزمتين و`14 passed, 14 total`.

## 11. End-to-end test proof
إثبات الشبكة الحي محفوظ في `verification_run/evidence/phase4_home_smart.md` ويحتوي على:
`POST /api/v1/data/import/single => 201`
`POST /api/v1/dashboard/analyze-data => 200`
مع ظهور نتيجة التحليل داخل `/home` نفسها.

## 12. Before/after proof
قبل الإصلاح كان Home يملك مسار رفع محليًا بديلًا ويعتمد على قيم قديمة بعد التحديث.
بعد الإصلاح أزيل fallback المحلي بالكامل من `frontend/app/(dashboard)/home/page.tsx`، وصار التحديث يعيد تحميل snapshot حي من الخدمات الفعلية، كما أصبح انتقال نتيجة الرفع يوجّه إلى `/data/<datasetId>` الحقيقي.

## 13. Explicit status
IMPLEMENTED
