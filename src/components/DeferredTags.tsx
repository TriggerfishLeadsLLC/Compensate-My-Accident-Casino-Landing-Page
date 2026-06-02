"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect } from "react";

// Loads all third-party tags (GA4, GTM → FB/TikTok/AppLovin/Hyros, Clarity,
// TrustedForm) right after hydration — for EVERY visitor, the way Meta/Hyros
// expect. PageView/attribution fire on load (NOT gated on interaction) so the
// ad algorithm + retargeting + Clarity bounce replays are never missed.
export default function DeferredTags({ ga4, gtm, clarity }: { ga4?: string; gtm?: string; clarity?: string }) {
  useEffect(() => {
    const w = window as any;
    let loaded = false;

    function inject(src: string) {
      const s = document.createElement("script");
      s.async = true; s.src = src;
      document.head.appendChild(s);
    }
    function load() {
      if (loaded || w.__cmaTags) return;
      loaded = true;
      w.__cmaTags = true; // guard against React double-mount re-injecting tags

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
    }

    load();
  }, [ga4, gtm, clarity]);

  return null;
}
