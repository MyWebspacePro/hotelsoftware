import { describe, expect, it } from "vitest";
import { COUNTRY_DEFAULTS } from "@hg/shared";

describe("Workspace-Import", () => {
  it("@hg/shared liefert die DACH-Referenzkonfiguration", () => {
    expect(COUNTRY_DEFAULTS.DE.vatRates).toHaveLength(3);
    expect(COUNTRY_DEFAULTS.AT.vatRates).toHaveLength(3);
    expect(COUNTRY_DEFAULTS.CH.currency).toBe("CHF");
  });
});
