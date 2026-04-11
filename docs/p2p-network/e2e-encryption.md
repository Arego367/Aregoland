# E2E-Verschluesselung

## Zweck
Ende-zu-Ende-Verschluesselung aller P2P-Nachrichten mit Forward Secrecy pro Session.

## Status
`aktiv`

## Code-Anker
- **Logik:** `src/app/lib/p2p-crypto.ts` — ECDH Schluesselaustausch + AES-GCM Verschluesselung
- **Integration:** `src/app/lib/p2p-manager.ts` — Automatische Verschluesselung im P2PManager
- **Identity-Keys:** `src/app/auth/crypto.ts` — ECDSA Identitaetsschluessel (Signatur, nicht Verschluesselung)

## Datenfluss
1. Beide Peers generieren ephemere ECDH-Schluesselpaare (`generateEphemeralKeyPair()`)
2. Oeffentliche Schluessel werden ueber Signaling ausgetauscht
3. Session-Key wird abgeleitet (`deriveSessionKey()` — ECDH P-256)
4. Nachrichten werden mit AES-GCM-256 verschluesselt (`encryptMessage()`)
5. Empfaenger entschluesselt mit gleichem Session-Key (`decryptMessage()`)

## Schluessel-Exports
- `generateEphemeralKeyPair()` — Erzeugt ECDH P-256 Schluessel fuer eine Session
- `exportECDHPublicKey()` / `importECDHPublicKey()` — Schluessel-Serialisierung
- `deriveSessionKey()` — Leitet AES-256 Schluessel aus ECDH ab
- `encryptMessage()` / `decryptMessage()` — AES-GCM Verschluesselung/Entschluesselung

## Abhaengigkeiten
- Genutzt von: [WebRTC](webrtc.md)

## Einschraenkungen
- Forward Secrecy: Jede Session hat eigene Schluessel, kompromittierte Session betrifft keine andere
- Kein Server hat jemals Zugriff auf Klartext oder Session-Keys
- WebCrypto API (Browser-nativ, keine externen Krypto-Libraries)
