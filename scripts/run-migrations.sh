#!/usr/bin/env bash
#
# Rasid Platform - Run Prisma Migrations
#
# Usage:
#   ./scripts/run-migrations.sh                 # Run pending migrations
#   ./scripts/run-migrations.sh --reset         # Reset and re-apply all
#   ./scripts/run-migrations.sh --status        # Show migration status
#   ./scripts/run-migrations.sh --generate NAME # Generate a new migration
#   ./scripts/run-migrations.sh --seed          # Run migrations then seed
#

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PRISMA_DIR="$PROJECT_ROOT/prisma"

# Default DATABASE_URL if not set
export DATABASE_URL="${DATABASE_URL:-postgresql://rasid:rasid_secret_2024@localhost:5432/rasid_db}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v npx &> /dev/null; then
        log_error "npx not found. Please install Node.js >= 18."
        exit 1
    fi

    if [ ! -d "$PRISMA_DIR" ]; then
        log_warn "Prisma directory not found at $PRISMA_DIR"
        log_info "Creating Prisma directory..."
        mkdir -p "$PRISMA_DIR"
    fi

    if [ ! -f "$PRISMA_DIR/schema.prisma" ]; then
        log_warn "schema.prisma not found. Please create it first."
        log_info "Expected location: $PRISMA_DIR/schema.prisma"
        exit 1
    fi

    log_success "Prerequisites OK"
}

wait_for_database() {
    log_info "Waiting for database to be ready..."
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if npx prisma db execute --stdin <<< "SELECT 1;" &> /dev/null 2>&1; then
            log_success "Database is ready"
            return 0
        fi
        log_info "  Attempt $attempt/$max_attempts - waiting 2s..."
        sleep 2
        attempt=$((attempt + 1))
    done

    log_error "Database not ready after $max_attempts attempts"
    exit 1
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

run_migrate() {
    log_info "Running pending migrations..."
    cd "$PROJECT_ROOT"

    npx prisma migrate deploy

    log_success "Migrations applied successfully"
}

run_migrate_dev() {
    local name="${1:-auto}"
    log_info "Generating and applying migration: $name"
    cd "$PROJECT_ROOT"

    npx prisma migrate dev --name "$name"

    log_success "Migration '$name' created and applied"
}

run_reset() {
    log_warn "This will DROP all data and re-apply all migrations!"
    read -r -p "Are you sure? (y/N): " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        log_info "Aborted."
        exit 0
    fi

    log_info "Resetting database..."
    cd "$PROJECT_ROOT"

    npx prisma migrate reset --force

    log_success "Database reset complete"
}

run_status() {
    log_info "Migration status:"
    cd "$PROJECT_ROOT"

    npx prisma migrate status

    echo ""
    log_info "Prisma schema validation:"
    npx prisma validate
}

run_generate_client() {
    log_info "Generating Prisma client..."
    cd "$PROJECT_ROOT"

    npx prisma generate

    log_success "Prisma client generated"
}

run_seed() {
    log_info "Running database seed..."
    cd "$PROJECT_ROOT"

    if [ -f "$SCRIPT_DIR/seed-database.ts" ]; then
        npx tsx "$SCRIPT_DIR/seed-database.ts"
        log_success "Seed complete"
    else
        log_warn "Seed script not found at $SCRIPT_DIR/seed-database.ts"
    fi
}

run_studio() {
    log_info "Starting Prisma Studio..."
    cd "$PROJECT_ROOT"

    npx prisma studio
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

echo "============================================================"
echo "  RASID PLATFORM - Database Migration Tool"
echo "============================================================"
echo "  Database: ${DATABASE_URL//:*@//:***@}"
echo "  Prisma:   $PRISMA_DIR"
echo "============================================================"
echo ""

ACTION="${1:-migrate}"

case "$ACTION" in
    --reset|reset)
        check_prerequisites
        wait_for_database
        run_reset
        ;;
    --status|status)
        check_prerequisites
        run_status
        ;;
    --generate|generate)
        check_prerequisites
        wait_for_database
        MIGRATION_NAME="${2:?Migration name required. Usage: $0 --generate <name>}"
        run_migrate_dev "$MIGRATION_NAME"
        ;;
    --seed|seed)
        check_prerequisites
        wait_for_database
        run_migrate
        run_seed
        ;;
    --client|client)
        check_prerequisites
        run_generate_client
        ;;
    --studio|studio)
        check_prerequisites
        run_studio
        ;;
    --full|full)
        check_prerequisites
        wait_for_database
        run_migrate
        run_generate_client
        run_seed
        log_success "Full migration pipeline complete"
        ;;
    migrate|--migrate|"")
        check_prerequisites
        wait_for_database
        run_migrate
        run_generate_client
        ;;
    --help|help|-h)
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  (default)       Run pending migrations and generate client"
        echo "  --status        Show migration status"
        echo "  --reset         Reset database (DROP all data)"
        echo "  --generate NAME Generate a new migration"
        echo "  --seed          Run migrations then seed data"
        echo "  --client        Generate Prisma client only"
        echo "  --studio        Open Prisma Studio"
        echo "  --full          Migrate + generate client + seed"
        echo "  --help          Show this help"
        ;;
    *)
        log_error "Unknown command: $ACTION"
        echo "Run '$0 --help' for usage."
        exit 1
        ;;
esac
