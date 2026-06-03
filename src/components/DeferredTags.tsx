"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect } from "react";

// Third-party tags (GA4, GTM → FB/TikTok/AppLovin/Hyros, Clarity, TrustedForm) load
// right after hydration, for EVERY visitor — the way Meta/Hyros expect (PageView on
// load, not gated/deferred). This is the best-practice default for attribution
// completeness. The right way to make the tag stack LIGHTER on low-end devices is
// SERVER-SIDE tagging (Facebook CAPI / server-side GTM) — that removes the client JS
// weight without trading away PageView timing. Client-side deferral only trades
// attribution for speed, so we don't do it here.
export default function DeferredTags({ ga4, gtm, clarity }: { ga4?: string; gtm?: string; clarity?: string }) {
  useEffect(() => {
    const w = window as any;
    if (w.__cmaTags) return; // guard against React double-mount re-injecting tags
    w.__cmaTags = true;

    function inject(src: string) {
      const s = document.createElement("script");
      s.async = true; s.src = src;
      document.head.appendChild(s);
    }

    if (ga4) {
      w.dataLayer = w.dataLayer || [];
      w.gtag = w.gtag || function () { w.dataLayer.push(arguments); };
      inject("https://www.googletagmanager.com/gtag/js?id=" + ga4);
      w.gtag("js", new Date());
      w.gtag("config", ga4, { experiment_variant: w.cmaVariant });
    }
    // TrustedForm (compliance cert).
    inject("https://api.trustedform.com/trustedform.js?field=xxTrustedFormCertUrl&ping_field=xxTrustedFormPingUrl&l=" + new Date().getTime() + Math.random());

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
  }, [ga4, gtm, clarity]);

  return null;
}
