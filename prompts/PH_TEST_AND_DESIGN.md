# ⛔ PH — الاختبار الفعلي الشامل + تحسين التصميم البصري ⛔
# نفّذ هذا البرومت بعد اكتمال PA→PG
# الهدف: اختبار كل شيء فعلياً + جعل الواجهة فاخرة وجاهزة للاستخدام

---

أنت Claude Code تعمل في وضع **QA Engineer + UI/UX Designer** على منصة راصد.

**المهمة من جزئين:**
1. **اختبار فعلي** لكل صفحة وكل وظيفة عبر المتصفح وcurl
2. **تحسين التصميم البصري** ليصبح فاخراً واحترافياً وسهل الاستخدام

**المسار:** `C:\DATA_AI\rasid`
**البيئة:** 20/20 حاوية Docker
**الدخول:** admin / 1500 على http://localhost:3000/login

---

## TOKEN

```bash
TOKEN=$(curl -s -X POST http://localhost/api/v1/governance/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin","password":"1500"}' | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken',''))")
```

---

# ═══════════════════════════════════════════════════════
# الجزء 1: الاختبار الفعلي الشامل
# ═══════════════════════════════════════════════════════

## ⛔ طريقة الاختبار — لكل صفحة:

```
1. افتح الصفحة في المتصفح عبر http://localhost:3000/[path]
2. تحقق أنها تفتح بدون أخطاء (لا شاشة بيضاء — لا 404 — لا 500)
3. تحقق أن كل الأزرار والتبويبات تعمل
4. اختبر الوظائف الأساسية فعلياً (رفع ملف — إنشاء — تعديل — تصدير)
5. اختبر الـ API بـ curl مع TOKEN
6. إذا فشل أي شيء: أصلحه فوراً قبل الانتقال
7. سجّل النتيجة في test_results.json
```

---

## اختبار كل صفحة — بالترتيب:

### 1. الصفحة الرئيسية /home أو /

```bash
# تحقق أن الصفحة تفتح
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
# يجب أن يكون 200

# تحقق أن القائمة الجانبية تعرض كل الصفحات الـ 12
# تحقق أن Smart Observer يعمل (شريط الأوامر أو الدردشة)
```

### 2. صفحة البيانات /data

```bash
# اختبر رفع ملف
curl -s -X POST http://localhost/api/v1/data/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.xlsx" -w "%{http_code}"

# اختبر قائمة الملفات
curl -s http://localhost/api/v1/data/files \
  -H "Authorization: Bearer $TOKEN" | head -100

# اختبر المعاينة
curl -s http://localhost/api/v1/data/files/1/preview \
  -H "Authorization: Bearer $TOKEN" | head -50

# تحقق من الصفحة: تبويبات upload/preview/columns/tables/canvas/clean
# تحقق: السحب والإفلات يعمل
# تحقق: الوضع السهل والمتقدم يعملان
```

### 3. صفحة Excel /excel

```bash
# اختبر رفع ملف Excel
curl -s -X POST http://localhost/api/v1/excel/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.xlsx" -w "%{http_code}"

# اختبر التنسيق الاحترافي
curl -s -X POST http://localhost/api/v1/excel/format-professional \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fileId":"1"}' -w "%{http_code}"

# تحقق: تبويبات formulas/format/match/mode
# تحقق: زر "تنسيق احترافي كامل" يعمل
```

### 4. صفحة لوحات المؤشرات /dashboards

```bash
# اختبر إنشاء لوحة سهلة
curl -s -X POST http://localhost/api/v1/dashboards/generate-easy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"datasetId":"1"}' -w "%{http_code}"

# اختبر قائمة اللوحات
curl -s http://localhost/api/v1/dashboards \
  -H "Authorization: Bearer $TOKEN" | head -100

# تحقق: إنشاء بضغطة زر يعمل
# تحقق: السحب والإفلات للعناصر يعمل
# تحقق: تعديل العناصر بعد الإنشاء يعمل
# تحقق: حفظ كقالب يعمل
```

### 5. صفحة التقارير /reports

```bash
# اختبر إنشاء تقرير
curl -s -X POST http://localhost/api/v1/reports/generate-easy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"datasetId":"1"}' -w "%{http_code}"

# اختبر التصدير
curl -s -X POST http://localhost/api/v1/reports/1/export/pdf \
  -H "Authorization: Bearer $TOKEN" -w "%{http_code}"

# تحقق: التقرير ينشأ بضغطة زر
# تحقق: التعديل بعد الإنشاء يعمل
# تحقق: التصدير PDF/DOCX يعمل
```

### 6. صفحة العروض /presentations

```bash
# اختبر إنشاء عرض
curl -s -X POST http://localhost/api/v1/presentations/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source":"text","content":"تحليل أداء المبيعات الربع الأول"}' -w "%{http_code}"

# تحقق: إنشاء عرض من نص يعمل
# تحقق: القوالب تظهر (Vinyl, Whiteboard, Grove, Fresco, Easel, Diorama, Chromatic)
# تحقق: تعديل الشرائح بعد الإنشاء يعمل
# تحقق: تصدير PPTX يعمل
# تحقق: الإنفوجرافيك يعمل
```

### 7. صفحة المطابقة /replication

```bash
# اختبر رفع صورة للمطابقة
curl -s -X POST http://localhost/api/v1/replication/capture \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@screenshot.png" -w "%{http_code}"

# اختبر التحقق
curl -s -X POST http://localhost/api/v1/replication/verify \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sourceId":"1","resultId":"1"}' -w "%{http_code}"

# تحقق: رفع صورة → تحليل → إعادة بناء يعمل
# تحقق: الوضع STRICT يعمل
```

### 8. صفحة التعريب /localization

```bash
# اختبر الترجمة
curl -s -X POST http://localhost/api/v1/localization/translate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"Sales Report Q1","targetLang":"ar"}' -w "%{http_code}"

# تحقق: الترجمة تعمل
# تحقق: RTL يعمل بشكل صحيح
# تحقق: Kashida والتشكيل يعملان
```

### 9. صفحة التحويل /conversion

```bash
# اختبر التحويل
curl -s -X POST http://localhost/api/v1/conversion/convert \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.pdf" \
  -F "targetFormat=xlsx" -w "%{http_code}"
```

### 10. صفحة الذكاء الاصطناعي /ai

```bash
# اختبر المحادثة
curl -s -X POST http://localhost/api/v1/ai/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"ما أعلى 10 منتجات مبيعاً؟","datasetId":"1"}' -w "%{http_code}"

# اختبر التحليل
curl -s -X POST http://localhost/api/v1/ai/analyze \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"datasetId":"1","type":"comprehensive"}' -w "%{http_code}"

# تحقق: الاستجواب الحر يعمل
# تحقق: التحليل الشامل يعمل
# تحقق: الوكلاء الذكية يعملون
```

### 11. صفحة الحوكمة /governance

```bash
# اختبر قائمة المستخدمين
curl -s http://localhost/api/v1/governance/users \
  -H "Authorization: Bearer $TOKEN" -w "%{http_code}"

# اختبر سجل العمليات
curl -s http://localhost/api/v1/governance/audit-logs \
  -H "Authorization: Bearer $TOKEN" | head -50

# تحقق: الصلاحيات تعمل
# تحقق: سجل العمليات يعمل
```

### 12. صفحة المكتبة /library

```bash
# اختبر قائمة القوالب
curl -s http://localhost/api/v1/presentations/templates \
  -H "Authorization: Bearer $TOKEN" -w "%{http_code}"

# تحقق: المكتبة تعرض القوالب والأصول
```

---

## بعد اختبار كل الصفحات — إنشاء ملف test_results.json:

```json
{
  "testedAt": "",
  "pages": {
    "/home": {"status":"","errors":[]},
    "/data": {"status":"","errors":[]},
    "/excel": {"status":"","errors":[]},
    "/dashboards": {"status":"","errors":[]},
    "/reports": {"status":"","errors":[]},
    "/presentations": {"status":"","errors":[]},
    "/replication": {"status":"","errors":[]},
    "/localization": {"status":"","errors":[]},
    "/conversion": {"status":"","errors":[]},
    "/ai": {"status":"","errors":[]},
    "/governance": {"status":"","errors":[]},
    "/library": {"status":"","errors":[]}
  }
}
```

---

# ═══════════════════════════════════════════════════════
# الجزء 2: تحسين التصميم البصري
# ═══════════════════════════════════════════════════════

## ⛔ المعايير البصرية المطلوبة:

```
◆ واجهة فاخرة عصرية — ليست بسيطة ولا مملة
◆ RTL كامل — اتجاه من اليمين لليسار — خط Tajawal
◆ ألوان متناسقة احترافية — لا ألوان صارخة
◆ مسافات مدروسة — لا ازدحام — لا فراغ مبالغ فيه
◆ أيقونات واضحة لكل وظيفة
◆ تبويبات منظمة داخل كل صفحة
◆ أزرار واضحة: الوضع السهل (زر رئيسي كبير) + الوضع المتقدم (أيقونة إعدادات)
◆ الرسوم البيانية والجداول بألوان جذابة
◆ تأثيرات hover خفيفة على الأزرار والبطاقات
◆ تحميل سلس بدون وميض (loading states)
◆ رسائل نجاح/خطأ واضحة بالعربي
◆ القائمة الجانبية: أيقونات + أسماء + تمييز الصفحة الحالية
◆ الهيدر: شعار + اسم المنصة + زر المستخدم
```

## لكل صفحة — طبّق هذه التحسينات:

### القائمة الجانبية (Sidebar)

```
- أيقونة + اسم لكل صفحة
- تمييز الصفحة الحالية بلون مختلف
- أيقونات: lucide-react أو heroicons
- عرض مطوي على الجوال
- ألوان: خلفية داكنة (#1a1a2e أو #0f172a) — نص أبيض — تمييز أزرق (#3b82f6)
```

### الهيدر (Header)

```
- شعار "راصد" بخط Tajawal Bold
- شريط بحث أو Smart Observer
- زر المستخدم (اسم + صورة رمزية)
- إشعارات
```

### صفحة البيانات /data — التصميم:

```
- منطقة رفع بتصميم drag-and-drop جذاب (حدود متقطعة + أيقونة سحابة)
- شريط تقدم عند الرفع
- بطاقات لكل ملف مرفوع (اسم + نوع + حجم + تاريخ)
- تبويبات: رفع | معاينة | الأعمدة | الجداول | Canvas | تنظيف
- زر كبير "تحليل ذكي" بلون أزرق بارز
- زر "تنظيف شامل" بلون أخضر
```

### صفحة Excel /excel — التصميم:

```
- معاينة الجدول بتنسيق يشبه Excel فعلياً (خطوط شبكية + رؤوس ملونة)
- زر كبير "تنسيق احترافي" 
- شريط أدوات المعادلات
- مؤشر جودة الملف (نسبة مئوية بلون)
```

### صفحة الداشبورد /dashboards — التصميم:

```
- شبكة مرنة لعرض العناصر
- لوحة عناصر جانبية (KPI, Chart, Table, Filter) قابلة للسحب
- زر كبير "إنشاء لوحة ذكية"
- كل عنصر له إطار خفيف + ظل + زوايا مستديرة
- ألوان الرسوم: تدرجات زرقاء/خضراء/بنفسجية
```

### صفحة التقارير /reports — التصميم:

```
- معاينة التقرير بشكل صفحة A4
- شريط أدوات تحرير جانبي
- أزرار التصدير (PDF, DOCX, PPTX) بأيقونات واضحة
- زر "إنشاء تقرير" كبير
```

### صفحة العروض /presentations — التصميم:

```
- معاينة الشرائح بشكل شريط أفقي أو عمودي
- محرر الشريحة بملء الشاشة
- لوحة القوالب (7 قوالب) بصور مصغرة جذابة
- قسم الإنفوجرافيك (6 أنواع) ببطاقات مصورة
```

### صفحة المطابقة /replication — التصميم:

```
- عرض جنب-إلى-جنب (الأصل ← النتيجة)
- مؤشر التطابق (نسبة + لون: أخضر/أصفر/أحمر)
- زر "مطابقة حرفية" بارز
```

### صفحة التعريب /localization — التصميم:

```
- عرض مقسم: النص الأصلي (يسار) ← النص المعرّب (يمين)
- مؤشر جودة الترجمة
- قائمة المصطلحات
```

### صفحة الذكاء /ai — التصميم:

```
- واجهة محادثة (chat) بتصميم عصري
- فقاعات رسائل المستخدم (يمين) والنظام (يسار)
- أزرار سريعة: "تحليل شامل" + "ملخص تنفيذي" + "مقارنة"
- عرض النتائج (جداول + رسوم) داخل المحادثة
```

### صفحة الحوكمة /governance — التصميم:

```
- جدول المستخدمين بتصميم نظيف
- سجل العمليات بتصميم timeline
- إعدادات الأمان ببطاقات منظمة
```

---

## ⛔ تحسينات CSS عامة — طبّقها على كل المنصة:

```css
/* الخط الأساسي */
@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800&display=swap');

body {
  font-family: 'Tajawal', sans-serif;
  direction: rtl;
  background: #f8fafc;
  color: #1e293b;
}

/* الأزرار الرئيسية */
.btn-primary {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  border-radius: 12px;
  padding: 12px 24px;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(59,130,246,0.3);
  transition: all 0.2s;
}
.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(59,130,246,0.4);
}

/* البطاقات */
.card {
  background: white;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  border: 1px solid #e2e8f0;
  transition: all 0.2s;
}
.card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

/* التبويبات */
.tab-active {
  border-bottom: 3px solid #3b82f6;
  color: #3b82f6;
  font-weight: 600;
}

/* منطقة الرفع */
.upload-zone {
  border: 2px dashed #cbd5e1;
  border-radius: 16px;
  padding: 48px;
  text-align: center;
  background: #f1f5f9;
  transition: all 0.2s;
}
.upload-zone:hover, .upload-zone.active {
  border-color: #3b82f6;
  background: #eff6ff;
}

/* القائمة الجانبية */
.sidebar {
  background: #0f172a;
  color: white;
  width: 260px;
}
.sidebar-item {
  padding: 12px 20px;
  border-radius: 8px;
  margin: 4px 8px;
  transition: all 0.2s;
}
.sidebar-item.active {
  background: rgba(59,130,246,0.2);
  color: #60a5fa;
}

/* الجداول */
table {
  border-collapse: separate;
  border-spacing: 0;
  border-radius: 12px;
  overflow: hidden;
}
th {
  background: #f1f5f9;
  font-weight: 600;
  padding: 12px 16px;
}
td {
  padding: 10px 16px;
  border-bottom: 1px solid #f1f5f9;
}

/* Loading */
.skeleton {
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 8px;
}
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* رسائل النجاح والخطأ */
.toast-success { background: #10b981; color: white; border-radius: 12px; padding: 12px 20px; }
.toast-error { background: #ef4444; color: white; border-radius: 12px; padding: 12px 20px; }
```

---

## ⛔ ترتيب التنفيذ:

```
1. اختبر كل صفحة بالترتيب (1→12)
2. أصلح أي خطأ تجده فوراً
3. طبّق التحسينات البصرية
4. أعد اختبار كل صفحة بعد التحسين
5. سجّل النتائج في test_results.json
6. تأكد: TypeScript strict = صفر errors
7. تأكد: لا TODO — لا mock — لا placeholder في الكود
```

---

## ⛔ ابدأ الآن — اختبر الصفحة الأولى / ثم أصلح ثم حسّن ثم انتقل ⛔
