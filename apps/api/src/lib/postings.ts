import { prisma } from "./prisma.js";
import {
  computeTouristTax,
  eachNight,
  splitHp,
  type HpProfile,
  type TouristTaxSeason,
  type VatRate,
} from "@hg/shared";

const dateToIso = (d: Date) => d.toISOString().slice(0, 10);
const isoToDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export interface CountryRates {
  logis: VatRate;
  food: VatRate;
  other: VatRate;
}

/** USt-Matrix des Hotels je Land (aus SystemConfig.config.taxMatrix). */
export async function getCountryRates(hotelId: string): Promise<{ country: string; rates: CountryRates; currency: string }> {
  const hotel = await prisma.hotel.findFirstOrThrow({ where: { id: hotelId } });
  const config = await prisma.systemConfig.findUnique({ where: { hotelId } });
  const matrix = (config?.config as { taxMatrix?: Record<string, { vatRates: VatRate[] }> })?.taxMatrix ?? {};
  const rates = matrix[hotel.country]?.vatRates ?? [];
  const pick = (category: string): VatRate =>
    rates.find((r) => r.category === category) ?? { key: "STD", label: "USt", rate: 0, category: "OTHER" as never };
  return {
    country: hotel.country,
    currency: hotel.currency,
    rates: { logis: pick("LOGIS"), food: pick("FOOD"), other: pick("OTHER") },
  };
}

export async function ensureFolio(hotelId: string, bookingId: string, type: "GUEST" | "GROUP" | "COMPANY" = "GUEST", title?: string) {
  const existing = await prisma.folioAccount.findFirst({
    where: { hotelId, bookingId, deletedAt: null },
  });
  if (existing) return existing;
  return prisma.folioAccount.create({ data: { hotelId, bookingId, type, title } });
}

async function getHpProfile(hotelId: string): Promise<HpProfile> {
  const config = await prisma.systemConfig.findUnique({ where: { hotelId } });
  const hp = (config?.config as { hpSplitting?: HpProfile })?.hpSplitting;
  return hp ?? { logisPct: 60, foodPct: 40, otherPct: 0 };
}

async function getTaxSeasons(hotelId: string): Promise<TouristTaxSeason[]> {
  const rows = await prisma.touristTaxConfig.findMany({
    where: { hotelId, deletedAt: null },
    orderBy: { validFrom: "asc" },
  });
  return rows.map((r) => ({
    validFrom: dateToIso(r.validFrom),
    validTo: dateToIso(r.validTo),
    adultCentsPerNight: r.adultCentsPerNight,
    childUntilAge: r.childUntilAge,
    childCentsPerNight: r.childCentsPerNight,
  }));
}

export interface PostingResult {
  folioId: string;
  posted: boolean;
  entryCount: number;
  touristTaxCents: number;
}

/**
 * Automatische Stay-Postings beim Check-in: Logis-Nächte (bei HP gesplittet in
 * Logis-/Verpflegungsanteil) + Kurtaxe je Nacht. Idempotent (einmal pro Folio).
 */
export async function postStay(hotelId: string, bookingId: string): Promise<PostingResult> {
  const booking = await prisma.booking.findFirstOrThrow({
    where: { id: bookingId, hotelId },
    include: {
      reservations: { where: { deletedAt: null }, include: { room: true, ratePlan: true, roomType: true } },
    },
  });
  const folio = await ensureFolio(hotelId, bookingId);
  const alreadyPosted = await prisma.folioEntry.count({
    where: { folioId: folio.id, source: "AUTO_STAY", deletedAt: null },
  });
  if (alreadyPosted > 0) {
    return { folioId: folio.id, posted: false, entryCount: 0, touristTaxCents: 0 };
  }

  const { rates } = await getCountryRates(hotelId);
  const hpProfile = await getHpProfile(hotelId);
  const seasons = await getTaxSeasons(hotelId);

  let entryCount = 0;
  let touristTaxCents = 0;

  for (const res of booking.reservations) {
    const nights = eachNight(dateToIso(res.dateFrom), dateToIso(res.dateTo));
    const basis = res.ratePlan?.basis ?? "NUR_LOGIS";
    const roomLabel = res.room ? ` Zi. ${res.room.number}` : ` ${res.roomType.name}`;

    for (const night of nights) {
      if (basis === "HP") {
        const split = splitHp(res.pricePerNightCents, hpProfile);
        await prisma.folioEntry.create({
          data: {
            hotelId,
            folioId: folio.id,
            kind: "CHARGE",
            text: `Logis (HP-Anteil) ${night}${roomLabel}`,
            qty: 1,
            unitPriceCents: split.logisCents,
            totalCents: split.logisCents,
            taxRateKey: rates.logis.key,
            taxRate: rates.logis.rate,
            taxCategory: "LOGIS",
            nightDate: isoToDate(night),
            source: "AUTO_STAY",
          },
        });
        if (split.foodCents > 0) {
          await prisma.folioEntry.create({
            data: {
              hotelId,
              folioId: folio.id,
              kind: "CHARGE",
              text: `Halbpension Verpflegungsanteil ${night}${roomLabel}`,
              qty: 1,
              unitPriceCents: split.foodCents,
              totalCents: split.foodCents,
              taxRateKey: rates.food.key,
              taxRate: rates.food.rate,
              taxCategory: "FOOD",
              nightDate: isoToDate(night),
              source: "AUTO_STAY",
            },
          });
        }
        entryCount += split.foodCents > 0 ? 2 : 1;
      } else {
        const text = basis === "UE_F" ? `Logis inkl. Frühstück ${night}${roomLabel}` : `Logis ${night}${roomLabel}`;
        await prisma.folioEntry.create({
          data: {
            hotelId,
            folioId: folio.id,
            kind: "CHARGE",
            text,
            qty: 1,
            unitPriceCents: res.pricePerNightCents,
            totalCents: res.pricePerNightCents,
            taxRateKey: rates.logis.key,
            taxRate: rates.logis.rate,
            taxCategory: "LOGIS",
            nightDate: isoToDate(night),
            source: "AUTO_STAY",
          },
        });
        entryCount += 1;
      }

      // Kurtaxe je Nacht (Erwachsene + Kinder ohne bekanntes Alter → Kindersatz)
      if (seasons.length > 0) {
        const guests = [
          ...Array.from({ length: res.adults }, () => ({ age: null as number | null })),
          ...Array.from({ length: res.children }, () => ({ age: 0 as number | null })),
        ];
        const tax = computeTouristTax(seasons, [night], guests);
        if (tax.totalCents > 0) {
          await prisma.folioEntry.create({
            data: {
              hotelId,
              folioId: folio.id,
              kind: "CHARGE",
              text: `Kurtaxe/Ortstaxe ${night} (${res.adults + res.children} Pers.)`,
              qty: 1,
              unitPriceCents: tax.totalCents,
              totalCents: tax.totalCents,
              taxRateKey: "TOURIST_TAX",
              taxRate: 0,
              taxCategory: "OTHER",
              isTouristTax: true,
              nightDate: isoToDate(night),
              source: "AUTO_STAY",
            },
          });
          touristTaxCents += tax.totalCents;
          entryCount += 1;
        }
      }
    }
  }

  return { folioId: folio.id, posted: true, entryCount, touristTaxCents };
}

/**
 * Rückbuchung (Storno/No-Show nach Check-in): noch nicht fakturierte
 * Auto-Postings werden entfernt.
 */
export async function reverseStay(hotelId: string, bookingId: string): Promise<number> {
  const folio = await prisma.folioAccount.findFirst({ where: { hotelId, bookingId, deletedAt: null } });
  if (!folio) return 0;
  const entries = await prisma.folioEntry.findMany({
    where: { folioId: folio.id, source: "AUTO_STAY", invoiceId: null, deletedAt: null },
  });
  for (const entry of entries) {
    await prisma.folioEntry.update({ where: { id: entry.id }, data: { deletedAt: new Date() } });
  }
  return entries.length;
}
