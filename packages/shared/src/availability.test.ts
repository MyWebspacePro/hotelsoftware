import { describe, expect, it } from "vitest";
import { availabilityForStay, isBlocking, occupancyByDay, type ReservationLike } from "./availability.js";

const RT = "rt1";

function res(status: string, from: string, to: string, roomTypeId = RT): ReservationLike {
  return { roomTypeId, dateFrom: from, dateTo: to, status };
}

describe("availabilityForStay", () => {
  it("leeres Haus: alles frei", () => {
    const r = availabilityForStay([], RT, 5, "2026-03-10", "2026-03-12");
    expect(r.availableForStay).toBe(5);
    expect(r.blockingCount).toBe(0);
  });

  it("eine bestätigte Reservierung blockiert 1 Einheit für beide Nächte", () => {
    const r = availabilityForStay([res("CONFIRMED", "2026-03-10", "2026-03-12")], RT, 3, "2026-03-10", "2026-03-12");
    expect(r.perNight["2026-03-10"]).toBe(2);
    expect(r.perNight["2026-03-11"]).toBe(2);
    expect(r.availableForStay).toBe(2);
    expect(r.blockingCount).toBe(1);
  });

  it("Checkout-Tag blockiert nicht den Folgetag (halboffen)", () => {
    const r = availabilityForStay([res("CONFIRMED", "2026-03-10", "2026-03-12")], RT, 1, "2026-03-12", "2026-03-13");
    expect(r.availableForStay).toBe(1);
    expect(r.blockingCount).toBe(0);
  });

  it("INQUIRY und CANCELLED blockieren nicht", () => {
    const r = availabilityForStay(
      [res("INQUIRY", "2026-03-10", "2026-03-12"), res("CANCELLED", "2026-03-10", "2026-03-12")],
      RT,
      1,
      "2026-03-10",
      "2026-03-12",
    );
    expect(r.availableForStay).toBe(1);
    expect(r.blockingCount).toBe(0);
  });

  it("Minimum über Nächte: Engpass bestimmt availableForStay", () => {
    const r = availabilityForStay(
      [
        res("CONFIRMED", "2026-03-10", "2026-03-11"),
        res("CONFIRMED", "2026-03-10", "2026-03-11"),
        res("CONFIRMED", "2026-03-11", "2026-03-12"),
      ],
      RT,
      2,
      "2026-03-10",
      "2026-03-12",
    );
    expect(r.perNight["2026-03-10"]).toBe(0);
    expect(r.perNight["2026-03-11"]).toBe(1);
    expect(r.availableForStay).toBe(0);
  });

  it("Andere Zimmertypen zählen nicht", () => {
    const r = availabilityForStay([res("CONFIRMED", "2026-03-10", "2026-03-12", "rt2")], RT, 2, "2026-03-10", "2026-03-12");
    expect(r.availableForStay).toBe(2);
  });
});

describe("occupancyByDay", () => {
  it("zählt Belegung je Tag", () => {
    const occ = occupancyByDay(
      [res("CONFIRMED", "2026-03-10", "2026-03-12"), res("CHECKED_IN", "2026-03-11", "2026-03-13")],
      RT,
      "2026-03-10",
      "2026-03-13",
    );
    expect(occ["2026-03-10"]).toBe(1);
    expect(occ["2026-03-11"]).toBe(2);
    expect(occ["2026-03-12"]).toBe(1);
  });
});

describe("isBlocking", () => {
  it("OFFERED blockiert, INQUIRY nicht", () => {
    expect(isBlocking("OFFERED")).toBe(true);
    expect(isBlocking("CONFIRMED")).toBe(true);
    expect(isBlocking("INQUIRY")).toBe(false);
    expect(isBlocking("NO_SHOW")).toBe(false);
  });
});
