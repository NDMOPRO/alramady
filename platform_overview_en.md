# Rasid Platform Overview

## Purpose
- Rasid is an Arabic-first operational platform for ingesting files and datasets, analyzing them, generating dashboards, reports, and presentations, storing reusable assets, and administering users, governance, appearance, and assistant behavior.
- The currently approved operational surfaces are: Home, Data, Analysis, Reports, Presentations, Library, and Settings.
- Real execution runs through the browser UI, the Nginx gateway, service-specific APIs, backend engines, and persistent storage layers.

## Operational Surfaces
- `/home`: the primary smart entry surface with drag-and-drop, file picking, Arabic guided actions, and direct routing into real platform services.
- `/data`: dataset ingestion, listing, detail views, row inspection, statistics, exports, and cloud connector discovery.
- `/analysis`: live dataset analysis using `dashboard-service` engines for profiling, KPI recommendation, and chart recommendation.
- `/reports`: report definition creation, section composition, build, export, and schedule management through `reporting-service`.
- `/presentations`: blank presentation creation plus source-based and AI-based generation through `presentation-service`.
- `/library`: persistent asset storage and retrieval backed by `library-service` and MinIO, with reusable themes and workflow/action recipes.
- `/settings`: governance, audit, users, teams, feature flags, platform appearance, and the Rasid training/admin center.

## Integrated Capabilities
- Arabic localization and RTL transformation through `localization-service`.
- Format conversion through `conversion-service`.
- Visual analysis and image-driven reconstruction flows through `replication-service`.
- Embedded Rasid assistant entry points across the approved surfaces, operating in Arabic and using live page context.
- Cross-surface reuse of library assets, reusable themes, and saved workflow/action recipes.

## Runtime Architecture
- Frontend: Next.js 14 application in `frontend`.
- Gateway: Nginx in `services/gateway`.
- Core services: `data-service`, `dashboard-service`, `reporting-service`, `presentation-service`, `library-service`, `governance-service`, `ai-service`.
- Supporting services: `localization-service`, `conversion-service`, `replication-service`, `template-service`, `excel-service`, `infographic-service`, `rendering-environment`.
- Infrastructure: PostgreSQL, Redis, Elasticsearch, and MinIO.

## Current Boundaries
- The seven approved surfaces are operational and Arabic/RTL-native in the current runtime.
- The Settings surface now includes real knowledge-base and prompt-template administration backed by `ai-service`.
- Strict one-to-one visual replication is not fully accepted as complete. The replication stack exists, but validated blockers remain for some replication outputs and structural extraction paths. Documentation in this suite treats that capability as partial, not complete.

## Audience
- This document is intended as a concise product and capability overview for stakeholders, operators, and implementation reviewers.
