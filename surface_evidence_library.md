# Surface Evidence Pack

## 1. Surface name
Library

## 2. Exact route
`/library`

## 3. Exact user action performed in UI
فتح المستخدم صفحة `/library` ثم رفع الملف الحقيقي `C:\Windows\System32\library-ui-readme.md` عبر عنصر `input[type="file"]` داخل واجهة الرفع، ثم ضغط زر `تفاصيل` لأول أصل ظاهر، ثم ضغط زر `حذف` لنفس الأصل من نفس الصفحة.

## 4. Exact API endpoint(s) invoked
`GET /api/v1/library/folders/tree`
`GET /api/v1/library/assets?page=1&limit=20`
`POST /api/v1/library/assets`
`GET /api/v1/library/assets/3a1bc727-4b10-4a25-b6f9-6e9b6ceef61b`
`DELETE /api/v1/library/assets/3a1bc727-4b10-4a25-b6f9-6e9b6ceef61b`
الرابط الموقّع الناتج من `GET /api/v1/library/assets/:id` كان:
`http://minio:9000/rasid-files/a0000000-0000-0000-0000-000000000001/1773044134422-3a1bc727-4b10-4a25-b6f9-6e9b6ceef61b.md?...`

## 5. Exact backend/service/module executed
الواجهة: `C:\DATA_AI\rasid\frontend\app\(dashboard)\library\page.tsx:16-24,132-268,338-523`
عميل API: `C:\DATA_AI\rasid\frontend\lib\api\library.ts:186-233`
الراوتر الخلفي: `C:\DATA_AI\rasid\services\library-service\src\routes\library.routes.ts`
محرك الرفع/القراءة/الحذف: `C:\DATA_AI\rasid\services\library-service\src\services\asset-manager.service.ts:41-255`
محرك المجلدات: `C:\DATA_AI\rasid\services\library-service\src\services\folder-manager.service.ts`
التخزين الفعلي: جدول PostgreSQL `library_assets` + كائن MinIO تحت `storageKey`

## 6. Exact real output produced
نتيجة الرفع الحي في `C:\DATA_AI\rasid\artifacts\library\api-proof.json`:
`id = 172da263-f8c9-4080-9de7-50d84f75d7ef`
`name = README.md`
`mimeType = text/markdown`
`fileSize = 3433`
`checksum = eb76b420294ba2624bdb049034a839de40a0ac6571aff24e9b628eda1b17acec`
نتيجة القراءة الحية من MinIO لنفس الأصل:
`downloadProbe.status = 200`
`downloadProbe.size = 3433`
`downloadProbe.sample = "# حزمة برومتات منصة راصد — دليل الاستخدام..."`
نتيجة الحذف الحي بعد نفس الأصل:
`postDeleteProbe.status = 404`
`postDeleteProbe.sample = "<Error><Code>NoSuchKey</Code>..."`

## 7. Exact persisted result or returned business result
قبل الحذف لنفس الأصل في PostgreSQL:
`dbUpload = {"id":"172da263-f8c9-4080-9de7-50d84f75d7ef","name":"README.md","storageKey":"a0000000-0000-0000-0000-000000000001/1773044062367-172da263-f8c9-4080-9de7-50d84f75d7ef.md","deletedAt":null}`
بعد الحذف لنفس الأصل في PostgreSQL:
`dbDelete = {"id":"172da263-f8c9-4080-9de7-50d84f75d7ef","deletedAt":"2026-03-09T11:14:22.887+03:00","deletedBy":"b0000000-0000-0000-0000-000000000001"}`
في سجل الخدمة:
`Removed object from MinIO: a0000000-0000-0000-0000-000000000001/1773044062367-172da263-f8c9-4080-9de7-50d84f75d7ef.md`

## 8. UI test proof
Playwright UI proof محفوظ في:
`C:\DATA_AI\rasid\artifacts\library\playwright-ui-proof.json`
القيم المسجلة:
`countBefore = 11`
`countAfterUpload = 12`
`countAfterDelete = 11`
`selectedText` احتوى الاسم `library-ui-readme.md` و`Checksum` الكامل `eb76b420294ba2624bdb049034a839de40a0ac6571aff24e9b628eda1b17acec`
صورة الواجهة بعد تنفيذ التدفق محفوظة في:
`C:\DATA_AI\rasid\artifacts\library\library-ui.png`

## 9. API test proof
اختبار الـ API الحي محفوظ في:
`C:\DATA_AI\rasid\artifacts\library\api-proof.json`
الدورة المثبتة داخله:
`POST /api/v1/library/assets -> 201`
`GET /api/v1/library/assets/:id -> 200`
`DELETE /api/v1/library/assets/:id -> 200`
`downloadProbe.status -> 200`
`postDeleteProbe.status -> 404`

## 10. Integration test proof
اختبار المحرك الخلفي نجح بالأمر:
`npm test --prefix services/library-service`
النتيجة:
`PASS src/__tests__/asset-manager.test.ts`
`Tests: 12 passed, 12 total`
الاختبار يعتمد على:
`C:\DATA_AI\rasid\services\library-service\src\__tests__\asset-manager.test.ts:49-62`
وتمت إضافة سكربت التشغيل في:
`C:\DATA_AI\rasid\services\library-service\package.json:6-11`

## 11. End-to-end test proof
سجل الشبكة الكامل من Playwright محفوظ في:
`C:\DATA_AI\rasid\artifacts\library\playwright-network.txt`
ويحتوي المسار المتسلسل التالي من الواجهة نفسها:
`POST http://localhost/api/v1/library/assets => 201`
`GET http://localhost/api/v1/library/assets/3a1bc727-4b10-4a25-b6f9-6e9b6ceef61b => 200`
`DELETE http://localhost/api/v1/library/assets/3a1bc727-4b10-4a25-b6f9-6e9b6ceef61b => 200`
مع إعادة تحميل:
`GET http://localhost/api/v1/library/assets?page=1&limit=20 => 200`
و:
`GET http://localhost/api/v1/library/folders/tree => 200`

## 12. Before/after proof
قبل الإصلاح في Audit هذا السطح كان ملف الصفحة `C:\DATA_AI\rasid\frontend\app\(dashboard)\library\page.tsx` يعتمد `useSourceLibraryStore` ويستدعي `addFiles(files, "library-upload")` ويحتوي تعليق `Fallback to local store` ويعرض فهرس مصادر محلياً.
بعد الإصلاح:
`C:\DATA_AI\rasid\frontend\app\(dashboard)\library\page.tsx:16-24` لم يعد يستورد إلا `fetchAssets/fetchAsset/fetchFolders/uploadAsset/deleteAsset`
`C:\DATA_AI\rasid\frontend\app\(dashboard)\library\page.tsx:187-207` يرفع إلى الخدمة ويعيد رمي الخطأ بلا fallback محلي
`C:\DATA_AI\rasid\frontend\lib\api\library.ts:186-233` يربط القراءة بـ `/assets` و`/folders/tree` ويفك envelope الحقيقي
`C:\DATA_AI\rasid\services\library-service\src\services\asset-manager.service.ts:151-204` أصلح تسلسل `BigInt` في `getAsset`
فحص النفي الحالي أعطى:
`NO_MATCH:useSourceLibraryStore`
`NO_MATCH:localStorage`
`NO_MATCH:Math.random`
`NO_MATCH:Fallback to local store`

## 13. Explicit status
IMPLEMENTED
