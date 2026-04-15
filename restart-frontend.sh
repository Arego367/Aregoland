#!/usr/bin/env bash
# Aregoland — Frontend bauen und Nginx neu starten.
# Signaling-Server wird NICHT angefasst.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NGINX_SERVICE="nginx"

if [[ $EUID -ne 0 ]]; then
  echo "Fehler: muss als root laufen" >&2
  exit 1
fi

# ── Dependencies installieren (falls geändert) ───────────────────────────────
echo "→ Dependencies prüfen ..."
cd "$SCRIPT_DIR"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
echo "  ✓ Dependencies aktuell"

# ── Production Build ─────────────────────────────────────────────────────────
echo "→ Production Build (vite build) ..."
pnpm build
echo "  ✓ Build abgeschlossen"

# ── systemd Service-Files aktualisieren (falls geändert) ─────────────────────
SERVICES_CHANGED=0
for svc in arego-vite.service; do
  src="$SCRIPT_DIR/$svc"
  dst="/etc/systemd/system/$svc"
  if [[ -f "$src" ]] && { [[ ! -f "$dst" ]] || ! diff -q "$src" "$dst" > /dev/null 2>&1; }; then
    cp "$src" "$dst"
    SERVICES_CHANGED=1
    echo "  ✓ $svc aktualisiert"
  fi
done
if [[ $SERVICES_CHANGED -eq 1 ]]; then
  systemctl daemon-reload
fi

# ── Vite Dev-Server stoppen (Production nutzt dist/ über Nginx) ──────────────
VITE_SERVICE="arego-vite"
if systemctl is-active --quiet "$VITE_SERVICE" 2>/dev/null; then
  echo "→ Vite Dev-Server stoppen (Production braucht ihn nicht) ..."
  systemctl stop "$VITE_SERVICE"
  echo "  ✓ Vite gestoppt"
fi

# ── Nginx neu starten (um gecachte Dateien zu aktualisieren) ──────────────────
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
