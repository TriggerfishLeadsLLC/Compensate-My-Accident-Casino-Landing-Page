import { NextResponse } from "next/server";
import { buildMakePayload } from "@/lib/leadPayload";
import { classify, type Answers } from "@/lib/funnel";

export const runtime = "nodejs";

interface Attribution {
  testId?: number | null;
  variantId?: number | null;
  visitorId?: string | null;
}

interface Body {
  answers?: Answers;
  utms?: Record<string, string>;
  trustedFormCert?: string;
  attribution?: Attribution;
  landingUrl?: string;
}

// Plugin REST base URL on caraccidenthelp.net. The plugin handles the actual
// Make.com forwarding (with its retry / idempotency / deferred-finalize
// machinery), so all three split-test variants converge on one persistence
// path. Override via env var if testing against a staging WordPress install.
const PLUGIN_BASE = (process.env.CAH_PLUGIN_BASE_URL ?? "https://caraccidenthelp.net/wp-json/cah-split/v1").replace(/\/+$/, "");

// Source slug whitelisted in plugin RestApi::ALLOWED_SOURCES — see
// includes/RestApi.php in the cah-split-tester plugin. Match exactly.
const LEAD_SOURCE = "path_c_cma_vercel";

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ success: false, error: "bad_json" }, { status: 400 });
  }

  const answers = body.answers ?? {};
  if (!answers.email || !answers.phone) {
    return NextResponse.json({ success: false, error: "missing_contact" }, { status: 422 });
  }

  const result = classify(answers);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const eventId = crypto.randomUUID().replace(/-/g, "");

  const payload = buildMakePayload(answers, {
    utms: body.utms,
    ip,
    userAgent: req.headers.get("user-agent") ?? "",
    trustedFormCert: body.trustedFormCert,
    eventId,
  });

  // Forward to the plugin's /lead endpoint with `defer_make: true`. The plugin
  // saves the row with make_status='deferred' and returns its internal lead_id,
  // which the client threads into the follow-up /api/lead/finalize POST. The
  // plugin's finalize handler flips deferred → pending and dispatches to
  // Make.com with the updated describe text. Same two-phase pattern v1.html
  // uses (gfFireBackgroundSubmit + gfFinalizeLead), so all three variants
  // exercise the same retry + cron-fallback machinery.
  const attr = body.attribution ?? {};
  const pluginBody = {
    test_id: typeof attr.testId === "number" && attr.testId > 0 ? attr.testId : null,
    variant_id: typeof attr.variantId === "number" && attr.variantId > 0 ? attr.variantId : null,
    visitor_id: typeof attr.visitorId === "string" && attr.visitorId.length > 0 ? attr.visitorId : null,
    source: LEAD_SOURCE,
    landing_url: body.landingUrl ?? req.headers.get("referer") ?? "",
    make_payload: payload,
    defer_make: true,
  };

  let delivered = false;
  let leadId: number | null = null;

  try {
    const r = await fetch(`${PLUGIN_BASE}/lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pluginBody),
    });
    if (r.ok) {
      delivered = true;
      try {
        const j = (await r.json()) as { lead_id?: number };
        if (typeof j.lead_id === "number") leadId = j.lead_id;
      } catch {
        // body parse failure is non-fatal — lead was persisted, we just don't
        // have an id to thread into finalize. Plugin's 6-min cron fallback
        // will catch the deferred row and dispatch to Make even without a
        // /api/lead/finalize follow-up.
      }
    } else {
      console.error(`[lead] plugin returned ${r.status}`);
    }
  } catch (e) {
    console.error("[lead] plugin POST failed:", e);
  }

  return NextResponse.json({
    success: true,
    qualified: result.qualified,
    stage: result.stage,
    redirect: result.redirect,
    delivered,
    eventId,
    leadId,
  });
}
