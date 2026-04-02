#!/usr/bin/env python3
"""Upload /docs/*.md to Google Drive as Google Docs (converted)."""

import json, glob, os, sys, time
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

FOLDER_ID = "1b-MkY8Ve3hRQ9YSMJpGnrBzhgADl6H2b"
DOCS_DIR = "/root/Aregoland/docs"
RCLONE_CONF = "/root/.config/rclone/rclone.conf"

# Extract OAuth token from rclone config
def get_credentials():
    with open(RCLONE_CONF) as f:
        for line in f:
            if line.strip().startswith("token"):
                token_json = json.loads(line.split("=", 1)[1].strip())
                return Credentials(
                    token=token_json["access_token"],
                    refresh_token=token_json["refresh_token"],
                    token_uri="https://oauth2.googleapis.com/token",
                    client_id="202264815644.apps.googleusercontent.com",
                    client_secret="X4Z3ca8xfWDb1Voo-F9a7ZxJ",
                )
    raise RuntimeError("No token in rclone config")

def main():
    creds = get_credentials()
    service = build("drive", "v3", credentials=creds)

    # List existing files in folder
    existing = {}
    resp = service.files().list(
        q=f"'{FOLDER_ID}' in parents and trashed=false",
        fields="files(id,name)",
        pageSize=100,
    ).execute()
    for f in resp.get("files", []):
        existing[f["name"]] = f["id"]

    # Upload each .md file
    md_files = sorted(glob.glob(os.path.join(DOCS_DIR, "*.md")))
    for path in md_files:
        name = os.path.basename(path)
        media = MediaFileUpload(path, mimetype="text/plain")

        for attempt in range(3):
            try:
                if name in existing:
                    service.files().update(
                        fileId=existing[name],
                        media_body=media,
                    ).execute()
                    print(f"  Updated: {name}")
                else:
                    meta = {
                        "name": name,
                        "mimeType": "application/vnd.google-apps.document",
                        "parents": [FOLDER_ID],
                    }
                    service.files().create(
                        body=meta,
                        media_body=media,
                    ).execute()
                    print(f"  Created: {name}")
                break
            except Exception as e:
                if "rateLimitExceeded" in str(e) and attempt < 2:
                    print(f"  Rate limit, waiting 30s... ({name})")
                    time.sleep(30)
                else:
                    raise
        time.sleep(5)

    print(f"\n{len(md_files)} files synced to Google Drive (Google Docs)")

if __name__ == "__main__":
    main()
