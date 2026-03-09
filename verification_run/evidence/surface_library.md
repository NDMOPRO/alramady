## 1. Surface name
Library

## 2. Exact route
`/library`

## 3. Exact user action performed in UI
تم فتح `/library` ثم رفع الملف الحقيقي `library-ui-readme.md`، ثم فتح تفاصيل الأصل، ثم حذف الأصل من نفس الواجهة.

## 4. Exact API endpoint(s) invoked
`GET /api/v1/library/folders/tree`
`GET /api/v1/library/assets?page=1&limit=20`
`POST /api/v1/library/assets`
`GET /api/v1/library/assets/:id`
`DELETE /api/v1/library/assets/:id`

## 5. Exact backend/service/module executed
`frontend/app/(dashboard)/library/page.tsx`
`frontend/lib/api/library.ts`
`services/library-service/src/routes/library.routes.ts`
`services/library-service/src/services/asset-manager.service.ts`
`services/library-service/src/services/folder-manager.service.ts`
`MinIO`
`PostgreSQL table library_assets`

## 6. Exact real output produced
`surface_evidence_library.md` يثبت رفع الأصل `README.md` بحجم `3433` بايت مع `checksum = eb76b420294ba2624bdb049034a839de40a0ac6571aff24e9b628eda1b17acec` ثم تنزيله من MinIO ثم حذفه وعودة `NoSuchKey`.
التحقق الحي الحالي في `verification_run/raw_outputs/phase5_commands.txt` أعاد `libraryTotal = 13` وأول عنصر `اعتماد-تدفق-عربي-للتحقق-1773058832674.json`.

## 7. Exact persisted result or returned business result
`surface_evidence_library.md` يثبت وجود صف الأصل في PostgreSQL قبل الحذف ثم تعبئة `deletedAt` و`deletedBy` بعد الحذف، مع إزالة الكائن نفسه من MinIO.

## 8. UI test proof
إثبات Playwright محفوظ في `C:\DATA_AI\rasid\artifacts\library\playwright-ui-proof.json` والصورة `C:\DATA_AI\rasid\artifacts\library\library-ui.png`.
الملف يثبت `countBefore = 11` و`countAfterUpload = 12` و`countAfterDelete = 11`.

## 9. API test proof
`verification_run/raw_outputs/phase5_commands.txt` يثبت نجاح `GET /api/v1/library/assets?page=1&limit=1` حاليًا.
`C:\DATA_AI\rasid\artifacts\library\api-proof.json` يثبت دورة الرفع والقراءة والحذف الحية:
`POST /api/v1/library/assets -> 201`
`GET /api/v1/library/assets/:id -> 200`
`DELETE /api/v1/library/assets/:id -> 200`

## 10. Integration test proof
`npm test --prefix services/library-service`
النتيجة الفعلية: `Test Suites: 1 passed, 1 total` و`Tests: 12 passed, 12 total`.

## 11. End-to-end test proof
`C:\DATA_AI\rasid\artifacts\library\playwright-network.txt` يثبت:
`POST /api/v1/library/assets => 201`
`GET /api/v1/library/assets/:id => 200`
`DELETE /api/v1/library/assets/:id => 200`
`GET /api/v1/library/folders/tree => 200`

## 12. Before/after proof
قبل الإصلاح كانت الصفحة تعتمد على `useSourceLibraryStore` وتعليق `Fallback to local store`.
بعد الإصلاح صار `frontend/app/(dashboard)/library/page.tsx` يستخدم فقط `fetchAssets/fetchAsset/fetchFolders/uploadAsset/deleteAsset` ويعيد الخطأ الحقيقي من `library-service` من دون أي بديل محلي.

## 13. Explicit status
IMPLEMENTED
