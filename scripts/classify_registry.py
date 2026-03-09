#!/usr/bin/env python3
"""Classify all 5412 features from Master Feature Registry into categories."""
import json

with open("C:/DATA_AI/rasid/docs/01_registries/Stage_2_Master_Feature_Registry.json", "r", encoding="utf-8") as f:
    registry = json.load(f)

# === CLASSIFICATION MAP ===
# Section name -> Category
classification = {
    # --- CATEGORY B: DESCRIPTIVE / CONSTITUTIONAL ---
    "منصة تحليل البيانات والمستندات الذكية": "B_CONSTITUTIONAL",
    "الرؤية الاستراتيجية العامة للمنصة": "B_CONSTITUTIONAL",
    "نطاق المنصة الموسع": "B_CONSTITUTIONAL",
    "المبادئ الثابتة في جميع المحركات": "B_CONSTITUTIONAL",
    "المحرك الخامس: محرك العروض التقديمية والإنفوجرافيك المتقدم": "B_CONSTITUTIONAL",
    "المحرك السادس: محرك المطابقة الحرفية الهندسية الدقيقة": "B_CONSTITUTIONAL",
    "المحرك السابع: محرك التعريب الاحترافي المتقدم": "B_CONSTITUTIONAL",
    "المحرك الثامن: محرك التحويل الشامل بين الصيغ": "B_CONSTITUTIONAL",

    # --- CATEGORY C: USER PERSONA / SCENARIOS ---
    "المستخدمون المستهدفون": "C_USER_PERSONA",
    "المدير التنفيذي": "C_USER_PERSONA",
    "محلل البيانات": "C_USER_PERSONA",
    "الجهة الحكومية": "C_USER_PERSONA",
    "المطابقة الحرفية": "C_USER_SCENARIO",
    "التحويل الشامل": "C_USER_SCENARIO",
    "الإنفوجرافيك الاحترافي": "C_USER_SCENARIO",
    "الملفات المختلطة": "C_USER_SCENARIO",
    "مستويات المنتج": "C_USER_SCENARIO",

    # --- CATEGORY D: ARCHITECTURAL / INFRASTRUCTURE ---
    "متطلبات القابلية للتوسع": "D_INFRASTRUCTURE",
    "3.8 تقنيات الأداء المتقدمة": "D_INFRASTRUCTURE",

    # --- CATEGORY E: FUTURE ---
    "التوسعات المستقبلية": "E_FUTURE",

    # --- CATEGORY A: EXECUTABLE FEATURES ---
    # Engine 1: Data & Files
    "1.1 المصادر المدعومة": "A_EXECUTABLE",
    "1.2 القدرة الحجمية غير المحدودة": "A_EXECUTABLE",
    "1.3 الاستيراد الذكي": "A_EXECUTABLE",
    "1.4 تصنيف الملفات بالذكاء الاصطناعي": "A_EXECUTABLE",
    "1.5 القراءة التفاعلية": "A_EXECUTABLE",
    "1.6 مركز التحكم بالأعمدة": "A_EXECUTABLE",
    "1.7 إدارة الجداول": "A_EXECUTABLE",
    "1.8 محرك المعالجة البصري": "A_EXECUTABLE",
    "1.9 تنظيف البيانات": "A_EXECUTABLE",

    # Engine 2: Excel
    "2.1 محرك تنفيذ المعادلات الافتراضي": "A_EXECUTABLE",
    "2.2 التنسيق والتجميل الاحترافي": "A_EXECUTABLE",
    "2.3 المطابقة الحرفية لملفات Excel": "A_EXECUTABLE",
    "2.4 الوضع السهل والمتقدم": "A_EXECUTABLE",

    # Engine 3: Dashboards
    "3.1 الوضع السهل: لوحة بضغطة زر": "A_EXECUTABLE",
    "3.2 الوضع المتقدم: تحكم كامل": "A_EXECUTABLE",
    "3.3 عناصر اللوحة القابلة للسحب": "A_EXECUTABLE",
    "3.4 محرر اللوحة الكامل": "A_EXECUTABLE",
    "3.5 التعديل الكامل بعد الإنشاء": "A_EXECUTABLE",
    "3.6 مكتبة النماذج": "A_EXECUTABLE",
    "3.7 محاكاة تصميم لوحة خارجية": "A_EXECUTABLE",

    # Engine 4: Reports
    "4.1 الوضع السهل: تقرير بضغطة زر": "A_EXECUTABLE",
    "4.2 الوضع المتقدم": "A_EXECUTABLE",
    "4.3 التحرير الكامل بعد الإنشاء": "A_EXECUTABLE",
    "4.4 مكتبة التقارير والقوالب": "A_EXECUTABLE",
    "4.5 محاكاة تقرير خارجي": "A_EXECUTABLE",
    "4.6 المقارنة والجدولة": "A_EXECUTABLE",

    # Engine 5: Presentations & Infographics
    "5.1 مصادر إنشاء العرض المتعددة": "A_EXECUTABLE",
    "5.2 توليد المحتوى بالذكاء الاصطناعي": "A_EXECUTABLE",
    "5.3 التصميم والتخطيط الذكي": "A_EXECUTABLE",
    "5.4 القوالب والثيمات": "A_EXECUTABLE",
    "5.5 التحرير والتعديل المتقدم": "A_EXECUTABLE",
    "5.6 الحركة والتفاعل": "A_EXECUTABLE",
    "5.7 مكتبة الوسائط": "A_EXECUTABLE",
    "5.8 التصدير والمشاركة": "A_EXECUTABLE",
    "5.9 التعاون والعرض": "A_EXECUTABLE",
    "5.10 الإنفوجرافيك الاحترافي": "A_EXECUTABLE",
    "5.11 التكامل والأتمتة": "A_EXECUTABLE",

    # Engine 6: Literal Match
    "6.1 المبدأ الأساسي": "A_EXECUTABLE",
    "6.2 نطاق المطابقة": "A_EXECUTABLE",
    "6.3 مراحل المطابقة": "A_EXECUTABLE",
    "6.4 مطابقة لوحات المؤشرات من صورة": "A_EXECUTABLE",
    "6.5 قفل الطباعة": "A_EXECUTABLE",
    "6.6 بوابة التحقق المزدوج": "A_EXECUTABLE",

    # Engine 7: Localization
    "7.1 الذكاء اللغوي": "A_EXECUTABLE",
    "7.2 التخطيط الاحترافي من اليمين لليسار": "A_EXECUTABLE",
    "7.3 الطباعة العربية المتقدمة": "A_EXECUTABLE",
    "7.4 تعريب البيانات والرسوم البيانية": "A_EXECUTABLE",
    "7.5 بوابة جودة التعريب": "A_EXECUTABLE",

    # Engine 8: Conversion
    "8.1 مصفوفة التحويل": "A_EXECUTABLE",
    "8.2 تمثيل المستند الأساسي الموحد": "A_EXECUTABLE",

    # Engine 9: AI Intelligence
    "9.1 الفهم الذكي للملفات": "A_EXECUTABLE",
    "9.2 الاستجواب الحر": "A_EXECUTABLE",
    "9.3 مستويات التحليل": "A_EXECUTABLE",
    "9.4 الأدوار المتعددة للذكاء الاصطناعي": "A_EXECUTABLE",
    "9.5 مؤشرات الأداء المتقدمة": "A_EXECUTABLE",
    "9.6 الذكاء الاصطناعي أثناء التعديل": "A_EXECUTABLE",

    # Engine 10: Governance
    "10.1 الصلاحيات والأمان": "A_EXECUTABLE",
    "10.2 العمل الجماعي": "A_EXECUTABLE",
    "10.3 التكامل الشامل بين المحركات": "A_EXECUTABLE",
    "10.4 التشغيل الموحد بضغطة زر": "A_EXECUTABLE",
    "10.5 سجل العمليات وإعادة التنفيذ": "A_EXECUTABLE",
    "10.6 المقارنة المتقدمة": "A_EXECUTABLE",
    "10.7 النسخ والإصدارات": "A_EXECUTABLE",
}

# Classify
categories = {
    "A_EXECUTABLE": [],
    "B_CONSTITUTIONAL": [],
    "C_USER_PERSONA": [],
    "C_USER_SCENARIO": [],
    "D_INFRASTRUCTURE": [],
    "E_FUTURE": [],
    "UNCLASSIFIED": []
}

for feat in registry:
    sec = feat.get("SOURCE_SECTION", "UNKNOWN")
    cat = classification.get(sec, "UNCLASSIFIED")
    categories[cat].append({
        "id": feat["FEATURE_ID"],
        "text": feat["FEATURE_TEXT"][:200],
        "section": sec,
        "hash": feat.get("FEATURE_HASH", "")
    })

# Engine mapping
engine_map = {
    "1": "Engine_01_Data_Files",
    "2": "Engine_02_Excel",
    "3": "Engine_03_Dashboards",
    "4": "Engine_04_Reports",
    "5": "Engine_05_Presentations_Infographics",
    "6": "Engine_06_Literal_Match",
    "7": "Engine_07_Localization",
    "8": "Engine_08_Conversion",
    "9": "Engine_09_AI_Intelligence",
    "10": "Engine_10_Governance"
}

# Build executable subset by engine
executable_by_engine = {}
for feat in categories["A_EXECUTABLE"]:
    sec = feat["section"]
    engine_num = sec.split(".")[0] if "." in sec else "0"
    engine_name = engine_map.get(engine_num, f"Unknown_{engine_num}")

    if engine_name not in executable_by_engine:
        executable_by_engine[engine_name] = {"sections": {}, "total": 0, "id_range": {"first": feat["id"], "last": feat["id"]}}

    if sec not in executable_by_engine[engine_name]["sections"]:
        executable_by_engine[engine_name]["sections"][sec] = {"ids": [], "count": 0, "first_id": feat["id"], "last_id": feat["id"]}

    executable_by_engine[engine_name]["sections"][sec]["ids"].append(feat["id"])
    executable_by_engine[engine_name]["sections"][sec]["count"] += 1
    executable_by_engine[engine_name]["sections"][sec]["last_id"] = feat["id"]
    executable_by_engine[engine_name]["total"] += 1
    executable_by_engine[engine_name]["id_range"]["last"] = feat["id"]

# Build final output
output = {
    "classification_date": "2026-03-09",
    "source": "Stage_2_Master_Feature_Registry.json",
    "total_registry_items": len(registry),
    "classification_summary": {
        "A_EXECUTABLE": len(categories["A_EXECUTABLE"]),
        "B_CONSTITUTIONAL": len(categories["B_CONSTITUTIONAL"]),
        "C_USER_PERSONA": len(categories["C_USER_PERSONA"]),
        "C_USER_SCENARIO": len(categories["C_USER_SCENARIO"]),
        "D_INFRASTRUCTURE": len(categories["D_INFRASTRUCTURE"]),
        "E_FUTURE": len(categories["E_FUTURE"]),
        "UNCLASSIFIED": len(categories["UNCLASSIFIED"])
    },
    "executable_subset": {
        "total_executable_features": len(categories["A_EXECUTABLE"]),
        "engines": {}
    },
    "non_executable_items": {
        "B_CONSTITUTIONAL": [{"id": f["id"], "text": f["text"][:150]} for f in categories["B_CONSTITUTIONAL"]],
        "C_USER_PERSONA": [{"id": f["id"], "text": f["text"][:150]} for f in categories["C_USER_PERSONA"]],
        "C_USER_SCENARIO": [{"id": f["id"], "text": f["text"][:150]} for f in categories["C_USER_SCENARIO"]],
        "D_INFRASTRUCTURE": [{"id": f["id"], "text": f["text"][:150]} for f in categories["D_INFRASTRUCTURE"]],
        "E_FUTURE": [{"id": f["id"], "text": f["text"][:150]} for f in categories["E_FUTURE"]],
        "UNCLASSIFIED": [{"id": f["id"], "section": f["section"], "text": f["text"][:100]} for f in categories["UNCLASSIFIED"]]
    }
}

# Add engine details
for engine_name in sorted(executable_by_engine.keys()):
    data = executable_by_engine[engine_name]
    engine_entry = {
        "total_features": data["total"],
        "id_range": f"{data['id_range']['first']} - {data['id_range']['last']}",
        "sections": {}
    }
    for sec_name in sorted(data["sections"].keys()):
        sec_data = data["sections"][sec_name]
        engine_entry["sections"][sec_name] = {
            "count": sec_data["count"],
            "id_range": f"{sec_data['first_id']} - {sec_data['last_id']}"
        }
    output["executable_subset"]["engines"][engine_name] = engine_entry

# Write classification output
with open("C:/DATA_AI/rasid/docs/01_registries/Registry_Classification.json", "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

# Write executable subset (just IDs + text for each engine)
exec_subset = {}
for feat in categories["A_EXECUTABLE"]:
    sec = feat["section"]
    engine_num = sec.split(".")[0] if "." in sec else "0"
    engine_name = engine_map.get(engine_num, f"Unknown_{engine_num}")
    if engine_name not in exec_subset:
        exec_subset[engine_name] = []
    exec_subset[engine_name].append({
        "id": feat["id"],
        "section": sec,
        "text": feat["text"],
        "hash": feat["hash"]
    })

with open("C:/DATA_AI/rasid/docs/01_registries/Official_Executable_Subset.json", "w", encoding="utf-8") as f:
    json.dump(exec_subset, f, ensure_ascii=False, indent=2)

# Print summary
print("=== REGISTRY CLASSIFICATION COMPLETE ===")
print(f"Total: {len(registry)}")
print(f"A_EXECUTABLE: {len(categories['A_EXECUTABLE'])}")
print(f"B_CONSTITUTIONAL: {len(categories['B_CONSTITUTIONAL'])}")
print(f"C_USER_PERSONA: {len(categories['C_USER_PERSONA'])}")
print(f"C_USER_SCENARIO: {len(categories['C_USER_SCENARIO'])}")
print(f"D_INFRASTRUCTURE: {len(categories['D_INFRASTRUCTURE'])}")
print(f"E_FUTURE: {len(categories['E_FUTURE'])}")
print(f"UNCLASSIFIED: {len(categories['UNCLASSIFIED'])}")
print()
for engine_name in sorted(executable_by_engine.keys()):
    data = executable_by_engine[engine_name]
    secs = ", ".join(sorted(data["sections"].keys()))
    print(f"{engine_name}: {data['total']} features | {data['id_range']['first']}-{data['id_range']['last']}")
    for sec_name in sorted(data["sections"].keys()):
        sd = data["sections"][sec_name]
        print(f"  {sec_name}: {sd['count']} ({sd['first_id']}-{sd['last_id']})")

print(f"\nOutput: Registry_Classification.json + Official_Executable_Subset.json")
