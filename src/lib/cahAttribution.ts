// Reads + persists attribution params for the caraccidenthelp.net A/B split test.
//
// When a visitor lands on this Vercel app via the cah-split-tester WordPress
// plugin (Router.php 302s with attribution query params on cross-origin
// external-URL variants), the URL carries:
//
//   ?cah_test_id=<int>&cah_variant_id=<int>&cah_visitor_id=<uuid>
//
// We can't share the plugin's `cah_variant_<test_id>` cookie because it lives
// on the caraccidenthelp.net domain and won't reach compensatemyaccident.com.
// Instead we capture the URL params on first paint, persist to sessionStorage,
// and thread the IDs through every subsequent /api/lead, /api/lead/finalize,
// and /api/form-funnel POST so the plugin attributes activity to the right
// test + variant + visitor.
//
// sessionStorage scope is correct here: a visitor's split-test assignment is
// sticky for the duration of the session, not across browser sessions. If
// they come back later via a fresh trigger-path hit, the plugin re-assigns
// (or hits the cookie on caraccidenthelp.net) and re-issues attribution
// params on the next 302. Until then, the session-scoped cache is enough.

export interface CahAttribution {
  testId: number;
  variantId: number;
  visitorId: string;
}

const STORAGE_KEY = "cah_attribution";

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Reads attribution from (in order): URL params, then sessionStorage. URL
 * params win because a fresh 302 from the plugin always re-stamps them, and
 * we want re-assignment to override a stale cached value if the plugin
 * rebalanced weights mid-session.
 *
 * Returns null when there's no attribution at all (e.g., visitor reached
 * compensatemyaccident.com directly, not via the plugin's trigger path). The
 * /api/lead route then sends the lead with null test_id/variant_id/visitor_id
 * and the plugin records it under source=path_c_cma_vercel with no test bucket
 * — still ends up in the leads table, just not attributed to the A/B test.
 */
export function readCahAttribution(): CahAttribution | null {
  if (typeof window === "undefined") return null;

  const url = new URLSearchParams(window.location.search);
  const tParam = url.get("cah_test_id");
  const vParam = url.get("cah_variant_id");
  const visParam = url.get("cah_visitor_id");

  if (tParam !== null && vParam !== null && visParam !== null) {
    const attr: CahAttribution = {
      testId: Number(tParam),
      variantId: Number(vParam),
      visitorId: visParam,
    };
    if (Number.isFinite(attr.testId) && attr.testId > 0
      && Number.isFinite(attr.variantId) && attr.variantId > 0
      && isValidUuid(attr.visitorId)) {
      try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attr)); } catch {}
      return attr;
    }
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CahAttribution;
    if (!Number.isFinite(parsed?.testId) || !Number.isFinite(parsed?.variantId) || !isValidUuid(parsed?.visitorId ?? "")) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
