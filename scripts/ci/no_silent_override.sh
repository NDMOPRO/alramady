#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if git grep -nEI 'rewrite[_-]?prompt|sanitize[_-]?prompt|swap[_-]?action|override[_-]?tool|bypass[_-]?policy' -- services frontend packages \
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
  echo "no-silent-override:failed" >&2
  exit 1
fi

echo "no-silent-override:ok"
