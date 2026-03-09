# Surface Evidence Pack

## 1. Surface name
Settings

## 2. Exact route
/settings

## 3. Exact user action performed in UI
فتح `/settings` ثم الضغط على `تحديث` ثم فتح تفاصيل المستخدم `Home Test` ثم إدخال `user.login` في فلتر الإجراء ثم الضغط على `تصدير CSV`.

## 4. Exact API endpoint(s) invoked
`GET /api/v1/governance/users?page=1&limit=8`
`GET /api/v1/governance/users/c8afaac9-0e5c-4908-863c-1da218388d96`
`GET /api/v1/governance/audit?page=1&limit=8`
`GET /api/v1/governance/audit?page=1&limit=8&action=user.login`
`GET /api/v1/governance/audit/export?format=csv&action=user.login`
`GET /api/v1/governance/settings` returned `404` and was isolated as blocked capability evidence only.

## 5. Exact backend/service/module executed
`services/governance-service/src/routes/governance.routes.ts`
`services/governance-service/src/index.ts`
`services/governance-service/src/services/audit.service.ts`
`services/governance-service/src/services/authentication.service.ts`
`frontend/lib/api/governance.ts`
`frontend/app/(dashboard)/settings/page.tsx`

## 6. Exact real output produced
واجهة `/settings` عرضت `2` مستخدم و`454` سجل تدقيق و`4` عناصر `BLOCKED`.
نافذة تفاصيل المستخدم عرضت `Home Test` و`home-test@rasid.demo` و`a0000000-0000-0000-0000-000000000001`.
تصدير التدقيق أنتج الملف `C:\DATA_AI\rasid\artifacts\settings\audit-export.csv` بحجم `128186` بايت ورسالة UI `تم تصدير سجل التدقيق بحجم 124 KB.`

## 7. Exact persisted result or returned business result
`GET /users` أعاد قائمتين حقيقيتين من قاعدة البيانات ضمن `governance-service`.
`GET /users/:id` أعاد سجل المستخدم `c8afaac9-0e5c-4908-863c-1da218388d96`.
`GET /audit` أعاد `454` سجل تدقيق.
`GET /audit/export` أعاد CSV حقيقياً محفوظاً في `C:\DATA_AI\rasid\artifacts\settings\audit-export.csv`.
لا يوجد backend صالح لحفظ إعدادات نظام عامة؛ `GET /api/v1/governance/settings` أعاد `404`.

## 8. UI test proof
اختبار Playwright على `/settings` أثبت القيم `settings-user-count=2` و`settings-audit-count=454` و`settings-blocked-count=4`.
بعد الضغط على `settings-refresh-button` ظهرت الرسالة `تم تحديث بيانات الإعدادات من governance-service.`
بعد فتح `settings-user-open-c8afaac9-0e5c-4908-863c-1da218388d96` ظهرت نافذة `settings-user-modal`.
صورة الإثبات: `C:\DATA_AI\rasid\artifacts\settings\settings-ui.png`

## 9. API test proof
الملف `C:\DATA_AI\rasid\artifacts\settings\api-proof.json` يحتوي:
`"usersTotal": 2`
`"auditTotal": 454`
`"auditExportSize": 128186`
`"missingSettingsStatus": "404"`
`"missingSettingsBody": "{\"success\":false,\"error\":\"Route GET /api/v1/governance/settings not found\",\"code\":\"ROUTE_NOT_FOUND\"}"`

## 10. Integration test proof
`services/governance-service/src/__tests__/audit.service.test.ts`
تشغيل `npx jest --config jest.config.ts --runInBand src/__tests__/audit.service.test.ts`
النتيجة `PASS` مع اختبارين ناجحين لتدفق `getAuditLog` و`exportAuditLog`.

## 11. End-to-end test proof
سجل الشبكة `C:\DATA_AI\rasid\artifacts\settings\playwright-network.txt` يثبت الاستدعاءات:
`GET /api/v1/governance/users?page=1&limit=8`
`GET /api/v1/governance/users/c8afaac9-0e5c-4908-863c-1da218388d96`
`GET /api/v1/governance/audit?page=1&limit=8&action=user.login`
`GET /api/v1/governance/audit/export?format=csv&action=user.login`
ملف التنزيل النهائي: `C:\DATA_AI\rasid\artifacts\settings\audit-export.csv`

## 12. Before/after proof
قبل التعديل كان `/settings` مجرد بطاقات وروابط إلى صفحات إدارية غير مثبتة وبعضها يعتمد سلوك حفظ محلي وهمي في `/admin/settings`.
بعد التعديل صار `/settings` ينفذ فقط `users` و`user details` و`audit list` و`audit export` عبر `governance-service` ويعزل القدرات غير المدعومة داخل لوحة `BLOCKED` من دون أي `fake save` أو `local-only settings state`.

## 13. Explicit status
BLOCKED
