# Compensation Estimate — Data Sources & Methodology

**Purpose:** document the data behind the illustrative case-value estimate shown in the
funnel (`src/lib/estimate.ts`), so the model is defensible if questioned by a lawyer,
buyer, or regulator. The estimate is **illustrative, not a guarantee** (stated in the UI).

**Last updated:** 2026-06-02

---

## Primary sources

| # | Source | Figure used | Notes |
|---|--------|-------------|-------|
| 1 | **Insurance Information Institute (III)** — Facts + Statistics: Auto Insurance | **Avg bodily-injury liability claim = $24,211 (2022)**; property-damage $5,313; collision $5,992; comprehensive $2,738 | Industry average of *paid* auto claims. This is the central anchor for an injured claimant. https://www.iii.org/fact-statistic/facts-statistics-auto-insurance |
| 2 | **Insurance Information Institute / Triple-I blog** | Avg bodily-injury claim **≈ $26,501 (2023)** | Confirms the upward trend; we anchor on the more conservative 2022 figure. https://www.iii.org/insuranceindustryblog/despite-fewer-claims-personal-auto-insurance-payouts-increase/ |
| 3 | **U.S. DOJ, Bureau of Justice Statistics** — Civil Bench and Jury Trials in State Courts | **Median motor-vehicle tort award = $15,000** (≈ $17,000 in the 75 largest counties) | Government data; motor-vehicle torts = 35% of civil trials. Our low/typical band brackets this. https://bjs.ojp.gov/content/pub/pdf/cbjtsc05.pdf |
| 4 | **Insurance Research Council (IRC)** | Attorney-represented auto-injury claims settle **~3.5× higher**; ~85% of BI payouts go to represented claimants | Supports the value of connecting claimants with an attorney (not used to inflate the dollar estimate). https://insurance-research.org/ |
| 5 | **NHTSA, 2023 traffic-safety data** | Motorcyclists ~**5× more likely to be injured** (and more severely) per VMT; large-truck crashes inflict disproportionately severe injuries on the *other* vehicle's occupants (80,000 lb vs 4,000 lb) | Justifies the **modest** upward adjustment for motorcycle / truck / pedestrian / bicycle types. https://crashstats.nhtsa.dot.gov/ |

---

## Model (what the funnel shows)

Conservative **potential range** by accident type for an **injured, not-at-fault** claimant.
The III average injury claim (~$24,211) sits **inside** the car range — we do **not** lead with
catastrophic outliers (spinal/TBI/wrongful-death cases reach six–seven figures but are rare and
explicitly excluded from our headline numbers).

Each range spans **minor injury (low) → serious-but-not-catastrophic injury (high)**.
The III average ($24,211) and BJS median ($15,000) sit in the **lower portion** of the
range; the high end represents a serious injury case (documented serious MVA settlements
reach the $75k–$100k band), and stays **well below** catastrophic outliers (spinal/TBI,
$250k–$1M+) which we deliberately do not show.

| Accident type | Range shown | Basis |
|---|---|---|
| Car | $8,000 – $85,000 | low=minor; high=serious injury. III avg BI $24,211 + BJS median $15,000 sit in lower-range |
| Motorcycle | $11,000 – $92,000 | NHTSA: ~5× injury likelihood + greater severity |
| Truck (commercial) | $13,000 – $98,000 | Severe injuries to passenger-vehicle occupants; higher commercial coverage (FMCSA $750k minimum); still below catastrophic verdicts |
| Pedestrian | $11,000 – $92,000 | High injury severity when struck |
| Bicycle | $9,000 – $80,000 | Elevated severity vs. an enclosed vehicle |
| At work / other | $8,000 – $72,000 | Baseline (workers'-comp systems differ) |
| **No injury** | $500 – $5,000 | Property-damage / diminished-value (III PD $5,313, collision $5,992) |

**Adjustments (applied for the honest reveal estimate):**
- **Fault (comparative negligence):** not-at-fault ×1.0 · unsure ×0.7 · at-fault ×0.35. Recovery is reduced by the claimant's share of fault.
- **Recency:** accident >1 year old ×0.7 (statute-of-limitations risk).
- **Insured at-fault party:** ×1.05 (minor; collectability).

**During the funnel** a teaser counter climbs toward the type's best-case potential (engagement);
**the reveal page** shows the honest, answer-adjusted range with the disclaimer.

## Guardrails
- Always labeled **illustrative / estimate / not a guarantee**; "actual case values vary widely."
- Numbers are conservative and bracket published averages/medians — not aspirational ceilings.
- The aggressive "upper-potential" model is preserved in `src/lib/estimate.ts` (`BASE_HIGH`) and runs as a conversion experiment — see below.

---

## Aggressive variant (`/car-accident`)

The **root URL (`/`) serves the compliant LIGHT model above** — this is the compliance baseline.
A separate **conversion experiment** runs at **`/car-accident`** using the higher `BASE_HIGH`
profile (`valueModel()` switches on the pathname). It leads with the *upper* potential of each
case type to test conversion lift, and is **defensible-ish but not the compliance baseline** —
its ceilings trace to real data, but it leads with rare high-end cases rather than the typical case.

Mitigations on the aggressive variant:
- A **tasteful standing disclaimer** renders directly in the funnel (`.fnl-disclaimer`): *"Estimated
  ranges are illustrative — based on reported settlement and verdict data, not a prediction, promise,
  or guarantee of any specific outcome. Every case is unique and actual compensation varies widely."*
- **Truck ceiling reigned in (2026-06-02):** the trucking high was lowered from **$750,000**
  (the FMCSA federal policy *minimum* — a real figure, but an unrepresentative headline) to
  **$280,000**, a believable serious-but-non-catastrophic commercial-crash value. The honest
  answer-adjustments still apply, so a fully-qualified truck profile tops out near ~$280k–$308k
  rather than three-quarters of a million.

| Aggressive type | Range (`BASE_HIGH`) |
|---|---|
| Car | $15,000 – $120,000 |
| Motorcycle | $25,000 – $250,000 |
| Truck (commercial) | $30,000 – $280,000 *(was $50k–$750k)* |
| Pedestrian | $30,000 – $300,000 |
| Bicycle | $20,000 – $180,000 |
| At work / other | $10,000 – $100,000 |
