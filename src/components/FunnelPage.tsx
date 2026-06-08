import Funnel from "@/components/Funnel";
import ScrollDepth from "@/components/ScrollDepth";
import SiteFooter from "@/components/SiteFooter";
import { readGeo } from "@/lib/geo";

// Shared page shell. `/` renders variant "control" (V1), `/v2` renders
// "optimized" (V2: auto-teaser, curiosity headline, live ticker, endowed
// progress, tile cue). Same funnel component, branched by variant.
export default async function FunnelPage({ variant }: { variant: "control" | "optimized" }) {
  const { stateName, postalCode } = await readGeo();
  const where = stateName ? `${stateName} ` : "";
  const v2 = variant === "optimized";

  return (
    <main className="app">
      <ScrollDepth />
      <header className="topbar">
        <div className="brand">Compensate<b>My</b>Accident</div>
        <div className="secure">🔒 256-bit secure</div>
      </header>

      <div className="center">
        <section className="hero">
          <div className="eyebrow">Free Compensation Calculator</div>
          <h1>
            {v2
              ? <>See what your {where}accident could <em>really</em> be worth</>
              : <>What&apos;s your {where}claim worth?</>}
          </h1>
          <p className="sub0">Answer a few quick questions and watch your estimate build in real time. Free, no obligation.</p>
        </section>
        <div className="shell">
          <Funnel initialState={stateName} initialZip={postalCode} stateName={stateName} variant={variant} />
        </div>
      </div>

      <input type="hidden" name="xxTrustedFormCertUrl" id="xxTrustedFormCertUrl" />
      <input type="hidden" name="xxTrustedFormPingUrl" id="xxTrustedFormPingUrl" />

      <SiteFooter />
    </main>
  );
}
