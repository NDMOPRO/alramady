# Rasid Platform - Database Documentation

## Database Architecture

Rasid uses **PostgreSQL 16** as its primary database with **per-service Prisma schemas**. Each microservice manages its own schema, enabling independent evolution while sharing the same PostgreSQL instance.

### Schema Distribution

| Service | Models | Enums | Key Tables |
|---------|--------|-------|------------|
| Root (shared) | 65 | 48 | Tenant, User, Role, Dataset, Report, Dashboard, Presentation |
| data-service | 72 | 16 | Dataset, DataRow, Pipeline, KnowledgeGraph, ConnectorConnection |
| excel-service | 16 | 0 | Workbook, Sheet, Cell, Chart, Macro, ExcelWorkbook |
| dashboard-service | 30 | 6 | Dashboard, DashboardWidget, DashboardFilter, DashboardTheme |
| reporting-service | 44 | 12 | ReportDefinition, Report, ReportSchedule, DistributionConfig |
| presentation-service | 27 | 3 | Presentation, Slide, SlideElement, Theme, LiveSession |
| localization-service | 15 | 1 | LocalizationJob, TranslationMemory, Glossary, GlossaryTerm |
| conversion-service | 12 | 4 | ConversionJob, ConversionPipeline, OcrResult, File |
| ai-service | 38 | 1 | AiSession, AiQuery, KnowledgeBase, VectorDocument, FineTuneJob |
| governance-service | 72 | 12 | User, Role, Policy, AuditLog, RlsPolicy, FeatureFlag, Webhook |
| infographic-service | 3 | 0 | ChartRender, InfographicLayout, Icon |
| library-service | 20 | 1 | LibraryAsset, Folder, File, SearchIndex, Share |
| replication-service | 21 | 0 | ReplicationJob, ComparisonResult, PrintLock, CorePrinciple |
| template-service | 10 | 0 | Template, TemplateVersion, MarketplaceTemplate |

Total: **~445 models**, **~104 enums** across 14 schemas.

## Core Entity Descriptions

### Tenant & Identity

| Entity | Description |
|--------|-------------|
| **Tenant** | Organization/company. Top-level isolation boundary. All data is scoped by tenantId. |
| **User** | Individual user within a tenant. Carries email, role, status. |
| **Role** | Named role (admin, editor, viewer, etc.) with associated permissions. |
| **UserRole** | Many-to-many join between User and Role. |
| **Permission** | Specific action+resource grant attached to a Role. |
| **AuditLog** | Immutable log of every significant action in the system. |

### Data Domain

| Entity | Description |
|--------|-------------|
| **Dataset** | A named collection of tabular data. Has columns, rows, versions. |
| **DatasetColumn** | Column definition (name, type, position, nullable) within a Dataset. |
| **DataRow** | Single row of data stored as JSON within a Dataset. |
| **DatasetVersion** | Version snapshot for Dataset tracking changes over time. |
| **IngestionJob** | Record of a file ingestion process (status, source, result). |
| **DataQualityCheck** | Quality validation result for a Dataset. |
| **Pipeline** | ETL pipeline definition with steps. |
| **PipelineExecution** | Single execution run of a Pipeline. |
| **ConnectorConnection** | External data source connection config (APIs, databases). |
| **SyncSchedule** | Cron-based sync schedule for a data source. Unique on sourceId. |
| **KnowledgeGraphNode/Edge** | Nodes and relationships in a knowledge graph. |

### Excel Domain

| Entity | Description |
|--------|-------------|
| **Workbook** | Excel workbook with sheets, formulas, metadata stored as JSON. |
| **ExcelWorkbook** | Alternative workbook representation with file URL. |
| **Sheet** | Named sheet within a workbook. |
| **Cell** | Individual cell with value, formula, and formatting. |
| **Chart** | Chart configuration attached to a sheet. |
| **Macro** | VBA-like macro stored as code string. |
| **CellComment** | Comment thread on a cell. |
| **CellEditHistory** | Audit trail of cell value changes. |

### Dashboard Domain

| Entity | Description |
|--------|-------------|
| **Dashboard** | Dashboard layout with title, visibility, theme reference. |
| **DashboardWidget** | Individual widget (chart, KPI, table) with config and position. |
| **DashboardFilter** | Filter definition applied across dashboard. |
| **CrossFilterConfig** | Cross-widget filter linkage. |
| **DashboardTheme** | Visual theme (colors, typography). |
| **DataStream** | Real-time data stream connection. |
| **TvSession** | TV mode display session. |

### Reporting Domain

| Entity | Description |
|--------|-------------|
| **ReportDefinition** | Report template/definition with sections and mode. |
| **Report** | Generated report instance with data snapshot. |
| **ReportSchedule** | Cron schedule for automated report generation. |
| **DistributionConfig** | Multi-channel distribution config (email, SMS, webhook). |
| **DistributionRecord** | Record of each distribution attempt. |
| **ReportTemplate** | Reusable report template. |
| **VisualBaseline** | Baseline image for visual regression testing. |
| **InteractiveReport** | Interactive/drillable report version. |

### Presentation Domain

| Entity | Description |
|--------|-------------|
| **Presentation** | Slide deck with title, status, theme. |
| **Slide** | Individual slide with order and element list. |
| **SlideElement** | Element (text, image, chart, shape) on a slide. |
| **SlideTransition** | Transition effect between slides. |
| **ElementAnimation** | Animation on a slide element. |
| **Theme** | Presentation theme (colors, fonts, layouts). |
| **LiveSession** | Active presentation session with audience. |
| **CollaborationSession** | Multi-user editing session. |

### Localization Domain

| Entity | Description |
|--------|-------------|
| **LocalizationJob** | Translation job with source/target language and status. |
| **TranslationMemory** | Cached translation pairs for reuse. |
| **Glossary** | Domain-specific term glossary. |
| **GlossaryTerm** | Individual term with source and translated form. |
| **LocalizedContent** | Localized version of content. |
| **QualityReport** | Translation quality assessment. |

### AI Domain

| Entity | Description |
|--------|-------------|
| **AiSession** | Interactive AI session (chat, analysis). |
| **AiQuery** | Individual query within a session. |
| **KnowledgeBase** | Collection of documents for RAG. |
| **KnowledgeChunk** | Chunked and embedded text for vector search. |
| **VectorDocument** | Document with vector embedding for similarity search. |
| **FineTuneJob** | Fine-tuning job for custom models. |
| **AiRole** | Predefined AI persona/role. |
| **Prompt** | Prompt template with versioning. |
| **Scenario** | What-if scenario definition. |

### Governance Domain

| Entity | Description |
|--------|-------------|
| **Policy** | Governance policy with rules. |
| **WorkflowDefinition** | Multi-step approval workflow. |
| **RlsPolicy** | Row-level security policy for a table. |
| **FeatureFlag** | Feature toggle with targeting rules. |
| **Webhook** | Outbound webhook registration. |
| **ArchiveConfig** | Auto-archival configuration. |
| **BackupConfig** | Backup schedule and retention. |
| **SensitiveField** | Encrypted field registry. |
| **ComplianceCheck** | Compliance verification result. |
| **LoginAttempt** | Authentication attempt log. |
| **SecurityEvent** | Security-relevant event log. |

### Replication Domain

| Entity | Description |
|--------|-------------|
| **ReplicationJob** | Document replication job with fidelity score. |
| **ComparisonResult** | Pixel diff result between source and replica. |
| **FidelityReport** | Comprehensive fidelity assessment. |
| **PrintLock** | Locked rendering configuration for deterministic output. |
| **CorePrinciple** | Replication principle validation record. |
| **DualVerify** | Dual verification checkpoint. |

### Library Domain

| Entity | Description |
|--------|-------------|
| **LibraryAsset** | Digital asset (image, document, template) with metadata. |
| **Folder** | Hierarchical folder (self-referential parentId). |
| **Share** | Share record with permissions. |
| **SearchIndex** | Search index entry for full-text search. |

### Template Domain

| Entity | Description |
|--------|-------------|
| **Template** | Reusable template with category and content. |
| **TemplateVersion** | Versioned template content. |
| **MarketplaceTemplate** | Published template with pricing and ratings. |
| **TemplateCategory** | Template categorization. |

## Key Constraints & Indexes

- **Tenant isolation**: Every query-able model has a `tenantId` field
- **SyncSchedule.sourceId**: `@unique` constraint for upsert operations
- **User.email**: Unique per tenant
- **Timestamps**: All models use `createdAt`/`updatedAt` with `@default(now())`/`@updatedAt()`
- **Soft deletes**: Some models use `deletedAt` nullable timestamp
- **JSON fields**: Prisma `Json` type used extensively for flexible schema (widget configs, metadata, etc.)

## Database Connection

```
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
```

All services share the same PostgreSQL instance but manage their own Prisma schemas. Migrations are run per-service via `prisma migrate deploy`.
