"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import { fmtUSD } from "@/lib/estimate";
import CountUp from "@/components/CountUp";
import { shower } from "@/lib/fx";
import SiteFooter from "@/components/SiteFooter";

type Kind = "qualified" | "dv" | "other";

const COPY: Record<Kind, { badge?: string; h1: string; sub: string }> = {
  qualified: {
    badge: "You may pre-qualify",
    h1: "You're all set!",
    sub: "Your accident may be eligible for compensation. Here's what happens now.",
  },
  dv: {
    badge: "You may be owed money",
    h1: "You're all set!",
    sub: "Even without injuries, a crash usually lowers your car's value — a specialist will call you shortly to help you recover it.",
  },
  other: {
    h1: "Thanks — we've got your details.",
    sub: "A specialist will review your information and reach out if we can help.",
  },
};

const LINES = ["Reviewing your answers", "Calculating your estimate", "Matching you with a top-rated attorney"];

export default function ResultReveal({ kind }: { kind: Kind }) {
  const [lit, setLit] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [est, setEst] = useState<{ low: number; high: number } | null>(null);
  const [confetti, setConfetti] = useState<{ left: number; delay: number; dur: number; color: string }[]>([]);
  const [secsLeft, setSecsLeft] = useState(600); // 10:00 "we're holding your spot" countdown

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("cma_estimate");
      if (raw) setEst(JSON.parse(raw));
    } catch {}
    const t1 = setTimeout(() => setLit(1), 650);
    const t2 = setTimeout(() => setLit(2), 1450);
    const t3 = setTimeout(() => setLit(3), 2250);
    const t4 = setTimeout(() => {
      setRevealed(true);
      track("results_viewed", { kind });
      if (kind !== "other") {
        shower(true);
        const colors = ["#1fd17f", "#48f0a6", "#e9c46a", "#5ee27a", "#fff"];
        setConfetti(Array.from({ length: 52 }, (_, n) => ({ left: (n * 37) % 100, delay: (n % 10) * 0.1, dur: 2 + (n % 5) * 0.4, color: colors[n % colors.length] })));
      }
    }, 3000);
    return () => { [t1, t2, t3, t4].forEach(clearTimeout); };
  }, [kind]);

  // "Holding your spot" countdown — starts once the result is revealed (qualified/dv).
  useEffect(() => {
    if (!revealed || kind === "other") return;
    const id = setInterval(() => setSecsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [revealed, kind]);

  const c = COPY[kind];
  const showEstimate = revealed && est && kind !== "other";
  const rich = kind !== "other";
  const timer = `${Math.floor(secsLeft / 60)}:${String(secsLeft % 60).padStart(2, "0")}`;

  return (
    <>
    <main className="reveal">
      {confetti.length > 0 && (
        <div className="confetti" aria-hidden="true">
          {confetti.map((p, n) => <i key={n} style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }} />)}
        </div>
      )}

      {!revealed ? (
        <div className="reveal-steps" role="status" aria-live="polite">
          {LINES.map((line, idx) => (
            <div key={line} className={`reveal-line${idx < lit ? " on" : ""}`}>
              <span className="dot">{idx < lit ? "✓" : ""}</span>
              <span>{line}{idx < lit ? "" : "…"}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="reveal-card">
          {c.badge && <div className="reveal-badge">✓ {c.badge}</div>}

          {rich ? (
            <>
              <h1 className="reveal-pending"><span className="reveal-livedot" aria-hidden="true" />{kind === "dv" ? "Your claim is pending" : "Your compensation is pending"}</h1>
              <p className="reveal-sub">We&apos;re matching you with a top-rated attorney for your case right now.</p>

              <section className="typrog">
                <div className="typrog-top"><b>You&apos;re almost there</b><span>80%</span></div>
                <div className="typrog-bar"><span /></div>
                <div className="typrog-cap">Filling out your details was the hard part — one quick call completes your claim.</div>
              </section>
            </>
          ) : (
            <>
              <h1>{c.h1}</h1>
              <p className="reveal-sub">{c.sub}</p>
            </>
          )}

          {showEstimate && (
            <div className="reveal-est">
              <div className="reveal-est-label">Your case could be worth up to</div>
              <div className="reveal-est-value"><CountUp value={est!.high} duration={1500} /></div>
              <div className="reveal-est-range">Potential range: {fmtUSD(est!.low)} – {fmtUSD(est!.high)}</div>
              <div className="reveal-est-note">An estimate of your potential case value, based on reported settlement data — not a guarantee of any payment or outcome.</div>
            </div>
          )}

          {rich && (
            <>
              <div className="tyhold">
                <span className="tyhold-dot" aria-hidden="true" />
                We&apos;re holding your spot · <b>{timer}</b>
              </div>

              <section className="next">
                <h2 className="next-title">What happens next</h2>
                <ol className="next-steps">
                  <li>
                    <span className="ns-num">1</span>
                    <div className="ns-body"><b>You&apos;re matched</b><span>with a top-rated personal injury attorney for your case.</span></div>
                  </li>
                  <li>
                    <span className="ns-num">2</span>
                    <div className="ns-body"><b>They call you — shortly</b><span>to confirm your details and start turning your estimate into a real claim.</span></div>
                  </li>
                  <li>
                    <span className="ns-num">3</span>
                    <div className="ns-body"><b>They pursue your compensation</b><span>with no upfront cost to you for the legal help.</span></div>
                  </li>
                </ol>
              </section>

              <section className="callout">
                <span className="callout-ico" aria-hidden="true">📞</span>
                <div><b>Answer your phone.</b> Your specialist may call from a local or unfamiliar number — pick up so you don&apos;t lose your spot.</div>
              </section>
            </>
          )}

          <p className="reveal-disclaimer">
            This estimate is illustrative only — an &quot;up to&quot; figure based on the answers you provided and
            reported settlement data. It is not legal advice, and is not a guarantee, promise, or prediction of any
            specific result, settlement, or payment. No outcome is guaranteed and actual case values vary widely.
            You&apos;ll be connected with an independent attorney for a free, no-obligation consultation.
          </p>
        </div>
      )}
    </main>
    <SiteFooter />
    </>
  );
}
