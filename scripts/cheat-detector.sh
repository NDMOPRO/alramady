#!/bin/bash
# =============================================================================
# RASID Platform - Cheat Detector
# =============================================================================
# Runs 5 quality gate tests to detect placeholder/empty code:
#   TEST 1: Count empty returns (return {} in .ts files)
#   TEST 2: Count TODOs and placeholder markers
#   TEST 3: Count real library imports per service (must > 5)
#   TEST 4: Check file sizes (service files must > 200 lines)
#   TEST 5: Count Prisma operations (must > 30)
#
# Usage: ./scripts/cheat-detector.sh [phase_number]
# =============================================================================

set -uo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICES_DIR="$PROJECT_ROOT/services"
CHECKPOINT_DIR="$PROJECT_ROOT/.checkpoints"

PHASE="${1:-0}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Test results
TESTS_TOTAL=5
TESTS_PASSED=0
TESTS_FAILED=0

# Service list
SERVICES=(
    "data-service"
    "excel-service"
    "dashboard-service"
    "reporting-service"
    "presentation-service"
    "infographic-service"
    "replication-service"
    "localization-service"
    "ai-service"
    "governance-service"
    "library-service"
    "template-service"
    "conversion-service"
)

# Thresholds
MIN_IMPORTS_PER_SERVICE=5
MIN_FILE_LINES=200
MIN_PRISMA_OPERATIONS=30
MAX_EMPTY_RETURNS=10
MAX_TODOS=20

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
print_header() {
    echo ""
    echo -e "${BOLD}============================================================${NC}"
    echo -e "${BOLD}  RASID PLATFORM - Cheat Detector (Quality Gate)${NC}"
    echo -e "${BOLD}  Phase: ${CYAN}${PHASE}${NC}"
    echo -e "${BOLD}  Project: ${CYAN}${PROJECT_ROOT}${NC}"
    echo -e "${BOLD}  Time: ${CYAN}$(date -u '+%Y-%m-%dT%H:%M:%SZ')${NC}"
    echo -e "${BOLD}============================================================${NC}"
}

pass_test() {
    local test_num="$1"
    local message="$2"
    echo -e "  ${GREEN}PASS${NC}  TEST ${test_num}: ${message}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

fail_test() {
    local test_num="$1"
    local message="$2"
    echo -e "  ${RED}FAIL${NC}  TEST ${test_num}: ${message}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

info_line() {
    echo -e "        ${BLUE}>${NC} $*"
}

# ---------------------------------------------------------------------------
# TEST 1: Count empty returns (return {} in all .ts files)
# ---------------------------------------------------------------------------
run_test_1() {
    echo ""
    echo -e "${BOLD}--- TEST 1: Empty Returns ---${NC}"
    echo -e "  ${CYAN}Searching for 'return {}' and 'return []' patterns in .ts files${NC}"

    local empty_count=0

    if [ -d "$SERVICES_DIR" ]; then
        # Count occurrences of empty returns
        empty_count=$(find "$SERVICES_DIR" -name "*.ts" -not -path "*/node_modules/*" -not -path "*/dist/*" \
            -exec grep -c 'return\s*{}\|return\s*\[\]' {} + 2>/dev/null | \
            awk -F: '{sum += $NF} END {print sum+0}') || empty_count=0
    fi

    info_line "Empty returns found: ${empty_count} (max allowed: ${MAX_EMPTY_RETURNS})"

    if [ "$empty_count" -le "$MAX_EMPTY_RETURNS" ]; then
        pass_test 1 "Empty returns within threshold (${empty_count} <= ${MAX_EMPTY_RETURNS})"
    else
        fail_test 1 "Too many empty returns: ${empty_count} > ${MAX_EMPTY_RETURNS}"
    fi
}

# ---------------------------------------------------------------------------
# TEST 2: Count TODOs and placeholders
# ---------------------------------------------------------------------------
run_test_2() {
    echo ""
    echo -e "${BOLD}--- TEST 2: TODOs & Placeholders ---${NC}"
    echo -e "  ${CYAN}Searching for TODO, FIXME, PLACEHOLDER, STUB, HACK markers${NC}"

    local todo_count=0

    if [ -d "$SERVICES_DIR" ]; then
        todo_count=$(find "$SERVICES_DIR" -name "*.ts" -not -path "*/node_modules/*" -not -path "*/dist/*" \
            -exec grep -ci 'TODO\|FIXME\|PLACEHOLDER\|STUB\|HACK\|XXX\|NOT_IMPLEMENTED' {} + 2>/dev/null | \
            awk -F: '{sum += $NF} END {print sum+0}') || todo_count=0
    fi

    info_line "TODO/placeholder markers found: ${todo_count} (max allowed: ${MAX_TODOS})"

    # Show top offending files
    if [ -d "$SERVICES_DIR" ] && [ "$todo_count" -gt 0 ]; then
        echo -e "        ${YELLOW}Top files with markers:${NC}"
        find "$SERVICES_DIR" -name "*.ts" -not -path "*/node_modules/*" -not -path "*/dist/*" \
            -exec grep -ci 'TODO\|FIXME\|PLACEHOLDER\|STUB\|HACK\|XXX\|NOT_IMPLEMENTED' {} + 2>/dev/null | \
            sort -t: -k2 -nr | head -5 | while IFS=: read -r filepath count; do
                local relpath="${filepath#"$PROJECT_ROOT"/}"
                echo -e "          ${relpath}: ${count}"
            done
    fi

    if [ "$todo_count" -le "$MAX_TODOS" ]; then
        pass_test 2 "TODO/placeholders within threshold (${todo_count} <= ${MAX_TODOS})"
    else
        fail_test 2 "Too many TODOs/placeholders: ${todo_count} > ${MAX_TODOS}"
    fi
}

# ---------------------------------------------------------------------------
# TEST 3: Count real library imports per service (must > 5)
# ---------------------------------------------------------------------------
run_test_3() {
    echo ""
    echo -e "${BOLD}--- TEST 3: Real Library Imports per Service ---${NC}"
    echo -e "  ${CYAN}Each service must have > ${MIN_IMPORTS_PER_SERVICE} unique external library imports${NC}"

    local all_pass=true
    local services_checked=0
    local services_passed=0

    for svc in "${SERVICES[@]}"; do
        local svc_dir="$SERVICES_DIR/$svc"
        if [ ! -d "$svc_dir" ]; then
            info_line "${svc}: directory not found (skipped)"
            continue
        fi

        services_checked=$((services_checked + 1))

        # Count unique external imports (from node_modules, not relative paths)
        local import_count
        import_count=$(find "$svc_dir" -name "*.ts" -not -path "*/node_modules/*" -not -path "*/dist/*" \
            -exec grep -h "^import.*from\s*['\"]" {} + 2>/dev/null | \
            grep -v "from ['\"]\./" | \
            grep -v "from ['\"]\.\./" | \
            sed "s/.*from ['\"]//; s/['\"].*//" | \
            cut -d'/' -f1-2 | \
            sort -u | wc -l) || import_count=0

        import_count=$(echo "$import_count" | tr -d ' ')

        if [ "$import_count" -gt "$MIN_IMPORTS_PER_SERVICE" ]; then
            info_line "${svc}: ${import_count} unique imports  ${GREEN}OK${NC}"
            services_passed=$((services_passed + 1))
        else
            info_line "${svc}: ${import_count} unique imports  ${RED}LOW${NC}"
            all_pass=false
        fi
    done

    info_line "Services checked: ${services_checked}, passed: ${services_passed}"

    if $all_pass && [ "$services_checked" -gt 0 ]; then
        pass_test 3 "All services have sufficient library imports"
    elif [ "$services_checked" -eq 0 ]; then
        fail_test 3 "No service directories found"
    else
        fail_test 3 "Some services have too few library imports (< ${MIN_IMPORTS_PER_SERVICE})"
    fi
}

# ---------------------------------------------------------------------------
# TEST 4: Check file sizes (service files must > 200 lines)
# ---------------------------------------------------------------------------
run_test_4() {
    echo ""
    echo -e "${BOLD}--- TEST 4: File Sizes ---${NC}"
    echo -e "  ${CYAN}Key service files must be > ${MIN_FILE_LINES} lines${NC}"

    local small_files=0
    local checked_files=0

    for svc in "${SERVICES[@]}"; do
        local svc_dir="$SERVICES_DIR/$svc/src"
        if [ ! -d "$svc_dir" ]; then
            continue
        fi

        # Check main service files (routes, controllers, services)
        while IFS= read -r filepath; do
            [ -z "$filepath" ] && continue
            checked_files=$((checked_files + 1))

            local line_count
            line_count=$(wc -l < "$filepath" 2>/dev/null) || line_count=0
            line_count=$(echo "$line_count" | tr -d ' ')

            if [ "$line_count" -lt "$MIN_FILE_LINES" ]; then
                local relpath="${filepath#"$PROJECT_ROOT"/}"
                info_line "${RED}SHORT${NC} ${relpath}: ${line_count} lines"
                small_files=$((small_files + 1))
            fi
        done < <(find "$svc_dir" -name "*.ts" \
            \( -name "*.service.ts" -o -name "*.controller.ts" -o -name "*.routes.ts" -o -name "*.router.ts" \) \
            -not -path "*/node_modules/*" -not -path "*/dist/*" 2>/dev/null)
    done

    info_line "Files checked: ${checked_files}, undersized: ${small_files}"

    if [ "$checked_files" -eq 0 ]; then
        fail_test 4 "No service files found to check"
    elif [ "$small_files" -eq 0 ]; then
        pass_test 4 "All ${checked_files} service files meet minimum line count"
    else
        fail_test 4 "${small_files}/${checked_files} files below ${MIN_FILE_LINES} lines"
    fi
}

# ---------------------------------------------------------------------------
# TEST 5: Count Prisma operations (must > 30)
# ---------------------------------------------------------------------------
run_test_5() {
    echo ""
    echo -e "${BOLD}--- TEST 5: Prisma Operations ---${NC}"
    echo -e "  ${CYAN}Total Prisma DB operations must be > ${MIN_PRISMA_OPERATIONS}${NC}"

    local prisma_ops=0

    if [ -d "$SERVICES_DIR" ]; then
        # Count prisma method calls: create, findMany, findUnique, update, delete, upsert,
        # findFirst, updateMany, deleteMany, count, aggregate, groupBy, createMany
        prisma_ops=$(find "$SERVICES_DIR" -name "*.ts" -not -path "*/node_modules/*" -not -path "*/dist/*" \
            -exec grep -c 'prisma\.\w\+\.\(create\|findMany\|findUnique\|findFirst\|update\|delete\|upsert\|updateMany\|deleteMany\|count\|aggregate\|groupBy\|createMany\)' {} + 2>/dev/null | \
            awk -F: '{sum += $NF} END {print sum+0}') || prisma_ops=0
    fi

    info_line "Prisma operations found: ${prisma_ops} (minimum: ${MIN_PRISMA_OPERATIONS})"

    # Show breakdown per operation type
    if [ -d "$SERVICES_DIR" ] && [ "$prisma_ops" -gt 0 ]; then
        echo -e "        ${YELLOW}Breakdown:${NC}"
        for op in create findMany findUnique findFirst update delete upsert count aggregate; do
            local op_count
            op_count=$(find "$SERVICES_DIR" -name "*.ts" -not -path "*/node_modules/*" -not -path "*/dist/*" \
                -exec grep -c "prisma\.\w\+\.${op}" {} + 2>/dev/null | \
                awk -F: '{sum += $NF} END {print sum+0}') || op_count=0
            if [ "$op_count" -gt 0 ]; then
                echo -e "          ${op}: ${op_count}"
            fi
        done
    fi

    if [ "$prisma_ops" -ge "$MIN_PRISMA_OPERATIONS" ]; then
        pass_test 5 "Sufficient Prisma operations (${prisma_ops} >= ${MIN_PRISMA_OPERATIONS})"
    else
        fail_test 5 "Insufficient Prisma operations: ${prisma_ops} < ${MIN_PRISMA_OPERATIONS}"
    fi
}

# ---------------------------------------------------------------------------
# Write checkpoint JSON
# ---------------------------------------------------------------------------
write_checkpoint() {
    mkdir -p "$CHECKPOINT_DIR"

    local checkpoint_file="${CHECKPOINT_DIR}/phase-${PHASE}-cheat-check.json"
    local timestamp
    timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

    cat > "$checkpoint_file" <<CHECKPOINT_EOF
{
    "phase": ${PHASE},
    "timestamp": "${timestamp}",
    "result": "PASS",
    "tests": {
        "total": ${TESTS_TOTAL},
        "passed": ${TESTS_PASSED},
        "failed": ${TESTS_FAILED}
    },
    "thresholds": {
        "max_empty_returns": ${MAX_EMPTY_RETURNS},
        "max_todos": ${MAX_TODOS},
        "min_imports_per_service": ${MIN_IMPORTS_PER_SERVICE},
        "min_file_lines": ${MIN_FILE_LINES},
        "min_prisma_operations": ${MIN_PRISMA_OPERATIONS}
    },
    "project_root": "${PROJECT_ROOT}",
    "services_checked": $(printf '%s\n' "${SERVICES[@]}" | wc -l | tr -d ' ')
}
CHECKPOINT_EOF

    echo -e "  ${GREEN}Checkpoint written:${NC} ${checkpoint_file}"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
print_header

run_test_1
run_test_2
run_test_3
run_test_4
run_test_5

# --- Summary ---
echo ""
echo -e "${BOLD}============================================================${NC}"
echo -e "${BOLD}  RESULTS: Phase ${PHASE}${NC}"
echo -e "${BOLD}============================================================${NC}"
echo -e "  Tests passed: ${GREEN}${TESTS_PASSED}${NC} / ${TESTS_TOTAL}"
echo -e "  Tests failed: ${RED}${TESTS_FAILED}${NC} / ${TESTS_TOTAL}"

if [ "$TESTS_FAILED" -eq 0 ]; then
    echo ""
    echo -e "  ${GREEN}${BOLD}ALL QUALITY GATES PASSED${NC}"
    echo ""
    write_checkpoint
    echo ""
    exit 0
else
    echo ""
    echo -e "  ${RED}${BOLD}QUALITY GATE FAILED - ${TESTS_FAILED} test(s) did not pass${NC}"
    echo -e "  ${YELLOW}Fix the issues above and re-run this script.${NC}"
    echo ""
    exit 1
fi
