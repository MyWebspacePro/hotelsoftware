import { prisma } from "./prisma.js";
import { mustBeRegistered, REGISTRATION_PROFILES, retentionUntil, type CountryCode } from "@hg/shared";

const dateToIso = (d: Date) => d.toISOString().slice(0, 10);
const isoToDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export interface RegistrationGenerateResult {
  created: number;
  updated: number;
  skippedLocalGuests: number;
}

/**
 * Meldescheine/Gästeblätter für alle Reservierungen einer Buchung erzeugen
 * (beim Check-in automatisch aufgerufen; auch manuell nachnehmbar).
 * foreignOnly-Profile (DE/CH): Inländer werden bewusst nicht gemeldet.
 */
export async function generateRegistrationRecords(hotelId: string, bookingId: string): Promise<RegistrationGenerateResult> {
  const booking = await prisma.booking.findFirstOrThrow({
    where: { id: bookingId, hotelId },
    include: {
      guest: true,
      reservations: { where: { deletedAt: null } },
    },
  });
  const hotel = await prisma.hotel.findFirstOrThrow({ where: { id: hotelId } });
  const profile = REGISTRATION_PROFILES[hotel.country as CountryCode];
  const guest = booking.guest;
  const result: RegistrationGenerateResult = { created: 0, updated: 0, skippedLocalGuests: 0 };
  if (!guest) return result;

  if (!mustBeRegistered(guest.country, hotel.country as CountryCode, profile)) {
    result.skippedLocalGuests = 1;
    return result;
  }

  for (const res of booking.reservations) {
    const arrival = dateToIso(res.dateFrom);
    const departure = dateToIso(res.dateTo);
    const data = {
      fullName: `${guest.firstName} ${guest.lastName}`.trim(),
      birthDate: guest.birthDate ? dateToIso(guest.birthDate) : null,
      nationality: guest.nationality ?? guest.country ?? null,
      idType: guest.idType ?? null,
      idNumber: guest.idNumber ?? null,
      address: [guest.address, guest.zip, guest.city].filter(Boolean).join(", ") || null,
    };
    const existing = await prisma.registrationRecord.findUnique({
      where: { reservationId_guestId: { reservationId: res.id, guestId: guest.id } },
    });
    const payload = {
      country: hotel.country as CountryCode,
      ...data,
      birthDate: data.birthDate ? isoToDate(data.birthDate) : null,
      arrival: isoToDate(arrival),
      departure: isoToDate(departure),
      foreignGuest: (guest.country ?? "").trim().toUpperCase() !== hotel.country,
      retentionUntil: isoToDate(retentionUntil(departure, profile)),
    };
    if (existing) {
      await prisma.registrationRecord.update({ where: { id: existing.id }, data: payload });
      result.updated += 1;
    } else {
      await prisma.registrationRecord.create({ data: { hotelId, reservationId: res.id, guestId: guest.id, ...payload } });
      result.created += 1;
    }
  }
  return result;
}
