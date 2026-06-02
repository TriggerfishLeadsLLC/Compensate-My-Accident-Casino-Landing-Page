import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Reverse-phone → email enrichment (Trestle). Lets the phone step auto-fill the
// email and submit without an extra field. STUBBED until TRESTLE_API_KEY is set
// by the dev — returns null so the funnel cleanly falls back to asking for email.
export async function POST(req: Request) {
  let phone = "";
  try {
    phone = String(((await req.json()) as { phone?: string }).phone ?? "");
  } catch {
    return NextResponse.json({ email: null });
  }
  const d = phone.replace(/\D/g, "").slice(-10);
  if (d.length !== 10) return NextResponse.json({ email: null });

  const key = process.env.TRESTLE_API_KEY;
  if (!key) return NextResponse.json({ email: null, stub: true });

  try {
    const r = await fetch(`https://api.trestleiq.com/3.2/phone?phone=1${d}`, {
      headers: { "x-api-key": key },
    });
    if (!r.ok) return NextResponse.json({ email: null });
    const data = (await r.json()) as { emails?: string[]; owners?: { emails?: string[] }[] };
    const email = data?.emails?.[0] || data?.owners?.[0]?.emails?.[0] || null;
    return NextResponse.json({ email });
  } catch {
    return NextResponse.json({ email: null });
  }
}
