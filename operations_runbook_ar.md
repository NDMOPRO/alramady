# دليل التشغيل

## المتطلبات
- Docker وDocker Compose
- Node.js 18 أو أحدث
- npm أو npx
- ملف بيئة صالح للقيم المطلوبة في `docker-compose.yml`

## التشغيل المحلي الأساسي
- شغّل البنية التحتية والخدمات:
- `docker compose up -d`
- أو شغّل البنية أولًا ثم الخدمات عند الحاجة.

## ترحيل قاعدة البيانات وبذور البيانات
- استخدم:
- `bash ./scripts/run-migrations.sh --full`
- هذا المسار يشغّل:
- انتظار قاعدة البيانات
- تطبيق الترحيلات
- توليد Prisma Client
- تشغيل البذور إذا كان سكربت البذور موجودًا

## التحقق الأساسي بعد الإقلاع
- افتح `http://localhost`
- تحقق من جاهزية الحاويات عبر:
- `docker ps`
- راقب السجلات عند الحاجة عبر:
- `docker logs <container-name>`

## الخدمات المهمة للمسارات المعتمدة
- `rasid-frontend`
- `rasid-gateway`
- `rasid-data-service`
- `rasid-dashboard-service`
- `rasid-reporting-service`
- `rasid-presentation-service`
- `rasid-library-service`
- `rasid-governance-service`
- `rasid-ai-service`
- ومعها: `postgres`, `redis`, `elasticsearch`, `minio`

## أوامر تحقق شائعة
- فحص الأنواع للواجهة:
- `npm run type-check --prefix frontend`
- اختبارات خدمة الذكاء الاصطناعي المرتبطة بمركز راصد:
- `npx jest --config jest.config.ts src/__tests__/training-center.test.ts --runInBand`
- ينفذ من داخل `services/ai-service`

## مسار التحقق من الدخول
- سجّل الدخول من `/login`.
- بعد نجاح الدخول يجب أن تعمل الأسطح المعتمدة عبر الواجهة العربية.

## النسخ الاحتياطي التشغيلي العملي
- PostgreSQL يحتوي سجلات الأعمال الرئيسية.
- MinIO يحتوي الأصول والملفات.
- عند النسخ الاحتياطي المحلي احفظ قاعدة البيانات مع بيانات MinIO معًا.

## نقاط انتباه حالية
- تحذير `express-rate-limit` المتعلق بـ `X-Forwarded-For` و`trust proxy` قد يظهر في `ai-service`، لكنه لا يمنع تشغيل الأسطح المعتمدة الحالية.
- إذا تعطلت قدرات المعرفة أو القوالب فابدأ بالتحقق من `ai-service` ثم من مفاتيح OpenAI ثم من PostgreSQL وElasticsearch.
