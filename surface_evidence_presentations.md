# Surface Evidence Pack

## 1. Surface name
Presentations

## 2. Exact route
`/presentations`
`/presentations/:id`

## 3. Exact user action performed in UI
On `http://localhost/presentations` after injecting a valid JWT session into `localStorage`, I:
filled `presentations-brief` with `أنشئ عرضًا موجزًا يشرح تحسن الاحتفاظ بالعملاء وتأثيره على الربحية مع 3 توصيات تنفيذية.`
set `presentations-slide-count` to `3`
filled `presentations-target-audience` with `الإدارة التنفيذية`
clicked `presentations-generate-submit` while `Source Generator` was active
waited for navigation to `http://localhost/presentations/f40b7f72-c199-4a5a-8783-e0a4d25eaf62`
opened slide index `1`
edited `presentation-slide-title`, `presentation-slide-body`, and `presentation-slide-notes`
clicked `presentation-save-slide`
clicked `presentation-add-slide`
clicked `presentation-delete-slide`
clicked `presentation-export-pptx`
clicked `presentation-export-pdf`
returned to `/presentations`
clicked `presentations-ai-mode`
filled `presentations-brief` with `Create a 3-slide board update about customer churn reduction and margin expansion.`
clicked `presentations-generate-submit`

## 4. Exact API endpoint(s) invoked
`GET /api/v1/presentation/presentations?page=1&limit=20`
`POST /api/v1/presentation/source/from-text`
`GET /api/v1/presentation/presentations/f40b7f72-c199-4a5a-8783-e0a4d25eaf62`
`PUT /api/v1/presentation/presentations/f40b7f72-c199-4a5a-8783-e0a4d25eaf62/slides/1`
`POST /api/v1/presentation/presentations/f40b7f72-c199-4a5a-8783-e0a4d25eaf62/slides`
`DELETE /api/v1/presentation/presentations/f40b7f72-c199-4a5a-8783-e0a4d25eaf62/slides/3`
`GET /api/v1/presentation/presentations/f40b7f72-c199-4a5a-8783-e0a4d25eaf62/export/pptx`
`GET /api/v1/presentation/presentations/f40b7f72-c199-4a5a-8783-e0a4d25eaf62/export/pdf`
`POST /api/v1/presentation/ai/generate-from-text`
`GET /api/v1/presentation/presentations/3df21f53-29de-424a-a28e-06a5f6d2b031`

## 5. Exact backend/service/module executed
Frontend client:
`frontend/lib/api/presentation.ts`

Frontend UI:
`frontend/app/(dashboard)/presentations/page.tsx`
`frontend/app/(dashboard)/presentations/[id]/page.tsx`

Presentation routes:
`services/presentation-service/src/routes/presentation.routes.ts`

Engines/services reached by those routes:
`services/presentation-service/src/services/source-processor.service.ts`
`services/presentation-service/src/services/ai-slide-generator.service.ts`
`services/presentation-service/src/services/slide-builder.service.ts`

Real persistence layer reached:
Prisma `presentation.create`
Prisma `presentation.update`
Prisma `slide.create`
Prisma `slide.update`
Prisma `slide.delete`
PostgreSQL tables `presentations` and `slides`

## 6. Exact real output produced
UI source-generation created presentation `f40b7f72-c199-4a5a-8783-e0a4d25eaf62` with title `تحسن الاحتفاظ بالعملاء وتأثيره على الربحية` and `3` slides.
UI AI-generation created presentation `3df21f53-29de-424a-a28e-06a5f6d2b031` with title `Board Update: Customer Churn Reduction and Margin Expansion` and `3` slides.
UI save updated slide `1` inside `f40b7f72-c199-4a5a-8783-e0a4d25eaf62` so its stored text became:
title `تحسن الاحتفاظ بالعملاء والربحية`
body `• رفع الاحتفاظ بالعملاء يحسن الربحية بصورة مباشرة. • العملاء المتكررون يرفعون متوسط الإيراد لكل عميل. • خفض التسرب يقلل تكلفة الاكتساب الجديدة.`
notes `تم تحديث هذه الشريحة من واجهة Presentations للتحقق من أن الحفظ ينعكس في عناصر الشريحة ويصل إلى التصدير الفعلي.`
UI add-slide created slide index `3`, then UI delete-slide removed that same slide and the presentation returned to `3` slides.
API integration export produced:
`C:\DATA_AI\rasid\artifacts\surface5-api-export.pptx` size `94446` bytes
`C:\DATA_AI\rasid\artifacts\surface5-api-export.pdf` size `19279` bytes
UI export downloaded:
`C:\Users\engal\AppData\Local\Temp\playwright-mcp-output\1773036916135\تحسن-الاحتفاظ-بالعملاء-وتأثيره-على-الربحية.pptx` size `84822` bytes

## 7. Exact persisted result or returned business result
PowerShell API chain returned:
`sourcePresentationId = 0a92f333-56aa-4cbb-ac11-eb8d4a544133`
`aiPresentationId = d182d69f-8eeb-4699-b717-4cf959d785c0`
`sourceSlideCount = 3`
`aiSlideCount = 3`
`addedSlideIndex = 3`
`updateResult = true`
`updatedSlideTitle = شريحة تشغيلية محدثة`
`updatedSlideBody = تم تحديث المحتوى ليظهر في عناصر الشريحة والتصدير`
`pptxBytes = 94446`
`pdfBytes = 19279`
`slideCountAfterDelete = 3`

PostgreSQL query on `presentations` confirmed persisted rows:
`f40b7f72-c199-4a5a-8783-e0a4d25eaf62 | تحسن الاحتفاظ بالعملاء وتأثيره على الربحية | slide_count=3 | settings.sourceProcessing.sourceType=text`
`3df21f53-29de-424a-a28e-06a5f6d2b031 | Board Update: Customer Churn Reduction and Margin Expansion | slide_count=3`

PostgreSQL query on `slides` confirmed persisted slide update:
`f40b7f72-c199-4a5a-8783-e0a4d25eaf62 | slide_index=1 | layout=content | notes=تم تحديث هذه الشريحة... | content_preview contains تحسن الاحتفاظ بالعملاء والربحية`

## 8. UI test proof
Playwright browser test executed on `http://localhost/presentations` with valid JWT storage.
Observed list counters after authenticated load:
`العروض الحالية = 13`
`إجمالي الشرائح = 18`
Observed after source UI generation:
navigated to `http://localhost/presentations/f40b7f72-c199-4a5a-8783-e0a4d25eaf62`
editor showed `3 شرائح`
Observed after AI UI generation:
list showed new item `Board Update: Customer Churn Reduction and Margin Expansion`
list counters became `العروض الحالية = 15` and `إجمالي الشرائح = 24`
Playwright screenshot captured full editor page after live AI/UI actions as `surface5_presentations_ui.png`

## 9. API test proof
Executed live PowerShell API verification against gateway `http://localhost` with JWT signed by `rasid_jwt_secret_change_in_production_2024`.
Verified:
`POST /source/from-text -> 201`
`POST /ai/generate-from-text -> 201`
`POST /presentations/:id/slides -> 201`
`PUT /presentations/:id/slides/:slideIndex -> 200`
`DELETE /presentations/:id/slides/:slideIndex -> 200`
`GET /presentations/:id/export/pptx -> file 94446 bytes`
`GET /presentations/:id/export/pdf -> file 19279 bytes`

## 10. Integration test proof
Executed end-to-end PowerShell integration chain through gateway and persistence:
generate source presentation
generate AI presentation
fetch detail
add slide
update slide
export pptx/pdf
delete added slide
re-fetch detail
query PostgreSQL tables `presentations` and `slides`
Result JSON from that chain:
`{"sourcePresentationId":"0a92f333-56aa-4cbb-ac11-eb8d4a544133","aiPresentationId":"d182d69f-8eeb-4699-b717-4cf959d785c0","sourceSlideCount":3,"aiSlideCount":3,"addedSlideIndex":3,"updateResult":true,"updatedSlideTitle":"شريحة تشغيلية محدثة","updatedSlideBody":"تم تحديث المحتوى ليظهر في عناصر الشريحة والتصدير","pptxBytes":94446,"pdfBytes":19279,"slideCountAfterDelete":3}`

## 11. End-to-end test proof
Playwright network capture on the real UI recorded:
`POST http://localhost/api/v1/presentation/source/from-text => 201`
`GET http://localhost/api/v1/presentation/presentations/f40b7f72-c199-4a5a-8783-e0a4d25eaf62 => 200`
`PUT http://localhost/api/v1/presentation/presentations/f40b7f72-c199-4a5a-8783-e0a4d25eaf62/slides/1 => 200`
`POST http://localhost/api/v1/presentation/presentations/f40b7f72-c199-4a5a-8783-e0a4d25eaf62/slides => 201`
`DELETE http://localhost/api/v1/presentation/presentations/f40b7f72-c199-4a5a-8783-e0a4d25eaf62/slides/3 => 200`
`GET http://localhost/api/v1/presentation/presentations/f40b7f72-c199-4a5a-8783-e0a4d25eaf62/export/pptx => 200`
`POST http://localhost/api/v1/presentation/ai/generate-from-text => 201`
`GET http://localhost/api/v1/presentation/presentations/3df21f53-29de-424a-a28e-06a5f6d2b031 => 200`
Playwright confirmed UI download of PPTX to:
`C:\Users\engal\AppData\Local\Temp\playwright-mcp-output\1773036916135\تحسن-الاحتفاظ-بالعملاء-وتأثيره-على-الربحية.pptx`

## 12. Before/after proof
Before authenticated UI execution on `/presentations`:
snapshot showed `العروض الحالية = 13`
snapshot showed `إجمالي الشرائح = 18`
no new `Board Update: Customer Churn Reduction and Margin Expansion` item existed

After authenticated UI execution:
snapshot showed `العروض الحالية = 15`
snapshot showed `إجمالي الشرائح = 24`
new persisted rows existed in PostgreSQL for:
`f40b7f72-c199-4a5a-8783-e0a4d25eaf62`
`3df21f53-29de-424a-a28e-06a5f6d2b031`
slide `1` inside `f40b7f72-c199-4a5a-8783-e0a4d25eaf62` changed from the original generated title/body to the UI-saved title/body confirmed in `slides.content`

## 13. Explicit status
IMPLEMENTED
