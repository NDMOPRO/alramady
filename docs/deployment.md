# Rasid Platform - Deployment Guide

## Prerequisites

- Docker Engine 24+
- Docker Compose v2
- 16GB+ RAM recommended (rendering-environment alone needs 4GB)
- 50GB+ disk space for volumes
- `.env` file with all required environment variables

## Quick Start

```bash
# Clone and navigate to project
cd /path/to/rasid

# Copy environment template
cp .env.example .env
# Edit .env with production values

# Deploy everything
./deploy.sh deploy
```

## Step-by-Step Deployment

### 1. Environment Setup

Create `.env` file with all required variables:

```env
# Database
POSTGRES_USER=rasid
POSTGRES_PASSWORD=<secure-password>
POSTGRES_DB=rasid

# Connection URLs
DATABASE_URL=postgresql://rasid:<password>@postgres:5432/rasid
REDIS_URL=redis://redis:6379
ELASTICSEARCH_URL=http://elasticsearch:9200

# Object Storage
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=<access-key>
MINIO_SECRET_KEY=<secret-key>
MINIO_BUCKET=rasid-files

# Auth
JWT_SECRET=<256-bit-random-key>
JWT_REFRESH_SECRET=<256-bit-random-key>
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# AI
OPENAI_API_KEY=sk-<your-key>

# Email
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASS=<password>

# General
NODE_ENV=production
```

### 2. Start Infrastructure

```bash
docker compose up -d postgres redis elasticsearch minio
```

Wait for all 4 services to become healthy (~30s).

### 3. Run Migrations

```bash
docker compose run --rm data-service npx prisma migrate deploy
```

### 4. Build Services

```bash
docker compose build --parallel
```

### 5. Start All Services

```bash
docker compose up -d
```

### 6. Verify Deployment

```bash
./deploy.sh health
```

Expected output: all 13 services responding with health status.

## Port Map

| Port | Service |
|------|---------|
| 80 | Gateway (Nginx) |
| 3000 | Frontend (Next.js) |
| 5432 | PostgreSQL |
| 6379 | Redis |
| 8001 | Data Service |
| 8002 | Excel Service |
| 8003 | Dashboard Service |
| 8004 | Reporting Service |
| 8005 | Presentation Service |
| 8006 | Infographic Service |
| 8007 | Replication Service |
| 8008 | Localization Service |
| 8009 | AI Service |
| 8010 | Governance Service |
| 8011 | Library Service |
| 8012 | Template Service |
| 8013 | Conversion Service |
| 8014 | Rendering Environment |
| 9000 | MinIO API |
| 9001 | MinIO Console |
| 9200 | Elasticsearch |

## Operations

### View Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f data-service

# Last 100 lines
docker compose logs --tail 100 ai-service
```

### Restart a Service
```bash
docker compose restart excel-service
```

### Scale a Service
```bash
docker compose up -d --scale ai-service=3
```

### Database Operations
```bash
# Open Prisma Studio
docker compose exec data-service npx prisma studio

# Reset database (DESTRUCTIVE)
docker compose exec data-service npx prisma migrate reset

# Generate Prisma client
docker compose exec data-service npx prisma generate
```

### Backup
```bash
# PostgreSQL dump
docker exec rasid-postgres pg_dump -U rasid rasid > backup.sql

# Redis snapshot
docker exec rasid-redis redis-cli BGSAVE
```

## Monitoring

### Health Checks
Each service exposes `GET /health` returning:
```json
{
  "status": "healthy",
  "service": "data-service",
  "version": "1.0.0",
  "timestamp": "2026-03-06T00:00:00.000Z",
  "uptime": 3600,
  "memory": { "rss": "128MB", "heapUsed": "64MB" },
  "connections": { "database": "connected", "redis": "connected" }
}
```

### Docker Health Checks
All services have Docker health checks configured:
- Interval: 15s
- Timeout: 10s
- Retries: 3

### Nginx Access Logs
```
$remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent
"$http_referer" "$http_user_agent" rt=$request_time urt=$upstream_response_time
```

## Troubleshooting

### Service won't start
```bash
# Check logs
docker compose logs data-service

# Check dependencies
docker compose ps postgres redis

# Verify .env
docker compose config
```

### Database connection issues
```bash
# Test PostgreSQL
docker exec rasid-postgres pg_isready -U rasid -d rasid

# Check DATABASE_URL
docker compose exec data-service env | grep DATABASE_URL
```

### Redis connection issues
```bash
# Test Redis
docker exec rasid-redis redis-cli ping

# Check memory
docker exec rasid-redis redis-cli info memory
```

### Out of memory
```bash
# Check container memory
docker stats --no-stream

# rendering-environment is memory-intensive (4GB limit)
# Consider reducing DPI or increasing memory limit
```
