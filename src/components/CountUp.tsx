"use client";

import { useEffect, useRef, useState } from "react";
import { fmtUSD } from "@/lib/estimate";

// Slot-machine-style count-up. Animates from the last shown value to the new
// one with an ease-out, so the case-value number visibly "rolls up".
export default function CountUp({ value, duration = 750 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(value);
  const ref = useRef(value);

  useEffect(() => {
    const from = ref.current;
    const to = value;
    if (from === to) return;
    let raf = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(from + (to - from) * eased);
      ref.current = v;
      setDisplay(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{fmtUSD(display)}</>;
}
