import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface Body {
  test_id?: number | null;
  variant_id?: number | null;
  visitor_id?: string | null;
  path?: string;
  landing_url?: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  clickid?: string;
}

const PLUGIN_BASE_RAW = (process.env.CAH_PLUGIN_BASE_URL || "https://caraccidenthelp.net/wp-json/cah-split/v1").trim();
const PLUGIN_BASE = PLUGIN_BASE_RAW.replace(/\/+$/, "");
const LOG_ONLY_MODE = process.env.CAH_LOG_ONLY === "1";

// Server-side proxy from CMA's client to the plugin's /pageview endpoint.
// Mirrors what v1.html's tracking.js (assets/tracking.js trackPageview())
// does on caraccidenthelp.net — same payload shape: test_id, variant_id,
// visitor_id (required), plus path/landing_url/referrer + UTMs (optional).
// Plugin's handlePageview() rejects with 400 if any of the three identifiers
// are missing; short-circuit here on missing attribution so we don't waste
// a round-trip when a visitor reached compensatemyaccident.com directly.
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  if (typeof body.test_id !== "number" || body.test_id <= 0
    || typeof body.variant_id !== "number" || body.variant_id <= 0
    || typeof body.visitor_id !== "string" || body.visitor_id === "") {
    return NextResponse.json({ ok: true, skipped: "no_attribution" });
  }

  const pluginBody = {
    test_id: body.test_id,
    variant_id: body.variant_id,
    visitor_id: body.visitor_id,
    page_source: "landing",
    path: body.path ?? "",
    landing_url: body.landing_url ?? "",
    referrer: body.referrer ?? "",
    utm_source: body.utm_source ?? "",
    utm_medium: body.utm_medium ?? "",
    utm_campaign: body.utm_campaign ?? "",
    utm_term: body.utm_term ?? "",
    utm_content: body.utm_content ?? "",
    clickid: body.clickid ?? "",
  };

  if (LOG_ONLY_MODE) {
    console.log(`[pageview] LOG_ONLY_MODE — plugin POST skipped. test_id=${body.test_id} variant_id=${body.variant_id} path=${body.path}`);
    return NextResponse.json({ ok: true, logOnly: true });
  }

  try {
    const r = await fetch(`${PLUGIN_BASE}/pageview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pluginBody),
    });
    if (!r.ok) {
      console.error(`[pageview] plugin returned ${r.status}`);
      return NextResponse.json({ ok: false, status: r.status }, { status: 502 });
    }
  } catch (e) {
    console.error("[pageview] plugin POST failed:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
