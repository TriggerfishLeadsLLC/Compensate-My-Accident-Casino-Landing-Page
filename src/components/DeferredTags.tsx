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

// Run ordered steps one-per-idle-slot so the heavy tag scripts (fbevents, TikTok, GTM,
// Clarity) parse/execute in separate frames instead of one main-thread block. Every
// step still runs, in order, within ~one trailing frame — the gaps are idle slots, not
// added delay — so tag behavior (which events fire, and roughly when) is unchanged.
function runStaggered(steps: Array<() => void>) {
  const ric: (cb: () => void) => void =
    typeof (window as any).requestIdleCallback === "function"
      ? (cb) => (window as any).requestIdleCallback(cb, { timeout: 200 })
      : (cb) => window.setTimeout(cb, 0);
  let idx = 0;
  const pump = () => {
    if (idx >= steps.length) return;
    try { steps[idx](); } catch { /* a single tag failing must not block the rest */ }
    idx++;
    if (idx < steps.length) ric(pump);
  };
  ric(pump);
}

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

      const steps: Array<() => void> = [];

      if (ga4) {
        steps.push(() => {
          w.dataLayer = w.dataLayer || [];
          w.gtag = w.gtag || function () { w.dataLayer.push(arguments); };
          inject("https://www.googletagmanager.com/gtag/js?id=" + ga4);
          w.gtag("js", new Date());
          w.gtag("config", ga4, { experiment_variant: w.cmaVariant });
        });
      }
      steps.push(() => {
        inject("https://api.trustedform.com/trustedform.js?field=xxTrustedFormCertUrl&ping_field=xxTrustedFormPingUrl&l=" + new Date().getTime() + Math.random());
      });
      // Fraud Blocker (sid mirrors v1.html / caraccidenthelp.net so all three
      // split-test variants feed the same FB account). Same 2s deferred slot
      // as the other third-party tags — a sub-2s bounce misses fraud
      // detection but real visitors (and bots that bother to interact past
      // first paint) are covered.
      steps.push(() => {
        inject("https://monitor.fraudblocker.com/fbt.js?sid=MRebIcZLSYP466uvLIA1V");
      });
      if (gtm) {
        steps.push(() => {
          w.dataLayer = w.dataLayer || [];
          w.dataLayer.push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
          inject("https://www.googletagmanager.com/gtm.js?id=" + gtm);
        });
      }
      if (clarity) {
        steps.push(() => {
          w.clarity = w.clarity || function () { (w.clarity.q = w.clarity.q || []).push(arguments); };
          inject("https://www.clarity.ms/tag/" + clarity);
          w.clarity("set", "variant", w.cmaVariant);
        });
      }

      runStaggered(steps);
    }

    const t = window.setTimeout(loadAll, TAG_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [ga4, gtm, clarity]);

  return null;
}
