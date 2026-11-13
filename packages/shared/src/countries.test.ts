import { describe, expect, it } from "vitest";
import { COUNTRY_DEFAULTS, countryDefaults } from "./countries.js";

describe("COUNTRY_DEFAULTS", () => {
  it("DE: Logis 7 %, Speisen 7 %, Sonstiges 19 %", () => {
    const rates = Object.fromEntries(COUNTRY_DEFAULTS.DE.vatRates.map((r) => [r.key, r.rate]));
    expect(rates.DE_LOGIS_7).toBe(0.07);
    expect(rates.DE_SPEISEN_7).toBe(0.07);
    expect(rates.DE_STD_19).toBe(0.19);
  });

  it("AT: Logis/Speisen 10 %, Sonstiges 20 %", () => {
    const rates = Object.fromEntries(COUNTRY_DEFAULTS.AT.vatRates.map((r) => [r.key, r.rate]));
    expect(rates.AT_LOGIS_10).toBe(0.1);
    expect(rates.AT_STD_20).toBe(0.2);
  });

  it("CH: 3,8 % / 8,1 % / 2,6 % mit CHF + OTHER vorhanden", () => {
    expect(COUNTRY_DEFAULTS.CH.currency).toBe("CHF");
    const rates = Object.fromEntries(COUNTRY_DEFAULTS.CH.vatRates.map((r) => [r.key, r.rate]));
    expect(rates.CH_LOGIS_38).toBe(0.038);
    expect(rates.CH_GASTRO_81).toBe(0.081);
    expect(rates.CH_TAKEAWAY_26).toBe(0.026);
    expect(COUNTRY_DEFAULTS.CH.vatRates.some((r) => r.category === "OTHER")).toBe(true);
  });

  it("jede Rate hat einen eindeutigen Key pro Land", () => {
    for (const cfg of Object.values(COUNTRY_DEFAULTS)) {
      const keys = cfg.vatRates.map((r) => r.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("countryDefaults liefert eine mutierbare Kopie", () => {
    const cfg = countryDefaults("CH");
    cfg.vatRates[0].rate = 0.5;
    expect(COUNTRY_DEFAULTS.CH.vatRates[0].rate).toBe(0.038);
  });
});