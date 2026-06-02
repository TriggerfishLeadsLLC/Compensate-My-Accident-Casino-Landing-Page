// Funnel definition for the AI Accident Value Calculator. Option `value`s are
// unchanged from the original so the Make.com mapping + qualification logic stay
// identical. Ordered to build momentum: easy/engaging qualifying questions first
// (research: ask contact after the user is invested), contact at the climax.
// ZIP is captured silently (IP, background). "Describe" moves to the reveal page
// as an optional bonus. Insured only shows for CA/AZ (matches current routing).

export type StepKind = "cards" | "state" | "name" | "email" | "phone";

export interface Option {
  value: string;
  label: string;
  icon?: string;
  hint?: string;
  emphasis?: boolean;
}

export interface Step {
  key: string;
  kind: StepKind;
  heading: string;
  sub?: string;
  options?: Option[];
  showIf?: (a: Answers) => boolean;
}

export const STEPS: Step[] = [
  {
    key: "serviceType",
    kind: "cards",
    heading: "What type of accident were you in?",
    sub: "Tap one to start calculating your estimate.",
    options: [
      { value: "car_accident", label: "Car", icon: "car" },
      { value: "motorcycle_accident", label: "Motorcycle", icon: "motorcycle" },
      { value: "trucking_accident", label: "Truck", icon: "truck" },
      { value: "pedestrian_accident", label: "Pedestrian", icon: "pedestrian" },
      { value: "bicycle_accident", label: "Bicycle", icon: "bicycle" },
      { value: "work_accident", label: "At work", icon: "work" },
    ],
  },
  {
    key: "injury",
    kind: "cards",
    heading: "Were you hurt in the accident?",
    sub: "Even minor injuries like whiplash, neck or back pain count.",
    options: [
      { value: "yes", label: "Yes, I was hurt", hint: "Including pain that showed up days later", emphasis: true },
      { value: "no", label: "No, I wasn't hurt" },
    ],
  },
  {
    key: "accidentHappen",
    kind: "cards",
    heading: "When did the accident happen?",
    sub: "Most claims are valid for a limited time, so timing matters.",
    options: [
      { value: "within_1_week", label: "In the last week", emphasis: true },
      { value: "within_1_3_months", label: "1 to 3 months ago", emphasis: true },
      { value: "within_4_6_months", label: "4 to 6 months ago", emphasis: true },
      { value: "within_1_year", label: "Within the last year", emphasis: true },
      { value: "over_1_year", label: "More than a year ago" },
    ],
  },
  {
    key: "fault",
    kind: "cards",
    heading: "Was the accident your fault?",
    sub: "If someone else caused it, you may be owed money.",
    options: [
      { value: "no", label: "No, someone else caused it", emphasis: true },
      { value: "yes", label: "Yes, it was my fault" },
    ],
  },
  {
    key: "attorney",
    kind: "cards",
    heading: "Have you hired a lawyer for this yet?",
    sub: "Most people haven't, that's what we're here for. Even if you have, a free second opinion costs nothing.",
    options: [
      { value: "not_yet", label: "No, not yet", emphasis: true },
      { value: "yes", label: "Yes, I already have one" },
    ],
  },
  { key: "stateText", kind: "state", heading: "Where did the accident happen?", sub: "We'll match you with top-rated attorneys near you." },
  {
    key: "insured",
    kind: "cards",
    heading: "Did you have car insurance at the time?",
    showIf: (a) => a.stateText === "California" || a.stateText === "Arizona",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
  },
  { key: "name", kind: "name", heading: "Who is this estimate for?", sub: "We'll put your free case report in your name." },
  {
    key: "phone",
    kind: "phone",
    heading: "Where should we send your full estimate?",
    sub: "Enter your number to unlock your full estimate and your free case review.",
  },
];

export interface Answers {
  serviceType?: string;
  attorney?: string;
  fault?: string;
  injury?: string;
  accidentHappen?: string;
  stateText?: string;
  zipcode?: string;
  insured?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  describe?: string;
}

// ── Qualification (ported verbatim from the original funnel) ──────
const Q1 = ["car_accident", "motorcycle_accident", "trucking_accident"];
const Q2 = ["within_1_week", "within_1_3_months", "within_4_6_months", "within_1_year"];

export type LeadStage = "qualified-lead" | "disqualified-lead";

export function classify(a: Answers): { qualified: boolean; redirect: string; stage: LeadStage } {
  const isQ =
    Q1.includes(a.serviceType ?? "") &&
    a.fault === "no" &&
    a.injury === "yes" &&
    a.attorney === "not_yet" &&
    Q2.includes(a.accidentHappen ?? "");
  if (isQ) return { qualified: true, redirect: "/thank-you", stage: "qualified-lead" };
  if (a.injury === "no") return { qualified: false, redirect: "/diminished-value-claim", stage: "disqualified-lead" };
  return { qualified: false, redirect: "/finished", stage: "disqualified-lead" };
}

export const US_STATES = Object.values({
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts",
  MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin",
  WY: "Wyoming", DC: "District of Columbia",
}).sort();
