// Builds the EXACT Make.com webhook payload the existing funnel sends
// (ported from ab-audit/v2.html `gfBuildPayload`, Growform form
// 67cf74bca2ec54000b491be6 / "MVA - English HTML Form"). Posting this to the
// same Make.com webhook = byte-identical delivery to the control, so your
// developer only has to supply the webhook URL — the routing rules downstream
// are untouched.
//
// Enum values MUST be sent as the human label (e.g. "Car Accident", "Not Yet",
// "Within 1 Week"), not the raw slug. Both the cah-split-tester plugin's
// LeadPayloadParser (SERVICE_LABEL_TO_RAW etc.) and LeadByte downstream
// lookup the label to derive the canonical slug — a raw slug like
// "car_accident" misses the lookup and leaves the column empty / LeadByte
// rejects the lead with "type_of_accident is not an expected value". The
// LABELS map below mirrors v1.html's GF_LABELS exactly, plus two CMA-specific
// slug-mismatch entries (attorney `yes` → "I Have An Attorney"; accidentHappen
// `over_1_year` → "Longer than 2 Year") so the funnel's internal answer state
// can stay as-is while the outgoing payload looks identical to v1.html.

import type { Answers } from "./funnel";

export interface LeadMeta {
  utms?: Record<string, string>;
  ip?: string;
  userAgent?: string;
  trustedFormCert?: string;
  trestleEmail?: string;
  eventId: string;
}

type Field = { type: string; label?: string; step?: string | number; value: unknown };

const LABELS: Record<string, Record<string, string>> = {
  serviceType: {
    car_accident: "Car Accident",
    motorcycle_accident: "Motorcycle Accident",
    trucking_accident: "Trucking Accident",
    bicycle_accident: "Bicycle or E-bike Accident",
    work_accident: "Accident or Injury at Work",
    pedestrian_accident: "Pedestrian Accident",
    other_accident: "Other Accident",
  },
  attorney: {
    not_yet: "Not Yet",
    has_attorney: "I Have An Attorney",
    yes: "I Have An Attorney",
  },
  fault: { no: "No", yes: "Yes" },
  injury: { yes: "Yes", no: "No" },
  accidentHappen: {
    within_1_week: "Within 1 Week",
    within_1_3_months: "Within 1-3 months",
    within_4_6_months: "Within 4-6 months",
    within_1_year: "Within 1 Year",
    within_2_year: "Within 2 Year",
    longer_than_2_year: "Longer than 2 Year",
    over_1_year: "Longer than 2 Year",
  },
  insured: { yes: "Yes", no: "No", "": "" },
};

function lbl(field: keyof typeof LABELS, val: string | undefined): string {
  const v = val ?? "";
  return LABELS[field][v] ?? v;
}

export function buildMakePayload(a: Answers, meta: LeadMeta) {
  const u = meta.utms ?? {};
  // f() — labeled enum/text fields (Buttons, Single Select, Email, etc).
  // h() — hidden fields: no label key, just type/step/value (matches v1.html).
  // n() — system fields with no step (system_ip, trestle_email, twilio status).
  const f = (type: string, label: string, step: string | number, value: unknown): Field => ({ type, label, step, value });
  const h = (step: string, value: unknown): Field => ({ type: "Hidden", step, value });
  const n = (type: string, label: string, value: unknown): Field => ({ type, label, value });

  // Normalize phone → "1" + 10-digit local, tolerating autofill that already prepends
  // the country code (so "+1 512…" / "1512…" don't become a double "11512…").
  const pd = String(a.phone ?? "").replace(/\D/g, "");
  const phone1 = "1" + (pd.length === 11 && pd.startsWith("1") ? pd.slice(1) : pd);

  // Step-id constants mirror v1.html exactly (form 67cf74bca2ec54000b491be6 in
  // Growform). Empty-filler hidden fields use the step id of the visible step
  // they originated under (name / email / phone / zipcode / service), per
  // v1.html lines 2083-2089.
  const SERVICE_STEP = "acd45227cac332d443c4e1db";
  const NAME_STEP    = "a3521f07443c3a05b36140a5";
  const EMAIL_STEP   = "fe5ec8504219f1b6c4e59be5";
  const PHONE_STEP   = "1d50fdecb868a4b4b6fa9ead";
  const ZIP_STEP     = "44149325fd0b2144e452707c";

  const fields: Record<string, Field> = {
    buttons_485431231808561: f("Buttons", "Type of service", SERVICE_STEP, lbl("serviceType", a.serviceType)),
    buttons_622258029765821: f("Buttons", "Attorney", "aca684778b030842fae3851e", lbl("attorney", a.attorney)),
    buttons_667185038061539: f("Buttons", "Fault", "97af9545f0a240f1e51c338d", lbl("fault", a.fault)),
    buttons_26651153024883: f("Buttons", "Injury", "f50903b962cd3e784da5fc7c", lbl("injury", a.injury)),
    buttons_605863290008990: f("Buttons", "Accident Happen", "e0d68e97dccf6ad1863aa070", lbl("accidentHappen", a.accidentHappen)),
    single_select_726281422444697: f("Single Select", "State", "450c04c61e93dc39e1f46db6", a.stateText),
    zipcode_708492827784848: f("Zipcode", "What is your zip code?", ZIP_STEP, a.zipcode ?? ""),
    buttons_555677308875088: f("Buttons", "Insured", "7bd67752e688f5ce009f7f6b", lbl("insured", a.insured)),
    text_717042938246781: f("Text", "Briefly describe your accident to us.", "3dbad15e3fd9836d72981b16", a.describe ?? ""),
    text_921418548778799: f("Text", "First name", NAME_STEP, a.firstName),
    text_168309131262000: f("Text", "Last name", NAME_STEP, a.lastName),
    email_213868147356228: f("Email", "What is your email address?", EMAIL_STEP, a.email),
    phone_400747347981930: f("Phone", "What is your phone number?", PHONE_STEP, phone1),
    toscheckbox_687262995170288: f("TOSCheckbox", "TOS", PHONE_STEP, "true"),
    // UTM / hidden fields — match v1.html lines 2068-2089 in both keys AND order.
    hidden_978002841632858: h(SERVICE_STEP, u.utm_source ?? ""),
    hidden_953875108661844: h(SERVICE_STEP, u.utm_medium ?? ""),
    hidden_25865364589303:  h(SERVICE_STEP, u.utm_term ?? ""),
    hidden_337672242598594: h(SERVICE_STEP, u.utm_campaign ?? ""),
    hidden_427537542763995: h(SERVICE_STEP, a.stateText ?? ""),
    hidden_579780982435417: h(SERVICE_STEP, u.utm_adname ?? ""),
    hidden_585157882311305: h(SERVICE_STEP, u.utm_adid ?? ""),
    hidden_92922683992474:  h(SERVICE_STEP, u.utm_adsetid ?? ""),
    hidden_436124489257771: h(SERVICE_STEP, u.utm_campaignid ?? ""),
    hidden_97816714524287:  h(SERVICE_STEP, u.utm_placement ?? ""),
    hidden_77823743129070:  h(SERVICE_STEP, u.utm_sitesourcename ?? ""),
    hidden_202243593262175: h(SERVICE_STEP, u.utm_creative ?? ""),
    hidden_clickid:         h(SERVICE_STEP, u.clickid ?? ""),
    hidden_utm_adsetname:   h(SERVICE_STEP, u.utm_adsetname ?? ""),
    hidden_utm_state:       h(SERVICE_STEP, u.utm_state ?? ""),
    hidden_264066733844907: h(NAME_STEP,    ""),
    hidden_548794601391906: h(EMAIL_STEP,   ""),
    hidden_726817425868207: h(PHONE_STEP,   ""),
    hidden_532862782645525: h(ZIP_STEP,     ""),
    hidden_969217829429764: h(SERVICE_STEP, ""),
    hidden_983502081096641: h(SERVICE_STEP, ""),
    hidden_164585691415058: h(PHONE_STEP,   ""),
    system_userAgent:    f("Text", "System User-Agent", 1, meta.userAgent ?? ""),
    TrustedForm_certUrl: f("Text", "Trusted Form Cert URL", 1, meta.trustedFormCert ?? ""),
    phone_400747347981930_twilio_lookup_status: n("TwilioLookupStatus", "phone_400747347981930 Twilio Lookup Status", ""),
    system_ip:    n("Text", "System IP", meta.ip ?? ""),
    trestle_email: n("Text", "Trestle Email", meta.trestleEmail ?? ""),
  };

  return [
    {
      event_id: meta.eventId,
      event_type: "form_submission",
      webhook: { version: "4" },
      form_submission: {
        form_id: "67cf74bca2ec54000b491be6",
        submitted_at: new Date().toISOString(),
        fields,
      },
      form_meta: { form_name: "MVA - English Vercel Form" },
    },
  ];
}
