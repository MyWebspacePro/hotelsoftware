# HotelGuru — Phasenplan (Implementierung nach GO)

Tech-Stack fix: Monorepo (npm workspaces) · apps/web (React 18 + Vite + TS + Tailwind 4 +
TanStack Query + react-router + react-i18next, DE) · apps/api (Fastify 5 + Prisma 6 +
PostgreSQL 16 + Zod + JWT/bcryptjs) · packages/shared (Business-Logik + Unit-Tests).
Build-Kontexte immer am Monorepo-Root. Produktions-Dockerfiles mehrstufig; API-Container
läuft mit `tsx`, enthält `src/` + `prisma/` (Seeds im Container ausführbar).

## Grundregel: Lokal = VPS ohne Ausnahme
Nach jeder Phase: Commit/Push auf `main` und 1:1-Spiegel auf den VPS
(`/opt/hotelsoftware`, Traefik-Labels `hs-`, Netzwerk `coolify`, certresolver letsencrypt,
Ports 80/443/8080 NICHT publishen). Seed im API-Container mit dem NEUEN Image laufen lassen
oder per `docker cp` reinbringen. Smoke-Test nach jedem Deploy: Health + Login + Demo-Ansicht.
`VPS-UEBERGABE.md` mit Hermes-Verständnis kommt in Phase 1 ins Repo.

## Phase 0 — Fundament (Infrastruktur)
- Monorepo-Skelett (workspaces, tsconfig, eslint, vitest), `packages/shared` mit Test-Lauf
- `docker-compose.yml` lokal: PostgreSQL 16 + Mailhog
- API: Fastify-Grundgerüst, Zod-Validierung, JWT Access/Refresh, Rollen, Passwort-Ändern,
  Benutzerverwaltung-CRUD
- Web: Vite+Tailwind-Skelett, Router, Login, i18n-Grüst (DE)
- Prisma-Schema v1 (Auth/Org: User, Hotel, SystemConfig) + Migration
- Seeds: Admin-User, fiktives „Alpina Montana" (Hotel), Länder-Konfiguration DE/AT/CH
- **Deploy 0:** VPS-Grundsetup (compose.vps.yml + tls-Overlay nach Werkstattmuster, .env mit
  openssl-Secrets), HTTPS-Verifikation + Login über öffentliches Internet

## Phase 1 — Stammdaten + Zimmerplan + Reservierung
- Zimmertypen/Zimmer, Ratenpläne, Saisons/PriceRules, Artikel, TaxRate-Matrix
- Verfügbarkeits-Engine + `priceFor` in shared (Unit-Tests)
- Grafischer Zimmerplan (Ansicht Tag/Woche/Monat, Drag-Reservierung)
- Booking-Statusmaschine (Anfrage→Angebot→Bestätigung→Storno) + Guest-CRUD
- Seeds: 50 Zimmer, Ratenpläne, ±3 Monate Demo-Belegung
- **Deploy 1** + Smoke-Test

## Phase 2 — Abrechnung & Rechnungslegung
- Folio-Konten, Verzehr-Buchungen (Artikel → Zimmerkonto), An-/Abzahlungen
- Kurtaxe-Engine (Altersstaffeln, Befreiungen, Pauschalen) → Folio-Entries
- HP-Splitting-Engine + Rechnungslegung (Einzel/Sammel/Verdichtung, Vorausrechnung,
  Länder-Nummernkreise, Storno-Kette, PDF)
- Check-in/Check-out-Flows, Tagesabschluss, Kassenbuch
- FiBu-Export: DATEV-Format + generischer CSV-Export (CH), AccountMapping
- **Deploy 2** + Smoke-Test (Demo-Rechnung DE/AT/CH)

## Phase 3 — Meldewesen & DSGVO
- RegistrationProfiles DE/AT/CH, Registrierungsdaten an Reservierung (Check-in-Pflichtfelder)
- Exporte: DE Meldeschein-PDF, AT Gästeblatt + Statistik-Austria-Monatsmeldungs-CSV,
  CH Kantons-CSV (Feratel/BRZ-API-Anbindung bewusst Stufe 2 — Datenstruktur bereits korrekt)
- DSGVO-Löschautomatik (RetentionRuns), AuditLog auf allen kritischen Aktionen
- **Deploy 3** + Smoke-Test

## Phase 4 — Housekeeping + Personal
- Zimmerstatus-Board, HousekeepingTasks (Reinigungsarten, Zimmerziele, DND), Technik-Tickets
- Personal: Employees, ShiftTemplates, Dienstplan-Editor (Woche/Abteilung), Urlaubsanträge +
  Kontingente + Genehmigungen, Jahres-Urlaubsübersicht
- **Deploy 4** + Smoke-Test

## Phase 5 — Vertrieb: Web-Anfrage + iCal-Kanäle
- Öffentliche Buchungsanfrage (Tailwind-Öffentlichkeitsroute, Verfügbarkeitscheck, Anti-Spam),
  Verarbeitung im Backoffice (Anfrage → Booking)
- iCal-Import (Airbnb/Booking.com) mit Konfliktübersicht + iCal-Export-Feeds,
  ChannelConnection-Verwaltung, Sync-Log
- **Deploy 5** + Smoke-Test (Test-Anfrage von außen + iCal-Roundtrip)

## Phase 6 — Abnahme & Übergabe
- End-to-End-Regression (Login → Reservierung → Check-in → Verzehr → Kurtaxe → Rechnung →
  Tagesabschluss → FiBu-Export → Meldewesen-Export)
- Statistiken final (Belegung/ADR/RevPAR/Nächtigungsstatistik)
- `VPS-UEBERGABE.md` final, `docs/PROJEKT-STATUS.md` mit Zugängen (nicht committete Secrets
  bleiben in VPS-.env)
- **Deploy 6** = Produktionsstand lokal == VPS

## Stufe 2 (eigene Ausbauphasen nach MVP-Abnahme)
fiskaltrust-RKSV · TSE-Verkaufserfassung (DE) · XRechnung/ZUGFeRD · Stripe-Terminal-Payment
(tokenisiert) · Channel-ARI-API · Gastro-POS-Schnittstellen-Konzept · CRM-Selektion

## Arbeitsweise
- Schrittweise, kontextsparend: pro Phase 1–2 Commits, kein Big-Bang
- Business-Logik IMMER in `packages/shared` mit Vitest-Unit-Tests
- `.env` nie committen (nur `.env.example`); Push per
  `GIT_TERMINAL_PROMPT=0 git push https://x-access-token:$(gh auth token)@github.com/MyWebspacePro/hotelsoftware.git main`
