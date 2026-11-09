import { describe, expect, it } from "vitest";
import { anonymizedGuestFields, anonymizedRegistrationFields, shouldAnonymizeGuest } from "./gdpr.js";

describe("anonymizedGuestFields", () => {
  it("ersetzt Personenbezug, hält Referenz in lastName", () => {
    const a = anonymizedGuestFields("cmw9abc123");
    expect(a.firstName).toBe("Anonymisiert");
    expect(a.lastName).toContain("cmw9abc123");
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
  it("nie übernachtet → nein", () => {
    expect(
      shouldAnonymizeGuest({ lastDeparture: null, hasActiveOrFutureStay: false, retentionDays: 1095, todayIso: "2026-11-09" }),
    ).toBe(false);
  });
});
