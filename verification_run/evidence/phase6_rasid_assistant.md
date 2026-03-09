## 1. where assistant entry exists in each surface
- `Home`: `frontend/app/(dashboard)/home/page.tsx:1040`
- `Data`: `frontend/app/(dashboard)/data/page.tsx:260`
- `Analysis`: `frontend/app/(dashboard)/analysis/page.tsx:356`
- `Reports`: `frontend/app/(dashboard)/reports/page.tsx:429`
- `Presentations`: `frontend/app/(dashboard)/presentations/page.tsx:237`
- `Library`: `frontend/app/(dashboard)/library/page.tsx:887`
- `Settings`: `frontend/app/(dashboard)/settings/page.tsx:425`
- المكوّن المشترك المضمّن في كل الأسطح المعتمدة هو `frontend/components/assistant/EmbeddedRasidAssistant.tsx`

## 2. how context is detected
- المساعد لا يعمل كمسار منفصل؛ كل Surface يمرر له `surfaceId` و`surfaceName` و`route` و`contextSummary` و`contextItems` و`actions`.
- `Home` يمرر مؤشرات المنصة وحالة الملف المكتشف وآخر مجموعة بيانات.
- `Data` يمرر عدد المجموعات المعروضة والموصلات وآخر مجموعة بيانات.
- `Analysis` يمرر المجموعة الحالية وعدد التوصيات وعدد اللوحات.
- `Reports` يمرر التقرير الحالي والمصدر الحالي وعدد التقارير.
- `Presentations` يمرر نمط التوليد الحالي وآخر عرض وإجمالي الشرائح.
- `Library` يمرر الأصل المحدد والثيم النشط وعدد الأصول والوصفات.
- `Settings` يمرر عدد المستخدمين والفرق والأعلام وأول مستخدم ظاهر.
- داخل `EmbeddedRasidAssistant.tsx` تم تحسين المطابقة الحرة لتستند إلى `label` و`description` و`keywords` مع scoring عربي بدل مطابقة الكلمات المفتاحية الضيقة فقط.

## 3. what real actions are supported
- `Home`: تحديث مؤشرات الصفحة الرئيسية، بدء جلسة جديدة، فتح آخر مجموعة بيانات.
- `Data`: تحديث مجموعات البيانات، تحديث الموصلات السحابية، فتح أحدث مجموعة، فتح المكتبة.
- `Analysis`: تحديث التحليل والبيانات، تشغيل التحليل الحالي، فتح Surface البيانات.
- `Reports`: تحديث التقارير، إنشاء وبناء التقرير الحالي، إعادة بناء التقرير المحدد، تصدير PDF، حفظ الجدولة.
- `Presentations`: تحديث العروض، توليد العرض الحالي، إنشاء عرض فارغ، فتح أحدث عرض.
- `Library`: تحديث المكتبة، عرض أحدث أصل، استيراد الأصل المحدد إلى البيانات، إنشاء عرض من الأصل المحدد، حفظ آخر إجراء ناجح.
- `Settings`: تحديث الإعدادات، فتح أول مستخدم، تصدير سجل التدقيق.
- كل Action يستدعي handler الصفحة نفسها، والـ handler يستدعي API clients الفعلية المرتبطة بـ `data-service`, `dashboard-service`, `reporting-service`, `presentation-service`, `library-service`, `governance-service`.

## 4. Arabic/RTL implementation
- المكوّن يفرض `dir="rtl"` على الحاوية الأساسية.
- كل النصوص الظاهرة للمستخدم داخل المساعد عربية افتراضيًا: العنوان، المقدمة، رسائل النتائج، رسائل الخطأ، prompts، input placeholder، وأسماء الأفعال.
- نتائج التوجيه والسياق والقدرات تُبنى من `contextSummary` و`contextItems` العربية القادمة من كل Surface.

## 5. live guidance behavior
- السؤال النصي `ماذا يمكنك أن تفعل هنا؟` أعاد في كل Surface قائمة الأفعال الحقيقية المتاحة داخل نفس الصفحة فقط.
- السؤال النصي الحر المطابق للفعل شغّل التنفيذ نفسه عبر Action حقيقي، ثم أعاد رسالة `نتيجة التنفيذ` من داخل الصفحة.
- المسار غير المطابق لم يعد يرد برد عام ضعيف فقط؛ بعد تحسين المطابقة صار يفهم صياغات مثل `حدّث البيانات` و`حدث التقارير` و`صدر سجل التدقيق`.
- لا يوجد mock chat response في الأسطح المعتمدة؛ المساعد إمّا يعرض قدرات وسياقًا مأخوذين من الصفحة الحية، أو يشغّل action فعليًا عبر الـ API.

## 6. raw verification results
- ملف الأوامر الخام: `C:\DATA_AI\rasid\verification_run\raw_outputs\phase6_commands.txt`
- نتيجة المتصفح الخام: `C:\DATA_AI\rasid\verification_run\raw_outputs\phase6_browser_results.json`
- لقطة UI: `C:\DATA_AI\rasid\verification_run\raw_outputs\phase6_settings_assistant.png`
- نتائج المتصفح المثبتة:
  - `Home`: `حدّث مؤشرات الصفحة الرئيسية` -> `GET /api/v1/data/sources?page=1&limit=6` -> `200`
  - `Data`: `حدّث البيانات` -> `GET /api/v1/data/sources?page=1&limit=10` -> `200`
  - `Analysis`: `شغل التحليل الحالي` -> `POST /api/v1/dashboard/analyze-data` -> `200`
  - `Reports`: `حدث التقارير` -> `GET /api/v1/reporting/reports?page=1&limit=12` -> `200`
  - `Presentations`: `حدث العروض` -> `GET /api/v1/presentation/presentations?page=1&limit=20` -> `200`
  - `Library`: `اعرض أحدث أصل` -> `GET /api/v1/library/assets/e368376c-6d83-4144-a80d-e6d701a3c3ba` -> `200`
  - `Settings`: `صدر سجل التدقيق` -> `GET /api/v1/governance/audit/export?format=csv` -> `200`
- فحص الواجهة:
  - `npm run type-check --prefix frontend` -> `tsc --noEmit` نجح
- probe حي للخدمات:
  - `datasetName = phase4-home-sample`
  - `analysisCharts = 1`
  - `firstReport = تقرير تحقق تكامل المنصة 1500`
  - `firstPresentation = Sales Snapshot Analysis`
  - `firstLibraryAsset = اعتماد-تدفق-عربي-للتحقق-1773058832674.json`
  - `firstUser = home-test@rasid.demo`
  - `auditExportBytes = 175310`

## 7. defects fixed
- في `frontend/components/assistant/EmbeddedRasidAssistant.tsx` كانت المطابقة الحرة تعتمد فقط على `keywords` الضيقة؛ تم إصلاحها لتسجّل score من `label` و`description` و`keywords` مع chips إرشادية في fallback.
- في `Data` و`Analysis` و`Reports` و`Presentations` و`Library` و`Settings` كانت بعض رسائل المساعد بعد Actions التحديث تعرض counts قديمة من closure السابقة؛ تم تعديل handlers لتعيد snapshots حيّة من نفس الطلب الذي نفذه المساعد.
- لا يوجد استخدام لـ `RasidCommandCenter` داخل الأسطح السبعة المعتمدة؛ المسار المحلي القديم للمحادثة بقي خارج runtime المعتمد لهذه الأسطح.

## 8. phase status
PASS
