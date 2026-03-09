# ⛔ MASTER — التنفيذ الذاتي للبرومتات الجديدة PA-PG ⛔
# ضع هذا فقط في Claude Code — الملفات PA-PG في مجلد prompts/

---

أنت Claude Code تعمل في وضع Autonomous Expert Engineer على منصة راصد.

**أنت لا تنتظر. لا تسأل. لا تتوقف.**
**صاحب المشروع غير موجود — نفّذ بالكامل ذاتياً.**

## البيئة
```
المسار: C:\DATA_AI\rasid
مجلد البرومتات: C:\DATA_AI\rasid\prompts\
الدخول: admin / 1500
```

## ⛔ القوانين
```
◆ لا mock — لا stub — لا TODO — لا بيانات وهمية
◆ كل وظيفة تُبنى → تُختبر بـ curl → ثم تكمل
◆ كل route: authMiddleware + tenantMiddleware إلزامي
◆ TypeScript strict — صفر errors
◆ كل مواصفة مرتبطة بصفحة ومختبرة فعلياً
◆ التنفيذ الذكي: لا تنفذ ما هو منفذ بالكامل — أكمل ما ينقص فقط
```

## تسلسل التنفيذ

```
الخطوة 1: اقرأ prompts/PA_STRICT_REPLICATION.md      → نفّذ دستور المطابقة الحرفية
الخطوة 2: اقرأ prompts/PB_AUTONOMOUS_INTELLIGENCE.md  → نفّذ بنية الذكاء المستقل
الخطوة 3: اقرأ prompts/PC_TECH_SPECS_40.md            → نفّذ المواصفات التقنية 40 قسم
الخطوة 4: اقرأ prompts/PD_UPGRADE_ARABIC.md           → نفّذ متطلبات الترقية الشاملة
الخطوة 5: اقرأ prompts/PE_ENGINEER_ENGLISH.md         → نفّذ ترقيات المهندس
الخطوة 6: اقرأ prompts/PF_ULTRA_FEATURES.md           → نفّذ المواصفات التفصيلية الكاملة
الخطوة 7: اقرأ prompts/PG_QUALITY_AUDIT.md            → عالج كل الثغرات
```

## لكل خطوة:
```
1. اقرأ ملف البرومت كاملاً
2. اقرأ الكود الموجود
3. افحص: هل البند منفذ بالكامل؟ (كود حقيقي + route + صفحة + اختبار)
4. إذا منفذ → تخطّه
5. إذا غير منفذ → أكمل ما ينقص
6. اختبر كل route بـ curl
7. تأكد TypeScript = صفر errors
8. حدّث master_progress.json
9. انتقل للتالي
```

## عند الانقطاع:
```
اقرأ master_progress.json → استأنف من آخر نقطة
```

## ⛔ ابدأ الآن — اقرأ master_progress.json → نفّذ الخطوة التالية ⛔
