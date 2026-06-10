"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STEPS, US_STATES, type Answers } from "@/lib/funnel";
import { estimateRange, teaserValue, fmtUSD, valueModel } from "@/lib/estimate";
import { track, trackLead, clarityTag } from "@/lib/analytics";
import { readCahAttribution, type CahAttribution } from "@/lib/cahAttribution";
import { trackFormView, trackStepCompleted, trackFormAbandon, trackPageview, catalogSlotForStepKey, CMA_STEP_TO_CATALOG } from "@/lib/cahFormFunnel";
import { pushFormBoot, pushStepCompleted, pushFormSubmit, pushLeadStage, pushFormAbandonment } from "@/lib/cahV1DataLayer";
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

export default function Funnel({ initialState = "", initialZip = "", stateName = "", variant = "control" }: { initialState?: string; initialZip?: string; stateName?: string; variant?: string }) {
  const v2 = variant === "optimized";
  const [i, setI] = useState(0);
  const [ans, setAns] = useState<Answers>({
    stateText: initialState || undefined,
    zipcode: initialZip || undefined,
  });
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
  // Fire-once guard for form_abandon. pagehide AND visibilitychange:hidden
  // both fire on a real tab close (browser behavior), so without this guard
  // we'd POST two abandon events for one user. Once set, stays set for the
  // session — if the user comes back, advances further, then abandons again,
  // we don't double-count (first abandon already captured the fact they
  // didn't complete; second one would just inflate the abandonment column).
  const abandonedRef = useRef(false);

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

  // Silent background ZIP + state. Three sources of truth, in order:
  //   1. Vercel edge headers via initialState / initialZip props (most reliable
  //      — set per-request on every Vercel deploy by the platform). These win
  //      on mount via useState initialization above.
  //   2. ipapi.co client-side fetch (fallback when Vercel headers were absent —
  //      happens for non-US traffic, some mobile carriers, and local dev).
  //   3. (No #3 — there is no visible zip step. v1.html has one; CMA chose to
  //      skip it for UX speed. If both 1 and 2 miss, the lead submits with an
  //      empty zip and the plugin's defensive default keeps the JSON key
  //      present so downstream sees `value: ""` instead of a missing key.)
  //
  // CMA has NO visible zipcode step. For the plugin's form funnel we still
  // want a step 7 (zipcode) completion event so the catalog's per-step counts
  // line up with v1.html's. Fire trackStepCompleted("zipcode") either at
  // mount (if Vercel header populated it) or after ipapi resolves.
  useEffect(() => {
    if (initialZip) {
      trackStepCompleted("zipcode");
    }
  }, [initialZip]);
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
  // visibilitychange:hidden after a 30s delay, but ONLY before the lead has
  // been submitted (i.e., we're still in the question steps, not the
  // describe phase). After submit, the existing describe useEffect below
  // owns the unload listeners and handles describe finalize via
  // /api/lead/finalize.
  //
  // Two safeguards against false abandons (mirrors v1.html FIX #4):
  //   1. visibilitychange:hidden waits 30s before firing — gives the user
  //      time to alt-tab, open devtools, switch devices in emulation, etc.
  //      Returning to visible cancels the pending abandon.
  //   2. abandonedRef.current fire-once guard — pagehide AND visibilitychange
  //      both fire on a real tab close; without this we'd double-count.
  //
  // pagehide fires immediately (no delay) because by the time it fires the
  // page is already unloading — waiting 30s would mean the event never lands.
  useEffect(() => {
    if (submitted) return; // post-submit: describe useEffect owns the listeners
    let visibilityTimer: ReturnType<typeof setTimeout> | null = null;
    const fireAbandon = (reason: string) => {
      if (abandonedRef.current || !startedRef.current || submitted) return;
      abandonedRef.current = true;
      const key = step?.key ?? "serviceType";
      trackFormAbandon(key);
      // v1.html parity: push form_abandonment to dataLayer for GTM abandonment
      // tags that dimension by step. Reason mirrors v1's gfTrackAbandonment
      // reason values so abandon-reason dashboards see the same shape.
      const slot = catalogSlotForStepKey(key);
      if (slot) pushFormAbandonment(slot.step, slot.slug, reason);
    };
    const onVisChange = () => {
      if (document.visibilityState === "hidden") {
        // Defer — alt-tab / devtools / brief focus loss shouldn't count.
        if (visibilityTimer) clearTimeout(visibilityTimer);
        visibilityTimer = setTimeout(() => fireAbandon("visibility_hidden_30s"), 30000);
      } else if (visibilityTimer) {
        // User returned within 30s — cancel the pending abandon.
        clearTimeout(visibilityTimer);
        visibilityTimer = null;
      }
    };
    const onPagehide = () => fireAbandon("pagehide");
    window.addEventListener("pagehide", onPagehide);
    document.addEventListener("visibilitychange", onVisChange);
    return () => {
      if (visibilityTimer) clearTimeout(visibilityTimer);
      window.removeEventListener("pagehide", onPagehide);
      document.removeEventListener("visibilitychange", onVisChange);
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
      // Mirror v1.html's tracking.js POST /pageview so the plugin's
      // cah_pageviews table sees a landing-pageview row for variant 3.
      // Without this the test detail's "Lost in transit" reports 100%.
      trackPageview();
      // v1.html parity: push cah_form_boot to dataLayer so the shared GTM
      // container (GTM-W9T5LS86) sees the same session-start signal it sees
      // on v1 visitors. GTM Initialization-Trigger tags fire on this event.
      pushFormBoot();
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
  // `celebrate` = fire the big moment (shake + coin shower + intense burst). It used
  // to be triggered by the value crossing the $100k milestone; it's now triggered by
  // answering the lawyer question (see onCard). `big` keeps the lighter shake on the
  // first couple of engaging steps (serviceType / injury).
  function fireReward(ox: number, oy: number, nextAns: Answers, nextIndex: number, big = false, celebrate = false) {
    if (!nextAns.serviceType) return;
    const target = teaserValue(nextAns, nextIndex, STEPS.length);
    const start = shownRef.current;
    const delta = Math.max(0, target - start);

    if (valueModel() === "high" && !prefersReduced()) {
      if (delta > 0) {
        const ckey = Date.now();
        setCombat({ text: `+${fmtUSD(delta)}`, key: ckey });
        window.setTimeout(() => setCombat((c) => (c && c.key === ckey ? null : c)), 1200);
      }
      if (celebrate || big) { setShaking(true); window.setTimeout(() => setShaking(false), 520); }
      if (celebrate) shower(true);
      const el = document.getElementById("cma-value");
      const r = el?.getBoundingClientRect();
      const tx = r ? r.left + r.width / 2 : window.innerWidth / 2;
      const ty = r ? r.top + r.height / 2 : 130;
      const count = Math.min(28, Math.max(12, Math.round(Math.max(delta, 14000) / 6000)));
      coinBurst({ fromX: ox, fromY: oy, toX: tx, toY: ty, count, intense: celebrate });
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
  //
  // answersOverride lets callers pass a freshly-computed Answers object instead
  // of relying on `ans` state. Needed because setAns() is async — React state
  // updates aren't visible until the next render, so a `setAns(); await doSubmit()`
  // sequence reads stale data. The Trestle auto-skip path uses this to thread
  // the just-returned email into the lead POST.
  async function doSubmit(answersOverride?: Answers) {
    const submitAnswers = answersOverride ?? ans;
    setBusy(true); setErr("");
    const utms: Record<string, string> = {};
    let trustedFormCert = "";
    try {
      new URLSearchParams(window.location.search).forEach((v, k) => (utms[k] = v));
      // TrustedForm may populate our hidden field or one it injects into the
      // form, so take the first cert field that actually carries a value.
      document.querySelectorAll<HTMLInputElement>('[name="xxTrustedFormCertUrl"]').forEach((el) => {
        if (!trustedFormCert && el.value) trustedFormCert = el.value;
      });
      // Mirror the lead's email/phone into the always-mounted hidden fields at the
      // page root so TrustedForm captures them in the cert on every path. Critical
      // for the Trestle auto-skip (l.559): there the email is resolved from the
      // phone and the visible email step never renders, so the email never reaches
      // the DOM and the cert lands email_match:false — buyers then reject the lead
      // (boberdoo #1018). Set the attribute too (not just the property) so TF's DOM
      // snapshot serializes the value. The page stays open through the describe
      // phase, giving TF time to scan before the cert is claimed downstream.
      const mirrorTf = (id: string, val: string) => {
        const el = document.getElementById(id) as HTMLInputElement | null;
        if (el && val) { el.value = val; el.setAttribute("value", val); }
      };
      mirrorTf("cma-tf-email", submitAnswers.email ?? "");
      mirrorTf("cma-tf-phone", submitAnswers.phone ?? "");
      sessionStorage.setItem("cma_estimate", JSON.stringify(estimateRange(submitAnswers)));
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
          answers: submitAnswers,
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
      // v1.html parity: push form_submit + lead_qualified/disqualified to the
      // shared GTM container's dataLayer. form_submit is the canonical
      // conversion event downstream tags (Meta CAPI, Google Ads enhanced
      // conversion, Hyros) hook on; lead_<stage> lets stage-conditional ad
      // tags (e.g. fire FB Lead only for qualified) target correctly. Stage
      // prefix is "cma" so variant 3 leads are distinguishable from v1/v2 in
      // the lead_stage field.
      pushFormSubmit(submitAnswers, data.stage, "manual");
      pushLeadStage(submitAnswers, data.stage, "cma");
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

  // Mirrors v1.html's gfHandleDescribeTyping (5-min timer, reset ONCE on
  // first keystroke). Subsequent keystrokes don't extend — that's deliberate
  // so an active typist can't hold the lead in deferred state indefinitely.
  //
  // Why not the original 30s-stop-typing pattern: post-accident audience
  // often pauses for a long time mid-thought to describe what happened.
  // 30s mid-pause finalisation submits half-written describes and creates
  // weird divergence vs v1.html / v2.html in Looker comparisons.
  const describeFirstKeystrokeRef = useRef(false);
  function onDescribe(v: string) {
    setDescribe(v);
    describeRef.current = v;
    if (describeFirstKeystrokeRef.current) return;
    describeFirstKeystrokeRef.current = true;
    if (inactivityRef.current) clearTimeout(inactivityRef.current);
    inactivityRef.current = setTimeout(() => finalize(false), 5 * 60 * 1000); // 5 min after first keystroke
  }

  function seeResults() {
    finalize(false);
    setBusy(true);
    window.setTimeout(() => { window.location.href = destRef.current || "/thank-you"; }, 600);
  }

  // Describe phase: 5-min finalize timer (matches v1.html's GF_FINAL_SUBMIT_MAX_MS).
  // Armed on entry, reset ONCE on first keystroke (see onDescribe). pagehide
  // and beforeunload fire finalize immediately because the page is actually
  // unloading — we always want the typed describe to land at that point.
  //
  // We DELIBERATELY do not listen on visibilitychange:hidden here, matching
  // v1.html's gfMaybeBeaconFinalize binding (pagehide + beforeunload only).
  // visibilitychange fires whenever the user briefly backgrounds the tab
  // (alt-tab on desktop, app-switch on mobile to copy a phone number, even
  // DevTools focus shifts on dev) — finalizing on every one of those is
  // premature and was firing immediately with an empty describe in testing.
  // Real exits hit pagehide; transient hides should let the 5-min cap or
  // server-side cron fallback finish the job if the user truly walks away.
  //
  // Sharing the inactivityRef timer slot with onDescribe so first-keystroke
  // reset just resets the existing timer instead of racing two parallel ones.
  useEffect(() => {
    if (contactPhase !== "describe") return;
    const onLeave = () => finalize(true);
    if (inactivityRef.current) clearTimeout(inactivityRef.current);
    inactivityRef.current = setTimeout(() => finalize(false), 5 * 60 * 1000);
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      if (inactivityRef.current) clearTimeout(inactivityRef.current);
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [contactPhase]); // eslint-disable-line react-hooks/exhaustive-deps

  function onCard(value: string, e: React.MouseEvent) {
    const ox = e?.clientX ?? window.innerWidth / 2;
    const oy = e?.clientY ?? window.innerHeight / 2;
    const nextAns = { ...ans, [step.key]: value };
    setAns(nextAns); setErr(""); haptic([6, 16, 8]);
    track("funnel_step_complete", { step_number: i + 1, step_key: step.key, value });
    trackStepCompleted(step.key);
    const slot = CMA_STEP_TO_CATALOG[step.key];
    if (slot) {
      const answerLabel = step.options?.find((o) => o.value === value)?.label ?? value;
      pushStepCompleted(slot.step, slot.slug, answerLabel, nextAns);
    }
    fireReward(ox, oy, nextAns, i + 1, step.key === "serviceType" || step.key === "injury", step.key === "attorney");
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
      const subKey = contactPhase === "email" ? "email" : "phone";
      trackStepCompleted(subKey);
      const slot = CMA_STEP_TO_CATALOG[subKey];
      if (slot) {
        const label = contactPhase === "email" ? (ans.email ?? "") : (ans.phone ?? "");
        pushStepCompleted(slot.step, slot.slug, label, ans);
      }
    } else {
      trackStepCompleted(step.key);
      const slot = CMA_STEP_TO_CATALOG[step.key];
      if (slot) {
        let label = "";
        if (step.kind === "state") label = ans.stateText ?? "";
        else if (step.kind === "name") label = `${ans.firstName ?? ""} ${ans.lastName ?? ""}`.trim();
        pushStepCompleted(slot.step, slot.slug, label, ans);
      }
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
          //
          // Pass the freshly-merged answers object directly to doSubmit() so
          // it sees the Trestle email without waiting for the setAns React
          // state update to land. React batches state updates between renders,
          // so an await doSubmit() right after setAns reads stale `ans`.
          const merged: Answers = { ...ans, email: d.email };
          setAns(merged);
          trackStepCompleted("email");
          await doSubmit(merged);
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
        <h2 className="fnl-h">{contactPhase === "describe" ? "🎉 You're all set!" : step.heading}</h2>
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
