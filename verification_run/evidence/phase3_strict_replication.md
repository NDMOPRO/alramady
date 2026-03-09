# Phase 3 Strict Replication

## 1. replication architecture actually used in this project
- `services/replication-service/src/routes/generate-from-layout.routes.ts`
- `services/replication-service/src/services/layout-generation-controller.service.ts`
- `services/replication-service/src/services/canonical-pipeline-orchestrator.service.ts`
- `services/replication-service/src/services/visual-analyzer.service.ts`
- `services/replication-service/src/services/data-extraction.service.ts`
- `services/presentation-service/src/routes/presentation.routes.ts`
- `services/presentation-service/src/services/multi-format-generator.service.ts`
- `services/rendering-environment`
- Real path exercised:
  - source image upload -> `POST /api/v1/replication/analyze`
  - image -> canonical graph -> data extraction -> generator orchestration -> `dashboard/report/presentation/docx/spreadsheet`
  - presentation/docx/xlsx generation delegated from replication-service to `POST /api/v1/presentation/internal/canonical-generate`
- Strict routes also inspected and executed:
  - `POST /api/v1/replication/extract-structure`
  - `POST /api/v1/replication/verify`

## 2. supported input types tested
- `image`
  - real uploaded file: `verification_run/phase3_test_input.png`
- `xlsx`
  - strict route test only
- `pptx`
  - strict route test only

## 3. supported outputs tested
- `dashboard/html`
- `report/html`
- `presentation/pptx`
- `docx/docx`
- `spreadsheet/xlsx`

## 4. exact command/test runs
```text
$ Invoke-RestMethod http://localhost:8007/health
$ $login = Invoke-RestMethod -Method Post -Uri 'http://localhost/api/v1/governance/auth/login' -ContentType 'application/json' -Body '{"email":"admin@rasid.demo","password":"Password123!"}'
$analysis = curl.exe -s -X POST http://localhost:8007/api/v1/replication/analyze -H "Authorization: Bearer $token" -F "image=@C:\DATA_AI\rasid\verification_run\phase3_test_input.png;type=image/png"
$form = @{
  file = Get-Item 'C:\DATA_AI\rasid\verification_run\phase3_test_input.png'
  inputType = 'image'
  outputs = '[{"generator":"dashboard","format":"html"},{"generator":"report","format":"html"},{"generator":"spreadsheet","format":"html"}]'
  options = '{"pixelPerfectValidation":true,"extractData":true,"optimizeArabicTypography":false}'
}
Invoke-RestMethod -Method Post -Uri 'http://localhost:8007/api/v1/replication/generate-from-layout/upload' -Form $form | ConvertTo-Json -Depth 10
$form = @{
  file = Get-Item 'C:\DATA_AI\rasid\verification_run\phase3_test_input.png'
  inputType = 'image'
  outputs = '[{"generator":"presentation","format":"pptx"},{"generator":"docx","format":"docx"},{"generator":"spreadsheet","format":"xlsx"}]'
  options = '{"pixelPerfectValidation":true,"extractData":true,"optimizeArabicTypography":false}'
}
Invoke-RestMethod -Method Post -Uri 'http://localhost:8007/api/v1/replication/generate-from-layout/upload' -Form $form | ConvertTo-Json -Depth 10
$xlsx = Invoke-RestMethod -Method Post -Uri 'http://localhost:8007/api/v1/replication/extract-structure' -Headers $headers -Body '{"fileType":"xlsx","mode":"STRICT_REPLICATION"}'
$pptx = Invoke-RestMethod -Method Post -Uri 'http://localhost:8007/api/v1/replication/extract-structure' -Headers $headers -Body '{"fileType":"pptx","mode":"STRICT_REPLICATION"}'
$verify = Invoke-RestMethod -Method Post -Uri 'http://localhost:8007/api/v1/replication/verify' -Headers $headers -Body '{"sourceElements":[{"x":0,"y":0,"width":100,"height":50,"type":"table"}],"resultElements":[{"x":0,"y":0,"width":100,"height":50,"type":"table"}]}'
$ docker compose build presentation-service replication-service
$ docker compose up -d presentation-service replication-service
$ docker compose build presentation-service
$ docker compose up -d presentation-service
```

## 5. exact raw results
```text
{"success":true,"data":{"layout":{"gridStructure":"single column with header, two info boxes, and a table","columns":1,"rows":4,"elements":[{"type":"header","position":{"x":5,"y":5,"width":90,"height":10},"description":"Sales Snapshot","zIndex":1},{"type":"text","position":{"x":10,"y":20,"width":40,"height":20},"description":"Revenue 1250000","zIndex":2},{"type":"text","position":{"x":50,"y":20,"width":40,"height":20},"description":"Profit 350000","zIndex":2},{"type":"table","position":{"x":10,"y":50,"width":80,"height":20},"description":"Department and Value","zIndex":1}],"spacing":"normal","alignment":"left"},"colors":["#000000","#FFFFFF","#0000FF","#008000","#F0F8FF"],"fonts":["Arial","sans-serif"],"textContent":[{"text":"Sales Snapshot","position":{"x":5,"y":5,"width":90,"height":10},"fontSize":"large","fontWeight":"bold","alignment":"left"},{"text":"Revenue 1250000","position":{"x":10,"y":20,"width":40,"height":20},"fontSize":"medium","fontWeight":"bold","alignment":"center"},{"text":"Profit 350000","position":{"x":50,"y":20,"width":40,"height":20},"fontSize":"medium","fontWeight":"bold","alignment":"center"}],"charts":[],"dataTables":[{"headers":["Department","Value"],"rows":[["Sales","500000"]],"position":{"x":10,"y":50,"width":80,"height":20}}],"dimensions":{"width":480,"height":270},"timestamp":"2026-03-09T12:44:43.022Z"},"metadata":{"originalName":"phase3_test_input.png","mimeType":"image/png","size":5944}}}
```

```text
"totalElements": 0
"elementsRendered": 1
"pixelDiff": -1
"elementsRendered": 0
```

```text
"detail": "1 tables, 0 charts, 2 KPIs, 1 text blocks"
"elementsRendered": 4
"pixelDiff": 0
"isPerfect": true
"iterationCount": 1
```

```text
"generator": "presentation",
"format": "pptx",
"sizeBytes": 52889,
"elementsRendered": 4
"generator": "docx",
"format": "docx",
"sizeBytes": 8929,
"elementsRendered": 4
"generator": "spreadsheet",
"format": "xlsx",
"sizeBytes": 7452,
"elementsRendered": 3
```

```text
{"format":"pptx","pages":1,"service":"multi-format-generator","timestamp":"2026-03-09T13:18:52.213Z"}
{"elements":4,"fileSize":52889,"format":"pptx","processingTimeMs":16,"service":"multi-format-generator","timestamp":"2026-03-09T13:18:52.228Z"}
{"format":"docx","pages":1,"service":"multi-format-generator","timestamp":"2026-03-09T13:18:52.248Z"}
{"elements":4,"fileSize":8929,"format":"docx","processingTimeMs":73,"service":"multi-format-generator","timestamp":"2026-03-09T13:18:52.321Z"}
{"format":"xlsx","pages":1,"service":"multi-format-generator","timestamp":"2026-03-09T13:20:19.793Z"}
{"elements":3,"fileSize":7452,"format":"xlsx","processingTimeMs":256,"service":"multi-format-generator","timestamp":"2026-03-09T13:20:20.048Z"}
```

```text
"fileType": "pptx",
"mode": "STRICT_REPLICATION",
"elements": [],
"fileType": "xlsx",
"mode": "STRICT_REPLICATION",
"elements": [],
"passed": true,
"pixelDiff": {
  "value": 0,
  "threshold": 0.001,
  "passed": true
},
"structuralHash": {
  "similarity": 1,
  "threshold": 0.999,
  "passed": true
}
```

## 6. mismatches found
- `layout-generation-controller` كان يبني graph وهميًّا عند فشل نداء داخلي للتحليل، فنتج `totalElements: 0`.
- `canonical-pipeline-orchestrator` كان يمرر `html` مباشرة إلى `sharp` في pixel validation فنتج `Input buffer contains unsupported image format`.
- `presentation` adapter كان يستدعي عنوانًا ومنفذًا ومسارًا غير موجودين ثم يسقط إلى dashboard fallback.
- `layout-generation-controller` كان يعرض نوع ملف مطلوب بدل نوع المخرجات الحقيقي.
- `multi-format-generator` فشل أولًا في `docx` و`xlsx` داخل الحاوية قبل إعادة البناء.
- `ExcelJS.Workbook is not a constructor` منع `xlsx` الحقيقي قبل إصلاح الاستيراد.
- `strict-replication` نفسه ما زال غير صارم:
  - `extract-structure` لـ `pptx/xlsx` يعيد `elements: []`
  - `verify` ينجح على عناصر مصطنعة متطابقة من دون مستند حقيقي
  - binary outputs (`pptx/docx/xlsx`) تظهر في السجل `pixelPerfect":"not validated"`

## 7. fixes applied
- `services/replication-service/src/services/layout-generation-controller.service.ts`
  - استبدال التحليل الذاتي عبر HTTP ببناء graph مباشر من `analyzeImage`.
  - تحويل النصوص والجداول وKPI والألوان والخطوط إلى canonical nodes حقيقية.
  - تصحيح `mimeType` ليأخذ الناتج الحقيقي من الـ generator.
- `services/replication-service/src/services/canonical-pipeline-orchestrator.service.ts`
  - تمرير الـ generator الحقيقي إلى pixel validation.
  - تحويل HTML إلى صورة عبر `rendering-environment` قبل المقارنة.
  - تصحيح `PRESENTATION_SERVICE_URL` والمنفذ والمسار إلى `http://presentation-service:8005/api/v1/presentation/internal/canonical-generate`.
- `services/presentation-service/src/routes/presentation.routes.ts`
  - إضافة مسار HTTP حقيقي للتوليد متعدد الصيغ من `CanonicalLayoutGraph`.
- `services/presentation-service/src/services/multi-format-generator.service.ts`
  - إصلاح إنشاء Workbook من ExcelJS.
- إعادة بناء وتشغيل:
  - `docker compose build presentation-service replication-service`
  - `docker compose up -d presentation-service replication-service`
  - `docker compose build presentation-service`
  - `docker compose up -d presentation-service`

## 8. rerun results
- image -> `dashboard/report/spreadsheet html`
  - قبل الإصلاح: `totalElements: 0`, `pixelDiff: -1`
  - بعد الإصلاح: `1 tables, 0 charts, 2 KPIs, 1 text blocks`, و`pixelDiff: 0`, و`isPerfect: true`
- image -> `presentation:pptx`
  - بعد الإصلاح: `sizeBytes: 52889`, `elementsRendered: 4`
- image -> `docx:docx`
  - بعد الإصلاح: `sizeBytes: 8929`, `elementsRendered: 4`
- image -> `spreadsheet:xlsx`
  - بعد إصلاح ExcelJS: `sizeBytes: 7452`, `elementsRendered: 3`
- strict extractor / verifier
  - ما زال `extract-structure` لـ `pptx/xlsx` يعيد `elements: []`
  - ما زال `verify` ينجح على مدخلات مصطنعة بلا ملف مصدر

## 9. final strict replication judgment
- تحسن المسار الفعلي للصورة إلى مخرجات قابلة للتوليد والتحرير بشكل ملموس:
  - `dashboard/report html` مع استخراج عناصر حقيقية وpixel validation ناجح
  - `pptx/docx/xlsx` عبر خدمات حقيقية بعد الإصلاحات
- لكن strict one-to-one visual replication غير مقبول نهائيًا بعد:
  - مسار `STRICT_REPLICATION` نفسه ليس محققًا على ملفات `pptx/xlsx`
  - التحقق الثنائي الحقيقي source-vs-output غير مطبق على `pptx/docx/xlsx`
  - `verify` الحالي يمكنه النجاح على بيانات مصطنعة لا على مستندات فعلية

## 10. remaining blockers only if real and proven
- `POST /api/v1/replication/extract-structure`:
  - `pptx` -> `"elements": []`
  - `xlsx` -> `"elements": []`
- `POST /api/v1/replication/verify`:
  - يمرر `passed: true`, `pixelDiff.value: 0`, `structuralHash.similarity: 1` على عناصر مرسلة يدويًا.
- مخرجات `pptx/docx/xlsx` من مسار المطابقة الفعلي لا تحمل pixel validation صارمًا؛ سجل replication-service يثبت:
  - `"pixelPerfect":"not validated"`

## 11. phase status
- HARD_BLOCKER
