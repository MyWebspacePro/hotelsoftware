# HotelGuru (Repo: `hotelsoftware`)

Vollständige Hotelverwaltung für den DACH-Raum — für normale Familien-/Ferienhotels und
Aparthotels (Referenzgröße ~50 Zimmer). PMS, Abrechnung mit DACH-Steuer-/Kurtaxe-Matrix,
Meldewesen, Housekeeping, Personal (Dienst-/Urlaubsplan), Buchungsanfragen via Webseite,
iCal-Portalkanäle (Airbnb/Booking.com). Benchmark: Casablanca hotelsoftware, Elite Solutions.

## Stack
- **apps/web** — React 18 + Vite + TypeScript + Tailwind 4 + TanStack Query + react-router + react-i18next (Deutsch)
- **apps/api** — Fastify 5 + Prisma 6 + PostgreSQL 16 + Zod + JWT/bcryptjs
- **packages/shared** — zentrale Business-Logik (Verfügbarkeit, Preise, Splitting, Kurtaxe, …) mit Unit-Tests

## Lokal starten
```bash
npm install
docker compose up -d          # PostgreSQL 16 + Mailhog
npm run db:push               # Prisma-Schema in die DB
npm run db:seed               # Admin-User + Demohotel „Alpina Montana"
npm run dev                   # API :3001 + Web :5173
npm run test                  # Unit-Tests (packages/shared, apps/api)
```

Login (Demo, nach Seed): `admin@hotelguru.local` / `Admin1234!`

## VPS-Deployment
```bash
docker compose -f docker-compose.vps.yml -f docker-compose.vps-tls.yml up -d --build
docker compose -f docker-compose.vps.yml exec api npx prisma db push --skip-generate
docker compose -f docker-compose.vps.yml exec api npx tsx prisma/seed.ts
```
Details + Notfall-Wiederherstellung: siehe `VPS-UEBERGABE.md`. Scope & Architektur: `docs/`.
