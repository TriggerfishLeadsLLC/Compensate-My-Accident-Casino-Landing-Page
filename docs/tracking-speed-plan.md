# Tracking & Page-Speed Plan — compensatemyaccident.com (challenger)

**For:** the developer who owns the GTM container + Meta CAPI.
**Context:** challenger funnel on Vercel (Next.js). Control = caraccidenthelp.net (must NOT be touched/risked).

---

## TL;DR

The page is already fast where users feel it: **FCP/LCP 0.8s, CLS 0.003** (PageSpeed mobile).
The one orange metric is **Total Blocking Time ~5,790 ms**, measured on a throttled
Moto G Power + Slow 4G. It is **almost entirely the third-party ad/tracking stack**
executing on the main thread:

| Tag | ~Size | Action |
|---|---|---|
| Facebook pixel (`connect.facebook.net`) | ~223 KB | **Keep on load** (active channel) |
| Hyros (`t.caraccidenthelp.net/universal-script`) | ~109 KB | **Keep on load**, but **fix domain** (see below) |
| AppLovin / Axon (`s.axon.ai`) | ~101 KB | **Delay** (not active channel; keep collecting) |
| TrustedForm | ~57 KB | **Keep on load** (TCPA cert capture window) |
| TikTok (`analytics.tiktok.com`) | ~9 KB+ | **Delay** if not an active channel |
| dashfi (`js.dashfi.net`) | ~3 KB | Delay / negligible |
| GA4 + Clarity | light | **Keep on load** |

**Client-side, you cannot cut the FB+Hyros weight (~330 KB) without hurting tracking.**
The real, safe wins are below. None of them require slowing down the active-channel pixels.

---

## 1. Pixel + CAPI deduplication — HIGHEST PRIORITY (CAPI is already live)

Best practice is browser **Pixel + CAPI together**, deduplicated. If they are NOT deduped,
every conversion is counted twice → inflated reported ROAS → the algorithm bids on bad data.

**Verify / implement:**
- Browser pixel event and CAPI server event must share the **same `event_id`** AND the same
  `event_name` (especially `PageView` and `Lead`).
- For the funnel **Lead** event: generate one UUID `event_id` at submit time. Send it to
  **both** the browser `fbq('track','Lead', {...}, { eventID })` **and** the server CAPI call.
  - The app can push `{ event: 'lead', event_id, ... }` to `dataLayer` at submit so the GTM
    FB "Lead" tag reads `eventID` from it. (Say the word and I'll wire that dataLayer push.)
- Confirm in Meta Events Manager → the event shows "Processed" with deduplication working
  (not "browser + server" double rows).

## 2. Delay the non-active-channel pixels in GTM (the main TBT win)

In the GTM container, for the **AppLovin/Axon** and **TikTok** tags:
- Change trigger from **All Pages** → a **Timer trigger (~3,500 ms)** or a custom
  `tags_idle` event pushed after load.
- This keeps them collecting for engaged sessions (so future AppLovin/Axon spend still has
  data) while removing ~100 KB+ of parse/execute from the critical load window.
- Do **not** delay Facebook or Hyros.

## 3. Fix the Hyros tag domain

The Hyros "universal script" currently loads from **`t.caraccidenthelp.net`** (the CONTROL
domain). On the challenger it should use the challenger's Hyros tracking domain/account, or
attribution for this funnel is wrong. Update the tag.

## 4. Confirm the FB "Lead" conversion trigger fires on the new domain

Verify the GTM "Lead" conversion tag fires on `compensatemyaccident.com` /
`cma-bay.vercel.app` (it may be scoped to the old domain).

## 5. CONTROL SAFETY (do not skip)

If container **GTM-W9T5LS86** is **shared with caraccidenthelp.net** (the Hyros domain
suggests it may be), scope every change above with domain/page conditions so the control
site is unaffected — or split the challenger into its **own GTM container**. Never risk
control's tracking.

---

## Optional bigger win (later)

Give the challenger its **own lean GTM container** (or direct first-party pixels). It would
stop carrying control's tags, fix the domain issues by construction, give full control over
tiering, and remove all control-risk. Recommended once the challenger is ramping.

---

## App-side (already shipped — no action needed)

- All tags fire **right after hydration, for every visitor** (not gated on interaction) —
  Meta/Hyros get PageView on load.
- `gtag`/`dataLayer` stubs seeded inline so early events (e.g. step-1 view) queue and replay.
- `preconnect` to `googletagmanager.com` + `connect.facebook.net` to speed their load.
- Inlined CSS, self-hosted font, sprite-based canvas FX, low-end "lite" mode.
- Legacy-JS polyfills **kept** (old Facebook in-app WebViews need them — do not strip).
