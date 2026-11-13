import { describe, expect, it } from "vitest";
import { formatMoney, roundHalfUp, roundMoney, roundMoneyCents, toMinorUnits } from "./money.js";

describe("roundHalfUp", () => {
  it("rundet kaufmännisch auf 2 Stellen", () => {
    expect(roundHalfUp(2.675)).toBe(2.68);
    expect(roundHalfUp(1.005)).toBe(1.01);
    expect(roundHalfUp(-2.675)).toBe(-2.68);
    expect(roundHalfUp(1.004)).toBe(1.0);
  });

  it("keine negative Null", () => {
    expect(Object.is(roundHalfUp(-0.0001), -0)).toBe(false);
  });
});

describe("roundMoney", () => {
  it("EUR: 2 Dezimalstellen", () => {
    expect(roundMoney(12.345, "EUR")).toBe(12.35);
    expect(roundMoney(12.344, "EUR")).toBe(12.34);
  });

  it("CHF: 0.05-Raster inkl. Grenzwerten", () => {
    expect(roundMoney(1.23, "CHF")).toBe(1.25);
    expect(roundMoney(1.22, "CHF")).toBe(1.2);
    expect(roundMoney(1.02, "CHF")).toBe(1.0);
    expect(roundMoney(1.225, "CHF")).toBe(1.25);
    expect(roundMoney(-1.23, "CHF")).toBe(-1.25);
    expect(Object.is(roundMoney(-0.01, "CHF"), -0)).toBe(false);
  });
});

describe("roundMoneyCents", () => {
  it("EUR bleibt Ganzcent, CHF auf 5er", () => {
    expect(roundMoneyCents(1234, "EUR")).toBe(1234);
    expect(roundMoneyCents(1233, "CHF")).toBe(1235);
    expect(roundMoneyCents(1232, "CHF")).toBe(1230);
    expect(roundMoneyCents(-1233, "CHF")).toBe(-1235);
  });
});

describe("toMinorUnits", () => {
  it("liefert Minor-Units inkl. Rundung", () => {
    expect(toMinorUnits(19.999, "EUR")).toBe(2000);
    expect(toMinorUnits(3.33, "CHF")).toBe(335);
  });
});

describe("formatMoney", () => {
  it("formatiert EUR de-DE", () => {
    expect(formatMoney(1234.5, "EUR")).toContain("1.234,50");
  });
});