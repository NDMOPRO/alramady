# حزمة برومتات منصة راصد — دليل الاستخدام

## المحتويات

```
rasid_prompts/
├── master_progress.json      ← ملف تتبع التقدم (ضعه في الروت)
├── prompts/
│   ├── P00_MASTER.md          ← الماستر الذاتي (هذا فقط تلصقه في Claude Code)
│   ├── P01_DATA_ENGINE.md     ← محرك البيانات (563 بند)
│   ├── P02_EXCEL_ENGINE.md    ← محرك Excel (183 بند)
│   ├── P03_DASHBOARD_ENGINE.md ← لوحات المؤشرات (620 بند)
│   ├── P04_REPORTS_ENGINE.md  ← التقارير (157 بند)
│   ├── P05_PRESENTATION_ENGINE.md ← العروض والإنفوجرافيك (914 بند)
│   ├── P06_REPLICATION_ENGINE.md ← المطابقة الحرفية (71 بند + CDR)
│   ├── P06B_DOCUMENT_AI_VISION_INTELLIGENCE.md ← Document AI (424 بند)
│   ├── P07_LOCALIZATION_ENGINE.md ← التعريب (174 بند)
│   ├── P08_CONVERSION_ENGINE.md ← التحويل (17 بند)
│   ├── P09_AI_ENGINE.md       ← الذكاء الاصطناعي (337 بند)
│   ├── P10_GOVERNANCE_ENGINE.md ← الحوكمة (247 بند)
│   └── P11_STRATEGIC_VISION.md ← الرؤية الاستراتيجية (15 بند)
```

## طريقة الاستخدام

### الخطوة 1: نسخ الملفات

```
انسخ مجلد prompts/ بالكامل إلى: C:\DATA_AI\rasid\prompts\
انسخ master_progress.json إلى: C:\DATA_AI\rasid\master_progress.json
```

### الخطوة 2: تشغيل Claude Code

```
1. افتح Claude Code CLI (PowerShell)
2. انتقل إلى مجلد المشروع: cd C:\DATA_AI\rasid
3. الصق محتوى P00_MASTER.md فقط
4. اضغط Enter
```

### الخطوة 3: اتركه يعمل

```
Claude Code سيقوم تلقائياً بـ:
1. قراءة master_progress.json لمعرفة أين يبدأ
2. قراءة ملف البرومت المطلوب
3. فحص الكود الموجود — تخطي ما هو منفذ بالكامل
4. إكمال ما ينقص فقط
5. ربط كل بند بصفحة واجهة مستخدم
6. اختبار كل route وكل صفحة
7. الانتقال للمحرك التالي
8. تحديث master_progress.json بعد كل محرك
```

### عند الانقطاع

```
إذا انقطعت الجلسة لأي سبب:
1. أعد فتح Claude Code
2. الصق P00_MASTER.md مرة أخرى
3. سيقرأ master_progress.json ويستأنف من آخر نقطة
```

## الصفحات الـ 12

```
/home          الصفحة الرئيسية
/data          محرك البيانات
/excel         محرك Excel
/dashboards    لوحات المؤشرات
/reports       التقارير
/presentations العروض والإنفوجرافيك
/replication   المطابقة الحرفية
/localization  التعريب
/conversion    التحويل
/ai            الذكاء الاصطناعي
/governance    الحوكمة
/library       المكتبة
```

## إجمالي البنود: 3,722 بند من 4 مصادر

```
rasid_full_implementation_prompt.md: 2,768 بند (100% مغطاة)
مواصفات التطابق الحرفي.txt: 107 بند (100% مغطاة)
وظائف ومميزات إنشاء العروض.txt: 120+ وظيفة (100% مغطاة)
Autonomous Intelligence Platform.txt: 49 بند (100% مغطاة)
```
