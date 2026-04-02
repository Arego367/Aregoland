#!/bin/bash
# Syncs /docs/*.md to Google Drive als Google Docs (fuer MCP-Zugriff)

REMOTE_DOCS="gdrive:Aregoland-Docs/"
REMOTE_ROOT="gdrive:"
DOCS_DIR="/root/Aregoland/docs/"
ROOT_FILE="/root/Aregoland/CLAUDE.md"

if ! command -v rclone &>/dev/null; then
  echo "[sync] rclone nicht installiert"
  exit 1
fi

if ! rclone listremotes 2>/dev/null | grep -q "^gdrive:"; then
  echo "[sync] Remote 'gdrive' nicht konfiguriert."
  exit 1
fi

rclone copy "$ROOT_FILE" "$REMOTE_ROOT" --log-level NOTICE 2>&1
rclone copy "$DOCS_DIR" "$REMOTE_DOCS" --include "*.md" --log-level NOTICE 2>&1
echo "[sync] CLAUDE.md + docs/ -> Google Drive hochgeladen (Google Docs)"
