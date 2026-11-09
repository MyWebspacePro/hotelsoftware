# PROJEKT-STATUS — HotelGuru

**Stand:** 09.11.2026 · **Phase:** 0 abgeschlossen (Fundament deployed) · **Repo:** github.com/MyWebspacePro/hotelsoftware

## Live
- **Produktion (VPS):** https://hotelsoftware.aiconso.eu — Let's-Encrypt gültig bis 07.02.2027
- Server: root@212.227.73.93 (SSH-Schlüssel `~/.ssh/werkstatt_vps`), Projekt in `/opt/hotelsoftware`
- Container: `hs-db` (Postgres 16, intern), `hs-api` (tsx :3001 intern), `hs-web` (nginx :80 intern),
  `hs-backup` (tägliches pg_dump nach `/opt/hotelsoftware/backups`, 30 Tage Vorhalt)
- Routing: Traefik (Coolify-Netzwerk `coolify`), keine Host-Ports; `.env` nur auf dem VPS (chmod 600)

## Zugänge (Demo-Stand nach Seed)
| Rolle | Login | Passwort |
|---|---|---|
| ADMIN | `admin@hotelguru.local` | `Admin1234!` |
| MANAGER | `manager@hotelguru.local` | `Demo1234!` |
| RECEPTION | `rezeption@hotelguru.local` | `Demo1234!` |
| HOUSEKEEPING | `housekeeping@hotelguru.local` | `Demo1234!` |
| SERVICE | `service@hotelguru.local` | `Demo1234!` |

VPS-Admin kann sich nach dem ersten Login sein Passwort ändern (Profil → Passwort ändern).
Für echten Produktivbetrieb: Demo-Benutzer deaktivieren/löschen (Benutzerverwaltung).

## Lokale Entwicklung
- Ports bewusst abweichend vom Werkstattmanager: DB **5433**, Mailhog **1026/8026**
- `npm install` → `docker compose up -d` → `npm run db:push` → `npm run db:seed` → `npm run dev`
- API-Smoke-Test 09.11.2026: Health/Login/Me/Users/Rollen-Checks alle grün (lokal + VPS)

## Update-Prozedur (VPS)
```bash
cd /opt/hotelsoftware && git pull
docker compose -f docker-compose.vps.yml -f docker-compose.vps-tls.yml up -d --build
docker compose -f docker-compose.vps.yml exec api npx prisma db push --skip-generate
# Seed nur wenn geändert (immer mit dem NEUEN Image): exec api npx tsx prisma/seed.ts
curl https://hotelsoftware.aiconso.eu/api/health
```
Details + Wiederherstellung: `VPS-UEBERGABE.md`. Scope/Architektur: `docs/SCOPE.md`, `docs/DATENMODELL.md`, `docs/PHASENPLAN.md`.

## Nächste Schritte
Phase 1: Stammdaten + grafischer Zimmerplan + Reservierung (siehe PHASENPLAN.md)
