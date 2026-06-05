// Client-side helper for posting funnel events (form_view, step_completed,
// form_abandon) to the cah-split-tester plugin via our /api/form-funnel
// route. Mirrors v1.html's gfTrackWpFunnel() behaviour.
//
// Step name + step number mapping is determined by the plugin's hardcoded
// FormFunnelStepCatalog (includes/FormFunnelStepCatalog.php), which enforces
// step_name === slugForStep(step_number) — any mismatch returns HTTP 400.
// CMA's funnel asks questions in a different ORDER than v1.html, but the
// underlying field SEMANTICS match, so we report by semantic slot.
//
// Limitations to be aware of (flag in tracking doc):
//   - Looker's "% completed step N" math assumes step ordering; since CMA
//     users complete step 4 (injury) before step 2 (attorney), cross-step
//     ratio dashboards will look off for the CMA variant until the plugin
//     catalog is made variant-aware.
//   - Raw count-per-step totals are accurate; only the denominator
//     computation between steps is misleading.

import { readCahAttribution } from "./cahAttribution";

export type FunnelEventType = "form_view" | "step_completed" | "form_abandon";

interface CatalogSlot {
  step: number;
  slug: string;
}

// CMA step key (from src/lib/funnel.ts STEPS array, plus describe phase) →
// v1.html FormFunnelStepCatalog slot. Keys not present here aren't reported.
export const CMA_STEP_TO_CATALOG: Record<string, CatalogSlot> = {
  serviceType:    { step: 1,  slug: "service_type" },
  attorney:       { step: 2,  slug: "attorney" },
  fault:          { step: 3,  slug: "fault" },
  injury:         { step: 4,  slug: "injury" },
  accidentHappen: { step: 5,  slug: "timeframe" },
  stateText:      { step: 6,  slug: "state" },
  zipcode:        { step: 7,  slug: "zipcode" },
  insured:        { step: 8,  slug: "insured" },
  name:           { step: 9,  slug: "name" },
  phone:          { step: 10, slug: "phone" },
  email:          { step: 11, slug: "email" },
  describe:       { step: 12, slug: "describe" },
};

interface ServerPayload {
  event_type: FunnelEventType;
  step_number: number;
  step_name: string;
}

// Returns the catalog slot for a CMA step key, or null if unknown. Unknown
// keys are silently no-op'd — better than dropping a 400 from the plugin.
export function catalogSlotForStepKey(cmaKey: string): CatalogSlot | null {
  return CMA_STEP_TO_CATALOG[cmaKey] ?? null;
}

// Internal: send the funnel event to our Next.js API route, which forwards
// to the plugin. Uses sendBeacon for form_abandon (page is unloading) and
// keepalive fetch otherwise. Idempotent at the call-site is the caller's
// responsibility — this helper just posts whatever it's handed.
function sendToServer(payload: ServerPayload, attribution: { testId: number; variantId: number; visitorId: string } | null, useBeacon: boolean): void {
  if (typeof window === "undefined") return;
  if (!attribution) return; // Visitor reached the page without plugin attribution — funnel events go nowhere meaningful.

  const body = JSON.stringify({
    event_type: payload.event_type,
    step_number: payload.step_number,
    step_name: payload.step_name,
    test_id: attribution.testId,
    variant_id: attribution.variantId,
    visitor_id: attribution.visitorId,
  });

  try {
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon("/api/form-funnel", new Blob([body], { type: "application/json" }));
      return;
    }
    fetch("/api/form-funnel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

// Public: fire a step_completed event for a CMA step key. Maps to catalog
// slot internally. No-op if the key isn't in the catalog map.
export function trackStepCompleted(cmaKey: string): void {
  const slot = catalogSlotForStepKey(cmaKey);
  if (!slot) return;
  sendToServer(
    { event_type: "step_completed", step_number: slot.step, step_name: slot.slug },
    readCahAttribution(),
    false,
  );
}

// Public: fire a form_view event. v1.html fires this once per page load.
// Used as the denominator for the "step 1 completion %" in Looker.
export function trackFormView(): void {
  sendToServer(
    { event_type: "form_view", step_number: 1, step_name: "service_type" },
    readCahAttribution(),
    false,
  );
}

// Public: fire a form_abandon event for the user's last-visible step.
// Called from pagehide / visibilitychange:hidden listeners. Uses sendBeacon
// because the page is unloading. v1.html's behavior: report the step the
// visitor was ON when they left.
export function trackFormAbandon(currentCmaStepKey: string): void {
  const slot = catalogSlotForStepKey(currentCmaStepKey);
  if (!slot) return;
  sendToServer(
    { event_type: "form_abandon", step_number: slot.step, step_name: slot.slug },
    readCahAttribution(),
    true,
  );
}

// Public: fire a landing-pageview ping to the plugin's /pageview endpoint
// via our /api/pageview proxy. Mirrors what v1.html's tracking.js fires on
// caraccidenthelp.net so the plugin's cah_pageviews table sees a landing
// row for variant 3 — without this, the per-variant "Landing pageviews"
// column stays at 0 and the "Lost in transit" math (trigger_sent minus
// landing_pageviews) reports 100% loss for CMA traffic. Fire-and-forget,
// no-op when attribution is missing.
export function trackPageview(): void {
  if (typeof window === "undefined") return;
  const attribution = readCahAttribution();
  if (!attribution) return;

  const url = new URL(window.location.href);
  const q = url.searchParams;
  const body = JSON.stringify({
    test_id: attribution.testId,
    variant_id: attribution.variantId,
    visitor_id: attribution.visitorId,
    path: url.pathname,
    landing_url: window.location.href,
    referrer: document.referrer || "",
    utm_source: q.get("utm_source") ?? "",
    utm_medium: q.get("utm_medium") ?? "",
    utm_campaign: q.get("utm_campaign") ?? "",
    utm_term: q.get("utm_term") ?? "",
    utm_content: q.get("utm_content") ?? "",
    clickid: q.get("clickid") ?? "",
  });

  try {
    fetch("/api/pageview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {}
}
