import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import Script from "next/script";
import FXLayer from "@/components/FXLayer";
import DeferredTags from "@/components/DeferredTags";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Compensate My Accident — See What You Qualify For",
  description:
    "Injured in an accident? Find out in seconds what your claim could be worth. Free, no obligation.",
};

export const viewport: Viewport = {
  themeColor: "#08110d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

const clean = (v?: string) => (v ?? "").replace(/[^\x20-\x7E]/g, "").trim() || undefined;
const GA4 = clean(process.env.NEXT_PUBLIC_GA4_ID);
const GTM = clean(process.env.NEXT_PUBLIC_GTM_ID);
const CLARITY = clean(process.env.NEXT_PUBLIC_CLARITY_ID);

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const variant = (await headers()).get("x-cma-variant") ?? "control";

  return (
    <html lang="en" data-variant={variant} className={inter.variable}>
      <head>
        {/* Warm the TCP/TLS connections to the heaviest tag origins so they
            load faster (and block less) once they fire after hydration. */}
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="preconnect" href="https://connect.facebook.net" />
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://connect.facebook.net" />
        <link rel="dns-prefetch" href="https://www.clarity.ms" />
        {/* Tiny inline seed (no network): variant on dataLayer + low-end "lite" flag. */}
        <Script id="cma-init" strategy="beforeInteractive">
          {`window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};window.cmaVariant=${JSON.stringify(variant)};window.dataLayer.push({experiment_variant:window.cmaVariant});try{var n=navigator;if((n.hardwareConcurrency||8)<=4||(n.deviceMemory||8)<=4)document.documentElement.classList.add('lite');}catch(e){}`}
        </Script>
      </head>
      <body>
        <FXLayer />
        {children}
        {/* Third-party tags load right after hydration (every visitor) — Meta /
            Hyros expect PageView on load; gated loading would degrade ad signal. */}
        <DeferredTags ga4={GA4} gtm={GTM} clarity={CLARITY} />
      </body>
    </html>
  );
}
