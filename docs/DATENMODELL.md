# HotelGuru — Datenmodell-Entwurf (Prisma 6 / PostgreSQL 16)

Grundprinzipien: `hotelId` auf allen Betriebsdaten (Multi-Property-Option) · Soft-Delete via
`deletedAt` · AuditLog für geschäftskritische Entities · USt/Kurtaxe/Meldung als **Konfiguration**,
nie hartkodiert · alle geschäftlichen Berechnungen (Verfügbarkeit, Preise, Splitting, Kurtaxe,
Rechnungssummen) in `packages/shared` mit Unit-Tests.

## Schema-Abweichungen (implementierter Stand)
- USt-Sätze liegen als JSON-Matrix in `SystemConfig` (kein eigenes `TaxRate`-Model)
- `RegistrationProfile` und `HpSplittingProfile` sind Code-Profile/JSON, keine Tabellen
- `FolioEntryKind` = `CHARGE|CREDIT|DISCOUNT`; `InvoiceStatus` = `ISSUED|PARTIALLY_PAID|PAID|CANCELLED|VOID`
- `ChannelConnection` nutzt String-Werte (`GENERIC`/`AIRBNB`/`BOOKING`), `IcalBlock` heißt `IcalEvent`
- `PriceRule` ohne `ratePlanId`/Wochentag/Channel; `TouristTaxConfig` ohne `basis`/`exemptions`/`brackets`
- `Hotel.timezone` (Geschäftstage) und `Booking.stayPostedAt` (Idempotenz) neu ergänzt

## Organisation & Auth
- `User` (email, passwordHash, role: ADMIN|MANAGER|RECEPTION|HOUSEKEEPING|SERVICE, active, hotelId)
- `Hotel` (name, address, country: DE|AT|CH, currency: EUR|CHF, language, multiProperty settings)
- `SystemConfig` (per Hotel: Steuer-Matrix-Referenz, Meldeprofil, Löschfristen, Optionen)

## Stammdaten & Preise
- `RoomType` (name, capacity, description, amenities, maxExtraBeds)
- `Room` (number, floor, roomTypeId, housekeepingDefaultStatus)
- `RatePlan` (name, basis: ÜF|HP|NUR_LOGIS|APARTMENT, cancellationTerms, priceBasis)
- `Season` (name, dateFrom, dateTo) · `PriceRule` (roomTypeId × ratePlanId × dateRange: basePrice, weekday overrides, minStay, stopSell, channelId?)
- `Article` (name, category: FOOD|DRINK|SPA|SKISERVICE|OTHER, taxRateKey, unitPrice, chargeToRoom bool)
- `TaxRate` (key, country, rate, validFrom, validTo, category: LOGIS|FOOD|OTHER) — Matrix-Engine
- `HpSplittingProfile` (name, shares: LOGIS %, FOOD %, OTHER %) — HP-Splitting-Keys

## Reservierung & Gäste
- `Guest` (anrede, name, address, nationality, birthDate, idType/idNumber [Meldewesen], marketingConsent, retentionUntil, deletedAt)
- `Company|Agency` (Firmen-/Agenturkonto, Verdichtungsrechnung-Einstellungen)
- `Booking` (status: INQUIRY|OFFERED|CONFIRMED|CHECKED_IN|CHECKED_OUT|CANCELLED|NO_SHOW, source: WEBSITE_REQUEST|PHONE|EMAIL|ICAL_AIRBNB|ICAL_BOOKING|WALK_IN, channelRef, guestId, companyId?, notes)
- `Reservation` (bookingId, roomTypeId, roomId?, dateFrom, dateTo, adults, children, ratePlanId, priceSnapshot, extras)
- `BookingRequest` (öffentliche Anfrage: name, email, phone, dates, guests, roomTypeWish, message, status) → wird zu `Booking`
- `ChannelConnection` (channel: AIRBNB|BOOKING, icalImportUrl, icalExportToken, lastSyncAt, active)
- `ICalBlock` (roomId/roomTypeId, dateFrom, dateTo, externalRef, source)

## Abrechnung
- `FolioAccount` (per Reservation | Booking | Company; Typ: GUEST|GROUP|COMPANY)
- `FolioEntry` (folioId, kind: CHARGE|CREDIT|TAX|ADVANCE, articleId?, description, qty, unitPrice, taxRateKey, hpSplitRef?, source: PMS|ICAL|IMPORT, postedAt, postedBy)
- `Invoice` (number, series [Länder-Nummernkreis], folioId, invoiceType: STANDARD|ADVANCE|CREDIT|CONSOLIDATED, country, breakdown JSON (Sätze pro TaxRateKey), status: DRAFT|ISSUED|PARTIALLY_PAID|PAID|CANCELLED, pdfRef)
- `InvoiceLine` (invoiceId, text, qty, unitPrice, taxRateKey, isTouristTax bool, hpSplitRef?)
- `Payment` (invoiceId, method: CASH|CARD|SEPA|ONLINE|VOUCHER, amount, date, pspTokenRef?, pspProvider?)
- `AdvancePayment` (bookingId, amount, dueDate, settledInvoiceId?)
- `DayClosing` (hotelId, date, totals JSON je Zahlart/USt-Schlüssel, journal JSON, closedBy) — Tagesabschluss
- `AccountingExport` (period, format: DATEV|GENERIC_CSV|XML, status, fileRef, accountMappingRef)
- `AccountMapping` (Article-Kategorie/Leistungsart → FiBu-Konto, pro Export-Format)

## Kurtaxe & Meldewesen
- `TouristTaxConfig` (hotelId, basis: PER_PERSON_NIGHT|PER_ROOM_NIGHT|PER_ACCOMMODATION, ageBrackets JSON [{toAge, free|price}], exemptions[], flatRates/Pauschalkarten JSON, validFrom, validTo) — mehrere Sätze saisonal möglich
- `RegistrationProfile` (country: Feldschema Meldeschein/Gästeblatt: Pflichtfelder, ID-Typen, Befreiungen)
- `RegistrationRecord` (reservationId, guestId, profileSnapshot JSON, status: DRAFT|SUBMITTED, retentionUntil, anonymizedAt)
- `RegistrationExport` (type: DE_PDF|AT_GAESTEBLATT|AT_STATISTIK_MONAT|CH_CANTON_CSV, period/periodFrom, fileRef, status)

## Housekeeping
- `RoomStatus` (roomId, date, status: CLEAN|DIRTY|INSPECTED|BLOCKED, dnd bool, notes)
- `HousekeepingTask` (roomId, date, type: CHECKOUT|STAYOVER|DEEP|LAUNDRY, assigneeId?, status: OPEN|DONE|SKIPPED, checklist JSON?)
- `MaintenanceTicket` (roomId?, area, title, priority, status, resolvedAt)

## Personal
- `Employee` (userId?, name, department: RECEPTION|KITCHEN|SERVICE|HOUSEKEEPING|TECH|WELLNESS|ADMIN, active, vacationQuotaDays)
- `ShiftTemplate` (name, slots JSON [{from,to}], departments)
- `Shift` (date, templateId, employeeIds[], department, published bool)
- `VacationRequest` (employeeId, dateFrom, dateTo, days, status: PENDING|APPROVED|REJECTED, approverId)
- `VacationBalance` (employeeId, year, quota, used, planned)

## Querschnitt
- `AuditLog` (entity, entityId, action, actorId, before JSON, after JSON, at)
- `RetentionRun` (executedAt, entity, anonymizedCount, deletedCount) — DSGVO-Löschautomatik
- Alle Entities mit `createdAt`, `updatedAt`, `deletedAt`

## Kern-Berechnungen (packages/shared, Unit-getestet)
1. `availability(roomTypeIds, dateRange)` — Kapazität − Reservierungen − iCal-Sperrungen, Overbooking-Warnung
2. `priceFor(stay, ratePlan, dateRange)` — Saison-/Wochen­tagsregeln, Kinder-/Zuschlag-Logik
3. `splitHp(amount, profile)` — HP-/Pauschal-Splitting auf Steuer-Schlüssel
4. `touristTax(guests, nights, config)` — Altersstaffeln, Befreiungen, Pauschalen
5. `invoiceTotals(lines, config)` — Multi-Satz-Breakdown, Rundungsregeln (CHF 0.05!)
6. `retentionDecide(records, config)` — Lösch/Anonymisierungs-Empfehlung je Datentyp
