import { describe, expect, it } from "vitest";
import { anonymizedGuestFields, anonymizedRegistrationFields, shouldAnonymizeGuest } from "./gdpr.js";

describe("anonymizedGuestFields", () => {
  it("entfernt Personenbezug vollständig (keine ID im Namensfeld)", () => {
    const a = anonymizedGuestFields();
    expect(a.firstName).toBe("Anonymisiert");
    expect(a.lastName).toBe("Anonymisiert");
    expect(a.email).toBe("");
    expect(a.idNumber).toBe("");
    expect(a.birthDate).toBe("");
  });
});

describe("anonymizedRegistrationFields", () => {
  it("leert Meldeschein-Personenbezug", () => {
    const a = anonymizedRegistrationFields();
    expect(a.fullName).toBe("Anonymisiert");
    expect(a.nationality).toBe("");
    expect(a.address).toBe("");
  });
});

describe("shouldAnonymizeGuest", () => {
  it("Frist abgelaufen + kein künftiger Aufenthalt → ja", () => {
    expect(
      shouldAnonymizeGuest({ lastDeparture: "2022-01-01", hasActiveOrFutureStay: false, retentionDays: 1095, todayIso: "2026-11-09" }),
    ).toBe(true);
  });
  it("künftiger Aufenthalt → nein", () => {
    expect(
      shouldAnonymizeGuest({ lastDeparture: "2022-01-01", hasActiveOrFutureStay: true, retentionDays: 1095, todayIso: "2026-11-09" }),
    ).toBe(false);
  });
  it("Frist noch nicht abgelaufen → nein", () => {
    expect(
      shouldAnonymizeGuest({ lastDeparture: "2025-01-01", hasActiveOrFutureStay: false, retentionDays: 1095, todayIso: "2026-11-09" }),
    ).toBe(false);
  });
  it("Grenztag wird anonymisiert (<=)", () => {
    expect(
      shouldAnonymizeGuest({ lastDeparture: "2023-11-09", hasActiveOrFutureStay: false, retentionDays: 1095, todayIso: "2026-11-09" }),
    ).toBe(true);
  });
  it("nie übernachtet: nutzt createdIso als Referenz", () => {
    expect(
      shouldAnonymizeGuest({ lastDeparture: null, hasActiveOrFutureStay: false, retentionDays: 1095, todayIso: "2026-11-09", createdIso: "2020-01-01" }),
    ).toBe(true);
    expect(
      shouldAnonymizeGuest({ lastDeparture: null, hasActiveOrFutureStay: false, retentionDays: 1095, todayIso: "2026-11-09", createdIso: null }),
    ).toBe(false);
  });
});