"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

// Fires scroll_depth at 25/50/75/100% (once each). GA4 Enhanced Measurement
// also tracks a 90% scroll, but these milestones give finer drop-off data and
// are segmented by experiment variant like every other event.
export default function ScrollDepth() {
  useEffect(() => {
    const fired = new Set<number>();
    const onScroll = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 0) return;
      const pct = (el.scrollTop / max) * 100;
      for (const m of [25, 50, 75, 100]) {
        if (pct >= m && !fired.has(m)) {
          fired.add(m);
          track("scroll_depth", { percent: m });
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return null;
}
