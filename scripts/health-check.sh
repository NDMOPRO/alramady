#!/bin/bash
# =============================================================================
# RASID Platform - Health Check Script
# =============================================================================
# Checks all 13 microservices, PostgreSQL, Redis, Elasticsearch, and MinIO.
# Usage: ./scripts/health-check.sh [--host=localhost] [--timeout=3]
# =============================================================================

set -uo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Parse arguments
HOST="localhost"
TIMEOUT=3
for arg in "$@"; do
    case "$arg" in
        --host=*) HOST="${arg#*=}" ;;
        --timeout=*) TIMEOUT="${arg#*=}" ;;
    esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Counters
TOTAL=0
PASSED=0
FAILED=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
print_header() {
    echo ""
    echo -e "${BOLD}============================================================${NC}"
    echo -e "${BOLD}  RASID PLATFORM - Health Check${NC}"
    echo -e "${BOLD}  Host: ${CYAN}${HOST}${NC}  |  Timeout: ${CYAN}${TIMEOUT}s${NC}"
    echo -e "${BOLD}  Time: ${CYAN}$(date -u '+%Y-%m-%dT%H:%M:%SZ')${NC}"
    echo -e "${BOLD}============================================================${NC}"
}

print_section() {
    echo ""
    echo -e "${BLUE}--- $1 ---${NC}"
}

check_http_service() {
    local name="$1"
    local url="$2"
    TOTAL=$((TOTAL + 1))

    local http_code
    local start_time
    local end_time
    local elapsed

    start_time=$(date +%s%N 2>/dev/null || date +%s)
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout "$TIMEOUT" --max-time "$TIMEOUT" "$url" 2>/dev/null) || http_code="000"
    end_time=$(date +%s%N 2>/dev/null || date +%s)

    # Calculate elapsed in ms (fallback to seconds if %N not supported)
    if [[ "$start_time" =~ ^[0-9]{10,}$ ]]; then
        elapsed=$(( (end_time - start_time) / 1000000 ))
    else
        elapsed=$(( (end_time - start_time) * 1000 ))
    fi

    if [[ "$http_code" =~ ^2[0-9]{2}$ ]]; then
        echo -e "  ${GREEN}PASS${NC}  ${name}  (HTTP ${http_code}, ${elapsed}ms)  ${url}"
        PASSED=$((PASSED + 1))
    else
        echo -e "  ${RED}FAIL${NC}  ${name}  (HTTP ${http_code}, ${elapsed}ms)  ${url}"
        FAILED=$((FAILED + 1))
    fi
}

check_postgres() {
    local pg_host="${1:-$HOST}"
    local pg_port="${2:-5432}"
    TOTAL=$((TOTAL + 1))

    if command -v pg_isready &>/dev/null; then
        if pg_isready -h "$pg_host" -p "$pg_port" -t "$TIMEOUT" &>/dev/null; then
            echo -e "  ${GREEN}PASS${NC}  PostgreSQL  (${pg_host}:${pg_port})"
            PASSED=$((PASSED + 1))
        else
            echo -e "  ${RED}FAIL${NC}  PostgreSQL  (${pg_host}:${pg_port} - not accepting connections)"
            FAILED=$((FAILED + 1))
        fi
    else
        # Fallback: try TCP connection
        if (echo > /dev/tcp/"$pg_host"/"$pg_port") 2>/dev/null; then
            echo -e "  ${GREEN}PASS${NC}  PostgreSQL  (${pg_host}:${pg_port}, TCP open)"
            PASSED=$((PASSED + 1))
        else
            echo -e "  ${RED}FAIL${NC}  PostgreSQL  (${pg_host}:${pg_port}, TCP closed)"
            FAILED=$((FAILED + 1))
        fi
    fi
}

check_redis() {
    local redis_host="${1:-$HOST}"
    local redis_port="${2:-6379}"
    TOTAL=$((TOTAL + 1))

    if command -v redis-cli &>/dev/null; then
        local pong
        pong=$(redis-cli -h "$redis_host" -p "$redis_port" --no-auth-warning ping 2>/dev/null)
        if [[ "$pong" == "PONG" ]]; then
            echo -e "  ${GREEN}PASS${NC}  Redis  (${redis_host}:${redis_port})"
            PASSED=$((PASSED + 1))
        else
            echo -e "  ${RED}FAIL${NC}  Redis  (${redis_host}:${redis_port} - no PONG response)"
            FAILED=$((FAILED + 1))
        fi
    else
        if (echo > /dev/tcp/"$redis_host"/"$redis_port") 2>/dev/null; then
            echo -e "  ${GREEN}PASS${NC}  Redis  (${redis_host}:${redis_port}, TCP open)"
            PASSED=$((PASSED + 1))
        else
            echo -e "  ${RED}FAIL${NC}  Redis  (${redis_host}:${redis_port}, TCP closed)"
            FAILED=$((FAILED + 1))
        fi
    fi
}

check_elasticsearch() {
    local es_host="${1:-$HOST}"
    local es_port="${2:-9200}"
    TOTAL=$((TOTAL + 1))

    local response
    response=$(curl -s --connect-timeout "$TIMEOUT" --max-time "$TIMEOUT" "http://${es_host}:${es_port}/_cluster/health" 2>/dev/null)

    if [[ $? -eq 0 ]] && echo "$response" | grep -q '"status"'; then
        local status
        status=$(echo "$response" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
        if [[ "$status" == "green" || "$status" == "yellow" ]]; then
            echo -e "  ${GREEN}PASS${NC}  Elasticsearch  (${es_host}:${es_port}, cluster: ${status})"
            PASSED=$((PASSED + 1))
        else
            echo -e "  ${RED}FAIL${NC}  Elasticsearch  (${es_host}:${es_port}, cluster: ${status})"
            FAILED=$((FAILED + 1))
        fi
    else
        echo -e "  ${RED}FAIL${NC}  Elasticsearch  (${es_host}:${es_port} - not reachable)"
        FAILED=$((FAILED + 1))
    fi
}

check_minio() {
    local minio_host="${1:-$HOST}"
    local minio_port="${2:-9000}"
    TOTAL=$((TOTAL + 1))

    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout "$TIMEOUT" --max-time "$TIMEOUT" "http://${minio_host}:${minio_port}/minio/health/live" 2>/dev/null) || http_code="000"

    if [[ "$http_code" =~ ^2[0-9]{2}$ ]]; then
        echo -e "  ${GREEN}PASS${NC}  MinIO  (${minio_host}:${minio_port})"
        PASSED=$((PASSED + 1))
    else
        echo -e "  ${RED}FAIL${NC}  MinIO  (${minio_host}:${minio_port}, HTTP ${http_code})"
        FAILED=$((FAILED + 1))
    fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
print_header

# --- Microservices (13) ---
print_section "Microservices (13)"

declare -A SERVICES=(
    ["Data Engine (8001)"]="http://${HOST}:8001/health"
    ["Excel Engine (8002)"]="http://${HOST}:8002/health"
    ["Dashboard Engine (8003)"]="http://${HOST}:8003/health"
    ["Reporting Engine (8004)"]="http://${HOST}:8004/health"
    ["Presentation Engine (8005)"]="http://${HOST}:8005/health"
    ["Infographic Engine (8006)"]="http://${HOST}:8006/health"
    ["Replication Engine (8007)"]="http://${HOST}:8007/health"
    ["Localization Engine (8008)"]="http://${HOST}:8008/health"
    ["AI Engine (8009)"]="http://${HOST}:8009/health"
    ["Governance Engine (8010)"]="http://${HOST}:8010/health"
    ["Library Engine (8011)"]="http://${HOST}:8011/health"
    ["Template Engine (8012)"]="http://${HOST}:8012/health"
    ["Conversion Engine (8013)"]="http://${HOST}:8013/health"
)

# Iterate in port order
for port in 8001 8002 8003 8004 8005 8006 8007 8008 8009 8010 8011 8012 8013; do
    for name in "${!SERVICES[@]}"; do
        if [[ "$name" == *"(${port})"* ]]; then
            check_http_service "$name" "${SERVICES[$name]}"
        fi
    done
done

# --- Infrastructure ---
print_section "Infrastructure"

check_postgres "$HOST" 5432
check_redis "$HOST" 6379
check_elasticsearch "$HOST" 9200
check_minio "$HOST" 9000

# --- Gateway ---
print_section "Gateway"
check_http_service "Nginx Gateway (80)" "http://${HOST}:80/health"

# --- Summary ---
echo ""
echo -e "${BOLD}============================================================${NC}"
if [[ $FAILED -eq 0 ]]; then
    echo -e "  ${GREEN}${BOLD}ALL CHECKS PASSED${NC}  (${PASSED}/${TOTAL} services healthy)"
else
    echo -e "  ${RED}${BOLD}${FAILED} CHECK(S) FAILED${NC}  (${PASSED}/${TOTAL} healthy, ${FAILED} down)"
fi
echo -e "${BOLD}============================================================${NC}"
echo ""

if [[ $FAILED -gt 0 ]]; then
    exit 1
fi
exit 0
