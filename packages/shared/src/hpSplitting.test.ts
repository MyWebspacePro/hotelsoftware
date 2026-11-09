import { describe, expect, it } from "vitest";
import { splitHp } from "./hpSplitting.js";

describe("splitHp", () => {
  it("DE-Standard: 60/40 Logis/Verpflegung, Summe exakt", () => {
    const s = splitHp(17400, { logisPct: 60, foodPct: 40, otherPct: 0 });
    expect(s.logisCents).toBe(10440);
    expect(s.foodCents).toBe(6960);
    expect(s.otherCents).toBe(0);
    expect(s.logisCents + s.foodCents + s.otherCents).toBe(17400);
  });

  it("Rundungsrest geht auf den größten Anteil", () => {
    const s = splitHp(100, { logisPct: 1, foodPct: 1, otherPct: 1 });
    expect(s.logisCents + s.foodCents + s.otherCents).toBe(100);
  });

  it("CH-Splitting mit drei Anteilen", () => {
    const s = splitHp(20000, { logisPct: 50, foodPct: 45, otherPct: 5 });
    expect(s.logisCents + s.foodCents + s.otherCents).toBe(20000);
    expect(s.otherCents).toBe(1000);
  });

  it("ohne Profil → alles Logis", () => {
    const s = splitHp(5000, { logisPct: 0, foodPct: 0, otherPct: 0 });
    expect(s.logisCents).toBe(5000);
  });
});
