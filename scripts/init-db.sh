#!/bin/bash
# =============================================================================
# RASID Platform - Database Initialization Script
# =============================================================================
# Waits for PostgreSQL, runs Prisma migrations, seeds the database,
# creates MinIO buckets, and creates Elasticsearch indices.
# Usage: ./scripts/init-db.sh
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

export DATABASE_URL="${DATABASE_URL:-postgresql://rasid:rasid_secret_2024@localhost:5432/rasid_db}"
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-rasid}"

MINIO_HOST="${MINIO_HOST:-localhost}"
MINIO_PORT="${MINIO_PORT:-9000}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-rasid_minio}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-rasid_minio_secret}"
MINIO_BUCKET="${MINIO_BUCKET:-rasid-assets}"

ES_HOST="${ES_HOST:-localhost}"
ES_PORT="${ES_PORT:-9200}"

MAX_RETRIES=30
RETRY_INTERVAL=2

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log_info()    { echo -e "${BLUE}[INFO]${NC}    $*"; }
log_success() { echo -e "${GREEN}[OK]${NC}      $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}    $*"; }
log_error()   { echo -e "${RED}[ERROR]${NC}   $*"; }
log_step()    { echo -e "\n${BOLD}>>> $*${NC}"; }

# ---------------------------------------------------------------------------
# Step 1: Wait for PostgreSQL
# ---------------------------------------------------------------------------
wait_for_postgres() {
    log_step "Waiting for PostgreSQL at ${PG_HOST}:${PG_PORT}..."
    local attempt=1

    while [ $attempt -le $MAX_RETRIES ]; do
        if command -v pg_isready &>/dev/null; then
            if pg_isready -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -t 2 &>/dev/null; then
                log_success "PostgreSQL is ready (attempt ${attempt}/${MAX_RETRIES})"
                return 0
            fi
        else
            # Fallback: TCP check
            if (echo > /dev/tcp/"$PG_HOST"/"$PG_PORT") 2>/dev/null; then
                log_success "PostgreSQL port is open (attempt ${attempt}/${MAX_RETRIES})"
                return 0
            fi
        fi

        log_info "Attempt ${attempt}/${MAX_RETRIES} - PostgreSQL not ready, retrying in ${RETRY_INTERVAL}s..."
        sleep "$RETRY_INTERVAL"
        attempt=$((attempt + 1))
    done

    log_error "PostgreSQL did not become ready after ${MAX_RETRIES} attempts"
    exit 1
}

# ---------------------------------------------------------------------------
# Step 2: Run Prisma migrations
# ---------------------------------------------------------------------------
run_prisma_migrations() {
    log_step "Running Prisma migrations..."
    cd "$PROJECT_ROOT"

    if [ ! -f "$PROJECT_ROOT/prisma/schema.prisma" ]; then
        log_warn "prisma/schema.prisma not found, skipping migrations"
        return 0
    fi

    if ! command -v npx &>/dev/null; then
        log_error "npx not found. Please install Node.js >= 18."
        exit 1
    fi

    log_info "Running: npx prisma migrate deploy"
    if npx prisma migrate deploy; then
        log_success "Prisma migrations applied successfully"
    else
        log_error "Prisma migrate deploy failed"
        exit 1
    fi

    log_info "Generating Prisma client..."
    npx prisma generate
    log_success "Prisma client generated"
}

# ---------------------------------------------------------------------------
# Step 3: Seed database (if seed file exists)
# ---------------------------------------------------------------------------
seed_database() {
    log_step "Checking for database seed..."
    cd "$PROJECT_ROOT"

    local seed_file=""
    if [ -f "$PROJECT_ROOT/prisma/seed.ts" ]; then
        seed_file="$PROJECT_ROOT/prisma/seed.ts"
    elif [ -f "$SCRIPT_DIR/seed-database.ts" ]; then
        seed_file="$SCRIPT_DIR/seed-database.ts"
    elif [ -f "$PROJECT_ROOT/prisma/seed.js" ]; then
        seed_file="$PROJECT_ROOT/prisma/seed.js"
    fi

    if [ -n "$seed_file" ]; then
        log_info "Seed file found: $seed_file"
        log_info "Running: npx prisma db seed"
        if npx prisma db seed; then
            log_success "Database seeded successfully"
        else
            log_warn "Seed failed (non-fatal), continuing..."
        fi
    else
        log_warn "No seed file found (checked prisma/seed.ts, scripts/seed-database.ts, prisma/seed.js)"
        log_info "Skipping database seeding"
    fi
}

# ---------------------------------------------------------------------------
# Step 4: Create MinIO bucket
# ---------------------------------------------------------------------------
create_minio_bucket() {
    log_step "Setting up MinIO bucket: ${MINIO_BUCKET}..."

    local minio_url="http://${MINIO_HOST}:${MINIO_PORT}"

    # Check if MinIO is reachable
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "${minio_url}/minio/health/live" 2>/dev/null) || http_code="000"

    if [[ "$http_code" != "200" ]]; then
        log_warn "MinIO is not reachable at ${minio_url} (HTTP ${http_code}), skipping bucket creation"
        return 0
    fi

    if command -v mc &>/dev/null; then
        # Use MinIO client (mc)
        log_info "Configuring MinIO client alias..."
        mc alias set rasid "$minio_url" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" --api S3v4 2>/dev/null || true

        if mc ls "rasid/${MINIO_BUCKET}" &>/dev/null; then
            log_info "Bucket '${MINIO_BUCKET}' already exists"
        else
            log_info "Creating bucket '${MINIO_BUCKET}'..."
            if mc mb "rasid/${MINIO_BUCKET}"; then
                log_success "Bucket '${MINIO_BUCKET}' created"
            else
                log_warn "Failed to create bucket (non-fatal)"
            fi
        fi

        # Set bucket policy to allow read access
        log_info "Setting bucket policy to download (public read)..."
        mc anonymous set download "rasid/${MINIO_BUCKET}" 2>/dev/null || true
        log_success "MinIO bucket configured"
    else
        # Fallback: use the S3 API directly via curl
        log_info "mc (MinIO client) not found, using curl to create bucket..."
        local date_header
        date_header=$(date -R 2>/dev/null || date)

        local create_response
        create_response=$(curl -s -o /dev/null -w "%{http_code}" \
            -X PUT "http://${MINIO_HOST}:${MINIO_PORT}/${MINIO_BUCKET}" \
            -H "Host: ${MINIO_HOST}:${MINIO_PORT}" \
            --connect-timeout 5 \
            -u "${MINIO_ACCESS_KEY}:${MINIO_SECRET_KEY}" \
            2>/dev/null) || create_response="000"

        if [[ "$create_response" == "200" || "$create_response" == "409" ]]; then
            log_success "MinIO bucket '${MINIO_BUCKET}' ready (HTTP ${create_response})"
        else
            log_warn "MinIO bucket creation returned HTTP ${create_response} (non-fatal)"
        fi
    fi
}

# ---------------------------------------------------------------------------
# Step 5: Create Elasticsearch indices
# ---------------------------------------------------------------------------
create_elasticsearch_indices() {
    log_step "Setting up Elasticsearch indices..."

    local es_url="http://${ES_HOST}:${ES_PORT}"

    # Check if Elasticsearch is reachable
    local es_status
    es_status=$(curl -s --connect-timeout 5 "${es_url}/_cluster/health" 2>/dev/null) || es_status=""

    if [ -z "$es_status" ]; then
        log_warn "Elasticsearch is not reachable at ${es_url}, skipping index creation"
        return 0
    fi

    # Define indices with their mappings
    declare -A INDICES

    INDICES["rasid-datasets"]='{
        "settings": {
            "number_of_shards": 2,
            "number_of_replicas": 1,
            "analysis": {
                "analyzer": {
                    "arabic_english": {
                        "type": "custom",
                        "tokenizer": "standard",
                        "filter": ["lowercase", "arabic_normalization", "arabic_stemmer"]
                    }
                },
                "filter": {
                    "arabic_stemmer": { "type": "stemmer", "language": "arabic" }
                }
            }
        },
        "mappings": {
            "properties": {
                "id":          { "type": "keyword" },
                "name":        { "type": "text", "analyzer": "arabic_english" },
                "description": { "type": "text", "analyzer": "arabic_english" },
                "tags":        { "type": "keyword" },
                "owner_id":    { "type": "keyword" },
                "org_id":      { "type": "keyword" },
                "created_at":  { "type": "date" },
                "updated_at":  { "type": "date" },
                "row_count":   { "type": "long" },
                "col_count":   { "type": "integer" },
                "file_type":   { "type": "keyword" },
                "status":      { "type": "keyword" }
            }
        }
    }'

    INDICES["rasid-reports"]='{
        "settings": {
            "number_of_shards": 2,
            "number_of_replicas": 1
        },
        "mappings": {
            "properties": {
                "id":          { "type": "keyword" },
                "title":       { "type": "text", "analyzer": "standard" },
                "description": { "type": "text", "analyzer": "standard" },
                "type":        { "type": "keyword" },
                "format":      { "type": "keyword" },
                "owner_id":    { "type": "keyword" },
                "org_id":      { "type": "keyword" },
                "created_at":  { "type": "date" },
                "updated_at":  { "type": "date" },
                "tags":        { "type": "keyword" },
                "status":      { "type": "keyword" },
                "page_count":  { "type": "integer" }
            }
        }
    }'

    INDICES["rasid-assets"]='{
        "settings": {
            "number_of_shards": 1,
            "number_of_replicas": 1
        },
        "mappings": {
            "properties": {
                "id":          { "type": "keyword" },
                "name":        { "type": "text" },
                "description": { "type": "text" },
                "asset_type":  { "type": "keyword" },
                "mime_type":   { "type": "keyword" },
                "file_size":   { "type": "long" },
                "owner_id":    { "type": "keyword" },
                "org_id":      { "type": "keyword" },
                "created_at":  { "type": "date" },
                "updated_at":  { "type": "date" },
                "tags":        { "type": "keyword" },
                "path":        { "type": "keyword" }
            }
        }
    }'

    for index_name in "rasid-datasets" "rasid-reports" "rasid-assets"; do
        local body="${INDICES[$index_name]}"
        log_info "Creating index: ${index_name}..."

        local response
        response=$(curl -s -o /dev/null -w "%{http_code}" \
            -X PUT "${es_url}/${index_name}" \
            -H "Content-Type: application/json" \
            -d "$body" \
            --connect-timeout 5 \
            2>/dev/null) || response="000"

        if [[ "$response" == "200" ]]; then
            log_success "Index '${index_name}' created"
        elif [[ "$response" == "400" ]]; then
            log_info "Index '${index_name}' already exists (skipped)"
        else
            log_warn "Index '${index_name}' creation returned HTTP ${response}"
        fi
    done

    log_success "Elasticsearch indices configured"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}============================================================${NC}"
echo -e "${BOLD}  RASID PLATFORM - Database & Infrastructure Init${NC}"
echo -e "${BOLD}============================================================${NC}"
echo -e "  PostgreSQL:    ${PG_HOST}:${PG_PORT}"
echo -e "  MinIO:         ${MINIO_HOST}:${MINIO_PORT}"
echo -e "  Elasticsearch: ${ES_HOST}:${ES_PORT}"
echo -e "  Database URL:  ${DATABASE_URL//:*@//:***@}"
echo -e "${BOLD}============================================================${NC}"

wait_for_postgres
run_prisma_migrations
seed_database
create_minio_bucket
create_elasticsearch_indices

echo ""
echo -e "${BOLD}============================================================${NC}"
echo -e "  ${GREEN}${BOLD}INITIALIZATION COMPLETE${NC}"
echo -e "${BOLD}============================================================${NC}"
echo ""
