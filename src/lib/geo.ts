// Geo personalization from Vercel's edge headers (set automatically on every
// request in production). Used to prefill the state, personalize the hero/copy,
// and tee up "local attorney" framing. Falls back gracefully (empty) on local
// dev or non-US traffic — the UI never depends on it.
import { headers } from "next/headers";

export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

export interface Geo {
  region: string;     // e.g. "FL"
  city: string;       // e.g. "Miami"
  stateName: string;  // e.g. "Florida" (US only)
}

export async function readGeo(): Promise<Geo> {
  const h = await headers();
  const country = (h.get("x-vercel-ip-country") || "").toUpperCase();
  const region = (h.get("x-vercel-ip-country-region") || "").toUpperCase();
  const cityRaw = h.get("x-vercel-ip-city") || "";
  let city = "";
  try { city = decodeURIComponent(cityRaw); } catch { city = cityRaw; }
  const stateName = country === "US" ? STATE_NAMES[region] || "" : "";
  return { region, city, stateName };
}
