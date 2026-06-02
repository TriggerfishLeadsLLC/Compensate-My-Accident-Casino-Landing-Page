import FunnelPage from "@/components/FunnelPage";

// Aggressive version — same optimized funnel, but the HIGH value model + full
// flair (coins/shake/climbing teaser) switch on for the /car-accident path
// (see valueModel() in lib/estimate.ts). Root (/) stays the compliant version.
export default function CarAccident() {
  return <FunnelPage variant="optimized" />;
}
