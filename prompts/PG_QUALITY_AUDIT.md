# ⛔ PG — تدقيق الجودة وسد الثغرات — منقول حرفياً ⛔
# ⛔ كل ثغرة مذكورة = إلزامية المعالجة ⛔

---

## ⛔ القانون المطلق — نفس القوانين السابقة

---

# ═══════════════════════════════════════════════════════
# ثغرات يجب معالجتها — منقولة حرفياً
# ═══════════════════════════════════════════════════════

1) Pixel-perfect: التطابق = 0 اختلاف بكسلي عند تصيير الناتج والأصل على نفس DPI ونفس محرك التصيير ونفس الخطوط
   - إلزام بإعداد Golden test harness داخل CI
   - إلزام بتثبيت fonts + render container ثابت (Docker image)

2) Closed-loop: إلزام بأن الـoptimizer يعدّل IR/constraints بشكل محدد (x/y/w/h, padding, font-size, tracking, line-height)
   - إلزام بتقرير failure إذا لم يصل إلى 0 diff مع ذكر السبب (font mismatch, missing asset, raster-only constraints)

3) Pixel diff + SSIM + LPIPS: Pixel diff = 0 هو معيار القبول. SSIM/LPIPS فقط للتشخيص والتسريع

4) Font reconstruction: إلزام بسياسة Fonts:
   - استخراج الخط إن كان PDF فيه embedded fonts
   - إن كانت صورة فقط: مطابقة الخط بأفضلية ثم طلب خط العميل
   - شرط صريح: لا تعد 1:1 إذا لم تتوفر الأصول

5) Vector/icon: تفضيل استخراج vector من المصدر إن توفر (PDF/PPTX/SVG) على إعادة رسمه من raster
   - إلزام بـ asset harvesting (الشعارات/الأيقونات) كمكتبة أصول داخل المنصة

6) Chart extraction: إذا الهدف شكل 1:1 فالأفضل إعادة إنتاج المخطط كصورة/Vector مطابق
   - إذا الهدف مخطط حي (interactive) فستقبل اختلافات طفيفة أو تُعرّف محرك رسم موحد

7) OCR: إلزام بإخراج Layout-preserving OCR مع coordinates لكل كلمة/سطر + إعادة بناء style tokens

8) Arabic localization: معيار التعريب الاحترافي:
   - No overflow, No clipping, alignment preserved, typography correct, RTL mirroring correct
   - لا تكتب Pixel-perfect للتعريب — اكتب Layout-perfect within constraints

9) يسمح بإضافة Modules داخل نفس monorepo بشرط wiring داخل الخدمات الحالية

---

## ⛔ كل ثغرة أعلاه يجب معالجتها قبل اعتبار المحرك مكتملاً ⛔
## ⛔ ابدأ المعالجة الآن ⛔
