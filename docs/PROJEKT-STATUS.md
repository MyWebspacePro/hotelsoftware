# PROJEKT-STATUS — HotelGuru

**Stand:** 09.11.2026 · **Phase:** 2 abgeschlossen (Abrechnung/Rechnungslegung live) · **Repo:** github.com/MyWebspacePro/hotelsoftware

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
- `npm install` → `docker compose up -d` → `npm run db:push` → `npm run db:seed` → `npm run db:seed:demo` → `npm run dev`
- Phase-1-Smoke (09.11.2026, lokal + VPS): Verfügbarkeits-/Kalender-/Dashboard-Endpunkte grün,
  Buchung per API angelegt (Zimmer-Zuweisung + Saisonpreis korrekt), SPA-Routen 200
- Phase-2-Smoke (09.11.2026, lokal + VPS): Check-in → 21 Auto-Postings (HP-Splitting Logis/
  Verpflegung, Kurtaxe 5 €/P/N <15 J. frei) → Rechnung AT-2026-RE-0001 (Brutto 1.498 €, 3
  Steuer-Buckets) → PDF (2,8 KB, gültiges %PDF) → Tagesabschluss → DATEV-Export (Debitor
  10000 → 6200/6300, 10USt) — alle Schritte über die öffentliche Domain verifiziert

## Phase 2 — funktional
- **Gastkonto (Folio):** Check-in postet Logis-Nächte automatisch (HP wird per Splitting-Profil
  in Logis-/Verpflegungsanteil geteilt), Kurtaxe je Nacht aus konfigurierbaren Sätzen
  (Altersfreigrenze, Kindersatz, Saisonfenster); Artikel-/Freitext-Verzehr, Zahlungen,
  Rückbuchung bei Storno/No-Show
- **Rechnungslegung:** Länder-Nummernkreise (AT/DE/CH-RE-YYYY-NNNN), Einzel-/Anzahlungs-/
  Gutschriften mit Storno-Kette, Steuer-Buckets je Schlüssel, Kurtaxe separat belegfrei
  ausgewiesen, **PDF-Druck** (pdfkit, WinAnsi-Standardschriften)
- **Kasse:** Kassenbuch je Tag, Tagesabschluss (Zahlarten, Folio-Umsätze, Steuer-Summen)
- **FiBu-Export:** DATEV-Buchungsstapel (DE/AT) + generischer CSV (CH), Kontenmapping
  editierbar (Debitor/Erlöskonten je Kategorie)
- **Stammdaten-Plus:** Artikel/Leistungen mit Steuer-Schlüssel, Kurtaxe-Sätze verwaltbar
- **Shared-Engines:** touristTax, hpSplitting, invoiceTotals, fibu — 52 Unit-Tests gesamt

## Phase 1 — funktional
- **Zimmerplan** (Tag/Woche/Monat/2 Monate, Drag-Auswahl → Buchung, Klick → Details, Statusfarben, Heute-Linie)
- **Reservierungen** mit Statusfilter + Statusmaschine (shared), Buchungsdialog mit Live-Verfügbarkeit + Saisonpreisen
- **Stammdaten** (Zimmertypen, 50 Zimmer), **Preise** (Saisonregeln mit MinStay/Stop-Sell, Ratenpläne), **Gäste**
- **Shared-Engines:** availability, pricing (spezifischere Regel gewinnt), bookingStatus, dates — 34 Unit-Tests
- Demo: 5 Typen, 3 Raten, 25 Saisonregeln, 12 Artikel, 20 Gäste, 90 Buchungen (±3 Monate)

## Update-Prozedur (VPS)
```bash
cd /opt/hotelsoftware && git pull
docker compose -f docker-compose.vps.yml -f docker-compose.vps-tls.yml up -d --build
docker compose -f docker-compose.vps.yml exec api npx prisma db push --skip-generate
# Seeds nur wenn geändert (immer mit dem NEUEN Image): exec api npx tsx prisma/seed.ts bzw. seed-demo.ts
curl https://hotelsoftware.aiconso.eu/api/health
```
Details + Wiederherstellung: `VPS-UEBERGABE.md`. Scope/Architektur: `docs/SCOPE.md`, `docs/DATENMODELL.md`, `docs/PHASENPLAN.md`.

## Nächste Schritte
Phase 3: Meldewesen (Meldeprofile DE/AT/CH, Registrierungsdaten, Exporte) + DSGVO-Löschläufe
