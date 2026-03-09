#!/bin/bash
# Engine 4: Professional Reports Engine - Verification Script

echo "=== Engine 4 Verification ==="
echo ""

# 1. Check for fake/placeholder code
echo "--- Step 1: Checking for fake/placeholder code ---"
FAKE=$(grep -rn "Math\.random()\|sampleData\|TODO\|FIXME\|placeholder\|mockData" \
  src/ --include="*.ts" | grep -v "\.test\." | grep -v "__tests__" | wc -l)
if [ "$FAKE" -eq 0 ]; then
  echo "CLEAN - No fake/placeholder code found"
else
  echo "WARNING: Found $FAKE lines with potential fake/placeholder code:"
  grep -rn "Math\.random()\|sampleData\|TODO\|FIXME\|placeholder\|mockData" \
    src/ --include="*.ts" | grep -v "\.test\." | grep -v "__tests__"
fi
echo ""

# 2. TypeScript compilation check
echo "--- Step 2: TypeScript compilation check ---"
npx tsc --noEmit 2>&1
if [ $? -eq 0 ]; then
  echo "PASS - TypeScript compiles without errors"
else
  echo "FAIL - TypeScript compilation errors found"
fi
echo ""

# 3. Run tests with coverage
echo "--- Step 3: Running tests with coverage ---"
npx jest --coverage --forceExit 2>&1
echo ""

echo "=== Verification Complete ==="
