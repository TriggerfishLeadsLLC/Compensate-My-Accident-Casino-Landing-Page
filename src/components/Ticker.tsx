"use client";

import { useEffect, useState } from "react";
import { valueModel } from "@/lib/estimate";

// Live-FOMO ticker: "Someone in {place} just checked: $X".
// Amounts mirror what the calculator actually outputs — rounded like the model
// (LIGHT to $500, HIGH to $1,000) and kept inside each model's real min/max — so
// a "checked" number always looks like an estimate a user could really get.
// LIGHT (compliant): ~$48k–$122k. HIGH (aggressive): ~$67k–$295k.
const AMOUNTS_LIGHT = [52500, 68000, 47500, 91500, 61000, 103000, 74500, 84000, 116000, 57500, 97500, 66500, 122000, 78000, 88500, 51000, 109500];
const AMOUNTS_HIGH = [98000, 142000, 84000, 210000, 121000, 268000, 76000, 184000, 295000, 113000, 232000, 67000, 158000, 247000, 92000, 176000];
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
