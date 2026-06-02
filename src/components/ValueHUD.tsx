"use client";

import { fmtUSD } from "@/lib/estimate";

// Presentational HUD. The counter (#cma-value) is driven by the funnel's
// count-up. `gain` (reduce-motion) shows the "+$X" in place; `note` (V2) shows a
// teaser prompt before any answer.
export default function ValueHUD({
  value, range, progress, stepCurrent, stepTotal, urgency, note, gain,
}: {
  value: number;
  range: { low: number; high: number } | null;
  progress: number;
  stepCurrent: number;
  stepTotal: number;
  urgency?: string | null;
  note?: string | null;
  gain?: string | null;
}) {
  const hasValue = value > 0;
  return (
    <div className="hud">
      <div className="hud-glow" aria-hidden="true" />
      <div className="hud-row">
        <span className="hud-label">Estimated case value</span>
        <span className="hud-badge"><span className="pulse" />Live</span>
      </div>
      <div className="hud-valrow">
        {hasValue && <span className="hud-uoto">up to</span>}
        <span className="hud-value" id="cma-value">{hasValue ? fmtUSD(value) : "$0"}</span>
      </div>
      <div className="hud-range">
        {gain
          ? <span className="hud-gain">{gain}</span>
          : note
            ? note
            : hasValue && range
              ? `Potential range: ${fmtUSD(range.low)} – ${fmtUSD(range.high)}`
              : "Tap below to start calculating your estimate"}
      </div>
      {urgency && <div className="hud-urgency">{urgency}</div>}
      <div className="hud-prog"><span style={{ width: `${progress}%` }} /></div>
      <div className="hud-step">Step {stepCurrent} of {stepTotal}</div>
    </div>
  );
}
