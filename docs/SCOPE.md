# HotelGuru — Eingefrorener Funktionsscope

**Stand:** 09.11.2026 · **Status:** Eingefroren nach Abstimmung · **Produktname:** HotelGuru
**Repo:** github.com/MyWebspacePro/hotelsoftware (Branch `main`) · **VPS-Domain:** hotelsoftware.aiconso.eu

Ziel: Vollständige produktive Hotelverwaltung für den DACH-Raum (DE/AT/CH), ausgelegt auf normale
Familien-/Ferienhotels und Aparthotels, Referenzgröße ~50 Zimmer. Benchmark: Casablanca
hotelsoftware + Elite Solutions (Modulwelten als Pflichtkatalog).

---

## 1. Entscheidungslog (Abstimmung 09.11.2026)

| # | Entscheidung | Ergebnis |
|---|---|---|
| 1 | Buchungsportale | **iCal zuerst** (Airbnb/Booking.com Import/Export + Kanal-Übersicht); echte XML-API (Stufe 2/3) |
| 2 | Gastronomie | **Interne Verrechnung zuerst** (Artikel + Verzehr aufs Zimmerkonto, kein eigenes Restaurant-POS in Stufe 1) |
| 3 | Release 1 | **Alle fünf Bausteine:** PMS-Kern, Housekeeping+Personal, Web-Buchungsanfrage, iCal-Kanäle |
| 4 | Länder | **Alle DACH-Regeln ab Tag 1 konfigurierbar** (USt-Matrix, Kurtaxe, Meldewesen-Profile, Löschfristen, Währung/Sprache) |
| 5 | FiBu-Export | **Nicht nur DATEV** — CH hat kein DATEV: Export-System pluggbar (DATEV-Format DE/AT + generischer Buchungs-Export für CH/sonst) |
| 6 | Fiskalisierung AT | RKSV über **fiskaltrust** (CSP) — genehmigt |
| 7 | Payment | Projektleiter-Entscheid: **Abstraktionsschicht ab Tag 1 im Datenmodell** (nur Tokens, keine PAN), PSP-Anbindung (Stripe Terminal/SumUp) Stufe 2 |
| 8 | SPA/Wellness | Terminplanung in **Stufe 3** |
| 9 | Tagung/Bankett | **Gestrichen** (kann später als Erweiterung kommen) |
| 10 | E-Rechnung | XRechnung/ZUGFeRD-Export in **Stufe 2** |
| 11 | Multi-Property | **Ja, als aktivierbare Option** — `hotelId` ab Tag 1 im Datenmodell |
| 12 | Sprache | **Deutsch** (react-i18next bleibt im Stack, weitere Sprachen später) |
| 13 | Produktname | **HotelGuru** (Repo-Name bleibt `hotelsoftware`) |

## 2. Release 1 (MVP) — Modulliste

### A · PMS-Kern
- Auth: JWT Access/Refresh, Rollen (ADMIN, MANAGER, RECEPTION, HOUSEKEEPING, SERVICE), Benutzerverwaltung, Passwort ändern
- Stammdaten: Hotel, Zimmertypen, Zimmer, Ratenpläne, Saison-/Preiszeiträume, Artikel/Leistungen (mit Steuer-Schlüsseln)
- **USt-Matrix pro Land/Leistungsart** (DE 7/19, AT 10/20, CH 3,8/8,1/2,6) mit Gültigkeitsdaten; mehrere Sätze pro Rechnung; HP-Splitting (Logis vs. F&B vs. Sonstiges, konfigurierbare Aufteilungs-Keys)
- Grafischer Zimmerplan (Belegungsübersicht, Erstellen/Verschieben von Reservierungen)
- Reservierungen: Anfrage → Angebot → Bestätigung, Quellen (Web-Anfrage, Telefon, E-Mail, iCal-Kanal, Walk-in), Gruppen/Firmen/Agentur-Konten, Spannungskonten
- Check-in / Check-out, Gastabrechnung (Zimmerkonto/Folio): Verzehr aufs Zimmerkonto, An- und Abzahlungen
- **Rechnungslegung:** Einzel-/Sammel-/Verdichtungsrechnungen, Vorausrechnung/Anzahlung, Kurtaxe separat ausweisbar, Nummernkreise pro Land, Storno-Kette
- **Kurtaxe-Engine:** Basis (Nacht/Person), Altersstaffeln mit Freigrenzen (z. B. bis 15 J. frei), Befreiungsgründe, Pauschalen/Gästekarten, pro Kommune/Land konfigurierbar
- **Meldewesen-Datenmodell:** Meldeschein/Gästeblatt-Pflichtfelder pro Länderprofil, Aufbewahrungs-/Löschfristen (DE 1 J. §30 BMG, CH ≥5 J., Buchhaltung 8–10 J.), Exporte: DE Meldeschein-PDF, AT Gästeblatt/Statistik-Austria-Monatsmeldung (CSV), CH Kantons-Export (CSV)
- Kassenbuch + **Tagesabschluss** (Summen pro Zahlart/USt-Schlüssel, Journal)
- **FiBu-Export (pluggbar):** DATEV-Format (DE/AT) + generischer Buchungs-Export (CSV/XML) für CH
- Statistiken: Belegung, ADR, RevPAR, Nächtigungs-/Ankünfte-Statistik, Herkunftsstatistik

### B · Housekeeping
- Zimmerstatus-Board (sauber/schmutzig/geprüft, DND), Reinigungsarten (Check-out/Auf/Grund), Zimmerziele pro Team/Tag, Notizen, **Technik-Tickets**, Wäschezyklen

### C · Personal
- Dienstpläne (Schichtvorlagen, Zuweisung, Team-Abdeckung pro Tag), Urlaubsanträge + Kontingente + Genehmigung, Urlaubsplan-Jahresübersicht

### D · Vertrieb (MVP-lite)
- **Öffentliche Buchungsanfrage** (Verfügbarkeitscheck + Formular) und Verarbeitung/Bestätigung im Backoffice
- **iCal-Kanalverwaltung:** Airbnb/Booking.com Import (Reservierungen) + Export (Belegung/Sperrung), Konflikt-Übersicht, Sync-Log
- Verfügbarkeits-Engine in `packages/shared` (Unit-getestet): Kapazität − Überschneidungen − iCal-Sperrungen

### Querschnitt (ab Tag 1)
- Länder-Config DE/AT/CH (Währung EUR/CHF, Sprache, Steuer-Profile, Melde-Profile)
- AuditLog (wer/wann/was, Vorher/Nachher) · Soft-Delete (deletedAt) · DSGVO-Automatik: Anonymisierung/Löschung nach Frist pro Datentyp
- Multi-Property über `hotelId` (Option aktivierbar)
- Payment-Abstraktion im Datenmodell (Tokens, keine PAN)

## 3. Stufe 2 (nach MVP)
fiskaltrust-RKSV-Anbindung (Start-/Null-/Monats-/Schlussbelege, QR, Kettensignatur, digitaler Beleg ab 10/2026) · TSE-konforme Verkaufserfassung (DE) · E-Rechnung XRechnung/ZUGFeRD (EN 16931) · Payment: PSP-Anbindung Stripe Terminal (PreAuth/Capture, tokenisiert) · Gastro-POS-Schnittstellen-Konzept (Vectron/TiPOS, Charge to Room) · Channel-ARI-API (Channel-Manager-kompatibel) · CRM-Selektion/Kommunikationsvorlagen

## 4. Stufe 3 (optional, nach Bedarf)
SPA/Wellness-Terminplanung · Gäste-App/Online-Check-in/Self-Service · eigene OTA-Zertifizierung (Booking.com Connectivity, Expedia QuickConnect) · Gutscheinsysteme · Bankett/Tagung (falls gewünscht) · Stundenerfassung/Arbeitszeitkonto

## 5. Demodaten (Seed)
Fiktives „Alpina Montana — Familien- & Ferienhotel", ~50 Zimmer (Double, Family, Suite, 10 Apartments), Restaurant/Bar mit Halbpension, kleiner Wellnessbereich, Ski-/Skiservice im Winter. Kein Bezug zu realen Hotels. Demo-Rollen: Admin, Rezeption ×2, Housekeeping ×2, Service ×2, ~15 Mitarbeiter, Belegung über ±3 Monate mit iCal-Beispielen.

## 6. Recherche-Quellen (Kern)
- Casablanca: docs.casablanca.at (Schnittstellen/Module), casablanca.at
- Elite: elite.tirol (Front Office, Kassensystem), hotelkit-Integration
- USt: ESTV CH (3,8/8,1/2,6 %), BMF AT (UStR 2000), DE §12 UStG — Werte als Konfiguration, keine Hartkodierung
- Meldewesen: §29/30 BMG (DE, Aufbewahrung 1 J.), Beherbergungsstatistikgesetz 2021 + Feratel/DSG (AT), AIG/AURA (CH)
- Kurtaxe: Landes-/Kommunalrecht als Konfiguration (Tirol 2,60–5,00 €/P/N als Beispiel)
- Fiskalisierung: KassensichV §2 (Logis ohne TSE), RKSV + fiskaltrust (AT), keine TSE (CH)
- E-Rechnung: EN 16931/XRechnung/ZUGFeRD (DE 2025/2027/2028), QR-Rechnung (CH)
- Portale: Booking.com Connectivity Program, Expedia QuickConnect, Airbnb (iCal-Fallback)
