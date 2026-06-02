import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Bonus "describe your accident" update. The lead is ALREADY captured at the
// phone step; this UPSERTs the description when it arrives (matches the existing
// LeadByte/Make multi-post lifecycle). Empty → "Description Not Available".
export async function POST(req: Request) {
  let body: { eventId?: string; describe?: string };
  try {
    body = (await req.json()) as { eventId?: string; describe?: string };
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const describe = (body.describe ?? "").trim() || "Description Not Available";
  const payload = { event_id: body.eventId ?? "", event_type: "lead_finalize", describe };

  const webhook = process.env.LEAD_WEBHOOK_URL;
  if (webhook) {
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {}
  } else {
    console.log("[lead/finalize] (webhook unset) " + JSON.stringify(payload));
  }
  return NextResponse.json({ ok: true });
}
