"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STEPS, US_STATES, type Answers } from "@/lib/funnel";
import { estimateRange, teaserValue, fmtUSD, valueModel } from "@/lib/estimate";
import { track, trackLead, clarityTag } from "@/lib/analytics";
import { readCahAttribution, type CahAttribution } from "@/lib/cahAttribution";
import { trackFormView, trackStepCompleted, trackFormAbandon } from "@/lib/cahFormFunnel";
import { coinBurst, shower, warmUp } from "@/lib/fx";
import AccidentIcon from "@/components/AccidentIcon";
import ValueHUD from "@/components/ValueHUD";
import SocialProof from "@/components/SocialProof";
import Ticker from "@/components/Ticker";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const digits = (s: string) => s.replace(/\D/g, "");
// US phone, tolerant of autofill/keyboards that prepend the "1" country code:
// returns the 10-digit local number (strips a leading 1 from an 11-digit input).
const localPhone = (s: string) => { const d = digits(s); return d.length === 11 && d.startsWith("1") ? d.slice(1) : d; };
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
  // Cached at /api/lead time, replayed verbatim in /api/lead/finalize so the
  // plugin can rebuild a complete make_payload with the user's final describe
  // text. attributionRef is also kept around so the finalize POST goes to the
  // same plugin test/variant/visitor row as the original lead.
  const attributionRef = useRef<CahAttribution | null>(null);
  const leadIdRef = useRef<number | null>(null);
  const utmsRef = useRef<Record<string, string>>({});
  const trustedFormCertRef = useRef("");

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

  // Silent background ZIP + state from IP (best-effort). State is normally
  // supplied by Vercel edge headers (x-vercel-ip-country-region → initialState
  // prop) but those don't exist in local dev and can be intermittently absent
  // through some proxies. ipapi.co's region field (full state name like
  // "Texas") gives us a reliable second source — mirrors v1.html's behavior.
  // Both fields use ` || ` so user input and existing initialState always win.
  //
  // CMA has NO visible zipcode step (zip is silently auto-filled, then sent
  // with the lead). For the plugin's form funnel we still want a step 7
  // (zipcode) completion event so the catalog's per-step counts make sense
  // — fire trackStepCompleted("zipcode") here when ipapi populates the zip.
  // Mirrors v1.html's gfTrackAutoCompletedStep(7) for the same scenario.
  useEffect(() => {
    let done = false;
    (async () => {
      try {
        const r = await fetch("https://ipapi.co/json/");
        if (!r.ok || done) return;
        const d = (await r.json()) as { postal?: string; region?: string; country_code?: string };
        let zipApplied = false;
        setAns((a) => {
          const next = { ...a };
          if (d.postal && !a.zipcode) {
            next.zipcode = String(d.postal);
            zipApplied = true;
          }
          if (d.region && !a.stateText && (d.country_code ?? "US").toUpperCase() === "US") {
            next.stateText = String(d.region);
          }
          return next;
        });
        if (zipApplied) trackStepCompleted("zipcode");
      } catch {}
    })();
    return () => { done = true; };
  }, []);

  // Plugin form-funnel form_abandon. Fires on page unload (pagehide) OR
  // visibilitychange:hidden, but ONLY before the lead has been submitted
  // (i.e., we're still in the question steps, not the describe phase).
  // After submit, the existing describe useEffect below owns the unload
  // listeners and handles describe finalize via /api/lead/finalize.
  //
  // Reports the visitor's CURRENT step.key as the abandon point. Skips if
  // they never reached step 1 (no startedRef yet), since dispatching an
  // abandon for a never-started form is meaningless.
  useEffect(() => {
    if (submitted) return; // post-submit: describe useEffect owns the listeners
    const onAbandon = () => {
      if (!startedRef.current || submitted) return;
      const key = step?.key ?? "serviceType";
      trackFormAbandon(key);
    };
    const onVisHide = () => { if (document.visibilityState === "hidden") onAbandon(); };
    window.addEventListener("pagehide", onAbandon);
    document.addEventListener("visibilitychange", onVisHide);
    return () => {
      window.removeEventListener("pagehide", onAbandon);
      document.removeEventListener("visibilitychange", onVisHide);
    };
  }, [submitted, step?.key]);

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

  // Capture caraccidenthelp.net split-test attribution from URL params (?cah_test_id
  // / cah_variant_id / cah_visitor_id) on first paint and persist to sessionStorage.
  // The plugin's Router::appendAttributionParams stamps these on every 302 to this
  // page so we know which test bucket the visitor is in. Storing in a ref keeps
  // the value cheap to read at submit time; doing it once on mount makes sure we
  // capture the URL params even if a later client nav clears them.
  useEffect(() => {
    const attr = readCahAttribution();
    if (attr) {
      attributionRef.current = attr;
      try { clarityTag("cah_test_id", String(attr.testId)); clarityTag("cah_variant_id", String(attr.variantId)); } catch {}
    }
  }, []);

  useEffect(() => {
    track("funnel_step_view", { step_number: i + 1, step_key: step?.key, step_total: steps.length });
    clarityTag("funnel_step", String(i + 1));
    if (!startedRef.current) {
      startedRef.current = true;
      track("funnel_start");
      // Mirror v1.html's `gfTrackWpFunnel('form_view', 1)` so the plugin's
      // cah_form_funnel_events table sees a denominator for variant 3's
      // step-completion percentages. Only fires once per page load.
      trackFormView();
    }
  }, [i, step?.key, steps.length]);

  // V2 only: auto-play the value teaser on load (curiosity hook before any tap).
  // Coins are high-model flair only; the number climbs in both models.
  useEffect(() => {
    if (!v2) return;
    if (valueModel() !== "high") return; // light model: start at $0, no auto-teaser
    // On-load auto-teaser (original behavior): the value count-up starts immediately and
    // the coin burst fires right after — the strong hook Kaleb wants on load. Optimized
    // as much as we can without changing that: warmUp() (runs post-paint, since effects
    // fire after paint) allocates the canvas + uploads the sprites up front so the burst
    // isn't cold; the count-up is decoupled from React; DPR is capped. A touch of
    // first-load lag on a weak device is accepted. Coins also fire on every tap.
    try { warmUp(); } catch { /* flair only */ }
    climbTo(9000);
    const ct = window.setTimeout(() => {
      try {
        const el = document.getElementById("cma-value");
        const r = el?.getBoundingClientRect();
        coinBurst({ fromX: window.innerWidth / 2, fromY: window.innerHeight * 0.66, toX: r ? r.left + r.width / 2 : window.innerWidth / 2, toY: r ? r.top + r.height / 2 : 120, count: 14 });
      } catch { /* flair only */ }
    }, 150);
    return () => window.clearTimeout(ct);
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
        if (localPhone(ans.phone ?? "").length !== 10) return "Enter a valid 10-digit phone number.";
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
    // Cache utms + trustedFormCert + attribution so finalize() can rebuild the
    // same make_payload + send to the same plugin row. attributionRef is read
    // from URL params on first paint and persisted in sessionStorage, so it
    // survives a mid-funnel page navigation.
    utmsRef.current = utms;
    trustedFormCertRef.current = trustedFormCert;
    const attribution = readCahAttribution();
    attributionRef.current = attribution;
    try {
      const res = await fetch("/api/lead", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: ans,
          utms,
          trustedFormCert,
          attribution: attribution ? {
            testId: attribution.testId,
            variantId: attribution.variantId,
            visitorId: attribution.visitorId,
          } : null,
          landingUrl: window.location.href,
        }),
        keepalive: true,
      });
      const data = await res.json();
      eventIdRef.current = data.eventId ?? "";
      leadIdRef.current = typeof data.leadId === "number" ? data.leadId : null;
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
  //
  // Threads the full submit context (answers, utms, trustedFormCert, attribution,
  // leadId) so the API route can rebuild the make_payload server-side and POST
  // it to the plugin's /lead/finalize endpoint. The plugin then flips the
  // deferred row to pending and dispatches to Make.com with the user's typed
  // describe text. If leadId is missing (slow /api/lead response), the plugin's
  // 6-minute cron sweep finalizes the deferred row anyway.
  function finalize(useBeacon = false) {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    if (inactivityRef.current) clearTimeout(inactivityRef.current);
    const attr = attributionRef.current;
    const body = JSON.stringify({
      eventId: eventIdRef.current,
      leadId: leadIdRef.current,
      describe: describeRef.current,
      answers: { ...ans, describe: describeRef.current },
      utms: utmsRef.current,
      trustedFormCert: trustedFormCertRef.current,
      attribution: attr ? {
        testId: attr.testId,
        variantId: attr.variantId,
        visitorId: attr.visitorId,
      } : null,
    });
    try {
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon("/api/lead/finalize", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/api/lead/finalize", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
      }
    } catch {}
    track("describe_finalized", { hasText: describeRef.current.trim().length > 0 });
    // Plugin form-funnel: report describe (catalog step 12) as completed so
    // Looker's cumulative funnel sees a step_completed_12 row for variant 3.
    // Matches v1.html's gfFireSubmitTracking() flow where step 12 is the
    // describe completion marker.
    trackStepCompleted("describe");
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
    // Plugin form-funnel mirror — maps CMA's step.key to the v1.html
    // FormFunnelStepCatalog slot so the WP cah_form_funnel_events table sees
    // a step_completed row keyed by canonical slug + step_number.
    trackStepCompleted(step.key);
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
      if (step.kind === "phone" && contactPhase === "phone" && !tcpa && localPhone(ans.phone ?? "").length === 10) {
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
    // Plugin form-funnel mirror. For the dual-phase phone/email step, we map
    // the phone subphase to catalog step 10 (phone) and the email subphase
    // to step 11 (email) — matches v1.html's two-step PII collection so
    // Looker sees a comparable funnel shape across all three variants.
    if (step.kind === "phone") {
      trackStepCompleted(contactPhase === "email" ? "email" : "phone");
    } else {
      trackStepCompleted(step.key);
    }
    haptic(10);
    const ox = e?.clientX ?? window.innerWidth / 2;
    const oy = e?.clientY ?? window.innerHeight * 0.7;

    if (step.kind === "phone" && contactPhase === "phone") {
      setBusy(true);
      try {
        const r = await fetch("/api/enrich", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: localPhone(ans.phone ?? "") }) });
        const d = await r.json();
        setBusy(false);
        if (d?.email) {
          // Trestle returned an email — we skip the email subphase entirely.
          // Mirror v1.html's gfTrackAutoCompletedStep(11) so catalog step 11
          // (email) still shows as completed in Looker for variant 3.
          setAns((a) => ({ ...a, email: d.email }));
          trackStepCompleted("email");
          await doSubmit();
          return;
        }
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
