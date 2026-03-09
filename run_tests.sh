#!/bin/bash
set -e

# Get fresh token
RESP=$(printf '{"email":"admin","password":"1500"}' | curl -s -X POST http://localhost/api/v1/governance/auth/login -H 'Content-Type: application/json' -d @-)
TOKEN=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "LOGIN FAILED"
  echo "$RESP"
  exit 1
fi

echo "T1_LOGIN: PASS (${#TOKEN} chars)"

# Helper function
test_endpoint() {
  local name="$1"
  local result="$2"
  local success=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print('1' if d.get('success') else '0')" 2>/dev/null)
  local summary=$(echo "$result" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin),ensure_ascii=False)[:250])" 2>/dev/null)
  if [ "$success" = "1" ]; then
    echo "${name}: PASS - ${summary}"
  else
    echo "${name}: FAIL - ${summary}"
  fi
}

# T3: Observer
R=$(curl -s -X POST http://localhost/observer/command -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"query":"مرحبا"}' 2>/dev/null)
test_endpoint "T3_OBSERVER" "$R"

# T4: Data
R=$(curl -s http://localhost/api/v1/data/tables -H "Authorization: Bearer $TOKEN" 2>/dev/null)
test_endpoint "T4_DATA" "$R"

# T5: AI NLP
R=$(curl -s -X POST http://localhost/api/v1/ai/nlp/sentiment -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"text":"This is amazing","language":"en"}' 2>/dev/null)
test_endpoint "T5_AI_NLP" "$R"

# T6: Dashboard
R=$(curl -s http://localhost/api/v1/dashboard/dashboards -H "Authorization: Bearer $TOKEN" 2>/dev/null)
test_endpoint "T6_DASHBOARD" "$R"

# T7: Reporting
R=$(curl -s http://localhost/api/v1/reporting/reports -H "Authorization: Bearer $TOKEN" 2>/dev/null)
test_endpoint "T7_REPORTING" "$R"

# T8: Excel
R=$(curl -s -X POST http://localhost/api/v1/excel/workbooks -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"name":"Test","sheets":[{"name":"Sheet1"}],"tenantId":"a0000000-0000-0000-0000-000000000001"}' 2>/dev/null)
test_endpoint "T8_EXCEL" "$R"

# T9: Conversion
R=$(curl -s http://localhost:8013/health 2>/dev/null)
C9=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('1' if d.get('status')=='healthy' else '0')" 2>/dev/null)
if [ "$C9" = "1" ]; then echo "T9_CONVERSION: PASS - healthy"; else test_endpoint "T9_CONVERSION" "$R"; fi

# T10: Governance
R=$(curl -s http://localhost/api/v1/governance/auth/audit -H "Authorization: Bearer $TOKEN" 2>/dev/null)
test_endpoint "T10_GOVERNANCE" "$R"

# T11: Localization
R=$(curl -s -X POST http://localhost/api/v1/localization/translate/text -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"text":"Hello World","sourceLang":"en","targetLang":"ar"}' 2>/dev/null)
test_endpoint "T11_LOCALIZATION" "$R"

# T12: Library
R=$(curl -s http://localhost/api/v1/library/assets -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Id: a0000000-0000-0000-0000-000000000001" 2>/dev/null)
test_endpoint "T12_LIBRARY" "$R"

# T13: Replication
R=$(curl -s http://localhost:8007/health 2>/dev/null)
C13=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('1' if d.get('status')=='healthy' else '0')" 2>/dev/null)
if [ "$C13" = "1" ]; then echo "T13_REPLICATION: PASS - healthy"; else test_endpoint "T13_REPLICATION" "$R"; fi

# T14: Presentation
R=$(curl -s http://localhost/api/v1/presentation/presentations -H "Authorization: Bearer $TOKEN" 2>/dev/null)
test_endpoint "T14_PRESENTATION" "$R"

# T15: Infographic
R=$(curl -s http://localhost/api/v1/infographic/infographics -H "Authorization: Bearer $TOKEN" 2>/dev/null)
test_endpoint "T15_INFOGRAPHIC" "$R"

# T16: Template
R=$(curl -s http://localhost/api/v1/template/templates -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Id: a0000000-0000-0000-0000-000000000001" 2>/dev/null)
test_endpoint "T16_TEMPLATE" "$R"

echo "=== ALL TESTS COMPLETE ==="
