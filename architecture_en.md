# Architecture

## System Layers
- `frontend`: Next.js application providing the user-facing Arabic-first UI.
- `gateway`: Nginx reverse proxy exposing a unified host and routing requests to the appropriate service.
- Domain services: independently deployed Node/TypeScript services grouped by business capability.
- Storage and infrastructure: PostgreSQL, Redis, Elasticsearch, and MinIO.

## Core Services for the Approved Surfaces
- `data-service`: dataset ingestion, listing, detail retrieval, row reads, statistics, exports, connectors.
- `dashboard-service`: dashboard CRUD, chart rendering, KPI handling, dataset analysis, themes, and appearance.
- `reporting-service`: report definitions, section composition, build pipelines, export, schedules, and send flows.
- `presentation-service`: presentation CRUD, slide operations, source-based generation, AI generation, export, and theme/design hooks.
- `library-service`: asset upload, asset metadata, folder tree, signed or streamed downloads, and file-backed reuse.
- `governance-service`: authentication, users, roles, permissions, audit, notifications, teams/workflows, and feature control.
- `ai-service`: NLP, generative AI, RAG knowledge bases, prompt management, and dataset-oriented AI assistance.

## Supporting Services
- `localization-service`: translation, RTL transformation, and language-aware localization utilities.
- `conversion-service`: document and data format conversion used by contextual actions.
- `replication-service`: visual analysis, comparison, extraction, and reconstruction-oriented workflows.
- `template-service`: template-oriented export/rendering support.
- `rendering-environment`: dedicated rendering runtime for high-fidelity visual operations.
- `excel-service` and `infographic-service`: specialized generation and transformation services available in the composed platform.

## Request Flow
- The UI action originates in a page under `frontend/app/(dashboard)`.
- The page calls a typed client under `frontend/lib/api`.
- The request is sent through the gateway under `/api/v1/...`.
- The target service validates input, resolves tenant/user context, executes domain logic, and persists or generates the requested output.
- The UI renders the returned business result, opens the target route, or triggers file download.

## Frontend Composition
- Each approved surface is implemented as a dedicated page component.
- Embedded assistant entry points are injected at the surface level and bind to live surface actions.
- UI state is primarily request-driven. Local-only fallback execution paths were removed or isolated from approved runtime flows.

## Persistence Model
- PostgreSQL stores domain records such as datasets, dashboards, reports, presentations, governance entities, knowledge bases, and prompt records.
- MinIO stores uploaded and generated binary assets where relevant.
- Redis is used for transient state, queues, or performance-oriented runtime support.
- Elasticsearch supports indexed search for services such as library and AI/RAG workflows.

## Theme and Appearance Architecture
- `dashboard-service` exposes theme CRUD, variants, CSS export, preview generation, brand-kit application, and appearance configuration.
- The frontend consumes theme/appearance values to support Arabic/RTL-aware visual consistency, dark/light operation, and brand identity controls.

## Current Architectural Boundaries
- Strict one-to-one visual replication remains partially blocked in the current implementation and is not documented as fully accepted capability.
- Training registry/deployment paths under `/api/training/*` are not treated as active administrative runtime because the current project state does not fully back them.
