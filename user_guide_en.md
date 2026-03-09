# User Guide

## Access and Language
- Open the platform through `http://localhost`.
- The current UI is Arabic-first and RTL by default across the approved surfaces.
- In seeded local environments, the admin seed account can be used for initial access if database seeding has been executed.

## Home
- Route: `/home`
- Primary purpose: upload or drop a file, let the platform detect the file type, and trigger the next valid real workflow from the same page.
- Supported interaction patterns:
- drag-and-drop
- file picker
- guided Arabic action cards
- contextual assistant entry point
- Typical outcomes:
- dataset import
- dataset analysis
- report build
- presentation generation
- localization / RTL output
- supported format conversion
- visual analysis or comparison flows

## Data
- Route: `/data`
- Use the uploader to send source files directly to `data-service`.
- The surface lists live datasets and allows opening a dataset detail route for deeper operations.
- Real dataset operations include:
- import
- list
- detail retrieval
- row pagination
- statistics
- export in supported formats
- connector discovery for configured cloud sources

## Analysis
- Route: `/analysis`
- Select a dataset card and run analysis.
- The analysis surface invokes the dashboard analysis engine and renders:
- dataset profile
- KPI recommendations
- chart recommendations
- column-level profiling data
- The page is intentionally tied to live dataset identifiers, not static sample cards.

## Reports
- Route: `/reports`
- Choose a dataset, name the report, and create/build it through `reporting-service`.
- Real report operations exposed in the surface:
- create report
- add sections
- build report
- rebuild selected report
- export PDF / HTML / DOCX / XLS
- save schedule with cron expression, recipients, and output format

## Presentations
- Route: `/presentations`
- Supported real modes:
- blank presentation creation
- source-based generation
- AI text-based generation
- After creation, the workspace navigates to the created presentation detail route.
- Output export is handled by `presentation-service` in PPTX and PDF, with additional image export support in the backend.

## Library
- Route: `/library`
- Library is the reusable hub for persistent assets, reusable themes, and reusable action/workflow recipes.
- Main live actions:
- upload asset
- browse/search assets
- inspect and download assets
- import suitable assets into Data
- generate presentations from suitable assets
- save reusable recipes
- activate saved themes
- create governance workflow definitions and persist them for reuse

## Settings
- Route: `/settings`
- This is a real operational control surface, not a decorative admin page.
- Live capabilities include:
- user inspection and updates
- team creation and membership management
- feature flag creation, update, evaluation, and per-user disabling
- audit log browsing and CSV export
- appearance management
- Rasid knowledge-base management
- Rasid prompt/workflow template management, versioning, and testing

## Embedded Rasid Assistant
- Every approved surface includes a small embedded assistant entry point.
- The assistant operates in Arabic, understands the current page context, and can trigger the real actions explicitly exposed by that surface.
- The assistant is not a scripted demo chatbot; it binds to the same UI actions and service methods as the page.

## Known Limits
- Full strict visual replication remains partially blocked in the current project and is not documented as complete.
- Bulk platform-wide import/export is not available from the Settings surface.
- Model registry and deployment flows under `/api/training/*` are not exposed as active Settings capabilities because their backing runtime path is incomplete in the current schema/runtime.
