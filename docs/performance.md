# Rasid Platform - Performance & Scaling Documentation

## Performance-Sensitive Components

### 1. Rendering Environment (rendering-environment:8014)
- **Impact**: Highest resource consumer (4GB RAM, 2 CPUs)
- **Bottleneck**: Chromium rendering is CPU and memory intensive
- **Optimization**:
  - Persistent browser instance (reused across requests)
  - Pre-warmed on startup
  - Network blocking reduces rendering time
  - Deterministic settings (no anti-aliasing, no subpixel rendering)

### 2. AI Service (ai-service:8009)
- **Impact**: External API latency (OpenAI) is dominant factor
- **Bottleneck**: GPT-4o API calls (~2-10s per request)
- **Optimization**:
  - SSE streaming for real-time response display
  - Embedding cache in Redis
  - Knowledge chunk pre-computation
  - Lower rate limit burst (20 vs 50)
  - Extended proxy timeout (600s)

### 3. Data Service (data-service:8001)
- **Impact**: File ingestion can process large files (500MB+)
- **Bottleneck**: OCR processing, large file parsing
- **Optimization**:
  - Resumable uploads for large files
  - Chunked processing
  - Elasticsearch for search offloading
  - MinIO for file storage (not database)

### 4. Conversion Service (conversion-service:8013)
- **Impact**: Format conversion is CPU-intensive
- **Bottleneck**: PDF processing, OCR, image manipulation
- **Optimization**:
  - Batch conversion pipeline with queue
  - Extended proxy timeout (300s)
  - Parallel batch execution

## Caching Strategy

### Redis Caching (512MB, LRU eviction)

| Cache Type | TTL | Key Pattern | Service |
|-----------|-----|-------------|---------|
| Query results | Variable | `cache:{service}:{hash}` | All services |
| Session data | Token TTL | `session:{userId}` | governance |
| Rate limit | Window size | `ratelimit:{ip}` | All services |
| Embeddings | 24h | `embedding:{hash}` | ai-service |
| Translation memory | 7d | `tm:{lang}:{hash}` | localization |
| Dashboard state | 5m | `dash:{id}` | dashboard |
| KPI calculations | 15m | `kpi:{id}` | data-service |

### Eviction Policy
- `maxmemory-policy allkeys-lru`: Least Recently Used eviction across all keys
- Ensures cache stays within 512MB limit
- Critical data (sessions) should use shorter TTLs to stay hot

## Scaling Strategy

### Horizontal Scaling

All microservices are **stateless** and can be horizontally scaled:

```bash
# Scale a specific service
docker compose up -d --scale ai-service=3
```

Nginx upstream blocks support multiple instances natively.

### Vertical Scaling Priorities

| Priority | Component | Current | Recommendation |
|----------|-----------|---------|----------------|
| 1 | PostgreSQL | Default | 4GB+ RAM, SSD storage |
| 2 | Rendering Environment | 4GB RAM, 2 CPU | Scale horizontally for throughput |
| 3 | Redis | 512MB | 1-2GB for production |
| 4 | Elasticsearch | 512MB heap | 2GB+ heap for large indexes |
| 5 | AI Service | Default | Scale horizontally |

### Database Scaling

- **Read replicas**: Prisma supports read replicas via connection string
- **Connection pooling**: Prisma handles connection pooling automatically
- **Per-service schemas**: Natural sharding by service domain
- **Indexes**: Defined in Prisma schemas for common queries

## Concurrency Model

### Express.js (All Services)
- Single-threaded event loop per container
- Non-blocking I/O for database, Redis, HTTP operations
- Cluster mode possible via PM2 or Node.js cluster module

### BullMQ Workers
- Background job processing on Redis queues
- Configurable concurrency per worker
- Job retry with exponential backoff
- Dead letter queue for failed jobs

### Rendering Environment
- Single persistent Chromium browser per container
- One page per request (closed after render)
- Sequential rendering within container
- Scale horizontally for parallel rendering

## Request Timeouts

| Layer | Timeout | Component |
|-------|---------|-----------|
| Gateway | 60s connect | All services |
| Gateway | 120s read/send | Standard services |
| Gateway | 300s read/send | Reporting, Conversion |
| Gateway | 600s read/send | AI Service (streaming) |
| Service | 30s | Chromium page render |
| Service | Configurable | Prisma query timeout |

## Rate Limiting

### Nginx Level
- Zone: `api`, 100 requests/second per IP
- Burst: 50 (general), 20 (AI service)
- Policy: nodelay (process immediately or reject)

### Service Level
- Express rate limiter per service
- Default: 100 requests per 15-minute window
- Configurable via `RATE_LIMIT_WINDOW` and `RATE_LIMIT_MAX`

## Memory Management

### Per-Service Pattern
```javascript
// Health check reports memory usage
const memoryUsage = process.memoryUsage();
{
  rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
  heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
  heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
}
```

### Key Considerations
- File processing streams (not full buffer) where possible
- JSON body parser limited to 50MB
- Rendering environment has 4GB explicit limit
- Redis LRU eviction prevents cache memory overflow

## Monitoring Recommendations

### Metrics to Track
1. **Response time**: P50, P95, P99 per service
2. **Error rate**: 4xx, 5xx per service
3. **Throughput**: Requests/second per service
4. **Database**: Connection pool usage, query latency
5. **Redis**: Memory usage, hit rate, evictions
6. **Queue**: Job queue length, processing time
7. **Container**: CPU, memory, restart count

### Logging
- All services use Winston logger
- Structured JSON logging
- Log levels: error, warn, info, debug
- Nginx access logs with response time and upstream time

### Alerting Thresholds
| Metric | Warning | Critical |
|--------|---------|----------|
| Response P95 | > 5s | > 30s |
| Error rate | > 1% | > 5% |
| CPU usage | > 70% | > 90% |
| Memory usage | > 70% | > 90% |
| Queue length | > 100 | > 1000 |
| DB connections | > 70% pool | > 90% pool |
| Redis memory | > 400MB | > 480MB |

## Performance Optimization Checklist

- [ ] PostgreSQL: Proper indexes on tenantId, frequently queried columns
- [ ] Redis: Monitor eviction rate, increase memory if needed
- [ ] Elasticsearch: Tune JVM heap, shard configuration
- [ ] Nginx: Enable keepalive to upstreams
- [ ] Node.js: Enable cluster mode for CPU-bound services
- [ ] Rendering: Pre-warm browser, scale horizontally
- [ ] AI: Cache embeddings and common queries
- [ ] Files: Stream large files, use MinIO directly
- [ ] Database: Use Prisma includes judiciously, avoid N+1
- [ ] Frontend: Enable Next.js ISR/SSG for static pages
