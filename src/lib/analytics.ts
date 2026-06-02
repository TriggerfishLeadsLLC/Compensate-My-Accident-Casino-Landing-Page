// Thin event layer → GA4 (gtag), Microsoft Clarity, and the GTM dataLayer.
// Every event is tagged with the experiment variant so GA4 + Clarity segment
// by A/B arm. No-ops safely on the server and before tags load.

type Props = Record<string, unknown>;

function variant(): string {
  if (typeof window === "undefined") return "unknown";
  return (window as unknown as { cmaVariant?: string }).cmaVariant ?? "control";
}

export function track(event: string, props: Props = {}): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    gtag?: (...a: unknown[]) => void;
    dataLayer?: unknown[];
    clarity?: (...a: unknown[]) => void;
  };
  const payload = { experiment_variant: variant(), ...props };
  try { w.gtag?.("event", event, payload); } catch {}
  try { w.dataLayer?.push({ event, ...payload }); } catch {}
  // Clarity: record a named action + smart-event tag so sessions are filterable.
  try { w.clarity?.("event", event); } catch {}
}

export function clarityTag(key: string, value: string): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { clarity?: (...a: unknown[]) => void };
  try { w.clarity?.("set", key, value); } catch {}
}

/** Mark the GA4 conversion + Clarity upgrade for a submitted lead. */
export function trackLead(qualified: boolean, props: Props = {}): void {
  track("lead_submitted", { qualified, ...props });
  if (typeof window !== "undefined") {
    const w = window as unknown as { clarity?: (...a: unknown[]) => void };
    try { w.clarity?.("upgrade", qualified ? "qualified_lead" : "lead"); } catch {}
  }
}
