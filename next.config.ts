import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const google = "https://accounts.google.com";

// No nonces: the page is static (cache components), so inline scripts stay allowed but nothing from other origins is.
// 'wasm-unsafe-eval' is for pdf.js image decoders; Google entries are only for the optional Calendar import.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""} ${google}/gsi/client`,
  `style-src 'self' 'unsafe-inline' ${google}/gsi/style`,
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' https://www.googleapis.com ${google}/gsi/`,
  `frame-src ${google}/gsi/`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Links carry secrets only after "#", which browsers never send; no-referrer also hides the path of /api/cal/<token>.
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  // A private tool for two people: keep the page, feeds and links out of search engines.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  cacheComponents: true,
  serverExternalPackages: ["pdfjs-dist"],
  // The pdf.js worker is loaded by a runtime path, so tell the tracer to ship it with the webhook.
  outputFileTracingIncludes: {
    "/api/whatsapp": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
