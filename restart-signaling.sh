#!/usr/bin/env bash
# Aregoland — Nur Signaling-Server neu bauen und starten.
# Frontend (Vite/Nginx) wird NICHT angefasst.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIGNALING_SERVICE="arego-signaling"
FLAG_FILE="/root/.signaling-restart-pending"

if [[ $EUID -ne 0 ]]; then
  echo "Fehler: muss als root laufen" >&2
  exit 1
fi

# ── systemd Service-File aktualisieren (falls geändert) ──────────────────────
src="$SCRIPT_DIR/arego-signaling.service"
dst="/etc/systemd/system/arego-signaling.service"
if [[ ! -f "$dst" ]] || ! diff -q "$src" "$dst" > /dev/null 2>&1; then
  cp "$src" "$dst"
  systemctl daemon-reload
  echo "  ✓ arego-signaling.service aktualisiert"
fi

# ── Docker-Image bauen ───────────────────────────────────────────────────────
echo "→ Docker-Image bauen: arego-signaling ..."
docker build --no-cache -t arego-signaling "$SCRIPT_DIR/signaling-server" --quiet
echo "  ✓ Image bereit"

# ── Signaling-Server neu starten ─────────────────────────────────────────────
echo "→ Signaling-Server neu starten ..."
systemctl restart "$SIGNALING_SERVICE"
sleep 1
if systemctl is-active --quiet "$SIGNALING_SERVICE"; then
  echo "  ✓ Signaling läuft"
else
  echo "  ✗ Signaling-Start fehlgeschlagen" >&2
  journalctl -u "$SIGNALING_SERVICE" -n 20 --no-pager >&2
  exit 1
fi

# ── Code-Verifikation ────────────────────────────────────────────────────────
echo "→ Code-Verifikation ..."
CONTAINER_HASH=$(docker exec arego-signaling md5sum /home/node/app/server.js | cut -d" " -f1)
LOCAL_HASH=$(md5sum "$SCRIPT_DIR/signaling-server/server.js" | cut -d" " -f1)
if [ "$CONTAINER_HASH" != "$LOCAL_HASH" ]; then
  echo "  ✗ Code im Container stimmt nicht mit lokalem Code überein!" >&2
  exit 1
fi
echo "  ✓ Code-Verifikation erfolgreich"

# ── Flag-Datei entfernen ─────────────────────────────────────────────────────
if [[ -f "$FLAG_FILE" ]]; then
  rm -f "$FLAG_FILE"
  echo "  ✓ Pending-Restart-Flag entfernt"
fi

echo "✓ Signaling-Deploy abgeschlossen"
