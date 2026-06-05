import { NextResponse } from "next/server";
import { buildMakePayload } from "@/lib/leadPayload";
import type { Answers } from "@/lib/funnel";

export const runtime = "nodejs";

interface Attribution {
  testId?: number | null;
  variantId?: number | null;
  visitorId?: string | null;
}

interface Body {
  eventId?: string;
  leadId?: number | null;
  describe?: string;
  // Full answers + utms + trustedFormCert so we can rebuild the make_payload
  // with the user's just-typed describe text. Threading these from the client
  // keeps the route stateless — the plugin sees the full final payload and
  // dispatches to Make in one shot.
  answers?: Answers;
  utms?: Record<string, string>;
  trustedFormCert?: string;
  attribution?: Attribution;
}

const PLUGIN_BASE_RAW = (process.env.CAH_PLUGIN_BASE_URL || "https://caraccidenthelp.net/wp-json/cah-split/v1").trim();
const PLUGIN_BASE = PLUGIN_BASE_RAW.replace(/\/+$/, "");
const LOG_ONLY_MODE = process.env.CAH_LOG_ONLY === "1";

// Empty describe falls back to a non-empty placeholder so the Make.com webhook
// row always has a value in the describe field. Matches v1.html's
// GF_FALLBACK_DESCRIBE ('No Descriptions Available') so all three variants
// land identical placeholder text in Make when the user skips describe.
const FALLBACK_DESCRIBE = "No Descriptions Available";

// Append the optional "describe your accident" text to the lead. Idempotent:
// the plugin's /lead/finalize endpoint flips a deferred row to pending exactly
// once, so re-entry from the page-leave beacon + the See-Results button + the
// 5-min cap is safe. If leadId is missing (slow /api/lead response that never
// returned an id before the user typed + finalized), we silently skip — the
// plugin's 6-minute cron sweep picks up the deferred row and dispatches to
// Make with whatever describe is in the DB at the time.
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const leadId = typeof body.leadId === "number" && body.leadId > 0 ? body.leadId : null;
  const describe = (body.describe ?? "").trim() || FALLBACK_DESCRIBE;

  // Without a leadId there's no plugin row to update. Acknowledge and let the
  // cron fallback handle it. Logging so we can see how often this happens.
  if (leadId === null) {
    console.warn("[lead/finalize] no leadId — relying on plugin cron fallback");
    return NextResponse.json({ ok: true, deferredToCron: true });
  }

  // Rebuild the full make_payload with the final describe. Same shape as
  // /api/lead — the plugin updates raw_payload alongside the describe column.
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const answersWithDescribe: Answers = { ...(body.answers ?? {}), describe };
  const payload = buildMakePayload(answersWithDescribe, {
    utms: body.utms,
    ip,
    userAgent: req.headers.get("user-agent") ?? "",
    trustedFormCert: body.trustedFormCert,
    eventId: body.eventId ?? "",
  });

  const pluginBody = {
    lead_id: leadId,
    describe,
    make_payload: payload,
    reason: "cma_describe_finalize",
  };

  if (LOG_ONLY_MODE) {
    console.log("[lead/finalize] LOG_ONLY_MODE — plugin POST skipped. Payload would be:\n" + JSON.stringify(pluginBody, null, 2));
    return NextResponse.json({ ok: true, logOnly: true });
  }

  try {
    const r = await fetch(`${PLUGIN_BASE}/lead/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pluginBody),
    });
    if (!r.ok) {
      console.error(`[lead/finalize] plugin returned ${r.status}`);
      return NextResponse.json({ ok: false, status: r.status }, { status: 502 });
    }
  } catch (e) {
    console.error("[lead/finalize] plugin POST failed:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
