# Rasid Platform - API Documentation

## API Overview

All APIs follow RESTful conventions, are versioned under `/api/v1/`, require JWT authentication (unless noted), and return JSON responses.

### Base URL Pattern
```
https://{domain}/api/{service-prefix}/...
```

### Common Headers
| Header | Required | Description |
|--------|----------|-------------|
| Authorization | Yes | `Bearer <JWT token>` |
| Content-Type | Yes (POST/PUT) | `application/json` |
| X-Tenant-Id | Optional | Override tenant from JWT |
| X-Request-ID | Optional | Request correlation ID |
| X-API-Version | Optional | API version override |

### Common Response Format
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

### Error Response Format
```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": [ ... ]
}
```

### Standard Error Codes
| HTTP | Code | Description |
|------|------|-------------|
| 400 | VALIDATION_ERROR | Zod schema validation failed |
| 401 | AUTH_MISSING_HEADER | No Authorization header |
| 401 | AUTH_TOKEN_EXPIRED | JWT has expired |
| 401 | AUTH_TOKEN_INVALID | JWT verification failed |
| 403 | AUTH_FORBIDDEN | Insufficient role/permissions |
| 400 | TENANT_MISSING | No tenant ID in JWT or header |
| 404 | NOT_FOUND | Resource not found |
| 429 | RATE_LIMIT_EXCEEDED | Too many requests |
| 500 | INTERNAL_ERROR | Server error |

---

## Health Endpoints (All Services)

```
GET /health
```
Returns service health including DB connection, Redis status, memory usage, uptime.

```
GET /api/v1/{service}/ready
```
Returns readiness status (boolean).

---

## E01: Data Service (`/api/data/`)

### File Operations
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/data/reading/upload | Upload and parse a file |
| POST | /api/v1/data/reading/read | Read file content by ID |
| GET | /api/v1/data/reading/formats | List supported formats |
| POST | /api/v1/data/classification/classify | Classify file type |
| POST | /api/v1/data/visual-processing/process | Process images/OCR |
| POST | /api/v1/data/mixed-files/process | Process multi-format batch |

### Data Management
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/data/datasets | List datasets |
| POST | /api/v1/data/datasets | Create dataset |
| GET | /api/v1/data/datasets/:id | Get dataset |
| PUT | /api/v1/data/datasets/:id | Update dataset |
| DELETE | /api/v1/data/datasets/:id | Delete dataset |
| POST | /api/v1/data/export | Export data (CSV/Excel/JSON) |
| POST | /api/v1/data/import/upload | Import data from file |

### Columns & Tables
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/data/columns/:datasetId | Get column definitions |
| POST | /api/v1/data/columns/analyze | Analyze column types |
| POST | /api/v1/data/tables/detect | Detect tables in document |
| POST | /api/v1/data/tables/extract | Extract table data |

### Data Quality & Cleansing
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/data/cleansing/rules | Apply cleansing rules |
| GET | /api/v1/data/cleansing/profiles/:id | Get data profile |

### Connectors
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/data/connectors | List available connectors |
| POST | /api/v1/data/connectors/connect | Connect to external source |
| POST | /api/v1/data/connectors/sync | Sync data from source |

### KPI Registry
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/data/kpi-registry | List KPIs |
| POST | /api/v1/data/kpi-registry | Create KPI |
| GET | /api/v1/data/kpi-registry/:id | Get KPI |
| PUT | /api/v1/data/kpi-registry/:id | Update KPI |
| POST | /api/v1/data/kpi-registry/:id/calculate | Calculate KPI value |

### Pipelines & Scheduling
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/data/pipeline | Create data pipeline |
| POST | /api/v1/data/pipeline/:id/execute | Execute pipeline |
| POST | /api/v1/data/scheduled-sync/schedule | Schedule sync job |
| POST | /api/v1/data/resumable-upload/init | Initialize resumable upload |
| POST | /api/v1/data/resumable-upload/chunk | Upload chunk |

### Knowledge Graph & Catalog
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/data/knowledge-graph/build | Build knowledge graph |
| GET | /api/v1/data/knowledge-graph/:id | Get graph |
| GET | /api/v1/data/catalog | Browse data catalog |
| GET | /api/v1/data/catalog/lineage/:id | Get data lineage |

### Capacity
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/data/capacity | Get storage capacity |
| GET | /api/v1/data/capacity/usage | Get current usage |

---

## E02: Excel Service (`/api/excel/`)

### Workbook Operations
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/excel/workbooks | Create workbook |
| GET | /api/v1/excel/workbooks/:id | Get workbook |
| PUT | /api/v1/excel/workbooks/:id | Update workbook |
| POST | /api/v1/excel/workbooks/import | Import Excel file |
| POST | /api/v1/excel/workbooks/:id/export | Export workbook |

### Formula Engine
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/excel/formulas/evaluate | Evaluate formula |
| POST | /api/v1/excel/formulas/batch | Batch evaluate formulas |
| POST | /api/v1/excel/formulas/simplify | Simplify formula |
| GET | /api/v1/excel/formulas/functions | List 106+ functions |

### Formatting
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/excel/formatting/cells | Apply cell formatting |
| POST | /api/v1/excel/formatting/conditional | Set conditional formatting |
| POST | /api/v1/excel/formatting/styles | Apply named styles |

### Matching (E06)
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/excel/matching/exact | Exact row matching |
| POST | /api/v1/excel/matching/fuzzy | Fuzzy matching with threshold |
| POST | /api/v1/excel/matching/deduplicate | Remove duplicate rows |
| POST | /api/v1/excel/matching/cross-file | Match across workbooks |

### Spreadsheet Operations
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/excel/spreadsheet/pivot | Generate pivot table |
| POST | /api/v1/excel/spreadsheet/charts | Create chart |
| POST | /api/v1/excel/spreadsheet/sort | Sort data range |
| POST | /api/v1/excel/spreadsheet/filter | Filter data range |

---

## E03: Dashboard Service (`/api/dashboard/`)

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/dashboard/dashboards | Create dashboard |
| GET | /api/v1/dashboard/dashboards | List dashboards |
| GET | /api/v1/dashboard/dashboards/:id | Get dashboard |
| PUT | /api/v1/dashboard/dashboards/:id | Update dashboard |
| DELETE | /api/v1/dashboard/dashboards/:id | Delete dashboard |
| POST | /api/v1/dashboard/auto-generate | AI auto-generate dashboard |
| POST | /api/v1/dashboard/widgets | Add widget |
| PUT | /api/v1/dashboard/widgets/:id | Update widget |
| POST | /api/v1/dashboard/drag-elements/reorder | Reorder elements |
| POST | /api/v1/dashboard/easy-mode/create | Easy mode creation |
| POST | /api/v1/dashboard/full-editor/save | Save full editor state |
| POST | /api/v1/dashboard/post-edit/apply | Apply post-edit changes |
| GET | /api/v1/dashboard/templates | List dashboard templates |
| POST | /api/v1/dashboard/performance/analyze | Analyze dashboard performance |
| POST | /api/v1/dashboard/external-simulation/run | Run what-if simulation |

---

## E04: Reporting Service (`/api/reporting/`)

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/reporting/reports | Create report definition |
| GET | /api/v1/reporting/reports | List reports |
| POST | /api/v1/reporting/reports/:id/generate | Generate report |
| POST | /api/v1/reporting/reports/:id/schedule | Schedule generation |
| POST | /api/v1/reporting/distribution/configure | Set up distribution |
| POST | /api/v1/reporting/distribution/send | Distribute report |
| POST | /api/v1/reporting/interactive/create | Create interactive report |
| POST | /api/v1/reporting/easy-mode/create | Easy mode creation |
| POST | /api/v1/reporting/advanced-mode/create | Advanced mode creation |
| POST | /api/v1/reporting/compare-schedule/compare | Compare scheduled outputs |
| GET | /api/v1/reporting/templates | List report templates |

---

## E05: Presentation Service (`/api/presentation/`)

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/presentation/presentations | Create presentation |
| GET | /api/v1/presentation/presentations/:id | Get presentation |
| POST | /api/v1/presentation/ai-content/generate | AI generate slides |
| POST | /api/v1/presentation/smart-design/apply | Apply smart design |
| POST | /api/v1/presentation/animation/set | Set animations |
| POST | /api/v1/presentation/multi-source/import | Import from sources |
| POST | /api/v1/presentation/collaboration/start | Start collaboration |
| POST | /api/v1/presentation/export-share/export | Export presentation |
| POST | /api/v1/presentation/integration/connect | External integration |
| POST | /api/v1/presentation/advanced-edit/edit | Advanced slide editing |

---

## E07: Localization Service (`/api/localization/`)

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/localization/translate | Translate content |
| POST | /api/v1/localization/rtl-layout/apply | Apply RTL layout |
| POST | /api/v1/localization/arabic-typography/optimize | Optimize Arabic text |
| POST | /api/v1/localization/data-localization/format | Localize data formats |
| POST | /api/v1/localization/quality-gate/check | Run quality checks |
| GET | /api/v1/localization/glossaries | List glossaries |
| POST | /api/v1/localization/glossaries | Create glossary |
| POST | /api/v1/localization/language-intelligence/detect | Detect language |

---

## E08: Conversion Service (`/api/conversion/`)

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/conversion/convert | Convert single file |
| POST | /api/v1/conversion/batch | Batch convert files |
| GET | /api/v1/conversion/matrix | Get conversion matrix |
| POST | /api/v1/conversion/universal/read | Universal document read |
| POST | /api/v1/conversion/document-extraction/extract | Deep content extraction |
| POST | /api/v1/conversion/udr/create | Create UDR document |
| GET | /api/v1/conversion/formats | List supported formats |

---

## E09: AI Intelligence Service (`/api/ai/`)

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/ai/query | Free-form AI query |
| POST | /api/v1/ai/analyze | Analyze data with AI |
| POST | /api/v1/ai/rag/query | RAG-based Q&A |
| POST | /api/v1/ai/embeddings | Generate embeddings |
| POST | /api/v1/ai/predict | Predictive analytics |
| POST | /api/v1/ai/anomaly/detect | Detect anomalies |
| POST | /api/v1/ai/layout-intelligence/analyze | Analyze document layout |
| POST | /api/v1/ai/knowledge-base/create | Create knowledge base |
| POST | /api/v1/ai/fine-tune/start | Start fine-tuning |
| POST | /api/v1/ai/what-if/simulate | Run what-if scenario |

---

## E10: Governance Service (`/api/governance/`)

### Authentication
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/v1/governance/auth/login | No | Login |
| POST | /api/v1/governance/auth/register | No | Register |
| POST | /api/v1/governance/auth/refresh | No | Refresh token |
| POST | /api/v1/governance/auth/logout | Yes | Logout |

### Permissions & Roles
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/governance/roles | List roles |
| POST | /api/v1/governance/roles | Create role |
| POST | /api/v1/governance/permissions | Set permissions |
| GET | /api/v1/governance/permissions/:roleId | Get role permissions |

### Audit & Compliance
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/governance/audit-logs | Query audit logs |
| POST | /api/v1/governance/audit-replay/replay | Replay audit events |
| POST | /api/v1/governance/compliance/check | Run compliance check |

### Versioning & Compare
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/governance/versions/:resourceId | List versions |
| POST | /api/v1/governance/advanced-compare/compare | Deep comparison |

### Operations
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/governance/one-click-ops/execute | One-click operation |
| POST | /api/v1/governance/engine-integration/sync | Sync across engines |
| GET | /api/v1/governance/product-levels | Get product levels |
| POST | /api/v1/governance/teamwork/teams | Create team |

---

## Support Services

### Infographic (`/api/infographic/`)
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/infographic/generate | Generate infographic |
| POST | /api/v1/infographic/professional/create | Professional infographic |

### Replication (`/api/replication/`)
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/replication/replicate | Replicate document |
| POST | /api/v1/replication/pixel-validation/validate | Pixel validation |
| POST | /api/v1/replication/canonical-pipeline/execute | Full pipeline |
| POST | /api/v1/replication/generate-from-layout/generate | Generate from layout |

### Library (`/api/library/`)
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/library/assets | List assets |
| POST | /api/v1/library/assets/upload | Upload asset |
| GET | /api/v1/library/folders | List folders |
| POST | /api/v1/library/media/search | Search media |

### Template (`/api/template/`)
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/template/templates | List templates |
| POST | /api/v1/template/templates | Create template |
| GET | /api/v1/template/marketplace | Browse marketplace |
| POST | /api/v1/template/themes | Create theme |

### Rendering Environment
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/render/html-to-image | Render HTML to image |
| POST | /api/v1/render/compare | Pixel comparison |
| GET | /api/v1/render/fonts | List installed fonts |
| POST | /api/v1/render/validate-fonts | Validate required fonts |
| GET | /api/v1/render/ready | Readiness check |

---

## Rate Limiting

| Zone | Rate | Burst | Services |
|------|------|-------|----------|
| api | 100r/s | 50 | All services except AI |
| api (AI) | 100r/s | 20 | AI service (lower burst for expensive ops) |
| per-service | Configurable | Configurable | Each service has its own Express rate limiter |

## File Upload Limits

| Layer | Limit |
|-------|-------|
| Nginx | 500MB (client_max_body_size) |
| Express | 50MB (json body parser) |
| Rendering | 100MB (rendering-environment) |
