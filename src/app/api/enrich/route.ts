import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Reverse-phone → email enrichment. Proxies to the same Cloudflare Worker
// v1.html / v2.html use (https://trestle-lookup.pablo-df9.workers.dev), so
// all three split-test variants share one Trestle API key (stored as a
// Cloudflare Worker secret, not exposed here). Worker handles auth, rate
// limiting, and the response shape (`{ success: true, data: { email } }`).
//
// Override the worker URL via TRESTLE_LOOKUP_URL env var if you ever need to
// hit a different proxy (staging Trestle account, mock server, etc).
const TRESTLE_LOOKUP_URL = (process.env.TRESTLE_LOOKUP_URL ?? "https://trestle-lookup.pablo-df9.workers.dev").trim();

interface WorkerResponse {
  success?: boolean;
  data?: { email?: string };
}

export async function POST(req: Request) {
  let phone = "";
  try {
    phone = String(((await req.json()) as { phone?: string }).phone ?? "");
  } catch {
    return NextResponse.json({ email: null });
  }
  const d = phone.replace(/\D/g, "").slice(-10);
  if (d.length !== 10) return NextResponse.json({ email: null });

  // Mirror v1.html's gfTrestleLookup() short-circuit for the test phone
  // (555) 555-5555 — return no email so the funnel falls through to the
  // email subphase and QA can keep walking the form.
  if (d === "5555555555") return NextResponse.json({ email: null, testPhone: true });

  try {
    const r = await fetch(TRESTLE_LOOKUP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: d }),
    });
    if (!r.ok) return NextResponse.json({ email: null });
    const data = (await r.json()) as WorkerResponse;
    if (data?.success && data.data?.email) {
      return NextResponse.json({ email: data.data.email });
    }
    return NextResponse.json({ email: null });
  } catch {
    return NextResponse.json({ email: null });
  }
}
