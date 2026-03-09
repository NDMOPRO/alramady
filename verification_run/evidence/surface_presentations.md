## 1. Surface name
Presentations

## 2. Exact route
`/presentations`
`/presentations/:id`

## 3. Exact user action performed in UI
تم فتح `/presentations` ثم توليد عرض من النص، ثم فتح صفحة المحرر، ثم تحديث شريحة، ثم إضافة شريحة ثم حذفها، ثم تنفيذ تصدير PPTX وPDF. كما تم تنفيذ توليد AI من النص من نفس السطح.

## 4. Exact API endpoint(s) invoked
`GET /api/v1/presentation/presentations?page=1&limit=20`
`POST /api/v1/presentation/source/from-text`
`POST /api/v1/presentation/ai/generate-from-text`
`GET /api/v1/presentation/presentations/:id`
`PUT /api/v1/presentation/presentations/:id/slides/:slideIndex`
`POST /api/v1/presentation/presentations/:id/slides`
`DELETE /api/v1/presentation/presentations/:id/slides/:slideIndex`
`GET /api/v1/presentation/presentations/:id/export/pptx`
`GET /api/v1/presentation/presentations/:id/export/pdf`

## 5. Exact backend/service/module executed
`frontend/app/(dashboard)/presentations/page.tsx`
`frontend/app/(dashboard)/presentations/[id]/page.tsx`
`frontend/lib/api/presentation.ts`
`services/presentation-service/src/routes/presentation.routes.ts`
`services/presentation-service/src/services/source-processor.service.ts`
`services/presentation-service/src/services/ai-slide-generator.service.ts`
`services/presentation-service/src/services/slide-builder.service.ts`
`services/presentation-service/src/utils/prisma.ts`

## 6. Exact real output produced
الإثبات السابق في `surface_evidence_presentations.md` يثبت إنشاء العرض `f40b7f72-c199-4a5a-8783-e0a4d25eaf62` من النص العربي و`3df21f53-29de-424a-a28e-06a5f6d2b031` من AI مع تحديث شريحة فعلية وتصدير PPTX وPDF.
التحقق الحي الحالي في `verification_run/raw_outputs/phase5_commands.txt` أعاد:
`presentationsTotal = 24`
`presentationId = 13f22edf-582d-41f4-a572-ab1ca9a41152`
`presentationName = Sales Snapshot Analysis`
`presentationSlides = 1`
`presentationPptxBytes = 70329`

## 7. Exact persisted result or returned business result
`surface_evidence_presentations.md` يثبت حفظ صفوف حقيقية في `presentations` و`slides` وتحديث `slide 1` بمحتوى جديد. التحقق الحي الحالي يثبت استمرار إمكان قراءة العرض وتصديره من قاعدة البيانات نفسها بعد إصلاح الاتصالات.

## 8. UI test proof
Playwright UI proof محفوظ في `surface_evidence_presentations.md` مع لقطة `surface5_presentations_ui.png` وإثبات الانتقال إلى `/presentations/f40b7f72-c199-4a5a-8783-e0a4d25eaf62` وتنزيل ملف PPTX من المتصفح.
`npm run type-check --prefix frontend` نجح في `verification_run/raw_outputs/phase5_commands.txt`.

## 9. API test proof
`verification_run/raw_outputs/phase5_commands.txt` يثبت نجاح:
`GET /api/v1/presentation/presentations?page=1&limit=1`
`GET /api/v1/presentation/presentations/:id`
`GET /api/v1/presentation/presentations/:id/export/pptx`
مع `presentationPptxBytes = 70329`.

## 10. Integration test proof
`npm test --prefix services/presentation-service -- source-processor.test.ts ai-slide-generator.test.ts --runInBand`
النتيجة الفعلية: `Test Suites: 2 passed, 2 total` و`Tests: 23 passed, 23 total`.

## 11. End-to-end test proof
`surface_evidence_presentations.md` يثبت من الشبكة:
`POST /api/v1/presentation/source/from-text => 201`
`PUT /api/v1/presentation/presentations/:id/slides/1 => 200`
`POST /api/v1/presentation/presentations/:id/slides => 201`
`DELETE /api/v1/presentation/presentations/:id/slides/3 => 200`
`GET /api/v1/presentation/presentations/:id/export/pptx => 200`
`POST /api/v1/presentation/ai/generate-from-text => 201`

## 12. Before/after proof
قبل الإصلاح كان السطح يعتمد على تدفقات محلية قديمة، وفي هذه المرحلة ظهر عطل تشغيلي إضافي: `presentation.routes.ts` كان ينشئ `PrismaClient` جديدًا داخل الطلبات حتى وصل إلى `too many clients already`.
بعد الإصلاح صار الراوتر يستخدم `services/presentation-service/src/utils/prisma.ts` فقط، ثم أعيد بناء `presentation-service` وعاد `GET /presentations` و`GET /export/pptx` إلى العمل الحي.

## 13. Explicit status
IMPLEMENTED
