# 1. Supported media/input types

- PDF قابل للبحث عبر `pdf-parse`.
- DOCX عبر `mammoth`.
- TXT وMarkdown وCSV وJSON وHTML كنصوص مباشرة عبر UTF-8 decoding.
- الصور `PNG/JPG/JPEG/WEBP/GIF` عبر OCR فعلي قائم على الرؤية.
- الصوت `MP3/WAV/M4A/WEBM/OGG` عبر تفريغ فعلي.
- الفيديو `MP4/MOV/AVI/MKV/WEBM` عبر استخراج إطارات + OCR للشاشة + تفريغ الصوت.

## 2. OCR/transcription/extraction flows used

- المسارات الفعلية:
```text
POST /api/v1/ai/multimodal/extract
POST /api/v1/ai/ocr/extract
POST /api/v1/ai/ocr/arabic
POST /api/v1/ai/document/pdf-analyze
```
- التنفيذ الفعلي:
```text
PDF -> pdf-parse
DOCX -> mammoth.extractRawText
Image OCR -> OpenAI vision (gpt-4o)
Audio transcription -> OpenAI audio.transcriptions (whisper-1)
Video -> ffmpeg-static لاستخراج الإطارات والصوت -> gpt-4o + whisper-1
Structured steps -> OpenAI chat completion JSON
```
- العزل عن المسارات الوهمية تم عبر [multimodal-extraction.routes.ts](/C:/DATA_AI/rasid/services/ai-service/src/routes/multimodal-extraction.routes.ts) المثبت قبل [document-intelligence.routes.ts](/C:/DATA_AI/rasid/services/ai-service/src/routes/document-intelligence.routes.ts) داخل [index.ts](/C:/DATA_AI/rasid/services/ai-service/src/index.ts).

## 3. Arabic/English extraction support

- صورة عربية:
```text
POST /api/v1/ai/ocr/arabic
language: ar
fullText يبدأ بـ:
مستخدم
مدير
K %
راسد
منصة التحليل الذكي
```
- PDF مختلط:
```text
POST /api/v1/ai/document/pdf-analyze
extractedText:
هذا مستند تجريبي لاختبار الاستخراج الدقيق من ملفات PDF.
English line for exact extraction verification
```
- DOCX مختلط:
```json
{
  "language": "mixed",
  "text": "Arabic and English Procedure\nالخطوة الأولى: افتح لوحة التحكم.\nStep two: Review the extracted metrics carefully.\nالخطوة الثالثة: صدّر التقرير النهائي."
}
```

## 4. Exact extraction results

- TXT exact mode:
```json
{
  "inputType": "text",
  "filename": "instruction_ar.txt",
  "exactExtraction": {
    "text": "افتح ملف التعليمات.\nراجع العناوين الرئيسية.\nاستخرج الخطوات التشغيلية بالترتيب.\nصدّر النتيجة إلى تقرير نهائي.",
    "language": "ar",
    "sourceEngine": "utf8-decoder"
  }
}
```
- PDF exact analysis:
```json
{
  "searchable": true,
  "extractedTextLength": 121,
  "processingEngine": "pdf-parse"
}
```
- Audio exact transcription:
```json
{
  "inputType": "audio",
  "filename": "sample_ar_instruction.mp3",
  "exactExtraction": {
    "text": "أفتح ملف التعليمات، ثم راجع المؤشرات، وأستخرج الخطوات، وأصدر التقرير النهائي.",
    "language": "arabic",
    "sourceEngine": "whisper-1"
  }
}
```
- Video exact multimodal extraction:
```json
{
  "inputType": "video",
  "sourceEngine": "gpt-4o + whisper-1",
  "metadata": {
    "frameCount": 4,
    "mimeType": "video/mp4"
  }
}
```

## 5. Structured step extraction results

- TXT steps-only mode:
```json
{
  "title": "استخراج خطوات تشغيلية من ملف تعليمات",
  "steps": [
    { "index": 1, "title": "فتح ملف التعليمات" },
    { "index": 2, "title": "مراجعة العناوين الرئيسية" },
    { "index": 3, "title": "استخراج الخطوات التشغيلية" },
    { "index": 4, "title": "تصدير النتيجة إلى تقرير نهائي" }
  ]
}
```
- DOCX mixed structured result:
```json
{
  "title": "Arabic and English Procedure",
  "language": "mixed",
  "steps": [
    { "index": 1, "title": "Open Control Panel" },
    { "index": 2, "title": "Review Extracted Metrics" },
    { "index": 3, "title": "Export Final Report" }
  ]
}
```
- Video structured result بعد تقديم النص المنطوق على نص الشاشة:
```json
{
  "title": "كيفية استخراج خطوات من ملف تعليمات",
  "steps": [
    { "index": 1, "title": "فتح ملف التعليمات" },
    { "index": 2, "title": "مراجعة المؤشرات" },
    { "index": 3, "title": "استخراج الخطوات" },
    { "index": 4, "title": "إصدار التقرير النهائي" }
  ]
}
```

## 6. Services/modules/APIs used

- ملفات التنفيذ:
```text
services/ai-service/src/services/multimodal-extraction.service.ts
services/ai-service/src/routes/multimodal-extraction.routes.ts
services/ai-service/src/index.ts
services/ai-service/src/__tests__/multimodal-extraction.service.test.ts
```
- المحركات الفعلية:
```text
OpenAI chat.completions
OpenAI audio.transcriptions
pdf-parse
mammoth
ffmpeg-static
multer
```
- عينات التحقق الفعلية:
```text
tmp_media/instruction_ar.txt
tmp_media/steps_mixed.docx
tmp_media/sample_ar_instruction.mp3
tmp_media/sample_instruction_video.mp4
tmp_media/sample_extract.pdf
artifacts/library/library-ui.png
```

## 7. Real output proof

- PDF صالح:
```text
POST /api/v1/ai/document/pdf-analyze -> 200
extractedTextLength -> 121
pageCount -> 1
```
- OCR للصورة:
```text
POST /api/v1/ai/ocr/extract -> 200
fullText يتضمن:
راصد منصة التحليل الذكي
المكتبة
الأصول المخزنة
```
- OCR العربي:
```text
POST /api/v1/ai/ocr/arabic -> 200
textDirection -> rtl
fullText يتضمن:
مستخدم
مدير
منصة التحليل الذكي
```
- MP3:
```text
POST /api/v1/ai/multimodal/extract -> 200
duration -> 8.300000190734863
segmentCount -> 1
```
- MP4:
```text
POST /api/v1/ai/multimodal/extract -> 200
frameCount -> 4
visibleText.sourceEngine -> gpt-4o
spokenTranscript.sourceEngine -> whisper-1
```

## 8. Test proof

- اختبار الوحدة المستهدف:
```text
npx jest --config jest.config.ts src/__tests__/multimodal-extraction.service.test.ts --runInBand
PASS src/__tests__/multimodal-extraction.service.test.ts
Tests: 6 passed, 6 total
```
- تحقق حي عبر الـ API:
```text
TXT exact -> 200
TXT steps -> 200
DOCX both -> 200
PDF analyze -> 200
Image OCR JPG -> 200
Image OCR PNG -> 200
Audio transcription MP3 -> 200
Video multimodal MP4 -> 200
Invalid PDF sample -> 501 MULTIMODAL_BLOCKED
```

## 9. Before/after proof

- قبل:
```text
services/ai-service/src/routes/document-intelligence.routes.ts
/ocr/extract كان يولد أسطر OCR من sampleTexts ثابتة مرتبطة بـ hash
/ocr/arabic كان يولد arabicLines ثابتة
/document/pdf-analyze كان يعيد layers/fonts/metadata ثابتة
الاستخراج المنظم من الفيديو كان غير موجود
```
- بعد:
```text
services/ai-service/src/routes/multimodal-extraction.routes.ts
services/ai-service/src/services/multimodal-extraction.service.ts
PDF صار يقرأ النص الحقيقي من الملف
DOCX صار يقرأ النص الحقيقي من الملف
الصورة صارت تمر عبر OCR فعلي
الصوت صار يمر عبر تفريغ فعلي
الفيديو صار يمر عبر ffmpeg-static + OCR الإطارات + تفريغ الصوت
الخطوات المنظمة صارت تُبنى من النص المستخرج الحقيقي مع evidence snippets
الـ PDF غير الصالح لم يعد يعطي fake success بل 501 MULTIMODAL_BLOCKED
```

## 10. Explicit status

IMPLEMENTED
