// Clean line icons (Lucide-style geometry, currentColor, no network). One per
// accident type. Consistent 1.9 stroke, round joins — professional + crisp.
import type { JSX } from "react";

const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const ICONS: Record<string, JSX.Element> = {
  car: (
    <>
      <path {...P} d="M19 17h2c.55 0 1-.45 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.55 0-1.1.4-1.4.9L2.2 10.8C2.08 11.18 2 11.59 2 12v4c0 .55.45 1 1 1h2" />
      <circle cx="7" cy="17" r="2" {...P} />
      <path {...P} d="M9 17h6" />
      <circle cx="17" cy="17" r="2" {...P} />
    </>
  ),
  motorcycle: (
    <>
      <circle cx="5.5" cy="16.5" r="2.9" {...P} />
      <circle cx="18.5" cy="16.5" r="2.9" {...P} />
      <path {...P} d="M8 16.5h4l4-4.5" />
      <path {...P} d="M5.5 16.5 9 11.5h5l2.5 5" />
      <path {...P} d="M7.6 11.5H10" />
    </>
  ),
  truck: (
    <>
      <path {...P} d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path {...P} d="M15 18H9" />
      <path {...P} d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 18.52 8H14" />
      <circle cx="7" cy="18" r="2" {...P} />
      <circle cx="17" cy="18" r="2" {...P} />
    </>
  ),
  pedestrian: (
    <>
      <circle cx="12" cy="5" r="1.3" {...P} />
      <path {...P} d="m9 20 3-6 3 6" />
      <path {...P} d="m6 8 6 2 6-2" />
      <path {...P} d="M12 10v4" />
    </>
  ),
  bicycle: (
    <>
      <circle cx="18.5" cy="17.5" r="3.3" {...P} />
      <circle cx="5.5" cy="17.5" r="3.3" {...P} />
      <circle cx="15" cy="5" r="1" {...P} />
      <path {...P} d="M12 17.5V14l-3-3 4-3 2 3h2" />
    </>
  ),
  work: (
    <>
      <path {...P} d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-1.5a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1z" />
      <path {...P} d="M10 10.5V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5.5" />
      <path {...P} d="M4 15.5V12a6 6 0 0 1 6-6" />
      <path {...P} d="M14 6a6 6 0 0 1 6 6v3.5" />
    </>
  ),
};

export default function AccidentIcon({ name }: { name?: string }) {
  if (!name || !ICONS[name]) return null;
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}
