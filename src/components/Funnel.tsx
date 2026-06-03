"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STEPS, US_STATES, type Answers } from "@/lib/funnel";
import { estimateRange, teaserValue, fmtUSD, valueModel } from "@/lib/estimate";
import { track, trackLead, clarityTag } from "@/lib/analytics";
import { coinBurst, shower, warmUp } from "@/lib/fx";
import AccidentIcon from "@/components/AccidentIcon";
import ValueHUD from "@/components/ValueHUD";
import SocialProof from "@/components/SocialProof";
import Ticker from "@/components/Ticker";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const digits = (s: string) => s.replace(/\D/g, "");
const haptic = (p: number | number[] = 12) => {
  try { (navigator as { vibrate?: (x: number | number[]) => void }).vibrate?.(p); } catch {}
};
const prefersReduced = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function urgencyFor(a: Answers): string | null {
  if (!a.accidentHappen) return null;
  if (a.accidentHappen === "over_1_year") return "⏳ Time limits may apply — don't wait to check your claim.";
  return "✓ Good news: you're likely still within the filing window.";
}

export default function Funnel({ initialState = "", stateName = "", variant = "control" }: { initialState?: string; stateName?: string; variant?: string }) {
  const v2 = variant === "optimized";
  const [i, setI] = useState(0);
  const [ans, setAns] = useState<Answers>({ stateText: initialState || undefined });
  const [tcpa, setTcpa] = useState(false);
  const [tcpaMiss, setTcpaMiss] = useState(false); // consent-missing spotlight (highlight + shake)
  const [contactPhase, setContactPhase] = useState<"phone" | "email" | "describe">("phone");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [shown, setShown] = useState(0);
  const [combat, setCombat] = useState<{ text: string; key: number } | null>(null);
  const [gain, setGain] = useState<string | null>(null); // reduce-motion: in-place "+$X"
  const [shaking, setShaking] = useState(false);
  const shownRef = useRef(0);
  const startedRef = useRef(false);
  const climbRef = useRef(0);
  const gainRef = useRef(0);
  const [describe, setDescribe] = useState("");
  const eventIdRef = useRef("");
  const destRef = useRef("");
  const describeRef = useRef("");
  const finalizedRef = useRef(false);
  const inactivityRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Count the displayed value up to `to`, in place. This is the CORE reward and
  // runs in BOTH motion modes (a counter changing in place is informative, not
  // vestibular motion). Coins/shake are separate flair layered on top.
  const climbTo = useCallback((to: number) => {
    // PERF: drive the count-up by writing the number straight to the DOM each frame
    // and only sync React state ~10x/sec. Calling setShown every frame re-renders the
    // entire Funnel tree (HUD + trust + ticker + step) 60x/sec, which starves the coin
    // rAF and causes the mobile stutter. A textContent write is essentially free.
    const writeDom = (v: number) => { const e = document.getElementById("cma-value"); if (e) e.textContent = fmtUSD(Math.round(v)); };
    if (to <= shownRef.current) { shownRef.current = to; setShown(Math.round(to)); writeDom(to); return; }
    if (climbRef.current) cancelAnimationFrame(climbRef.current);
    const from = shownRef.current, t0 = performance.now(), dur = 750;
    let lastSync = 0;
    const flash = () => {
      const e = document.getElementById("cma-value");
      if (!e) return;
      e.classList.remove("glow", "punch"); void e.offsetWidth;
      e.classList.add("glow");
      if (!prefersReduced()) e.classList.add("punch");
    };
    const stepFn = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const v = from + (to - from) * (1 - Math.pow(1 - k, 3)); // easeOutCubic
      if (v > shownRef.current) { shownRef.current = v; writeDom(v); }
      if (now - lastSync > 100) { lastSync = now; setShown(Math.round(v)); } // throttled React sync (~10x/sec, not 60)
      if (k < 1) climbRef.current = requestAnimationFrame(stepFn);
      else { shownRef.current = to; writeDom(to); setShown(Math.round(to)); flash(); }
    };
    climbRef.current = requestAnimationFrame(stepFn);
    // Fallback: if rAF is throttled (backgrounded tab / janky old device), still
    // land on the target so the value can never get stuck mid-climb.
    window.setTimeout(() => { if (shownRef.current < to) { shownRef.current = to; setShown(Math.round(to)); writeDom(to); } }, dur + 450);
  }, []);

  const steps = useMemo(() => STEPS.filter((s) => !s.showIf || s.showIf(ans)), [ans]);
  const step = steps[Math.min(i, steps.length - 1)];
  const isLast = i >= steps.length - 1;
  const progress = v2 ? Math.min(100, Math.round(18 + ((i + 1) / steps.length) * 82)) : Math.round(((i + 1) / steps.length) * 100);
  const range = useMemo(() => (ans.serviceType ? estimateRange(ans) : null), [ans]);

  // Silent background ZIP from IP (best-effort).
  useEffect(() => {
    let done = false;
    (async () => {
      try {
        const r = await fetch("https://ipapi.co/json/");
        if (!r.ok || done) return;
        const d = (await r.json()) as { postal?: string };
        if (d.postal) setAns((a) => ({ ...a, zipcode: a.zipcode || String(d.postal) }));
      } catch {}
    })();
    return () => { done = true; };
  }, []);

  // Report THIS page's variant (route-driven: / = control, /v2 = optimized) plus
  // the user's reduce-motion preference to analytics, so we can measure its real
  // share + conversion impact for this (older-skewing) audience.
  useEffect(() => {
    const w = window as unknown as { cmaVariant?: string; dataLayer?: unknown[] };
    const rm = prefersReduced();
    w.cmaVariant = variant;
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ experiment_variant: variant, reduced_motion: rm, value_model: valueModel() });
    try { clarityTag("variant", variant); clarityTag("reduced_motion", rm ? "on" : "off"); clarityTag("value_model", valueModel()); } catch {}
  }, [variant]);

  useEffect(() => {
    track("funnel_step_view", { step_number: i + 1, step_key: step?.key, step_total: steps.length });
    clarityTag("funnel_step", String(i + 1));
    if (!startedRef.current) { startedRef.current = true; track("funnel_start"); }
  }, [i, step?.key, steps.length]);

  // V2 only: auto-play the value teaser on load (curiosity hook before any tap).
  // Coins are high-model flair only; the number climbs in both models.
  useEffect(() => {
    if (!v2) return;
    if (valueModel() !== "high") return; // light model: start at $0, no auto-teaser
    // On-load auto-teaser: value count-up + coin burst, but DELAYED ~0.5s so the tracking
    // pixels (which fire on load) get a head start first. Crucially, we PRE-WARM the
    // canvas during the gap (warmUp on an early idle: allocate + upload the sprites), so
    // when the burst fires at +0.5s it lands on a WARM canvas — that (not the timing) is
    // what kills the first-burst jitter. Coins also fire on every tap (already warm).
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    // Pre-warm the FX engine during an early idle gap (before the burst).
    const warmId = w.requestIdleCallback ? w.requestIdleCallback(() => { try { warmUp(); } catch {} }, { timeout: 300 }) : undefined;
    if (warmId === undefined) window.setTimeout(() => { try { warmUp(); } catch {} }, 80); // iOS fallback
    const introTO = window.setTimeout(() => {
      try { warmUp(); } catch {} // idempotent safety if the idle pre-warm hasn't run yet
      climbTo(9000);
      try {
        const el = document.getElementById("cma-value");
        const r = el?.getBoundingClientRect();
        coinBurst({ fromX: window.innerWidth / 2, fromY: window.innerHeight * 0.66, toX: r ? r.left + r.width / 2 : window.innerWidth / 2, toY: r ? r.top + r.height / 2 : 120, count: 12 });
      } catch { /* flair only */ }
    }, 500);
    return () => {
      if (warmId !== undefined && w.cancelIdleCallback) { try { w.cancelIdleCallback(warmId); } catch {} }
      window.clearTimeout(introTO);
    };
  }, [v2]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = useCallback((key: string, value: string) => { setAns((a) => ({ ...a, [key]: value })); setErr(""); }, []);
  const goTo = useCallback((n: number) => { setErr(""); setI(Math.max(0, n)); }, []);

  // On every answer the number always climbs (both models). Coins, shake, combat
  // overlay, and coin shower are HIGH-MODEL flair only — off on the light/compliance
  // model so it's clean and professional for approval.
  function fireReward(ox: number, oy: number, nextAns: Answers, nextIndex: number, big = false) {
    if (!nextAns.serviceType) return;
    const target = teaserValue(nextAns, nextIndex, STEPS.length);
    const start = shownRef.current;
    const delta = Math.max(0, target - start);

    if (valueModel() === "high" && !prefersReduced()) {
      const crossed = (start < 100000 && target >= 100000) || (start < 500000 && target >= 500000);
      if (delta > 0) {
        const ckey = Date.now();
        setCombat({ text: `+${fmtUSD(delta)}`, key: ckey });
        window.setTimeout(() => setCombat((c) => (c && c.key === ckey ? null : c)), 1200);
      }
      if (crossed || big) { setShaking(true); window.setTimeout(() => setShaking(false), 520); }
      if (crossed) shower(true);
      const el = document.getElementById("cma-value");
      const r = el?.getBoundingClientRect();
      const tx = r ? r.left + r.width / 2 : window.innerWidth / 2;
      const ty = r ? r.top + r.height / 2 : 130;
      const count = Math.min(28, Math.max(12, Math.round(Math.max(delta, 14000) / 6000)));
      coinBurst({ fromX: ox, fromY: oy, toX: tx, toY: ty, count, intense: crossed });
    }
    climbTo(target);
  }

  function validate(): string {
    if (!step) return "";
    switch (step.kind) {
      case "state": return ans.stateText ? "" : "Please select your state.";
      case "name": return ans.firstName?.trim() && ans.lastName?.trim() ? "" : "Please enter your first and last name.";
      case "phone":
        if (contactPhase === "email") return EMAIL_RE.test(ans.email ?? "") ? "" : "Enter a valid email address.";
        if (digits(ans.phone ?? "").length !== 10) return "Enter a valid 10-digit phone number.";
        if (!tcpa) return "Please check the box to agree and unlock your estimate.";
        return "";
      default: return "";
    }
  }

  // Sends the lead + fires the qualified-lead conversion, THEN reveals the
  // (optional) describe step. The describe is appended later via finalize() — if
  // the user never fills it, the lead is already captured here in the background.
  async function doSubmit() {
    setBusy(true); setErr("");
    const utms: Record<string, string> = {};
    let trustedFormCert = "";
    try {
      new URLSearchParams(window.location.search).forEach((v, k) => (utms[k] = v));
      const tf = document.querySelector<HTMLInputElement>('[name="xxTrustedFormCertUrl"]');
      if (tf?.value) trustedFormCert = tf.value;
      sessionStorage.setItem("cma_estimate", JSON.stringify(estimateRange(ans)));
    } catch {}
    try {
      const res = await fetch("/api/lead", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: ans, utms, trustedFormCert }), keepalive: true,
      });
      const data = await res.json();
      eventIdRef.current = data.eventId ?? "";
      try { sessionStorage.setItem("cma_eventId", eventIdRef.current); } catch {}
      destRef.current = `${data.redirect}?lead_stage=${data.stage}`;
      setSubmitted(true);
      trackLead(Boolean(data.qualified), { stage: data.stage }); // conversion fires HERE
      setBusy(false);
      setContactPhase("describe"); // reveal the optional "strengthen your case" step
    } catch {
      setErr("Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  // Append the (optional) describe details. Idempotent. Fires on stop-typing, a
  // 5-min cap, page-leave/abandon, or the See-Results button. Lead is already sent.
  function finalize(useBeacon = false) {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    if (inactivityRef.current) clearTimeout(inactivityRef.current);
    const body = JSON.stringify({ eventId: eventIdRef.current, describe: describeRef.current });
    try {
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon("/api/lead/finalize", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/api/lead/finalize", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
      }
    } catch {}
    track("describe_finalized", { hasText: describeRef.current.trim().length > 0 });
  }

  function onDescribe(v: string) {
    setDescribe(v);
    describeRef.current = v;
    if (inactivityRef.current) clearTimeout(inactivityRef.current);
    inactivityRef.current = setTimeout(() => finalize(false), 30000); // ~30s stop-typing → send
  }

  function seeResults() {
    finalize(false);
    setBusy(true);
    window.setTimeout(() => { window.location.href = destRef.current || "/thank-you"; }, 600);
  }

  // Describe phase: finalize on abandon (page leave/hide) or a hard 5-min cap.
  useEffect(() => {
    if (contactPhase !== "describe") return;
    const onHide = () => { if (document.visibilityState === "hidden") finalize(true); };
    const onLeave = () => finalize(true);
    const cap = window.setTimeout(() => finalize(false), 5 * 60 * 1000);
    window.addEventListener("pagehide", onLeave);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.clearTimeout(cap);
      window.removeEventListener("pagehide", onLeave);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [contactPhase]); // eslint-disable-line react-hooks/exhaustive-deps

  function onCard(value: string, e: React.MouseEvent) {
    const ox = e?.clientX ?? window.innerWidth / 2;
    const oy = e?.clientY ?? window.innerHeight / 2;
    const nextAns = { ...ans, [step.key]: value };
    setAns(nextAns); setErr(""); haptic([6, 16, 8]);
    track("funnel_step_complete", { step_number: i + 1, step_key: step.key, value });
    fireReward(ox, oy, nextAns, i + 1, step.key === "serviceType" || step.key === "injury");
    window.setTimeout(() => goTo(i + 1), 300);
  }

  async function onContinue(e?: React.MouseEvent) {
    const er = validate();
    if (er) {
      setErr(er);
      // Consent missing (phone is valid but the box isn't checked) → spotlight the
      // checkbox: highlight + shake + error haptic + scroll into view, so an older
      // user clearly sees exactly what's blocking them.
      if (step.kind === "phone" && contactPhase === "phone" && !tcpa && digits(ans.phone ?? "").length === 10) {
        setTcpaMiss(true);
        haptic([0, 45, 55, 45]);
        try { document.getElementById("tcpa")?.scrollIntoView({ block: "center", behavior: "smooth" }); } catch {}
        window.setTimeout(() => setTcpaMiss(false), 1500);
      } else {
        haptic(40);
      }
      return;
    }
    track("funnel_step_complete", { step_number: i + 1, step_key: step.key, phase: contactPhase });
    haptic(10);
    const ox = e?.clientX ?? window.innerWidth / 2;
    const oy = e?.clientY ?? window.innerHeight * 0.7;

    if (step.kind === "phone" && contactPhase === "phone") {
      setBusy(true);
      try {
        const r = await fetch("/api/enrich", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: ans.phone }) });
        const d = await r.json();
        setBusy(false);
        if (d?.email) { setAns((a) => ({ ...a, email: d.email })); await doSubmit(); return; }
      } catch { setBusy(false); }
      setContactPhase("email");
      return;
    }
    if (isLast) { await doSubmit(); return; }
    fireReward(ox, oy, ans, i + 1);
    goTo(i + 1);
  }

  if (!step) return null;
  const selected = ans[step.key as keyof Answers];
  const ctaLabel = busy
    ? "Calculating your estimate…"
    : step.kind === "phone"
      ? (contactPhase === "phone" ? "Unlock My Full Estimate →" : "See My Estimate →")
      : isLast ? "See My Results →" : "Next";

  return (
    <div className={`fnl${shaking ? " shake" : ""}`}>
      <ValueHUD value={shown} range={range} progress={progress} stepCurrent={i + 1} stepTotal={steps.length} urgency={urgencyFor(ans)} gain={gain} note={v2 && !ans.serviceType ? "Your estimate builds with each answer 👇" : undefined} />
      {combat && <div className="combat" key={combat.key}>{combat.text}</div>}
      {i === 0 && <SocialProof stateName={stateName} showLiveCount={!v2} />}
      {v2 && <Ticker stateName={stateName} />}

      <div className="fnl-step" key={`${step.key}-${contactPhase}`}>
        <h2 className="fnl-h">{contactPhase === "describe" ? "🎉 You're all set!" : contactPhase === "email" && step.kind === "phone" ? "Last step — where should we send it?" : step.heading}</h2>
        {step.sub && contactPhase === "phone" && <p className="fnl-sub">{step.sub}</p>}

        {step.kind === "cards" && step.options && (
          <div className={`fnl-grid${step.options.length <= 3 ? " one" : ""}`}>
            {step.options.map((o, idx) => (
              <button key={o.value} type="button" style={{ ["--d" as string]: `${idx * 45}ms` } as React.CSSProperties}
                className={`fnl-btn${selected === o.value ? " sel" : ""}${o.emphasis ? " emph" : ""}${v2 && step.key === "serviceType" ? " cue" : ""}`}
                onClick={(e) => onCard(o.value, e)}>
                {o.icon && <span className="ico"><AccidentIcon name={o.icon} /></span>}
                <span className="lbl">
                  <span className="lbl-main">{o.label}</span>
                  {o.hint && <span className="hint">{o.hint}</span>}
                </span>
              </button>
            ))}
          </div>
        )}

        {step.kind === "state" && (
          <div className="fnl-field">
            <select className="fnl-select" name="address-level1" autoComplete="address-level1" value={ans.stateText ?? ""} onChange={(e) => set("stateText", e.target.value)}>
              <option value="">Select your state…</option>
              {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        {step.kind === "name" && (
          <div className="fnl-field">
            <div className="fnl-row">
              <input className="fnl-input" id="cma-firstName" name="given-name" autoComplete="given-name" autoCapitalize="words" enterKeyHint="next"
                placeholder="First name" value={ans.firstName ?? ""} onChange={(e) => set("firstName", e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("cma-lastName")?.focus(); } }} />
              <input className="fnl-input" id="cma-lastName" name="family-name" autoComplete="family-name" autoCapitalize="words" enterKeyHint="done"
                placeholder="Last name" value={ans.lastName ?? ""} onChange={(e) => set("lastName", e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onContinue(); } }} />
            </div>
          </div>
        )}

        {step.kind === "phone" && contactPhase === "phone" && (
          <div className="fnl-field">
            <input className="fnl-input" type="tel" inputMode="tel" name="tel" autoComplete="tel" enterKeyHint="go" placeholder="(555) 555-5555"
              value={ans.phone ?? ""} onChange={(e) => set("phone", e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onContinue(); } }} />
            <div className={`fnl-tcpa${tcpaMiss ? " miss" : ""}`}>
              <input id="tcpa" type="checkbox" checked={tcpa} onChange={(e) => { setTcpa(e.target.checked); setErr(""); setTcpaMiss(false); }} />
              <label htmlFor="tcpa">
                By clicking &quot;Unlock My Full Estimate&quot;, you agree that the phone number you are providing
                may be used to contact you by one of <a href="https://caraccidenthelp.net/sponsors/" target="_blank" rel="noopener noreferrer">our partners</a> (including
                with auto-dialed and prerecorded calls, and text messages) about your accident and potential legal
                help. Msg. and data rates apply. You agree that we may contact you anytime, including before 8am or
                after 9pm local time. You agree to the use of electronic signatures, our <a href="https://caraccidenthelp.net/privacy-policy/" target="_blank" rel="noopener noreferrer">Privacy Policy</a>, and <a href="https://caraccidenthelp.net/terms/" target="_blank" rel="noopener noreferrer">Terms of Use</a>.
              </label>
            </div>
            <p className="fnl-secure">🔒 Your information is secure and never sold to spammers.</p>
          </div>
        )}

        {step.kind === "phone" && contactPhase === "email" && (
          <div className="fnl-field">
            <input className="fnl-input" type="email" inputMode="email" name="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="go" placeholder="you@email.com"
              value={ans.email ?? ""} onChange={(e) => set("email", e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onContinue(); } }} />
          </div>
        )}

        {step.kind === "phone" && contactPhase === "describe" && (
          <div className="fnl-field">
            <p className="fnl-describe-intro">A top-rated attorney will call you shortly. Add anything that helps your case below — or just tap continue.</p>
            <label className="fnl-describe-label" htmlFor="desc">Details to strengthen your case <span>(optional)</span></label>
            <textarea id="desc" className="fnl-textarea" rows={4} placeholder="What happened? Any injuries or treatment so far?"
              value={describe} onChange={(e) => onDescribe(e.target.value)} />
            <button className="fnl-cta" onClick={seeResults} disabled={busy}>{busy ? "Loading your results…" : "See My Results →"}</button>
          </div>
        )}

        {step.kind !== "cards" && contactPhase !== "describe" && (
          <>
            <button className="fnl-cta" onClick={(e) => onContinue(e)} disabled={busy}>{ctaLabel}</button>
            {err && <div className="fnl-err">{err}</div>}
          </>
        )}

        {i > 0 && !busy && contactPhase !== "describe" && (
          <div style={{ textAlign: "center" }}>
            <button className="fnl-back" onClick={() => (contactPhase === "email" ? setContactPhase("phone") : goTo(i - 1))} type="button">← Back</button>
          </div>
        )}
      </div>
      <p className="fnl-disclaimer">
        This is an estimate of your potential case value — shown as an &quot;up to&quot; figure with a range,
        based on reported settlement and verdict data. It is not legal advice, and not a prediction, promise,
        or guarantee of any specific outcome, settlement, or payment. Every case is unique and actual
        compensation varies widely.
      </p>
    </div>
  );
}
