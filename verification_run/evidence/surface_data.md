## 1. Surface name
Data

## 2. Exact route
`/data`
`/data/:id`

## 3. Exact user action performed in UI
تم فتح `/data`، ثم رفع الملف `data-ui-upload-20260309-093524.csv` من واجهة الرفع، ثم فتح صفحة التفاصيل للمجموعة الجديدة، ثم مراجعة تبويب الصفوف وتبويب الإحصائيات وتنفيذ تصدير JSON.

## 4. Exact API endpoint(s) invoked
`GET /api/v1/data/sources?page=1&limit=10`
`POST /api/v1/data/import/single`
`GET /api/v1/data/sources/:id`
`GET /api/v1/data/sources/:id/rows?page=1&limit=50`
`GET /api/v1/data/sources/:id/statistics`
`GET /api/v1/data/sources/:id/export/json`

## 5. Exact backend/service/module executed
`frontend/app/(dashboard)/data/page.tsx`
`frontend/app/(dashboard)/data/[id]/page.tsx`
`frontend/lib/api/data.ts`
`services/data-service/src/routes/sources.routes.ts`
`services/data-service/src/routes/import.routes.ts`
`services/data-service/src/services/sources.service.ts`
`services/data-service/src/services/import.service.ts`

## 6. Exact real output produced
واجهة `/data` عرضت المجموعة `data-ui-upload-20260309-093524` مع `3 صف` و`3 عمود`. صفحة التفاصيل عرضت القيم `Riyadh / 15 / 0.42` و`Jeddah / 11 / 0.35` و`Abha / 7 / 0.28`. تبويب الإحصائيات عرض `orders min 7 max 15 mean 11` و`margin min 0.28 max 0.42 mean 0.35`.

## 7. Exact persisted result or returned business result
الإثبات السابق في `surface_evidence_data.md` أكد حفظ `data-ui-upload-20260309-093524` و`data-surface-api-20260309-093524` في PostgreSQL مع `row_count = 3`.
التحقق الحي في `verification_run/raw_outputs/phase5_commands.txt` أكد حاليًا أن `phase4-home-sample` تُرجِع `datasetRowsReturned = 3` و`datasetTotalRows = 3` و`datasetName = phase4-home-sample`.

## 8. UI test proof
إثبات UI الحي محفوظ في `surface_evidence_data.md` وفي الصورة `C:\DATA_AI\rasid\data-surface-after.png`.
`npm run type-check --prefix frontend` نجح في `verification_run/raw_outputs/phase5_commands.txt`.

## 9. API test proof
`verification_run/raw_outputs/phase5_commands.txt` يحتوي على:
`datasetId = 7f012551-e03d-4e2c-9765-522f88af2243`
`datasetName = phase4-home-sample`
`datasetRowsReturned = 3`
`datasetTotalRows = 3`

## 10. Integration test proof
`npm test --prefix services/data-service -- reading.service.test.ts mixed-files.service.test.ts --runInBand`
النتيجة الفعلية: `Test Suites: 2 passed, 2 total` و`Tests: 14 passed, 14 total`.

## 11. End-to-end test proof
`surface_evidence_data.md` يثبت السلسلة:
`POST /api/v1/data/import/single => 201`
`GET /api/v1/data/sources/:id => 200`
`GET /api/v1/data/sources/:id/rows => 200`
`GET /api/v1/data/sources/:id/statistics => 200`
`GET /api/v1/data/sources/:id/export/json => 200`

## 12. Before/after proof
قبل الإصلاح كانت واجهة `Data` تعتمد على `useSourceLibraryStore` ومسارات عميل قديمة من نوع `/datasets/*` مع رسالة نجاح محلية وهمية.
بعد الإصلاح أزيل المسار المحلي بالكامل، وربط `frontend/lib/api/data.ts` بالمسارات الفعلية `/sources/*`. وفي هذه المرحلة أُصلح أيضًا `services/data-service/src/middleware/errorHandler.ts` عبر cast آمن من `unknown` فعادت اختبارات الخدمة الفعلية إلى النجاح.

## 13. Explicit status
IMPLEMENTED
