# Rasid Platform - Data Flow Documentation

## Overview

This document describes how data flows through the Rasid platform, from ingestion to processing to output. See `diagrams/dataflows.mmd` for visual sequence diagrams.

---

## 1. Request Lifecycle

Every API request follows this pipeline:

```
1. Client sends HTTP request to Nginx (:80)
2. Nginx applies:
   - Rate limiting (100r/s per IP, burst 50)
   - Gzip compression
   - Security headers (X-Frame-Options, X-Content-Type-Options, etc.)
   - Request ID injection (X-Request-ID)
3. Nginx proxies to upstream service based on URL path:
   - /api/data/*     -> data-service:8001
   - /api/excel/*    -> excel-service:8002
   - /api/dashboard/* -> dashboard-service:8003
   - /api/reporting/* -> reporting-service:8004
   - /api/presentation/* -> presentation-service:8005
   - /api/infographic/* -> infographic-service:8006
   - /api/replication/* -> replication-service:8007
   - /api/localization/* -> localization-service:8008
   - /api/ai/*       -> ai-service:8009
   - /api/governance/* -> governance-service:8010
   - /api/library/*  -> library-service:8011
   - /api/template/* -> template-service:8012
   - /api/conversion/* -> conversion-service:8013
   - /*              -> frontend:3000 (catch-all)
4. Service Express app processes:
   a. Helmet security headers
   b. CORS validation
   c. Body parsing (JSON, 50MB limit)
   d. Per-service rate limiter
   e. Route matching
   f. Auth middleware: JWT verification, attach req.user
   g. Tenant middleware: extract tenantId, attach req.tenant
   h. Zod validation: validate request body/params
   i. Controller: thin handler, delegates to service
   j. Service class: business logic, database queries
   k. Data layer: Prisma (PostgreSQL), Redis (cache), ES (search)
5. Response returned as JSON with standard format
6. Error handler catches any unhandled errors
```

---

## 2. Document Ingestion Pipeline

**Service**: data-service (E01)

### Flow: File Upload -> Parsed Data

```
Step 1: Upload
  - Client POSTs file to /api/v1/data/reading/upload
  - File stored in MinIO object storage
  - IngestionJob created in database (status: pending)

Step 2: Classification
  - classification.service detects file type by extension + magic bytes
  - Supported: PDF, DOCX, XLSX, CSV, JSON, XML, PNG, JPG, TXT, PPTX, HTML
  - File routed to appropriate parser

Step 3: Parsing
  - reading.service dispatches to format-specific parser:
    - PDF: pdf-parse for text, Tesseract for scanned pages
    - DOCX: mammoth for content extraction
    - XLSX: exceljs for cell/formula extraction
    - CSV: papaparse for row parsing
    - Images: sharp for metadata, Tesseract.js for OCR
    - ZIP/archives: adm-zip for extraction, recursive processing

Step 4: Structure Extraction
  - tables.service extracts tabular structures
  - columns.service infers column types (numeric, date, text, etc.)
  - Metadata extracted (author, creation date, page count, etc.)

Step 5: Storage
  - Dataset created in PostgreSQL
  - DatasetColumn records for each detected column
  - DataRow records with JSON data
  - Full text indexed in Elasticsearch
  - IngestionJob updated (status: completed)

Step 6: Quality Check
  - data-quality.service runs automated checks:
    - Completeness (null/missing values)
    - Uniqueness (duplicate detection)
    - Validity (type conformance)
    - Consistency (cross-column rules)
  - DataQualityCheck records stored
```

---

## 3. Excel Processing Pipeline

**Service**: excel-service (E02)

### Flow: Formula Evaluation

```
Step 1: User submits formula expression
Step 2: formula-engine.service parses formula string
Step 3: Formula resolved against cell references via cellValues Map
Step 4: Result computed using registered formula functions (106+)
Step 5: Categories: math-trig, statistical, lookup-reference, text,
        date-time, logical, financial, information, dynamic-array

Batch Processing:
- formula-workers.service evaluates batches of expressions
- Each expression evaluated independently
- Results returned with original IDs for mapping

Formula Intelligence:
- formula-intelligence.service simplifies redundant patterns:
  - IF(A1>5, TRUE, FALSE) -> A1>5
  - Nested IF -> IFS suggestion
  - Redundant wrappers removed
```

### Flow: Data Matching (E06)

```
Step 1: User defines match columns with config:
  { sourceColumn, targetColumn, matchType, threshold, caseSensitive }

Step 2: Match types:
  - exact: Character-for-character comparison
  - fuzzy: Levenshtein/Jaro-Winkler distance
  - contains: Substring matching
  - regex: Regular expression patterns

Step 3: matching.service executes match:
  - For each source row, find matching target rows
  - Score each match (0.0 - 1.0)
  - Return FuzzyMatchResult[] with scores

Step 4: Deduplication:
  - Group duplicate rows by matching key
  - Return DeduplicationResult with counts and groups
```

---

## 4. Dashboard Generation Pipeline

**Service**: dashboard-service (E03)

### Flow: Auto-Generate Dashboard

```
Step 1: User selects dataset and requests auto-generation
Step 2: auto-dashboard-generator.service analyzes dataset:
  - Column types (numeric -> charts, categorical -> filters)
  - Data distribution (skewed -> histogram, time series -> line chart)
  - Cardinality (low cardinality -> pie, high -> bar)
Step 3: Widget selection based on data characteristics
Step 4: Layout engine arranges widgets in responsive grid
Step 5: Theme engine applies brand colors and typography
Step 6: Dashboard saved with DashboardWidget records
Step 7: Real-time engine sets up live data bindings (optional)
```

---

## 5. Report Generation Pipeline

**Service**: reporting-service (E04)

### Flow: Scheduled Report

```
Step 1: User creates ReportDefinition with schedule (cron)
Step 2: ReportSchedule stored with execution config
Step 3: On schedule trigger:
  a. data-source.service fetches latest data
  b. report-builder.service assembles sections
  c. ai-narrative.service generates text narratives (optional)
  d. chart-renderer.service renders charts as images
  e. template-engine.service applies template layout
  f. Report saved with generated timestamp
Step 4: Distribution:
  a. distribution.service reads DistributionConfig
  b. Email: SMTP delivery with attachment
  c. SMS: sms-delivery.service sends notification
  d. Webhook: HTTP POST to configured URL
Step 5: DistributionRecord logged for each delivery attempt
Step 6: visual-regression.service compares with baseline (optional)
```

---

## 6. Presentation Generation Pipeline

**Service**: presentation-service (E05)

### Flow: AI-Generated Slides

```
Step 1: User provides topic/data source
Step 2: source-processor.service extracts key data points
Step 3: ai-slide-generator.service generates slide structure:
  - Title slide
  - Data slides (charts, tables)
  - Summary slide
Step 4: ai-content-generator.service creates:
  - Slide titles and bullet points
  - Speaker notes
  - Chart descriptions
Step 5: design-engine.service applies theme:
  - Color palette
  - Font selection
  - Layout grid
Step 6: animation-engine.service adds:
  - Slide transitions
  - Element entrance animations
Step 7: Slides stored as Slide + SlideElement records
Step 8: export-share.service enables export to PPTX/PDF/HTML
```

---

## 7. Document Replication Pipeline

**Service**: replication-service (E07 + rendering-environment)

### Flow: Pixel-Perfect Replication

```
Step 1: Upload source document (PDF/image)
Step 2: visual-analyzer.service extracts:
  - Page dimensions
  - Bounding boxes for all elements
  - Z-ordering (layer stacking)

Step 3: style-extractor.service identifies:
  - Font families (via font-recognition.service)
  - Font sizes and weights
  - Colors (fill, stroke, text)
  - Spacing (margins, padding, line height)

Step 4: data-extraction.service captures:
  - Text content with positions
  - Table structures
  - Image regions

Step 5: replica-builder.service constructs:
  - HTML document matching source layout
  - Embedded fonts and colors
  - Positioned elements

Step 6: Rendering (rendering-environment:8014):
  - layout-generation-controller.service sends HTML
  - Chromium renders at 150 DPI
  - Network blocked for determinism
  - Font hinting: full, anti-aliasing: off

Step 7: Pixel Validation Loop:
  - pixel-validation-loop.service compares:
    source image vs rendered image
  - Uses pixelmatch for pixel-by-pixel diff
  - If diff > threshold:
    - Adjust styles (font size, spacing)
    - Re-render and re-compare
    - Loop up to N iterations
  - FidelityReport generated with:
    - pixelDiff count
    - diffPercentage
    - isPerfect (boolean)
    - diffImage (highlighted differences)

Step 8: PrintLock:
  - Once validated, PrintLock record created
  - Locks font config, layout config
  - Prevents further modifications
```

---

## 8. Translation Pipeline

**Service**: localization-service (E07)

### Flow: Document Translation

```
Step 1: User submits document with source/target languages
Step 2: LocalizationJob created (status: processing)

Step 3: Content Extraction:
  - Translation units extracted from document structure
  - Inline formatting preserved (bold, italic, etc.)

Step 4: Glossary Lookup:
  - glossary-manager.service checks domain glossary
  - Known terms are pre-mapped for consistency
  - TranslationMemory checked for existing translations

Step 5: AI Translation:
  - translation-engine.service sends to OpenAI GPT-4o
  - Context includes: glossary terms, domain, style guide
  - Preserves placeholders and variables

Step 6: Quality Assurance:
  - quality-assurance.service validates:
    - Terminology consistency
    - Length constraints
    - Grammar and fluency
    - Missing translations
  - QualityReport generated with scores

Step 7: RTL Processing:
  - rtl-engine.service transforms layout:
    - Text direction (RTL for Arabic)
    - Alignment (right-aligned)
    - Bidirectional text handling
    - Number and date format localization

Step 8: arabic-typography.ts optimizes:
  - Arabic text shaping
  - Font selection for Arabic rendering
  - Ligature handling

Step 9: Results stored:
  - LocalizedContent record
  - TranslationMemory updated for future reuse
  - LocalizationJob updated (status: completed)
```

---

## 9. Format Conversion Pipeline

**Service**: conversion-service (E08)

### Flow: Universal Conversion

```
Step 1: User uploads file and selects target format
Step 2: ConversionJob created (status: processing)

Step 3: Source Analysis:
  - matrix.service checks conversion matrix for valid path
  - converter.service selects conversion strategy:
    - Direct conversion (e.g., XLSX -> CSV)
    - Multi-step conversion (e.g., PDF -> OCR -> Text -> DOCX)
    - Via canonical format (UDR: Universal Document Representation)

Step 4: Extraction:
  - document-extraction-engine.service extracts structure
  - OCR if scanned (ocr-engine.service)
  - Format-specific parsers applied

Step 5: Canonical Representation:
  - canonical-document.service creates UDR
  - Layout, text, tables, images normalized

Step 6: Target Generation:
  - format-converter.service generates target format
  - format-preservation.service ensures layout fidelity
  - arabic-rtl-conversion.service handles RTL for Arabic

Step 7: Output Storage:
  - ConversionJob updated with output path
  - File stored in MinIO
  - Status: completed

Batch Mode:
  - batch-conversion-pipeline.service handles queued jobs
  - batch-converter.service processes in parallel
  - Progress tracking per file
```

---

## 10. AI Query Pipeline

**Service**: ai-service (E09)

### Flow: RAG-Based Query

```
Step 1: User sends natural language query
Step 2: AiSession created or resumed

Step 3: Query Processing:
  - nlp-engine.service analyzes query intent
  - sql-preview.service generates SQL if data query detected
  - embedding-engine.service generates query vector

Step 4: RAG Retrieval:
  - rag-engine.service searches KnowledgeChunks
  - Vector similarity search on embeddings
  - Top-K relevant chunks retrieved

Step 5: AI Generation:
  - OpenAI GPT-4o called with:
    - System prompt (from prompt-management.service)
    - Retrieved context chunks
    - User query
    - Conversation history
  - confidence-score.service calibrates response confidence

Step 6: Response stored:
  - AiQuery record with query + response
  - AiSession updated

Specialized Modes:
  - predictive-analytics.service: trend forecasting
  - anomaly-pattern.service: anomaly detection
  - what-if.service: scenario simulation
  - data-stress-test.service: data validation stress testing
```
