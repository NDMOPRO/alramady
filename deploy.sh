#!/bin/bash
# ═══════════════════════════════════════════════
# RASID Platform — Deployment Script
# ═══════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()   { echo -e "${GREEN}[RASID]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ─── Check Prerequisites ───
check_prerequisites() {
    log "Checking prerequisites..."
    command -v docker >/dev/null 2>&1 || error "Docker is not installed"
    command -v docker compose version >/dev/null 2>&1 || error "Docker Compose v2 is required"

    if [ ! -f .env ]; then
        if [ -f .env.example ]; then
            warn ".env not found. Copying from .env.example..."
            cp .env.example .env
            warn "Please edit .env with production values before deploying!"
        else
            error ".env file not found"
        fi
    fi
    log "Prerequisites OK"
}

# ─── Start Infrastructure ───
start_infrastructure() {
    log "Starting infrastructure services..."
    docker compose up -d postgres redis elasticsearch minio

    log "Waiting for infrastructure health checks..."
    local max_wait=120
    local waited=0
    while [ $waited -lt $max_wait ]; do
        local healthy=$(docker compose ps --format json 2>/dev/null | grep -c '"healthy"' || true)
        if [ "$healthy" -ge 4 ]; then
            log "All infrastructure services are healthy"
            return 0
        fi
        sleep 5
        waited=$((waited + 5))
        echo -n "."
    done
    error "Infrastructure services failed to become healthy within ${max_wait}s"
}

# ─── Run Database Migrations ───
run_migrations() {
    log "Running database migrations..."
    docker compose run --rm data-service npx prisma migrate deploy
    log "Migrations complete"
}

# ─── Build Services ───
build_services() {
    log "Building all services..."
    docker compose build --parallel
    log "Build complete"
}

# ─── Start All Services ───
start_services() {
    log "Starting all microservices..."
    docker compose up -d

    log "Waiting for services to become healthy..."
    local max_wait=180
    local waited=0
    local total_services=13
    while [ $waited -lt $max_wait ]; do
        local healthy=$(docker compose ps --format json 2>/dev/null | grep -c '"healthy"' || true)
        if [ "$healthy" -ge $((total_services + 4)) ]; then
            log "All services are healthy!"
            return 0
        fi
        sleep 5
        waited=$((waited + 5))
        echo -ne "\r  Healthy: $healthy / $((total_services + 4)) (${waited}s)"
    done
    echo
    warn "Some services may not be healthy yet. Check: docker compose ps"
}

# ─── Health Check ───
health_check() {
    log "Running health checks..."
    local failed=0
    local services=(
        "data-service:8001"
        "excel-service:8002"
        "dashboard-service:8003"
        "reporting-service:8004"
        "presentation-service:8005"
        "infographic-service:8006"
        "replication-service:8007"
        "localization-service:8008"
        "ai-service:8009"
        "governance-service:8010"
        "library-service:8011"
        "template-service:8012"
        "conversion-service:8013"
    )

    for svc in "${services[@]}"; do
        IFS=':' read -r name port <<< "$svc"
        if curl -sf "http://localhost:$port/health" >/dev/null 2>&1; then
            echo -e "  ${GREEN}✓${NC} $name (port $port)"
        else
            echo -e "  ${RED}✗${NC} $name (port $port)"
            failed=$((failed + 1))
        fi
    done

    if [ $failed -eq 0 ]; then
        log "All 13 services are responding!"
    else
        warn "$failed service(s) not responding"
    fi
}

# ─── Stop ───
stop_all() {
    log "Stopping all services..."
    docker compose down
    log "All services stopped"
}

# ─── Status ───
show_status() {
    log "Platform Status:"
    docker compose ps
}

# ─── Main ───
case "${1:-deploy}" in
    deploy)
        log "═══ RASID Platform Deployment ═══"
        check_prerequisites
        start_infrastructure
        run_migrations
        build_services
        start_services
        health_check
        log "═══ Deployment Complete ═══"
        ;;
    start)
        docker compose up -d
        health_check
        ;;
    stop)
        stop_all
        ;;
    restart)
        stop_all
        docker compose up -d
        health_check
        ;;
    status)
        show_status
        ;;
    health)
        health_check
        ;;
    build)
        build_services
        ;;
    logs)
        docker compose logs -f "${2:-}"
        ;;
    *)
        echo "Usage: $0 {deploy|start|stop|restart|status|health|build|logs [service]}"
        exit 1
        ;;
esac
