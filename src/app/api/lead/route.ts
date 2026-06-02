import { NextResponse } from "next/server";
import { buildMakePayload } from "@/lib/leadPayload";
import { classify, type Answers } from "@/lib/funnel";

export const runtime = "nodejs";

interface Body {
  answers?: Answers;
  utms?: Record<string, string>;
  trustedFormCert?: string;
}

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

  // DEVELOPER-OWNED delivery. When LEAD_WEBHOOK_URL is set (Make.com webhook),
  // the lead is forwarded identically to the existing funnel. Until then we log
  // the exact payload so the shape can be verified WITHOUT touching live routing.
  const webhook = process.env.LEAD_WEBHOOK_URL;
  let delivered = false;
  if (webhook) {
    try {
      const r = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      delivered = r.ok;
    } catch {
      delivered = false;
    }
  } else {
    console.log("[lead] LEAD_WEBHOOK_URL unset — not delivered. Payload:\n" + JSON.stringify(payload, null, 2));
  }

  return NextResponse.json({
    success: true,
    qualified: result.qualified,
    stage: result.stage,
    redirect: result.redirect,
    delivered,
    eventId,
  });
}
