/**
 * Demo-Seed (Phase 1): Zimmertypen, 50 Zimmer, Ratenpläne, Saisons/Preisregeln,
 * Artikel, Gäste und ±3 Monate Demo-Belegung für „Alpina Montana" (fiktiv).
 * Idempotent: fügt nur an, wenn noch keine Zimmertypen existieren.
 * Ausführen: npm run db:seed:demo  (lokal) bzw. im Container: npx tsx prisma/seed-demo.ts
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { addDays, todayIso } from "@hg/shared";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const hotel = await prisma.hotel.findFirst({ where: { deletedAt: null } });
  if (!hotel) {
    console.error("❌ Kein Hotel gefunden — zuerst npm run db:seed (Basis-Seed) ausführen");
    process.exit(1);
  }
  const hotelId = hotel.id;

  const existingTypes = await prisma.roomType.count({ where: { hotelId, deletedAt: null } });
  if (existingTypes > 0) {
    // Nachrüsten: Kurtaxe/FiBu (Phase 2), Personal (Phase 4) bei bestehenden Daten sichern
    const taxCount = await prisma.touristTaxConfig.count({ where: { hotelId, deletedAt: null } });
    if (taxCount === 0) {
      await prisma.touristTaxConfig.create({
        data: {
          hotelId,
          name: "Beherbergungsabgabe (Demo: Kitzbühel-Satz)",
          validFrom: new Date("2026-01-01T00:00:00.000Z"),
          validTo: new Date("2099-01-01T00:00:00.000Z"),
          adultCentsPerNight: 500,
          childUntilAge: 15,
          childCentsPerNight: 0,
        },
      });
      console.log("➕ Kurtaxe-Config nachgerüstet");
    }
    await prisma.accountMapping.upsert({
      where: { hotelId_format: { hotelId, format: "DATEV" } },
      update: {},
      create: { hotelId, format: "DATEV", mapping: { debtorAccount: "10000", accounts: { LOGIS: "6200", FOOD: "6300", OTHER: "6400", TOURIST_TAX: "6600" } } as never },
    });
    await prisma.accountMapping.upsert({
      where: { hotelId_format: { hotelId, format: "GENERIC" } },
      update: {},
      create: { hotelId, format: "GENERIC", mapping: { debtorAccount: "1100", accounts: { LOGIS: "3000", FOOD: "3100", OTHER: "3200", TOURIST_TAX: "3300" } } as never },
    });
    const employeeCount = await prisma.employee.count({ where: { hotelId, deletedAt: null } });
    if (employeeCount === 0) {
      await seedStaff(hotelId);
      console.log("➕ Personal-Daten nachgerüstet");
    }
    if (await seedChannels(hotelId)) {
      console.log("➕ Kanal-Verbindungen nachgerüstet");
    }
    console.log("ℹ️  Demo-Stammdaten bereits vorhanden — Nachrüstungen sichergestellt");
    return;
  }

  // ── Zimmertypen ─────────────────────────────────────────────
  const types = await Promise.all(
    [
      { name: "Standard", capacity: 2, maxExtraBeds: 0, basePriceCents: 12000, color: "#6366f1", description: "Zweibettzimmer mit Bergblick" },
      { name: "Deluxe", capacity: 2, maxExtraBeds: 1, basePriceCents: 16000, color: "#0ea5e9", description: "Großes Doppelzimmer, Balkon" },
      { name: "Familie", capacity: 4, maxExtraBeds: 1, basePriceCents: 22000, color: "#22c55e", description: "Verbundene Zimmer für Familien" },
      { name: "Suite Panorama", capacity: 4, maxExtraBeds: 0, basePriceCents: 32000, color: "#a855f7", description: "Suite mit Wohnbereich und Panoramafenster" },
      { name: "Apartment", capacity: 4, maxExtraBeds: 2, basePriceCents: 18000, color: "#f59e0b", description: "Apartment mit Küche, Selbstversorger" },
    ].map((t) => prisma.roomType.create({ data: { ...t, hotelId } })),
  );
  const byName = Object.fromEntries(types.map((t) => [t.name, t]));

  // ── 50 Zimmer ───────────────────────────────────────────────
  const roomDefs: Array<{ type: string; count: number; floor: number; prefix: string }> = [
    { type: "Standard", count: 15, floor: 1, prefix: "" },
    { type: "Deluxe", count: 12, floor: 2, prefix: "" },
    { type: "Familie", count: 8, floor: 2, prefix: "" },
    { type: "Suite Panorama", count: 5, floor: 3, prefix: "" },
    { type: "Apartment", count: 10, floor: 1, prefix: "A" },
  ];
  let n = 100;
  for (const def of roomDefs) {
    for (let i = 0; i < def.count; i++) {
      const number = def.prefix ? `${def.prefix}${101 + i}` : String(++n);
      await prisma.room.create({
        data: { hotelId, roomTypeId: byName[def.type].id, number, floor: def.floor },
      });
    }
  }

  // ── Ratenpläne ──────────────────────────────────────────────
  const rpLogis = await prisma.ratePlan.create({ data: { hotelId, name: "Nur Logis", basis: "NUR_LOGIS", cancellationTerms: "Kostenlos bis 7 Tage vor Anreise" } });
  const rpUeF = await prisma.ratePlan.create({ data: { hotelId, name: "Übernachtung + Frühstück", basis: "UE_F", cancellationTerms: "Kostenlos bis 3 Tage vor Anreise" } });
  const rpHp = await prisma.ratePlan.create({ data: { hotelId, name: "Halbpension", basis: "HP", cancellationTerms: "Kostenlos bis 14 Tage vor Anreise" } });

  // ── Preisregeln (Saisons, ±1 Jahr) ─────────────────────────
  const y = new Date().getUTCFullYear();
  const seasons = [
    { name: "Zwischensaison Herbst", from: `${y}-10-15`, to: `${y}-12-19`, priceFactor: 1.0 },
    { name: "Weihnachten & Silvester", from: `${y}-12-20`, to: `${y + 1}-01-06`, priceFactor: 1.6, minStay: 3 },
    { name: "Wintersaison", from: `${y + 1}-01-06`, to: `${y + 1}-03-15`, priceFactor: 1.45 },
    { name: "Frühling", from: `${y + 1}-03-15`, to: `${y + 1}-06-30`, priceFactor: 1.1 },
    { name: "Sommersaison", from: `${y + 1}-07-01`, to: `${y + 1}-09-15`, priceFactor: 1.3 },
  ];
  for (const rt of types) {
    for (const s of seasons) {
      await prisma.priceRule.create({
        data: {
          hotelId,
          roomTypeId: rt.id,
          name: s.name,
          dateFrom: new Date(`${s.from}T00:00:00.000Z`),
          dateTo: new Date(`${s.to}T00:00:00.000Z`),
          priceCents: Math.round((rt.basePriceCents * s.priceFactor) / 100) * 100,
          minStay: s.minStay ?? 1,
        },
      });
    }
  }

  // ── Artikel (Verrechnung aufs Zimmer) ────────────────────────
  const articles: Array<[string, "FOOD" | "DRINK" | "SPA" | "SKISERVICE" | "OTHER", string, number]> = [
    ["Frühstück Buffet", "FOOD", "AT_SPEISEN_10", 1800],
    ["Halbpensionszuschlag", "FOOD", "AT_SPEISEN_10", 3200],
    ["Kaffee", "DRINK", "AT_SPEISEN_10", 380],
    ["Bier vom Fass 0,5l", "DRINK", "AT_SPEISEN_10", 560],
    ["Rotwein Glas", "DRINK", "AT_SPEISEN_10", 690],
    ["Massage Rücken 30min", "SPA", "AT_STD_20", 4500],
    ["Saunatuch-Set", "SPA", "AT_STD_20", 500],
    ["Skipass Tageskarte", "SKISERVICE", "AT_STD_20", 6200],
    ["Skischuhverleih", "SKISERVICE", "AT_STD_20", 1600],
    ["Parkplatz Garage/Nacht", "OTHER", "AT_STD_20", 1200],
    ["Hund/Nacht", "OTHER", "AT_STD_20", 1500],
    ["Wäschepaket Apartment", "OTHER", "AT_STD_20", 2500],
  ];
  for (const [name, category, taxRateKey, unitPriceCents] of articles) {
    await prisma.article.create({ data: { hotelId, name, category, taxRateKey, unitPriceCents } });
  }

  // ── Gäste ───────────────────────────────────────────────────
  const guestDefs = [
    ["Sabine", "Meyer", "Berlin", "DE"], ["Thomas", "Berger", "Wien", "AT"],
    ["Claudia", "Steiner", "Graz", "AT"], ["Hans", "Gruber", "München", "DE"],
    ["Petra", "Schmidt", "Hamburg", "DE"], ["Luca", "Rossi", "Bozen", "IT"],
    ["Anna", "Fischer", "Zürich", "CH"], ["Markus", "Weber", "Stuttgart", "DE"],
    ["Elisabeth", "Huber", "Innsbruck", "AT"], ["Peter", "Klein", "Frankfurt", "DE"],
    ["Julia", "Wagner", "Leipzig", "DE"], ["Andreas", "Hofer", "Brixen", "IT"],
    ["Miriam", "Schulz", "Dresden", "DE"], ["Georg", "Bauer", "Salzburg", "AT"],
    ["Nicole", "Brunner", "Basel", "CH"], ["Stefan", "Winkler", "Linz", "AT"],
    ["Katrin", "Zimmermann", "Köln", "DE"], ["David", "Schwarz", "Bern", "CH"],
    ["Franz", "Leitner", "Villach", "AT"], ["Sandra", "Neumann", "Hannover", "DE"],
  ];
  const guests = [];
  for (const [firstName, lastName, city, country] of guestDefs) {
    guests.push(
      await prisma.guest.create({
        data: {
          hotelId,
          firstName,
          lastName,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase().replace("ü", "ue").replace("ö", "oe").replace("ä", "ae")}@example.com`,
          city,
          country,
          nationality: country,
        },
      }),
    );
  }

  // ── Demo-Belegung ±3 Monate ────────────────────────────────
  const rooms = await prisma.room.findMany({ where: { hotelId, deletedAt: null }, orderBy: { number: "asc" } });
  const today = todayIso();
  const sources = ["PHONE", "EMAIL", "WALK_IN", "WEBSITE_REQUEST"] as const;
  const plans = [rpLogis, rpUeF, rpHp];
  let seedRand = 42;
  const rand = (max: number) => (seedRand = (seedRand * 1103515245 + 12345) % 2147483648) % max;

  // Blockierte Zeiträume je Zimmer für Konfliktfreiheit
  const occupied: Record<string, Array<{ from: string; to: string }>> = {};
  const tryBook = (roomId: string, from: string, to: string): boolean => {
    const list = (occupied[roomId] ??= []);
    if (list.some((o) => from < o.to && o.from < to)) return false;
    list.push({ from, to });
    return true;
  };

  let created = 0;
  const statusesByOffset = (from: string, to: string): "CHECKED_OUT" | "CHECKED_IN" | "CONFIRMED" | "OFFERED" | "INQUIRY" | "CANCELLED" => {
    if (to <= today) return "CHECKED_OUT"; // Aufenthalt beendet
    if (from <= today) return "CHECKED_IN"; // läuft gerade
    return "CONFIRMED";
  };

  for (let i = 0; i < 140 && created < 90; i++) {
    const offset = rand(90) - 30; // -30 bis +59 Tage
    const nights = [2, 3, 4, 5, 7][rand(5)];
    const from = addDays(today, offset);
    const to = addDays(from, nights);
    const room = rooms[rand(rooms.length)];
    if (!tryBook(room.id, from, to)) continue;
    const rt = types.find((t) => t.id === room.roomTypeId)!;
    const guest = guests[rand(guests.length)];
    const adults = Math.min(rt.capacity, 1 + rand(rt.capacity));
    const children = rt.capacity - adults > 0 ? rand(rt.capacity - adults + 1) : 0;
    const plan = plans[rand(plans.length)];
    let status = statusesByOffset(from, to);
    if (offset > 5) status = (["CONFIRMED", "CONFIRMED", "OFFERED", "INQUIRY"] as const)[rand(4)];
    if (offset > 20 && status !== "INQUIRY" && rand(6) === 0) status = "CANCELLED";

    const price = Math.round((rt.basePriceCents * (1 + Math.random() * 0.2)) / 100) * 100;
    const booking = await prisma.booking.create({
      data: {
        hotelId,
        status,
        source: sources[rand(sources.length)],
        guestId: guest.id,
        reservations: {
          create: {
            hotelId,
            status,
            roomId: room.id,
            roomTypeId: rt.id,
            ratePlanId: plan.id,
            dateFrom: new Date(`${from}T00:00:00.000Z`),
            dateTo: new Date(`${to}T00:00:00.000Z`),
            adults,
            children,
            pricePerNightCents: price,
            priceTotalCents: price * nights,
          },
        },
      },
    });
    void booking;
    created++;
  }

  // ── Kurtaxe-Konfiguration (Kitzbühel-Beispiel: 5,00 €/P/N, < 15 J. frei) ──
  await prisma.touristTaxConfig.create({
    data: {
      hotelId,
      name: "Beherbergungsabgabe (Demo: Kitzbühel-Satz)",
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validTo: new Date("2099-01-01T00:00:00.000Z"),
      adultCentsPerNight: 500,
      childUntilAge: 15,
      childCentsPerNight: 0,
    },
  });

  // ── FiBu-Kontenmapping Defaults ──────────────────────────────
  await prisma.accountMapping.upsert({
    where: { hotelId_format: { hotelId, format: "DATEV" } },
    update: {},
    create: { hotelId, format: "DATEV", mapping: { debtorAccount: "10000", accounts: { LOGIS: "6200", FOOD: "6300", OTHER: "6400", TOURIST_TAX: "6600" } } as never },
  });
  await prisma.accountMapping.upsert({
    where: { hotelId_format: { hotelId, format: "GENERIC" } },
    update: {},
    create: { hotelId, format: "GENERIC", mapping: { debtorAccount: "1100", accounts: { LOGIS: "3000", FOOD: "3100", OTHER: "3200", TOURIST_TAX: "3300" } } as never },
  });

  // ── Personal (Phase 4) ──────────────────────────────────────
  await seedStaff(hotelId);

  // ── Kanäle (Phase 5) ────────────────────────────────────────
  await seedChannels(hotelId);

  console.log(`✅ Demo-Daten: ${types.length} Zimmertypen, 50 Zimmer, 3 Ratenpläne, ${seasons.length * types.length} Preisregeln, ${articles.length} Artikel, ${guests.length} Gäste, ${created} Buchungen (±3 Monate) + Kurtaxe + FiBu + Personal + Kanäle`);
}

/** Demo-Kanäle (Phase 5): Airbnb/Booking-Verbindungen, deren Feed der API-Server selbst liefert. */
async function seedChannels(hotelId: string): Promise<boolean> {
  const count = await prisma.channelConnection.count({ where: { hotelId } });
  if (count > 0) return false;
  // Demo-Feed liegt auf dem API-Server selbst — funktioniert im Container (VPS) und lokal
  const demoUrl = "http://localhost:3001/api/public/ical/demo-feed";
  const familie = await prisma.roomType.findFirst({ where: { hotelId, name: "Familie", deletedAt: null } });
  const apartment = await prisma.roomType.findFirst({ where: { hotelId, name: "Apartment", deletedAt: null } });
  await prisma.channelConnection.create({
    data: {
      hotelId,
      name: "Airbnb – Familienzimmer",
      platform: "AIRBNB",
      direction: "BOTH",
      roomTypeId: familie?.id ?? null,
      importUrl: demoUrl,
      exportToken: randomBytes(16).toString("hex"),
    },
  });
  await prisma.channelConnection.create({
    data: {
      hotelId,
      name: "Booking.com – Apartments",
      platform: "BOOKING",
      direction: "BOTH",
      roomTypeId: apartment?.id ?? null,
      importUrl: demoUrl,
      exportToken: randomBytes(16).toString("hex"),
    },
  });
  return true;
}

/** Personal-Demodaten: 15 Mitarbeiter, Vorlagen, Dienstplan ±1 Woche, Urlaube, Tickets. */
async function seedStaff(hotelId: string): Promise<void> {
  const { addDays, startOfWeek, todayIso } = await import("@hg/shared");

  const defs: Array<[string, string, number]> = [
    ["Lena Huber", "RECEPTION", 25], ["Marco Gruber", "RECEPTION", 25],
    ["Sara Pichler", "RECEPTION", 25], ["Milena Petrova", "HOUSEKEEPING", 22],
    ["Ivana Novak", "HOUSEKEEPING", 22], ["Maria Steiner", "HOUSEKEEPING", 22],
    ["Jana Weber", "HOUSEKEEPING", 22], ["Toni Brunner", "HOUSEKEEPING", 22],
    ["Chef Koch Anton", "KITCHEN", 25], ["Sous-Chef Boris", "KITCHEN", 25],
    ["Kevin Maisch", "SERVICE", 22], ["Nina Falk", "SERVICE", 22],
    ["Hans Meister", "TECH", 24], ["Emma Klar", "WELLNESS", 22],
    ["Josef Brandstätter (Demo)", "ADMIN", 30],
  ];
  const employees: Record<string, { id: string; name: string }> = {};
  for (const [name, department, quota] of defs) {
    const e = await prisma.employee.create({ data: { hotelId, name, department: department as never, vacationQuotaDays: quota } });
    employees[name] = { id: e.id, name };
  }

  const templates: Array<[string, string, string, string]> = [
    ["Frühdienst Rezeption", "RECEPTION", "07:00", "15:00"],
    ["Spätdienst Rezeption", "RECEPTION", "15:00", "23:00"],
    ["Zimmerteam A", "HOUSEKEEPING", "08:30", "16:30"],
    ["Zimmerteam B", "HOUSEKEEPING", "09:00", "17:00"],
    ["Service Frühstück", "SERVICE", "06:30", "14:30"],
    ["Service Abends", "SERVICE", "17:00", "23:30"],
    ["Küche Früh", "KITCHEN", "06:00", "15:00"],
    ["Wellness-Nachmittag", "WELLNESS", "14:00", "20:00"],
  ];
  const templateByName: Record<string, { department: string; fromTime: string; toTime: string }> = {};
  for (const [name, department, fromTime, toTime] of templates) {
    const t = await prisma.shiftTemplate.create({ data: { hotelId, name, department: department as never, fromTime, toTime } });
    templateByName[name] = { department, fromTime, toTime };
  }
  void templateByName;

  // Dienstplan für diese und nächste Woche (Mo–So): Rezeption 2 Schichten/Tag,
  // Zimmerteam A/B täglich, Service/Küche an 6 Tagen
  const teamA = [employees["Milena Petrova"].id, employees["Ivana Novak"].id];
  const teamB = [employees["Maria Steiner"].id, employees["Jana Weber"].id];
  const recFrüh = [employees["Lena Huber"].id];
  const recSpät = [employees["Marco Gruber"].id];
  const monday = startOfWeek(todayIso());
  let shiftCount = 0;
  for (let w = 0; w < 2; w++) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(`${addDays(monday, w * 7 + d)}T00:00:00.000Z`);
      const recMorning = d % 2 === 0 ? recFrüh : recSpät;
      const recEvening = d % 2 === 0 ? recSpät : recFrüh;
      await prisma.shift.create({
        data: { hotelId, date, department: "RECEPTION", fromTime: "07:00", toTime: "15:00", assignments: { create: recMorning.map((employeeId) => ({ employeeId })) } },
      });
      await prisma.shift.create({
        data: { hotelId, date, department: "RECEPTION", fromTime: "15:00", toTime: "23:00", assignments: { create: recEvening.map((employeeId) => ({ employeeId })) } },
      });
      await prisma.shift.create({
        data: { hotelId, date, department: "HOUSEKEEPING", fromTime: "08:30", toTime: "16:30", assignments: { create: teamA.map((employeeId) => ({ employeeId })) } },
      });
      if (d % 2 === 1) {
        await prisma.shift.create({
          data: { hotelId, date, department: "HOUSEKEEPING", fromTime: "09:00", toTime: "17:00", assignments: { create: teamB.map((employeeId) => ({ employeeId })) } },
        });
      }
      if (d < 6) {
        await prisma.shift.create({
          data: { hotelId, date, department: "KITCHEN", fromTime: "06:00", toTime: "15:00", assignments: { create: [{ employeeId: employees["Chef Koch Anton"].id }] } },
        });
        await prisma.shift.create({
          data: { hotelId, date, department: "SERVICE", fromTime: "17:00", toTime: "23:30", assignments: { create: [{ employeeId: employees["Kevin Maisch"].id }, { employeeId: employees["Nina Falk"].id }] } },
        });
      }
      if (d >= 3) {
        await prisma.shift.create({
          data: { hotelId, date, department: "WELLNESS", fromTime: "14:00", toTime: "20:00", assignments: { create: [{ employeeId: employees["Emma Klar"].id }] } },
        });
      }
      shiftCount += d < 6 ? 6 : 5;
    }
  }

  // Urlaubsanträge: einer genehmigt (Milena, 2. Woche Jän.), einer offen
  await prisma.vacationRequest.create({
    data: {
      hotelId,
      employeeId: employees["Milena Petrova"].id,
      dateFrom: new Date("2027-01-11T00:00:00.000Z"),
      dateTo: new Date("2027-01-15T00:00:00.000Z"),
      days: 5,
      status: "APPROVED",
      approverId: null,
      decidedAt: new Date(),
    },
  });
  await prisma.vacationRequest.create({
    data: {
      hotelId,
      employeeId: employees["Kevin Maisch"].id,
      dateFrom: new Date("2026-12-28T00:00:00.000Z"),
      dateTo: new Date("2027-01-02T00:00:00.000Z"),
      days: 6,
      status: "PENDING",
    },
  });

  // Technik-Tickets
  await prisma.maintenanceTicket.create({ data: { hotelId, roomId: null, area: "Wellness", title: "Infrarotkabine 2 defekt", description: "Heizstrahler 2 zündet nicht. Techniker kommen lassen.", priority: "HIGH", status: "OPEN" } });
  await prisma.maintenanceTicket.create({ data: { hotelId, roomId: null, area: "Küche", title: "Spülmaschine läuft aus", description: "Dichtung links vorne. Notfall-Reparatur beauftragt.", priority: "NORMAL", status: "IN_PROGRESS" } });
  await prisma.maintenanceTicket.create({ data: { hotelId, roomId: null, area: "Außenbereich", title: "Wintermarkise Terrasse montiert", priority: "LOW", status: "DONE", resolvedAt: new Date() } });

  void shiftCount;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
