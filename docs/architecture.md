# Rasid Platform - Architecture Documentation

## Architectural Style

Rasid follows a **microservices architecture** with an API Gateway pattern. Each engine is an independent Express.js service with its own Prisma schema, running in a Docker container and communicating through HTTP REST APIs.

## Architectural Layers

```
+----------------------------------------------------------+
|                    PRESENTATION LAYER                      |
|  Next.js 14+ | TypeScript | Tailwind CSS | shadcn/ui     |
|  RTL-First | Arabic UI | 22 Route Groups                 |
+----------------------------------------------------------+
                            |
+----------------------------------------------------------+
|                    API GATEWAY LAYER                       |
|  Nginx Reverse Proxy | Rate Limiting (100r/s)            |
|  Gzip | Security Headers | WebSocket Support              |
|  13 Upstream Service Routes + Frontend Catch-All          |
+----------------------------------------------------------+
                            |
+----------------------------------------------------------+
|                  APPLICATION SERVICES                      |
|  13 Express.js Microservices                              |
|  JWT Auth | Tenant Isolation | Zod Validation             |
|  Winston Logging | Graceful Shutdown                      |
+----------------------------------------------------------+
                            |
+----------------------------------------------------------+
|                    DOMAIN LOGIC LAYER                      |
|  Service Classes (200+ total)                             |
|  Formula Engine | AI Agents | Translation Engine          |
|  Layout Analyzer | Pixel Validator | Report Builder       |
+----------------------------------------------------------+
                            |
+----------------------------------------------------------+
|                  INFRASTRUCTURE LAYER                      |
|  Prisma ORM | ioredis | Elasticsearch Client             |
|  MinIO (S3) | BullMQ Workers | OpenAI SDK                |
+----------------------------------------------------------+
                            |
+----------------------------------------------------------+
|                    DATA STORAGE LAYER                      |
|  PostgreSQL 16 | Redis 7 | Elasticsearch 8.12 | MinIO   |
+----------------------------------------------------------+
```

## Service Architecture Pattern

Every microservice follows the same internal structure:

```
service-name/
  prisma/
    schema.prisma          # Service-specific database schema
  src/
    index.ts               # Express app bootstrap, route mounting
    controllers/           # Request handlers (thin, delegate to services)
    routes/                # Express Router definitions
    services/              # Business logic (domain layer)
    middleware/             # Auth, tenant, validation, error handling
    models/                # Data models and type definitions
    types/                 # TypeScript type declarations
    utils/                 # Shared utilities
    workers/               # BullMQ job processors (some services)
    __tests__/             # Test files
  package.json
  tsconfig.json
  Dockerfile
```

## Request Processing Pipeline

Every API request follows this pipeline:

```
Client Request
    -> Nginx (rate limit, proxy headers, gzip)
    -> Express App
        -> Helmet (security headers)
        -> CORS (configurable origins)
        -> Compression
        -> JSON Parser (50MB limit)
        -> Rate Limiter (per-service)
        -> Route Matching
            -> Auth Middleware (JWT verification)
            -> Tenant Middleware (organization isolation)
            -> Zod Validation (input schema)
            -> Controller (thin layer)
            -> Service Class (business logic)
            -> Prisma/Redis/ES/MinIO (data layer)
        -> Error Handler (catches all errors)
    -> JSON Response
```

## Authentication & Authorization

### JWT Token Structure
```typescript
interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  organizationId?: string;  // Tenant ID
  permissions?: string[];
}
```

### Middleware Chain
1. **authMiddleware**: Validates Bearer token, attaches `req.user`
2. **tenantMiddleware**: Extracts `tenantId` from JWT or `X-Tenant-Id` header, attaches `req.tenant`
3. **requireRole(roles)**: Enforces role-based access control
4. **optionalAuth**: Allows unauthenticated access but attaches user if token present

### Multi-Tenancy
- Tenant ID is extracted from `organizationId` in JWT or `X-Tenant-Id` header
- All database queries are scoped by `tenantId`
- No cross-tenant data access is possible

## API Versioning

The gateway supports API versioning through multiple mechanisms:
- **URL Path** (primary): `/api/v1/...`, `/api/v2/...`
- **Header**: `X-API-Version: v1`
- **Query Parameter**: `?version=v1`
- **Content Negotiation**: `Accept: application/vnd.rasid.v1+json`

Supported versions: v1, v2, v3. Default: v1.

## Service Communication

Services communicate through:
1. **Gateway routing**: Client -> Nginx -> Service (primary pattern)
2. **Direct HTTP calls**: Service -> Service (for cross-service operations like replication -> rendering)
3. **Shared database**: Some services read shared tables via Prisma

### Key Cross-Service Dependencies
| From | To | Method | Purpose |
|------|----|--------|---------|
| replication-service | rendering-environment | HTTP | HTML-to-image rendering |
| presentation-service | OpenAI API | HTTP | AI content generation |
| ai-service | OpenAI API | HTTP | NLP, embeddings, chat |
| localization-service | OpenAI API | HTTP | Translation |
| reporting-service | SMTP | TCP | Email delivery |
| governance-service | LDAP/AD | TCP | SSO authentication |

## Caching Strategy

Redis is used for:
- **Response caching**: Frequently accessed query results
- **Session management**: User sessions and tokens
- **Rate limiting**: Per-IP/per-user request counters
- **Job queues**: BullMQ background job processing
- **Real-time data**: WebSocket session state

Configuration: `maxmemory 512mb`, `maxmemory-policy allkeys-lru`, AOF persistence enabled.

## Error Handling

Every service implements:
1. **Zod validation errors** -> 400 with field-level error details
2. **Authentication errors** -> 401 with specific error codes
3. **Authorization errors** -> 403 with required role info
4. **Not found** -> 404 handler
5. **Rate limiting** -> 429 with retry-after
6. **Internal errors** -> 500 with sanitized message (no stack traces in production)
7. **Unhandled rejections / exceptions** -> logged and process exits for restart

## Graceful Shutdown

All services implement signal handling:
```
SIGTERM/SIGINT received
    -> Stop accepting new connections
    -> Disconnect Prisma (PostgreSQL)
    -> Quit Redis connection
    -> Close browser instances (rendering-environment)
    -> Exit process
```

## Health Checks

Every service exposes:
- `GET /health` - Comprehensive health check (DB, Redis, memory usage)
- `GET /api/v1/{service}/ready` - Readiness probe

Health response includes:
- Service status (healthy/degraded)
- Database connection status
- Redis connection status
- Memory usage (RSS, heap)
- Uptime
- Version

Docker Compose uses these endpoints for container health checks with 15s intervals.

## Rendering Environment

A dedicated service (`rendering-environment:8014`) provides deterministic document rendering:
- **Engine**: Headless Chromium via Puppeteer
- **DPI**: 150 (configurable)
- **Anti-aliasing**: Disabled for deterministic output
- **Font hinting**: Full
- **Network isolation**: All external requests blocked during rendering
- **Memory limit**: 4GB container, 2 CPUs

Endpoints:
- `POST /api/v1/render/html-to-image` - Render HTML to PNG/JPEG/WebP
- `POST /api/v1/render/compare` - Pixel-by-pixel image comparison
- `GET /api/v1/render/fonts` - List installed fonts
- `POST /api/v1/render/validate-fonts` - Verify required fonts
