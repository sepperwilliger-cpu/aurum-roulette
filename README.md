# 🎰 AURUM Roulette – Multiplayer mit Freunden

Europäisches Roulette (0–36) für bis zu **10 Spieler** pro privatem Raum plus Zuschauer –
in Echtzeit, mit 3D-Rad und **ausschliesslich virtuellem Spielgeld**.

> Credits haben keinen Geldwert. Es gibt keine Einzahlungen, Auszahlungen, Käufe, Krypto oder Preise.

---

## Schnellstart (Windows)

**Doppelklick auf `start.bat`.** Beim ersten Mal installiert das Skript alles und baut die App
(ein paar Minuten), danach öffnet sich der Browser auf <http://localhost:3000>.

Voraussetzung: **Node.js 22.13 oder neuer** (empfohlen: aktuelle LTS von <https://nodejs.org>).
Ohne Admin-Rechte geht auch die portable ZIP-Version: nach `%LOCALAPPDATA%\Programs\nodejs` entpacken –
`start.bat` findet sie dort automatisch.

### Manuell im Terminal (PowerShell)

```powershell
cd $HOME\roulette-casino   # Pfad zum Projektordner
npm install          # einmalig
npm run dev          # Entwicklungsmodus (Hot Reload)
```

Produktionsmodus (schneller, so wie `start.bat`):

```powershell
npm run build
npm start
```

Tests (Spielregeln, Auszahlungen, Rundenablauf, Multiplayer, Kugelbahn):

```powershell
npm test
```

> Frontend und Backend laufen bewusst in **einem** Prozess auf **einem** Port (3000).
> Deshalb gibt es nur einen Startbefehl – und deine Freunde brauchen nur einen Link.

---

## Freunde einladen

1. Lobby → **Privaten Raum erstellen**. Oben links steht der Raumcode (z. B. `S67AZC`).
2. Klick auf den Code kopiert den **Einladungslink** (`…/room/S67AZC`). Alternativ geben Freunde
   den Code in der Lobby ein.
3. Wer nichts setzen will oder wenn 10 Spieler am Tisch sind: Zuschauermodus
   (oder Link mit `?zuschauen=1`).

Wie kommen deine Freunde an deinen PC?

| Situation | Was tun |
|---|---|
| **Gleiches WLAN** | Beim Start zeigt das Terminal `Im WLAN: http://192.168.x.x:3000`. Diesen Link schicken. Fragt Windows nach der Firewall, „Private Netzwerke“ erlauben. |
| **Übers Internet (kostenlos, ohne Konto)** | `winget install --id Cloudflare.cloudflared`, dann **`freunde-link.bat`** starten (während `start.bat` läuft). Es erscheint eine Adresse `https://….trycloudflare.com` – plus `/room/CODE` an Freunde schicken. Die Adresse ändert sich bei jedem Start. |
| **Dauerhaft online** | Siehe „Online hosten“ unten. |

---

## Spielablauf

1. 20 Sekunden Countdown – alle setzen gleichzeitig (Chips 1 · 5 · 10 · 25 · 100 · 500 · 1'000).
2. „Nichts geht mehr“ – der Server sperrt alle Einsätze.
3. Das 3D-Rad dreht, die Kugel landet **exakt** im serverseitig gezogenen Fach.
4. Gewinnzahl erscheint, Gewinne werden automatisch gutgeschrieben.
5. Kurze Ergebnispause, dann die nächste Runde.

Wettarten und Auszahlungen (offizielle europäische Regeln):

| Wette | Zahlen | Auszahlung |
|---|---|---|
| Plein (Straight Up) | 1 | 35 : 1 |
| Cheval (Split) | 2 | 17 : 1 |
| Transversale (Street), auch 0-1-2 / 0-2-3 | 3 | 11 : 1 |
| Carré (Corner), auch 0-1-2-3 | 4 | 8 : 1 |
| Sixain (Six Line) | 6 | 5 : 1 |
| Dutzend / Kolonne | 12 | 2 : 1 |
| Rot/Schwarz, Gerade/Ungerade, 1–18/19–36 | 18 | 1 : 1 |

Bei 0 verlieren alle einfachen Chancen, Dutzende und Kolonnen. Splits, Corners usw. setzt man auf die
Kanten und Ecken zwischen den Zahlen – beim Darüberfahren leuchten die abgedeckten Zahlen auf.

Bedienung: **Rückgängig**, **Alles löschen**, **Verdoppeln**, **Wiederholen** (Einsätze der letzten Runde).
Kein Tischlimit: Pro Feld darf man so viel setzen, wie man Guthaben hat.

---

## Funktionen

- Private Räume mit Code/Link, max. 10 Spieler + bis 20 Zuschauer, Spieler ↔ Zuschauer wechseln
- Pleite? Bei 0 Credits erscheint am Tisch ein Knopf „Neu starten mit 10'000 Credits“
- Synchronisierte Runden und Countdown für alle; alle sehen dieselben Einsätze und dasselbe Ergebnis
- Eigenes, gespeichertes Guthaben (Start 10'000), jederzeit kostenlos zurücksetzbar
- Live-Spielerliste mit Guthaben und Rundenergebnis, Rangliste im Raum (nach Nettogewinn), Gruppenchat
- Verlauf der letzten 20 Zahlen, Zahlenverteilung (heiss/kalt, Rot/Schwarz …)
- Persönliche Statistik + Spielhistorie mit Zeitstempeln und Einzeleinsätzen
- Gewinnanimationen, synthetisierte Soundeffekte (Kugelrollen, Chips …) und leise Lo-Fi-Hintergrundmusik – beides einzeln abschaltbar (🔊 / 🎵) mit eigener Lautstärke
- Einstellungen: Sound, Animationen (voll/reduziert), 3D-Qualität (hoch/sparsam), Profil
- Automatisches Wiederverbinden: Platz, Einsätze und Guthaben bleiben 5 Minuten reserviert
- Responsive: senkrechter Tisch auf dem Smartphone

### Fairness & Sicherheit

- Gewinnzahl per `crypto.randomInt` (Zufallsgenerator des Betriebssystems) **auf dem Server**.
- **Provably Fair:** Vor jeder Runde wird `SHA-256(Raum:Runde:Zahl:Salt)` veröffentlicht (unten rechts
  am Rad), nach dem Drehen Zahl und Salt. So lässt sich nachprüfen, dass die Zahl vorher feststand.
- Alle Einsätze werden serverseitig geprüft (Phase, gültiges Feld, Betrag, Guthaben).
  Gewinne werden erst gutgeschrieben, wenn die Kugel liegt.
- Profile sind per zufälligem Token geschützt (nur der Hash wird gespeichert). Keine API-Schlüssel nötig.
- Rate-Limits gegen Spam, Chat ohne HTML (kein XSS).

---

## Projektstruktur

```
roulette-casino/
├─ server/                 Node.js-Backend (läuft mit tsx)
│  ├─ index.ts             HTTP-Server: Next.js + Socket.IO auf einem Port
│  ├─ socket.ts            Socket.IO-Ereignisse, Validierung, Rate-Limit
│  ├─ manager.ts           Räume anlegen/laden/aufräumen, Reset
│  ├─ room.ts              Rundenablauf, Einsätze, Abrechnung, Commit/Reveal
│  └─ db.ts                SQLite (eingebautes node:sqlite) – Spieler, Runden, Statistik
├─ src/
│  ├─ lib/                 Gemeinsam für Server & Client
│  │  ├─ roulette.ts       Regeln: Rad, Farben, alle 157 Wettfelder, Auszahlungen
│  │  ├─ tableLayout.ts    Geometrie des Tisches (Felder, Kanten, Ecken)
│  │  ├─ ballPath.ts       Deterministische Kugelbahn → landet exakt im Zielfach
│  │  ├─ constants.ts      Zeiten, Limits, Chips, Avatare
│  │  └─ protocol.ts       Datentypen der Echtzeit-Nachrichten
│  ├─ client/              Socket-Verbindung, Zustand (zustand), Sound, Hooks
│  ├─ components/          UI: Wheel3D, BettingTable, ChipRack, Panels, Modals …
│  └─ app/                 Next.js-Seiten: Lobby (/) und Raum (/room/[code])
├─ tests/                  Vitest: Regeln, Tisch, Kugelbahn, Raum/Multiplayer
├─ data/                   SQLite-Datenbank (wird automatisch angelegt)
├─ start.bat               Ein-Klick-Start für Windows
├─ freunde-link.bat        Internet-Link via Cloudflare Quick Tunnel
└─ Dockerfile              Für Hosting
```

Technik: Next.js 15 · React 19 · TypeScript · Tailwind CSS 4 · Three.js / React Three Fiber ·
Framer Motion · Socket.IO 4 · SQLite (node:sqlite) · Vitest.

---

## Online stellen – fester Link, der immer funktioniert (kostenlos)

Aufbau: **Render** (Free) betreibt Frontend + Echtzeit-Server, **Turso** (Free) speichert Profile,
Guthaben, Räume und Statistik dauerhaft, **GitHub** enthält den Code. Kein Konto braucht eine Kreditkarte.

1. **GitHub:** neues Repository `aurum-roulette` anlegen → „uploading an existing file“ → Inhalt des
   Upload-Ordners hineinziehen → „Commit changes“.
2. **Turso:** Datenbank `aurum` anlegen (Region Europa) → **Database URL** (`libsql://…`) kopieren und
   ein **Token** erstellen.
3. **Render:** mit GitHub anmelden → *New → Blueprint* → Repository wählen → `TURSO_DATABASE_URL` und
   `TURSO_AUTH_TOKEN` einfügen → *Apply*. Nach ein paar Minuten: `https://aurum-roulette….onrender.com`.

Gut zu wissen:
- Free-Dienste schlafen nach 15 Minuten ohne Besucher ein; der erste Aufruf danach dauert ~1 Minute.
  Die Daten bleiben dank Turso trotzdem erhalten.
- Technik: Beim Start lädt der Server alle Daten aus Turso in eine schnelle lokale SQLite im Arbeitsspeicher;
  jede Änderung wird zusätzlich alle ~0,4 s gesammelt an Turso geschickt (siehe `server/replica.ts`).
- Änderungen am Code: geänderte Dateien wieder bei GitHub hochladen → Render baut automatisch neu.
- Vercel/Netlify eignen sich **nicht** (keine dauerhaften WebSocket-Server). Alternativ: `Dockerfile`
  für Docker-Hosts (Volume auf `/data`).

Umgebungsvariablen: `PORT` (Standard 3000), `DATA_DIR` (Standard `./data`),
`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` (optional – wenn gesetzt, wird Turso als Speicher verwendet).

---

## Häufige Probleme

- **`node` wird nicht gefunden** – Terminal neu öffnen (PATH wurde ergänzt) oder `start.bat` benutzen.
- **Port 3000 belegt** – `$env:PORT=3001; npm start`
- **Freunde im WLAN kommen nicht drauf** – Windows-Firewall-Abfrage für Node.js zulassen (Private Netzwerke).
- **3D ruckelt auf altem Handy** – Einstellungen → 3D-Qualität „Sparsam“.
- **Nach Code-Änderungen** im Produktionsmodus: `npm run build` erneut ausführen.
