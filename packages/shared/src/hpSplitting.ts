import { roundHalfUp } from "./money.js";

/**
 * HP-/Pauschal-Splitting: Aufteilung eines Arrangement-Preises auf
 * Steuer-Kategorien (Logis vs. Verpflegung vs. Sonstiges).
 * DE: dokumentationspflichtig (EuGH-Aufteilungsgebot), CH: Pflichtsplitting
 * (Satzgefälle 3,8 % vs. 8,1 %), AT: seit 10 %/10 % satzneutral, trotzdem geführt.
 */
export interface HpProfile {
  logisPct: number;
  foodPct: number;
  otherPct: number;
}

export interface HpSplit {
  logisCents: number;
  foodCents: number;
  otherCents: number;
}

export function splitHp(totalCents: number, profile: HpProfile): HpSplit {
  const sum = profile.logisPct + profile.foodPct + profile.otherPct;
  if (sum <= 0) {
    return { logisCents: totalCents, foodCents: 0, otherCents: 0 };
  }
  const logisCents = roundHalfUp((totalCents * profile.logisPct) / sum);
  const foodCents = roundHalfUp((totalCents * profile.foodPct) / sum);
  let otherCents = roundHalfUp((totalCents * profile.otherPct) / sum);
  // Rundungsrest dem größten Anteil zuordnen, damit die Summe exakt stimmt
  const distributed = logisCents + foodCents + otherCents;
  const remainder = totalCents - distributed;
  if (remainder !== 0) {
    const largest = Math.max(logisCents, foodCents, otherCents);
    if (largest === logisCents) {
      return { logisCents: logisCents + remainder, foodCents, otherCents };
    }
    if (largest === foodCents) {
      return { logisCents, foodCents: foodCents + remainder, otherCents };
    }
    otherCents += remainder;
  }
  return { logisCents, foodCents, otherCents };
}
