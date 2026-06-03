"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect } from "react";

// Third-party tags (GA4, GTM → FB/TikTok/AppLovin/Hyros, Clarity, TrustedForm).
//
// PERF: these are ~430KB+ of JS. Injecting them the instant React hydrated meant
// they parsed/executed during first paint — the cause of the first-load jank,
// worst on low-end Android. We now inject on the FIRST idle slot OR the first user
// interaction (whichever comes first), so the critical first paint is clean.
//
// Nothing is lost: every visitor is still tagged (the idle fallback fires within
// ~3s even with zero interaction), and any funnel events fired earlier queue in the
// inline-seeded gtag/dataLayer stub (see layout.tsx) and replay when the scripts
// load — so PageView and the Lead conversion (which fires at submit, long after the
// tags are up) are never missed.
export default function DeferredTags({ ga4, gtm, clarity }: { ga4?: string; gtm?: string; clarity?: string }) {
  useEffect(() => {
    const w = window as any;

    function inject(src: string) {
      const s = document.createElement("script");
      s.async = true; s.src = src;
      document.head.appendChild(s);
    }
    function load() {
      if (w.__cmaTags) return;
      w.__cmaTags = true; // guard against double-injection

      if (ga4) {
        w.dataLayer = w.dataLayer || [];
        w.gtag = w.gtag || function () { w.dataLayer.push(arguments); };
        inject("https://www.googletagmanager.com/gtag/js?id=" + ga4);
        w.gtag("js", new Date());
        w.gtag("config", ga4, { experiment_variant: w.cmaVariant });
      }
      // TrustedForm (compliance cert) — only needed by submit, much later.
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
    }

    // Fire on the first idle slot OR first user interaction, whichever comes first.
    const EVENTS = ["pointerdown", "touchstart", "keydown", "scroll", "mousemove"];
    let idleId: number | undefined;
    let toId: number | undefined;
    const fire = () => {
      EVENTS.forEach((e) => window.removeEventListener(e, fire));
      if (idleId !== undefined && w.cancelIdleCallback) w.cancelIdleCallback(idleId);
      if (toId !== undefined) window.clearTimeout(toId);
      load();
    };
    EVENTS.forEach((e) => window.addEventListener(e, fire, { passive: true }));
    if (w.requestIdleCallback) idleId = w.requestIdleCallback(fire, { timeout: 3000 });
    else toId = window.setTimeout(fire, 2200); // iOS Safari (no requestIdleCallback)

    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, fire));
      if (idleId !== undefined && w.cancelIdleCallback) w.cancelIdleCallback(idleId);
      if (toId !== undefined) window.clearTimeout(toId);
    };
  }, [ga4, gtm, clarity]);

  return null;
}
