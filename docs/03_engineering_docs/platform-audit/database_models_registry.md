# Database Models Registry
عدد النماذج: 86

## Tenant
تعريف النموذج يبدأ عند السطر 502.
الحقول:
id: String | line 503
name: String | line 504
slug: String | line 505
domain: String? | line 506
logoUrl: String? | line 507
settings: Json? | line 508
plan: String | line 509
isActive: Boolean | line 510
maxUsers: Int | line 511
maxStorage: BigInt | line 512
createdAt: DateTime | line 513
updatedAt: DateTime | line 514
deletedAt: DateTime? | line 515
users: User[] | line 517
datasets: Dataset[] | line 518
dashboards: Dashboard[] | line 519
reports: Report[] | line 520
templates: Template[] | line 521
folders: Folder[] | line 522
knowledgeBases: KnowledgeBase[] | line 523
prompts: Prompt[] | line 524
glossaries: Glossary[] | line 525
kpis: Kpi[] | line 526
workflowInstances: WorkflowInstance[] | line 527
scheduledReports: ScheduledReport[] | line 528
libraryAssets: LibraryAsset[] | line 529
notifications: Notification[] | line 530
auditLogs: AuditLog[] | line 531
reportDefinitions: ReportDefinition[] | line 532
reportTemplates: ReportTemplate[] | line 533
reportSchedules: ReportSchedule[] | line 534
reportDataSources: ReportDataSource[] | line 535
compareSchedules: ReportCompareSchedule[] | line 536
themes: Theme[] | line 537
connectorConnections: ConnectorConnection[] | line 538
policies: Policy[] | line 539
compliancePolicies: CompliancePolicy[] | line 540
workflowDefinitions: WorkflowDefinition[] | line 541
layoutAnalyses: LayoutAnalysis[] | line 542
documentExtractions: DocumentExtraction[] | line 543
pixelValidations: PixelValidation[] | line 544
fontRecognitions: FontRecognition[] | line 545
layoutTranslations: LayoutTranslation[] | line 546
qualityValidations: QualityValidation[] | line 547
bridgePayloads: BridgePayload[] | line 548
dataLineage: DataLineage[] | line 549
trainingDatasets: TrainingDataset[] | line 550
trainingJobs: TrainingJob[] | line 551
modelRegistry: ModelRegistry[] | line 552
contextMemoryLong: ContextMemoryLong[] | line 553
episodeMemory: EpisodeMemory[] | line 554
semanticFacts: SemanticFact[] | line 555
العلاقات:
reportTemplates -> ReportTemplate | line 533
reportSchedules -> ReportSchedule | line 534
reportDataSources -> ReportDataSource | line 535
compareSchedules -> ReportCompareSchedule | line 536

## User
تعريف النموذج يبدأ عند السطر 563.
الحقول:
id: String | line 564
tenantId: String | line 565
email: String | line 566
passwordHash: String? | line 567
firstName: String | line 568
lastName: String | line 569
displayName: String? | line 570
avatarUrl: String? | line 571
phone: String? | line 572
locale: Language | line 573
timezone: String | line 574
status: UserStatus | line 575
emailVerifiedAt: DateTime? | line 576
lastLoginAt: DateTime? | line 577
preferences: Json? | line 578
createdAt: DateTime | line 579
updatedAt: DateTime | line 580
deletedAt: DateTime? | line 581
tenant: Tenant | line 583
userRoles: UserRole[] | line 584
datasets: Dataset[] | line 585
datasetsUpdated: Dataset[] | line 586
ingestionJobs: IngestionJob[] | line 587
dashboards: Dashboard[] | line 588
reports: Report[] | line 589
presentations: Presentation[] | line 590
infographics: Infographic[] | line 591
workbooks: Workbook[] | line 592
aiSessions: AiSession[] | line 593
auditLogs: AuditLog[] | line 594
notifications: Notification[] | line 595
workflowStepsAssigned: WorkflowStep[] | line 596
workflowStepsCompleted: WorkflowStep[] | line 597
scheduledReports: ScheduledReport[] | line 598
conversionJobs: ConversionJob[] | line 599
localizationJobs: LocalizationJob[] | line 600
promptVersions: PromptVersion[] | line 601
kpis: Kpi[] | line 602
reportDefinitions: ReportDefinition[] | line 603
reportTemplatesCreated: ReportTemplate[] | line 604
reportSchedulesCreated: ReportSchedule[] | line 605
reportPostEdits: ReportPostEdit[] | line 606
externalSimulations: ReportExternalSimulation[] | line 607
compareSchedules: ReportCompareSchedule[] | line 608
interactiveReports: InteractiveReport[] | line 609
interactiveVersions: InteractiveReportVersion[] | line 610
reportComments: ReportComment[] | line 611
reportAnnotations: ReportAnnotation[] | line 612
distributionConfigs: DistributionConfig[] | line 613
collaborationSessions: CollaborationSession[] | line 614
shareLinks: ShareLink[] | line 615
connectorConnections: ConnectorConnection[] | line 616
العلاقات:
tenant -> Tenant | line 583
datasets -> Dataset | line 585
datasetsUpdated -> Dataset | line 586
dashboards -> Dashboard | line 588
reports -> Report | line 589
presentations -> Presentation | line 590
infographics -> Infographic | line 591
workbooks -> Workbook | line 592
workflowStepsAssigned -> WorkflowStep | line 596
workflowStepsCompleted -> WorkflowStep | line 597
reportDefinitions -> ReportDefinition | line 603
reportTemplatesCreated -> ReportTemplate | line 604
reportSchedulesCreated -> ReportSchedule | line 605
reportPostEdits -> ReportPostEdit | line 606
externalSimulations -> ReportExternalSimulation | line 607
compareSchedules -> ReportCompareSchedule | line 608
interactiveReports -> InteractiveReport | line 609
interactiveVersions -> InteractiveReportVersion | line 610
reportComments -> ReportComment | line 611
reportAnnotations -> ReportAnnotation | line 612
distributionConfigs -> DistributionConfig | line 613

## Role
تعريف النموذج يبدأ عند السطر 626.
الحقول:
id: String | line 627
name: RoleName | line 628
displayName: String | line 629
description: String? | line 630
isSystem: Boolean | line 631
createdAt: DateTime | line 632
updatedAt: DateTime | line 633
userRoles: UserRole[] | line 635
permissions: Permission[] | line 636
العلاقات:
لا توجد علاقات صريحة مرصودة.

## UserRole
تعريف النموذج يبدأ عند السطر 642.
الحقول:
id: String | line 643
userId: String | line 644
roleId: String | line 645
grantedAt: DateTime | line 646
expiresAt: DateTime? | line 647
createdAt: DateTime | line 648
updatedAt: DateTime | line 649
user: User | line 651
role: Role | line 652
العلاقات:
user -> User | line 651
role -> Role | line 652

## Dataset
تعريف النموذج يبدأ عند السطر 660.
الحقول:
id: String | line 661
tenantId: String | line 662
createdById: String | line 663
updatedById: String? | line 664
folderId: String? | line 665
name: String | line 666
slug: String | line 667
description: String? | line 668
source: String? | line 669
sourceUrl: String? | line 670
format: String? | line 671
fileSize: BigInt? | line 672
rowCount: Int? | line 673
columnCount: Int? | line 674
schema: Json? | line 675
sampleData: Json? | line 676
status: DatasetStatus | line 677
isPublic: Boolean | line 678
license: String? | line 679
frequency: String? | line 680
lastSyncedAt: DateTime? | line 681
publishedAt: DateTime? | line 682
settings: Json? | line 683
createdAt: DateTime | line 684
updatedAt: DateTime | line 685
deletedAt: DateTime? | line 686
tenant: Tenant | line 688
createdBy: User | line 689
updatedBy: User? | line 690
folder: Folder? | line 691
columns: DatasetColumn[] | line 692
versions: DatasetVersion[] | line 693
metadata: Metadata[] | line 694
tags: Tag[] | line 695
ingestionJobs: IngestionJob[] | line 696
dataQualityChecks: DataQualityCheck[] | line 697
dashboardWidgets: DashboardWidget[] | line 698
dataRows: DataRow[] | line 699
kpis: Kpi[] | line 700
العلاقات:
tenant -> Tenant | line 688
createdBy -> User | line 689
updatedBy -> User | line 690
folder -> Folder | line 691

## DatasetColumn
تعريف النموذج يبدأ عند السطر 713.
الحقول:
id: String | line 714
datasetId: String | line 715
name: String | line 716
displayName: String? | line 717
description: String? | line 718
dataType: ColumnDataType | line 719
ordinalPosition: Int | line 720
isNullable: Boolean | line 721
isPrimaryKey: Boolean | line 722
isUnique: Boolean | line 723
defaultValue: String? | line 724
maxLength: Int? | line 725
precision: Int? | line 726
scale: Int? | line 727
format: String? | line 728
constraints: Json? | line 729
statistics: Json? | line 730
createdAt: DateTime | line 731
updatedAt: DateTime | line 732
dataset: Dataset | line 734
العلاقات:
dataset -> Dataset | line 734

## DatasetVersion
تعريف النموذج يبدأ عند السطر 742.
الحقول:
id: String | line 743
datasetId: String | line 744
versionNumber: Int | line 745
changeSummary: String? | line 746
schema: Json? | line 747
rowCount: Int? | line 748
fileSize: BigInt? | line 749
filePath: String? | line 750
checksum: String? | line 751
createdAt: DateTime | line 752
updatedAt: DateTime | line 753
dataset: Dataset | line 755
العلاقات:
dataset -> Dataset | line 755

## Metadata
تعريف النموذج يبدأ عند السطر 762.
الحقول:
id: String | line 763
datasetId: String | line 764
key: String | line 765
value: String | line 766
valueType: String | line 767
language: Language | line 768
createdAt: DateTime | line 769
updatedAt: DateTime | line 770
dataset: Dataset | line 772
العلاقات:
dataset -> Dataset | line 772

## Tag
تعريف النموذج يبدأ عند السطر 780.
الحقول:
id: String | line 781
datasetId: String | line 782
name: String | line 783
slug: String | line 784
color: String? | line 785
createdAt: DateTime | line 786
updatedAt: DateTime | line 787
dataset: Dataset | line 789
العلاقات:
dataset -> Dataset | line 789

## Template
تعريف النموذج يبدأ عند السطر 798.
الحقول:
id: String | line 799
tenantId: String | line 800
name: String | line 801
slug: String | line 802
description: String? | line 803
category: String? | line 804
type: String | line 805
content: Json | line 806
thumbnail: String? | line 807
isSystem: Boolean | line 808
isActive: Boolean | line 809
version: Int | line 810
settings: Json? | line 811
createdAt: DateTime | line 812
updatedAt: DateTime | line 813
deletedAt: DateTime? | line 814
tenant: Tenant | line 816
العلاقات:
tenant -> Tenant | line 816

## Version
تعريف النموذج يبدأ عند السطر 827.
الحقول:
id: String | line 828
resourceType: ResourceType | line 829
resourceId: String | line 830
versionNumber: Int | line 831
label: String? | line 832
description: String? | line 833
snapshot: Json | line 834
status: VersionStatus | line 835
createdAt: DateTime | line 836
updatedAt: DateTime | line 837
العلاقات:
لا توجد علاقات صريحة مرصودة.

## Feature
تعريف النموذج يبدأ عند السطر 845.
الحقول:
id: String | line 846
key: String | line 847
name: String | line 848
description: String? | line 849
status: FeatureStatus | line 850
config: Json? | line 851
rolloutPct: Int | line 852
createdAt: DateTime | line 853
updatedAt: DateTime | line 854
العلاقات:
لا توجد علاقات صريحة مرصودة.

## IngestionJob
تعريف النموذج يبدأ عند السطر 865.
الحقول:
id: String | line 866
datasetId: String | line 867
createdById: String | line 868
sourceType: IngestionSourceType | line 869
sourceConfig: Json | line 870
status: IngestionJobStatus | line 871
progress: Float | line 872
totalRows: Int? | line 873
processedRows: Int? | line 874
failedRows: Int? | line 875
errorMessage: String? | line 876
errorDetails: Json? | line 877
startedAt: DateTime? | line 878
completedAt: DateTime? | line 879
durationMs: Int? | line 880
retryCount: Int | line 881
maxRetries: Int | line 882
settings: Json? | line 883
createdAt: DateTime | line 884
updatedAt: DateTime | line 885
dataset: Dataset | line 887
createdBy: User | line 888
العلاقات:
dataset -> Dataset | line 887
createdBy -> User | line 888

## DataQualityCheck
تعريف النموذج يبدأ عند السطر 898.
الحقول:
id: String | line 899
datasetId: String | line 900
checkType: DataQualityCheckType | line 901
columnName: String? | line 902
ruleName: String | line 903
ruleConfig: Json | line 904
status: DataQualityCheckStatus | line 905
score: Float? | line 906
totalRecords: Int? | line 907
passedRecords: Int? | line 908
failedRecords: Int? | line 909
errorMessage: String? | line 910
details: Json? | line 911
executedAt: DateTime? | line 912
durationMs: Int? | line 913
createdAt: DateTime | line 914
updatedAt: DateTime | line 915
dataset: Dataset | line 917
العلاقات:
dataset -> Dataset | line 917

## Dashboard
تعريف النموذج يبدأ عند السطر 926.
الحقول:
id: String | line 927
tenantId: String | line 928
createdById: String | line 929
folderId: String? | line 930
name: String | line 931
slug: String | line 932
description: String? | line 933
visibility: DashboardVisibility | line 934
layout: Json? | line 935
theme: Json? | line 936
filters: Json? | line 937
refreshRate: Int? | line 938
thumbnail: String? | line 939
isFavorite: Boolean | line 940
viewCount: Int | line 941
settings: Json? | line 942
publishedAt: DateTime? | line 943
createdAt: DateTime | line 944
updatedAt: DateTime | line 945
deletedAt: DateTime? | line 946
tenant: Tenant | line 948
createdBy: User | line 949
folder: Folder? | line 950
widgets: DashboardWidget[] | line 951
العلاقات:
tenant -> Tenant | line 948
createdBy -> User | line 949
folder -> Folder | line 950

## DashboardWidget
تعريف النموذج يبدأ عند السطر 962.
الحقول:
id: String | line 963
dashboardId: String | line 964
datasetId: String? | line 965
type: WidgetType | line 966
title: String | line 967
description: String? | line 968
config: Json | line 969
query: String? | line 970
position: Json | line 971
size: Json | line 972
style: Json? | line 973
refreshRate: Int? | line 974
cacheSeconds: Int? | line 975
sortOrder: Int | line 976
isVisible: Boolean | line 977
createdAt: DateTime | line 978
updatedAt: DateTime | line 979
dashboard: Dashboard | line 981
dataset: Dataset? | line 982
العلاقات:
dashboard -> Dashboard | line 981
dataset -> Dataset | line 982

## Report
تعريف النموذج يبدأ عند السطر 990.
الحقول:
id: String | line 991
tenantId: String | line 992
createdById: String | line 993
folderId: String? | line 994
name: String | line 995
slug: String | line 996
description: String? | line 997
status: ReportStatus | line 998
type: String | line 999
content: Json? | line 1000
parameters: Json? | line 1001
dataSources: Json? | line 1002
layout: Json? | line 1003
theme: Json? | line 1004
language: Language | line 1005
pageSize: String | line 1006
orientation: String | line 1007
headerConfig: Json? | line 1008
footerConfig: Json? | line 1009
settings: Json? | line 1010
publishedAt: DateTime? | line 1011
createdAt: DateTime | line 1012
updatedAt: DateTime | line 1013
deletedAt: DateTime? | line 1014
tenant: Tenant | line 1016
createdBy: User | line 1017
folder: Folder? | line 1018
outputs: ReportOutput[] | line 1019
scheduledReports: ScheduledReport[] | line 1020
العلاقات:
tenant -> Tenant | line 1016
createdBy -> User | line 1017
folder -> Folder | line 1018

## ReportOutput
تعريف النموذج يبدأ عند السطر 1032.
الحقول:
id: String | line 1033
reportId: String | line 1034
format: ReportOutputFormat | line 1035
filePath: String | line 1036
fileSize: BigInt? | line 1037
checksum: String? | line 1038
pageCount: Int? | line 1039
generatedAt: DateTime | line 1040
expiresAt: DateTime? | line 1041
durationMs: Int? | line 1042
metadata: Json? | line 1043
createdAt: DateTime | line 1044
updatedAt: DateTime | line 1045
report: Report | line 1047
العلاقات:
report -> Report | line 1047

## Presentation
تعريف النموذج يبدأ عند السطر 1055.
الحقول:
id: String | line 1056
createdById: String | line 1057
folderId: String? | line 1058
name: String | line 1059
description: String? | line 1060
status: PresentationStatus | line 1061
theme: Json? | line 1062
slides: Json? | line 1063
slideCount: Int | line 1064
language: Language | line 1065
aspectRatio: String | line 1066
thumbnail: String? | line 1067
settings: Json? | line 1068
publishedAt: DateTime? | line 1069
createdAt: DateTime | line 1070
updatedAt: DateTime | line 1071
deletedAt: DateTime? | line 1072
createdBy: User | line 1074
folder: Folder? | line 1075
slideRecords: Slide[] | line 1076
collaborationSessions: CollaborationSession[] | line 1077
العلاقات:
createdBy -> User | line 1074
folder -> Folder | line 1075

## Infographic
تعريف النموذج يبدأ عند السطر 1086.
الحقول:
id: String | line 1087
createdById: String | line 1088
folderId: String? | line 1089
name: String | line 1090
description: String? | line 1091
status: InfographicStatus | line 1092
canvas: Json? | line 1093
elements: Json? | line 1094
width: Int | line 1095
height: Int | line 1096
theme: Json? | line 1097
language: Language | line 1098
thumbnail: String? | line 1099
exportUrl: String? | line 1100
settings: Json? | line 1101
publishedAt: DateTime? | line 1102
createdAt: DateTime | line 1103
updatedAt: DateTime | line 1104
deletedAt: DateTime? | line 1105
createdBy: User | line 1107
folder: Folder? | line 1108
sections: InfographicSection[] | line 1109
العلاقات:
createdBy -> User | line 1107
folder -> Folder | line 1108

## Workbook
تعريف النموذج يبدأ عند السطر 1118.
الحقول:
id: String | line 1119
createdById: String | line 1120
folderId: String? | line 1121
name: String | line 1122
description: String? | line 1123
status: WorkbookStatus | line 1124
sheets: Json? | line 1125
sheetCount: Int | line 1126
activeSheet: Int | line 1127
settings: Json? | line 1128
createdAt: DateTime | line 1129
updatedAt: DateTime | line 1130
deletedAt: DateTime? | line 1131
createdBy: User | line 1133
folder: Folder? | line 1134
العلاقات:
createdBy -> User | line 1133
folder -> Folder | line 1134

## ReplicationJob
تعريف النموذج يبدأ عند السطر 1143.
الحقول:
id: String | line 1144
name: String | line 1145
description: String? | line 1146
sourceConfig: Json | line 1147
targetConfig: Json | line 1148
mode: ReplicationMode | line 1149
status: ReplicationJobStatus | line 1150
schedule: String? | line 1151
lastRunAt: DateTime? | line 1152
nextRunAt: DateTime? | line 1153
totalRecords: Int? | line 1154
replicatedRecords: Int? | line 1155
failedRecords: Int? | line 1156
errorMessage: String? | line 1157
durationMs: Int? | line 1158
settings: Json? | line 1159
createdAt: DateTime | line 1160
updatedAt: DateTime | line 1161
العلاقات:
لا توجد علاقات صريحة مرصودة.

## LocalizationJob
تعريف النموذج يبدأ عند السطر 1169.
الحقول:
id: String | line 1170
createdById: String | line 1171
resourceType: ResourceType | line 1172
resourceId: String | line 1173
sourceLanguage: Language | line 1174
targetLanguage: Language | line 1175
status: LocalizationJobStatus | line 1176
progress: Float | line 1177
totalSegments: Int? | line 1178
translatedSegments: Int? | line 1179
reviewedSegments: Int? | line 1180
engine: String? | line 1181
errorMessage: String? | line 1182
result: Json? | line 1183
startedAt: DateTime? | line 1184
completedAt: DateTime? | line 1185
durationMs: Int? | line 1186
createdAt: DateTime | line 1187
updatedAt: DateTime | line 1188
createdBy: User | line 1190
العلاقات:
createdBy -> User | line 1190

## AiSession
تعريف النموذج يبدأ عند السطر 1200.
الحقول:
id: String | line 1201
userId: String | line 1202
title: String? | line 1203
status: AiSessionStatus | line 1204
model: String | line 1205
systemPrompt: String? | line 1206
context: Json? | line 1207
tokenCount: Int | line 1208
messageCount: Int | line 1209
settings: Json? | line 1210
expiresAt: DateTime? | line 1211
closedAt: DateTime? | line 1212
createdAt: DateTime | line 1213
updatedAt: DateTime | line 1214
user: User | line 1216
queries: AiQuery[] | line 1217
العلاقات:
user -> User | line 1216

## AiQuery
تعريف النموذج يبدأ عند السطر 1225.
الحقول:
id: String | line 1226
sessionId: String | line 1227
query: String | line 1228
response: String? | line 1229
status: AiQueryStatus | line 1230
model: String? | line 1231
promptTokens: Int? | line 1232
completionTokens: Int? | line 1233
totalTokens: Int? | line 1234
latencyMs: Int? | line 1235
context: Json? | line 1236
metadata: Json? | line 1237
rating: Int? | line 1238
feedback: String? | line 1239
errorMessage: String? | line 1240
createdAt: DateTime | line 1241
updatedAt: DateTime | line 1242
session: AiSession | line 1244
العلاقات:
session -> AiSession | line 1244

## AuditLog
تعريف النموذج يبدأ عند السطر 1252.
الحقول:
id: String | line 1253
tenantId: String | line 1254
userId: String? | line 1255
action: AuditAction | line 1256
resourceType: ResourceType | line 1257
resourceId: String | line 1258
resourceName: String? | line 1259
oldValue: Json? | line 1260
newValue: Json? | line 1261
ipAddress: String? | line 1262
userAgent: String? | line 1263
sessionId: String? | line 1264
metadata: Json? | line 1265
createdAt: DateTime | line 1266
tenant: Tenant | line 1268
user: User? | line 1269
العلاقات:
tenant -> Tenant | line 1268
user -> User | line 1269

## Permission
تعريف النموذج يبدأ عند السطر 1279.
الحقول:
id: String | line 1280
roleId: String | line 1281
resourceType: ResourceType | line 1282
action: PermissionAction | line 1283
conditions: Json? | line 1284
isGranted: Boolean | line 1285
createdAt: DateTime | line 1286
updatedAt: DateTime | line 1287
role: Role | line 1289
العلاقات:
role -> Role | line 1289

## LibraryAsset
تعريف النموذج يبدأ عند السطر 1298.
الحقول:
id: String | line 1299
tenantId: String | line 1300
name: String | line 1301
description: String? | line 1302
type: LibraryAssetType | line 1303
filePath: String | line 1304
fileSize: BigInt? | line 1305
mimeType: String? | line 1306
thumbnail: String? | line 1307
tags: Json? | line 1308
metadata: Json? | line 1309
isPublic: Boolean | line 1310
downloadCount: Int | line 1311
createdAt: DateTime | line 1312
updatedAt: DateTime | line 1313
deletedAt: DateTime? | line 1314
tenant: Tenant | line 1316
العلاقات:
tenant -> Tenant | line 1316

## ConversionJob
تعريف النموذج يبدأ عند السطر 1325.
الحقول:
id: String | line 1326
createdById: String | line 1327
pipelineId: String? | line 1328
sourceFormat: ConversionSourceFormat | line 1329
targetFormat: ConversionTargetFormat | line 1330
status: ConversionJobStatus | line 1331
sourceFilePath: String | line 1332
outputFilePath: String? | line 1333
sourceFileSize: BigInt? | line 1334
outputFileSize: BigInt? | line 1335
options: Json? | line 1336
progress: Float | line 1337
errorMessage: String? | line 1338
startedAt: DateTime? | line 1339
completedAt: DateTime? | line 1340
durationMs: Int? | line 1341
createdAt: DateTime | line 1342
updatedAt: DateTime | line 1343
createdBy: User | line 1345
pipeline: ConversionPipeline? | line 1346
العلاقات:
createdBy -> User | line 1345
pipeline -> ConversionPipeline | line 1346

## Notification
تعريف النموذج يبدأ عند السطر 1361.
الحقول:
id: String | line 1362
tenantId: String | line 1363
userId: String | line 1364
type: NotificationType | line 1365
channel: NotificationChannel | line 1366
status: NotificationStatus | line 1367
title: String | line 1368
message: String | line 1369
link: String? | line 1370
resourceType: ResourceType? | line 1371
resourceId: String? | line 1372
metadata: Json? | line 1373
readAt: DateTime? | line 1374
sentAt: DateTime? | line 1375
expiresAt: DateTime? | line 1376
createdAt: DateTime | line 1377
updatedAt: DateTime | line 1378
tenant: Tenant | line 1380
user: User | line 1381
العلاقات:
tenant -> Tenant | line 1380
user -> User | line 1381

## WorkflowInstance
تعريف النموذج يبدأ عند السطر 1391.
الحقول:
id: String | line 1392
tenantId: String | line 1393
name: String | line 1394
description: String? | line 1395
resourceType: ResourceType | line 1396
resourceId: String | line 1397
status: WorkflowStatus | line 1398
currentStepIdx: Int | line 1399
config: Json? | line 1400
context: Json? | line 1401
errorMessage: String? | line 1402
startedAt: DateTime? | line 1403
completedAt: DateTime? | line 1404
durationMs: Int? | line 1405
createdAt: DateTime | line 1406
updatedAt: DateTime | line 1407
tenant: Tenant | line 1409
steps: WorkflowStep[] | line 1410
العلاقات:
tenant -> Tenant | line 1409

## WorkflowStep
تعريف النموذج يبدأ عند السطر 1419.
الحقول:
id: String | line 1420
workflowId: String | line 1421
name: String | line 1422
description: String? | line 1423
type: WorkflowStepType | line 1424
status: WorkflowStepStatus | line 1425
stepOrder: Int | line 1426
assigneeId: String? | line 1427
completedById: String? | line 1428
config: Json? | line 1429
input: Json? | line 1430
output: Json? | line 1431
errorMessage: String? | line 1432
comment: String? | line 1433
startedAt: DateTime? | line 1434
completedAt: DateTime? | line 1435
durationMs: Int? | line 1436
dueAt: DateTime? | line 1437
createdAt: DateTime | line 1438
updatedAt: DateTime | line 1439
workflow: WorkflowInstance | line 1441
assignee: User? | line 1442
completedBy: User? | line 1443
العلاقات:
workflow -> WorkflowInstance | line 1441
assignee -> User | line 1442
completedBy -> User | line 1443

## KnowledgeBase
تعريف النموذج يبدأ عند السطر 1452.
الحقول:
id: String | line 1453
tenantId: String | line 1454
name: String | line 1455
description: String? | line 1456
status: KnowledgeBaseStatus | line 1457
language: Language | line 1458
embeddingModel: String? | line 1459
chunkSize: Int | line 1460
chunkOverlap: Int | line 1461
totalChunks: Int | line 1462
totalDocuments: Int | line 1463
settings: Json? | line 1464
lastIndexedAt: DateTime? | line 1465
createdAt: DateTime | line 1466
updatedAt: DateTime | line 1467
deletedAt: DateTime? | line 1468
tenant: Tenant | line 1470
chunks: KnowledgeChunk[] | line 1471
العلاقات:
tenant -> Tenant | line 1470

## KnowledgeChunk
تعريف النموذج يبدأ عند السطر 1480.
الحقول:
id: String | line 1481
knowledgeBaseId: String | line 1482
documentName: String | line 1483
documentPath: String? | line 1484
content: String | line 1485
contentHash: String | line 1486
chunkIndex: Int | line 1487
tokenCount: Int? | line 1488
embedding: Json? | line 1489
status: KnowledgeChunkStatus | line 1490
metadata: Json? | line 1491
createdAt: DateTime | line 1492
updatedAt: DateTime | line 1493
knowledgeBase: KnowledgeBase | line 1495
العلاقات:
knowledgeBase -> KnowledgeBase | line 1495

## Prompt
تعريف النموذج يبدأ عند السطر 1504.
الحقول:
id: String | line 1505
tenantId: String | line 1506
name: String | line 1507
slug: String | line 1508
description: String? | line 1509
category: PromptCategory | line 1510
status: PromptStatus | line 1511
isSystem: Boolean | line 1512
settings: Json? | line 1513
createdAt: DateTime | line 1514
updatedAt: DateTime | line 1515
deletedAt: DateTime? | line 1516
tenant: Tenant | line 1518
versions: PromptVersion[] | line 1519
العلاقات:
tenant -> Tenant | line 1518

## PromptVersion
تعريف النموذج يبدأ عند السطر 1529.
الحقول:
id: String | line 1530
promptId: String | line 1531
createdById: String | line 1532
versionNumber: Int | line 1533
content: String | line 1534
systemMessage: String? | line 1535
variables: Json? | line 1536
model: String? | line 1537
temperature: Float? | line 1538
maxTokens: Int? | line 1539
status: PromptStatus | line 1540
testResults: Json? | line 1541
changelog: String? | line 1542
createdAt: DateTime | line 1543
updatedAt: DateTime | line 1544
prompt: Prompt | line 1546
createdBy: User | line 1547
العلاقات:
prompt -> Prompt | line 1546
createdBy -> User | line 1547

## TranslationMemory
تعريف النموذج يبدأ عند السطر 1556.
الحقول:
id: String | line 1557
sourceLanguage: Language | line 1558
targetLanguage: Language | line 1559
sourceText: String | line 1560
targetText: String | line 1561
sourceHash: String | line 1562
context: String? | line 1563
domain: String? | line 1564
quality: Float? | line 1565
usageCount: Int | line 1566
isVerified: Boolean | line 1567
metadata: Json? | line 1568
createdAt: DateTime | line 1569
updatedAt: DateTime | line 1570
العلاقات:
لا توجد علاقات صريحة مرصودة.

## Glossary
تعريف النموذج يبدأ عند السطر 1579.
الحقول:
id: String | line 1580
tenantId: String | line 1581
name: String | line 1582
description: String? | line 1583
language: Language | line 1584
domain: String? | line 1585
isActive: Boolean | line 1586
termCount: Int | line 1587
createdAt: DateTime | line 1588
updatedAt: DateTime | line 1589
deletedAt: DateTime? | line 1590
tenant: Tenant | line 1592
terms: GlossaryTerm[] | line 1593
العلاقات:
tenant -> Tenant | line 1592

## GlossaryTerm
تعريف النموذج يبدأ عند السطر 1603.
الحقول:
id: String | line 1604
glossaryId: String | line 1605
term: String | line 1606
definition: String? | line 1607
translations: Json? | line 1608
context: String? | line 1609
partOfSpeech: String? | line 1610
notes: String? | line 1611
isApproved: Boolean | line 1612
createdAt: DateTime | line 1613
updatedAt: DateTime | line 1614
glossary: Glossary | line 1616
العلاقات:
glossary -> Glossary | line 1616

## Folder
تعريف النموذج يبدأ عند السطر 1624.
الحقول:
id: String | line 1625
tenantId: String | line 1626
parentId: String? | line 1627
name: String | line 1628
slug: String | line 1629
description: String? | line 1630
color: String? | line 1631
icon: String? | line 1632
sortOrder: Int | line 1633
path: String | line 1634
depth: Int | line 1635
createdAt: DateTime | line 1636
updatedAt: DateTime | line 1637
deletedAt: DateTime? | line 1638
tenant: Tenant | line 1640
parent: Folder? | line 1641
children: Folder[] | line 1642
datasets: Dataset[] | line 1643
dashboards: Dashboard[] | line 1644
reports: Report[] | line 1645
presentations: Presentation[] | line 1646
infographics: Infographic[] | line 1647
workbooks: Workbook[] | line 1648
العلاقات:
tenant -> Tenant | line 1640
parent -> Folder | line 1641
children -> Folder | line 1642

## ScheduledReport
تعريف النموذج يبدأ عند السطر 1658.
الحقول:
id: String | line 1659
tenantId: String | line 1660
reportId: String | line 1661
createdById: String | line 1662
name: String | line 1663
frequency: ScheduleFrequency | line 1664
cronExpression: String? | line 1665
timezone: String | line 1666
outputFormat: ReportOutputFormat | line 1667
recipients: Json? | line 1668
isActive: Boolean | line 1669
lastRunAt: DateTime? | line 1670
nextRunAt: DateTime? | line 1671
runCount: Int | line 1672
failCount: Int | line 1673
settings: Json? | line 1674
createdAt: DateTime | line 1675
updatedAt: DateTime | line 1676
tenant: Tenant | line 1678
report: Report | line 1679
createdBy: User | line 1680
العلاقات:
tenant -> Tenant | line 1678
report -> Report | line 1679
createdBy -> User | line 1680

## Kpi
تعريف النموذج يبدأ عند السطر 1690.
الحقول:
id: String | line 1691
tenantId: String | line 1692
createdById: String | line 1693
datasetId: String? | line 1694
name: String | line 1695
slug: String | line 1696
description: String? | line 1697
status: KpiStatus | line 1698
unit: String? | line 1699
formula: String? | line 1700
query: String? | line 1701
currentValue: Float? | line 1702
previousValue: Float? | line 1703
targetValue: Float? | line 1704
minValue: Float? | line 1705
maxValue: Float? | line 1706
trend: KpiTrend | line 1707
changePercent: Float? | line 1708
frequency: ScheduleFrequency | line 1709
lastCalculatedAt: DateTime? | line 1710
settings: Json? | line 1711
createdAt: DateTime | line 1712
updatedAt: DateTime | line 1713
deletedAt: DateTime? | line 1714
tenant: Tenant | line 1716
createdBy: User | line 1717
dataset: Dataset? | line 1718
history: KpiHistory[] | line 1719
العلاقات:
tenant -> Tenant | line 1716
createdBy -> User | line 1717
dataset -> Dataset | line 1718

## KpiHistory
تعريف النموذج يبدأ عند السطر 1731.
الحقول:
id: String | line 1732
kpiId: String | line 1733
value: Float | line 1734
target: Float? | line 1735
trend: KpiTrend | line 1736
change: Float? | line 1737
changePct: Float? | line 1738
metadata: Json? | line 1739
recordedAt: DateTime | line 1740
createdAt: DateTime | line 1741
kpi: Kpi | line 1743
العلاقات:
kpi -> Kpi | line 1743

## DataRow
تعريف النموذج يبدأ عند السطر 1750.
الحقول:
id: String | line 1751
datasetId: String | line 1752
rowIndex: Int | line 1753
data: Json | line 1754
checksum: String? | line 1755
isValid: Boolean | line 1756
errors: Json? | line 1757
version: Int | line 1758
createdAt: DateTime | line 1759
updatedAt: DateTime | line 1760
dataset: Dataset | line 1762
العلاقات:
dataset -> Dataset | line 1762

## ConversionPipeline
تعريف النموذج يبدأ عند السطر 1771.
الحقول:
id: String | line 1772
name: String | line 1773
description: String? | line 1774
status: ConversionPipelineStatus | line 1775
steps: Json | line 1776
schedule: String? | line 1777
isActive: Boolean | line 1778
lastRunAt: DateTime? | line 1779
nextRunAt: DateTime? | line 1780
runCount: Int | line 1781
failCount: Int | line 1782
settings: Json? | line 1783
createdAt: DateTime | line 1784
updatedAt: DateTime | line 1785
jobs: ConversionJob[] | line 1787
العلاقات:
لا توجد علاقات صريحة مرصودة.

## ReportDefinition
تعريف النموذج يبدأ عند السطر 1799.
الحقول:
id: String | line 1800
tenantId: String | line 1801
createdBy: String | line 1802
updatedBy: String? | line 1803
name: String | line 1804
description: String? | line 1805
mode: ReportDefinitionMode | line 1806
status: ReportDefinitionStatus | line 1807
reportType: String | line 1808
templateId: String? | line 1809
config: Json | line 1810
sections: Json? | line 1811
dataSources: Json? | line 1812
outputFormat: ReportOutputFormat | line 1813
settings: Json? | line 1814
metadata: Json? | line 1815
publishedAt: DateTime? | line 1816
createdAt: DateTime | line 1817
updatedAt: DateTime | line 1818
deletedAt: DateTime? | line 1819
tenant: Tenant | line 1821
createdByUser: User | line 1822
template: ReportTemplate? | line 1823
buildOutputs: ReportBuildOutput[] | line 1824
schedules: ReportSchedule[] | line 1825
postEdits: ReportPostEdit[] | line 1826
charts: ReportChart[] | line 1827
interactiveReports: InteractiveReport[] | line 1828
العلاقات:
tenant -> Tenant | line 1821
createdByUser -> User | line 1822
template -> ReportTemplate | line 1823

## ReportBuildOutput
تعريف النموذج يبدأ عند السطر 1840.
الحقول:
id: String | line 1841
reportId: String | line 1842
format: ReportOutputFormat | line 1843
status: ReportStatus | line 1844
renderedSections: Json? | line 1845
fetchedData: Json? | line 1846
filePath: String? | line 1847
fileSize: BigInt? | line 1848
buildDuration: Int? | line 1849
metadata: Json? | line 1850
createdAt: DateTime | line 1851
updatedAt: DateTime | line 1852
reportDefinition: ReportDefinition | line 1854
العلاقات:
reportDefinition -> ReportDefinition | line 1854

## ReportTemplate
تعريف النموذج يبدأ عند السطر 1862.
الحقول:
id: String | line 1863
tenantId: String | line 1864
createdBy: String | line 1865
updatedBy: String? | line 1866
name: String | line 1867
description: String? | line 1868
category: String? | line 1869
subcategory: String? | line 1870
html: String | line 1871
variables: Json? | line 1872
templateConfig: Json? | line 1873
layoutData: Json? | line 1874
defaultDataBindings: Json? | line 1875
supportedOutputFormats: Json? | line 1876
thumbnailUrl: String? | line 1877
isPremium: Boolean | line 1878
isPublic: Boolean | line 1879
isSystem: Boolean | line 1880
status: String | line 1881
version: Int | line 1882
tags: Json? | line 1883
settings: Json? | line 1884
createdAt: DateTime | line 1885
updatedAt: DateTime | line 1886
deletedAt: DateTime? | line 1887
tenant: Tenant | line 1889
createdByUser: User | line 1890
reportDefinitions: ReportDefinition[] | line 1891
العلاقات:
tenant -> Tenant | line 1889
createdByUser -> User | line 1890

## ReportSchedule
تعريف النموذج يبدأ عند السطر 1902.
الحقول:
id: String | line 1903
reportId: String | line 1904
tenantId: String | line 1905
createdBy: String | line 1906
cronExpression: String | line 1907
recipients: Json | line 1908
format: ReportOutputFormat | line 1909
status: String | line 1910
nextRunAt: DateTime? | line 1911
lastRunAt: DateTime? | line 1912
runCount: Int | line 1913
failureCount: Int | line 1914
metadata: Json? | line 1915
createdAt: DateTime | line 1916
updatedAt: DateTime | line 1917
reportDefinition: ReportDefinition | line 1919
tenant: Tenant | line 1920
createdByUser: User | line 1921
history: ScheduleHistory[] | line 1922
العلاقات:
reportDefinition -> ReportDefinition | line 1919
tenant -> Tenant | line 1920
createdByUser -> User | line 1921

## ScheduleHistory
تعريف النموذج يبدأ عند السطر 1931.
الحقول:
id: String | line 1932
scheduleId: String | line 1933
status: String | line 1934
duration: Int? | line 1935
recipientCount: Int? | line 1936
fileSize: BigInt? | line 1937
error: String? | line 1938
metadata: Json? | line 1939
executedAt: DateTime | line 1940
schedule: ReportSchedule | line 1942
العلاقات:
schedule -> ReportSchedule | line 1942

## ReportDataSource
تعريف النموذج يبدأ عند السطر 1950.
الحقول:
id: String | line 1951
tenantId: String | line 1952
name: String | line 1953
type: DataSourceType | line 1954
connectionConfig: Json | line 1955
status: DataSourceStatus | line 1956
lastTestedAt: DateTime? | line 1957
metadata: Json? | line 1958
createdAt: DateTime | line 1959
updatedAt: DateTime | line 1960
tenant: Tenant | line 1962
العلاقات:
tenant -> Tenant | line 1962

## ReportChart
تعريف النموذج يبدأ عند السطر 1970.
الحقول:
id: String | line 1971
reportId: String | line 1972
type: String | line 1973
title: String? | line 1974
config: Json | line 1975
theme: String? | line 1976
width: Int | line 1977
height: Int | line 1978
imageData: String? | line 1979
metadata: Json? | line 1980
createdAt: DateTime | line 1981
updatedAt: DateTime | line 1982
reportDefinition: ReportDefinition | line 1984
العلاقات:
reportDefinition -> ReportDefinition | line 1984

## ReportPostEdit
تعريف النموذج يبدأ عند السطر 1991.
الحقول:
id: String | line 1992
reportId: String | line 1993
editType: String | line 1994
targetSectionId: String? | line 1995
changes: Json | line 1996
annotation: String? | line 1997
version: Int | line 1998
isPublished: Boolean | line 1999
formatOverrides: Json? | line 2000
headerFooterConfig: Json? | line 2001
watermarkConfig: Json? | line 2002
createdBy: String | line 2003
metadata: Json? | line 2004
createdAt: DateTime | line 2005
updatedAt: DateTime | line 2006
reportDefinition: ReportDefinition | line 2008
createdByUser: User | line 2009
العلاقات:
reportDefinition -> ReportDefinition | line 2008
createdByUser -> User | line 2009

## ReportExternalSimulation
تعريف النموذج يبدأ عند السطر 2018.
الحقول:
id: String | line 2019
reportId: String? | line 2020
name: String | line 2021
description: String? | line 2022
simulationType: String | line 2023
status: String | line 2024
inputParameters: Json? | line 2025
externalSourceUrl: String? | line 2026
scenarioConfig: Json? | line 2027
resultData: Json? | line 2028
comparisonResult: Json? | line 2029
createdBy: String | line 2030
metadata: Json? | line 2031
createdAt: DateTime | line 2032
updatedAt: DateTime | line 2033
createdByUser: User | line 2035
العلاقات:
createdByUser -> User | line 2035

## ReportCompareSchedule
تعريف النموذج يبدأ عند السطر 2043.
الحقول:
id: String | line 2044
tenantId: String | line 2045
name: String | line 2046
description: String? | line 2047
reportIdA: String | line 2048
reportIdB: String | line 2049
comparisonType: String | line 2050
comparisonConfig: Json? | line 2051
scheduleConfig: Json? | line 2052
notificationConfig: Json? | line 2053
thresholds: Json? | line 2054
isActive: Boolean | line 2055
status: String | line 2056
resultData: Json? | line 2057
lastExecutedAt: DateTime? | line 2058
createdBy: String | line 2059
metadata: Json? | line 2060
createdAt: DateTime | line 2061
updatedAt: DateTime | line 2062
tenant: Tenant | line 2064
createdByUser: User | line 2065
العلاقات:
tenant -> Tenant | line 2064
createdByUser -> User | line 2065

## InteractiveReport
تعريف النموذج يبدأ عند السطر 2074.
الحقول:
id: String | line 2075
reportId: String | line 2076
name: String | line 2077
description: String? | line 2078
elements: Json | line 2079
parameters: Json? | line 2080
linkedReports: Json? | line 2081
bookmarks: Json? | line 2082
version: Int | line 2083
createdBy: String | line 2084
metadata: Json? | line 2085
createdAt: DateTime | line 2086
updatedAt: DateTime | line 2087
reportDefinition: ReportDefinition | line 2089
createdByUser: User | line 2090
versions: InteractiveReportVersion[] | line 2091
comments: ReportComment[] | line 2092
annotations: ReportAnnotation[] | line 2093
العلاقات:
reportDefinition -> ReportDefinition | line 2089
createdByUser -> User | line 2090

## InteractiveReportVersion
تعريف النموذج يبدأ عند السطر 2100.
الحقول:
id: String | line 2101
reportId: String | line 2102
version: Int | line 2103
elements: Json | line 2104
parameters: Json? | line 2105
linkedReports: Json? | line 2106
changedBy: String | line 2107
changeDescription: String? | line 2108
createdAt: DateTime | line 2109
interactiveReport: InteractiveReport | line 2111
changedByUser: User | line 2112
العلاقات:
interactiveReport -> InteractiveReport | line 2111
changedByUser -> User | line 2112

## ReportComment
تعريف النموذج يبدأ عند السطر 2119.
الحقول:
id: String | line 2120
reportId: String | line 2121
sectionId: String? | line 2122
userId: String | line 2123
userName: String | line 2124
content: String | line 2125
parentCommentId: String? | line 2126
resolved: Boolean | line 2127
resolvedBy: String? | line 2128
resolvedAt: DateTime? | line 2129
mentions: Json? | line 2130
createdAt: DateTime | line 2131
updatedAt: DateTime | line 2132
interactiveReport: InteractiveReport | line 2134
user: User | line 2135
parent: ReportComment? | line 2136
replies: ReportComment[] | line 2137
العلاقات:
interactiveReport -> InteractiveReport | line 2134
user -> User | line 2135
parent -> ReportComment | line 2136
replies -> ReportComment | line 2137

## ReportAnnotation
تعريف النموذج يبدأ عند السطر 2146.
الحقول:
id: String | line 2147
reportId: String | line 2148
sectionId: String? | line 2149
type: String | line 2150
position: Json | line 2151
content: String? | line 2152
color: String? | line 2153
createdBy: String | line 2154
createdAt: DateTime | line 2155
interactiveReport: InteractiveReport | line 2157
createdByUser: User | line 2158
العلاقات:
interactiveReport -> InteractiveReport | line 2157
createdByUser -> User | line 2158

## DistributionConfig
تعريف النموذج يبدأ عند السطر 2165.
الحقول:
id: String | line 2166
reportId: String | line 2167
name: String | line 2168
recipients: Json | line 2169
schedule: Json? | line 2170
format: ReportOutputFormat | line 2171
includeWatermark: Boolean | line 2172
watermarkText: String? | line 2173
emailSubject: String? | line 2174
emailBody: String? | line 2175
trackReadReceipts: Boolean | line 2176
accessPassword: String? | line 2177
accessExpiry: DateTime? | line 2178
maxViews: Int? | line 2179
allowDownload: Boolean | line 2180
allowPrint: Boolean | line 2181
enabled: Boolean | line 2182
createdBy: String | line 2183
metadata: Json? | line 2184
createdAt: DateTime | line 2185
updatedAt: DateTime | line 2186
createdByUser: User | line 2188
distributionRecords: DistributionRecord[] | line 2189
العلاقات:
createdByUser -> User | line 2188

## DistributionRecord
تعريف النموذج يبدأ عند السطر 2196.
الحقول:
id: String | line 2197
distributionConfigId: String | line 2198
reportId: String | line 2199
status: DistributionStatus | line 2200
recipientCount: Int | line 2201
errorMessage: String? | line 2202
fileSize: BigInt? | line 2203
readReceipts: Json? | line 2204
trackingIds: Json? | line 2205
sentAt: DateTime? | line 2206
createdAt: DateTime | line 2207
distributionConfig: DistributionConfig | line 2209
readReceiptLogs: ReadReceiptLog[] | line 2210
العلاقات:
distributionConfig -> DistributionConfig | line 2209

## ReadReceiptLog
تعريف النموذج يبدأ عند السطر 2219.
الحقول:
id: String | line 2220
distributionRecordId: String | line 2221
recipientEmail: String | line 2222
ipAddress: String? | line 2223
userAgent: String? | line 2224
readAt: DateTime | line 2225
distributionRecord: DistributionRecord | line 2227
العلاقات:
distributionRecord -> DistributionRecord | line 2227

## Slide
تعريف النموذج يبدأ عند السطر 2238.
الحقول:
id: String | line 2239
presentationId: String | line 2240
slideIndex: Int | line 2241
layout: String | line 2242
content: String | line 2243
notes: String? | line 2244
thumbnail: String? | line 2245
createdAt: DateTime | line 2246
updatedAt: DateTime | line 2247
presentation: Presentation | line 2249
العلاقات:
presentation -> Presentation | line 2249

## Theme
تعريف النموذج يبدأ عند السطر 2256.
الحقول:
id: String | line 2257
name: String | line 2258
tenantId: String | line 2259
config: String | line 2260
isDefault: Boolean | line 2261
createdAt: DateTime | line 2262
updatedAt: DateTime | line 2263
tenant: Tenant | line 2265
العلاقات:
tenant -> Tenant | line 2265

## InfographicSection
تعريف النموذج يبدأ عند السطر 2271.
الحقول:
id: String | line 2272
infographicId: String | line 2273
sectionType: String | line 2274
sectionIndex: Int | line 2275
content: String | line 2276
style: String? | line 2277
createdAt: DateTime | line 2278
updatedAt: DateTime | line 2279
infographic: Infographic | line 2281
العلاقات:
infographic -> Infographic | line 2281

## CollaborationSession
تعريف النموذج يبدأ عند السطر 2287.
الحقول:
id: String | line 2288
presentationId: String | line 2289
userId: String | line 2290
role: String | line 2291
isActive: Boolean | line 2292
joinedAt: DateTime | line 2293
lastActiveAt: DateTime | line 2294
presentation: Presentation | line 2296
user: User | line 2297
العلاقات:
presentation -> Presentation | line 2296
user -> User | line 2297

## ShareLink
تعريف النموذج يبدأ عند السطر 2304.
الحقول:
id: String | line 2305
resourceType: String | line 2306
resourceId: String | line 2307
token: String | line 2308
permissions: String | line 2309
password: String? | line 2310
expiresAt: DateTime? | line 2311
maxViews: Int? | line 2312
viewCount: Int | line 2313
createdBy: String | line 2314
createdAt: DateTime | line 2315
creator: User | line 2317
العلاقات:
creator -> User | line 2317

## ConnectorConnection
تعريف النموذج يبدأ عند السطر 2328.
الحقول:
id: String | line 2329
tenantId: String | line 2330
userId: String | line 2331
connectorType: String | line 2332
accessToken: String | line 2333
refreshToken: String? | line 2334
expiresAt: DateTime | line 2335
tokenType: String | line 2336
status: String | line 2337
lastUsedAt: DateTime? | line 2338
lastRefreshedAt: DateTime? | line 2339
revokedAt: DateTime? | line 2340
metadata: Json? | line 2341
createdAt: DateTime | line 2342
updatedAt: DateTime | line 2343
tenant: Tenant | line 2345
user: User | line 2346
العلاقات:
tenant -> Tenant | line 2345
user -> User | line 2346

## Policy
تعريف النموذج يبدأ عند السطر 2358.
الحقول:
id: String | line 2359
tenantId: String | line 2360
name: String | line 2361
description: String | line 2362
resource: String | line 2363
action: String | line 2364
conditions: Json | line 2365
effect: String | line 2366
priority: Int | line 2367
enabled: Boolean | line 2368
createdAt: DateTime | line 2369
updatedAt: DateTime | line 2370
tenant: Tenant | line 2372
العلاقات:
tenant -> Tenant | line 2372

## CompliancePolicy
تعريف النموذج يبدأ عند السطر 2379.
الحقول:
id: String | line 2380
tenantId: String | line 2381
name: String | line 2382
description: String | line 2383
framework: String | line 2384
status: String | line 2385
evidence: String? | line 2386
assignee: String? | line 2387
dueDate: DateTime? | line 2388
createdAt: DateTime | line 2389
updatedAt: DateTime | line 2390
tenant: Tenant | line 2392
checks: ComplianceCheck[] | line 2393
العلاقات:
tenant -> Tenant | line 2392

## ComplianceCheck
تعريف النموذج يبدأ عند السطر 2400.
الحقول:
id: String | line 2401
compliancePolicyId: String | line 2402
status: String | line 2403
findings: Json? | line 2404
checkedBy: String? | line 2405
checkedAt: DateTime | line 2406
compliancePolicy: CompliancePolicy | line 2408
العلاقات:
compliancePolicy -> CompliancePolicy | line 2408

## WorkflowDefinition
تعريف النموذج يبدأ عند السطر 2415.
الحقول:
id: String | line 2416
tenantId: String | line 2417
name: String | line 2418
description: String? | line 2419
triggerResource: String | line 2420
triggerAction: String | line 2421
steps: Json | line 2422
status: String | line 2423
createdAt: DateTime | line 2424
updatedAt: DateTime | line 2425
tenant: Tenant | line 2427
العلاقات:
tenant -> Tenant | line 2427

## LayoutAnalysis
تعريف النموذج يبدأ عند السطر 2438.
الحقول:
id: String | line 2439
tenantId: String | line 2440
sourceId: String | line 2441
sourceType: String | line 2442
layoutGraph: Json | line 2443
designTokens: Json | line 2444
metadata: Json? | line 2445
pageCount: Int | line 2446
elementCount: Int | line 2447
confidence: Float | line 2448
processingTimeMs: Int | line 2449
createdAt: DateTime | line 2450
tenant: Tenant | line 2452
العلاقات:
tenant -> Tenant | line 2452

## DocumentExtraction
تعريف النموذج يبدأ عند السطر 2460.
الحقول:
id: String | line 2461
tenantId: String | line 2462
fileId: String | line 2463
fileType: String | line 2464
pages: Json | line 2465
tables: Json? | line 2466
charts: Json? | line 2467
fullText: String? | line 2468
languages: String[] | line 2469
confidence: Float | line 2470
ocrEngine: String | line 2471
processingTimeMs: Int | line 2472
createdAt: DateTime | line 2473
tenant: Tenant | line 2475
العلاقات:
tenant -> Tenant | line 2475

## PixelValidation
تعريف النموذج يبدأ عند السطر 2483.
الحقول:
id: String | line 2484
tenantId: String | line 2485
sourceHash: String | line 2486
pixelDiff: Int | line 2487
totalPixels: Int | line 2488
diffPercentage: Float | line 2489
ssim: Float | line 2490
lpips: Float | line 2491
isPerfect: Boolean | line 2492
iterationCount: Int | line 2493
convergenceHistory: Float[] | line 2494
hotspots: Json? | line 2495
diffImagePath: String? | line 2496
createdAt: DateTime | line 2497
tenant: Tenant | line 2499
العلاقات:
tenant -> Tenant | line 2499

## FontRecognition
تعريف النموذج يبدأ عند السطر 2508.
الحقول:
id: String | line 2509
tenantId: String | line 2510
sourceId: String | line 2511
detectedFonts: Json | line 2512
typographyHierarchy: Json | line 2513
confidence: Float | line 2514
createdAt: DateTime | line 2515
tenant: Tenant | line 2517
العلاقات:
tenant -> Tenant | line 2517

## LayoutTranslation
تعريف النموذج يبدأ عند السطر 2524.
الحقول:
id: String | line 2525
tenantId: String | line 2526
sourceLanguage: String | line 2527
targetLanguage: String | line 2528
segmentCount: Int | line 2529
adjustmentCount: Int | line 2530
fromMemoryCount: Int | line 2531
qualityScore: Float | line 2532
layoutGraph: Json | line 2533
translationPairs: Json | line 2534
layoutAdjustments: Json | line 2535
processingTimeMs: Int | line 2536
createdAt: DateTime | line 2537
tenant: Tenant | line 2539
العلاقات:
tenant -> Tenant | line 2539

## QualityValidation
تعريف النموذج يبدأ عند السطر 2546.
الحقول:
id: String | line 2547
tenantId: String | line 2548
sourceId: String | line 2549
metrics: Json | line 2550
issues: Json | line 2551
overallScore: Float | line 2552
issueCount: Int | line 2553
criticalCount: Int | line 2554
createdAt: DateTime | line 2555
tenant: Tenant | line 2557
العلاقات:
tenant -> Tenant | line 2557

## BridgePayload
تعريف النموذج يبدأ عند السطر 2569.
الحقول:
id: String | line 2570
tenantId: String | line 2571
userId: String | line 2572
sourceEngine: String | line 2573
targetEngine: String | line 2574
dataType: String | line 2575
data: Json | line 2576
correlationId: String | line 2577
ttlMs: Int? | line 2578
status: String | line 2579
createdAt: DateTime | line 2580
tenant: Tenant | line 2582
lineage: DataLineage[] | line 2583
العلاقات:
tenant -> Tenant | line 2582

## DataLineage
تعريف النموذج يبدأ عند السطر 2592.
الحقول:
id: String | line 2593
payloadId: String | line 2594
tenantId: String | line 2595
userId: String | line 2596
sourceEngine: String | line 2597
targetEngine: String | line 2598
dataType: String | line 2599
transformations: Json | line 2600
createdAt: DateTime | line 2601
payload: BridgePayload | line 2603
tenant: Tenant | line 2604
العلاقات:
payload -> BridgePayload | line 2603
tenant -> Tenant | line 2604

## TrainingDataset
تعريف النموذج يبدأ عند السطر 2616.
الحقول:
id: String | line 2617
tenantId: String | line 2618
name: String | line 2619
description: String? | line 2620
taskType: String | line 2621
format: String | line 2622
sampleCount: Int | line 2623
trainCount: Int | line 2624
validationCount: Int | line 2625
testCount: Int | line 2626
labelDistribution: Json? | line 2627
qualityScore: Float? | line 2628
version: Int | line 2629
storagePath: String | line 2630
status: String | line 2631
createdAt: DateTime | line 2632
updatedAt: DateTime | line 2633
tenant: Tenant | line 2635
jobs: TrainingJob[] | line 2636
العلاقات:
tenant -> Tenant | line 2635

## TrainingJob
تعريف النموذج يبدأ عند السطر 2643.
الحقول:
id: String | line 2644
tenantId: String | line 2645
datasetId: String | line 2646
modelConfigId: String? | line 2647
baseModel: String | line 2648
taskType: String | line 2649
hyperparameters: Json | line 2650
status: String | line 2651
metrics: Json? | line 2652
epochs: Int | line 2653
currentEpoch: Int | line 2654
trainingLoss: Float? | line 2655
validationLoss: Float? | line 2656
externalJobId: String? | line 2657
startedAt: DateTime? | line 2658
completedAt: DateTime? | line 2659
errorMessage: String? | line 2660
createdAt: DateTime | line 2661
dataset: TrainingDataset | line 2663
tenant: Tenant | line 2664
model: ModelRegistry? | line 2665
العلاقات:
dataset -> TrainingDataset | line 2663
tenant -> Tenant | line 2664

## ModelRegistry
تعريف النموذج يبدأ عند السطر 2672.
الحقول:
id: String | line 2673
tenantId: String | line 2674
jobId: String | line 2675
name: String | line 2676
version: String | line 2677
taskType: String | line 2678
baseModel: String | line 2679
metrics: Json | line 2680
status: String | line 2681
deploymentId: String? | line 2682
artifactPath: String | line 2683
metadata: Json? | line 2684
promotedAt: DateTime? | line 2685
archivedAt: DateTime? | line 2686
createdAt: DateTime | line 2687
updatedAt: DateTime | line 2688
job: TrainingJob | line 2690
tenant: Tenant | line 2691
العلاقات:
job -> TrainingJob | line 2690
tenant -> Tenant | line 2691

## ContextMemoryLong
تعريف النموذج يبدأ عند السطر 2702.
الحقول:
id: String | line 2703
tenantId: String | line 2704
userId: String | line 2705
category: String | line 2706
key: String | line 2707
value: Json | line 2708
accessCount: Int | line 2709
lastAccessedAt: DateTime | line 2710
createdAt: DateTime | line 2711
updatedAt: DateTime | line 2712
tenant: Tenant | line 2714
العلاقات:
tenant -> Tenant | line 2714

## EpisodeMemory
تعريف النموذج يبدأ عند السطر 2722.
الحقول:
id: String | line 2723
tenantId: String | line 2724
userId: String | line 2725
requestText: String | line 2726
intent: String | line 2727
actions: Json | line 2728
outcome: String | line 2729
satisfaction: Float? | line 2730
duration: Int? | line 2731
context: Json? | line 2732
createdAt: DateTime | line 2733
tenant: Tenant | line 2735
العلاقات:
tenant -> Tenant | line 2735

## SemanticFact
تعريف النموذج يبدأ عند السطر 2742.
الحقول:
id: String | line 2743
tenantId: String | line 2744
subject: String | line 2745
predicate: String | line 2746
object: String | line 2747
confidence: Float | line 2748
source: String | line 2749
validatedAt: DateTime? | line 2750
createdAt: DateTime | line 2751
tenant: Tenant | line 2753
العلاقات:
tenant -> Tenant | line 2753
