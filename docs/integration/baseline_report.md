# Baseline Report

تاريخ التثبيت المرجعي: 2026-03-10T14:37:39.661Z

## Baseline Lock

Node مثبت على 24.14.0 وnpm على 11.9.0 مع قفل package manager إلى npm@11.9.0.
Docker مثبت على 29.2.1 وDocker Compose على v5.0.2.
ملف البيئة المرجعي المستخدم هو `.env.example` بعد إضافة `GOVERNANCE_RUNTIME_URL` كنقطة الربط المركزية للـregistry/evidence runtime.

## الفحص الشامل قبل أي تعديل

إجمالي الفحوصات الناجحة: 24.
إجمالي الفحوصات الفاشلة: 2.
الإخفاقات الحالية المحسوبة من baseline الأصلي تتركز في: ai-service/build، excel-service/test.

## أبرز الإخفاقات الحالية

- ai-service / build: src/services/training/training-monitor.service.ts(366,25): error TS2339: Property 'trainingAnomaly' does not exist on type 'PrismaClient<PrismaClientOptions, never, DefaultArgs>'. src/services/training/training-monitor.service.ts(387,41): error TS2339: Property 'trainingAnomaly' does not exist on type 'PrismaClient<PrismaClientOptions, never, DefaultArgs>'. src/services/training/training-monitor.service.ts(421,37): error TS2551: Property 'trainingAlert' does not exist on type 'PrismaClient<PrismaClientOptions, never, DefaultArgs>'. Did you mean 'trainingFile'? src/services/training/training-monitor.service.ts(455,38): error TS2551: Property 'trainingAlert' does not exist on type 'PrismaClient<PrismaClientOptions, never, DefaultArgs>'. Did you mean 'trainingFile'? src/services/training/training-monitor.service.ts(474,23): error TS2551: Property 'trainingAlert' does not exist on type 'PrismaClient<PrismaClientOptions, never, DefaultArgs>'. Did you mean 'trainingFile'?
- excel-service / test: Test Suites: 1 failed, 17 passed, 18 total Tests:       3 failed, 548 passed, 551 total Snapshots:   0 total Time:        6.628 s, estimated 10 s Ran all test suites.

## الخدمات ونقاط الدخول

- ai-service: C:\DATA_AI\rasid\services\ai-service\src\index.ts
- conversion-service: C:\DATA_AI\rasid\services\conversion-service\src\index.ts
- dashboard-service: C:\DATA_AI\rasid\services\dashboard-service\src\index.ts
- data-service: C:\DATA_AI\rasid\services\data-service\src\index.ts
- excel-service: C:\DATA_AI\rasid\services\excel-service\src\index.ts
- governance-service: C:\DATA_AI\rasid\services\governance-service\src\index.ts
- infographic-service: C:\DATA_AI\rasid\services\infographic-service\src\index.ts
- library-service: C:\DATA_AI\rasid\services\library-service\src\index.ts
- localization-service: C:\DATA_AI\rasid\services\localization-service\src\index.ts
- presentation-service: C:\DATA_AI\rasid\services\presentation-service\src\index.ts
- rendering-environment: C:\DATA_AI\rasid\services\rendering-environment\src\index.ts
- replication-service: C:\DATA_AI\rasid\services\replication-service\src\index.ts
- reporting-service: C:\DATA_AI\rasid\services\reporting-service\src\index.ts
- template-service: C:\DATA_AI\rasid\services\template-service\src\index.ts
- frontend-canvas: C:\DATA_AI\rasid\frontend\app\(dashboard)\home\page.tsx

## ملاحظة docker-compose

خدمات الـbaseline التي يجب أن ترتفع في compose هي: postgres، redis، minio، elasticsearch، rendering-environment.

## توصيف baseline الحالي

هذا التقرير يمثل خط الأساس قبل أي إصلاحات من دفعة التكامل. أي نتيجة نجاح لاحقة يجب أن تُقارن به مع إثباتات build/typecheck/lint/tests/evidence في نفس المسارات.

