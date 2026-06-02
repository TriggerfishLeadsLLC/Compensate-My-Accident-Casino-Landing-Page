// ─────────────────────────────────────────────────────────────────────────────
// MVA case-value model. TWO profiles, switchable by URL for A/B comparison:
//   • default (LIGHT)  — grounded & conservative, compliance-defensible.
//   • ?model=high (HIGH) — the original aggressive "upper-potential" model.
//
// LIGHT figures are anchored to published data (full citations:
// cma/docs/compensation-model-sources.md):
//   • Insurance Information Institute (III) 2022 — avg bodily-injury claim
//       $24,211; property-damage $5,313; collision $5,992. (2023 BI ≈ $26,501.)
//   • Bureau of Justice Statistics — median motor-vehicle tort award $15,000.
//   • Insurance Research Council — attorney-represented claims settle ~3.5× higher.
//   • NHTSA 2023 — motorcyclists ~5× more likely injured/severe per mile; large
//       trucks inflict far worse injuries on the other vehicle (per-type basis).
// LIGHT is deliberately conservative (III average ~$24k sits INSIDE the car range;
// no catastrophic outliers). Output is ILLUSTRATIVE, never a guarantee (UI disclaimer).
// ─────────────────────────────────────────────────────────────────────────────

import type { Answers } from "./funnel";

// Conservative, data-grounded ranges (injured, not-at-fault). DEFAULT.
const BASE_LIGHT: Record<string, { low: number; high: number }> = {
  car_accident:        { low: 8000,  high: 85000 }, // low=minor; high=serious (not catastrophic). III avg $24,211 + BJS median $15k sit in-range
  motorcycle_accident: { low: 11000, high: 92000 }, // NHTSA: ~5x more likely injured + more severe
  trucking_accident:   { low: 13000, high: 98000 }, // severe injuries to passenger-vehicle occupants
  pedestrian_accident: { low: 11000, high: 92000 },
  bicycle_accident:    { low: 9000,  high: 80000 },
  work_accident:       { low: 8000,  high: 72000 },
};
const DEFAULT_LIGHT = { low: 8000, high: 72000 };

// Aggressive "upper-potential" model (pre-grounding). Reach it with ?model=high.
const BASE_HIGH: Record<string, { low: number; high: number }> = {
  car_accident:        { low: 15000, high: 120000 },
  motorcycle_accident: { low: 25000, high: 250000 },
  trucking_accident:   { low: 30000, high: 280000 }, // reigned from the $750k FMCSA policy-minimum to a believable serious-case high
  pedestrian_accident: { low: 30000, high: 300000 },
  bicycle_accident:    { low: 20000, high: 180000 },
  work_accident:       { low: 10000, high: 100000 },
};
const DEFAULT_HIGH = { low: 12000, high: 90000 };

// Which profile to use (client-side): the /car-accident route is the aggressive
// HIGH model; everything else is the compliant LIGHT model. ?model=high also
// forces HIGH anywhere (handy for previews).
export function valueModel(): "high" | "light" {
  if (typeof window === "undefined") return "light";
  try {
    if ((window.location.pathname || "").includes("car-accident")) return "high";
    return new URLSearchParams(window.location.search).get("model") === "high" ? "high" : "light";
  } catch { return "light"; }
}

export function estimateRange(a: Answers): { low: number; high: number } {
  const high = valueModel() === "high";
  const base = (high ? BASE_HIGH : BASE_LIGHT)[a.serviceType ?? ""] ?? (high ? DEFAULT_HIGH : DEFAULT_LIGHT);
  // No injury → property-damage / diminished-value territory (III PD $5,313).
  if (a.injury === "no") return high ? { low: 1500, high: 8000 } : { low: 500, high: 5000 };

  // Comparative negligence: recovery reduced by claimant's share of fault.
  const fault = a.fault === "no" ? 1 : a.fault === "not_sure" ? 0.7 : a.fault === "yes" ? 0.35 : 0.85;
  // Statute-of-limitations risk lowers an aging claim's practical value.
  const recency = a.accidentHappen === "over_1_year" ? (high ? 0.65 : 0.7) : 1;
  const insured = a.insured === "yes" ? (high ? 1.1 : 1.05) : 1;
  const step = high ? 1000 : 500;

  return {
    low: roundTo(base.low * fault * recency, step),
    high: roundTo(base.high * fault * recency * insured, step),
  };
}

// Progressive teaser used DURING the funnel: climbs toward the type's best-case
// potential as the profile fills in. MONOTONIC (ignores value-reducing answers)
// so the counter only ever goes up. Honest answer-adjusted range shown at reveal.
export function teaserValue(a: Answers, stepIndex: number, totalSteps: number): number {
  const baseHigh = a.serviceType
    ? estimateRange({ serviceType: a.serviceType, injury: "yes", fault: "no", insured: a.insured }).high
    : (valueModel() === "high" ? DEFAULT_HIGH : DEFAULT_LIGHT).high;
  const frac = Math.min(1, 0.5 + 0.5 * (stepIndex / Math.max(1, totalSteps - 1)));
  return roundTo(baseHigh * frac, 1000);
}

function roundTo(n: number, step: number) {
  return Math.round(n / step) * step;
}

export function fmtUSD(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}
