#!/usr/bin/env bash
# Aregoland — Nur Frontend (Vite + Nginx) neu starten.
# Signaling-Server wird NICHT angefasst.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VITE_SERVICE="arego-vite"
NGINX_SERVICE="nginx"

if [[ $EUID -ne 0 ]]; then
  echo "Fehler: muss als root laufen" >&2
  exit 1
fi

# ── systemd Service-Files aktualisieren (falls geändert) ─────────────────────
SERVICES_CHANGED=0
for svc in arego-vite.service; do
  src="$SCRIPT_DIR/$svc"
  dst="/etc/systemd/system/$svc"
  if [[ ! -f "$dst" ]] || ! diff -q "$src" "$dst" > /dev/null 2>&1; then
    cp "$src" "$dst"
    SERVICES_CHANGED=1
    echo "  ✓ $svc aktualisiert"
  fi
done
if [[ $SERVICES_CHANGED -eq 1 ]]; then
  systemctl daemon-reload
fi

# ── Vite neu starten ─────────────────────────────────────────────────────────
echo "→ Vite Dev-Server neu starten ..."
systemctl restart "$VITE_SERVICE"
sleep 2
if systemctl is-active --quiet "$VITE_SERVICE"; then
  echo "  ✓ Vite läuft"
else
  echo "  ✗ Vite-Start fehlgeschlagen" >&2
  journalctl -u "$VITE_SERVICE" -n 20 --no-pager >&2
  exit 1
fi

# ── Nginx neu starten ────────────────────────────────────────────────────────
echo "→ Nginx neu starten ..."
systemctl restart "$NGINX_SERVICE"
sleep 1
if systemctl is-active --quiet "$NGINX_SERVICE"; then
  echo "  ✓ Nginx läuft"
else
  echo "  ✗ Nginx-Start fehlgeschlagen" >&2
  journalctl -u "$NGINX_SERVICE" -n 20 --no-pager >&2
  exit 1
fi

echo "✓ Frontend-Deploy abgeschlossen (Signaling unberührt)"
