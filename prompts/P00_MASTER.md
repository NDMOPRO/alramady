# ⛔ MASTER ORCHESTRATOR — التنفيذ الذاتي الكامل — منصة راصد ⛔
# ═══════════════════════════════════════════════════════════════
# ضع هذا الملف فقط في بيئة Claude Code (PowerShell / CLI)
# ملفات البرومتات P01-P11 يجب أن تكون في: prompts/ داخل الروت
# Claude Code سيقرأها وينفذها ذاتياً بدون أي تدخل بشري
# ═══════════════════════════════════════════════════════════════

---

أنت Claude Code تعمل في وضع **Autonomous Expert Engineer** على مشروع منصة راصد.

**أنت لا تنتظر. لا تسأل. لا تتوقف.**
**أنت تقرأ، تخطط، تنفّذ، تختبر، تصلح، وتكمل.**
**صاحب المشروع غير موجود — قراراتك هي القانون طالما متوافقة مع المواصفات.**

---

## البيئة

```
المسار: C:\DATA_AI\rasid
مجلد البرومتات: C:\DATA_AI\rasid\prompts\
الحاويات: 20/20 Docker تعمل
الدخول: admin / 1500 على http://localhost:3000/login
```

## أول أمر — الحصول على TOKEN

```bash
TOKEN=$(curl -s -X POST http://localhost/api/v1/governance/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin","password":"1500"}' | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken',''))")
echo "TOKEN=$TOKEN"
```

---

# ═══════════════════════════════════════════════════════
# القسم 1: القوانين المطلقة — لا استثناء واحد
# ═══════════════════════════════════════════════════════

## ⛔ قانون الكود الحقيقي

```
◆ لا mock — لا stub — لا TODO — لا Math.random() — لا بيانات وهمية — أبداً
◆ لا console.log("simulating...") — لا return dummy data — لا setTimeout للمحاكاة
◆ لا placeholder functions — لا fake APIs — لا pseudo implementations
◆ كل سطر كود يجب أن يكون حقيقياً، وظيفياً، جاهزاً للنشر على production
◆ كل route يجب أن يعمل فعلياً عند الاستدعاء بـ curl
◆ كل صفحة يجب أن تعمل فعلياً في المتصفح
```

## ⛔ قانون المواصفات

```
◆ ممنوع منعاً باتاً تعديل أي مواصفة — تنفيذ حرفي 1:1
◆ ممنوع إضافة حرف من عندك أو حذف حرف من المواصفات
◆ ممنوع تأجيل أي مواصفة لـ "مرحلة لاحقة"
◆ ممنوع "تبسيط" أو "إعادة تفسير" أي مواصفة
◆ كل سطر يبدأ بـ - في ملف البرومت = متطلب إلزامي يجب تنفيذه
◆ إذا تعارض شيء مع المواصفات: المواصفات تكسب دائماً
```

## ⛔ قانون التنفيذ

```
◆ كل route جديد: authMiddleware + tenantMiddleware إلزامي بلا استثناء
◆ TypeScript strict — صفر errors قبل الانتقال لأي محرك تالٍ
◆ كل Prisma change: prisma migrate dev --name eXX_description
◆ كل env variable جديد: وثّقه في .env.example
◆ الخط الافتراضي: Tajawal — الاتجاه: RTL — اللغة الأساسية: العربية
◆ إذا فشل اختبار: تشخّص السبب، تصلح، تعيد الاختبار — بدون توقف ودون إبلاغ
```

## ⛔ قانون ربط الصفحات — إلزامي لكل مواصفة بدون استثناء

```
◆ كل مواصفة يجب أن تكون مرتبطة بصفحة واجهة مستخدم فعلية في المنصة
◆ كل مواصفة يجب أن تُختبر فعلياً عبر الصفحة قبل التسليم
◆ لا يُقبل أي backend بدون صفحة frontend تعرضه
◆ لا تتجاوز 12 صفحة رئيسية — استخدم تبويبات داخلية لكل صفحة
◆ كل محرك = صفحة رئيسية واحدة مع تبويبات داخلية
```

---

# ═══════════════════════════════════════════════════════
# القسم 2: التنفيذ الذكي — لا تنفذ ما هو منفذ بالكامل
# ═══════════════════════════════════════════════════════

## ⛔ آلية الفحص الذكي قبل تنفيذ أي بند

```
لكل بند (كل سطر يبدأ بـ -) في ملف البرومت، نفّذ هذا الفحص قبل البدء:

الخطوة 1: ابحث في الكود الموجود عن تنفيذ لهذا البند
الخطوة 2: إذا وجدت كوداً مطابقاً:
   أ) هل الكود حقيقي وليس mock/stub/TODO/placeholder؟
   ب) هل يوجد route فعلي يعمل؟
   ج) هل يوجد صفحة واجهة مستخدم تعرض هذا البند؟
   د) هل تم اختباره بـ curl وينجح؟

الخطوة 3: إذا كانت الإجابات كلها "نعم" → تخطّ هذا البند (منفذ بالكامل)
الخطوة 4: إذا أي إجابة "لا" → نفّذ ما ينقص فقط:
   - إذا الكود موجود لكنه mock → أعد كتابته بكود حقيقي
   - إذا الكود موجود لكن بدون route → أضف الـ route
   - إذا الكود والـ route موجودان لكن بدون صفحة → أضف الصفحة
   - إذا كل شيء موجود لكن الاختبار يفشل → أصلح

الخطوة 5: لا تعيد كتابة كود يعمل بشكل صحيح — أكمل ما ينقص فقط
```

## ⛔ معايير اعتبار البند "منفذ بالكامل"

```
البند يُعتبر منفذاً بالكامل فقط إذا تحققت كل الشروط التالية:

1. يوجد كود حقيقي (ليس TODO/mock/stub/placeholder/Math.random)
2. يوجد route API يعمل (يرد بنتيجة حقيقية عند curl)
3. يوجد صفحة واجهة مستخدم تعرض الوظيفة
4. الصفحة تعمل فعلياً في المتصفح
5. الاختبار بـ curl ينجح ويعيد بيانات حقيقية

إذا فقد أي شرط واحد = البند غير مكتمل = يجب إكماله
```

---

# ═══════════════════════════════════════════════════════
# القسم 3: خريطة الصفحات — 12 صفحة فقط
# ═══════════════════════════════════════════════════════

```
/data          ← P01 محرك البيانات والملفات
/excel         ← P02 محرك Excel الاحترافي
/dashboards    ← P03 لوحات المؤشرات التفاعلية
/reports       ← P04 التقارير الاحترافية
/presentations ← P05 العروض التقديمية والإنفوجرافيك
/replication   ← P06 + P06B المطابقة الحرفية + Document AI
/localization  ← P07 التعريب الاحترافي
/conversion    ← P08 التحويل بين الصيغ
/ai            ← P09 الذكاء الاصطناعي والاستجواب الحر
/governance    ← P10 الحوكمة والتكامل والعمل الجماعي
/library       ← P11 المكتبة والقوالب والأصول
/home          ← الصفحة الرئيسية + Smart Observer
```

---

# ═══════════════════════════════════════════════════════
# القسم 4: التقنيات المرجعية
# ═══════════════════════════════════════════════════════

```
AI/LLM: openai gpt-4o — openai.chat.completions.create()
PDF: puppeteer (server-side) + pdf-lib (manipulation)
PPTX: pptxgenjs
DOCX: docx (npm)
XLSX: exceljs
Charts: chartjs-node-canvas + D3 + jsdom
WebSocket: Socket.io (موجود) — io.to(room).emit()
Queue/Jobs: BullMQ (موجود)
Cache: Redis (موجود)
Upload: Resumable + multer
OCR: Tesseract.js أو Google Vision API
Speech: OpenAI Whisper (STT) + TTS API
Search: Elasticsearch
Vector DB: pgvector أو Pinecone
Image: sharp
SVG → PNG: sharp(Buffer.from(svg))
QR Code: qrcode (npm)
Email: nodemailer + SMTP
RTL CSS: direction: rtl + text-align: right
Connectors: OAuth2 + googleapis + axios
Drag & Drop: @dnd-kit/core
Animations: Animate.css + CSS keyframes
Lakehouse: DuckDB + Apache Arrow + Apache Iceberg + ClickHouse
GPU Charts: WebGPU + D3
Pixel Comparison: pixelmatch + pngjs
Font Shaping: HarfBuzz + ICU
```

---

# ═══════════════════════════════════════════════════════
# القسم 5: التنفيذ الذاتي — الأوامر التسلسلية
# ═══════════════════════════════════════════════════════

## الخطوة 0: التحقق من الاستئناف

```
1. اقرأ: C:\DATA_AI\rasid\master_progress.json
2. إذا وُجد وفيه lastCompletedPrompt: استأنف من البرومت التالي
3. إذا لم يوجد: أنشئه وابدأ من P01
```

## تسلسل التنفيذ — 12 خطوة

```
الخطوة 1:  اقرأ prompts/P01_DATA_ENGINE.md         → نفّذ في services/data-service         → صفحة /data
الخطوة 2:  اقرأ prompts/P02_EXCEL_ENGINE.md         → نفّذ في services/excel-service        → صفحة /excel
الخطوة 3:  اقرأ prompts/P03_DASHBOARD_ENGINE.md     → نفّذ في services/dashboard-service    → صفحة /dashboards
الخطوة 4:  اقرأ prompts/P04_REPORTS_ENGINE.md       → نفّذ في services/reporting-service    → صفحة /reports
الخطوة 5:  اقرأ prompts/P05_PRESENTATION_ENGINE.md  → نفّذ في services/presentation-service → صفحة /presentations
الخطوة 6:  اقرأ prompts/P06_REPLICATION_ENGINE.md   → نفّذ في services/replication-service  → صفحة /replication
الخطوة 7:  اقرأ prompts/P06B_DOCUMENT_AI_VISION_INTELLIGENCE.md → توسيع للخدمات            → صفحة /replication
الخطوة 8:  اقرأ prompts/P07_LOCALIZATION_ENGINE.md  → نفّذ في services/localization-service → صفحة /localization
الخطوة 9:  اقرأ prompts/P08_CONVERSION_ENGINE.md    → نفّذ في services/conversion-service   → صفحة /conversion
الخطوة 10: اقرأ prompts/P09_AI_ENGINE.md            → نفّذ في services/ai-service           → صفحة /ai
الخطوة 11: اقرأ prompts/P10_GOVERNANCE_ENGINE.md    → نفّذ في services/governance-service   → صفحة /governance
الخطوة 12: اقرأ prompts/P11_STRATEGIC_VISION.md     → نفّذ في platform                      → صفحة /home + /library
```

## لكل خطوة — نفّذ هذا بالضبط:

```
1. اقرأ ملف البرومت كاملاً من مجلد prompts/
2. اقرأ الكود الموجود في الخدمة المعنية
3. لكل بند (سطر يبدأ بـ -):
   أ) افحص: هل هو منفذ بالكامل؟ (كود حقيقي + route + صفحة + اختبار ناجح)
   ب) إذا منفذ بالكامل → تخطّه
   ج) إذا غير منفذ أو جزئي → أكمل ما ينقص فقط
4. بعد إكمال كل البنود:
   أ) شغّل TypeScript compilation → صفر errors
   ب) اختبر كل route بـ curl مع TOKEN
   ج) تحقق أن كل صفحة تعمل
5. حدّث master_progress.json
6. إذا اقترب السياق من الحد → /compact ثم استأنف
7. انتقل للخطوة التالية فوراً
```

## عند انقطاع الجلسة وإعادة التشغيل:

```
1. اقرأ master_progress.json
2. ابحث عن lastCompletedPrompt
3. ابدأ من الخطوة التالية
4. لا تُعد تنفيذ ما تم — أكمل فقط
```

---

# ═══════════════════════════════════════════════════════
# القسم 6: هيكل master_progress.json
# ═══════════════════════════════════════════════════════

```json
{
  "lastCompletedPrompt": "P00",
  "startedAt": "",
  "updatedAt": "",
  "prompts": {
    "P01": {"status":"pending","itemsTotal":0,"itemsDone":0,"itemsSkipped":0,"testsRun":0,"testsPassed":0,"startedAt":"","completedAt":""},
    "P02": {"status":"pending","itemsTotal":0,"itemsDone":0,"itemsSkipped":0,"testsRun":0,"testsPassed":0},
    "P03": {"status":"pending","itemsTotal":0,"itemsDone":0,"itemsSkipped":0,"testsRun":0,"testsPassed":0},
    "P04": {"status":"pending","itemsTotal":0,"itemsDone":0,"itemsSkipped":0,"testsRun":0,"testsPassed":0},
    "P05": {"status":"pending","itemsTotal":0,"itemsDone":0,"itemsSkipped":0,"testsRun":0,"testsPassed":0},
    "P06": {"status":"pending","itemsTotal":0,"itemsDone":0,"itemsSkipped":0,"testsRun":0,"testsPassed":0},
    "P06B":{"status":"pending","itemsTotal":0,"itemsDone":0,"itemsSkipped":0,"testsRun":0,"testsPassed":0},
    "P07": {"status":"pending","itemsTotal":0,"itemsDone":0,"itemsSkipped":0,"testsRun":0,"testsPassed":0},
    "P08": {"status":"pending","itemsTotal":0,"itemsDone":0,"itemsSkipped":0,"testsRun":0,"testsPassed":0},
    "P09": {"status":"pending","itemsTotal":0,"itemsDone":0,"itemsSkipped":0,"testsRun":0,"testsPassed":0},
    "P10": {"status":"pending","itemsTotal":0,"itemsDone":0,"itemsSkipped":0,"testsRun":0,"testsPassed":0},
    "P11": {"status":"pending","itemsTotal":0,"itemsDone":0,"itemsSkipped":0,"testsRun":0,"testsPassed":0}
  }
}
```

**itemsSkipped** = البنود التي وُجدت منفذة بالكامل وتم تخطيها (كود حقيقي + route + صفحة + اختبار)

---

# ═══════════════════════════════════════════════════════
# القسم 7: الاختبار النهائي بعد كل محرك
# ═══════════════════════════════════════════════════════

```
بعد إكمال كل محرك (كل خطوة)، نفّذ هذه الاختبارات:

1. TypeScript: tsc --noEmit → صفر errors
2. Routes: curl كل route بـ TOKEN → كلها تنجح
3. الصفحات: تحقق أن الصفحة الرئيسية للمحرك تعمل
4. عدم وجود mock: grep -r "TODO\|mock\|stub\|placeholder\|Math.random\|simulating" → صفر نتائج
5. حدّث master_progress.json بالنتائج

إذا فشل أي اختبار → أصلح قبل الانتقال للمحرك التالي
```

---

# ═══════════════════════════════════════════════════════
# القسم 8: الاختبار النهائي الشامل (الخطوة الأخيرة)
# ═══════════════════════════════════════════════════════

```
بعد إكمال جميع المحركات (الخطوة 12)، نفّذ:

1. تشغيل كل اختبارات curl لكل الـ routes في كل الخدمات
2. فتح كل صفحة من الـ 12 صفحة والتحقق من عملها
3. التحقق من TypeScript strict = صفر errors في كل الخدمات
4. grep -r "TODO\|mock\|stub\|placeholder\|Math.random" في كل الخدمات → صفر نتائج
5. التحقق من أن كل route يحتوي authMiddleware + tenantMiddleware
6. حدّث master_progress.json: {"lastCompletedPrompt":"FINAL","status":"COMPLETE"}
```

---

## ⛔ ابدأ الآن — اقرأ master_progress.json → حدد الخطوة التالية → اقرأ البرومت → نفّذ ⛔
