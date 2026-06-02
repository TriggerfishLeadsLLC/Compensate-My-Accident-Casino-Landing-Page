"use client";

import { useEffect, useState } from "react";
import { valueModel } from "@/lib/estimate";

// Live-FOMO ticker: "Someone in {place} just checked: $X".
// LIGHT (compliant): grounded amounts, capped at $104,500, mostly $40–65k with a
// few 80s/90s/100s. HIGH (aggressive): larger amounts to match the high model.
const AMOUNTS_LIGHT = [48700, 56200, 41900, 63500, 52800, 89400, 47300, 61200, 97500, 44100, 58900, 104500, 66400, 83200, 51500, 72800, 93600];
const AMOUNTS_HIGH = [96400, 127000, 84200, 152000, 73800, 118500, 210000, 98700, 142000, 64500, 176000];
const CITIES = ["Miami", "Dallas", "Phoenix", "Atlanta", "Chicago", "Newark", "Tampa", "Houston"];

export default function Ticker({ stateName }: { stateName?: string }) {
  const [i, setI] = useState(0);
  const [high, setHigh] = useState(false);
  useEffect(() => { setHigh(valueModel() === "high"); }, []);
  useEffect(() => {
    const id = setInterval(() => setI((n) => n + 1), 3600);
    return () => clearInterval(id);
  }, []);
  const amounts = high ? AMOUNTS_HIGH : AMOUNTS_LIGHT;
  const place = stateName || CITIES[i % CITIES.length];
  const amt = amounts[i % amounts.length];
  return (
    <div className="ticker" key={i} aria-live="polite">
      <span className="ticker-dot" />
      <span>Someone in {place} just checked: <b>${amt.toLocaleString()}</b></span>
    </div>
  );
}
