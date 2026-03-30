#!/bin/bash
# Arego Chat — Automatischer Test-Workflow
# Führt die wichtigsten Playwright-Tests aus und gibt einen Bericht aus.
# Verwendung: bash tests/auto-test.sh

set -euo pipefail
cd "$(dirname "$0")/.."

echo "═══════════════════════════════════════════"
echo "  Arego Chat — Automatischer Test-Bericht"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════"
echo ""

# Prüfen ob Dev-Server läuft
DEV_URL="https://localhost:446"
if curl -sk -o /dev/null -w "%{http_code}" "$DEV_URL" 2>/dev/null | grep -q "200"; then
  echo "[OK] Dev-Server läuft auf $DEV_URL"
else
  echo "[INFO] Dev-Server wird gestartet..."
  pnpm dev &
  DEV_PID=$!
  sleep 5
  # Port könnte variieren — aus Vite-Output lesen
  echo "[INFO] Dev-Server gestartet (PID $DEV_PID)"
fi

echo ""
echo "--- Playwright Tests ---"
echo ""

# Tests ausführen
RESULT=0
npx playwright test tests/ --reporter=list 2>&1 || RESULT=$?

echo ""
echo "═══════════════════════════════════════════"
if [ $RESULT -eq 0 ]; then
  echo "  ERGEBNIS: ALLE TESTS BESTANDEN"
else
  echo "  ERGEBNIS: TESTS FEHLGESCHLAGEN (Exit $RESULT)"
  echo "  Screenshots: test-results/"
fi
echo "═══════════════════════════════════════════"

exit $RESULT
