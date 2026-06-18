# 🔒 سياسة الأمان — راصد RASID

## حساب مالك النظام (ROOT_ADMIN)
- **المستخدم**: MRUHAILY
- **البريد**: prog.muhammed@gmail.com
- **الهاتف**: +966553445533
- **الدور**: isOwner = true (أعلى مستوى)

## قواعد الحماية
1. حساب isOwner **لا يُحذف** ولا يُعطّل ولا يُخفّض
2. `isOwner` flag لا يُمنح عبر API — فقط عبر DB seed
3. كل محاولة تعديل تُسجَّل في سجل الأمان

## للمطورين
- لا تُنشئ endpoints تتجاوز protectRootAdmin middleware
- اختبر السيناريوهات الأمنية بعد أي تغيير
- للتواصل: prog.muhammed@gmail.com | +966553445533
