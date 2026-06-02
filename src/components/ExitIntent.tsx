"use client";

import { useEffect, useState } from "react";
import { fmtUSD } from "@/lib/estimate";
import { track } from "@/lib/analytics";

// Desktop exit-intent recapture: when the cursor leaves toward the top (tab
// switch / close), surface a loss-aversion nudge tied to the estimate they'd
// lose. Fires at most once, only while a real estimate exists and pre-submit.
export default function ExitIntent({ value, active }: { value: number; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!active || shown) return;
    const onLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) {
        setOpen(true);
        setShown(true);
        track("exit_intent_shown", { value });
      }
    };
    document.addEventListener("mouseout", onLeave);
    return () => document.removeEventListener("mouseout", onLeave);
  }, [active, shown, value]);

  if (!open) return null;
  return (
    <div className="exit-overlay" onClick={() => setOpen(false)}>
      <div className="exit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="reveal-badge">Don&apos;t lose your estimate</div>
        <h3>Wait — you&apos;re almost there</h3>
        <p>
          You&apos;re seconds from your <b>{fmtUSD(value)}</b> estimate and a free case review.
          Finish now to lock it in.
        </p>
        <button className="fnl-cta" onClick={() => setOpen(false)}>Finish &amp; see my estimate →</button>
      </div>
    </div>
  );
}
