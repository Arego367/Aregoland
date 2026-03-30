#!/usr/bin/env bash
# Arego Chat — Start-Skript
# Baut den Signaling-Server, installiert systemd-Services und startet alles.
# Muss als root laufen (Port 443 + systemd).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIGNALING_SERVICE="arego-signaling"
VITE_SERVICE="arego-vite"

# ── Root-Check ────────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo "Fehler: start.sh muss als root ausgeführt werden (sudo ./start.sh)" >&2
  exit 1
fi

# ── 1. Signaling-Server Docker-Image bauen ────────────────────────────────────
echo "→ Docker-Image bauen: arego-signaling ..."
docker build -t arego-signaling "$SCRIPT_DIR/signaling-server" --quiet
echo "  ✓ Image bereit"

# ── 2. systemd Service-Files installieren (nur wenn geändert) ─────────────────
SERVICES_CHANGED=0
for svc in arego-signaling.service arego-vite.service; do
  src="$SCRIPT_DIR/$svc"
  dst="/etc/systemd/system/$svc"
  if [[ ! -f "$dst" ]] || ! diff -q "$src" "$dst" > /dev/null 2>&1; then
    cp "$src" "$dst"
    SERVICES_CHANGED=1
    echo "  ✓ $svc installiert/aktualisiert"
  fi
done

if [[ $SERVICES_CHANGED -eq 1 ]]; then
  systemctl daemon-reload
  systemctl enable "$SIGNALING_SERVICE" "$VITE_SERVICE"
  echo "  ✓ Services aktiviert (starten automatisch beim Neustart)"
fi

# ── 3. Services (neu)starten ──────────────────────────────────────────────────
echo "→ Signaling-Server starten (Port 3001) ..."
systemctl restart "$SIGNALING_SERVICE"
sleep 1
if systemctl is-active --quiet "$SIGNALING_SERVICE"; then
  echo "  ✓ Signaling läuft"
else
  echo "  ✗ Signaling-Start fehlgeschlagen — Logs:" >&2
  journalctl -u "$SIGNALING_SERVICE" -n 20 --no-pager >&2
  exit 1
fi

echo "→ Vite Dev-Server starten (HTTPS Port 443) ..."
systemctl restart "$VITE_SERVICE"
sleep 2
if systemctl is-active --quiet "$VITE_SERVICE"; then
  echo "  ✓ Vite läuft"
else
  echo "  ✗ Vite-Start fehlgeschlagen — Logs:" >&2
  journalctl -u "$VITE_SERVICE" -n 20 --no-pager >&2
  exit 1
fi

# ── Status ────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Arego Chat läuft"
echo "  App:       https://$(hostname -I | awk '{print $1}')/"
echo "  Signaling: ws://127.0.0.1:3001  (nur intern, via Vite-Proxy)"
echo ""
echo " Logs live:"
echo "  journalctl -fu arego-vite"
echo "  journalctl -fu arego-signaling"
echo ""
echo " Stoppen:"
echo "  systemctl stop arego-vite arego-signaling"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
