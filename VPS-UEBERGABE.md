# VPS-Übergabe (für Hermes & Betreiber)

**Server:** IONOS VPS `root@212.227.73.93` (Ubuntu 24.04, Coolify/Traefik verwaltet das Routing)
**Projekt:** `/opt/hotelsoftware` · **Domain:** hotelsoftware.aiconso.eu (A-Record gesetzt,
Zertifikat via Traefik `letsencrypt`-Resolver) · **Präfix:** `hs-` (Container & Traefik-Router)

## Was läuft wo
| Container | Zweck | Ports (Host) |
|---|---|---|
| `hs-db` | PostgreSQL 16, Volume `hs_db_data` | keiner (intern) |
| `hs-api` | Fastify-API (tsx, Port 3001 intern) | keiner (intern) |
| `hs-web` | nginx: statisches React + `/api`-Proxy | keiner — Traefik routet :80/:443 |
| `hs-backup` | tägliches `pg_dump` nach `./backups` (30 Tage Vorhalt) | keiner |

Ports 80/443/8080 gehören Coolify/Traefik — dieses Projekt publishet **keine** Host-Ports.
Routing: `docker-compose.vps-tls.yml` hängt `hs-web` ins Docker-Netzwerk `coolify` mit
Traefik-Labels (`Host(hotelsoftware.aiconso.eu)`).

## Secrets
`.env` liegt nur auf dem VPS in `/opt/hotelsoftware/.env` (POSTGRES_*, JWT_SECRET,
JWT_REFRESH_SECRET, APP_DOMAIN=hotelsoftware.aiconso.eu). Secrets niemals ins Repo.

## Update-Prozedur
```bash
cd /opt/hotelsoftware
git pull
docker compose -f docker-compose.vps.yml -f docker-compose.vps-tls.yml up -d --build
docker compose -f docker-compose.vps.yml exec api npx prisma db push --skip-generate
# Wenn Seeds geändert wurden — Seed mit dem NEUEN Image ausführen (oder Datei per docker cp):
docker compose -f docker-compose.vps.yml exec api npx tsx prisma/seed.ts
```
Smoke-Test danach: `curl https://hotelsoftware.aiconso.eu/api/health` → `{"ok":true}`,
Login über Browser prüfen.

## Notfall-Wiederherstellung
```bash
# Backup einspielen (letzte Datei in /opt/hotelsoftware/backups):
gunzip -c /opt/hotelsoftware/backups/hotel_<DATUM>.sql.gz | \
  docker compose -f docker-compose.vps.yml exec -T db psql -U <POSTGRES_USER> -d <POSTGRES_DB>
```
Keine Änderungen an SSH/Auth, Coolify oder Traefik-Grundsystem.
