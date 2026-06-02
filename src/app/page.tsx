import FunnelPage from "@/components/FunnelPage";

// Root = the COMPLIANT / light version: optimized funnel, grounded numbers,
// no casino flair, starts at $0. The aggressive version lives at /car-accident.
export default function Home() {
  return <FunnelPage variant="optimized" />;
}
