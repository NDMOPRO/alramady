#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if command -v node >/dev/null 2>&1; then
  NODE_BIN="node"
elif command -v node.exe >/dev/null 2>&1; then
  NODE_BIN="node.exe"
else
  echo "runtime-integrity:failed (node runtime not found)" >&2
  exit 1
fi

"$NODE_BIN" ./scripts/check-runtime-integrity.mjs

if git grep -nEI '\bFIXME\b|\bPLACEHOLDER\b|return\s+true\s*//|return\s+["'"'"']?ok["'"'"']?\s*[;)]' -- services frontend packages \
  ':(exclude)**/__tests__/**' \
  ':(exclude)**/tests/**' \
  ':(exclude)**/e2e/**' \
  ':(exclude)**/*.sh' \
  ':(exclude)**/node_modules/**' \
  ':(exclude)**/dist/**' \
  ':(exclude)**/.next/**' \
  ':(exclude)**/docs/**' \
  ':(exclude)**/_app_legacy/**'
then
  echo "no-placeholders:failed" >&2
  exit 1
fi

echo "no-placeholders:ok"
