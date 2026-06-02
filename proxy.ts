// Edge A/B assignment (replaces PostHog feature flags — free, flicker-free).
// Assigns a sticky `cma_variant` cookie on first visit and exposes it to the
// render via a request header so the server renders the right variant with no
// client flicker. Rollout % is env-controlled; later this can read Vercel Edge
// Config so the split can change with no redeploy.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const VARIANT_COOKIE = "cma_variant";
const ROLLOUT = Number((process.env.NEXT_PUBLIC_AB_ROLLOUT ?? "50").replace(/[^\x20-\x7E]/g, "").trim() || "50"); // % to optimized

export function proxy(request: NextRequest) {
  const existing = request.cookies.get(VARIANT_COOKIE)?.value;
  // ?v=v2 / ?v=v1 force a variant (for previewing/QA); otherwise sticky cookie or split.
  const forced = request.nextUrl.searchParams.get("v");
  const variant =
    forced === "v2" ? "optimized"
    : forced === "v1" ? "control"
    : existing ?? (Math.random() * 100 < ROLLOUT ? "optimized" : "control");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-cma-variant", variant);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  if (!existing || forced) {
    res.cookies.set(VARIANT_COOKIE, variant, {
      path: "/",
      maxAge: 60 * 60 * 24 * 180, // 180 days
      sameSite: "lax",
    });
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
