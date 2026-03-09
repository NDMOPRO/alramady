# API Reference

## Conventions
- Public browser traffic is routed through the gateway under `http://localhost/api/v1/...`.
- Most service endpoints require authenticated access.
- Request and response wrappers generally use a `success` flag plus a `data` payload.

## Authentication and Governance

### Auth
- `POST /api/v1/governance/auth/login`
- `POST /api/v1/governance/auth/register`
- `POST /api/v1/governance/auth/logout`
- `POST /api/v1/governance/auth/refresh`

### Users and Audit
- `GET /api/v1/governance/users`
- `GET /api/v1/governance/users/:id`
- `PATCH /api/v1/governance/users/:id`
- `GET /api/v1/governance/users/:id/usage`
- `GET /api/v1/governance/audit`
- `GET /api/v1/governance/audit/user/:userId`
- `GET /api/v1/governance/audit/export`

### Teams, Roles, Flags, Workflows
- `GET /api/v1/governance/teamwork`
- `POST /api/v1/governance/teamwork`
- `GET /api/v1/governance/teamwork/:id/members`
- `POST /api/v1/governance/teamwork/:id/members`
- `DELETE /api/v1/governance/teamwork/:id/members/:userId`
- `GET /api/v1/governance/feature-flags`
- `POST /api/v1/governance/feature-flags`
- `PUT /api/v1/governance/feature-flags/:id`
- `POST /api/v1/governance/feature-flags/:id/rules`
- `GET /api/v1/governance/feature-flags/evaluate`
- `POST /api/v1/governance/workflows`
- `POST /api/v1/governance/workflows/submit`
- `PUT /api/v1/governance/workflows/:instanceId/steps/:stepId`

## Data Service

### Datasets
- `GET /api/v1/data/sources`
- `GET /api/v1/data/sources/search`
- `GET /api/v1/data/sources/:id`
- `GET /api/v1/data/sources/:id/rows`
- `GET /api/v1/data/sources/:id/statistics`
- `DELETE /api/v1/data/sources/:id`

### Export
- `GET /api/v1/data/sources/:id/export/csv`
- `GET /api/v1/data/sources/:id/export/excel`
- `GET /api/v1/data/sources/:id/export/json`

### Import and Connectors
- `POST /api/v1/data/import/single`
- `POST /api/v1/data/import/batch`
- `GET /api/v1/data/connectors/types`
- `GET /api/v1/data/connectors/connections`
- `GET /api/v1/data/connectors/auth/:type`

## Dashboard Service

### Dashboards
- `POST /api/v1/dashboard/dashboards`
- `GET /api/v1/dashboard/dashboards`
- `GET /api/v1/dashboard/dashboards/:id`
- `PUT /api/v1/dashboard/dashboards/:id`
- `DELETE /api/v1/dashboard/dashboards/:id`
- `POST /api/v1/dashboard/dashboards/:id/duplicate`

### Widgets and Filters
- `POST /api/v1/dashboard/dashboards/:id/widgets`
- `PUT /api/v1/dashboard/dashboards/:id/widgets/:widgetId`
- `DELETE /api/v1/dashboard/dashboards/:id/widgets/:widgetId`
- `PUT /api/v1/dashboard/dashboards/:id/widgets/reorder`
- `POST /api/v1/dashboard/dashboards/:id/filters`
- `POST /api/v1/dashboard/dashboards/:id/filters/:filterId/apply`
- `POST /api/v1/dashboard/widgets/:widgetId/bind`

### Analysis and Rendering
- `POST /api/v1/dashboard/analyze-data`
- `POST /api/v1/dashboard/charts/bar`
- `POST /api/v1/dashboard/charts/line`
- `POST /api/v1/dashboard/charts/pie`
- `POST /api/v1/dashboard/charts/scatter`
- `POST /api/v1/dashboard/charts/area`
- `POST /api/v1/dashboard/charts/radar`
- `POST /api/v1/dashboard/charts/gauge`
- `POST /api/v1/dashboard/charts/waterfall`
- `POST /api/v1/dashboard/charts/combined`
- `POST /api/v1/dashboard/charts/render`

### Themes and Appearance
- `GET /api/v1/dashboard/themes`
- `POST /api/v1/dashboard/themes`
- `GET /api/v1/dashboard/themes/:id`
- `GET /api/v1/dashboard/themes/:id/preview`
- `GET /api/v1/dashboard/themes/:id/css`
- `POST /api/v1/dashboard/themes/:id/variants/rtl`
- `POST /api/v1/dashboard/themes/:id/variants/mode`
- `PUT /api/v1/dashboard/themes/:id/brand-kit`
- `GET /api/v1/dashboard/appearance`
- `PUT /api/v1/dashboard/appearance`

### Dashboard Export
- `GET /api/v1/dashboard/dashboards/:id/export/pdf`
- `GET /api/v1/dashboard/dashboards/:id/export/image`

## Reporting Service

### Reports
- `POST /api/v1/reporting/reports`
- `GET /api/v1/reporting/reports`
- `GET /api/v1/reporting/reports/:id`
- `PUT /api/v1/reporting/reports/:id`
- `DELETE /api/v1/reporting/reports/:id`

### Sections and Build
- `POST /api/v1/reporting/reports/:id/sections`
- `POST /api/v1/reporting/reports/:id/toc`
- `PUT /api/v1/reporting/reports/:id/header`
- `PUT /api/v1/reporting/reports/:id/footer`
- `POST /api/v1/reporting/reports/:id/build`

### Export
- `GET /api/v1/reporting/reports/:id/export/pdf`
- `GET /api/v1/reporting/reports/:id/export/word`
- `GET /api/v1/reporting/reports/:id/export/html`
- `GET /api/v1/reporting/reports/:id/export/excel`

### Scheduling and Delivery
- `POST /api/v1/reporting/reports/:id/schedule`
- `GET /api/v1/reporting/reports/:id/schedules`
- `PUT /api/v1/reporting/schedules/:id/pause`
- `PUT /api/v1/reporting/schedules/:id/resume`
- `GET /api/v1/reporting/schedules/:id/history`
- `POST /api/v1/reporting/reports/:id/send`

### Templates
- `POST /api/v1/reporting/templates`
- `POST /api/v1/reporting/templates/:id/render`

## Presentation Service

### Presentation CRUD
- `POST /api/v1/presentation/presentations`
- `GET /api/v1/presentation/presentations`
- `GET /api/v1/presentation/presentations/:id`
- `DELETE /api/v1/presentation/presentations/:id`

### Slides and Elements
- `POST /api/v1/presentation/presentations/:id/slides`
- `PUT /api/v1/presentation/presentations/:id/slides/:slideIndex`
- `DELETE /api/v1/presentation/presentations/:id/slides/:slideIndex`
- `PUT /api/v1/presentation/presentations/:id/slides/reorder`
- `POST /api/v1/presentation/presentations/:id/slides/:slideIndex/duplicate`
- `POST /api/v1/presentation/presentations/:id/slides/:slideIndex/text`
- `POST /api/v1/presentation/presentations/:id/slides/:slideIndex/image`
- `POST /api/v1/presentation/presentations/:id/slides/:slideIndex/shape`
- `POST /api/v1/presentation/presentations/:id/slides/:slideIndex/chart`
- `POST /api/v1/presentation/presentations/:id/slides/:slideIndex/table`
- `PUT /api/v1/presentation/presentations/:id/theme`

### AI and Source Generation
- `POST /api/v1/presentation/ai/generate-from-text`
- `POST /api/v1/presentation/ai/generate-from-data`
- `POST /api/v1/presentation/ai/generate-from-outline`
- `POST /api/v1/presentation/ai/suggest-layout`
- `POST /api/v1/presentation/ai/speaker-notes/:id`
- `POST /api/v1/presentation/ai/translate/:id`
- `POST /api/v1/presentation/source/from-text`
- `POST /api/v1/presentation/source/from-file`
- `POST /api/v1/presentation/source/from-url`
- `POST /api/v1/presentation/source/from-email`
- `POST /api/v1/presentation/source/multi`
- `POST /api/v1/presentation/source/from-report`
- `POST /api/v1/presentation/source/suggest-structure`

### Export and Design
- `GET /api/v1/presentation/presentations/:id/export/pptx`
- `GET /api/v1/presentation/presentations/:id/export/pdf`
- `GET /api/v1/presentation/presentations/:id/export/images`
- `POST /api/v1/presentation/themes`
- `POST /api/v1/presentation/design/branding/:id`
- `POST /api/v1/presentation/design/color-palette`
- `POST /api/v1/presentation/design/animation/:id`

## Library Service

### Assets
- `POST /api/v1/library/assets`
- `GET /api/v1/library/assets`
- `GET /api/v1/library/assets/search`
- `GET /api/v1/library/assets/:id`
- `GET /api/v1/library/assets/:id/download`
- `DELETE /api/v1/library/assets/:id`
- `PUT /api/v1/library/assets/:id/move`
- `POST /api/v1/library/assets/:id/thumbnail`

### Folders
- `POST /api/v1/library/folders`
- `GET /api/v1/library/folders/tree`
- `PUT /api/v1/library/folders/:id/move`
- `DELETE /api/v1/library/folders/:id`

## AI Service

### NLP
- `POST /api/v1/ai/nlp/analyze`
- `POST /api/v1/ai/nlp/entities`
- `POST /api/v1/ai/nlp/sentiment`
- `POST /api/v1/ai/nlp/keywords`
- `POST /api/v1/ai/nlp/summarize`
- `POST /api/v1/ai/nlp/classify`
- `POST /api/v1/ai/nlp/detect-language`

### Generative AI
- `POST /api/v1/ai/generate/text`
- `POST /api/v1/ai/generate/report`
- `POST /api/v1/ai/generate/insights/:datasetId`
- `POST /api/v1/ai/generate/recommendations`
- `POST /api/v1/ai/generate/chat`
- `POST /api/v1/ai/generate/stream`

### RAG / Knowledge Base
- `POST /api/v1/ai/rag/knowledge-bases`
- `GET /api/v1/ai/rag/knowledge-bases`
- `GET /api/v1/ai/rag/knowledge-bases/:id`
- `POST /api/v1/ai/rag/knowledge-bases/:id/ingest`
- `POST /api/v1/ai/rag/knowledge-bases/:id/query`
- `POST /api/v1/ai/rag/knowledge-bases/:id/hybrid-search`
- `POST /api/v1/ai/rag/embed`

### Prompt Management
- `POST /api/v1/ai/prompts`
- `GET /api/v1/ai/prompts`
- `POST /api/v1/ai/prompts/:id/test`
- `POST /api/v1/ai/prompts/:id/optimize`
- `POST /api/v1/ai/prompts/:id/version`

## Partial or Blocked Areas
- Training registry and deployment paths under `/api/training/*` are not documented here as operational because the current project state does not fully back them.
- Strict visual replication APIs exist in the project, but the capability is not treated as fully accepted end-to-end due to remaining validated blockers.
