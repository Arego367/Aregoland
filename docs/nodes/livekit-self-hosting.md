# LiveKit Self-Hosting Guide fuer Community-Betreiber

Aregoland nutzt ein dezentrales SFU-Modell: Community-Betreiber hosten eigene LiveKit-Nodes.
Der Aregoland Signaling-Server betreibt **keinen** eigenen SFU — er vermittelt nur zwischen Nodes und Clients.

## Ueberblick

```
Client A ──► Aregoland Signaling ──► Node-Registry
                                         │
Client B ──► LiveKit SFU Node ◄──────────┘
                (dein Server)
```

- **P2P zuerst:** Clients versuchen immer eine direkte P2P-Verbindung (10s Timeout)
- **SFU-Fallback:** Wenn P2P fehlschlaegt, verbinden sich Clients ueber einen LiveKit-Node
- **E2E-Verschluesselung:** Der SFU-Node sieht nur verschluesselten Ciphertext (Insertable Streams / E2EE)

---

## 1. Voraussetzungen

- Docker + Docker Compose (v2)
- Oeffentliche IP-Adresse oder Domain mit TLS
- Ports: **7880** (HTTP API), **7881** (RTC/UDP+TCP), **443** (TLS, optional via Reverse Proxy)
- Mindestens 1 CPU-Kern, 512 MB RAM (fuer wenige Teilnehmer)

### Plattformen

| Plattform | Hinweise |
|-----------|----------|
| **Raspberry Pi 4/5** (ARM64) | LiveKit bietet ARM64-Images. Min. 2 GB RAM empfohlen. |
| **Synology NAS** | Docker-Paket installieren, dann Docker Compose via SSH. |
| **QNAP NAS** | Container Station nutzen oder SSH + Docker Compose. |
| **Hetzner VPS** | CX22 (2 vCPU, 4 GB) reicht fuer ~20 gleichzeitige Teilnehmer. |
| **DigitalOcean** | Basic Droplet ($6/Monat) fuer kleine Communities. |

---

## 2. Docker-Compose Setup

Erstelle einen Ordner fuer deinen LiveKit-Node:

```bash
mkdir livekit-node && cd livekit-node
```

### docker-compose.yml

```yaml
version: "3.9"
services:
  livekit:
    image: livekit/livekit-server:latest
    restart: unless-stopped
    ports:
      - "7880:7880"    # HTTP API
      - "7881:7881/tcp" # RTC TCP
      - "7881:7881/udp" # RTC UDP
    volumes:
      - ./livekit.yaml:/etc/livekit.yaml
    command: ["--config", "/etc/livekit.yaml"]
```

### livekit.yaml

```yaml
port: 7880
rtc:
  port_range_start: 7881
  port_range_end: 7881
  use_external_ip: true
  # Falls hinter NAT: externe IP hier eintragen
  # node_ip: 203.0.113.50

# API-Keys (generiere eigene!)
keys:
  # Format: api_key: api_secret
  # Generieren: openssl rand -base64 32
  aregoland: DEIN_GEHEIMER_API_SECRET_HIER

# Logging minimal halten (Datenschutz)
logging:
  level: warn
  # WICHTIG: Kein Logging von Teilnehmer-Daten, IPs oder Room-Inhalten
```

### Starten

```bash
docker compose up -d
```

### Pruefen

```bash
curl http://localhost:7880
# Sollte "OK" zurueckgeben
```

---

## 3. Netzwerk-Konfiguration

### Ports oeffnen

| Port | Protokoll | Zweck |
|------|-----------|-------|
| 7880 | TCP | LiveKit HTTP API |
| 7881 | TCP + UDP | WebRTC Media (RTC) |
| 443 | TCP | TLS (optional, via Reverse Proxy) |

### TLS mit Nginx (empfohlen)

```nginx
server {
    listen 443 ssl http2;
    server_name livekit.deine-domain.de;

    ssl_certificate /etc/letsencrypt/live/livekit.deine-domain.de/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/livekit.deine-domain.de/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:7880;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

Alternativ: LiveKit kann TLS direkt terminieren — siehe [LiveKit Docs](https://docs.livekit.io/home/self-hosting/deployment/).

### Hinter NAT / Router

Falls der Server hinter einem NAT ist (z.B. Raspberry Pi im Heimnetz):
1. Port-Forwarding fuer 7880 (TCP) und 7881 (TCP+UDP) einrichten
2. `node_ip` in `livekit.yaml` auf die oeffentliche IP setzen
3. DynDNS nutzen falls keine feste IP vorhanden

---

## 4. Node beim Aregoland Signaling-Server registrieren

Dein Node muss sich bei der Aregoland Node-Registry registrieren, damit Clients ihn als SFU-Fallback nutzen koennen.

### Per API (automatisch)

```bash
curl -X POST https://aregoland.de/api-signal/node \
  -H "Content-Type: application/json" \
  -d '{
    "url": "wss://livekit.deine-domain.de",
    "name": "Mein Community-Node"
  }'
```

Antwort:
```json
{"ok": true, "id": "abc123", "url": "wss://livekit.deine-domain.de", "name": "Mein Community-Node", "registeredAt": "2026-04-11T12:00:00.000Z"}
```

### Per App (manuell)

In der Aregoland-App unter **Einstellungen → LiveKit-Node**:
- Node-URL eintragen: `wss://livekit.deine-domain.de`
- Diese Einstellung gilt nur fuer dein Geraet (lokaler Fallback)

### Registrierte Nodes auflisten

```bash
curl https://aregoland.de/api-signal/nodes
```

### Node entfernen

```bash
curl -X DELETE https://aregoland.de/api-signal/node/abc123
```

---

## 5. Sicherheitshinweise

### E2E-Verschluesselung

- **Der SFU-Node kann Medieninhalte NICHT entschluesseln.** Aregoland nutzt LiveKit E2EE (Insertable Streams) mit AES-GCM-256 Schluesseln, die zwischen den Clients ueber verschluesselte Kanaele ausgetauscht werden.
- Der Node sieht nur Ciphertext — selbst bei vollem Zugriff auf den Server.
- Schluessel werden niemals an den SFU-Server uebermittelt.

### Datenschutz-Empfehlungen

1. **Kein Logging von Teilnehmer-Daten:** Setze `logging.level: warn` in `livekit.yaml`
2. **Keine Aufzeichnung:** LiveKit Recording/Egress NICHT aktivieren
3. **Minimale Retention:** Keine Datenbank-Backups die Session-Daten enthalten
4. **Transparenz:** Informiere deine Community, dass du einen Node betreibst

### Updates

```bash
# LiveKit aktualisieren
docker compose pull
docker compose up -d
```

Pruefe regelmaessig auf neue LiveKit-Versionen: [LiveKit Releases](https://github.com/livekit/livekit/releases)

### Firewall

Nur die notwendigen Ports oeffnen. Beispiel mit `ufw`:

```bash
sudo ufw allow 7880/tcp
sudo ufw allow 7881/tcp
sudo ufw allow 7881/udp
```

---

## Troubleshooting

| Problem | Loesung |
|---------|---------|
| Clients verbinden sich nicht | Ports pruefen (7880, 7881 TCP+UDP), Firewall checken |
| "ICE failed" | NAT-Konfiguration pruefen, `node_ip` in livekit.yaml setzen |
| Hohe Latenz | Server naeher an den Nutzern platzieren, UDP sicherstellen |
| "E2EE not supported" | Browser muss Insertable Streams unterstuetzen (Chrome 94+, Firefox 117+) |
| Node taucht nicht in Registry auf | `POST /node` Antwort pruefen, URL muss erreichbar sein |
