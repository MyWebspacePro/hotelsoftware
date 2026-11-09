/**
 * Demo-Seed (Phase 1): Zimmertypen, 50 Zimmer, Ratenpläne, Saisons/Preisregeln,
 * Artikel, Gäste und ±3 Monate Demo-Belegung für „Alpina Montana" (fiktiv).
 * Idempotent: fügt nur an, wenn noch keine Zimmertypen existieren.
 * Ausführen: npm run db:seed:demo  (lokal) bzw. im Container: npx tsx prisma/seed-demo.ts
 */
import { PrismaClient } from "@prisma/client";
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
    console.log("ℹ️  Demo-Stammdaten bereits vorhanden — übersprungen");
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

  // ── Artikel (Phase-2-Vorbereitung: Verrechnung aufs Zimmer) ─
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

  console.log(`✅ Demo-Daten: ${types.length} Zimmertypen, 50 Zimmer, 3 Ratenpläne, ${seasons.length * types.length} Preisregeln, ${articles.length} Artikel, ${guests.length} Gäste, ${created} Buchungen (±3 Monate)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
