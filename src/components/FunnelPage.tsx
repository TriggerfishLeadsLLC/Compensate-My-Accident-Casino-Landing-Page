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

      {/* TrustedForm only writes its cert URL into hidden fields that live inside a
          real <form>. The funnel submits via fetch and renders no form of its own,
          so these fields must sit in this dedicated wrapper — without it TF still
          generates a certificate (we see the cert id + snapshot/events fire) but
          never writes it back, and every lead ships with an empty
          TrustedForm_certUrl. No submit control lives in here, so the form can't be
          submitted; it exists purely so TF has a form to populate.

          The email/phone mirrors below are always-mounted so TrustedForm scans the
          lead's PII into the cert even on the Trestle auto-skip path, where the
          email is resolved from the phone and the visible email step never renders
          (so the email otherwise never reaches the DOM). Buyers reject those leads
          with boberdoo #1018 / email_match:false. Funnel.doSubmit populates these
          (value + attribute) for every submit path. */}
      <form id="cma-tf-form" aria-hidden="true">
        <input type="hidden" name="xxTrustedFormCertUrl" id="xxTrustedFormCertUrl" />
        <input type="hidden" name="xxTrustedFormPingUrl" id="xxTrustedFormPingUrl" />
        <input type="hidden" name="email" id="cma-tf-email" />
        <input type="hidden" name="phone" id="cma-tf-phone" />
      </form>
      {/* Offscreen text mirror of the Trestle-resolved email. Funnel writes the
          email here (as text content) the instant the lookup returns on phone
          input, mirroring v1.html's #email node — TrustedForm scans page text,
          so this gets the email into the cert seconds before the lead posts. */}
      <span id="cma-tf-email-text" aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }} />

      <SiteFooter />
    </main>
  );
}
