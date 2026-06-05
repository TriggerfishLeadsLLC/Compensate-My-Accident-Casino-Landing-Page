// v1.html-style dataLayer event emitter for GTM container GTM-W9T5LS86,
// shared with caraccidenthelp.net. The container's existing tags listen for
// specific event names (cah_form_boot, form_submit, lead_qualified, etc.)
// with specific payload shapes (dlv - service_type / dlv_service_type
// dual-keys, grow_step / grow_buttonText, event_action keys). Emitting the
// matching shape from CMA means our existing Lead / Hyros / Meta CAPI /
// Google Ads conversion tags fire on variant 3 traffic without needing
// per-variant container rewrites.
//
// Coexists with CMA's existing `track()` helper (src/lib/analytics.ts) which
// pushes simpler `funnel_step_view` / `lead_submitted` events. Both sets
// land on the dataLayer; GTM tags filter on whichever event name they need.
//
// PII is intentional per the project memory feedback_pii_in_datalayer —
// email/phone/name/IP are required by downstream tracking (Enhanced
// Conversions, Meta CAPI, custom GTM tag rules). Never strip.

import type { Answers } from "./funnel";

const SERVICE_LABELS: Record<string, string> = {
  car_accident: "Car Accident",
  motorcycle_accident: "Motorcycle Accident",
  trucking_accident: "Trucking Accident",
  bicycle_accident: "Bicycle or E-bike Accident",
  work_accident: "Accident or Injury at Work",
  pedestrian_accident: "Pedestrian Accident",
  other_accident: "Other Accident",
};

const ATTORNEY_LABELS: Record<string, string> = {
  not_yet: "Not Yet",
  yes: "I Have An Attorney",        // CMA stores 'yes', v1.html uses 'has_attorney'
  has_attorney: "I Have An Attorney",
};

const YES_NO_LABELS: Record<string, string> = { yes: "Yes", no: "No" };

const TIMEFRAME_LABELS: Record<string, string> = {
  within_1_week: "Within 1 Week",
  within_1_3_months: "Within 1-3 months",
  within_4_6_months: "Within 4-6 months",
  within_1_year: "Within 1 Year",
  within_2_year: "Within 2 Year",
  longer_than_2_year: "Longer than 2 Year",
  over_1_year: "More than a year ago",       // CMA's "over_1_year" key
};

function lbl(map: Record<string, string>, value?: string): string {
  if (!value) return "";
  return map[value] ?? value;
}

// Pulls all UTM + clickid params from the current URL. v1.html reads these
// once on load via URLSearchParams; we do the same at push time so any
// in-page URL mutation between load and submit is reflected.
function readUtms(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  const keys = [
    "utm_source", "utm_medium", "utm_term", "utm_campaign",
    "utm_adsetname", "utm_adname", "utm_campaignid", "utm_adsetid", "utm_adid",
    "utm_placement", "utm_sitesourcename", "utm_creative", "utm_state", "clickid",
  ];
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = p.get(k) ?? "";
  return out;
}

// Mirrors v1.html's gfClientVars() output — the bag of dlv-prefixed keys
// every GTM tag downstream relies on. Includes both spaced ("dlv - x") and
// underscored ("dlv_x") variants per the v1 FIX #12 dual-key convention.
function buildClientVars(answers: Answers, stepNumber?: number, stepName?: string): Record<string, unknown> {
  const phoneDigits = (answers.phone ?? "").replace(/\D/g, "");
  const phoneE164 = phoneDigits ? "1" + phoneDigits : "";

  const svc = lbl(SERVICE_LABELS, answers.serviceType);
  const att = lbl(ATTORNEY_LABELS, answers.attorney);
  const flt = lbl(YES_NO_LABELS, answers.fault);
  const inj = lbl(YES_NO_LABELS, answers.injury);
  const tf = lbl(TIMEFRAME_LABELS, answers.accidentHappen);
  const ins = lbl(YES_NO_LABELS, answers.insured);
  const state = answers.stateText?.toLowerCase() ?? "";

  const utms = readUtms();

  return {
    "dlv - email": answers.email ?? "",
    "dlv - firstname": answers.firstName ?? "",
    "dlv - lastname": answers.lastName ?? "",
    "dlv_email": answers.email ?? "",
    "dlv_firstname": answers.firstName ?? "",
    "dlv_lastname": answers.lastName ?? "",
    "Growform Phone": phoneE164,
    "htmlphone_code": phoneE164,
    "ip_address": "",                // Not available client-side; populated server-side via lead payload
    "Growform State": state,
    "dl-zipcode": answers.zipcode ?? "",
    "dlv - service_type": svc,
    "dlv - attorney": att,
    "dlv - fault": flt,
    "dlv - injury": inj,
    "dlv - timeframe": tf,
    "dlv - insured": ins,
    "dlv_service_type": svc,
    "dlv_attorney": att,
    "dlv_fault": flt,
    "dlv_injury": inj,
    "dlv_timeframe": tf,
    "dlv_insured": ins,
    "dlv - form_step_number": stepNumber ?? 0,
    "dlv - form_step_name": stepName ?? "",
    "dlv_form_step_number": stepNumber ?? 0,
    "dlv_form_step_name": stepName ?? "",
    ...utms,
  };
}

function dataLayer(): unknown[] | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { dataLayer?: unknown[] };
  w.dataLayer = w.dataLayer || [];
  return w.dataLayer;
}

// ─── Event emitters ───────────────────────────────────────────────────

// v1.html: pushed on every page load. Used by GTM as a session-start signal
// for Initialization-Trigger-style tags. Matches the exact shape v1 sends.
export function pushFormBoot(): void {
  const dl = dataLayer();
  if (!dl) return;
  dl.push({
    event: "cah_form_boot",
    event_action: "form_boot",
    grow_buttonText: "form_start",
  });
}

// v1.html: pushed when /lead succeeds (after step 12 / describe). The big
// conversion event — GTM Lead tag, Meta CAPI dedupe, Google Ads enhanced
// conversion all hook on this. Carries the full client-vars bag plus
// lead_stage so disqualified conversions can be filtered out by ad-platform
// rules. Mirrors v1.html's gfFireSubmitTracking('manual').
export function pushFormSubmit(answers: Answers, leadStage: "qualified-lead" | "disqualified-lead", submitReason: string): void {
  const dl = dataLayer();
  if (!dl) return;
  const utms = readUtms();
  dl.push({
    event: "form_submit",
    event_action: "form_submitted",
    grow_step: 12,
    grow_buttonText: "submit",
    service_type: answers.serviceType ?? "",
    state: answers.stateText?.toLowerCase() ?? "",
    submit_reason: submitReason,
    lead_stage: leadStage,
    ...utms,
  });
  // Also push the growformFormCompleted event for back-compat with GTM tags
  // that listened on the old Growform-iframe event name. Same dlv- shape.
  dl.push({
    event: "growformIframe.growformFormCompleted",
    event_action: "form_completed",
    grow_step: 12,
    grow_buttonText: "submit",
    ...buildClientVars(answers, 12, "describe"),
  });
}

// v1.html: pushed once the lead is classified qualified or disqualified.
// Fires earlier than form_submit in v1.html (as soon as the qualifying
// answers are known), but CMA classifies server-side at submission time —
// so we fire lead_qualified/disqualified alongside form_submit, not at the
// step that finalises the decision. Downstream consumers care that the
// event fires for every submission with the right stage, not the timing.
export function pushLeadStage(answers: Answers, leadStage: "qualified-lead" | "disqualified-lead", variantSlug: string): void {
  const dl = dataLayer();
  if (!dl) return;
  const stage = leadStage === "qualified-lead" ? "qualified" : "disqualified";
  const eventName = `lead_${stage}`;
  dl.push({
    event: eventName,
    event_action: eventName,
    lead_stage: `${variantSlug}_${stage}`,    // v1 FIX #14: prefix with variant slug, not hardcoded "v2_"
    service_type: answers.serviceType ?? "",
    attorney: answers.attorney ?? "",
    fault: answers.fault ?? "",
    injury: answers.injury ?? "",
    timeframe: answers.accidentHappen ?? "",
    state: answers.stateText ?? "",
  });
}

// v1.html: pushed on every step completion (every answer click). Lets GTM
// step-funnel tags fire identically across all three variants. The dlv-
// shape includes the running answers bag, so each push is a snapshot of
// the visitor's state at that moment.
export function pushStepCompleted(stepNumber: number, stepName: string, answerLabel: string, answers: Answers): void {
  const dl = dataLayer();
  if (!dl) return;
  dl.push({
    event: "growformIframe.growformStepCompleted",
    event_action: "step_completed",
    grow_step: stepNumber,
    grow_buttonText: answerLabel || stepName || `step_${stepNumber}`,
    answer_label: answerLabel,
    ...buildClientVars(answers, stepNumber, stepName),
  });
}

// v1.html: pushed on pagehide / visibilitychange:hidden-30s when the form
// hasn't been completed. Carries the step the visitor was on when they
// left so GTM abandonment tags can dimension by step.
export function pushFormAbandonment(stepNumber: number, stepName: string, reason: string): void {
  const dl = dataLayer();
  if (!dl) return;
  const utms = readUtms();
  dl.push({
    event: "form_abandonment",
    event_action: "form_abandoned",
    grow_buttonText: stepName || `step_${stepNumber}`,
    "dlv - form_step_number": stepNumber,
    "dlv - form_step_name": stepName,
    "dlv_form_step_number": stepNumber,
    "dlv_form_step_name": stepName,
    reason,
    ...utms,
  });
}
