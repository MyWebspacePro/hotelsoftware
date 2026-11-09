# Start-Prompt: Projekt «HotelSoftware»

```
Ich starte ein neues Software-Projekt («HotelSoftware») mit exakt derselben technischen Infrastruktur und demselben Veröffentlichungsweg wie meine bestehende Autowerkstatt-Software — du kannst dir als Vorbild github.com/MyWebspacePro/werkstattmanager ansehen (Repo-Struktur, Docker-, Traefik- und Deploy-Muster 1:1 übernehmen).

WAS DAS PROJEKT KANN: Das definieren wir im Gespräch. Fang mit einer Abstimmung an (frag mich nach dem Funktionsscope und grill mich zu den wichtigen Fragen), bevor du konzeptionierst oder programmierst. Programmieren erst nach meinem GO, dann schrittweise und kontextsparend.

TECH-STACK (fix):
- Monorepo mit npm workspaces: apps/web (React 18 + Vite + TS + Tailwind 4 + TanStack Query + react-router + react-i18next, Deutsch), apps/api (Fastify 5 + Prisma 6 + PostgreSQL 16 + Zod + JWT/bcryptjs), packages/shared
- Auth: JWT Access/Refresh, Rollen, Passwort-Ändern + Benutzerverwaltung ab Anfang
- PostgreSQL 16 als Datenbank, Soft-Delete/Archivierung, AuditLog
- Einheitliches Muster wie beim Werkstattmanager: zentrale Business-Logik in packages/shared mit Unit-Tests

GITHUB:
- Neues PUBLIC Repo github.com/MyWebspacePro/hotelsoftware, Branch main
- .env niemals committen (nur .env.example); Zugänge später in docs/PROJEKT-STATUS.md dokumentieren
- Push so ausführen: GIT_TERMINAL_PROMPT=0 git push https://x-access-token:$(gh auth token)@github.com/MyWebspacePro/hotelsoftware.git main

DOCKER:
- docker-compose.yml für die lokale Entwicklung: PostgreSQL 16 + Mailhog, Build-Kontext IMMER am Monorepo-Root (nicht apps/api — häufiger Stolperstein)
- Produktion: mehrstufige Dockerfiles (api + web), API-Container läuft mit tsx und enthält src/ + prisma/ (Seeds direkt im Container ausführbar)

VPS (IONOS, vorbereitet — gleiche Infrastruktur wie die Werkstatt):
- root@212.227.73.93, SSH-Schlüssel ~/.ssh/werkstatt_vps, Zielverzeichnis /opt/hotelsoftware
- WICHTIG: Auf dem Server laufen bereits Coolify/Traefik — Ports 80/443/8080 sind BELEGT. Also: keine eigenen Host-Ports, Anbindung über Traefik-Labels (Präfix z.B. hs-), Docker-Netzwerk coolify (external), Host hotelsoftware.aiconso.eu, certresolver letsencrypt — exaktes Muster in docker-compose.vps.yml + docker-compose.vps-tls.yml im Werkstattmanager-Repo
- .env auf dem VPS anlegen mit generierten Secrets + APP_DOMAIN=hotelsoftware.aiconso.eu (A-Record ist gesetzt)
- Minimale Server-Eingriffe: nichts an Auth, Coolify oder dem Traefik-Grundsystem anfassen
- Deployment: git pull && docker compose up -d --build && im API-Container «npx prisma db push --skip-generate»
- Wichtig — Lokal = VPS ohne Ausnahme: Alles, was lokal existiert (Code UND Daten), wird 1:1 auch auf den VPS gespielt (Seed im API-Container mit dem NEUEN Image laufen lassen oder Datei per docker cp reinbringen). Es gibt kein «nur lokal».
- Nach dem ersten Deploy verifizieren: HTTPS-Zertifikat gültig, Login über das öffentliche Internet funktioniert

Starte mit der Abstimmung zum Funktionsscope.
```
