import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface Body {
  event_type?: "form_view" | "step_completed" | "form_abandon";
  step_number?: number;
  step_name?: string;
  test_id?: number | null;
  variant_id?: number | null;
  visitor_id?: string | null;
}

const PLUGIN_BASE_RAW = (process.env.CAH_PLUGIN_BASE_URL || "https://caraccidenthelp.net/wp-json/cah-split/v1").trim();
const PLUGIN_BASE = PLUGIN_BASE_RAW.replace(/\/+$/, "");
const LOG_ONLY_MODE = process.env.CAH_LOG_ONLY === "1";

const ALLOWED_EVENTS = new Set(["form_view", "step_completed", "form_abandon"]);

// Lightweight proxy from the client-side cahFormFunnel helper to the plugin's
// /form-funnel REST endpoint. The plugin's handler validates step_name +
// step_number against the hardcoded FormFunnelStepCatalog and rejects any
// mismatch with HTTP 400; the client helper already maps CMA's step keys to
// the catalog's expected slugs, so a well-formed body here should always pass
// the plugin's validation.
//
// Cheap to run, fire-and-forget — no body returned beyond {ok}.
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  if (!body.event_type || !ALLOWED_EVENTS.has(body.event_type)) {
    return NextResponse.json({ ok: false, error: "invalid_event_type" }, { status: 422 });
  }
  if (typeof body.step_number !== "number" || body.step_number < 1) {
    return NextResponse.json({ ok: false, error: "invalid_step_number" }, { status: 422 });
  }
  if (!body.step_name) {
    return NextResponse.json({ ok: false, error: "missing_step_name" }, { status: 422 });
  }
  // Missing attribution means the visitor reached compensatemyaccident.com
  // without going through the plugin's trigger path (direct traffic, ad
  // click that bypassed the split-test router, etc). Plugin would reject
  // with HTTP 400 anyway; short-circuit here so we don't waste a round-trip.
  if (typeof body.test_id !== "number" || body.test_id <= 0) {
    return NextResponse.json({ ok: true, skipped: "no_attribution" });
  }

  const pluginBody = {
    test_id: body.test_id,
    variant_id: body.variant_id,
    visitor_id: body.visitor_id,
    event_type: body.event_type,
    step_number: body.step_number,
    step_name: body.step_name,
  };

  if (LOG_ONLY_MODE) {
    console.log(`[form-funnel] LOG_ONLY_MODE — plugin POST skipped. ${body.event_type} step ${body.step_number} (${body.step_name})`);
    return NextResponse.json({ ok: true, logOnly: true });
  }

  try {
    const r = await fetch(`${PLUGIN_BASE}/form-funnel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pluginBody),
    });
    if (!r.ok) {
      console.error(`[form-funnel] plugin returned ${r.status}`);
      return NextResponse.json({ ok: false, status: r.status }, { status: 502 });
    }
  } catch (e) {
    console.error("[form-funnel] plugin POST failed:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
