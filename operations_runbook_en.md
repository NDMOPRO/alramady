# Operations Runbook

## Prerequisites
- Docker and Docker Compose
- Node.js 18 or later
- npm / npx
- Valid environment variables for the services defined in `docker-compose.yml`

## Local Bootstrap
- Start the full runtime:
- `docker compose up -d`
- If you need a staged startup, bring up infrastructure first, then service groups.

## Database Migration and Seeding
- Use the repository migration script:
- `bash ./scripts/run-migrations.sh --full`
- That flow performs:
- prerequisite validation
- database readiness checks
- Prisma migration deployment
- Prisma client generation
- database seeding if the seed script is present

## Runtime Validation
- Verify containers with:
- `docker ps`
- Inspect service logs with:
- `docker logs <container-name>`
- Open the platform through:
- `http://localhost`

## Services Required for the Approved Surfaces
- `rasid-frontend`
- `rasid-gateway`
- `rasid-data-service`
- `rasid-dashboard-service`
- `rasid-reporting-service`
- `rasid-presentation-service`
- `rasid-library-service`
- `rasid-governance-service`
- `rasid-ai-service`
- infrastructure dependencies: `rasid-postgres`, `rasid-redis`, `rasid-elasticsearch`, `rasid-minio`

## Useful Validation Commands
- Frontend type validation:
- `npm run type-check --prefix frontend`
- AI training/admin center tests:
- `npx jest --config jest.config.ts src/__tests__/training-center.test.ts --runInBand`
- Run that Jest command from `services/ai-service`

## Authentication and Surface Validation
- Sign in through `/login`.
- After login, validate the approved surfaces in this order if needed:
- `/home`
- `/data`
- `/analysis`
- `/reports`
- `/presentations`
- `/library`
- `/settings`

## Data Protection and Recovery
- PostgreSQL stores most business entities and configuration.
- MinIO stores uploaded and generated binary assets.
- Backup and restore procedures should treat PostgreSQL and MinIO as a pair for consistent operational recovery.

## Known Operational Warnings
- `ai-service` may emit an `express-rate-limit` warning related to `X-Forwarded-For` and missing `trust proxy`. This is a warning, not a currently proven blocker for the approved surfaces.
- If RAG or prompt administration fails, inspect `ai-service` logs, OpenAI credentials, PostgreSQL connectivity, and Elasticsearch availability in that order.
