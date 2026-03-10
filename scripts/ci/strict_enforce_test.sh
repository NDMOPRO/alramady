#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

npm --prefix services/replication-service run test -- --runTestsByPath src/__tests__/strict-contracts.test.ts src/__tests__/strict-pipeline.test.ts

echo "strict-enforce:ok"
