---
name: aregoland-deploy
description: Aregoland Deployment-Diagnose und Reparatur. Verwende diesen Skill immer wenn Änderungen nicht online kommen, der Deploy fehlschlägt, die falsche Version angezeigt wird, Nginx Probleme hat, der Service Worker nicht aktualisiert wird, oder irgendetwas mit dem Build- und Deploy-Prozess nicht stimmt. Auch bei Fragen zur Infrastruktur, Server-Zugang oder CI/CD-Pipeline.
---

# Aregoland Deployment Skill

## Infrastruktur

```
Entwickler (lokal) → GitHub (Arego367/Aregoland, Branch: main)
  → GitHub Actions (.github/workflows/deploy.yml)
  → Server (46.225.115.51)
  → Nginx → dist/ → Browser
```

| Komponente | Wert |
|---|---|
| Server IP | 46.225.115.51 |
| SSH | root@46.225.115.51 |
| Projektverzeichnis | /root/Aregoland |
| Git Remote | git@github.com:Arego367/Aregoland.git |
| Branch | main |

## GitHub Secrets (müssen korrekt gesetzt sein)

| Secret | Wert |
|---|---|
| SERVER_HOST | 46.225.115.51 |
| SERVER_USER | root |
| SERVER_SSH_KEY | (privater SSH Key) |

⚠️ Bekannter Fehler: SERVER_HOST war früher auf 5.78.105.137 gesetzt — falscher Server. Immer prüfen.

## Deploy-Ablauf

### GitHub Actions (deploy.yml)

Der Workflow erkennt automatisch ob Frontend- oder Signaling-Änderungen anstehen
(Job `detect-changes`, Pfad-Filter `signaling-server/`):

- **Frontend-Änderungen** → SSH auf Server, Code pullen, `./restart-frontend.sh`, danach Health-Check (`curl https://aregoland.de/api/health`).
- **Signaling-only Änderung** → nur Code pullen, dann Flag `/root/.signaling-restart-pending` setzen — der eigentliche Restart läuft via separatem Workflow `deploy-signaling-midnight.yml` um Mitternacht (UTC).
- **Manueller Trigger (`workflow_dispatch`)** → Full Deploy via `./start.sh`.

Auf dem Server passiert in jedem Fall:
```bash
cd /root/Aregoland
git fetch origin main
git reset --hard origin/main
./restart-frontend.sh   # bzw. ./start.sh bei manual deploy
```

### Deploy-Skript auf dem Server (restart-frontend.sh)

Das Skript nutzt `$SCRIPT_DIR` für portable Pfade. Ablauf:
```bash
pnpm install --frozen-lockfile  # Fallback: pnpm install
pnpm build                      # dist/ neu bauen — KRITISCH
# systemd-Service-Files (arego-vite.service) bei Bedarf nachziehen
systemctl stop arego-vite       # Vite Dev-Server stoppen (falls aktiv)
systemctl restart nginx         # Nginx neu starten (nicht nur reload)
```

⚠️ Früher fehlte `pnpm build` — dist/ wurde nie aktualisiert.
⚠️ Früher lief Vite Dev-Server parallel zu Nginx in Production.

## Nginx Konfiguration

Document Root muss auf `/root/Aregoland/dist/` zeigen.

Cache-Header (kritisch):
- `index.html` → `Cache-Control: no-cache`
- `sw.js` → `Cache-Control: no-cache`
- `assets/*.js` (gehashte Dateien) → `Cache-Control: max-age=31536000`

⚠️ Früher keine no-cache Header → Browser bekam alte Dateien.

## Service Worker (src/sw.ts)

`self.skipWaiting()` MUSS im Install-Event vorhanden sein.

⚠️ Ohne skipWaiting(): Neuer SW wartet bis alle Tabs geschlossen → User sieht alte Version ewig.

## Checkliste: "Änderungen kommen nicht online"

### Stufe 1 — GitHub
- [ ] Code auf main gepusht? (git log auf GitHub prüfen)
- [ ] GitHub Actions Workflow durchgelaufen? (Actions Tab — `Deploy to Hetzner VPS`)
- [ ] `detect-changes` hat `frontend=true` ausgegeben? (sonst greift nur der Signaling-Pfad)
- [ ] GitHub Secrets korrekt? SERVER_HOST = 46.225.115.51

### Stufe 2 — Server
```bash
ssh root@46.225.115.51
cd /root/Aregoland && git log -1          # Welcher Commit läuft?
git fetch origin main && git reset --hard origin/main  # Code aktuell?
pnpm install && pnpm build                # Neu bauen
ls -la dist/assets/index-*.js             # dist/ aktuell? (Datum prüfen)
systemctl status arego-vite               # Vite Dev-Server aus?
nginx -t                                  # Nginx Config OK?
systemctl restart nginx                   # Nginx neu starten
```

### Stufe 3 — Auslieferung
```bash
curl -I https://aregoland.de/             # Cache-Header prüfen
curl -sf https://aregoland.de/api/health  # Health-Check (Signaling)
grep -o "[a-f0-9]\{7\}" dist/assets/index-*.js | head  # Neuer Hash?
grep skipWaiting dist/sw.js               # skipWaiting() vorhanden?
```

### Stufe 4 — Browser
- [ ] Hard Refresh: Ctrl+Shift+R
- [ ] Service Worker deregistrieren: DevTools → Application → Service Workers → Unregister
- [ ] Cache leeren: DevTools → Application → Storage → Clear site data

## Versions-Anzeige

Vite Build-Time Defines in `vite.config.ts`:
- `__GIT_HASH__` → `git rev-parse --short HEAD`
- `__BUILD_DATE__` → Deutscher Zeitstempel (Europe/Berlin)

Anzeige in: `SpacesScreen.tsx` und `SettingsScreen.tsx`

⚠️ Früher nutzte SpacesScreen `V{__APP_VERSION__}` (= 1.0.0 aus package.json) statt `__GIT_HASH__`.

## Wichtige Dateien

| Datei | Zweck |
|---|---|
| .github/workflows/deploy.yml | CI/CD Workflow (Frontend + Signaling-Detection) |
| .github/workflows/deploy-signaling-midnight.yml | Mitternacht-Restart für Signaling-Server |
| restart-frontend.sh | Frontend-Deploy-Skript auf dem Server |
| start.sh | Full-Deploy-Skript (manueller Trigger) |
| vite.config.ts | Build-Konfiguration + Version-Defines |
| src/sw.ts | Service Worker — skipWaiting() prüfen |
| src/screens/SpacesScreen.tsx | Versions-Anzeige |
| src/screens/SettingsScreen.tsx | Versions-Anzeige |

## Bekannte Fehler (historisch, alle behoben am 14.04.2026)

| Problem | Ursache | Fix |
|---|---|---|
| Deploy auf falschen Server | SERVER_HOST Secret falsch (war 5.78.105.137) | IP korrigiert |
| dist/ nicht aktualisiert | restart-frontend.sh ohne pnpm build | Skript korrigiert |
| Alte Version im Browser | Service Worker ohne skipWaiting() | skipWaiting() hinzugefügt |
| Vite Dev-Server in Production | Service nicht gestoppt | systemctl stop arego-vite im Skript |
| Nginx cached alte Dateien | Keine no-cache Header | Nginx Config angepasst |
| Version zeigt V1.0.0 | SpacesScreen nutzte APP_VERSION | Auf GIT_HASH geändert |
| Kein Push vom Server möglich | Kein Deploy Key | SSH Deploy Key eingerichtet |

## Zusätzliche Lessons Learned

**Commit allein deployt nicht — immer pushen:** Aregoland nutzt `on: push: branches: [main]` als Deploy-Trigger. Lokales `pnpm build` reicht nicht — nur `git push origin main` löst das Deploy aus.

**Issues erst als done markieren wenn deployed:** Ein Commit allein reicht nicht. Der vollständige Deploy-Zyklus (build + service restart) muss durchlaufen sein, bevor eine Issue geschlossen wird — sonst entsteht Vertrauensverlust wenn der Nutzer den Bug weiterhin sieht.

**Bundle-Hash nach Push verifizieren:** Nach jedem Push den aktuellen `__GIT_HASH__` auf https://aregoland.de gegen den lokalen `git rev-parse --short HEAD` abgleichen — bestätigt dass der Deploy wirklich live ist.
