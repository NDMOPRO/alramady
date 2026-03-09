# Rasid Platform - Infrastructure Documentation

## Container Architecture

Rasid runs as a Docker Compose orchestrated system with 19 containers:

### Infrastructure Containers (4)

| Container | Image | Port | Storage | Purpose |
|-----------|-------|------|---------|---------|
| rasid-postgres | postgres:16-alpine | 5432 | postgres_data volume | Primary database |
| rasid-redis | redis:7-alpine | 6379 | redis_data volume | Cache, queues, sessions |
| rasid-elasticsearch | elasticsearch:8.12.0 | 9200 | elasticsearch_data volume | Full-text search |
| rasid-minio | minio:latest | 9000, 9001 | minio_data volume | Object storage (S3) |

### Service Containers (14)

| Container | Build Context | Port | Dependencies |
|-----------|---------------|------|-------------|
| rasid-data-service | ./services/data-service | 8001 | postgres, redis, elasticsearch, minio |
| rasid-excel-service | ./services/excel-service | 8002 | postgres, redis |
| rasid-dashboard-service | ./services/dashboard-service | 8003 | postgres, redis |
| rasid-reporting-service | ./services/reporting-service | 8004 | postgres, redis |
| rasid-presentation-service | ./services/presentation-service | 8005 | postgres, redis |
| rasid-infographic-service | ./services/infographic-service | 8006 | postgres, redis |
| rasid-replication-service | ./services/replication-service | 8007 | postgres, redis, rendering-environment |
| rasid-localization-service | ./services/localization-service | 8008 | postgres, redis |
| rasid-ai-service | ./services/ai-service | 8009 | postgres, redis, elasticsearch |
| rasid-governance-service | ./services/governance-service | 8010 | postgres, redis |
| rasid-library-service | ./services/library-service | 8011 | postgres, redis, minio |
| rasid-template-service | ./services/template-service | 8012 | postgres, redis |
| rasid-conversion-service | ./services/conversion-service | 8013 | postgres, redis |
| rasid-rendering-environment | ./services/rendering-environment | 8014 | - (standalone) |

### Gateway & Frontend (2)

| Container | Image/Build | Port | Dependencies |
|-----------|-------------|------|-------------|
| rasid-gateway | nginx:1.25-alpine | 80 | All services + frontend |
| rasid-frontend | ./frontend | 3000 | governance-service |

## Network Architecture

All containers communicate on a single Docker bridge network: `rasid-network`.

```
                        ┌─────────────────────────────────────────┐
                        │           rasid-network (bridge)        │
                        │                                          │
  External ──:80──> [Gateway/Nginx]                               │
                        │                                          │
              ┌─────────┼──────────────────┐                      │
              │         │                  │                      │
        [:8001-:8013] Services      [:8014] Rendering             │
              │         │                  │                      │
              └─────────┼──────────────────┘                      │
                        │                                          │
              ┌─────────┼──────────────────┐                      │
              │   Infrastructure Services  │                      │
              │  [:5432] PostgreSQL         │                      │
              │  [:6379] Redis              │                      │
              │  [:9200] Elasticsearch      │                      │
              │  [:9000] MinIO              │                      │
              └────────────────────────────┘                      │
                        │                                          │
                        └──────────────────────────────────────────┘
```

## Environment Variables

### Global Variables (all services)

| Variable | Description | Example |
|----------|-------------|---------|
| DATABASE_URL | PostgreSQL connection string | postgresql://user:pass@postgres:5432/rasid |
| REDIS_URL | Redis connection string | redis://redis:6379 |
| JWT_SECRET | JWT signing secret | (random 256-bit key) |
| NODE_ENV | Environment mode | production / development |
| PORT | Service port | 8001-8014 |
| SERVICE_NAME | Service identifier | data-service |

### Storage Variables

| Variable | Description | Example |
|----------|-------------|---------|
| MINIO_ENDPOINT | MinIO server host | minio |
| MINIO_PORT | MinIO API port | 9000 |
| MINIO_ACCESS_KEY | MinIO access key | (generated) |
| MINIO_SECRET_KEY | MinIO secret key | (generated) |
| MINIO_BUCKET | Default bucket name | rasid-files |

### Search Variables

| Variable | Description | Example |
|----------|-------------|---------|
| ELASTICSEARCH_URL | Elasticsearch URL | http://elasticsearch:9200 |

### AI Variables

| Variable | Description | Services |
|----------|-------------|----------|
| OPENAI_API_KEY | OpenAI API key | ai, presentation, localization, infographic, replication |

### Email Variables

| Variable | Description | Services |
|----------|-------------|----------|
| SMTP_HOST | SMTP server host | reporting, governance |
| SMTP_PORT | SMTP server port | reporting, governance |
| SMTP_USER | SMTP username | reporting, governance |
| SMTP_PASS | SMTP password | reporting, governance |

### Governance-Specific

| Variable | Description |
|----------|-------------|
| JWT_REFRESH_SECRET | Refresh token signing secret |
| JWT_EXPIRY | Access token TTL |
| JWT_REFRESH_EXPIRY | Refresh token TTL |

### Rendering-Specific

| Variable | Description | Default |
|----------|-------------|---------|
| DPI | Rendering resolution | 150 |
| FONT_HINTING | Font hinting mode | full |
| SUBPIXEL_RENDERING | Subpixel rendering | false |
| ANTIALIASING | Anti-aliasing | false |
| COLOR_SPACE | Color space | srgb |
| CHROMIUM_PATH | Chromium binary path | /usr/bin/chromium |

## Storage Configuration

### PostgreSQL
- **Version**: 16 Alpine
- **Persistence**: Named volume `postgres_data`
- **Health check**: `pg_isready` every 10s, 5 retries
- **Connection**: Each service uses Prisma ORM

### Redis
- **Version**: 7 Alpine
- **Persistence**: AOF (`--appendonly yes`)
- **Memory**: 512MB max, LRU eviction (`allkeys-lru`)
- **Health check**: `redis-cli ping` every 10s, 5 retries
- **Usage**: Caching, BullMQ queues, sessions, rate limiting

### Elasticsearch
- **Version**: 8.12.0
- **Mode**: Single-node (`discovery.type=single-node`)
- **Security**: Disabled (`xpack.security.enabled=false`)
- **JVM**: 512MB heap (`-Xms512m -Xmx512m`)
- **Persistence**: Named volume `elasticsearch_data`
- **Health check**: `/_cluster/health` every 15s
- **Usage**: Full-text search, data indexing

### MinIO (S3)
- **Persistence**: Named volume `minio_data`
- **API Port**: 9000
- **Console Port**: 9001
- **Usage**: File storage, document uploads, exports

## Deployment

### Deployment Script (`deploy.sh`)

```bash
./deploy.sh deploy    # Full deployment (prerequisites, infra, migrations, build, start)
./deploy.sh start     # Start all services
./deploy.sh stop      # Stop all services
./deploy.sh restart   # Stop + start
./deploy.sh status    # Show container status
./deploy.sh health    # Run health checks on all 13 services
./deploy.sh build     # Build all Docker images
./deploy.sh logs [svc] # Tail logs (optionally for specific service)
```

### Deployment Sequence
```
1. Check prerequisites (Docker, Docker Compose v2, .env file)
2. Start infrastructure (postgres, redis, elasticsearch, minio)
3. Wait for health checks (up to 120s)
4. Run database migrations (prisma migrate deploy)
5. Build all service Docker images (parallel build)
6. Start all services
7. Wait for health checks (up to 180s)
8. Run health check on all 13 service endpoints
```

### Health Check Endpoints
All 13 services expose `/health` on their respective ports:
```
data-service:8001, excel-service:8002, dashboard-service:8003,
reporting-service:8004, presentation-service:8005, infographic-service:8006,
replication-service:8007, localization-service:8008, ai-service:8009,
governance-service:8010, library-service:8011, template-service:8012,
conversion-service:8013
```

## Resource Limits

| Container | Memory | CPU |
|-----------|--------|-----|
| rendering-environment | 4GB | 2.0 |
| All other services | No explicit limit | No explicit limit |

## Nginx Gateway Configuration

- **Worker processes**: Auto (matches CPU cores)
- **Worker connections**: 1024
- **Client max body**: 500MB
- **Proxy timeouts**: Connect 60s, Read/Send 300s (reporting/conversion: 300s, AI: 600s)
- **Rate limiting**: 100r/s per IP, burst 50 (AI: burst 20)
- **Gzip**: Enabled for text, JSON, XML, JavaScript, SVG
- **Security headers**: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy
- **WebSocket support**: Upgrade connection for frontend HMR
- **SSE support**: Proxy buffering disabled for AI streaming
