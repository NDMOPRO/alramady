## 1. Surface name
Settings

## 2. Exact route
`/settings`

## 3. Exact user action performed in UI
تم فتح `/settings` ثم تنفيذ `تحديث` ثم فتح تفاصيل المستخدم `Home Test` ثم تطبيق فلتر `user.login` على سجل التدقيق ثم تنفيذ `تصدير CSV`.

## 4. Exact API endpoint(s) invoked
`GET /api/v1/governance/users?page=1&limit=8`
`GET /api/v1/governance/users/:id`
`GET /api/v1/governance/audit?page=1&limit=8`
`GET /api/v1/governance/audit?page=1&limit=8&action=user.login`
`GET /api/v1/governance/audit/export?format=csv&action=user.login`
`GET /api/v1/governance/settings`

## 5. Exact backend/service/module executed
`frontend/app/(dashboard)/settings/page.tsx`
`frontend/lib/api/governance.ts`
`services/governance-service/src/routes/governance.routes.ts`
`services/governance-service/src/services/audit.service.ts`
`services/governance-service/src/services/authentication.service.ts`

## 6. Exact real output produced
التحقق الحي في `verification_run/raw_outputs/phase5_commands.txt` أعاد:
`usersTotal = 2`
`auditTotal = 579`
`auditExportBytes = 172470`
`settingsStatus = HTTP/1.1 404 Not Found`
والسطح ما زال يعرض بيانات المستخدمين وسجل التدقيق الحقيقيين، لكن إعدادات النظام العامة نفسها بلا endpoint فعلي.

## 7. Exact persisted result or returned business result
`GET /users` و`GET /users/:id` يعيدان سجلات حقيقية من PostgreSQL.
`GET /audit` و`GET /audit/export` يعيدان بيانات وسجل CSV حقيقيين.
`GET /api/v1/governance/settings` يعيد `404` مع body:
`{"success":false,"error":"Route GET /api/v1/governance/settings not found","code":"ROUTE_NOT_FOUND"}`
لذلك لا يوجد persistence صالح لإعدادات النظام العامة من هذا السطح.

## 8. UI test proof
إثبات Playwright محفوظ في `C:\DATA_AI\rasid\artifacts\settings\settings-ui.png` ومعه الشبكة في `C:\DATA_AI\rasid\artifacts\settings\playwright-network.txt`.
`surface_evidence_settings.md` يثبت فتح نافذة المستخدم وتصدير CSV من الواجهة نفسها.

## 9. API test proof
`verification_run/raw_outputs/phase5_commands.txt` يثبت حيًا:
`usersTotal = 2`
`auditTotal = 579`
`auditExportBytes = 172470`
`settingsStatus = HTTP/1.1 404 Not Found`

## 10. Integration test proof
`npx jest --config jest.config.ts --runInBand src/__tests__/audit.service.test.ts src/__tests__/authentication.test.ts`
النتيجة الفعلية: `Test Suites: 2 passed, 2 total` و`Tests: 18 passed, 18 total`.

## 11. End-to-end test proof
`C:\DATA_AI\rasid\artifacts\settings\playwright-network.txt` يثبت:
`GET /api/v1/governance/users?page=1&limit=8`
`GET /api/v1/governance/users/c8afaac9-0e5c-4908-863c-1da218388d96`
`GET /api/v1/governance/audit?page=1&limit=8&action=user.login`
`GET /api/v1/governance/audit/export?format=csv&action=user.login`

## 12. Before/after proof
قبل هذه المرحلة كانت حزمة المصادقة في `governance-service` غير متسقة: `login` كان يتعامل مع الحالة بحساسية case ضيقة و`2FA` يعتمد على Redis فقط، لذلك فشلت اختبارات الخدمة الحقيقية.
بعد الإصلاح في `services/governance-service/src/services/authentication.service.ts` صار status يطبع إلى صيغة موحدة، وصارت حالة `mfaEnabled/mfaSecret` تُحدَّث وتُستخدم مع Redis، فعادت اختبارات `authentication` و`audit` إلى النجاح. لكن `GET /api/v1/governance/settings` ما زال غير موجود، لذلك السطح يبقى محجوبًا جزئيًا بدليل حقيقي.

## 13. Explicit status
BLOCKED
