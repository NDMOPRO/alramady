# Rasid Platform - Module Documentation

## E01: Data Service (data-service, :8001)

### Purpose
Core data ingestion, processing, quality assurance, and management engine. Handles all file types, external connectors, data pipelines, and KPI registries.

### Route Modules (18)
| Route File | Mount Path | Description |
|-----------|-----------|-------------|
| capacity.routes.ts | /api/v1/data/capacity | Storage quota and capacity management |
| classification.routes.ts | /api/v1/data/classification | File type detection and classification |
| reading.routes.ts | /api/v1/data/reading | File content reading and parsing |
| columns.routes.ts | /api/v1/data/columns | Column analysis and type inference |
| tables.routes.ts | /api/v1/data/tables | Table structure extraction |
| visual-processing.routes.ts | /api/v1/data/visual-processing | Image/OCR processing |
| mixed-files.routes.ts | /api/v1/data/mixed-files | Multi-file/multi-format ingestion |
| connectors.routes.ts | /api/v1/data/connectors | External data source connectors |
| data.routes.ts | /api/v1/data | Core CRUD + export operations |
| import.routes.ts | /api/v1/data/import | Data import from various formats |
| sources.routes.ts | /api/v1/data/sources | Data source management |
| cleansing.routes.ts | /api/v1/data/cleansing | Data cleaning and normalization |
| kpi-registry.routes.ts | /api/v1/data/kpi-registry | KPI definition and calculation |
| scheduled-sync.routes.ts | /api/v1/data/scheduled-sync | Automated data synchronization |
| resumable-upload.routes.ts | /api/v1/data/resumable-upload | Large file resumable uploads |
| knowledge-graph.routes.ts | /api/v1/data/knowledge-graph | Knowledge graph construction |
| data-pipeline.routes.ts | /api/v1/data/pipeline | ETL pipeline management |
| data-catalog.routes.ts | /api/v1/data/catalog | Data catalog and lineage |

### Service Classes (27)
| Service | Responsibility |
|---------|---------------|
| capacity.service | Storage quota tracking and enforcement |
| classification.service | ML-based file type classification |
| reading.service | Universal file reading (PDF, Word, Excel, CSV, etc.) |
| columns.service | Column type inference and statistics |
| tables.service | Table detection and extraction from documents |
| visual-processing.service | Image analysis and OCR integration |
| mixed-files.service | Multi-format batch processing |
| file-ingestion.service | File upload handling, metadata extraction |
| import.service | Data import orchestration |
| sources.service | External source connection management |
| cleansing.service | Data cleaning rules and execution |
| data-cleansing.service | Advanced data normalization |
| data-export.service | Multi-format data export (CSV, Excel, JSON) |
| data-merge.service | Dataset merging and concatenation |
| data-parsing.service | Format-specific parsing logic |
| data-pipeline.service | ETL pipeline execution |
| data-quality.service | Data quality scoring and validation |
| data-scheduler.service | Scheduled job management |
| data-search.service | Elasticsearch-powered search |
| data-transformation.service | Column transformations and calculations |
| data-versioning.service | Dataset version tracking |
| data-visualization.service | Chart/graph data preparation |
| knowledge-graph.service | Entity extraction and graph construction |
| kpi-registry.service | KPI definition, calculation, versioning |
| resumable-upload.service | Chunked upload management |
| scheduled-sync.service | Cron-based data synchronization |
| data-catalog.service | Data catalog, lineage, dictionary |

### Connectors
| Connector | Description |
|-----------|-------------|
| connector-registry.ts | Central registry for all connectors |
| google-analytics.connector.ts | Google Analytics data import |
| notion.connector.ts | Notion workspace integration |

### Key Dependencies
PostgreSQL, Redis, Elasticsearch, MinIO, Tesseract.js, mammoth, adm-zip, sharp

---

## E02: Excel Service (excel-service, :8002)

### Purpose
Professional Excel processing engine with 106+ formula functions, pivot tables, formatting, matching, and AI-assisted intelligence.

### Route Modules (10)
| Route File | Description |
|-----------|-------------|
| excel.routes.ts | Core workbook CRUD operations |
| formulas.routes.ts | Formula parsing and evaluation |
| formula-v2.routes.ts | Advanced formula engine v2 |
| formatting.routes.ts | Cell and range formatting |
| professional-formatting.routes.ts | Advanced conditional formatting |
| matching.routes.ts | Data matching (exact, fuzzy, regex) |
| excel-matching.routes.ts | Cross-workbook matching |
| modes.routes.ts | Easy/Advanced mode switching |
| modes-v2.routes.ts | Enhanced mode operations |
| spreadsheet.routes.ts | Low-level spreadsheet operations |

### Service Classes (25)
| Service | Responsibility |
|---------|---------------|
| formula-engine.service | Core formula parser and evaluator |
| formula-workers.service | Batch formula evaluation |
| formula-intelligence.service | Formula simplification and optimization |
| formula-functions/ | 106+ Excel function implementations |
| spreadsheet-engine.service | Cell-level spreadsheet operations |
| spreadsheet.service | High-level workbook management |
| formatting.service | Cell formatting (fonts, colors, borders) |
| professional-formatting.service | Conditional formatting rules |
| cultural-formatting.service | Arabic/Saudi number and date formats |
| matching.service | Row-level data matching |
| excel-matching.service | Cross-file matching with deduplication |
| pivot-table.service | Pivot table generation and aggregation |
| chart-builder.service | Chart generation from data ranges |
| collaboration.service | Multi-user editing |
| import-export.service | Excel file import/export (xlsx, csv) |
| conversion.service | Format conversion utilities |
| macro-engine.service | Macro recording and execution |
| monte-carlo.service | Monte Carlo simulation |
| ai-integration.service | AI-powered formula suggestions |
| table-intelligence.service | Smart table analysis |
| accuracy-audit.service | Data accuracy validation |
| advanced-operations.service | Solver, goal seek, scenarios |
| document-structure.service | Workbook structure analysis |
| fingerprint.service | Document fingerprinting |
| modes.service | Easy/Advanced mode logic |

---

## E03: Dashboard Service (dashboard-service, :8003)

### Purpose
Interactive dashboard builder with drag-drop widgets, KPI displays, real-time updates, TV mode, and theme management.

### Route Modules (10)
| Route File | Description |
|-----------|-------------|
| dashboard.routes.ts | Dashboard CRUD |
| auto-dashboard.routes.ts | AI auto-generated dashboards |
| easy-mode.routes.ts | Simplified dashboard creation |
| advanced-mode.routes.ts | Full control dashboard editing |
| drag-elements.routes.ts | Drag-and-drop widget placement |
| full-editor.routes.ts | Full layout editor |
| post-edit.routes.ts | Post-generation editing |
| template-library.routes.ts | Dashboard template management |
| performance.routes.ts | Performance monitoring dashboards |
| external-simulation.routes.ts | What-if scenario simulation |

### Service Classes (21)
| Service | Responsibility |
|---------|---------------|
| dashboard.service | Core dashboard CRUD |
| dashboard-builder.service | Layout construction |
| auto-dashboard-generator.service | AI-powered auto-generation |
| widget-engine.service | Widget rendering and data binding |
| chart-engine.service | Chart widget rendering |
| kpi-engine.service | KPI widget calculation |
| filter-engine.service | Dashboard filter application |
| cross-filter.service | Cross-widget filtering |
| theme-engine.service | Theme application and management |
| export-engine.service | Dashboard export (PDF, image) |
| realtime-engine.service | Live data streaming |
| tv-mode.service | TV display mode |
| dashboard-link.service | Inter-dashboard linking |
| drag-elements.service | Drag-drop position management |
| easy-mode.service | Simplified creation wizard |
| advanced-mode.service | Full editor functionality |
| full-editor.service | Canvas-based editing |
| post-edit.service | Post-generation modifications |
| template-library.service | Template CRUD |
| performance.service | Performance metrics |
| external-simulation.service | Scenario simulation |

---

## E04: Reporting Service (reporting-service, :8004)

### Purpose
Professional report generation, scheduling, distribution, and visual regression testing.

### Service Classes (21)
| Service | Responsibility |
|---------|---------------|
| report-builder.service | Report layout and content assembly |
| template-engine.service | Report template rendering |
| ai-narrative.service | AI-generated narrative text |
| chart-intelligence.service | Smart chart selection |
| chart-renderer.service | Chart image generation |
| data-source.service | Report data source management |
| specialized-reports.service | Domain-specific report types |
| report-type-registry.service | Report type configuration |
| report-diff.service | Report version comparison |
| report-lock.service | Report approval locking |
| scheduled-reports.service | Cron-based report generation |
| compare-schedule.service | Scheduled report comparisons |
| distribution.service | Multi-channel distribution (email, SMS) |
| sms-delivery.service | SMS notification delivery |
| interactive-report.service | Interactive/drillable reports |
| visual-regression.service | Visual comparison between report versions |
| easy-mode.service | Simplified report creation |
| advanced-mode.service | Full report editor |
| post-edit.service | Post-generation editing |
| template-library.service | Report template library |
| external-simulation.service | What-if scenarios |

---

## E05: Presentation Service (presentation-service, :8005)

### Purpose
AI-powered presentation generation, animation engine, live collaboration, and multi-source content.

### Service Classes (29)
Key services include:
- **ai-slide-generator.service**: AI-powered slide content and layout generation
- **ai-content-generator.service**: AI text and image content creation
- **design-engine.service**: Slide design and theming
- **animation-engine.service**: Slide transitions and element animations
- **slide-builder.service**: Core slide construction
- **template-manager.service**: Presentation template management
- **source-processor.service**: Multi-source data ingestion
- **collaboration.service**: Real-time multi-user editing
- **live-presentation.service**: Live presentation mode with audience tracking
- **export-share.service**: Export to PPTX, PDF, HTML, video
- **image-to-ppt.service**: Convert images to editable slides
- **interactive-html-export.service**: Interactive HTML5 export
- **multi-format-generator.service**: Multi-format batch export
- **video-element.service**: Video embedding in slides
- **password-protection.service**: Presentation access control
- **qr-code.service**: QR code generation for sharing
- **presenter-timer.service**: Presentation timing management
- **audience-tracker.service**: Audience engagement analytics
- **embed.service**: Embeddable presentation widgets
- **media-search.service**: Stock media search integration

---

## E07: Localization Service (localization-service, :8008)

### Purpose
Arabic-first translation, RTL layout engine, typography optimization, and quality assurance.

### Service Classes (12)
| Service | Responsibility |
|---------|---------------|
| translation-engine.service | Core translation via OpenAI |
| content-localization.service | Content adaptation for target locale |
| glossary-manager.service | Domain glossary management |
| import-export.service | Translation file import/export (XLIFF, PO) |
| layout-preserving-translation.service | Translate while preserving layout |
| quality-assurance.service | Translation quality scoring |
| rtl-engine.service | RTL layout transformation |
| arabic-typography.ts | Arabic text shaping and typography |
| data-localization.ts | Data format localization (dates, numbers) |
| language-intelligence.ts | Language detection and analysis |
| quality-gate.ts | Quality gate enforcement |
| rtl-layout.ts | RTL layout rules and adjustments |

---

## E08: Conversion Service (conversion-service, :8013)

### Purpose
Universal format conversion, OCR, batch processing, and document intelligence.

### Service Classes (23)
Key services include:
- **converter.service**: Core format conversion orchestration
- **format-converter.service**: Format-specific converters
- **core.service**: Common conversion utilities
- **universal.service**: Universal document reader
- **ocr-engine.service**: OCR processing (Tesseract)
- **pdf-intelligence.service**: PDF structure analysis
- **pdf-to-excel.service**: PDF table extraction to Excel
- **word-to-powerpoint.service**: DOCX to PPTX conversion
- **presentation-to-video.service**: PPTX to video
- **image-processor.service**: Image format conversion and optimization
- **image-to-structured-data.service**: Image to table/data extraction
- **batch-conversion-pipeline.service**: Multi-file batch conversion
- **batch-converter.service**: Parallel batch execution
- **document-merger.service**: Multi-document merging
- **canonical-document.service**: Canonical document representation
- **arabic-rtl-conversion.service**: Arabic-specific conversion handling
- **audio-transcription.service**: Audio to text (Whisper)
- **legal-archival.service**: PDF/A archival format
- **format-preservation.service**: Layout fidelity during conversion
- **extended-formats.service**: Additional format support
- **udr.service**: Universal Document Representation
- **document-extraction-engine.service**: Deep content extraction
- **matrix.service**: Conversion matrix and routing

---

## E09: AI Intelligence Service (ai-service, :8009)

### Purpose
AI-powered analysis, NLP, RAG (Retrieval-Augmented Generation), predictive analytics, and document intelligence.

### Service Classes (26)
Key services include:
- **nlp-engine.service / nlp.service**: Natural language processing
- **rag-engine.service / rag.service**: RAG pipeline for knowledge-based Q&A
- **embedding-engine.service**: Vector embedding generation
- **free-query.service**: Natural language data querying
- **sql-preview.service**: NL-to-SQL conversion
- **data-analysis-ai.service**: AI-powered data analysis
- **predictive-analytics.service**: Trend prediction and forecasting
- **anomaly-pattern.service**: Anomaly detection
- **confidence-score.service**: AI confidence calibration
- **temporal-gradient.service**: Time-series analysis
- **document-intelligence.service**: Document understanding and summarization
- **generative-ai.service**: Content generation
- **data-stress-test.service**: Data validation stress testing
- **what-if.service**: Scenario simulation
- **fine-tuning.service**: Model fine-tuning pipeline
- **training-pipeline.service**: Custom model training
- **prompt-management.service**: Prompt template management
- **layout-intelligence.service**: Visual layout analysis via AI
- **agents/**: AI agent implementations

---

## E10: Governance Service (governance-service, :8010)

### Purpose
Authentication, authorization, RBAC, audit logging, compliance, workflows, encryption, and administrative operations.

### Service Classes (40)
This is the largest service by class count. Key services include:

**Authentication & Access**
- **auth.service / authentication.service**: Login, registration, JWT issuance
- **authorization.service**: Permission checking
- **access-control.service**: ABAC/RBAC enforcement
- **sso.service**: Single Sign-On (SAML/OIDC)
- **ldap.service**: LDAP/Active Directory integration

**Security**
- **cell-encryption.service**: Field-level encryption
- **pii-redactor.service**: PII detection and redaction
- **security-scanner.service**: Security vulnerability scanning
- **prompt-injection-guard.service**: AI prompt injection prevention
- **rls.service**: Row-level security policies

**Compliance & Audit**
- **audit.service**: Comprehensive audit logging
- **compliance.service**: Regulatory compliance checks
- **policy-engine.service**: Policy definition and enforcement
- **data-governance.service**: Data governance rules

**Collaboration & Workflow**
- **workflow.service**: Approval workflow engine
- **make-workflow.service**: Workflow builder
- **collaboration-engine.service**: Real-time collaboration
- **comments.service**: Document commenting
- **sharing.service**: Sharing and access management

**Operations**
- **backup.service**: Database backup management
- **auto-archive.service**: Automated data archival
- **feature-flags.service**: Feature flag management
- **webhook.service**: Webhook management and delivery
- **notification.service**: Multi-channel notifications
- **sms-notification.service**: SMS delivery
- **undo-redo.service**: Operation undo/redo
- **offline-sync.service**: Offline-first sync
- **admin-copilot.service**: AI-powered admin assistant
- **ai-shutdown.service**: AI safety controls
- **kpi-approval.service**: KPI approval workflows
- **number-freeze.service**: Financial period freezing
- **sensitive-action-approval.service**: Approval for sensitive operations

---

## Support: Infographic Service (infographic-service, :8006)

### Purpose
AI-powered infographic generation with vector graphics, data visualization, and icon libraries.

### Service Classes (7)
| Service | Responsibility |
|---------|---------------|
| infographic-builder.service | Infographic layout construction |
| ai-infographic.service | AI-powered design generation |
| data-viz-engine.service | Data visualization rendering |
| layout-engine.service | Layout algorithm (grid, flow, etc.) |
| icon-library.service | Icon search and management |
| vector-reconstruction.service | Vector graphics reconstruction |
| professional.ts | Professional design templates |

---

## Support: Replication Service (replication-service, :8007)

### Purpose
Pixel-perfect document replication with visual analysis, style extraction, and validation loops.

### Service Classes (22)
| Service | Responsibility |
|---------|---------------|
| canonical-pipeline-orchestrator.service | End-to-end replication pipeline |
| visual-analyzer.service | Visual layout analysis |
| style-extractor.service | Font, color, spacing extraction |
| font-recognition.service | Font identification |
| data-extraction.service | Content extraction from source |
| replica-builder.service | Replica document construction |
| layout-generation-controller.service | HTML layout generation |
| pixel-validation-loop.service | Iterative pixel comparison |
| comparison-engine.service | Source vs replica comparison |
| side-by-side-comparison.service | Visual side-by-side view |
| quality-validation.service | Quality scoring |
| large-image-processor.service | Large format processing |
| arabic-typography-optimizer.service | Arabic text rendering optimization |
| arabic-localization.service | Arabic-specific adjustments |
| pdf-intelligence.service | PDF structure understanding |
| data-binding.service | Dynamic data binding to templates |
| core-principle.ts | Core replication principles |
| dual-verify.ts | Dual verification process |
| image-matching.ts | Image comparison algorithms |
| match-phases.ts | Multi-phase matching pipeline |
| match-scope.ts | Match scope configuration |
| print-lock.ts | Print-locked document handling |

---

## Support: Library Service (library-service, :8011)

### Purpose
Digital asset management, media library, metadata extraction, and search.

### Service Classes (7)
| Service | Responsibility |
|---------|---------------|
| asset-manager.service | Asset lifecycle management |
| asset.service | Asset CRUD operations |
| folder-manager.service | Folder hierarchy management |
| metadata-engine.service | Metadata extraction and indexing |
| search-engine.service | Elasticsearch-powered asset search |
| sharing.service | Asset sharing and access control |
| media-library.ts | Media-specific operations |

---

## Support: Template Service (template-service, :8012)

### Purpose
Template marketplace, version control, theme management, and publishing workflows.

### Service Classes (5)
| Service | Responsibility |
|---------|---------------|
| template.service | Core template CRUD |
| template-manager.service | Template lifecycle management |
| marketplace.service | Template marketplace |
| version-control.service | Template versioning |
| templates-themes.ts | Theme management |

---

## Support: Rendering Environment (rendering-environment, :8014)

### Purpose
Deterministic HTML-to-image rendering using headless Chromium for pixel-perfect document validation.

### Single Module (index.ts)
- Persistent Chromium browser instance
- HTML-to-image rendering (PNG/JPEG/WebP)
- Pixel-by-pixel comparison with pixelmatch
- Font listing and validation
- Configurable DPI, antialiasing, color space
- Network isolation during rendering
- 4GB memory limit, 2 CPU cores

---

## Shared Package (@rasid/shared)

### Purpose
Common types, constants, and utilities shared across all services.

### Contents
- Zod validation schemas
- Winston logger configuration
- JWT utilities
- Express middleware types
- Redis client helpers
- UUID generation
- Common TypeScript interfaces
