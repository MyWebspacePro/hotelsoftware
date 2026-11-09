/**
 * Basis-Seed: Admin-User + Demohotel „Alpina Montana" (fiktiv) + DACH-Länderkonfiguration.
 * Laufbar lokal (`npm run db:seed`) und im API-Container auf dem VPS
 * (`npx tsx prisma/seed.ts`).
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { COUNTRY_DEFAULTS } from "@hg/shared";

const prisma = new PrismaClient();

interface SeedUser {
  email: string;
  firstName: string;
  lastName: string;
  role: "ADMIN" | "MANAGER" | "RECEPTION" | "HOUSEKEEPING" | "SERVICE";
  password: string;
}

const SEED_USERS: SeedUser[] = [
  { email: "admin@hotelguru.local", firstName: "System", lastName: "Admin", role: "ADMIN", password: "Admin1234!" },
  { email: "manager@hotelguru.local", firstName: "Marta", lastName: "Steiner", role: "MANAGER", password: "Demo1234!" },
  { email: "rezeption@hotelguru.local", firstName: "Lena", lastName: "Huber", role: "RECEPTION", password: "Demo1234!" },
  { email: "housekeeping@hotelguru.local", firstName: "Milena", lastName: "Petrova", role: "HOUSEKEEPING", password: "Demo1234!" },
  { email: "service@hotelguru.local", firstName: "Jonas", lastName: "Fischer", role: "SERVICE", password: "Demo1234!" },
];

async function main(): Promise<void> {
  // 1. Demohotel (fiktiv) — nur anlegen, wenn noch keines existiert
  let hotel = await prisma.hotel.findFirst({ where: { deletedAt: null } });
  if (!hotel) {
    hotel = await prisma.hotel.create({
      data: {
        name: "Alpina Montana",
        address: "Bergstrasse 12",
        zip: "6370",
        city: "Kitzbühel (Demo)",
        country: "AT",
        currency: "EUR",
        language: "de",
      },
    });
    console.log(`🏨 Hotel angelegt: ${hotel.name}`);
  }

  // 2. SystemConfig: Referenz-Matrix für alle DACH-Länder ab Tag 1
  await prisma.systemConfig.upsert({
    where: { hotelId: hotel.id },
    update: {
      config: {
        activeCountry: hotel.country,
        taxMatrix: COUNTRY_DEFAULTS,
        // Stufe-2-Slots (Phase 2/3 füllen diese strukturiert):
        touristTax: {},
        registrationProfiles: {},
        retention: {},
        options: { multiProperty: false },
      } as never,
    },
    create: {
      hotelId: hotel.id,
      config: {
        activeCountry: hotel.country,
        taxMatrix: COUNTRY_DEFAULTS,
        touristTax: {},
        registrationProfiles: {},
        retention: {},
        options: { multiProperty: false },
      } as never,
    },
  });

  // 3. Benutzer (idempotent via Upsert)
  for (const seedUser of SEED_USERS) {
    const passwordHash = await bcrypt.hash(seedUser.password, 10);
    await prisma.user.upsert({
      where: { email: seedUser.email },
      update: { active: true, deletedAt: null, hotelId: hotel.id },
      create: {
        email: seedUser.email,
        firstName: seedUser.firstName,
        lastName: seedUser.lastName,
        role: seedUser.role,
        active: true,
        hotelId: hotel.id,
        passwordHash,
      },
    });
    console.log(`👤 ${seedUser.role.padEnd(12)} ${seedUser.email}`);
  }

  console.log("✅ Seed fertig — Admin: admin@hotelguru.local / Admin1234!");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
