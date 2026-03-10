# تقرير قدرات المنصة
راصد يعمل اليوم كمظلة تشغيل فوق محركات التحويل الصارم، العروض، الإكسل، اللوحات، التقارير، والتحويل/التعريب/التفريغ، مع Canvas واحد، جولات إرشاد، تفضيلات، وأدلة تنفيذ.

## RASED AI Engine
هذا المحرك يقدّم 12 قدرة مرصودة في التدقيق الحالي، ويعتمد على الخدمة ai-service. أبرز الملفات: C:/DATA_AI/rasid/services/ai-service/src/services/rased-agent-os.service.ts ، C:/DATA_AI/rasid/services/ai-service/src/services/rased-tool-contracts.ts ، C:/DATA_AI/rasid/services/ai-service/src/services/rased-action-registry.service.ts.

## Strict Replication Engine
هذا المحرك يقدّم 5 قدرة مرصودة في التدقيق الحالي، ويعتمد على الخدمة replication-service. أبرز الملفات: C:/DATA_AI/rasid/services/replication-service/src/strict/pipeline/strict-pipeline.ts ، C:/DATA_AI/rasid/services/replication-service/src/strict/render/farm-renderer.ts ، C:/DATA_AI/rasid/services/replication-service/src/strict/verify/pixel-diff.ts.

## Slides Engine
هذا المحرك يقدّم 6 قدرة مرصودة في التدقيق الحالي، ويعتمد على الخدمة presentation-service. أبرز الملفات: C:/DATA_AI/rasid/services/presentation-service/src/services/gamma-engine.service.ts ، C:/DATA_AI/rasid/services/presentation-service/src/services/slides-tool-contracts.ts ، C:/DATA_AI/rasid/services/presentation-service/src/services/slides-infinite-control.service.ts.

## Excel Engine
هذا المحرك يقدّم 6 قدرة مرصودة في التدقيق الحالي، ويعتمد على الخدمة excel-service. أبرز الملفات: C:/DATA_AI/rasid/services/excel-service/src/services/excel-ultra-engine.service.ts ، C:/DATA_AI/rasid/services/excel-service/src/services/excel-tool-contracts.ts.

## Dashboard Engine
هذا المحرك يقدّم 6 قدرة مرصودة في التدقيق الحالي، ويعتمد على الخدمة dashboard-service. أبرز الملفات: C:/DATA_AI/rasid/services/dashboard-service/src/services/dashboard-ultra-engine.service.ts ، C:/DATA_AI/rasid/services/dashboard-service/src/services/dashboard-tool-contracts.ts.

## Report Engine
هذا المحرك يقدّم 6 قدرة مرصودة في التدقيق الحالي، ويعتمد على الخدمة reporting-service. أبرز الملفات: C:/DATA_AI/rasid/services/reporting-service/src/services/report-ultra-engine.service.ts ، C:/DATA_AI/rasid/services/reporting-service/src/services/report-tool-contracts.ts.

## LCT Engine
هذا المحرك يقدّم 6 قدرة مرصودة في التدقيق الحالي، ويعتمد على الخدمة conversion-service. أبرز الملفات: C:/DATA_AI/rasid/services/conversion-service/src/services/lct-ultra-engine.service.ts ، C:/DATA_AI/rasid/services/conversion-service/src/services/lct-tool-contracts.ts.

## التكامل بين المحركات
RASED AI Engine ←→ Strict Replication Engine: C:/DATA_AI/rasid/services/ai-service/src/services/rased-agent-os.service.ts#L1265
RASED AI Engine ←→ Slides Engine: C:/DATA_AI/rasid/services/ai-service/src/services/rased-agent-os.service.ts#L1261
RASED AI Engine ←→ Excel Engine: C:/DATA_AI/rasid/services/ai-service/src/services/rased-agent-os.service.ts#L1264
RASED AI Engine ←→ Dashboard Engine: C:/DATA_AI/rasid/services/ai-service/src/services/rased-agent-os.service.ts#L1263
RASED AI Engine ←→ Report Engine: C:/DATA_AI/rasid/services/ai-service/src/services/rased-agent-os.service.ts#L1262
RASED AI Engine ←→ LCT Engine: C:/DATA_AI/rasid/services/ai-service/src/services/rased-agent-os.service.ts#L1260
LCT Engine ←→ Strict Replication Engine: C:/DATA_AI/rasid/services/conversion-service/src/services/lct-ultra-engine.service.ts#L1182
LCT Engine ←→ Slides Engine: C:/DATA_AI/rasid/services/conversion-service/src/services/lct-ultra-engine.service.ts#L36
LCT Engine ←→ Report Engine: C:/DATA_AI/rasid/services/conversion-service/src/services/lct-ultra-engine.service.ts#L22
Dashboard Engine ←→ Excel Engine: C:/DATA_AI/rasid/services/dashboard-service/src/services/dashboard-ultra-engine.service.ts#L8
Report Engine ←→ Slides Engine: C:/DATA_AI/rasid/services/reporting-service/src/services/report-ultra-engine.service.ts#L33
