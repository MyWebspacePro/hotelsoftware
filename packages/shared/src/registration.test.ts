import { describe, expect, it } from "vitest";
import {
  REGISTRATION_PROFILES,
  missingFields,
  mustBeRegistered,
  retentionUntil,
} from "./registration.js";

describe("Meldeprofile", () => {
  it("DE: nur ausländische Gäste, 1 Jahr Aufbewahrung", () => {
    const p = REGISTRATION_PROFILES.DE;
    expect(p.foreignOnly).toBe(true);
    expect(p.retentionDays).toBe(365);
    expect(p.requiredFields).toContain("idNumber");
  });

  it("AT: alle Gäste (Gästeblatt)", () => {
    expect(REGISTRATION_PROFILES.AT.foreignOnly).toBe(false);
    expect(REGISTRATION_PROFILES.AT.retentionDays).toBe(730);
  });

  it("CH: ausländische Gäste, 5 Jahre", () => {
    expect(REGISTRATION_PROFILES.CH.retentionDays).toBe(1825);
  });
});

describe("missingFields", () => {
  const complete = {
    fullName: "Max Muster",
    birthDate: "1980-01-01",
    nationality: "IT",
    idType: "Pass",
    idNumber: "XA1234567",
    address: "Weg 1, 1010 Berlin",
  };

  it("vollständiger ausländischer Gast → keine fehlenden Felder (DE)", () => {
    expect(missingFields(complete, REGISTRATION_PROFILES.DE)).toEqual([]);
  });

  it("fehlende Ausweisnummer wird bemängelt (DE)", () => {
    const missing = missingFields({ ...complete, idNumber: null }, REGISTRATION_PROFILES.DE);
    expect(missing).toContain("Ausweisnummer");
  });

  it("AT verlangt keine Ausweisnummer", () => {
    const missing = missingFields({ ...complete, idNumber: null }, REGISTRATION_PROFILES.AT);
    expect(missing).toEqual([]);
  });
});

describe("mustBeRegistered", () => {
  it("DE: Österreicher im deutschen Hotel → melden", () => {
    expect(mustBeRegistered("AT", "DE", REGISTRATION_PROFILES.DE)).toBe(true);
  });
  it("DE: Deutscher im deutschen Hotel → seit 2025 kein Meldeschein", () => {
    expect(mustBeRegistered("DE", "DE", REGISTRATION_PROFILES.DE)).toBe(false);
  });
  it("AT: alle Gäste melden", () => {
    expect(mustBeRegistered("AT", "AT", REGISTRATION_PROFILES.AT)).toBe(true);
  });
});

describe("retentionUntil", () => {
  it("Abreise + Frist (DE: 365 Tage)", () => {
    expect(retentionUntil("2026-03-01", REGISTRATION_PROFILES.DE)).toBe("2027-03-01");
  });
  it("CH: 5 Jahre (1825 Tage, Schaltjahr-Abschlag)", () => {
    expect(retentionUntil("2026-03-01", REGISTRATION_PROFILES.CH)).toBe("2031-02-28");
  });
});
