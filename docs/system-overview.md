# Rasid Platform - System Overview

## What is Rasid?

**Rasid** (Arabic: راصد) is an intelligent document and data operating system built for the Saudi Arabian market. It is an Arabic-first, fully RTL (Right-to-Left) platform that processes, analyzes, transforms, and governs documents and data through 10 specialized engines.

The platform is designed as a cloud-native microservices architecture with 15 backend services, an API gateway, and a Next.js frontend, all orchestrated via Docker Compose.

## Platform Identity

| Attribute | Value |
|-----------|-------|
| Name | Rasid (راصد) |
| Market | Saudi Arabia / GCC |
| Language Priority | Arabic-first, full RTL support |
| Architecture | Microservices |
| Services | 15 backend + 1 frontend + 1 gateway |
| Database | PostgreSQL 16 |
| Cache/Queue | Redis 7 |
| Search | Elasticsearch 8.12 |
| Object Storage | MinIO |
| AI | OpenAI GPT-4o / Vision / Whisper |

## The 10 Engines

Rasid's capabilities are organized into 10 core engines:

| # | Engine | Service | Port | Description |
|---|--------|---------|------|-------------|
| E01 | Data & Files | data-service | 8001 | File ingestion, parsing, OCR, data quality, connectors, KPI registry |
| E02 | Excel | excel-service | 8002 | Professional Excel processing, 106+ formulas, matching, pivot tables |
| E03 | Dashboards | dashboard-service | 8003 | Interactive dashboards, KPI widgets, drag-drop builder |
| E04 | Reports | reporting-service | 8004 | Professional reports, scheduling, distribution, visual regression |
| E05 | Presentations | presentation-service | 8005 | AI-powered slide generation, animations, multi-source |
| E06 | Literal Match | excel-service | 8002 | Exact/fuzzy data matching (included in E02) |
| E07 | Localization | localization-service | 8008 | Arabic translation, RTL layout, typography optimization |
| E08 | Conversion | conversion-service | 8013 | Universal format conversion, OCR, batch processing |
| E09 | AI Intelligence | ai-service | 8009 | NLP, RAG, predictive analytics, anomaly detection |
| E10 | Governance | governance-service | 8010 | Auth, RBAC, audit, compliance, workflow, encryption |

## Supporting Services

| Service | Port | Description |
|---------|------|-------------|
| gateway | 80 | Nginx reverse proxy, rate limiting, routing |
| infographic-service | 8006 | AI-powered infographic generation, vector graphics |
| replication-service | 8007 | Pixel-perfect document replication, visual validation |
| library-service | 8011 | Asset management, media library, metadata search |
| template-service | 8012 | Template marketplace, version control, theme management |
| rendering-environment | 8014 | Deterministic HTML-to-image rendering with Chromium |
| frontend | 3000 | Next.js 14+ web application |

## Infrastructure Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Database | PostgreSQL 16 Alpine | Primary data store, per-service schemas |
| Cache | Redis 7 Alpine | Caching, session store, BullMQ job queues |
| Search | Elasticsearch 8.12 | Full-text search, analytics indexing |
| Storage | MinIO | S3-compatible object storage for files |
| Gateway | Nginx 1.25 | Reverse proxy, rate limiting, SSL termination |
| Rendering | Puppeteer + Chromium | Pixel-perfect document rendering |
| Containers | Docker Compose 3.9 | Service orchestration |

## Technology Stack

### Backend
- **Runtime**: Node.js with TypeScript (strict mode)
- **Framework**: Express.js 4
- **ORM**: Prisma 5 with PostgreSQL
- **Validation**: Zod
- **Queue**: BullMQ on Redis
- **Logging**: Winston
- **Auth**: JWT (jsonwebtoken)
- **AI**: OpenAI SDK (GPT-4o, Vision, Whisper)

### Frontend
- **Framework**: Next.js 14+
- **Language**: TypeScript (strict)
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui
- **Direction**: RTL-first

### Shared
- **Package**: @rasid/shared - common types, constants, utilities
- **Dependencies**: Zod, Winston, Express types, JWT, ioredis, uuid

## Multi-Tenancy

The platform implements multi-tenant isolation at every layer:
- JWT tokens carry `organizationId` as tenant identifier
- Every API request passes through tenant middleware
- Database queries are scoped by `tenantId`
- File storage is organized by tenant

## Key Design Principles

1. **Arabic-First**: All UI components support RTL, Arabic text processing is a first-class concern
2. **Zero Trust Security**: JWT auth + tenant isolation + role-based access on every endpoint
3. **No Mock Data**: Production-ready code with real implementations
4. **TypeScript Strict**: Zero tolerance for `any` types or type errors
5. **Resilient**: Graceful shutdown, health checks, retry strategies, error boundaries
6. **Scalable**: Stateless services, Redis caching, background job processing
