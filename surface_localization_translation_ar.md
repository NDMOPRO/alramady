# 1. What localization/translation capabilities are real
- صفحة [localization/page.tsx](/C:/DATA_AI/rasid/frontend/app/(dashboard)/localization/page.tsx) أصبحت عربية وRTL وتعرض ترجمة نصية سياقية، رفع ملفات، مجموعات مصطلحات، وتعريب محتوى المنصة.
- محرك الترجمة في [translation-engine.service.ts](/C:/DATA_AI/rasid/services/localization-service/src/services/translation-engine.service.ts) يستخدم OpenAI فعليًا مع `domain` و`toneLevel` و`styleGuide` و`preserveLayout`.
- خدمة المصطلحات في [glossary-manager.service.ts](/C:/DATA_AI/rasid/services/localization-service/src/services/glossary-manager.service.ts) أُعيدت كتابتها لتستهدف الجداول الحية `glossaries` و`glossary_terms`.
- مسارات التوطين في [localization.routes.ts](/C:/DATA_AI/rasid/services/localization-service/src/routes/localization.routes.ts) تتضمن ترجمة نصية، ترجمة ملفات، RTL، تنسيق ثقافي، وتعريب تقارير/عروض/لوحات.

# 2. How Arabic-first and RTL are implemented
- [layout.tsx](/C:/DATA_AI/rasid/frontend/app/layout.tsx) يضبط `lang="ar"` و`dir="rtl"`.
- صفحة التوطين الجديدة تعتمد نصوصًا عربية كاملة، ترتيب RTL، وبطاقات/تبويبات عربية فقط.
- [rtl-engine.service.ts](/C:/DATA_AI/rasid/services/localization-service/src/services/rtl-engine.service.ts) يطبق `applyRTL` و`mirrorLayout` وتهيئة الأرقام/التواريخ العربية.

# 3. How context-aware translation is handled
- `translateTextWithContext` يضمّن في الطلب: المجال، نبرة النص، دليل الأسلوب، والحفاظ على البنية.
- الواجهة ترسل `domain`, `toneLevel`, `styleGuide`, `preserveLayout` من [localization/page.tsx](/C:/DATA_AI/rasid/frontend/app/(dashboard)/localization/page.tsx).
- الترجمة النصية الفعلية التي نجحت أثناء التحقق كانت عبر:
```powershell
POST /api/v1/localization/translate/text
{
  "text":"Hello world",
  "sourceLang":"en",
  "targetLang":"ar"
}
```
والناتج الخام كان:
```json
{
  "success": true,
  "data": {
    "translatedText": "مرحبا بك في العالم",
    "sourceLang": "en",
    "targetLang": "ar",
    "glossaryApplied": false
  }
}
```

# 4. How memory/consistency/style retention is handled
- [translation-engine.service.ts](/C:/DATA_AI/rasid/services/localization-service/src/services/translation-engine.service.ts) عُدّل ليتوافق محليًا مع الأعمدة الحية `source_lang`, `target_lang`, `translated_text`.
- [glossary-manager.service.ts](/C:/DATA_AI/rasid/services/localization-service/src/services/glossary-manager.service.ts) يحفظ `translations` و`context` و`notes` في `glossary_terms`.
- الاتساق الأسلوبي في الواجهة يمر عبر `styleGuide` ومجموعة المصطلحات.
- الحفظ التشغيلي الحي ما زال محجوزًا لأن الخدمة الجارية تُظهر أخطاء قاعدة بيانات فعلية مثل:
```json
{"code":"42703","message":"column \"target_text\" does not exist"}
{"code":"42703","message":"column \"deleted_at\" does not exist"}
```

# 5. How visual preservation is validated
- الواجهة تستدعي `applyRtlContent`, `runLinguisticQa`, `runLocalizationTest` بعد نجاح الترجمة النصية.
- الترجمة السياقية تطلب صراحة الحفاظ على الأسطر والبنود والهرمية.
- تدفق الملفات والمنصة يظل محجوزًا حاليًا لأن الجداول الحية لا تطابق الاستعلامات المطلوبة في وقت التشغيل، لذلك لا يوجد claim نهائي بالحفاظ البصري عبر المستندات/التقارير/العروض/اللوحات.

# 6. Which services/APIs/modules are used
- UI: [localization/page.tsx](/C:/DATA_AI/rasid/frontend/app/(dashboard)/localization/page.tsx)
- API client: [localization.ts](/C:/DATA_AI/rasid/frontend/lib/api/localization.ts)
- Backend routes: [localization.routes.ts](/C:/DATA_AI/rasid/services/localization-service/src/routes/localization.routes.ts)
- Engines: [translation-engine.service.ts](/C:/DATA_AI/rasid/services/localization-service/src/services/translation-engine.service.ts), [rtl-engine.service.ts](/C:/DATA_AI/rasid/services/localization-service/src/services/rtl-engine.service.ts), [content-localization.service.ts](/C:/DATA_AI/rasid/services/localization-service/src/services/content-localization.service.ts), [glossary-manager.service.ts](/C:/DATA_AI/rasid/services/localization-service/src/services/glossary-manager.service.ts)
- المسارات التي ثُبتت/أُضيفت محليًا: `/api/v1/localization/translate/text`, `/api/v1/localization/text/translate`, `/api/v1/localization/documents/translate`, `/api/v1/localization/localize/report/:id`, `/api/v1/localization/localize/presentation/:id`, `/api/v1/localization/localize/dashboard/:id`

# 7. Real output proof
- `docker compose ps` أظهر `rasid-localization-service` و`rasid-frontend` و`rasid-gateway` في حالة `Up`.
- خرج ترجمة نصية حقيقي من الخدمة:
```json
{
  "success": true,
  "data": {
    "translatedText": "مرحبا بك في العالم",
    "sourceLang": "en",
    "targetLang": "ar",
    "glossaryApplied": false
  }
}
```
- خرج الأعطال الحية الحالية بعد محاولة التفعيل الكامل:
```json
{
  "success": false,
  "error": "Database request error",
  "code": "PRISMA_P2010"
}
```
ومع سجل قاعدة البيانات:
```json
{"code":"42703","message":"column \"deleted_at\" does not exist"}
{"code":"42703","message":"column \"tenant_id\" of relation \"document_extractions\" does not exist"}
{"code":"42703","message":"column \"language\" does not exist"}
{"code":"42703","message":"column \"target_text\" does not exist"}
{"code":"42703","message":"column \"description\" does not exist"}
```

# 8. Test proof
- فحص الواجهة:
```powershell
npm run type-check --prefix frontend
```
ونتيجته:
```text
> @rasid/frontend@1.0.0 type-check
> tsc --noEmit
```
- بناء خدمة التوطين:
```powershell
npm run build --prefix services/localization-service
```
ونتيجته:
```text
> @rasid/localization-service@1.0.0 build
> tsc
```
- اختبارات الخدمة:
```powershell
npx jest --config services/localization-service/jest.config.ts --runInBand
```
ونتيجتها:
```text
Test Suites: 3 passed, 3 total
Tests:       50 passed, 50 total
```

# 9. Before/after proof
- قبل التعديل: [localization/page.tsx](/C:/DATA_AI/rasid/frontend/app/(dashboard)/localization/page.tsx) كان مقطوعًا وغير قابل لفحص النوع، و`jest.config.ts` لم يعمل من جذر المستودع، وخدمة التوطين لم تبنِ بنجاح.
- بعد التعديل: الصفحة اكتملت عربيًا وRTL، [localization.ts](/C:/DATA_AI/rasid/frontend/lib/api/localization.ts) و[localization.routes.ts](/C:/DATA_AI/rasid/services/localization-service/src/routes/localization.routes.ts) تم توحيدهما، والبناء والاختبارات تمر محليًا.
- ما بقي محجوزًا: قاعدة البيانات الحية مختلفة عن افتراضات الخدمة في مسارات الذاكرة الترجمية، المصطلحات، المستندات، وتعريب المنصة؛ لذلك التشغيل الكامل عبر `UI -> API -> Engine -> Real Output` لا يزال غير مكتمل لكل الأنواع المطلوبة.

# 10. Explicit status
BLOCKED
