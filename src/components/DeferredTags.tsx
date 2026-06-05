"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect } from "react";

// Third-party tags (GA4, GTM → FB/TikTok/AppLovin/Hyros, Clarity, TrustedForm) load
// ~2s after first paint — right after the on-load intro animation (count-up + coin
// burst) finishes — so the heavy tag JS never competes with that first impression.
//
// Deliberate, bounded tradeoff: PageView fires ~2s later than fire-on-load, but the
// Lead conversion (the money event) fires at submit — many seconds in, long after the
// tags are up — so it's unaffected. The only thing missed is a PageView from a sub-2s
// bounce (negligible). The full no-tradeoff path to an even lighter client is
// server-side tagging (Stape / Facebook CAPI), which keeps the pixel + dedupes events.
const TAG_DELAY_MS = 2000;

export default function DeferredTags({ ga4, gtm, clarity }: { ga4?: string; gtm?: string; clarity?: string }) {
  useEffect(() => {
    const w = window as any;

    function inject(src: string) {
      const s = document.createElement("script");
      s.async = true; s.src = src;
      document.head.appendChild(s);
    }
    function loadAll() {
      if (w.__cmaTags) return; // guard against double-injection
      w.__cmaTags = true;

      if (ga4) {
        w.dataLayer = w.dataLayer || [];
        w.gtag = w.gtag || function () { w.dataLayer.push(arguments); };
        inject("https://www.googletagmanager.com/gtag/js?id=" + ga4);
        w.gtag("js", new Date());
        w.gtag("config", ga4, { experiment_variant: w.cmaVariant });
      }
      inject("https://api.trustedform.com/trustedform.js?field=xxTrustedFormCertUrl&ping_field=xxTrustedFormPingUrl&l=" + new Date().getTime() + Math.random());
      // Fraud Blocker (sid mirrors v1.html / caraccidenthelp.net so all three
      // split-test variants feed the same FB account). Same 2s deferred slot
      // as the other third-party tags — a sub-2s bounce misses fraud
      // detection but real visitors (and bots that bother to interact past
      // first paint) are covered.
      inject("https://monitor.fraudblocker.com/fbt.js?sid=MRebIcZLSYP466uvLIA1V");
      if (gtm) {
        w.dataLayer = w.dataLayer || [];
        w.dataLayer.push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
        inject("https://www.googletagmanager.com/gtm.js?id=" + gtm);
      }
      if (clarity) {
        w.clarity = w.clarity || function () { (w.clarity.q = w.clarity.q || []).push(arguments); };
        inject("https://www.clarity.ms/tag/" + clarity);
        w.clarity("set", "variant", w.cmaVariant);
      }
    }

    const t = window.setTimeout(loadAll, TAG_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [ga4, gtm, clarity]);

  return null;
}
