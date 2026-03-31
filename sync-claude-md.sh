#!/bin/bash
# Syncs CLAUDE.md to Google Drive via rclone
# Requires: rclone configured with remote "gdrive" (see setup below)

REMOTE="gdrive:Aregoland/"
SOURCE="/root/Aregoland/CLAUDE.md"

if ! command -v rclone &>/dev/null; then
  echo "[sync] rclone nicht installiert"
  exit 1
fi

if ! rclone listremotes 2>/dev/null | grep -q "^gdrive:"; then
  echo "[sync] Remote 'gdrive' nicht konfiguriert. Bitte 'rclone config' ausführen."
  exit 1
fi

rclone copy "$SOURCE" "$REMOTE" --log-level NOTICE 2>&1
echo "[sync] CLAUDE.md -> Google Drive hochgeladen"
