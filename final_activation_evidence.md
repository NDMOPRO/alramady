# Final Activation Evidence

## 1. Services started
- `postgres`
- `redis`
- `elasticsearch`
- `minio`
- `gateway`
- `frontend`
- `data-service`
- `excel-service`
- `dashboard-service`
- `reporting-service`
- `presentation-service`
- `infographic-service`
- `replication-service`
- `localization-service`
- `ai-service`
- `governance-service`
- `library-service`
- `template-service`
- `conversion-service`
- `rendering-environment`

## 2. Environment/dependency status
- `DB`: `docker exec rasid-postgres pg_isready -U rasid -d rasid_db` -> `/var/run/postgresql:5432 - accepting connections`
- `Redis`: `docker exec rasid-redis redis-cli ping` -> `PONG`
- `Storage`: `GET http://localhost:9000/minio/health/live` -> `200`
- `Search`: `GET http://localhost:9200/_cluster/health` -> `200`
- `Auth`: `POST http://localhost/api/v1/governance/auth/login` -> `200`, authenticated user `admin@rasid.demo`
- `Gateway`: `GET http://localhost/` -> `200`
- `Frontend`: `GET http://localhost:3000/` -> `200`
- `data-service`: `GET http://localhost:8001/health` -> `200`
- `dashboard-service`: `GET http://localhost:8003/health` -> `200`
- `reporting-service`: `GET http://localhost:8004/health` -> `200`
- `presentation-service`: `GET http://localhost:8005/health` -> `200`
- `governance-service`: `GET http://localhost:8010/health` -> `200`
- `library-service`: `GET http://localhost:8011/health` -> `200`

## 3. Surface activation results
- `Home` | route `/home` | activation result `IMPLEMENTED` | real execution path `UI /home -> GET /api/v1/data/sources?page=1&limit=8 + GET /api/v1/reporting/reports?page=1&limit=1 + GET /api/v1/presentation/presentations?page=1&limit=1 + GET /api/v1/dashboard/dashboards?page=1&limit=1 -> data-service + reporting-service + presentation-service + dashboard-service` | real output result `cards rendered 52 datasets / 15 reports / 15 presentations / 7 dashboards and recent dataset analysis-surface-20260309-094817`
- `Data` | route `/data/35c425ab-6937-4fa1-995f-a9c17fd9632d` | activation result `IMPLEMENTED` | real execution path `UI /data/:id -> GET /api/v1/data/sources/35c425ab-6937-4fa1-995f-a9c17fd9632d + GET /api/v1/data/sources/35c425ab-6937-4fa1-995f-a9c17fd9632d/rows?page=1&limit=50 + GET /api/v1/data/sources/35c425ab-6937-4fa1-995f-a9c17fd9632d/statistics -> data-service` | real output result `detail page rendered 4 rows, 5 columns, and first row 2026-01-01 / Riyadh / 1200 / 15 / 0.42`
- `Analysis` | route `/analysis` | activation result `IMPLEMENTED` | real execution path `UI click تشغيل التحليل -> POST /api/v1/dashboard/analyze-data -> auto-dashboard controller + auto-dashboard-generator service` | real output result `analysis returned 4 rows, 5 columns, 8 KPI recommendations, 8 chart recommendations, including إجمالي revenue and تطور margin عبر report_date`
- `Reports` | route `/reports` | activation result `IMPLEMENTED` | real execution path `UI /reports live list -> GET /api/v1/reporting/reports?page=1&limit=12 and API re-verification POST /api/v1/reporting/reports/19389535-c492-424d-8910-bb817f8abeb6/build + GET /api/v1/reporting/reports/19389535-c492-424d-8910-bb817f8abeb6/export/html -> reporting.routes + report-builder.service + template-engine.service` | real output result `report UI Reports Surface 2026-03-09 10-26 built with buildId 1594a811-bada-4c3e-ab97-4e266c1c8cf4 and HTML export length 3006 bytes`
- `Presentations` | route `/presentations/3df21f53-29de-424a-a28e-06a5f6d2b031` | activation result `IMPLEMENTED` | real execution path `UI /presentations/:id -> GET /api/v1/presentation/presentations/3df21f53-29de-424a-a28e-06a5f6d2b031 and API re-verification GET /api/v1/presentation/presentations/3df21f53-29de-424a-a28e-06a5f6d2b031/export/pptx -> presentation.routes + slide-builder.service` | real output result `editor rendered Board Update: Customer Churn Reduction and Margin Expansion with 3 slides and PPTX export size 63402 bytes`
- `Library` | route `/library` | activation result `IMPLEMENTED` | real execution path `UI /library -> GET /api/v1/library/folders/tree + GET /api/v1/library/assets?page=1&limit=20 + GET /api/v1/library/assets/fd8f97bc-725f-4490-b61a-3772a73f3a2c -> library.routes + asset-manager.service + folder-manager.service + MinIO` | real output result `UI rendered 6 real assets and selected asset library_test_asset.txt with mime text/plain and size 39 bytes`
- `Settings` | route `/settings` | activation result `BLOCKED` | real execution path `UI /settings -> GET /api/v1/governance/users?page=1&limit=8 + GET /api/v1/governance/audit?page=1&limit=8 + GET /api/v1/governance/audit/export?format=csv -> governance.routes + audit.service + authentication.service` | real output result `UI rendered 2 users, 466 audit rows, CSV export size 137930 bytes, and governance settings endpoint returned 404`

## 4. Runtime defects found
- Demo auth was not usable at runtime because the seeded admin record in PostgreSQL did not match the repository’s expected demo credentials, so real login failed.
- `reporting-service` intermittently failed on `GET /api/v1/reporting/reports` with `P2037 Too many database connections opened` because `services/reporting-service/src/routes/reporting.routes.ts` created `new PrismaClient()` inside request handlers.
- Scheduled report execution could fail on persisted schedules whose stored format was uppercase `PDF`, producing `Unsupported export format: PDF` inside `services/reporting-service/src/services/scheduled-reports.service.ts`.
- `GET /api/v1/governance/settings` returned `404`, so the general settings capability behind `/settings` remains unavailable.

## 5. Fixes applied
- Updated the live admin row in PostgreSQL to the repository-aligned credentials `admin@rasid.demo / Password123!` with a fresh bcrypt hash so real auth could execute.
- Replaced per-request Prisma client creation in `services/reporting-service/src/routes/reporting.routes.ts` with the shared `prisma` client from `services/reporting-service/src/utils/prisma.ts`.
- Normalized scheduled report export format handling in `services/reporting-service/src/services/scheduled-reports.service.ts` before dispatch so uppercase persisted formats execute through the real export path.
- Rebuilt and restarted `reporting-service` after each backend fix with `docker compose up -d --build reporting-service`.

## 6. Re-verification results
- `POST /api/v1/governance/auth/login` succeeded after the auth repair and returned a valid JWT for `admin@rasid.demo`.
- Five consecutive live calls to `GET /api/v1/reporting/reports?page=1&limit=12` returned `OK` after the Prisma fix with no `500` or `P2037` recurrence.
- `POST /api/v1/reporting/reports/19389535-c492-424d-8910-bb817f8abeb6/build` returned `status=completed` with build `1594a811-bada-4c3e-ab97-4e266c1c8cf4`.
- `GET /api/v1/reporting/reports/19389535-c492-424d-8910-bb817f8abeb6/export/html` returned `3006` bytes after the reporting fixes.
- `npm test --prefix services/reporting-service -- report-builder.service.test.ts scheduled-reports.service.test.ts --runInBand` -> `PASS`, `2` suites passed, `2` tests passed.
- Playwright live route activation showed `/home`, `/data/35c425ab-6937-4fa1-995f-a9c17fd9632d`, `/analysis`, `/reports`, `/presentations/3df21f53-29de-424a-a28e-06a5f6d2b031`, `/library`, and `/settings` loading real backend data.

## 7. Remaining blocked items
- `Settings`: `GET /api/v1/governance/settings` is not implemented and returns `404`.
- `Settings`: no evidenced backend persistence route was available from `/settings` for general settings save/update operations.

## 8. Final per-surface status
- `Home` — `IMPLEMENTED`
- `Data` — `IMPLEMENTED`
- `Analysis` — `IMPLEMENTED`
- `Reports` — `IMPLEMENTED`
- `Presentations` — `IMPLEMENTED`
- `Library` — `IMPLEMENTED`
- `Settings` — `BLOCKED`

## 9. Final activation conclusion
NO
