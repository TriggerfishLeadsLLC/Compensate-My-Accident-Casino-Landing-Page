import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Inline the (small, atomic Tailwind) CSS into the HTML so there is no
  // render-blocking stylesheet request — big FCP/LCP win for first-time
  // mobile ad traffic on slow connections.
  experimental: {
    inlineCss: true,
  },
  poweredByHeader: false,
  compress: true,
};

export default nextConfig;
