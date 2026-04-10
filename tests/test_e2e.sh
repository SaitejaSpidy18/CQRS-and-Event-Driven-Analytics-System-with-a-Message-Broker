#!/usr/bin/env bash
# flux-commerce end-to-end smoke tests
# Usage: bash tests/test_e2e.sh

CMD="http://localhost:8080"
QRY="http://localhost:8081"
PASS=0; FAIL=0

check() {
  local desc=$1 expected=$2 actual=$3
  if [ "$actual" = "$expected" ]; then
    echo "  PASS: $desc"
    PASS=$((PASS+1))
  else
    echo "  FAIL: $desc | expected=$expected actual=$actual"
    FAIL=$((FAIL+1))
  fi
}

echo "=== flux-commerce E2E Tests ==="

echo ""
echo "-- Health checks --"
STATUS=$(curl -sf -o /dev/null -w "%{http_code}" $CMD/health)
check "Command service health" "200" "$STATUS"

STATUS=$(curl -sf -o /dev/null -w "%{http_code}" $QRY/health)
check "Query service health" "200" "$STATUS"

echo ""
echo "-- Create product --"
RESP=$(curl -sf -X POST $CMD/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Widget","category":"electronics","price":49.99,"stock":100}')
echo "  Response: $RESP"
PRODUCT_ID=$(echo $RESP | grep -o '"productId":[0-9]*' | grep -o '[0-9]*')
check "Product created with ID" "true" "$([ -n "$PRODUCT_ID" ] && echo true || echo false)"

echo ""
echo "-- Create order --"
RESP=$(curl -sf -X POST $CMD/api/orders \
  -H "Content-Type: application/json" \
  -d "{\"customerId\":42,\"items\":[{\"productId\":$PRODUCT_ID,\"quantity\":3,\"price\":49.99}]}")
echo "  Response: $RESP"
ORDER_ID=$(echo $RESP | grep -o '"orderId":[0-9]*' | grep -o '[0-9]*')
check "Order created with ID" "true" "$([ -n "$ORDER_ID" ] && echo true || echo false)"

echo ""
echo "-- Wait for event processing (10s) --"
sleep 10

echo ""
echo "-- Query product sales --"
RESP=$(curl -sf $QRY/api/analytics/products/$PRODUCT_ID/sales)
echo "  Response: $RESP"
QTY=$(echo $RESP | grep -o '"totalQuantitySold":[0-9]*' | grep -o '[0-9]*')
check "totalQuantitySold = 3" "3" "$QTY"

echo ""
echo "-- Query category revenue --"
RESP=$(curl -sf "$QRY/api/analytics/categories/electronics/revenue")
echo "  Response: $RESP"
STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "$QRY/api/analytics/categories/electronics/revenue")
check "Category revenue status 200" "200" "$STATUS"

echo ""
echo "-- Query customer LTV --"
RESP=$(curl -sf $QRY/api/analytics/customers/42/lifetime-value)
echo "  Response: $RESP"
STATUS=$(curl -sf -o /dev/null -w "%{http_code}" $QRY/api/analytics/customers/42/lifetime-value)
check "Customer LTV status 200" "200" "$STATUS"

echo ""
echo "-- Query sync status --"
RESP=$(curl -sf $QRY/api/analytics/sync-status)
echo "  Response: $RESP"
STATUS=$(curl -sf -o /dev/null -w "%{http_code}" $QRY/api/analytics/sync-status)
check "Sync status 200" "200" "$STATUS"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="